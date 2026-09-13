import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

let db: any;

export const generateUserDisplayIdHandler = async (request: any) => {
  if (!db) {
    db = getFirestore();
  }
  const authData = request.auth;
  if (!authData) {
    throw new HttpsError("unauthenticated", "Authentication required to allocate a Display ID.");
  }

  const { targetUserUid, requestedRole } = request.data;
  if (!targetUserUid || typeof targetUserUid !== "string") {
    throw new HttpsError("invalid-argument", "targetUserUid is required and must be a string.");
  }
  if (!requestedRole || typeof requestedRole !== "string") {
    throw new HttpsError("invalid-argument", "requestedRole is required and must be a string.");
  }

  const validRoles = ["customer", "admin", "kitchen", "delivery_partner", "accounts"];
  if (!validRoles.includes(requestedRole)) {
    throw new HttpsError("invalid-argument", "Invalid requestedRole.");
  }

  // Authorization checks
  if (requestedRole === "customer") {
    // Customers can only self-signup
    if (targetUserUid !== authData.uid) {
      throw new HttpsError("permission-denied", "Cannot allocate a customer ID for a different UID.");
    }
  } else {
    // Staff roles must be created by an Admin
    if (targetUserUid === authData.uid) {
      throw new HttpsError("permission-denied", "Admin cannot allocate a staff ID for themselves via this endpoint.");
    }
    const callerDoc = await db.collection("users").doc(authData.uid).get();
    if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Only an Admin can allocate staff IDs.");
    }
  }

  // Obtain trusted identity
  let targetUser;
  try {
    targetUser = await getAuth().getUser(targetUserUid);
  } catch (error) {
    logger.error(`Target user ${targetUserUid} not found in Firebase Auth`, error);
    throw new HttpsError("not-found", "Target user does not exist in Firebase Auth.");
  }

  const idempotencyRef = db.collection("idempotency").doc("displayIds").collection("allocations").doc(targetUserUid);
  const counterRef = db.collection("settings").doc("userCounters");
  const targetUserRef = db.collection("users").doc(targetUserUid);

  return await db.runTransaction(async (transaction: any) => {
    // 1. All Required Reads
    const [idempotencyDoc, counterDoc, targetUserDoc] = await Promise.all([
      transaction.get(idempotencyRef),
      transaction.get(counterRef),
      transaction.get(targetUserRef)
    ]);

    // 2. Existing Allocation Role Consistency
    if (idempotencyDoc.exists) {
      const existingData = idempotencyDoc.data();
      if (existingData && existingData.displayId) {
        if (existingData.role !== requestedRole) {
          throw new HttpsError("already-exists", "Target UID already has an allocation with a conflicting role.");
        }
        if (targetUserDoc.exists && targetUserDoc.data()?.displayId) {
          if (targetUserDoc.data()?.displayId !== existingData.displayId) {
             throw new HttpsError("already-exists", "Profile displayId conflicts with allocation displayId.");
          }
        }
        return { displayId: existingData.displayId };
      }
    }

    // 3. Existing users/{uid}.displayId Reconciliation
    let existingProfileDisplayId: string | null = null;
    if (targetUserDoc.exists) {
      const profileData = targetUserDoc.data();
      if (profileData && profileData.displayId) {
         existingProfileDisplayId = profileData.displayId;
      }
    }

    if (existingProfileDisplayId) {
      // Reconcile and safely map legacy displayId to valid canonical role
      let safelyMapped = false;
      let fieldName = "";
      
      if (requestedRole === "customer" && /^MP-[A-Z]\d{3}$/.test(existingProfileDisplayId)) {
         safelyMapped = true;
         const letter = existingProfileDisplayId.charAt(3);
         fieldName = `customer_${letter}`;
      } else {
         const prefixMap: Record<string, string> = {
            admin: "ADMIN",
            kitchen: "KTCH",
            delivery_partner: "DLVY",
            accounts: "ACCT",
         };
         const expectedPrefix = prefixMap[requestedRole];
         if (expectedPrefix && existingProfileDisplayId.startsWith(`${expectedPrefix}-`)) {
            safelyMapped = true;
            fieldName = requestedRole;
         }
      }

      if (!safelyMapped) {
         throw new HttpsError("invalid-argument", "Existing profile displayId cannot be safely mapped to the requested role.");
      }

      // Write allocation record using existing displayId WITHOUT incrementing the counter
      transaction.set(idempotencyRef, {
        targetUserUid,
        displayId: existingProfileDisplayId,
        counterField: fieldName,
        role: requestedRole,
        allocatedByUid: authData.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { displayId: existingProfileDisplayId };
    }

    // 4. Determine counter field
    let fieldName: string;
    let count = 0;
    let displayId = "";

    if (requestedRole === "customer") {
      const rawName = (typeof targetUser.displayName === "string") ? targetUser.displayName.trim() : "";
      const firstChar = rawName.charAt(0).toUpperCase();
      const validLetter = /^[A-Z]$/.test(firstChar) ? firstChar : "U";
      fieldName = `customer_${validLetter}`;
      
      if (counterDoc.exists) {
        const data = counterDoc.data()!;
        if (fieldName in data) {
           const storedCount = data[fieldName];
           if (typeof storedCount !== "number" || !Number.isInteger(storedCount) || storedCount < 0 || !Number.isFinite(storedCount)) {
             throw new HttpsError("internal", "Invalid counter value in database.");
           }
           count = storedCount;
        }
      }
      
      const newCount = count + 1;
      const paddedCount = newCount.toString().padStart(3, "0");
      displayId = `MP-${validLetter}${paddedCount}`;
      
      transaction.set(counterRef, { [fieldName]: newCount }, { merge: true });
    } else {
      const prefixMap: Record<string, string> = {
        admin: "ADMIN",
        kitchen: "KTCH",
        delivery_partner: "DLVY",
        accounts: "ACCT",
      };
      const prefix = prefixMap[requestedRole];
      fieldName = requestedRole;
      count = 1000;
      
      if (counterDoc.exists) {
        const data = counterDoc.data()!;
        if (fieldName in data) {
           const storedCount = data[fieldName];
           if (typeof storedCount !== "number" || !Number.isInteger(storedCount) || storedCount < 0 || !Number.isFinite(storedCount)) {
             throw new HttpsError("internal", "Invalid counter value in database.");
           }
           count = storedCount;
        }
      }
      
      const newCount = count + 1;
      displayId = `${prefix}-${newCount}`;
      
      transaction.set(counterRef, { [fieldName]: newCount }, { merge: true });
    }

    // 5. Write idempotency record
    transaction.set(idempotencyRef, {
      targetUserUid,
      displayId,
      counterField: fieldName,
      role: requestedRole,
      allocatedByUid: authData.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { displayId };
  });
};

export const generateUserDisplayId = onCall(generateUserDisplayIdHandler);
