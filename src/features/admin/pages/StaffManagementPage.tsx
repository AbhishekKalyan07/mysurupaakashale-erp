import { useState } from 'react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { useStaffUsers } from '../hooks/useAdmin';
import { Users, Plus, Shield, ChefHat, Truck, Receipt } from 'lucide-react';
import { CreateStaffModal } from '../components/CreateStaffModal';
import { APP_CONFIG } from '@/shared/config/appConfig';

export function StaffManagementPage() {
  const { data: staff, isLoading, isError } = useStaffUsers();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (isLoading) return <LoadingScreen />;
  if (isError) return <div className="p-8 text-danger">Failed to load staff data.</div>;

  const roleIcon = {
    admin: <Shield size={16} />,
    kitchen: <ChefHat size={16} />,
    delivery_partner: <Truck size={16} />,
    accounts: <Receipt size={16} />
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Users className="text-leaf-600" />
            Staff Management
          </h1>
          <p className="text-sm text-ink-500 font-sans mt-1">
            Provision and monitor internal staff accounts.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={16} className="mr-2" />
          Add Staff
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {staff && staff.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-rice-50 text-ink-500 font-medium">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rice-100">
                {staff.map(user => (
                  <tr key={user.id} className="hover:bg-rice-25">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink-900">{user.fullName}</div>
                      <div className="text-xs text-ink-500 font-data">{user.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 capitalize">
                        {roleIcon[user.role as keyof typeof roleIcon]}
                        {user.role.replace('_', ' ')}
                      </div>
                      {((user as any).kitchenId) && <div className="text-xs text-ink-400 mt-0.5">Kitchen: {(user as any).kitchenId}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div>{user.email}</div>
                      <div className="font-data text-ink-500">{user.phone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={user.isActive ? 'success' : 'neutral'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-500">
                      {user.createdAt?.toDate ? new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system).format(user.createdAt.toDate()) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8">
            <EmptyState title="No Staff Found" description="Click 'Add Staff' to create the first account." />
          </div>
        )}
      </Card>

      {isModalOpen && (
        <CreateStaffModal onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
}
