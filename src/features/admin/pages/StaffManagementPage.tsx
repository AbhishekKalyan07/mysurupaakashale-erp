import { useState } from 'react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { TableSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { useStaffUsers, useToggleStaffStatus } from '../hooks/useAdmin';
import { Plus, Shield, ChefHat, Truck, Receipt, MoreVertical } from 'lucide-react';
import { CreateStaffModal } from '../components/CreateStaffModal';
import { EditStaffModal } from '../components/EditStaffModal';
import { APP_CONFIG } from '@/shared/config/appConfig';
import type { UserProfile } from '@/shared/types';

function StaffCardView({
  user,
  onEdit,
  onToggleStatus,
}: {
  user: UserProfile;
  onEdit: () => void;
  onToggleStatus: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const roleIcon = {
    admin: <Shield size={14} />,
    kitchen: <ChefHat size={14} />,
    delivery_partner: <Truck size={14} />,
    accounts: <Receipt size={14} />
  };

  return (
    <Card elevated className="relative bg-card transition-colors hover:border-secondary/40 group overflow-visible">
      {menuOpen && (
        <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
      )}
      <div className="p-3 flex flex-col gap-2 relative h-[130px]">
        {/* Top Header Row */}
        <div className="flex justify-between items-start">
          <div className="flex gap-2 items-center mt-1">
            {user.displayId ? (
              <Badge variant="default" className="font-mono text-[11px] font-bold tracking-wider px-2 py-0.5 shadow-sm bg-primary/5 text-primary border border-primary/10">
                {user.displayId}
              </Badge>
            ) : (
              <Badge variant="default" className="font-mono text-[11px] font-bold tracking-wider px-2 py-0.5 shadow-sm bg-primary/5 text-primary border border-primary/10">
                STAFF
              </Badge>
            )}
            <Badge variant={user.isActive ? 'success' : 'default'} dot className="text-[10px] shadow-sm px-1.5 py-0.5">
              {user.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          
          {user.role !== 'admin' && (
            <button aria-label="Button action" 
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              className="w-12 h-12 -mr-3 -mt-3 flex items-center justify-center text-text-muted hover:text-primary transition-colors z-20 relative rounded-full hover:bg-surface-2 shrink-0"
              aria-label="More actions"
            >
              <MoreVertical size={18} />
            </button>
          )}
        </div>

        {/* Overflow Menu Dropdown */}
        {menuOpen && (
          <div className="absolute top-11 right-3 z-30 bg-card border border-border shadow-xl rounded-xl w-44 overflow-hidden flex flex-col py-1">
            <button aria-label="Button action" className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-text transition-colors" onClick={() => { setMenuOpen(false); onEdit(); }}>Edit Details</button>
            <button aria-label="Button action" className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-text transition-colors" onClick={() => { setMenuOpen(false); onToggleStatus(); }}>
              {user.isActive ? 'Deactivate Account' : 'Activate Account'}
            </button>
          </div>
        )}

        {/* Name Row */}
        <h3 className="font-bold text-text text-[15px] leading-snug group-hover:text-primary transition-colors line-clamp-2 -mt-1 pr-6">
          {user.fullName}
        </h3>

        {/* Contact Info Inline */}
        <div className="flex items-center gap-2 text-[11px] text-text-muted font-medium truncate mt-0.5">
          <span className="flex items-center gap-1 shrink-0"><span className="text-[13px] leading-none">📞</span> {user.phone}</span>
          <span className="text-border">•</span>
          <span className="truncate">{user.email}</span>
        </div>

        {/* Chips Row (Bottom) */}
        <div className="flex gap-2 items-center mt-auto overflow-hidden pb-0.5">
          <Badge variant="default" className="text-[10px] px-1.5 py-0.5 bg-surface-2 text-text font-semibold shrink-0 whitespace-nowrap capitalize flex items-center gap-1">
            {roleIcon[user.role as keyof typeof roleIcon]} {user.role.replace('_', ' ')}
          </Badge>
          
          {user.role === 'kitchen' && user.kitchenId && (
            <Badge variant="info" className="text-[10px] px-1.5 py-0.5 shadow-sm text-blue-800 bg-blue-100 border border-blue-200 shrink-0 whitespace-nowrap">
               Kitchen: {user.kitchenId}
            </Badge>
          )}
          
          <div className="text-[10px] font-semibold text-text-muted shrink-0 ml-auto mr-1 truncate">
             Joined: {user.createdAt?.toDate ? new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system).format(user.createdAt.toDate()) : 'N/A'}
          </div>
        </div>
      </div>
    </Card>
  );
}

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

      {staff && staff.length > 0 ? (
        <div className="space-y-4">
          <Card className="p-0 overflow-hidden shadow-md border-primary/20 hidden lg:block">
            <table className="w-full text-left text-sm font-sans">
              <thead className="bg-primary/5 text-text-muted font-bold text-[10px] uppercase tracking-wider border-b border-primary/10">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Joined</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5 bg-background">
                {staff.map(user => (
                  <tr key={user.id} className="hover:bg-primary/5 transition-colors group cursor-pointer">
                    <td className="px-6 py-4">
                      <div className="font-bold text-primary group-hover:text-gold transition-colors text-base">{user.fullName}</div>
                      {user.displayId && <div className="text-[10px] text-text-muted font-mono mt-1 bg-background-alt inline-block px-1.5 py-0.5 rounded border border-primary/5">{user.displayId}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 capitalize font-bold text-primary">
                        {roleIcon[user.role as keyof typeof roleIcon]}
                        {user.role.replace('_', ' ')}
                      </div>
                      {(user.role === 'kitchen' && user.kitchenId) && <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mt-1">Kitchen: {user.kitchenId}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-data text-primary font-medium">{user.phone}</div>
                      <div className="text-text-muted text-xs mt-0.5">{user.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={user.isActive ? 'success' : 'default'} className="text-[10px] uppercase font-bold tracking-wider px-3 py-1">
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-text-muted">
                      <span className="bg-background-alt px-2 py-1 rounded border border-primary/5 inline-block text-xs font-medium text-primary">
                        {user.createdAt?.toDate ? new Intl.DateTimeFormat(APP_CONFIG.dateFormat.system).format(user.createdAt.toDate()) : 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
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
          </Card>

          {/* Mobile / Tablet Card View */}
          <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
            {staff.map((user) => (
              <StaffCardView 
                key={user.id} 
                user={user} 
                onEdit={() => setEditingUser(user)}
                onToggleStatus={() => {
                  if (confirm(`Are you sure you want to ${user.isActive ? 'deactivate' : 'activate'} this user?`)) {
                    toggleMutation.mutate({ uid: user.id, isActive: !user.isActive });
                  }
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <Card className="p-8">
          <EmptyState title="No Staff Found" description="Click 'Add Staff' to create the first account." />
        </Card>
      )}

      {isModalOpen && (
        <CreateStaffModal onClose={() => setIsModalOpen(false)} />
      )}
      {editingUser && (
        <EditStaffModal user={editingUser} onClose={() => setEditingUser(null)} />
      )}
    </div>
  );
}
