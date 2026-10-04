import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { settingsRepository } from "@/shared/services/firestore/settingsRepository";
import { queryKeys } from "@/shared/lib/queryKeys";
import {
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_PAYROLL_CONFIG,
  AUTHORITATIVE_OPERATIONAL_CUTOFFS,
  type BusinessSettings,
} from "@/shared/types";
import toast from "react-hot-toast";
import { getAuth } from "firebase/auth";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import { operationalSettingsService } from "@/shared/services/business/operationalSettingsService";

export function useBusinessSettings() {
  return useQuery({
    queryKey: queryKeys.settings.business,
    queryFn: async () => {
      const data = await settingsRepository.getBusinessSettings();
      if (!data) {
        // Return default structure if it doesn't exist yet
        return {
          id: "business",
          companyProfile: { ...DEFAULT_COMPANY_PROFILE },
          financials: {
            gstPercentage: 0,
            currency: "INR",
            invoicePrefix: "INV",
          },
          pricing: {
            mealPrices: { breakfast: 0, lunch: 0, dinner: 0 },
            deliveryCharges: { standard: 0 },
            securityDepositAmount: 1000,
          },
          operations: {
            orderCutoffTime: "20:00",
            kitchenTimings: { start: "06:00", end: "22:00" },
            deliveryWindows: {
              breakfast: { start: "07:30", end: "09:00" },
              lunch: { start: "12:30", end: "14:00" },
              dinner: { start: "19:30", end: "21:00" },
            },
            cancellationCutoffTimes: { ...AUTHORITATIVE_OPERATIONAL_CUTOFFS },
            businessHolidays: [],
          },
          payroll: { ...DEFAULT_PAYROLL_CONFIG },
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
      const user = getAuth().currentUser;
      const beforeSettings = operationalSettingsService.getOperationalSettingsSync();

      // Client-side settings update
      await settingsRepository.saveBusinessSettings(data);

      const hasOperationalChanges =
        Boolean(data.operations?.cancellationCutoffTimes) ||
        Boolean(data.operations?.deliveryWindows);

      if (hasOperationalChanges) {
        const afterSettings = await operationalSettingsService.getOperationalSettings(true);
        if (user) {
          await auditRepository.logAction(
            "operational_settings_updated",
            user.uid,
            "admin",
            user.displayName || "Admin",
            "business",
            "settings",
            {
              previousValue: beforeSettings,
              newValue: afterSettings,
              before: beforeSettings,
              after: afterSettings,
              timestamp: new Date().toISOString(),
            },
          );
        }
      }

      if (user) {
        await auditRepository.logAction(
          "settings_changed",
          user.uid,
          "admin",
          user.displayName || "Admin",
          "business",
          "settings",
          { updatedKeys: Object.keys(data) },
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.business,
      });
      toast.success("Business settings updated successfully");
    },
    onError: (err: unknown) => {
      toast.error(
        (err as Error).message ||
          "Failed to update settings. Please try again.",
      );
    },
  });
}
