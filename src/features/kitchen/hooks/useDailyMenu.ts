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

export function useHasOrdersForDate(date: string | null | undefined) {
  return useQuery({
    queryKey: ["orders", "hasOrdersForDate", date],
    queryFn: async () => {
      if (!date) return false;
      const { orderRepository } = await import(
        "@/shared/services/firestore/orderRepository"
      );
      return orderRepository.hasOrdersForDate(date);
    },
    enabled: !!date,
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
      const targetMenu = await dailyMenuRepository.getById(id);
      if (!targetMenu) {
        throw new Error("Menu not found");
      }

      // If menu is published, ensure no orders have already been generated for this date
      if (targetMenu.status === "published") {
        const { orderRepository } = await import(
          "@/shared/services/firestore/orderRepository"
        );
        const hasOrders = await orderRepository.hasOrdersForDate(targetMenu.date);
        if (hasOrders) {
          throw new Error(
            `Cannot modify menu: Orders have already been generated for ${targetMenu.date}. Existing order snapshots must be preserved.`,
          );
        }
      }

      await dailyMenuRepository.update(id, {
        ...data,
        updatedAt: Timestamp.now(),
      });

      const user = getAuth().currentUser;
      if (user) {
        const action =
          targetMenu.status === "published" ? "menu_revised" : "menu_edited";
        await auditRepository.logAction(
          action,
          user.uid,
          role || "kitchen",
          user.displayName || (role === "admin" ? "Admin" : "Kitchen Staff"),
          id,
          "menu",
          {
            updatedKeys: Object.keys(data),
            date: targetMenu.date,
            status: targetMenu.status,
          },
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
      queryClient.invalidateQueries({ queryKey: ["kitchen", "dailyMenu"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "hasOrdersForDate"] });
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
      const targetMenu = await dailyMenuRepository.getById(menuId);
      if (!targetMenu) {
        throw new Error("Menu not found");
      }

      // Archive any currently published menu for the same date to maintain single published menu invariant
      const existingPublished = await dailyMenuRepository.getPublishedByDate(targetMenu.date);
      if (existingPublished && existingPublished.id !== menuId) {
        await dailyMenuRepository.update(existingPublished.id, {
          status: "archived",
          updatedAt: Timestamp.now(),
        });
      }

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
          { date: targetMenu.date },
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
      queryClient.invalidateQueries({ queryKey: ["orders", "hasOrdersForDate"] });
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
