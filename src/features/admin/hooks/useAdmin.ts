import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, firebaseApp } from '@/shared/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, updateProfile } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { serverTimestamp, doc, setDoc, updateDoc } from 'firebase/firestore';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import toast from 'react-hot-toast';
import type { UserProfile } from '@/shared/types';
import type { Role } from '@/shared/constants/roles';
import { queryKeys } from '@/shared/lib/queryKeys';
import { notifyStaffAccountCreated } from '@/shared/services/firestore/notificationService';

export function useStaffUsers() {
  return useQuery({
    queryKey: [...queryKeys.users.all, 'staff'],
    queryFn: async () => {
      const q = query(
        collection(db, 'users'),
        where('role', 'in', ['admin', 'kitchen', 'delivery_partner', 'accounts'])
      );
      const snap = await getDocs(q);
      const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as UserProfile);
      
      // Sort in memory to avoid requiring a composite index on the users collection
      return users.sort((a, b) => {
        const dateA = a.createdAt?.toMillis?.() || 0;
        const dateB = b.createdAt?.toMillis?.() || 0;
        return dateB - dateA; // Descending
      });
    },
  });
}

export function useCreateStaffUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      fullName: string;
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
        const credential = await createUserWithEmailAndPassword(tempAuth, data.email, data.password);
        await updateProfile(credential.user, { displayName: data.fullName });
        
        const profileData: any = {
          role: data.role,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          photoUrl: null,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (data.role === 'kitchen') {
          profileData.kitchenId = data.kitchenId;
        } else if (data.role === 'delivery_partner') {
          profileData.zoneIds = data.zoneIds || [];
          profileData.vehicleType = data.vehicleType || 'bike';
          profileData.isAvailable = true;
          profileData.currentLocation = null;
        }

        await setDoc(doc(db, 'users', credential.user.uid), profileData);
        
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
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success('Staff user created successfully');
      // Notify the new staff member — fire-and-forget.
      notifyStaffAccountCreated(result.uid, result.role, result.fullName)
        .catch((err) => console.error('[useCreateStaffUser] staff notification failed:', err));
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create staff user');
    },
  });
}

export function useToggleStaffStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ uid, isActive }: { uid: string; isActive: boolean }) => {
      await updateDoc(doc(db, 'users', uid), { isActive, updatedAt: serverTimestamp() });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success('Staff status updated');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update staff status');
    },
  });
}

export function useUpdateStaffUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ uid, data }: { uid: string; data: Partial<UserProfile> }) => {
      await updateDoc(doc(db, 'users', uid), {
        ...data,
        updatedAt: serverTimestamp(),
      });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success('Staff user updated successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update staff user');
    },
  });
}
