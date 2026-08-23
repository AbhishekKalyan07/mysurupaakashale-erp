import { LayoutDashboard, Compass, ReceiptText, CreditCard, ChefHat, Truck, TrendingUp, Users, Package, Settings, BookOpen, Activity, UserCheck, Map, type LucideIcon } from 'lucide-react';
import { ROLES, type Role } from '@/shared/constants/roles';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export interface NavGroup {
  groupLabel?: string;
  items: NavItem[];
}

export const NAV_ITEMS_BY_ROLE: Record<Role, NavGroup[]> = {
  [ROLES.ADMIN]: [
    {
      items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }],
    },
    {
      groupLabel: 'CRM',
      items: [
        { label: 'Customers', to: '/admin/customers', icon: Users },
        { label: 'Subscriptions', to: '/admin/subscriptions', icon: Compass },
      ],
    },
    {
      groupLabel: 'Operations',
      items: [
        { label: 'Orders', to: '/admin/orders', icon: Package },
        { label: 'Kitchen', to: '/admin/kitchen', icon: ChefHat },
        { label: 'Delivery', to: '/admin/delivery', icon: Truck },
      ],
    },
    {
      groupLabel: 'Finance & HR',
      items: [
        { label: 'Accounts', to: '/admin/accounts', icon: ReceiptText },
        { label: 'Payroll', to: '/admin/payroll', icon: CreditCard },
        { label: 'Staff', to: '/admin/staff', icon: Users },
      ],
    },
    {
      groupLabel: 'System',
      items: [
        { label: 'Analytics', to: '/admin/analytics', icon: TrendingUp },
        { label: 'Zones', to: '/admin/zones', icon: Map },
        { label: 'Settings', to: '/admin/settings', icon: Settings },
      ],
    },
  ],
  [ROLES.CUSTOMER]: [
    {
      items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }],
    },
    {
      groupLabel: 'Meal Plans',
      items: [
        { label: 'Browse Plans', to: '/customer/plans', icon: Compass },
        { label: 'My Subscription', to: '/customer/subscription', icon: ReceiptText },
        { label: 'Order History', to: '/customer/orders', icon: Package },
      ],
    },
    {
      groupLabel: 'Account',
      items: [
        { label: 'My Profile', to: '/customer/profile', icon: UserCheck },
        { label: 'Billing & Payments', to: '/customer/payments', icon: CreditCard },
        { label: 'Notifications', to: '/customer/notifications', icon: Activity },
      ],
    }
  ],
  [ROLES.KITCHEN]: [
    {
      items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }],
    },
    {
      groupLabel: 'Kitchen',
      items: [
        { label: 'Production Board', to: '/kitchen/production', icon: ChefHat },
        { label: 'Daily Menus', to: '/kitchen/menus', icon: BookOpen },
      ],
    },
  ],
  [ROLES.DELIVERY_PARTNER]: [
    {
      items: [
        { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
        { label: 'My Route', to: '/delivery', icon: Truck }
      ],
    }
  ],
  [ROLES.ACCOUNTS]: [
    {
      items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }],
    },
    {
      groupLabel: 'Finance',
      items: [
        { label: 'Business Analytics', to: '/accounts/analytics', icon: TrendingUp },
        { label: 'Payroll', to: '/admin/payroll', icon: ReceiptText },
      ],
    }
  ],
};

