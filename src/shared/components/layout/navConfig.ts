import { LayoutDashboard, Compass, ReceiptText, CreditCard, ChefHat, CalendarDays, Truck, TrendingUp, type LucideIcon } from 'lucide-react';
import { ROLES, type Role } from '@/shared/constants/roles';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

/**
 * Every role currently has exactly one working page: its dashboard. Add
 * to a role's array only when that page actually ships — an empty-looking
 * sidebar is honest; a link to an unbuilt page isn't.
 */
export const NAV_ITEMS_BY_ROLE: Record<Role, NavItem[]> = {
  [ROLES.ADMIN]: [
    { label: 'Dashboard', to: '/admin', icon: LayoutDashboard },
    { label: 'Business Analytics', to: '/admin/analytics', icon: TrendingUp },
    { label: 'Daily Menus', to: '/admin/menus', icon: CalendarDays },
    { label: 'Dispatch Center', to: '/admin/delivery', icon: Truck },
    { label: 'Attendance', to: '/admin/attendance', icon: CalendarDays },
    { label: 'Payroll', to: '/admin/payroll', icon: ReceiptText },
  ],
  [ROLES.CUSTOMER]: [
    { label: 'Dashboard', to: '/customer', icon: LayoutDashboard },
    { label: 'Browse Plans', to: '/customer/plans', icon: Compass },
    { label: 'My Subscription', to: '/customer/subscription', icon: ReceiptText },
    { label: 'Billing & Payments', to: '/customer/payments', icon: CreditCard },
  ],
  [ROLES.KITCHEN]: [
    { label: 'Dashboard', to: '/kitchen', icon: LayoutDashboard },
    { label: 'Production Board', to: '/kitchen/production', icon: ChefHat },
    { label: 'Daily Menus', to: '/kitchen/menus', icon: CalendarDays },
  ],
  [ROLES.DELIVERY_PARTNER]: [{ label: 'My Route', to: '/delivery', icon: Truck }],
  [ROLES.ACCOUNTS]: [
    { label: 'Dashboard', to: '/accounts', icon: LayoutDashboard },
    { label: 'Business Analytics', to: '/accounts/analytics', icon: TrendingUp },
    { label: 'Payroll', to: '/admin/payroll', icon: ReceiptText },
  ],
};

