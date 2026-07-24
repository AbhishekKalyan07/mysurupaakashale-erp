import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { settingsRepository } from '@/shared/services/firestore/settingsRepository';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { BusinessSettings } from '@/shared/types';
import toast from 'react-hot-toast';
import { getAuth } from 'firebase/auth';
import { auditRepository } from '@/shared/services/firestore/auditRepository';

export function useBusinessSettings() {
  return useQuery({
    queryKey: queryKeys.settings.business,
    queryFn: async () => {
      const data = await settingsRepository.getBusinessSettings();
      if (!data) {
        // Return default structure if it doesn't exist yet
        return {
          id: 'business',
          companyProfile: { name: '', tagline: '', supportEmail: '', supportPhone: '', address: '' },
          financials: { gstPercentage: 0, currency: 'INR', invoicePrefix: 'INV' },
          pricing: { mealPrices: { breakfast: 0, lunch: 0, dinner: 0 }, deliveryCharges: { standard: 0 }, securityDepositAmount: 1000 },
          operations: {
            orderCutoffTime: '20:00',
            kitchenTimings: { start: '06:00', end: '22:00' },
            deliveryWindows: {
              breakfast: { start: '07:30', end: '09:00' },
              lunch: { start: '12:30', end: '14:00' },
              dinner: { start: '19:30', end: '21:00' }
            },
            businessHolidays: []
          },
        } as unknown as BusinessSettings;
      }
      return data;
    },
  });
}

export function useUpdateBusinessSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: Partial<BusinessSettings>) => {
      // Phase 1: Client-side settings update
      await settingsRepository.update('business', data);
      
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction(
          'settings_changed',
          user.uid,
          user.displayName || 'Admin',
          'business',
          'settings',
          { updatedKeys: Object.keys(data) }
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.business });
      toast.success('Business settings updated successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update settings. Please try again.');
    },
  });
}

