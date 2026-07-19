import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { dailyMenuRepository } from '@/shared/services/firestore/dailyMenuRepository';
import type { DailyMenu } from '@/shared/types';
import { queryKeys } from '@/shared/lib/queryKeys';
import { Timestamp } from 'firebase/firestore';

export function useDailyMenus() {
  return useQuery({
    queryKey: queryKeys.kitchen.dailyMenuList,
    queryFn: () => dailyMenuRepository.getRecentMenus(),
  });
}

export function useDailyMenu(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.kitchen.dailyMenuDetail(id) : [],
    queryFn: () => id ? dailyMenuRepository.getById(id) : null,
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

  return useMutation({
    mutationFn: async (menuData: Omit<DailyMenu, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'publishedBy'>) => {
      const id = crypto.randomUUID();
      await dailyMenuRepository.create({
        ...menuData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        publishedAt: null,
        publishedBy: null,
      }, id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuList });
    },
  });
}

export function useUpdateDailyMenu() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DailyMenu> }) => {
      await dailyMenuRepository.update(id, {
        ...data,
        updatedAt: Timestamp.now(),
      });
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuList });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuDetail(id) });
    },
  });
}

export function useDeleteDailyMenu() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await dailyMenuRepository.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuList });
    },
  });
}

export function usePublishDailyMenu() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (menuId: string) => {
      // Phase 1: Client-side publish
      await dailyMenuRepository.update(menuId, {
        status: 'published',
        publishedAt: Timestamp.now(),
        publishedBy: 'admin',
        updatedAt: Timestamp.now(),
      });
      return menuId;
    },
    onSuccess: (menuId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuList });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuDetail(menuId) });
      // We don't have the exact date here easily, but since dailyMenuList is invalidated,
      // it covers most views. To be safe, we could invalidate all dailyMenu queries.
      queryClient.invalidateQueries({ queryKey: ['kitchen', 'dailyMenu'] });
    },
  });
}

export function useArchiveDailyMenu() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (menuId: string) => {
      // Phase 1: Client-side archive
      await dailyMenuRepository.update(menuId, {
        status: 'archived',
        updatedAt: Timestamp.now(),
      });
      return menuId;
    },
    onSuccess: (menuId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuList });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuDetail(menuId) });
      queryClient.invalidateQueries({ queryKey: ['kitchen', 'dailyMenu'] });
    },
  });
}
