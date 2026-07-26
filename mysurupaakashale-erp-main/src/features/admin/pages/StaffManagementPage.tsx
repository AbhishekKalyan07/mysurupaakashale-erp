import { useState } from 'react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { TableSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { useStaffUsers, useToggleStaffStatus } from '../hooks/useAdmin';
import { Users, Plus, Shield, ChefHat, Truck, Receipt } from 'lucide-react';
import { CreateStaffModal } from '../components/CreateStaffModal';
import { EditStaffModal } from '../components/EditStaffModal';
import { APP_CONFIG } from '@/shared/config/appConfig';
import type { UserProfile } from '@/shared/types';

export function StaffManagementPage() {
  const { data: staff, isLoading, isError } = useStaffUsers();
  const toggleMutation = useToggleStaffStatus();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  if (isLoading) return <div className="p-8"><TableSkeleton /></div>;
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
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-left text-sm block md:table">
              <thead className="hidden md:table-header-group bg-rice-50 text-ink-500 font-medium">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group divide-y divide-rice-100">
                {staff.map(user => (
                  <tr key={user.id} className="block md:table-row bg-white md:bg-transparent hover:bg-rice-25 p-4 md:p-0 space-y-3 md:space-y-0">
                    <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Name</span>
                      <div className="text-right md:text-left">
                        <div className="font-semibold text-ink-900">{user.fullName}</div>
                        <div className="text-xs text-ink-500 font-data">{user.staffId || user.id}</div>
                      </div>
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Role</span>
                      <div className="text-right md:text-left">
                        <div className="flex items-center justify-end md:justify-start gap-2 capitalize">
                          {roleIcon[user.role as keyof typeof roleIcon]}
                          {user.role.replace('_', ' ')}
                        </div>
                        {(user.role === 'kitchen' && user.kitchenId) && <div className="text-xs text-ink-400 mt-0.5">Kitchen: {user.kitchenId}</div>}
                      </div>
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Contact</span>
                      <div className="text-right md:text-left">
                        <div>{user.email}</div>
                        <div className="font-data text-ink-500">{user.phone}</div>
                      </div>
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Status</span>
                      <Badge tone={user.isActive ? 'success' : 'neutral'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3 text-ink-500">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Joined</span>
                      {user.createdAt?.toDate ? new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system).format(user.createdAt.toDate()) : 'N/A'}
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 pt-2 md:pt-0 md:px-4 md:py-3 text-right border-t border-rice-100 md:border-0 mt-2 md:mt-0">
                      <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Actions</span>
                      <div className="flex justify-end gap-2">
                        {user.role !== 'admin' && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setEditingUser(user)}
                            className="text-ink-600 hover:bg-rice-100"
                          >
                            Edit
                          </Button>
                        )}
                        {user.role !== 'admin' && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          isLoading={toggleMutation.isPending && toggleMutation.variables?.uid === user.id}
                          onClick={() => {
                            if (confirm(`Are you sure you want to ${user.isActive ? 'deactivate' : 'activate'} this user?`)) {
                              toggleMutation.mutate({ uid: user.id, isActive: !user.isActive });
                            }
                          }}
                          className={user.isActive ? 'text-danger hover:bg-danger-50' : 'text-emerald-600 hover:bg-emerald-50'}
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                      </div>
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
      {editingUser && (
        <EditStaffModal user={editingUser} onClose={() => setEditingUser(null)} />
      )}
    </div>
  );
}
