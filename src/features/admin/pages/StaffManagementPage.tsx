import { useState } from 'react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { TableSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { useStaffUsers, useToggleStaffStatus } from '../hooks/useAdmin';
import { Plus, Shield, ChefHat, Truck, Receipt } from 'lucide-react';
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
  if (isError) return <div className="p-8 text-red-500 font-bold">Failed to load staff data.</div>;

  const roleIcon = {
    admin: <Shield size={16} />,
    kitchen: <ChefHat size={16} />,
    delivery_partner: <Truck size={16} />,
    accounts: <Receipt size={16} />
  };

  return (
    <div className="space-y-8">
      <div className="relative">
        <PageHeader 
          userName="Staff Management"
          subtitle="Provision and monitor internal staff accounts."
        />
        <div className="absolute top-6 right-6 hidden sm:block">
          <Button variant="primary" onClick={() => setIsModalOpen(true)} className="shadow-lg">
            <Plus size={18} className="mr-2" />
            Add Staff
          </Button>
        </div>
      </div>
      
      <div className="sm:hidden flex justify-end">
        <Button variant="primary" onClick={() => setIsModalOpen(true)} className="w-full shadow-md">
          <Plus size={18} className="mr-2" />
          Add Staff
        </Button>
      </div>

      <Card className="p-0 overflow-hidden shadow-md border-primary/20">
        {staff && staff.length > 0 ? (
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-left text-sm block md:table font-sans">
              <thead className="hidden md:table-header-group bg-primary/5 text-text-muted font-bold text-[10px] uppercase tracking-wider border-b border-primary/10">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Joined</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group divide-y divide-primary/5 bg-background">
                {staff.map(user => (
                  <tr key={user.id} className="block md:table-row bg-background md:bg-transparent hover:bg-primary/5 p-4 md:p-0 space-y-3 md:space-y-0 transition-colors group">
                    <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4">
                      <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Name</span>
                      <div className="text-right md:text-left">
                        <div className="font-bold text-primary group-hover:text-gold transition-colors text-base">{user.fullName}</div>
                        <div className="text-[10px] text-text-muted font-mono mt-1 bg-background-alt inline-block px-1.5 py-0.5 rounded border border-primary/5">{user.staffId || user.id}</div>
                      </div>
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4">
                      <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Role</span>
                      <div className="text-right md:text-left">
                        <div className="flex items-center justify-end md:justify-start gap-2 capitalize font-bold text-primary">
                          {roleIcon[user.role as keyof typeof roleIcon]}
                          {user.role.replace('_', ' ')}
                        </div>
                        {(user.role === 'kitchen' && user.kitchenId) && <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mt-1">Kitchen: {user.kitchenId}</div>}
                      </div>
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4">
                      <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Contact</span>
                      <div className="text-right md:text-left">
                        <div className="text-primary font-medium">{user.email}</div>
                        <div className="font-data text-text-muted font-bold text-xs mt-0.5">{user.phone}</div>
                      </div>
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4">
                      <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Status</span>
                      <Badge variant={user.isActive ? 'success' : 'default'} className="text-[10px] uppercase font-bold tracking-wider px-3 py-1">
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4 text-text-muted">
                      <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Joined</span>
                      <span className="bg-background-alt px-2 py-1 rounded border border-primary/5 inline-block text-xs font-medium text-primary">
                        {user.createdAt?.toDate ? new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system).format(user.createdAt.toDate()) : 'N/A'}
                      </span>
                    </td>
                    <td className="flex justify-between items-center md:table-cell px-0 pt-3 md:pt-0 md:px-6 md:py-4 text-right border-t border-primary/10 md:border-0 mt-3 md:mt-0">
                      <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Actions</span>
                      <div className="flex justify-end gap-2">
                        {user.role !== 'admin' && (
                          <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={() => setEditingUser(user)}
                            className="font-bold font-sans"
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
                          className={`font-bold font-sans ${user.isActive ? 'text-red-600 hover:bg-red-50 hover:text-red-700' : 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'}`}
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
