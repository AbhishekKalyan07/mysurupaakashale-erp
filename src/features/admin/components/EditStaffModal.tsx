import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { useUpdateStaffUser } from '../hooks/useAdmin';
import { useDeliveryZones } from '../hooks/useDeliveryZones';
import { toast } from 'react-hot-toast';
import type { UserProfile } from '@/shared/types';

const staffSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  phone: z.string().min(10, 'Phone is required (e.g. +919876543210)'),
  kitchenId: z.string().optional(),
  vehicleType: z.enum(['bike', 'bicycle', 'on_foot', 'other']).optional(),
  zoneIds: z.array(z.string()).optional(),
});

type StaffForm = z.infer<typeof staffSchema>;

interface Props {
  user: UserProfile;
  onClose: () => void;
}

export function EditStaffModal({ user, onClose }: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<StaffForm>({
    resolver: zodResolver(staffSchema),
  });

  const { data: zones = [], isLoading: isLoadingZones } = useDeliveryZones();

  useEffect(() => {
    reset({
      fullName: user.fullName,
      phone: user.phone,
      kitchenId: user.role === 'kitchen' ? user.kitchenId : '',
      vehicleType: user.role === 'delivery_partner' ? user.vehicleType : 'bike',
      zoneIds: user.role === 'delivery_partner' ? user.zoneIds || [] : [],
    });
  }, [user, reset]);

  const updateMutation = useUpdateStaffUser();

  const onSubmit = async (data: StaffForm) => {
    try {
      const payload: any = {
        fullName: data.fullName,
        phone: data.phone,
      };
      
      if (user.role === 'kitchen' && data.kitchenId) {
        payload.kitchenId = data.kitchenId;
      }
      
      if (user.role === 'delivery_partner') {
        payload.vehicleType = data.vehicleType;
        payload.zoneIds = data.zoneIds || [];
      }
      
      await updateMutation.mutateAsync({ uid: user.id, data: payload });
      toast.success('Staff account updated successfully!');
      onClose();
    } catch {
      // Error handled globally via QueryClient
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
      <Card className="w-full max-w-lg bg-white overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-rice-200">
          <h2 className="text-xl font-semibold text-ink-900">Edit Staff Account</h2>
          <button aria-label="Button action" onClick={onClose} className="p-2 text-ink-500 hover:text-ink-900 rounded-full hover:bg-rice-100 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="overflow-y-auto p-6">
          <form id="edit-staff-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Full Name</label>
              <input {...register('fullName')} className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600" />
              {errors.fullName && <p className="text-xs text-danger">{errors.fullName.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Phone (E.164)</label>
              <input type="tel" {...register('phone')} placeholder="+91..." className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 font-data" />
              {errors.phone && <p className="text-xs text-danger">{errors.phone.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Email Address</label>
              <input type="email" value={user.email} disabled className="lowercase w-full h-10 px-3 rounded-lg border border-rice-300 bg-rice-50 text-ink-500 cursor-not-allowed" />
              <p className="text-xs text-ink-500">Email addresses cannot be changed.</p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Role</label>
              <input type="text" value={user.role.replace('_', ' ')} disabled className="w-full h-10 px-3 rounded-lg border border-rice-300 bg-rice-50 text-ink-500 cursor-not-allowed capitalize" />
              <p className="text-xs text-ink-500">Roles cannot be changed. Create a new account if the role needs to change.</p>
            </div>

            {user.role === 'kitchen' && (
              <div className="space-y-1 bg-rice-50 p-4 rounded-lg border border-rice-200">
                <label className="text-sm font-medium text-ink-700">Kitchen Assignment ID</label>
                <input {...register('kitchenId')} placeholder="e.g. KITCHEN_CENTRAL" className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 font-data" />
              </div>
            )}

            {user.role === 'delivery_partner' && (
              <div className="space-y-4 bg-rice-50 p-4 rounded-lg border border-rice-200">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-ink-700">Vehicle Type</label>
                  <select {...register('vehicleType')} className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 bg-white">
                    <option value="bike">Bike</option>
                    <option value="bicycle">Bicycle</option>
                    <option value="on_foot">On Foot</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-ink-700 flex justify-between items-center">
                    <span>Assigned Zones</span>
                    {isLoadingZones && <span className="text-xs text-ink-500 font-sans">Loading zones...</span>}
                  </label>
                  
                  {zones.length === 0 ? (
                    <div className="text-xs text-ink-500 italic py-2 bg-white rounded-lg px-3 border border-dashed border-rice-300">
                      No delivery zones created yet. You can assign zones later when they are created.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto border border-rice-300 rounded-lg p-2.5 bg-white">
                      {zones.map(zone => (
                        <label key={zone.id} className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer hover:bg-rice-50 p-1 rounded">
                          <input
                            type="checkbox"
                            value={zone.id}
                            {...register('zoneIds')}
                            className="rounded border-rice-300 text-leaf-600 focus:ring-leaf-500"
                          />
                          <span className="truncate">{zone.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="p-4 border-t border-rice-200 bg-rice-25 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={updateMutation.isPending}>Cancel</Button>
          <Button type="submit" form="edit-staff-form" isLoading={updateMutation.isPending}>
            Save Changes
          </Button>
        </div>
      </Card>
    </div>
  );
}
