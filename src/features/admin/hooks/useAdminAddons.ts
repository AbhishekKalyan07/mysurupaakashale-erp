import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuth } from "firebase/auth";
import toast from "react-hot-toast";
import { addonRepository } from "@/shared/services/firestore/addonRepository";
import { queryKeys } from "@/shared/lib/queryKeys";
import type { Addon, CreateAddonInput, UpdateAddonInput } from "@/shared/types";

export function useAddons() {
  return useQuery<Addon[]>({
    queryKey: queryKeys.addons.all,
    queryFn: () => addonRepository.listAll(),
    staleTime: 60 * 1000,
  });
}

export function useCreateAddon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateAddonInput) => {
      const user = getAuth().currentUser;
      return addonRepository.createAddon(
        input,
        user?.uid || "admin",
        "admin",
        user?.displayName || "Admin User",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addons.all });
      toast.success("Add-on created successfully.");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to create add-on.");
    },
  });
}

export function useUpdateAddon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateAddonInput;
    }) => {
      const user = getAuth().currentUser;
      return addonRepository.updateAddon(
        id,
        updates,
        user?.uid || "admin",
        "admin",
        user?.displayName || "Admin User",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addons.all });
      toast.success("Add-on updated successfully.");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update add-on.");
    },
  });
}

export function useToggleAddonStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const user = getAuth().currentUser;
      return addonRepository.toggleStatus(
        id,
        isActive,
        user?.uid || "admin",
        "admin",
        user?.displayName || "Admin User",
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addons.all });
      toast.success(
        variables.isActive
          ? "Add-on enabled successfully."
          : "Add-on disabled successfully.",
      );
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to toggle add-on status.");
    },
  });
}
