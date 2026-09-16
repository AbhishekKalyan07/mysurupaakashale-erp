import { Timestamp } from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import { BaseRepository, createConverter } from "./BaseRepository";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

export type DeliveryDispatchStatus =
  "open" | "dispatch_started" | "dispatch_completed" | "closed";
export type DriverSessionStatus =
  "not_started" | "picked_up" | "in_progress" | "completed";

export interface DriverMealSession {
  status: DriverSessionStatus;
  pickedUpAt?: Timestamp | null;
  pickedUpBy?: string | null;
  startedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  totalAssigned: number;
  delivered: number;
  failed: number;
  returned: number;
}

export interface DriverSession {
  id: string; // The partnerId
  date: string;
  status: DriverSessionStatus;

  pickup: {
    pickedUpAt: Timestamp | null;
    pickedUpBy: string | null;
    totalOrders: number;
    kitchenLockedAt?: Timestamp | null; // Future handoff reporting
  };

  deliverySession: {
    startedAt: Timestamp | null;
    completedAt: Timestamp | null;
    totalAssigned: number;
    delivered: number;
    failed: number;
    returned: number;
    distanceKm?: number | null; // Future GPS tracking
    durationMinutes?: number | null; // Future GPS tracking
  };

  /** Shift-isolated session tracking (e.g. breakfast, lunch, dinner). */
  mealSessions?: Partial<Record<string, DriverMealSession>>;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DailyDeliveryState {
  id: string; // date 'YYYY-MM-DD'
  status: DeliveryDispatchStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

class DailyDeliveryRepository extends BaseRepository<DailyDeliveryState> {
  constructor() {
    super(db, "dailyDeliveryStates", createConverter<DailyDeliveryState>());
  }

  // Gets or creates virtual default state
  async getState(date: string): Promise<DailyDeliveryState> {
    const docRef = doc(this.collectionRef, date);
    const snap = await getDoc(docRef);
    if (snap.exists()) return snap.data();

    return {
      id: date,
      status: "open",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
  }

  async getDriverSession(
    date: string,
    driverId: string,
  ): Promise<DriverSession> {
    const docRef = doc(
      db,
      "dailyDeliveryStates",
      date,
      "driverSessions",
      driverId,
    );
    const snap = await getDoc(docRef);
    if (snap.exists()) return snap.data() as DriverSession;

    return {
      id: driverId,
      date,
      status: "not_started",
      pickup: {
        pickedUpAt: null,
        pickedUpBy: null,
        totalOrders: 0,
        kitchenLockedAt: null,
      },
      deliverySession: {
        startedAt: null,
        completedAt: null,
        totalAssigned: 0,
        delivered: 0,
        failed: 0,
        returned: 0,
        distanceKm: null,
        durationMinutes: null,
      },
      mealSessions: {},
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
  }

  subscribeDriverSession(
    date: string,
    driverId: string,
    onNext: (session: DriverSession) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe {
    const docRef = doc(
      db,
      "dailyDeliveryStates",
      date,
      "driverSessions",
      driverId,
    );
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          onNext(snap.data() as DriverSession);
        } else {
          onNext({
            id: driverId,
            date,
            status: "not_started",
            pickup: {
              pickedUpAt: null,
              pickedUpBy: null,
              totalOrders: 0,
              kitchenLockedAt: null,
            },
            deliverySession: {
              startedAt: null,
              completedAt: null,
              totalAssigned: 0,
              delivered: 0,
              failed: 0,
              returned: 0,
              distanceKm: null,
              durationMinutes: null,
            },
            mealSessions: {},
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
        }
      },
      onError,
    );
  }

  async updateDriverSession(
    date: string,
    driverId: string,
    data: Partial<DriverSession> | Record<string, any>,
  ): Promise<void> {
    const docRef = doc(
      db,
      "dailyDeliveryStates",
      date,
      "driverSessions",
      driverId,
    );

    // Expand dot-notation keys (e.g. "mealSessions.lunch") into nested objects for setDoc merge
    const sanitizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.includes(".")) {
        const parts = key.split(".");
        let current = sanitizedData;
        for (let i = 0; i < parts.length - 1; i++) {
          current[parts[i]] = current[parts[i]] || {};
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
      } else {
        sanitizedData[key] = value;
      }
    }

    await setDoc(
      docRef,
      {
        ...sanitizedData,
        id: driverId,
        date,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );

    // Ensure parent document exists
    const parentRef = doc(db, "dailyDeliveryStates", date);
    const parentSnap = await getDoc(parentRef);
    if (!parentSnap?.exists()) {
      await setDoc(
        parentRef,
        {
          id: date,
          status: "open",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
    }
  }
}

export const dailyDeliveryRepository = new DailyDeliveryRepository();
