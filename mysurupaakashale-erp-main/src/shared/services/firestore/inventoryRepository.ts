import { db } from '@/shared/lib/firebase';
import { BaseRepository, createConverter } from './BaseRepository';
import type { InventoryItem } from '@/shared/types/inventory.types';

class InventoryRepository extends BaseRepository<InventoryItem> {
  constructor() {
    super(db, 'inventory', createConverter<InventoryItem>());
  }
}

export const inventoryRepository = new InventoryRepository();
