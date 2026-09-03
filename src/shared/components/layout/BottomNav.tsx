import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ChefHat,
  Truck,
  MoreHorizontal,
  Users,
  BarChart3,
  Settings,
  CreditCard,
  ClipboardList,
  UserCheck,
  X,
  Receipt,
  CalendarX,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { Role } from '@/shared/constants/roles';
import { ROLES } from '@/shared/constants/roles';

interface BottomNavTab {
  label: string;
  to: string;
  icon: React.ElementType;
  activeIcon?: React.ElementType;
}

interface MoreMenuItem {
  label: string;
  to: string;
  icon: React.ElementType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Role-specific Bottom Tabs (max 4 + More)
// ─────────────────────────────────────────────────────────────────────────────

const BOTTOM_TABS_BY_ROLE: Record<Role, BottomNavTab[]> = {
  [ROLES.ADMIN]: [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'Orders',    to: '/admin/orders', icon: Package },
    { label: 'Kitchen',   to: '/admin/kitchen', icon: ChefHat },
    { label: 'Delivery',  to: '/admin/delivery', icon: Truck },
  ],
  [ROLES.KITCHEN]: [
    { label: 'Dashboard',   to: '/dashboard', icon: LayoutDashboard },
    { label: 'Production',  to: '/kitchen/production', icon: ChefHat },
    { label: 'Menus',       to: '/kitchen/menus', icon: ClipboardList },
  ],
  [ROLES.DELIVERY_PARTNER]: [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'My Route',  to: '/delivery', icon: Truck },
  ],
  [ROLES.CUSTOMER]: [
    { label: 'Home',         to: '/dashboard', icon: LayoutDashboard },
    { label: 'Plans',        to: '/customer/plans', icon: Package },
    { label: 'Subscription', to: '/customer/subscription', icon: Receipt },
    { label: 'Profile',      to: '/customer/profile', icon: UserCheck },
  ],
  [ROLES.ACCOUNTS]: [
    { label: 'Dashboard',  to: '/dashboard', icon: LayoutDashboard },
    { label: 'Accounts',   to: '/accounts/overview', icon: Receipt },
    { label: 'Analytics',  to: '/accounts/analytics', icon: BarChart3 },
  ],
};

// "More" menu items by role
const MORE_ITEMS_BY_ROLE: Record<Role, MoreMenuItem[]> = {
  [ROLES.ADMIN]: [
    { label: 'Customers',   to: '/admin/customers',     icon: Users },
    { label: 'Subscriptions', to: '/admin/subscriptions', icon: ClipboardList },
    { label: 'Staff',       to: '/admin/staff',         icon: UserCheck },
    { label: 'Holidays',    to: '/admin/holidays',      icon: CalendarX },
    { label: 'Accounts',    to: '/admin/accounts',      icon: CreditCard },
    { label: 'Analytics',   to: '/admin/analytics',     icon: BarChart3 },
    { label: 'Complaints',  to: '/admin/complaints',    icon: Receipt },
    { label: 'Audit Logs',  to: '/admin/audit',         icon: ClipboardList },
    { label: 'Settings',    to: '/admin/settings',      icon: Settings },
  ],
  [ROLES.KITCHEN]: [
    { label: 'Settings', to: '/admin/settings', icon: Settings },
  ],
  [ROLES.DELIVERY_PARTNER]: [],
  [ROLES.CUSTOMER]: [
    { label: 'Order History', to: '/customer/orders', icon: Package },
  ],
  [ROLES.ACCOUNTS]: [
    { label: 'Payroll',  to: '/admin/payroll',   icon: CreditCard },
    { label: 'Settings', to: '/admin/settings',  icon: Settings },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// BottomNav
// ─────────────────────────────────────────────────────────────────────────────

interface BottomNavProps {
  role: Role;
}

export function BottomNav({ role }: BottomNavProps) {
  const [showMore, setShowMore] = useState(false);
  const navigate = useNavigate();

  const tabs = BOTTOM_TABS_BY_ROLE[role] ?? [];
  const moreItems = MORE_ITEMS_BY_ROLE[role] ?? [];
  const hasMore = moreItems.length > 0;

  return (
    <>
      {/* More Drawer & Backdrop (rendered ONLY if role has more menu items) */}
      {hasMore && (
        <>
          <div
            className={cn(
              'fixed inset-0 z-40 bg-primary/40 backdrop-blur-sm lg:hidden transition-all duration-300',
              showMore ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none invisible'
            )}
            onClick={() => setShowMore(false)}
          />

          <div
            className={cn(
              'fixed bottom-[60px] left-0 right-0 z-50 bg-card rounded-t-[24px] border-t border-border shadow-xl lg:hidden transition-all duration-300 ease-in-out',
              showMore ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-full opacity-0 pointer-events-none invisible'
            )}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="font-display font-bold text-base text-text">More</h2>
              <button
                aria-label="Close menu"
                onClick={() => setShowMore(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-muted hover:bg-surface-3 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-4 pb-4 grid grid-cols-3 gap-2">
              {moreItems.map((item) => (
                <button
                  aria-label={item.label}
                  key={item.to}
                  onClick={() => { navigate(item.to); setShowMore(false); }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-[16px] bg-surface-2 hover:bg-pastel-lavender hover:text-secondary transition-colors group"
                >
                  <item.icon size={22} className="text-text-muted group-hover:text-secondary transition-colors" />
                  <span className="text-xs font-semibold text-text-muted group-hover:text-secondary transition-colors leading-tight text-center">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
            {/* Safe area */}
            <div className="h-safe" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
          </div>
        </>
      )}

      {/* Bottom Tab Bar */}
      <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-card/95 backdrop-blur-md border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch h-[60px]">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/dashboard'}
              className={({ isActive }) => cn(
                'flex flex-col items-center justify-center flex-1 gap-0.5 px-1 pt-2 pb-1 transition-colors relative',
                isActive ? 'text-primary' : 'text-text-muted'
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div
                      className="absolute -bottom-[1px] left-1/2 -translate-x-1/2 w-10 h-1 rounded-t-full bg-gold animate-in fade-in"
                    />
                  )}
                  <tab.icon
                    size={24}
                    strokeWidth={isActive ? 2.5 : 1.8}
                    fill={isActive ? 'currentColor' : 'none'}
                    className={cn('transition-colors mb-0.5', isActive ? 'text-primary' : 'text-text-muted')}
                  />
                  <span className={cn(
                    'font-bold leading-tight transition-colors',
                    isActive ? 'text-primary text-[11px]' : 'text-text-muted text-[10px]'
                  )}>
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* More Tab */}
          {hasMore && (
            <button aria-label="Button action"
              onClick={() => setShowMore(!showMore)}
              className={cn(
                'flex flex-col items-center justify-center flex-1 gap-0.5 px-1 pt-2 pb-1 transition-colors relative',
                showMore ? 'text-primary' : 'text-text-muted'
              )}
            >
              {showMore && (
                <div
                  className="absolute -bottom-[1px] left-1/2 -translate-x-1/2 w-10 h-1 rounded-t-full bg-gold animate-in fade-in"
                />
              )}
              <MoreHorizontal size={24} strokeWidth={showMore ? 2.5 : 1.8} fill={showMore ? 'currentColor' : 'none'} className="mb-0.5" />
              <span className={cn(
                'font-bold leading-tight transition-colors',
                showMore ? 'text-[11px]' : 'text-[10px]'
              )}>More</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
