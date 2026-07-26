import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { useUpdateStaffUser } from '../hooks/useAdmin';
import { toast } from 'react-hot-toast';
import type { UserProfile } from '@/shared/types';

const staffSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  phone: z.string().min(10, 'Phone is required (e.g. +919876543210)'),
  kitchenId: z.string().optional(),
  vehicleType: z.enum(['bike', 'bicycle', 'on_foot', 'other']).optional(),
  zoneIds: z.string().optional(),
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

  useEffect(() => {
    reset({
      fullName: user.fullName,
      phone: user.phone,
      kitchenId: user.role === 'kitchen' ? user.kitchenId : '',
      vehicleType: user.role === 'delivery_partner' ? user.vehicleType : 'bike',
      zoneIds: user.role === 'delivery_partner' ? user.zoneIds?.join(', ') : '',
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
        if (data.zoneIds) {
          payload.zoneIds = data.zoneIds.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      
      await updateMutation.mutateAsync({ uid: user.id, data: payload });
      toast.success('Staff account updated successfully!');
      onClose();
    } catch (err) {
      console.error('Staff update failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
      <Card className="w-full max-w-lg bg-white overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-rice-200">
          <h2 className="text-xl font-semibold text-ink-900">Edit Staff Account</h2>
          <button onClick={onClose} className="p-2 text-ink-500 hover:text-ink-900 rounded-full hover:bg-rice-100 transition-colors">
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
              <input type="email" value={user.email} disabled className="w-full h-10 px-3 rounded-lg border border-rice-300 bg-rice-50 text-ink-500 cursor-not-allowed" />
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
                <div className="space-y-1">
                  <label className="text-sm font-medium text-ink-700">Assigned Zone IDs (comma separated)</label>
                  <input {...register('zoneIds')} placeholder="e.g. ZONE_MYQ_01, ZONE_MYQ_02" className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 font-data" />
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
