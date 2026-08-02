import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { useCreateZone, useUpdateZone } from '../hooks/useDeliveryZones';
import { toast } from 'react-hot-toast';
import type { DeliveryZone } from '@/shared/types';

const zoneSchema = z.object({
  id: z.string().min(1, 'Zone ID is required').max(30).regex(/^[A-Z0-9_]+$/, 'Only uppercase letters, numbers, and underscores allowed (e.g. ZONE_01)'),
  name: z.string().min(2, 'Name is required'),
  city: z.string().min(2, 'City is required'),
  pincodes: z.string().min(6, 'At least one pincode is required'),
  kitchenId: z.string().min(1, 'Kitchen ID is required'),
  isActive: z.boolean(),
});

type ZoneForm = z.infer<typeof zoneSchema>;

interface Props {
  zone?: DeliveryZone | null;
  onClose: () => void;
}

export function ZoneModal({ zone, onClose }: Props) {
  const isEditing = !!zone;
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ZoneForm>({
    resolver: zodResolver(zoneSchema),
    defaultValues: {
      id: '',
      name: '',
      city: 'Mysuru',
      pincodes: '',
      kitchenId: 'KITCHEN_CENTRAL',
      isActive: true,
    }
  });

  useEffect(() => {
    if (zone) {
      reset({
        id: zone.id,
        name: zone.name,
        city: zone.city,
        pincodes: zone.pincodes.join(', '),
        kitchenId: zone.kitchenId,
        isActive: zone.isActive,
      });
    }
  }, [zone, reset]);

  const createMutation = useCreateZone();
  const updateMutation = useUpdateZone();

  const onSubmit = async (data: ZoneForm) => {
    try {
      const parsedPincodes = data.pincodes
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length === 6);

      if (parsedPincodes.length === 0) {
        toast.error('Please enter at least one valid 6-digit pincode');
        return;
      }

      if (isEditing) {
        await updateMutation.mutateAsync({
          id: data.id!,
          data: {
            name: data.name,
            city: data.city,
            pincodes: parsedPincodes,
            kitchenId: data.kitchenId,
            isActive: data.isActive,
          }
        });
      } else {
        await createMutation.mutateAsync({
          name: data.name,
          city: data.city,
          pincodes: parsedPincodes,
          boundary: null,
          kitchenId: data.kitchenId,
          isActive: data.isActive,
        });
      }
      onClose();
    } catch {
      // Error is handled by mutations
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
      <Card className="w-full max-w-lg bg-white overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-rice-200">
          <h2 className="text-xl font-semibold text-ink-900">{isEditing ? 'Edit Zone' : 'Create Delivery Zone'}</h2>
          <button onClick={onClose} className="p-2 text-ink-500 hover:text-ink-900 rounded-full hover:bg-rice-100 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="overflow-y-auto p-6">
          <form id="zone-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Zone ID</label>
              <input 
                {...register('id')} 
                disabled={isEditing}
                placeholder="e.g. ZONE_NORTH_01" 
                className={`w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 font-data ${isEditing ? 'bg-rice-50 cursor-not-allowed text-ink-500' : ''}`} 
              />
              {errors.id && <p className="text-xs text-danger">{errors.id.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Zone Name</label>
              <input {...register('name')} placeholder="e.g. North Mysuru" className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600" />
              {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-ink-700">City</label>
                <input {...register('city')} className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600" />
                {errors.city && <p className="text-xs text-danger">{errors.city.message}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-ink-700">Kitchen ID</label>
                <input {...register('kitchenId')} className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 font-data" />
                {errors.kitchenId && <p className="text-xs text-danger">{errors.kitchenId.message}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Pincodes (comma separated)</label>
              <textarea 
                {...register('pincodes')} 
                placeholder="570001, 570002" 
                rows={3}
                className="w-full p-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 font-data resize-none" 
              />
              <p className="text-xs text-ink-500">Orders with these pincodes will be routed to this zone.</p>
              {errors.pincodes && <p className="text-xs text-danger">{errors.pincodes.message}</p>}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" id="isActive" {...register('isActive')} className="w-4 h-4 text-leaf-600 rounded border-rice-300 focus:ring-leaf-600" />
              <label htmlFor="isActive" className="text-sm font-medium text-ink-700">Zone is Active</label>
            </div>

          </form>
        </div>

        <div className="p-4 border-t border-rice-200 bg-rice-25 flex justify-end gap-3 shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button type="submit" form="zone-form" isLoading={isPending}>
            {isEditing ? 'Save Changes' : 'Create Zone'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
