export type InventoryCategory = 'vegetables' | 'grains' | 'spices' | 'dairy' | 'packaging' | 'other';

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  quantity: number;
  unit: string; // e.g. 'kg', 'liters', 'pieces'
  lowStockThreshold: number;
  lastUpdated: any; // Timestamp
  updatedBy: string; // User ID
}
