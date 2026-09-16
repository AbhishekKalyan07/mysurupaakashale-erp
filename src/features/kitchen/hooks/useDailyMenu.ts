import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { dailyMenuRepository } from "@/shared/services/firestore/dailyMenuRepository";
import type { DailyMenu } from "@/shared/types";
import { Timestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import { queryKeys } from "@/shared/lib/queryKeys";
import toast from "react-hot-toast";

export function useDailyMenus() {
  return useQuery({
    queryKey: queryKeys.kitchen.dailyMenuList,
    queryFn: () => dailyMenuRepository.getRecentMenus(),
  });
}

export function useDailyMenu(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.kitchen.dailyMenuDetail(id) : [],
    queryFn: () => (id ? dailyMenuRepository.getById(id) : null),
    enabled: !!id,
  });
}

export function usePublishedDailyMenuByDate(date: string) {
  return useQuery({
    queryKey: queryKeys.kitchen.dailyMenu(date),
    queryFn: () => dailyMenuRepository.getPublishedByDate(date),
  });
}

export function useCreateDailyMenu() {
  const queryClient = useQueryClient();
  const { role } = useAuth();

  return useMutation({
    mutationFn: async (
      menuData: Omit<
        DailyMenu,
        "id" | "createdAt" | "updatedAt" | "publishedAt" | "publishedBy"
      >,
    ) => {
      const id = crypto.randomUUID();
      await dailyMenuRepository.create(
        {
          ...menuData,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          publishedAt: null,
          publishedBy: null,
        },
        id,
      );

      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction(
          "menu_created",
          user.uid,
          role || "kitchen",
          user.displayName || (role === "admin" ? "Admin" : "Kitchen Staff"),
          id,
          "menu",
        );
      }
      return id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.kitchen.dailyMenuList,
      });
      toast.success("Menu created successfully");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to create menu");
    },
  });
}

export function useUpdateDailyMenu() {
  const queryClient = useQueryClient();
  const { role } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<DailyMenu>;
    }) => {
      await dailyMenuRepository.update(id, {
        ...data,
        updatedAt: Timestamp.now(),
      });

      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction(
          "menu_edited",
          user.uid,
          role || "kitchen",
          user.displayName || (role === "admin" ? "Admin" : "Kitchen Staff"),
          id,
          "menu",
          { updatedKeys: Object.keys(data) },
        );
      }
      return id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.kitchen.dailyMenuList,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.kitchen.dailyMenuDetail(id),
      });
      toast.success("Menu updated successfully");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to update menu");
    },
  });
}

export function useDeleteDailyMenu() {
  const queryClient = useQueryClient();
  const { role } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      await dailyMenuRepository.delete(id);
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction(
          "menu_deleted",
          user.uid,
          role || "kitchen",
          user.displayName || (role === "admin" ? "Admin" : "Kitchen Staff"),
          id,
          "menu",
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.kitchen.dailyMenuList,
      });
      toast.success("Menu deleted successfully");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to delete menu");
    },
  });
}

export function usePublishDailyMenu() {
  const queryClient = useQueryClient();
  const { role } = useAuth();

  return useMutation({
    mutationFn: async (menuId: string) => {
      const user = getAuth().currentUser;
      // Client-side publish
      await dailyMenuRepository.update(menuId, {
        status: "published",
        publishedAt: Timestamp.now(),
        publishedBy: user?.uid || (role === "admin" ? "admin" : "kitchen"),
        updatedAt: Timestamp.now(),
      });

      if (user) {
        await auditRepository.logAction(
          "menu_published",
          user.uid,
          role || "kitchen",
          user.displayName || (role === "admin" ? "Admin" : "Kitchen Staff"),
          menuId,
          "menu",
        );
      }
      return menuId;
    },
    onSuccess: async (menuId) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.kitchen.dailyMenuList,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.kitchen.dailyMenuDetail(menuId),
      });
      queryClient.invalidateQueries({ queryKey: ["kitchen", "dailyMenu"] });
      toast.success("Menu published successfully");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to publish menu");
    },
  });
}

export function useArchiveDailyMenu() {
  const queryClient = useQueryClient();
  const { role } = useAuth();

  return useMutation({
    mutationFn: async (menuId: string) => {
      // Client-side archive
      await dailyMenuRepository.update(menuId, {
        status: "archived",
        updatedAt: Timestamp.now(),
      });

      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction(
          "menu_archived",
          user.uid,
          role || "kitchen",
          user.displayName || (role === "admin" ? "Admin" : "Kitchen Staff"),
          menuId,
          "menu",
        );
      }
      return menuId;
    },
    onSuccess: async (menuId) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.kitchen.dailyMenuList,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.kitchen.dailyMenuDetail(menuId),
      });
      queryClient.invalidateQueries({ queryKey: ["kitchen", "dailyMenu"] });
      toast.success("Menu archived successfully");
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to archive menu");
    },
  });
}
