import type { ReactNode } from 'react';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { AppShell } from '@/shared/components/layout/AppShell';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import { AdminDashboardPage } from '@/features/dashboard/pages/AdminDashboardPage';
import { CustomerDashboardPage } from '@/features/dashboard/pages/CustomerDashboardPage';
import { KitchenDashboardPage } from '@/features/dashboard/pages/KitchenDashboardPage';
import { StaffManagementPage } from '@/features/admin/pages/StaffManagementPage';
import { BusinessSettingsPage } from '@/features/admin/pages/BusinessSettingsPage';
import { AuditLogsPage } from '@/features/admin/pages/AuditLogsPage';
import { PaymentVerificationPage } from '@/features/admin/pages/PaymentVerificationPage';
import { AdminCustomersPage } from '@/features/admin/pages/AdminCustomersPage';
import { AdminSubscriptionsPage } from '@/features/admin/pages/AdminSubscriptionsPage';
import { AdminOrdersPage } from '@/features/admin/pages/AdminOrdersPage';
import { AdminKitchenPage } from '@/features/admin/pages/AdminKitchenPage';
import { AdminAccountsPage } from '@/features/admin/pages/AdminAccountsPage';
import { NotificationCenter } from '@/features/notifications/pages/NotificationCenter';
import { NotificationHistoryPage } from '@/features/notifications/pages/NotificationHistoryPage';
import { AccountsDashboardPage } from '@/features/dashboard/pages/AccountsDashboardPage';
import { BusinessAnalyticsPage } from '@/features/analytics/pages/BusinessAnalyticsPage';
import { BrowsePlansPage } from '@/features/customer/pages/BrowsePlansPage';
import { SubscriptionDetailsPage } from '@/features/customer/pages/SubscriptionDetailsPage';
import { SubscriptionWizardPage } from '@/features/customer/pages/SubscriptionWizardPage';
import { PaymentHistoryPage } from '@/features/customer/pages/PaymentHistoryPage';
import { ProductionBoardPage } from '@/features/kitchen/pages/ProductionBoardPage';
import { DailyMenuListPage } from '@/features/kitchen/pages/DailyMenuListPage';
import { DailyMenuEditorPage } from '@/features/kitchen/pages/DailyMenuEditorPage';
import { DeliveryDashboardPage } from '@/features/delivery/pages/DeliveryDashboardPage';
import { DeliveryPartnerPage } from '@/features/delivery/pages/DeliveryPartnerPage';
import { AttendanceDashboardPage } from '@/features/hr/pages/AttendanceDashboardPage';
import { PayrollDashboardPage } from '@/features/hr/pages/PayrollDashboardPage';
import { ROLES, type Role } from '@/shared/constants/roles';
import { RootRedirect } from './routes/RootRedirect';
import { NotFoundPage } from './routes/NotFoundPage';

/** One role's guarded, shelled route — used 5 times below instead of repeating the same 3-level nesting by hand. */
function roleRoute(role: Role, path: string, element: ReactNode): RouteObject {
  return {
    element: <ProtectedRoute allowedRoles={[role]} />,
    children: [{ element: <AppShell />, children: [{ path, element }] }],
  };
}

const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  {
    element: <ProtectedRoute allowedRoles={[ROLES.ADMIN]} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/admin', element: <AdminDashboardPage /> },
          { path: '/admin/customers', element: <AdminCustomersPage /> },
          { path: '/admin/subscriptions', element: <AdminSubscriptionsPage /> },
          { path: '/admin/orders', element: <AdminOrdersPage /> },
          { path: '/admin/kitchen', element: <AdminKitchenPage /> },
          { path: '/admin/delivery', element: <DeliveryDashboardPage /> },
          { path: '/admin/accounts', element: <AdminAccountsPage /> },
          { path: '/admin/analytics', element: <BusinessAnalyticsPage /> },
          { path: '/admin/staff', element: <StaffManagementPage /> },
          
          // ── Sub-module Routes ────────────────────────────────────────────────
          { path: '/admin/settings', element: <BusinessSettingsPage /> },
          { path: '/admin/audit', element: <AuditLogsPage /> },
          { path: '/admin/menus', element: <DailyMenuListPage /> },
          { path: '/admin/menus/new', element: <DailyMenuEditorPage /> },
          { path: '/admin/menus/:id/edit', element: <DailyMenuEditorPage /> },
          { path: '/admin/payments', element: <PaymentVerificationPage /> },
          { path: '/admin/notifications', element: <NotificationCenter /> },
          { path: '/admin/notifications/history', element: <NotificationHistoryPage /> },
          { path: '/admin/attendance', element: <AttendanceDashboardPage /> },
          { path: '/admin/payroll', element: <PayrollDashboardPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[ROLES.CUSTOMER]} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/customer', element: <CustomerDashboardPage /> },
          { path: '/customer/plans', element: <BrowsePlansPage /> },
          { path: '/customer/subscription', element: <SubscriptionDetailsPage /> },
          { path: '/customer/subscribe', element: <SubscriptionWizardPage /> },
          { path: '/customer/payments', element: <PaymentHistoryPage /> },
          // Customer notification center (same component, different route)
          { path: '/customer/notifications', element: <NotificationCenter /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[ROLES.KITCHEN]} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/kitchen', element: <KitchenDashboardPage /> },
          { path: '/kitchen/production', element: <ProductionBoardPage /> },
          { path: '/kitchen/menus', element: <DailyMenuListPage /> },
          { path: '/kitchen/menus/new', element: <DailyMenuEditorPage /> },
          { path: '/kitchen/menus/:id/edit', element: <DailyMenuEditorPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[ROLES.DELIVERY_PARTNER]} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/delivery', element: <DeliveryPartnerPage /> },
        ],
      },
    ],
  },
  roleRoute(ROLES.ACCOUNTS, '/accounts', <AccountsDashboardPage />),
  roleRoute(ROLES.ACCOUNTS, '/accounts/analytics', <BusinessAnalyticsPage />),
  // Rendered for truly unmatched paths. Wrong-role access to a route that
  // DOES exist is handled by ProtectedRoute's redirect, not this.
  { path: '*', element: <NotFoundPage /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
