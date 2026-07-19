import { db } from '@/shared/lib/firebase';
import type { DailyMenu } from '@/shared/types';
import { BaseRepository, createConverter } from './BaseRepository';
import { where, orderBy, limit } from 'firebase/firestore';

class DailyMenuRepository extends BaseRepository<DailyMenu> {
  constructor() {
    super(db, 'dailyMenus', createConverter<DailyMenu>());
  }

  /**
   * Get the published menu for a given date.
   */
  async getPublishedByDate(date: string): Promise<DailyMenu | null> {
    const menus = await this.list(
      where('date', '==', date),
      where('status', '==', 'published'),
      limit(1)
    );
    return menus[0] || null;
  }

  /**
   * Get all menus for a specific date (drafts, published, archived)
   */
  async getAllByDate(date: string): Promise<DailyMenu[]> {
    return this.list(
      where('date', '==', date),
      orderBy('createdAt', 'desc')
    );
  }
  
  /**
   * Get all menus (paginated/limited if needed, but for now just ordered by date)
   * Useful for the Kitchen/Admin menu list view
   */
  async getRecentMenus(): Promise<DailyMenu[]> {
    return this.list(
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  }

  subscribeToDate(
    date: string,
    onNext: (menus: DailyMenu[]) => void,
    onError?: (error: Error) => void
  ) {
    return this.subscribeToList(
      onNext,
      onError,
      where('date', '==', date),
      orderBy('createdAt', 'desc')
    );
  }

  subscribeToRecent(
    onNext: (menus: DailyMenu[]) => void,
    onError?: (error: Error) => void
  ) {
    return this.subscribeToList(
      onNext,
      onError,
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  }
}

export const dailyMenuRepository = new DailyMenuRepository();
