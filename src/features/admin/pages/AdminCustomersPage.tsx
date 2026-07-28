import { useState } from 'react';
import { format } from 'date-fns';
import { Search, XCircle, Users, CheckCircle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { HeroBanner as PageHeader } from '@/shared/components/ui/HeroBanner';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { TableSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { useAdminCustomers } from '../hooks/useAdmin';
import type { CustomerProfile, UserProfile } from '@/shared/types';
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

// ── Detail Dialog ────────────────────────────────────────────────────────────
function CustomerDetailDialog({ customer, onClose }: { customer: CustomerProfile; onClose: () => void }) {
  const addrList = customer.addresses || [];
  const defaultId = customer.defaultAddressId;
  
  return (
    <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-primary/20">
        <div className="p-6 border-b border-primary/10 flex justify-between items-start bg-primary/5">
          <div>
            <h2 className="text-2xl font-bold text-primary font-display">Customer Details</h2>
            <p className="text-text-muted text-xs font-mono mt-1 bg-background-alt px-2 py-1 rounded inline-block border border-primary/10">{customer.id}</p>
          </div>
          <button onClick={onClose} className="text-primary hover:text-gold p-1 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
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
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Customer Row (Responsive) ───────────────────────────────────────────────────
function CustomerRowView({ customer, onSelect }: { customer: CustomerProfile; onSelect: () => void }) {
  const defaultAddress = customer.addresses?.find(a => a.id === customer.defaultAddressId) || customer.addresses?.[0];
  const locationText = defaultAddress 
    ? [defaultAddress.line1, defaultAddress.city].filter(Boolean).join(', ') 
    : 'No address';

  const initial = customer.fullName ? customer.fullName.charAt(0).toUpperCase() : '?';

  return (
    <tr
      className="block md:table-row bg-background md:bg-transparent hover:bg-primary/5 p-4 md:p-0 space-y-3 md:space-y-0 cursor-pointer transition-colors group"
      onClick={onSelect}
    >
      <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4 text-sm font-sans">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Customer</span>
        <div className="flex items-center gap-3 w-full md:w-auto justify-end md:justify-start">
          <div className="w-10 h-10 rounded-full bg-gold/20 text-gold flex items-center justify-center font-bold text-base shrink-0 border border-gold/30">
            {initial}
          </div>
          <div className="text-right md:text-left">
            <div className="font-bold text-primary group-hover:text-gold transition-colors text-base">
              {customer.fullName}
            </div>
            <div className="text-[10px] text-text-muted font-mono mt-1 bg-background-alt inline-block px-1.5 py-0.5 rounded border border-primary/5 truncate max-w-[140px]">{customer.id}</div>
          </div>
        </div>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4 text-sm font-sans font-medium text-primary">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Phone</span>
        {customer.phone}
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4 text-sm font-sans font-medium text-text-muted">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Email</span>
        {customer.email}
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4 text-sm font-sans">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Location</span>
        <div className="text-right md:text-left">
          <span className={defaultAddress ? "text-primary font-medium line-clamp-1" : "text-text-muted italic"}>
            {locationText}
          </span>
        </div>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4 text-text-muted font-sans text-xs">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Joined Date</span>
        <span className="bg-background-alt px-2 py-1 rounded border border-primary/5 inline-block text-primary font-medium">
          {formatDate(customer.createdAt)}
        </span>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-2 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Status</span>
        <Badge variant={customer.isActive ? 'success' : 'danger'} className="text-[10px] uppercase tracking-wider font-bold px-3 py-1">
          {customer.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 pt-3 md:pt-0 md:px-6 md:py-4 text-right border-t border-primary/10 md:border-0 mt-3 md:mt-0">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider">Action</span>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onSelect(); }} className="font-sans font-bold text-xs hover:bg-gold/10 hover:text-gold w-full md:w-auto">
          View
        </Button>
      </td>
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
type StatusFilter = 'all' | 'active' | 'inactive';

const TABS: { label: string; value: StatusFilter; icon: React.ReactNode }[] = [
  { label: 'All Customers', value: 'all', icon: <Users size={16} /> },
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
  const customers = data?.rows ?? [];

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
      row.id.toLowerCase().includes(q)
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
    <div className="space-y-8 pb-12">
      <PageHeader 
        userName="Customers"
        subtitle="View and manage customer profiles, addresses, and status."
      />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          {/* Tab bar */}
          <div className="flex gap-2 bg-primary/5 p-1 rounded-xl border border-primary/10 self-start">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold font-sans rounded-lg transition-all ${
                  activeTab === tab.value
                    ? 'bg-background shadow-sm text-gold border border-gold/20'
                    : 'text-text-muted hover:text-primary hover:bg-primary/5'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[300px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search customers..."
              className="w-full pl-11 pr-4 py-3 bg-background border border-primary/20 rounded-xl text-sm font-sans text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold shadow-sm transition-colors"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={48} className="text-primary/40" />}
            title="No customers found"
            description={search ? 'No customers match your search.' : `No ${activeTab === 'all' ? '' : activeTab} customers found on this page.`}
          />
        ) : (
            <Card className="p-0 overflow-hidden shadow-md border-primary/20">
              <div className="overflow-x-auto md:overflow-visible">
                <table className="w-full text-left text-sm block md:table font-sans">
                  <thead className="hidden md:table-header-group bg-primary/5 text-text-muted font-bold text-[10px] uppercase tracking-wider border-b border-primary/10">
                    <tr>
                      <th className="px-6 py-4">Customer</th>
                      <th className="px-6 py-4">Phone</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Location</th>
                      <th className="px-6 py-4">Joined Date</th>
                      <th className="px-6 py-4">Account Status</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="block md:table-row-group divide-y divide-primary/5 bg-background">
                    {filtered.map((row) => (
                      <CustomerRowView key={row.id} customer={row} onSelect={() => setSelected(row)} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 border-t border-primary/10 bg-primary/5 text-xs text-text-muted font-sans font-medium flex items-center justify-between">
                <span>Showing {filtered.length} customer{filtered.length !== 1 ? 's' : ''} on this page</span>
                <div className="flex items-center gap-4">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={handlePrevPage} 
                    disabled={currentPage === 0 || isLoading}
                    className="font-bold text-primary hover:text-gold hover:bg-gold/10"
                  >
                    <ChevronLeft size={16} className="mr-1" /> Prev
                  </Button>
                  <span className="text-primary font-bold font-data text-xs bg-background px-3 py-1.5 rounded-lg border border-primary/10 shadow-sm">Page {currentPage + 1}</span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={handleNextPage} 
                    disabled={!data?.lastDoc || isLoading}
                    className="font-bold text-primary hover:text-gold hover:bg-gold/10"
                  >
                    Next <ChevronRight size={16} className="ml-1" />
                  </Button>
                </div>
              </div>
            </Card>
        )}
      </div>

      {selected && <CustomerDetailDialog customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
