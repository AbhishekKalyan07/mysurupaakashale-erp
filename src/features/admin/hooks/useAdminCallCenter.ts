import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { adminCallCenterService } from "../services/adminCallCenterService";
import type { MealType } from "@/shared/types";

export function useAdminRemoveTodayMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subscriptionId,
      mealType,
      nowOverride,
    }: {
      subscriptionId: string;
      mealType: MealType;
      nowOverride?: Date;
    }) => {
      return adminCallCenterService.adminRemoveTodayMeal(
        subscriptionId,
        mealType,
        nowOverride,
      );
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["customer-today-orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["orderHistory"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(
        `Today's ${result.mealType} meal removed. Adjustment: ₹${result.cancellationAmount}`,
      );
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to remove today's meal.");
    },
  });
}

export function useAdminAddTodayMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subscriptionId,
      mealType,
      nowOverride,
    }: {
      subscriptionId: string;
      mealType: MealType;
      nowOverride?: Date;
    }) => {
      return adminCallCenterService.adminAddTodayMeal(
        subscriptionId,
        mealType,
        nowOverride,
      );
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["customer-today-orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["orderHistory"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      if (result.count === 0) {
        toast("No new meal order generated (already scheduled or Sunday).", {
          icon: "ℹ️",
        });
      } else {
        toast.success(
          `Today's ${result.mealType} meal added (₹${result.price}).`,
        );
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to add today's meal.");
    },
  });
}

export function useAdminChangeTodayMealOption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subscriptionId,
      mealType,
      newOptionId,
      nowOverride,
    }: {
      subscriptionId: string;
      mealType: MealType;
      newOptionId: string;
      nowOverride?: Date;
    }) => {
      return adminCallCenterService.adminChangeTodayMealOption(
        subscriptionId,
        mealType,
        newOptionId,
        nowOverride,
      );
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["customer-today-orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["orderHistory"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(
        `Today's ${result.mealType} option changed to ${result.newMealName} (₹0 price difference).`,
      );
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to change meal option.");
    },
  });
}

export function useAdminAddTodayAddon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subscriptionId,
      mealType,
      addonId,
      quantity = 1,
      nowOverride,
    }: {
      subscriptionId: string;
      mealType: MealType;
      addonId: string;
      quantity?: number;
      nowOverride?: Date;
    }) => {
      return adminCallCenterService.adminAddTodayAddon(
        subscriptionId,
        mealType,
        addonId,
        quantity,
        nowOverride,
      );
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["customer-today-orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["orderHistory"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(
        `Add-on ${result.addonName} added to today's ${result.mealType} (₹${result.totalAmount}).`,
      );
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to add add-on.");
    },
  });
}
