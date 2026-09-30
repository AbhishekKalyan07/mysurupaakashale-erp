import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pricingRepository } from "@/shared/services/firestore/pricingRepository";
import { pricingService } from "@/shared/services/business/pricingService";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { queryKeys } from "@/shared/lib/queryKeys";
import type { PricingConfiguration } from "@/shared/types";
import { toast } from "react-hot-toast";

export function usePricingConfigurations() {
  return useQuery({
    queryKey: queryKeys.pricing.all,
    queryFn: () => pricingRepository.listAll(),
  });
}

export function useEffectivePricing(
  targetDate?: string,
  scope: string = "general",
) {
  return useQuery({
    queryKey: queryKeys.pricing.effective(targetDate || "today", scope),
    queryFn: () => pricingService.getEffectivePricing(targetDate, scope),
  });
}

export function useCreatePricingConfig() {
  const queryClient = useQueryClient();
  const { profile, firebaseUser } = useAuth();

  return useMutation({
    mutationFn: async (
      data: Omit<PricingConfiguration, "id" | "createdAt" | "updatedAt">,
    ) => {
      const id = await pricingRepository.createPricingConfiguration(data);

      if (profile || firebaseUser) {
        await auditRepository.logAction(
          "pricing_created",
          profile?.id || firebaseUser?.uid || "admin",
          profile?.role || "admin",
          (profile as any)?.fullName || (profile as any)?.name || "Admin",
          id,
          "pricing_configuration",
          {
            scope: data.scope,
            effectiveFrom: data.effectiveFrom,
            effectiveTo: data.effectiveTo,
            newValue: data.pricing,
          },
        ).catch(() => {});
      }

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pricing.all });
      toast.success("Pricing version created successfully.");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to create pricing configuration.");
    },
  });
}

export function useUpdatePricingConfig() {
  const queryClient = useQueryClient();
  const { profile, firebaseUser } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
      previousValue,
    }: {
      id: string;
      updates: Partial<PricingConfiguration>;
      previousValue?: any;
    }) => {
      await pricingRepository.updatePricingConfiguration(id, updates);

      if (profile || firebaseUser) {
        await auditRepository.logAction(
          "pricing_updated",
          profile?.id || firebaseUser?.uid || "admin",
          profile?.role || "admin",
          (profile as any)?.fullName || (profile as any)?.name || "Admin",
          id,
          "pricing_configuration",
          {
            previousValue,
            newValue: updates,
            effectiveFrom: updates.effectiveFrom,
          },
        ).catch(() => {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pricing.all });
      toast.success("Pricing version updated successfully.");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to update pricing configuration.");
    },
  });
}

export function useDeletePricingConfig() {
  const queryClient = useQueryClient();
  const { profile, firebaseUser } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      config,
    }: {
      id: string;
      config?: PricingConfiguration;
    }) => {
      await pricingRepository.deletePricingConfiguration(id);

      if (profile || firebaseUser) {
        await auditRepository.logAction(
          "pricing_disabled",
          profile?.id || firebaseUser?.uid || "admin",
          profile?.role || "admin",
          (profile as any)?.fullName || (profile as any)?.name || "Admin",
          id,
          "pricing_configuration",
          {
            previousValue: config?.pricing,
            effectiveFrom: config?.effectiveFrom,
          },
        ).catch(() => {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pricing.all });
      toast.success("Pricing version deleted successfully.");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to delete pricing configuration.");
    },
  });
}
