import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PackageOpen, Plus, AlertTriangle, Edit2, Save, X } from 'lucide-react';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumInput as Input } from '@/shared/components/ui/PremiumInput';
import { TableSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { inventoryRepository } from '@/shared/services/firestore/inventoryRepository';
import type { InventoryItem } from '@/shared/types/inventory.types';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { serverTimestamp, Timestamp } from 'firebase/firestore';

export function InventoryPage() {
  const queryClient = useQueryClient();
  const { firebaseUser } = useAuth();
  
  const { data: inventoryItems, isLoading, error, refetch } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => inventoryRepository.list(),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: string, quantity: number }) => {
      await inventoryRepository.update(id, { 
        quantity, 
        lastUpdated: serverTimestamp() as unknown as Timestamp,
        updatedBy: firebaseUser?.uid 
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory'] }),
  });

  const addMutation = useMutation({
    mutationFn: async (newItem: Omit<InventoryItem, 'id' | 'lastUpdated' | 'updatedBy'>) => {
      await inventoryRepository.create({
        ...newItem,
        lastUpdated: serverTimestamp() as unknown as Timestamp,
        updatedBy: firebaseUser?.uid || 'unknown'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setShowAddModal(false);
    }
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(0);
  const [showAddModal, setShowAddModal] = useState(false);

  if (isLoading) return <div className="p-8"><TableSkeleton /></div>;
  if (error) return <ErrorState title="Error" description="Could not load inventory." onRetry={refetch} />;

  const items = inventoryItems || [];

  const handleEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setEditQuantity(item.quantity);
  };

  const handleSave = (id: string) => {
    updateMutation.mutate({ id, quantity: editQuantity });
    setEditingId(null);
  };

  const isLowStock = (item: InventoryItem) => item.quantity <= item.lowStockThreshold;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Inventory Management"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Inventory' }]}
        actions={
          firebaseUser && (
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Item
            </Button>
          )
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto md:overflow-visible">
          <table className="w-full text-left text-sm text-ink-600 block md:table">
            <thead className="hidden md:table-header-group bg-rice-50 text-xs uppercase text-ink-500">
              <tr>
                <th className="px-6 py-4 font-medium">Item Name</th>
                <th className="px-6 py-4 font-medium">Category</th>
                <th className="px-6 py-4 font-medium">Current Stock</th>
                <th className="px-6 py-4 font-medium">Threshold</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group divide-y divide-rice-100">
              {items.length === 0 ? (
                <tr className="block md:table-row">
                  <td colSpan={6} className="block md:table-cell px-6 py-12 text-center text-ink-500">
                    <PackageOpen className="mx-auto mb-3 h-8 w-8 text-ink-300" />
                    <p>No inventory items found.</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="block md:table-row bg-white md:bg-transparent hover:bg-rice-50/50 p-4 md:p-0 space-y-3 md:space-y-0">
                    <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4 font-medium text-ink-900">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Item Name</span>
                      {item.name}
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4 capitalize">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Category</span>
                      {item.category}
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Current Stock</span>
                      {editingId === item.id ? (
                        <div className="flex items-center gap-2 max-w-[150px]">
                          <Input 
                            type="number" 
                            value={editQuantity} 
                            onChange={(e) => setEditQuantity(Number(e.target.value))} 
                            className="h-8"
                          />
                          <span className="text-xs text-ink-400">{item.unit}</span>
                        </div>
                      ) : (
                        <span>{item.quantity} {item.unit}</span>
                      )}
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4 text-ink-500">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Threshold</span>
                      {item.lowStockThreshold} {item.unit}
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Status</span>
                      {isLowStock(item) ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-subtle px-2.5 py-1 text-xs font-medium text-danger">
                          <AlertTriangle size={14} /> Low Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-leaf-100 px-2.5 py-1 text-xs font-medium text-leaf-800">
                          In Stock
                        </span>
                      )}
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4 text-right">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Actions</span>
                      {editingId === item.id ? (
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                            <X size={16} />
                          </Button>
                          <Button size="sm" onClick={() => handleSave(item.id)} isLoading={updateMutation.isPending}>
                            <Save size={16} />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                          <Edit2 size={16} /> Update
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showAddModal && (
        <AddInventoryItemModal 
          onClose={() => setShowAddModal(false)}
          onSubmit={(data) => addMutation.mutate(data)}
          isSubmitting={addMutation.isPending}
        />
      )}
    </div>
  );
}

function AddInventoryItemModal({ onClose, onSubmit, isSubmitting }: { 
  onClose: () => void, 
  onSubmit: (data: any) => void,
  isSubmitting: boolean
}) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'groceries' as any,
    quantity: 0,
    unit: 'kg',
    lowStockThreshold: 0
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h2 className="text-xl font-bold font-serif text-ink-900 mb-4">Add Inventory Item</h2>
        
        <div className="space-y-4">
          <Input 
            label="Item Name" 
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1 font-sans">Category</label>
              <select 
                className="w-full border border-ink-400 rounded-lg px-3 py-2 text-sm font-sans"
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value as any})}
              >
                <option value="groceries">Groceries</option>
                <option value="vegetables">Vegetables</option>
                <option value="dairy">Dairy</option>
                <option value="meat">Meat</option>
                <option value="spices">Spices</option>
                <option value="packaging">Packaging</option>
              </select>
            </div>
            <Input 
              label="Unit (e.g. kg, L, pcs)" 
              value={formData.unit}
              onChange={(e) => setFormData({...formData, unit: e.target.value})}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input 
              type="number"
              label="Initial Stock" 
              value={formData.quantity || ''}
              onChange={(e) => setFormData({...formData, quantity: Number(e.target.value)})}
              required
            />
            <Input 
              type="number"
              label="Low Stock Alert" 
              value={formData.lowStockThreshold || ''}
              onChange={(e) => setFormData({...formData, lowStockThreshold: Number(e.target.value)})}
              required
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6 pt-4 border-t border-rice-200">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" isLoading={isSubmitting} disabled={!formData.name}>Add Item</Button>
        </div>
      </form>
    </div>
  );
}
