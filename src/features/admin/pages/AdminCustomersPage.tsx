import { useState } from 'react';
import { format } from 'date-fns';
import { Search, ChevronDown, XCircle, Users } from 'lucide-react';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { useAdminCustomers } from '../hooks/useAdmin';
import type { CustomerProfile } from '@/shared/types';

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
              <div className="text-ink-500 text-xs uppercase tracking-wider mb-1">Status</div>
              <div className="font-semibold text-ink-900">{customer.isActive ? 'Active' : 'Inactive'}</div>
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

// ── Row ───────────────────────────────────────────────────────────────────────
function CustomerRowView({ customer, onSelect }: { customer: CustomerProfile; onSelect: () => void }) {
  return (
    <tr
      className="hover:bg-rice-50/70 cursor-pointer transition-colors border-b border-rice-200 last:border-0"
      onClick={onSelect}
    >
      <td className="px-4 py-4 text-sm font-sans">
        <div className="font-semibold text-ink-900">{customer.fullName}</div>
        <div className="text-ink-400 text-xs font-mono truncate max-w-[140px]">{customer.id}</div>
      </td>
      <td className="px-4 py-4 text-sm font-sans text-ink-600">{customer.phone}</td>
      <td className="px-4 py-4 text-sm font-sans text-ink-600">{customer.email}</td>
      <td className="px-4 py-4 text-ink-600 font-sans text-xs">{formatDate(customer.createdAt)}</td>
      <td className="px-4 py-4 text-right">
        <Button variant="ghost" size="sm" onClick={onSelect} className="font-sans text-xs">
          View
        </Button>
      </td>
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export function AdminCustomersPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerProfile | null>(null);

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useAdminCustomers();

  const rows = (data?.pages.flatMap((p) => p.rows) as CustomerProfile[] ?? []).filter((row) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      row.fullName.toLowerCase().includes(q) ||
      row.phone.toLowerCase().includes(q) ||
      row.email.toLowerCase().includes(q) ||
      row.id.toLowerCase().includes(q)
    );
  });

  if (isLoading) return <LoadingScreen />;
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Customers" breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Customers' }]} />
        <ErrorState title="Could not load customers" description="We had trouble loading customer records." onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Customers' }]} />

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer name, phone, email, or ID..."
          className="w-full pl-9 pr-4 py-2.5 border border-ink-400 rounded-lg text-sm font-sans text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-turmeric-400"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users size={40} className="text-ink-300" />}
          title="No customers found"
          description={search ? 'No customers match your search.' : 'No customers at this time.'}
        />
      ) : (
        <Card className="border-rice-300 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-rice-50 border-b border-rice-300 text-ink-500 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Joined Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <CustomerRowView key={row.id} customer={row} onSelect={() => setSelected(row)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-rice-200 bg-rice-50/50 text-xs text-ink-500 font-sans flex items-center justify-between">
            <span>Showing {rows.length} customer{rows.length !== 1 ? 's' : ''}</span>
            {hasNextPage && (
              <Button variant="ghost" size="sm" onClick={() => fetchNextPage()} isLoading={isFetchingNextPage} className="gap-1 font-sans text-xs">
                Load more <ChevronDown size={14} />
              </Button>
            )}
          </div>
        </Card>
      )}

      {selected && <CustomerDetailDialog customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
