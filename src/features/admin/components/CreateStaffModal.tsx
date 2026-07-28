import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { STAFF_ROLES } from '@/shared/constants/roles';
import { useCreateStaffUser } from '../hooks/useAdmin';
import { toast } from 'react-hot-toast';

const staffSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  staffId: z.string().min(2, 'Staff ID is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().min(10, 'Phone is required (e.g. +919876543210)'),
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  role: z.enum(STAFF_ROLES as [string, ...string[]]),
  kitchenId: z.string().optional(),
  vehicleType: z.enum(['bike', 'bicycle', 'on_foot', 'other']).optional(),
  zoneIds: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.role === 'kitchen' && !data.kitchenId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['kitchenId'], message: 'Kitchen ID is required' });
  }
  if (data.role === 'delivery_partner') {
    if (!data.vehicleType) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vehicleType'], message: 'Vehicle Type is required' });
    if (!data.zoneIds) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['zoneIds'], message: 'Zone IDs required (comma separated)' });
  }
});

type StaffForm = z.infer<typeof staffSchema>;

interface Props {
  onClose: () => void;
}

export function CreateStaffModal({ onClose }: Props) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<StaffForm>({
    resolver: zodResolver(staffSchema),
    defaultValues: { role: 'kitchen', vehicleType: 'bike', phone: '+91 ' }
  });

  const selectedRole = watch('role');
  const createMutation = useCreateStaffUser();

  const onSubmit = async (data: StaffForm) => {
    try {
      const payload: any = { ...data };
      if (data.role === 'delivery_partner' && data.zoneIds) {
        payload.zoneIds = data.zoneIds.split(',').map(s => s.trim()).filter(Boolean);
      }
      await createMutation.mutateAsync(payload);
      toast.success('Staff account created successfully!');
      onClose();
    } catch {
      // Error handled globally via QueryClient
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
      <Card className="w-full max-w-lg bg-white overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-rice-200">
          <h2 className="text-xl font-semibold text-ink-900">Provision Staff Account</h2>
          <button onClick={onClose} className="p-2 text-ink-500 hover:text-ink-900 rounded-full hover:bg-rice-100 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="overflow-y-auto p-6">
          <form id="staff-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Full Name</label>
              <input {...register('fullName')} placeholder="John Doe" className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600" />
              {errors.fullName && <p className="text-sm text-danger">{errors.fullName.message}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Staff ID / U_ID</label>
              <input {...register('staffId')} placeholder="EMP-001" className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 uppercase font-data" />
              {errors.staffId && <p className="text-sm text-danger">{errors.staffId.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-ink-700">Email Address</label>
                <input type="email" autoCapitalize="none" autoCorrect="off" {...register('email')} className="lowercase w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600" />
                {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-ink-700">Phone (E.164)</label>
                <input type="tel" {...register('phone')} placeholder="+91..." className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 font-data" />
                {errors.phone && <p className="text-xs text-danger">{errors.phone.message}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Temporary Password</label>
              <input type="password" {...register('password')} className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600" />
              {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Role</label>
              <select {...register('role')} className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 bg-white capitalize">
                {STAFF_ROLES.map(role => (
                  <option key={role} value={role}>{role.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            {selectedRole === 'kitchen' && (
              <div className="space-y-1 bg-rice-50 p-4 rounded-lg border border-rice-200">
                <label className="text-sm font-medium text-ink-700">Kitchen Assignment ID</label>
                <input {...register('kitchenId')} placeholder="e.g. KITCHEN_CENTRAL" className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 font-data" />
                {errors.kitchenId && <p className="text-xs text-danger">{errors.kitchenId.message}</p>}
              </div>
            )}

            {selectedRole === 'delivery_partner' && (
              <div className="space-y-4 bg-rice-50 p-4 rounded-lg border border-rice-200">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-ink-700">Vehicle Type</label>
                  <select {...register('vehicleType')} className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 bg-white">
                    <option value="bike">Bike</option>
                    <option value="bicycle">Bicycle</option>
                    <option value="on_foot">On Foot</option>
                    <option value="other">Other</option>
                  </select>
                  {errors.vehicleType && <p className="text-xs text-danger">{errors.vehicleType.message}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-ink-700">Assigned Zone IDs (comma separated)</label>
                  <input {...register('zoneIds')} placeholder="e.g. ZONE_MYQ_01, ZONE_MYQ_02" className="w-full h-10 px-3 rounded-lg border border-rice-300 focus:ring-2 focus:ring-leaf-600 font-data" />
                  {errors.zoneIds && <p className="text-xs text-danger">{errors.zoneIds.message}</p>}
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="p-4 border-t border-rice-200 bg-rice-25 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={createMutation.isPending}>Cancel</Button>
          <Button type="submit" form="staff-form" isLoading={createMutation.isPending}>
            Create Account
          </Button>
        </div>
      </Card>
    </div>
  );
}
