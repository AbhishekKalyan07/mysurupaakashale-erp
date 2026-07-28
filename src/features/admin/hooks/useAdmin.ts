import { Timestamp } from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { firebaseApp, db } from '@/shared/lib/firebase';
import { where, serverTimestamp, doc, getDoc, setDoc, deleteDoc, type QueryDocumentSnapshot } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, updateProfile } from 'firebase/auth';
import { parseFirestoreDate } from '@/shared/utils/dateUtils';
import { initializeApp, deleteApp } from 'firebase/app';
import { userRepository } from '@/shared/services/firestore/userRepository';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import toast from 'react-hot-toast';
import type { UserProfile, CustomerProfile } from '@/shared/types';
import type { Role } from '@/shared/constants/roles';
import { queryKeys } from '@/shared/lib/queryKeys';
import { notifyStaffAccountCreated } from '@/shared/services/firestore/notificationService';

export function useStaffUsers() {
  return useQuery({
    queryKey: [...queryKeys.users.all, 'staff'],
    queryFn: async () => {
      const users = await userRepository.list(
        where('role', 'in', ['admin', 'kitchen', 'delivery_partner', 'accounts'])
      );
      
      // Sort in memory to avoid requiring a composite index on the users collection
      return users.sort((a, b) => {
        const dateA = parseFirestoreDate(a.createdAt)?.getTime() || 0;
        const dateB = parseFirestoreDate(b.createdAt)?.getTime() || 0;
        return dateB - dateA; // Descending
      });
    },
  });
}

export function useAdminCustomers(lastDocSnap?: QueryDocumentSnapshot<UserProfile>) {
  return useQuery({
    queryKey: [...queryKeys.users.all, 'customers-paginated', lastDocSnap?.id ?? 'page-0'],
    queryFn: async (): Promise<{ rows: CustomerProfile[]; lastDoc: QueryDocumentSnapshot<UserProfile> | null }> => {
      const { customers, lastDoc } = await userRepository.getCustomersPaginated(20, lastDocSnap);
      return { rows: customers as CustomerProfile[], lastDoc };
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useCreateStaffUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      fullName: string;
      staffId: string;
      phone: string;
      role: Role;
      kitchenId?: string;
      zoneIds?: string[];
      vehicleType?: string;
    }) => {
      // Phase 3: Client-side staff creation using secondary app to prevent admin logout
      const tempApp = initializeApp(firebaseApp.options, 'temp-admin-creation');
      const tempAuth = getAuth(tempApp);
      
      try {
        const phoneDocRef = doc(db, 'userPhones', data.phone);
        const existingPhone = await getDoc(phoneDocRef);
        if (existingPhone.exists()) {
          throw new Error('Phone number is already registered.');
        }

        const credential = await createUserWithEmailAndPassword(tempAuth, data.email, data.password);
        await updateProfile(credential.user, { displayName: data.fullName });
        
        const profileData: any = {
          role: data.role,
          fullName: data.fullName,
          staffId: data.staffId,
          email: data.email,
          phone: data.phone,
          photoUrl: null,
          isActive: true,
          createdAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
          updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
        };

        if (data.role === 'kitchen') {
          profileData.kitchenId = data.kitchenId;
        } else if (data.role === 'delivery_partner') {
          profileData.zoneIds = data.zoneIds || [];
          profileData.vehicleType = data.vehicleType || 'bike';
          profileData.isAvailable = true;
          profileData.currentLocation = null;
        }

        await userRepository.create(profileData as UserProfile, credential.user.uid);
        
        await setDoc(phoneDocRef, { uid: credential.user.uid });
        
        const currentUser = getAuth().currentUser;
        if (currentUser) {
          await auditRepository.logAction(
            'staff_created',
            currentUser.uid,
            currentUser.displayName || 'Admin',
            credential.user.uid,
            'user',
            { role: data.role, email: data.email }
          );
        }
        
        return { uid: credential.user.uid, fullName: data.fullName, role: data.role };
      } finally {
        await tempAuth.signOut();
        await deleteApp(tempApp);
      }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success('Staff user created successfully');
      // Notify the new staff member — fire-and-forget.
      notifyStaffAccountCreated(result.uid, result.role, result.fullName)
        .catch((err) => console.error('[useCreateStaffUser] staff notification failed:', err));
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to create staff user');
    },
  });
}

export function useToggleStaffStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ uid, isActive }: { uid: string; isActive: boolean }) => {
      await userRepository.update(uid, { isActive, updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp } as Partial<UserProfile>);
      const currentUser = getAuth().currentUser;
      if (currentUser) {
        await auditRepository.logAction(
          isActive ? 'staff_activated' : 'staff_deactivated',
          currentUser.uid,
          currentUser.displayName || 'Admin',
          uid,
          'user'
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success('Staff status updated');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update staff status');
    },
  });
}

export function useUpdateStaffUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ uid, data }: { uid: string; data: Partial<UserProfile> }) => {
      if (data.phone) {
        const currentUserProfile = await userRepository.getById(uid);
        if (currentUserProfile && currentUserProfile.phone !== data.phone) {
          const newPhoneDocRef = doc(db, 'userPhones', data.phone);
          const existingPhone = await getDoc(newPhoneDocRef);
          if (existingPhone.exists() && existingPhone.data()?.uid !== uid) {
            throw new Error('Phone number is already registered to another user.');
          }
          
          if (currentUserProfile.phone) {
            await deleteDoc(doc(db, 'userPhones', currentUserProfile.phone));
          }
          await setDoc(newPhoneDocRef, { uid });
        }
      }

      await userRepository.update(uid, {
        ...data,
        updatedAt: serverTimestamp() as unknown as Timestamp as unknown as Timestamp,
      } as Partial<UserProfile>);
      const currentUser = getAuth().currentUser;
      if (currentUser) {
        await auditRepository.logAction(
          'staff_updated',
          currentUser.uid,
          currentUser.displayName || 'Admin',
          uid,
          'user',
          { updatedKeys: Object.keys(data) }
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success('Staff user updated successfully');
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || 'Failed to update staff user');
    },
  });
}
