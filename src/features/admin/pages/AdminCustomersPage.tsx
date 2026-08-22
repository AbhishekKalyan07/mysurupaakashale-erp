import { useState } from 'react';
import { format } from 'date-fns';
import { Search, XCircle, Users, CheckCircle, ChevronLeft, ChevronRight, X, Filter, MoreVertical } from 'lucide-react';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { TableSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { useAdminCustomers, useStaffUsers, useAssignDeliveryPartner, useAssignCustomerZone } from '@/features/admin/hooks/useAdmin';
import { useCustomerOrderHistory } from '@/features/customer/hooks/useMySubscription';
import { useDeliveryZones } from '@/features/admin/hooks/useDeliveryZones';
import { StatusChip } from '@/shared/components/ui/StatusChip';
import { MealBadge } from '@/shared/components/ui/MealBadge';
import { PackageOpen, Clock, Calendar } from 'lucide-react';
import type { CustomerProfile, UserProfile, DeliveryPartnerProfile, Order } from '@/shared/types';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

function formatDate(value: any): string {
  if (!value) return '—';
  try {
    const d = value.toDate ? value.toDate() : new Date(value);
    return format(d, 'MMM dd, yyyy');
  } catch {
    return '—';
  }
}

// ── Customer Order History Tab ─────────────────────────────────────────────────
function CustomerOrderHistoryTab({ customerId }: { customerId: string }) {
  const { data: orders, isLoading, error } = useCustomerOrderHistory(customerId);

  if (isLoading) return <div className="p-6 text-center text-sm font-medium text-text-muted">Loading history...</div>;
  if (error) return <div className="p-6 text-center text-sm font-medium text-danger">Failed to load history.</div>;
  
  if (!orders || orders.length === 0) {
    return (
      <div className="p-8 text-center text-text-muted">
        <PackageOpen size={32} className="mx-auto mb-3 opacity-20" />
        <p className="text-sm font-medium">No order history available.</p>
      </div>
    );
  }

  const groupedOrders: Record<string, Order[]> = {};
  for (const order of orders) {
    if (!groupedOrders[order.date]) groupedOrders[order.date] = [];
    groupedOrders[order.date].push(order);
  }

  const mealSortOrder: Record<string, number> = { breakfast: 1, lunch: 2, dinner: 3 };
  const groupKeys = Object.keys(groupedOrders).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-1 rounded-xl p-3 border border-border text-center">
          <div className="text-xl font-bold text-text">{orders.length}</div>
          <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mt-0.5">Total Orders</div>
        </div>
        <div className="bg-success/10 rounded-xl p-3 border border-success/20 text-center">
          <div className="text-xl font-bold text-success">{orders.filter(o => o.status === 'delivered').length}</div>
          <div className="text-[10px] font-medium text-success/80 uppercase tracking-wider mt-0.5">Delivered</div>
        </div>
        <div className="bg-danger/10 rounded-xl p-3 border border-danger/20 text-center">
          <div className="text-xl font-bold text-danger">{orders.filter(o => o.status === 'cancelled').length}</div>
          <div className="text-[10px] font-medium text-danger/80 uppercase tracking-wider mt-0.5">Cancelled</div>
        </div>
      </div>

      {groupKeys.map((date) => {
        const dayOrders = groupedOrders[date].sort((a, b) => (mealSortOrder[a.mealType] || 99) - (mealSortOrder[b.mealType] || 99));
        return (
          <div key={date} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-1">
              <Calendar size={12} /> {formatDate(date)}
            </h3>
            <div className="grid gap-2">
              {dayOrders.map((order) => {
                const isTerminal = ['delivered', 'failed_delivery', 'cancelled'].includes(order.status);
                return (
                  <div key={order.id} className={`bg-background rounded-xl p-3 border border-border flex items-center justify-between gap-4 ${isTerminal ? 'opacity-70' : ''}`}>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <MealBadge mealType={order.mealType} compact />
                        {order.deliveryWindow && <span className="text-[10px] text-text-muted flex items-center gap-0.5"><Clock size={10}/> {order.deliveryWindow.start}–{order.deliveryWindow.end}</span>}
                      </div>
                      <div className="text-xs text-text font-medium truncate">
                        ID: {order.id.slice(0, 8)} • Qty: {order.mealQuantity || 1}
                      </div>
                      {order.deliveryResult && order.status === 'failed_delivery' && (
                        <div className="text-[10px] text-danger font-bold">Failed: {order.deliveryResult.reasonCode}</div>
                      )}
                    </div>
                    <div className="shrink-0">
                      <StatusChip status={order.status} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Detail Dialog ────────────────────────────────────────────────────────────
function CustomerDetailDialog({ customer, onClose }: { customer: CustomerProfile; onClose: () => void }) {
  const addrList = customer.addresses || [];
  const defaultId = customer.defaultAddressId;
  
  const { data: staffUsers } = useStaffUsers();
  const deliveryPartners = (staffUsers || []).filter(u => u.role === 'delivery_partner' && u.isActive) as DeliveryPartnerProfile[];
  const { data: zones = [] } = useDeliveryZones();
  
  const assignPartner = useAssignDeliveryPartner();
  const assignZone = useAssignCustomerZone();
  
  const [isEditingPartner, setIsEditingPartner] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState(customer.deliveryPartnerId || '');

  const [isEditingZone, setIsEditingZone] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState(customer.zoneId || '');
  
  const [activeTab, setActiveTab] = useState<'profile' | 'orders'>('profile');

  // Find current partner object if exists
  const currentPartner = deliveryPartners.find(p => p.id === customer.deliveryPartnerId);
  const currentZone = zones.find(z => z.id === customer.zoneId);

  return (
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-primary/20">
        <div className="p-6 border-b border-primary/10 flex justify-between items-start bg-primary/5">
          <div>
            <h2 className="text-2xl font-bold text-primary font-display">Customer Details</h2>
            <p className="text-text-muted text-xs font-mono mt-1 bg-background-alt px-2 py-1 rounded inline-block border border-primary/10">
              {customer.displayId || 'Customer'}
            </p>
          </div>
          <button aria-label="Button action" onClick={onClose} className="text-primary hover:text-gold p-1 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex border-b border-primary/10 px-6" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'profile' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-primary'
            }`}
          >
            Profile
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'orders'}
            onClick={() => setActiveTab('orders')}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'orders' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-primary'
            }`}
          >
            Order History
          </button>
        </div>

        <div className="p-6 space-y-4" role="tabpanel">
          {activeTab === 'profile' ? (
            <div className="grid grid-cols-2 gap-4 text-sm font-sans">
            <div className="bg-primary/5 rounded-xl p-4 col-span-2 border border-primary/10">
              <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-2">Profile</div>
              <div className="font-bold text-primary text-lg">{customer.fullName}</div>
              <div className="text-primary font-medium mt-1">{customer.phone}</div>
              <div className="text-text-muted">{customer.email}</div>
            </div>
            <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
              <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-2">Joined</div>
              <div className="font-bold text-primary">{formatDate(customer.createdAt)}</div>
            </div>
            <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
              <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-2">Account Status</div>
              <div className="font-semibold text-primary">
                <Badge variant={customer.isActive ? 'success' : 'danger'} className="text-[10px] uppercase tracking-wider font-bold">
                  {customer.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            
            <div className="bg-primary/5 rounded-xl p-4 col-span-2 border border-primary/10">
              <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider mb-3">Saved Addresses ({addrList.length})</div>
              {addrList.length === 0 ? (
                <div className="text-text-muted text-sm italic bg-background p-3 rounded-lg border border-primary/5">No addresses saved.</div>
              ) : (
                <div className="space-y-3">
                  {addrList.map(addr => (
                    <div key={addr.id} className="text-sm bg-background p-3 rounded-lg border border-primary/10 shadow-sm">
                      <div className="font-bold text-primary flex items-center gap-2">
                        {addr.label}
                        {addr.id === defaultId && (
                          <span className="text-[9px] uppercase tracking-wider bg-gold text-primary px-2 py-0.5 rounded-full font-bold">Default</span>
                        )}
                      </div>
                      <div className="text-text-muted text-xs mt-1 font-medium">
                        {[addr.line1, addr.line2, addr.city].filter(Boolean).join(', ')}
                        {addr.pincode ? ` - ${addr.pincode}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-primary/5 rounded-xl p-4 col-span-2 border border-primary/10 mt-2">
              <div className="flex justify-between items-center mb-4">
                <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider">Delivery Zone Assignment</div>
                {!isEditingZone && (
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingZone(true)} className="text-xs text-gold hover:bg-gold/10 px-2 py-1 h-auto">
                    Change Zone
                  </Button>
                )}
              </div>

              {isEditingZone ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <select 
                      value={selectedZoneId}
                      onChange={(e) => setSelectedZoneId(e.target.value)}
                      className="flex-1 bg-background border border-primary/20 rounded-xl text-sm font-sans text-primary px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gold"
                    >
                      <option value="">Auto-Assign (Pincode Based)</option>
                      {zones.map(z => (
                        <option key={z.id} value={z.id}>{z.name} ({z.pincodes.length} pincodes)</option>
                      ))}
                    </select>
                    <Button 
                      variant="primary" 
                      size="sm" 
                      disabled={selectedZoneId === (customer.zoneId || '') || assignZone.isPending}
                      onClick={() => {
                        assignZone.mutate(
                          { customerId: customer.id, zoneId: selectedZoneId },
                          { onSuccess: () => setIsEditingZone(false) }
                        );
                      }}
                    >
                      {assignZone.isPending ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setIsEditingZone(false); setSelectedZoneId(customer.zoneId || ''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">Zone</div>
                    <div className="font-bold text-primary text-base">
                      {currentZone ? currentZone.name : (customer.zoneId ? 'Unknown Zone' : 'Auto-Assign (Pincode)')}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-primary/5 rounded-xl p-4 col-span-2 border border-primary/10 mt-2">
              <div className="flex justify-between items-center mb-4">
                <div className="text-text-muted text-[10px] font-bold uppercase tracking-wider">Delivery Partner Assignment</div>
                {!isEditingPartner && (
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingPartner(true)} className="text-xs text-gold hover:bg-gold/10 px-2 py-1 h-auto">
                    Change Assignment
                  </Button>
                )}
              </div>

              {isEditingPartner ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <select 
                      value={selectedPartnerId}
                      onChange={(e) => setSelectedPartnerId(e.target.value)}
                      className="flex-1 bg-background border border-primary/20 rounded-xl text-sm font-sans text-primary px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gold"
                    >
                      <option value="">Select a Delivery Partner</option>
                      {deliveryPartners.map(dp => {
                        const dpZoneNames = (dp.zoneIds || []).map(id => zones.find(z => z.id === id)?.name || id);
                        return (
                          <option key={dp.id} value={dp.id}>
                            {dp.fullName} ({dpZoneNames.length > 0 ? dpZoneNames.join(', ') : 'No zones'})
                          </option>
                        );
                      })}
                    </select>
                    <Button 
                      variant="primary" 
                      size="sm" 
                      disabled={!selectedPartnerId || selectedPartnerId === customer.deliveryPartnerId || assignPartner.isPending}
                      onClick={() => {
                        assignPartner.mutate(
                          { customerId: customer.id, partnerId: selectedPartnerId },
                          { onSuccess: () => setIsEditingPartner(false) }
                        );
                      }}
                    >
                      {assignPartner.isPending ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setIsEditingPartner(false); setSelectedPartnerId(customer.deliveryPartnerId || ''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">Partner</div>
                    <div className="font-bold text-primary text-base">
                      {currentPartner ? currentPartner.fullName : (customer.deliveryPartnerId ? 'Unknown Partner' : 'Unassigned')}
                    </div>
                  </div>
                  {(customer.assignedAt || customer.assignedBy) && (
                    <div>
                      <div className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">Assignment Details</div>
                      <div className="text-xs text-text-muted font-medium">
                        {customer.assignedAt ? `On ${formatDate(customer.assignedAt)}` : ''}
                        {customer.assignedBy ? ` By Admin` : ''}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
          ) : (
            <CustomerOrderHistoryTab customerId={customer.id} />
          )}
        </div>
      </div>
    </div>
  );
}


// ── Customer Card (Responsive Grid) ───────────────────────────────────────────────────
function CustomerCardView({ customer, onSelect, deliveryPartners }: { customer: CustomerProfile; onSelect: () => void; deliveryPartners: DeliveryPartnerProfile[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const defaultAddress = customer.addresses?.find(a => a.id === customer.defaultAddressId) || customer.addresses?.[0];
  const locationText = defaultAddress 
    ? [defaultAddress.line1, defaultAddress.city].filter(Boolean).join(', ') 
    : 'No address';

  const partner = deliveryPartners.find(p => p.id === customer.deliveryPartnerId);

  return (
    <Card elevated className="relative bg-card transition-colors hover:border-secondary/40 group overflow-visible min-w-0">
      {/* Menu Overlay Backdrop */}
      {menuOpen && (
        <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
      )}
      
      <div 
        className="p-3.5 flex flex-col gap-2 cursor-pointer min-h-[140px] min-w-0" 
        onClick={() => { if(!menuOpen) onSelect(); }}
      >
        {/* Top Header Row */}
        <div className="flex justify-between items-start">
          <div className="flex gap-2 items-center mt-1">
            <Badge variant={customer.isActive ? 'success' : 'danger'} dot className="text-[10px] shadow-sm px-1.5 py-0.5">
              {customer.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          
          <button 
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="w-12 h-12 -mr-3 -mt-3 flex items-center justify-center text-text-muted hover:text-primary transition-colors z-20 relative rounded-full hover:bg-surface-2 shrink-0"
            aria-label="More actions"
          >
            <MoreVertical size={18} />
          </button>
        </div>

        {/* Overflow Menu Dropdown */}
        {menuOpen && (
          <div className="absolute top-11 right-3 z-30 bg-card border border-border shadow-xl rounded-xl w-44 overflow-hidden flex flex-col py-1">
            <button aria-label="Button action" className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-text transition-colors" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onSelect(); }}>View Details</button>
            <button aria-label="Button action" className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-text transition-colors" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onSelect(); }}>Edit</button>
            <button aria-label="Button action" className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-text transition-colors" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onSelect(); }}>Assign Driver</button>
            <div className="h-[1px] bg-border my-1 w-full" />
            <button aria-label="Button action" className="text-left px-4 py-3 text-[13px] font-semibold hover:bg-surface-2 text-primary transition-colors" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); window.location.href = `tel:${customer.phone}`; }}>Call Customer</button>
          </div>
        )}
        
        {/* Name Row */}
        <div className="flex items-center gap-2 pr-6 mt-1">
          <h3 className="font-bold text-text text-[15px] leading-snug group-hover:text-primary transition-colors truncate">
            👤 {customer.fullName}
          </h3>
          {customer.displayId && (
            <Badge variant="default" className="font-mono text-[11px] font-bold tracking-wider px-2 py-0.5 shadow-sm bg-primary/5 text-primary border border-primary/10 shrink-0">
              {customer.displayId}
            </Badge>
          )}
        </div>
        
        {/* Contact Info Inline */}
        <div className="flex items-center gap-2 text-[11px] text-text-muted font-medium mt-0.5 min-w-0">
          <span className="flex items-center gap-1 shrink-0"><span className="text-[13px] leading-none">📞</span> {customer.phone}</span>
          <span className="text-border shrink-0">•</span>
          <span className="flex items-center gap-1 truncate min-w-0"><span className="text-[13px] leading-none shrink-0">📍</span> <span className="truncate">{locationText}</span></span>
        </div>

        {/* Chips Row (Bottom) */}
        <div className="flex flex-wrap gap-1.5 items-center mt-auto pt-1">
          <Badge variant="default" className="text-[10px] px-1.5 py-0.5 bg-surface-2 text-text font-semibold shrink-0 whitespace-nowrap">
            🍛 Basic Plan
          </Badge>
          
          {partner ? (
            <Badge variant="info" className="text-[10px] px-1.5 py-0.5 shadow-sm text-blue-800 bg-blue-100 border border-blue-200 shrink-0 whitespace-nowrap truncate max-w-[120px]">
              🚚 {partner.fullName}
            </Badge>
          ) : (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0.5 shadow-sm shrink-0 whitespace-nowrap">
              ⚠ Unassigned
            </Badge>
          )}

          <Badge variant="default" className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary font-bold shadow-sm shrink-0 whitespace-nowrap">
            🟣 Ready
          </Badge>
        </div>
      </div>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
type StatusFilter = 'all' | 'active' | 'inactive';

const TABS: { label: string; value: StatusFilter; icon: React.ReactNode }[] = [
  { label: 'All', value: 'all', icon: <Users size={16} /> },
  { label: 'Active', value: 'active', icon: <CheckCircle size={16} /> },
  { label: 'Inactive', value: 'inactive', icon: <XCircle size={16} /> },
];

export function AdminCustomersPage() {
  const [activeTab, setActiveTab] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerProfile | null>(null);

  // Pagination state
  const [pageHistory, setPageHistory] = useState<QueryDocumentSnapshot<UserProfile>[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const currentLastDoc = currentPage > 0 ? pageHistory[currentPage - 1] : undefined;

  const { data, isLoading, error, refetch } = useAdminCustomers(currentLastDoc);
  const { data: staffUsers } = useStaffUsers();
  
  const customers = data?.rows ?? [];
  const deliveryPartners = (staffUsers || []).filter(u => u.role === 'delivery_partner' && u.isActive) as DeliveryPartnerProfile[];

  const handleNextPage = () => {
    if (data?.lastDoc) {
      setPageHistory((prev) => {
        const next = [...prev];
        next[currentPage] = data.lastDoc!;
        return next;
      });
      setCurrentPage((p) => p + 1);
    }
  };

  const handlePrevPage = () => {
    setCurrentPage((p) => Math.max(0, p - 1));
  };

  const handleTabChange = (tab: StatusFilter) => {
    setActiveTab(tab);
    setPageHistory([]);
    setCurrentPage(0);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPageHistory([]);
    setCurrentPage(0);
  };

  // Local filtering based on tabs and search
  const filtered = customers.filter((row) => {
    // 1. Filter by Tab
    if (activeTab === 'active' && !row.isActive) return false;
    if (activeTab === 'inactive' && row.isActive) return false;
    
    // 2. Filter by Search
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      row.fullName.toLowerCase().includes(q) ||
      row.phone.toLowerCase().includes(q) ||
      row.email.toLowerCase().includes(q) ||
      row.id.toLowerCase().includes(q) ||
      (row.displayId && row.displayId.toLowerCase().includes(q))
    );
  });

  if (isLoading) return <div className="p-8"><TableSkeleton /></div>;
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader userName="Customers" subtitle="Could not load customer records." />
        <ErrorState title="Could not load customers" description="We had trouble loading customer records." onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader 
        userName="Customers"
        subtitle="Manage customer profiles, addresses, and partner assignments."
      />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          {/* Tab bar */}
          <div className="flex gap-2">
            {TABS.map((tab) => (
              <button aria-label="Button action"
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full transition-all border ${
                  activeTab === tab.value
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-surface-2 text-text-muted border-border hover:border-secondary/40'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[300px] flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search..."
              className="w-full pl-10 pr-16 h-11 bg-card border border-border rounded-[14px] text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary/60 shadow-xs transition-colors"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {search && (
                <button aria-label="Button action"
                  onClick={() => setSearch('')}
                  className="text-text-muted hover:text-text p-1"
                >
                  <X size={14} />
                </button>
              )}
              <div className="w-[1px] h-4 bg-border hidden sm:block"></div>
              <button aria-label="Button action" className="text-text-muted hover:text-primary transition-colors flex items-center gap-1.5 p-1 rounded hover:bg-surface-2">
                <Filter size={16} />
                <span className="text-xs font-semibold hidden sm:inline">Filter</span>
              </button>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={48} className="text-text-faint" />}
            title="No customers found"
            description={search ? 'No customers match your search query.' : `No ${activeTab === 'all' ? '' : activeTab} customers found.`}
          />
        ) : (
          <div className="space-y-4">
            {/* Desktop Table View */}
            <Card className="p-0 overflow-hidden shadow-md border-primary/20 hidden lg:block">
              <table className="w-full text-left text-sm font-sans">
                <thead className="bg-primary/5 text-text-muted font-bold text-[10px] uppercase tracking-wider border-b border-primary/10">
                  <tr>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4">Address</th>
                    <th className="px-6 py-4">Partner/Zone</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5 bg-background">
                  {filtered.map((row) => {
                    const defaultAddress = row.addresses?.find((a: any) => a.id === row.defaultAddressId) || row.addresses?.[0];
                    const locationText = defaultAddress ? [defaultAddress.line1, defaultAddress.city].filter(Boolean).join(', ') : 'No address';
                    const partner = deliveryPartners.find(p => p.id === row.deliveryPartnerId);
                    
                    return (
                      <tr key={row.id} className="hover:bg-primary/5 transition-colors group cursor-pointer" onClick={() => setSelected(row)}>
                        <td className="px-6 py-4">
                          <div className="font-bold text-primary group-hover:text-gold transition-colors text-base">{row.fullName}</div>
                          {row.displayId && <div className="text-[10px] text-text-muted font-mono mt-1 bg-background-alt inline-block px-1.5 py-0.5 rounded border border-primary/5">{row.displayId}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-data text-primary font-medium">{row.phone}</div>
                          <div className="text-text-muted text-xs mt-0.5 truncate max-w-[150px]">{row.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-text-muted text-xs truncate max-w-[200px] flex items-center gap-1">
                            <span className="text-[13px] leading-none">📍</span> {locationText}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {partner ? (
                            <Badge variant="info" className="text-[10px] px-1.5 py-0.5 shadow-sm text-blue-800 bg-blue-100 border border-blue-200 whitespace-nowrap">
                              🚚 {partner.fullName}
                            </Badge>
                          ) : row.zoneId ? (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0.5 shadow-sm bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                              📍 Assigned to Zone
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="text-[10px] px-1.5 py-0.5 shadow-sm whitespace-nowrap">
                              ⚠ Auto (Pincode)
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={row.isActive ? 'success' : 'danger'} className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                            {row.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setSelected(row); }}>
                            Manage
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {/* Mobile / Tablet Card View */}
            <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
              {filtered.map((row) => (
                <CustomerCardView 
                  key={row.id} 
                  customer={row} 
                  onSelect={() => setSelected(row)} 
                  deliveryPartners={deliveryPartners} 
                />
              ))}
            </div>
            
            <div className="flex flex-col items-center justify-center sm:flex-row sm:justify-between gap-4 px-2 pt-4 border-t border-border mt-2">
              <span className="text-sm font-medium text-text-muted text-center sm:text-left">
                Showing <strong className="text-primary">{filtered.length}</strong> customer{filtered.length !== 1 ? 's' : ''} on this page
              </span>
              <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={handlePrevPage} 
                  disabled={currentPage === 0 || isLoading}
                  className="flex-1 sm:flex-none"
                >
                  <ChevronLeft size={16} className="mr-1" /> Prev
                </Button>
                <span className="text-sm font-bold text-text-muted px-2">
                  Page {currentPage + 1}
                </span>
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={handleNextPage} 
                  disabled={!data?.lastDoc || isLoading}
                  className="flex-1 sm:flex-none"
                >
                  Next <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {selected && <CustomerDetailDialog customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
