import { useState } from 'react';
import { format } from 'date-fns';
import { Search, XCircle, Users, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { TableSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { Badge } from '@/shared/components/ui/Badge';
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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-rice-300">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-ink-900 font-sans">Customer Details</h2>
              <p className="text-ink-500 text-xs font-mono mt-1">{customer.id}</p>
            </div>
            <button onClick={onClose} className="text-ink-400 hover:text-ink-600 p-1">
              <XCircle size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm font-sans">
            <div className="bg-rice-50 rounded-lg p-3 col-span-2">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Profile</div>
              <div className="font-semibold text-ink-900">{customer.fullName}</div>
              <div className="text-ink-500 text-xs">{customer.phone}</div>
              <div className="text-ink-500 text-xs">{customer.email}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Joined</div>
              <div className="font-semibold text-ink-900">{formatDate(customer.createdAt)}</div>
            </div>
            <div className="bg-rice-50 rounded-lg p-3">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Account Status</div>
              <div className="font-semibold text-ink-900">
                <Badge tone={customer.isActive ? 'success' : 'danger'}>
                  {customer.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            
            <div className="bg-rice-50 rounded-lg p-3 col-span-2">
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-2">Saved Addresses ({addrList.length})</div>
              {addrList.length === 0 ? (
                <div className="text-ink-400 text-xs italic">No addresses saved.</div>
              ) : (
                <div className="space-y-3">
                  {addrList.map(addr => (
                    <div key={addr.id} className="text-sm">
                      <div className="font-semibold text-ink-800 flex items-center gap-2">
                        {addr.label}
                        {addr.id === defaultId && (
                          <span className="text-[9px] uppercase tracking-wider bg-turmeric-100 text-turmeric-800 px-1.5 py-0.5 rounded font-bold">Default</span>
                        )}
                      </div>
                      <div className="text-ink-600 text-xs mt-0.5">
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

// ── Customer Card (Mobile) ───────────────────────────────────────────────────


// ── Customer Row (Responsive) ───────────────────────────────────────────────────
function CustomerRowView({ customer, onSelect }: { customer: CustomerProfile; onSelect: () => void }) {
  const defaultAddress = customer.addresses?.find(a => a.id === customer.defaultAddressId) || customer.addresses?.[0];
  const locationText = defaultAddress 
    ? [defaultAddress.line1, defaultAddress.city].filter(Boolean).join(', ') 
    : 'No address';

  const initial = customer.fullName ? customer.fullName.charAt(0).toUpperCase() : '?';

  return (
    <tr
      className="block md:table-row bg-white hover:bg-rice-50/70 p-4 md:p-0 space-y-3 md:space-y-0 cursor-pointer transition-colors border-b border-rice-200 last:border-0 group"
      onClick={onSelect}
    >
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3 text-sm font-sans">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Customer</span>
        <div className="flex items-center gap-3 w-full md:w-auto justify-end md:justify-start">
          <div className="w-9 h-9 rounded-full bg-turmeric-100 text-turmeric-800 flex items-center justify-center font-bold text-sm shrink-0">
            {initial}
          </div>
          <div className="text-right md:text-left">
            <div className="font-semibold text-ink-900 group-hover:text-turmeric-700 transition-colors">
              {customer.fullName}
            </div>
            <div className="text-ink-400 text-[11px] font-mono truncate max-w-[140px] mt-0.5">{customer.id}</div>
          </div>
        </div>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3 text-sm font-sans text-ink-600">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Phone</span>
        {customer.phone}
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3 text-sm font-sans text-ink-600">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Email</span>
        {customer.email}
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3 text-sm font-sans">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Location</span>
        <div className="text-right md:text-left">
          <span className={defaultAddress ? "text-ink-700 line-clamp-1" : "text-ink-400 italic"}>
            {locationText}
          </span>
        </div>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3 text-ink-600 font-sans text-xs">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Joined Date</span>
        {formatDate(customer.createdAt)}
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Status</span>
        <Badge tone={customer.isActive ? 'success' : 'danger'} className="text-[10px] uppercase">
          {customer.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 pt-2 md:pt-0 md:px-4 md:py-3 text-right border-t border-rice-100 md:border-0 mt-2 md:mt-0">
        <span className="md:hidden font-semibold text-ink-500 text-[10px] uppercase tracking-wider">Action</span>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onSelect(); }} className="font-sans text-xs hover:bg-turmeric-50 hover:text-turmeric-700 w-full md:w-auto">
          View
        </Button>
      </td>
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
type StatusFilter = 'all' | 'active' | 'inactive';

const TABS: { label: string; value: StatusFilter; icon: React.ReactNode }[] = [
  { label: 'All Customers', value: 'all', icon: <Users size={14} /> },
  { label: 'Active', value: 'active', icon: <CheckCircle size={14} /> },
  { label: 'Inactive', value: 'inactive', icon: <XCircle size={14} /> },
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
        <PageHeader title="Customers" breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Customers' }]} />
        <ErrorState title="Could not load customers" description="We had trouble loading customer records." onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-ink-900">Customers</h1>
        <p className="text-ink-500 font-sans text-sm mt-1">
          View and manage customer profiles, addresses, and status.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 border-b border-rice-300 pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold font-sans rounded-t-lg transition-all ${
              activeTab === tab.value
                ? 'bg-white border border-b-white border-rice-300 text-ink-900 -mb-px'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Search by customer name, phone, email, or ID..."
          className="w-full pl-9 pr-4 py-2.5 border border-ink-400 rounded-lg text-sm font-sans text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-turmeric-400"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={40} className="text-ink-300" />}
          title="No customers found"
          description={search ? 'No customers match your search.' : `No ${activeTab === 'all' ? '' : activeTab} customers found on this page.`}
        />
      ) : (
          <Card className="border-rice-300 overflow-hidden p-0">
            <div className="overflow-x-auto md:overflow-visible">
              <table className="w-full text-left text-sm block md:table">
                <thead className="hidden md:table-header-group bg-rice-50 border-b border-rice-300 text-ink-500 text-xs font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Joined Date</th>
                    <th className="px-4 py-3">Account Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group divide-y divide-rice-100 bg-white">
                  {filtered.map((row) => (
                    <CustomerRowView key={row.id} customer={row} onSelect={() => setSelected(row)} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-rice-200 bg-rice-50/50 text-xs text-ink-500 font-sans flex items-center justify-between">
              <span>Showing {filtered.length} customer{filtered.length !== 1 ? 's' : ''} on this page</span>
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handlePrevPage} 
                  disabled={currentPage === 0 || isLoading}
                >
                  <ChevronLeft size={16} className="mr-1" /> Prev
                </Button>
                <span className="text-ink-700 font-medium font-data text-xs">Page {currentPage + 1}</span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleNextPage} 
                  disabled={!data?.lastDoc || isLoading}
                >
                  Next <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </div>
          </Card>
      )}

      {selected && <CustomerDetailDialog customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
