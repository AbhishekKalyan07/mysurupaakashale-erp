import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { dailyMenuRepository } from '@/shared/services/firestore/dailyMenuRepository';
import type { DailyMenu } from '@/shared/types';
import { Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { auditRepository } from '@/shared/services/firestore/auditRepository';
import { queryKeys } from '@/shared/lib/queryKeys';
import toast from 'react-hot-toast';

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
      
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('menu_created', user.uid, user.displayName || 'Admin', id, 'menu');
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuList });
      toast.success('Menu created successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create menu');
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
      
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('menu_edited', user.uid, user.displayName || 'Admin', id, 'menu', { updatedKeys: Object.keys(data) });
      }
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuList });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuDetail(id) });
      toast.success('Menu updated successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update menu');
    },
  });
}

export function useDeleteDailyMenu() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await dailyMenuRepository.delete(id);
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('menu_deleted', user.uid, user.displayName || 'Admin', id, 'menu');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuList });
      toast.success('Menu deleted successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete menu');
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
      
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('menu_published', user.uid, user.displayName || 'Admin', menuId, 'menu');
      }
      return menuId;
    },
    onSuccess: (menuId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuList });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuDetail(menuId) });
      // We don't have the exact date here easily, but since dailyMenuList is invalidated,
      // it covers most views. To be safe, we could invalidate all dailyMenu queries.
      queryClient.invalidateQueries({ queryKey: ['kitchen', 'dailyMenu'] });
      toast.success('Menu published successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to publish menu');
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
      
      const user = getAuth().currentUser;
      if (user) {
        await auditRepository.logAction('menu_archived', user.uid, user.displayName || 'Admin', menuId, 'menu');
      }
      return menuId;
    },
    onSuccess: (menuId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuList });
      queryClient.invalidateQueries({ queryKey: queryKeys.kitchen.dailyMenuDetail(menuId) });
      queryClient.invalidateQueries({ queryKey: ['kitchen', 'dailyMenu'] });
      toast.success('Menu archived successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to archive menu');
    },
  });
}
