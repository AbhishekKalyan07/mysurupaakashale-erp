import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuth } from "firebase/auth";
import toast from "react-hot-toast";
import { mealPlanRepository } from "@/shared/services/firestore/mealPlanRepository";
import { queryKeys } from "@/shared/lib/queryKeys";
import type {
  MealPlan,
  MealType,
  CreateMealPlanInput,
  UpdateMealPlanInput,
  CreateMealOptionInput,
  UpdateMealOptionInput,
} from "@/shared/types";

export function useAdminMealPlans(includeInactive: boolean = true) {
  return useQuery<MealPlan[]>({
    queryKey: [...queryKeys.mealPlans.all, "admin", includeInactive],
    queryFn: () => mealPlanRepository.listAll(includeInactive),
    staleTime: 60 * 1000,
  });
}

export function useCreateMealPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateMealPlanInput) => {
      const user = getAuth().currentUser;
      return mealPlanRepository.createPlan(
        input,
        user?.uid || "admin",
        "admin",
        user?.displayName || "Admin User",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all });
      toast.success("Meal plan created successfully.");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to create meal plan.");
    },
  });
}

export function useUpdateMealPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateMealPlanInput;
    }) => {
      const user = getAuth().currentUser;
      return mealPlanRepository.updatePlan(
        id,
        updates,
        user?.uid || "admin",
        "admin",
        user?.displayName || "Admin User",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all });
      toast.success("Meal plan updated successfully.");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update meal plan.");
    },
  });
}

export function useToggleMealPlanStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      isActive,
    }: {
      id: string;
      isActive: boolean;
    }) => {
      const user = getAuth().currentUser;
      return mealPlanRepository.togglePlanStatus(
        id,
        isActive,
        user?.uid || "admin",
        "admin",
        user?.displayName || "Admin User",
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all });
      toast.success(
        variables.isActive
          ? "Meal plan activated."
          : "Meal plan deactivated.",
      );
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update plan status.");
    },
  });
}

export function useAddMealOption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      planId,
      mealType,
      input,
    }: {
      planId: string;
      mealType: MealType;
      input: CreateMealOptionInput;
    }) => {
      const user = getAuth().currentUser;
      return mealPlanRepository.addMealOption(
        planId,
        mealType,
        input,
        user?.uid || "admin",
        "admin",
        user?.displayName || "Admin User",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all });
      toast.success("Meal option added successfully.");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to add meal option.");
    },
  });
}

export function useUpdateMealOption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      planId,
      mealType,
      optionId,
      updates,
    }: {
      planId: string;
      mealType: MealType;
      optionId: string;
      updates: UpdateMealOptionInput;
    }) => {
      const user = getAuth().currentUser;
      return mealPlanRepository.updateMealOption(
        planId,
        mealType,
        optionId,
        updates,
        user?.uid || "admin",
        "admin",
        user?.displayName || "Admin User",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all });
      toast.success("Meal option updated successfully.");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update meal option.");
    },
  });
}

export function useToggleMealOptionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      planId,
      mealType,
      optionId,
      isActive,
    }: {
      planId: string;
      mealType: MealType;
      optionId: string;
      isActive: boolean;
    }) => {
      const user = getAuth().currentUser;
      return mealPlanRepository.toggleMealOptionStatus(
        planId,
        mealType,
        optionId,
        isActive,
        user?.uid || "admin",
        "admin",
        user?.displayName || "Admin User",
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all });
      toast.success(
        variables.isActive
          ? "Option enabled."
          : "Option disabled.",
      );
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update option status.");
    },
  });
}

export function useToggleMealOptionSelectable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      planId,
      mealType,
      optionId,
      isCustomerSelectable,
    }: {
      planId: string;
      mealType: MealType;
      optionId: string;
      isCustomerSelectable: boolean;
    }) => {
      const user = getAuth().currentUser;
      return mealPlanRepository.toggleMealOptionSelectable(
        planId,
        mealType,
        optionId,
        isCustomerSelectable,
        user?.uid || "admin",
        "admin",
        user?.displayName || "Admin User",
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all });
      toast.success(
        variables.isCustomerSelectable
          ? "Option made customer-selectable."
          : "Option restricted from customer selection.",
      );
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update option selectable status.");
    },
  });
}
