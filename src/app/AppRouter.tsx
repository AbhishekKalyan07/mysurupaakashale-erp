import { lazy, Suspense } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { RequireCompleteProfile } from '@/features/customer/components/RequireCompleteProfile';
import { AppShell } from '@/shared/components/layout/AppShell';
import { RouteErrorBoundary } from '@/shared/components/feedback/RouteErrorBoundary';
import { LoadingScreen } from '@/shared/components/feedback/LoadingScreen';
import { ROLES } from '@/shared/constants/roles';
import { RootRedirect } from './routes/RootRedirect';
import { NotFoundPage } from './routes/NotFoundPage';

// ── Lazy Loaded Pages ───────────────────────────────────────────────────────
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage').then(m => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('@/features/auth/pages/SignupPage').then(m => ({ default: m.SignupPage })));
const StaffManagementPage = lazy(() => import('@/features/admin/pages/StaffManagementPage').then(m => ({ default: m.StaffManagementPage })));
const BusinessSettingsPage = lazy(() => import('@/features/admin/pages/BusinessSettingsPage').then(m => ({ default: m.BusinessSettingsPage })));
const AuditLogsPage = lazy(() => import('@/features/admin/pages/AuditLogsPage').then(m => ({ default: m.AuditLogsPage })));
const PaymentVerificationPage = lazy(() => import('@/features/admin/pages/PaymentVerificationPage').then(m => ({ default: m.PaymentVerificationPage })));
const AdminCustomersPage = lazy(() => import('@/features/admin/pages/AdminCustomersPage').then(m => ({ default: m.AdminCustomersPage })));
const AdminSubscriptionsPage = lazy(() => import('@/features/admin/pages/AdminSubscriptionsPage').then(m => ({ default: m.AdminSubscriptionsPage })));
const AdminOrdersPage = lazy(() => import('@/features/admin/pages/AdminOrdersPage').then(m => ({ default: m.AdminOrdersPage })));
const AdminKitchenPage = lazy(() => import('@/features/admin/pages/AdminKitchenPage').then(m => ({ default: m.AdminKitchenPage })));
const AdminAccountsPage = lazy(() => import('@/features/admin/pages/AdminAccountsPage').then(m => ({ default: m.AdminAccountsPage })));
const AdminComplaintsPage = lazy(() => import('@/features/admin/pages/AdminComplaintsPage').then(m => ({ default: m.AdminComplaintsPage })));
const AdminZonesPage = lazy(() => import('@/features/admin/pages/AdminZonesPage').then(m => ({ default: m.AdminZonesPage })));
const NotificationCenter = lazy(() => import('@/features/notifications/pages/NotificationCenter').then(m => ({ default: m.NotificationCenter })));
const NotificationHistoryPage = lazy(() => import('@/features/notifications/pages/NotificationHistoryPage').then(m => ({ default: m.NotificationHistoryPage })));
const BusinessAnalyticsPage = lazy(() => import('@/features/analytics/pages/BusinessAnalyticsPage').then(m => ({ default: m.BusinessAnalyticsPage })));
const BrowsePlansPage = lazy(() => import('@/features/customer/pages/BrowsePlansPage').then(m => ({ default: m.BrowsePlansPage })));
const SubscriptionDetailsPage = lazy(() => import('@/features/customer/pages/SubscriptionDetailsPage').then(m => ({ default: m.SubscriptionDetailsPage })));
const SubscriptionWizardPage = lazy(() => import('@/features/customer/pages/SubscriptionWizardPage').then(m => ({ default: m.SubscriptionWizardPage })));
const PaymentHistoryPage = lazy(() => import('@/features/customer/pages/PaymentHistoryPage').then(m => ({ default: m.PaymentHistoryPage })));
const ProfilePage = lazy(() => import('@/features/customer/pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const CustomerDashboardPage = lazy(() => import('@/features/dashboard/pages/CustomerDashboardPage').then(m => ({ default: m.CustomerDashboardPage })));
const ProductionBoardPage = lazy(() => import('@/features/kitchen/pages/ProductionBoardPage').then(m => ({ default: m.ProductionBoardPage })));
const DailyMenuListPage = lazy(() => import('@/features/kitchen/pages/DailyMenuListPage').then(m => ({ default: m.DailyMenuListPage })));
const DailyMenuEditorPage = lazy(() => import('@/features/kitchen/pages/DailyMenuEditorPage').then(m => ({ default: m.DailyMenuEditorPage })));
const DeliveryDashboardPage = lazy(() => import('@/features/delivery/pages/DeliveryDashboardPage').then(m => ({ default: m.DeliveryDashboardPage })));
const DeliveryPartnerPage = lazy(() => import('@/features/delivery/pages/DeliveryPartnerPage').then(m => ({ default: m.DeliveryPartnerPage })));
const AttendanceDashboardPage = lazy(() => import('@/features/hr/pages/AttendanceDashboardPage').then(m => ({ default: m.AttendanceDashboardPage })));
const PayrollDashboardPage = lazy(() => import('@/features/hr/pages/PayrollDashboardPage').then(m => ({ default: m.PayrollDashboardPage })));
const UnifiedDashboardPage = lazy(() => import('@/features/dashboard/pages/UnifiedDashboardPage').then(m => ({ default: m.UnifiedDashboardPage })));
const TermsOfServicePage = lazy(() => import('@/features/auth/pages/TermsOfServicePage').then(m => ({ default: m.TermsOfServicePage })));
const PrivacyPolicyPage = lazy(() => import('@/features/auth/pages/PrivacyPolicyPage').then(m => ({ default: m.PrivacyPolicyPage })));

// Helper to wrap lazy components with Suspense
const withSuspense = (Component: React.LazyExoticComponent<any>) => (
  <Suspense fallback={<LoadingScreen />}>
    <Component />
  </Suspense>
);

const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouter(createBrowserRouter);

const router = sentryCreateBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: withSuspense(LoginPage) },
  { path: '/signup', element: withSuspense(SignupPage) },
  { path: '/terms', element: withSuspense(TermsOfServicePage) },
  { path: '/privacy', element: withSuspense(PrivacyPolicyPage) },
  {
    element: <ProtectedRoute />, // Any authenticated user
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          // ── Dashboard (Unified Entry) ──────────────────────────────────────────
          { path: '/dashboard', element: withSuspense(UnifiedDashboardPage) },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.ACCOUNTS]} />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: '/admin/payroll', element: withSuspense(PayrollDashboardPage) },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[ROLES.ADMIN]} />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          // ── Admin Sub-modules ────────────────────────────────────────────────
          { path: '/admin/customers', element: withSuspense(AdminCustomersPage) },
          { path: '/admin/subscriptions', element: withSuspense(AdminSubscriptionsPage) },
          { path: '/admin/orders', element: withSuspense(AdminOrdersPage) },
          { path: '/admin/kitchen', element: withSuspense(AdminKitchenPage) },
          { path: '/admin/delivery', element: withSuspense(DeliveryDashboardPage) },
          { path: '/admin/accounts', element: withSuspense(AdminAccountsPage) },
          { path: '/admin/complaints', element: withSuspense(AdminComplaintsPage) },
          { path: '/admin/analytics', element: withSuspense(BusinessAnalyticsPage) },
          { path: '/admin/staff', element: withSuspense(StaffManagementPage) },
          { path: '/admin/settings', element: withSuspense(BusinessSettingsPage) },
          { path: '/admin/zones', element: withSuspense(AdminZonesPage) },
          { path: '/admin/audit', element: withSuspense(AuditLogsPage) },
          { path: '/admin/menus', element: withSuspense(DailyMenuListPage) },
          { path: '/admin/menus/new', element: withSuspense(DailyMenuEditorPage) },
          { path: '/admin/menus/:id/edit', element: withSuspense(DailyMenuEditorPage) },
          { path: '/admin/payments', element: withSuspense(PaymentVerificationPage) },
          { path: '/admin/notifications', element: withSuspense(NotificationCenter) },
          { path: '/admin/notifications/history', element: withSuspense(NotificationHistoryPage) },
          { path: '/admin/attendance', element: withSuspense(AttendanceDashboardPage) },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[ROLES.CUSTOMER]} />,
    children: [
      {
        element: (
          <RequireCompleteProfile>
            <AppShell />
          </RequireCompleteProfile>
        ),
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: '/customer', element: withSuspense(CustomerDashboardPage) },
          { path: '/customer/plans', element: withSuspense(BrowsePlansPage) },
          { path: '/customer/subscription', element: withSuspense(SubscriptionDetailsPage) },
          { path: '/customer/subscribe', element: withSuspense(SubscriptionWizardPage) },
          { path: '/customer/payments', element: withSuspense(PaymentHistoryPage) },
          { path: '/customer/profile', element: withSuspense(ProfilePage) },
          // Customer notification center (same component, different route)
          { path: '/customer/notifications', element: withSuspense(NotificationCenter) },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[ROLES.KITCHEN]} />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: '/kitchen/production', element: withSuspense(ProductionBoardPage) },
          { path: '/kitchen/menus', element: withSuspense(DailyMenuListPage) },
          { path: '/kitchen/menus/new', element: withSuspense(DailyMenuEditorPage) },
          { path: '/kitchen/menus/:id/edit', element: withSuspense(DailyMenuEditorPage) },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[ROLES.DELIVERY_PARTNER]} />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: '/delivery', element: withSuspense(DeliveryPartnerPage) },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[ROLES.ACCOUNTS]} />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: '/accounts/analytics', element: withSuspense(BusinessAnalyticsPage) },
        ],
      },
    ],
  },
  // Rendered for truly unmatched paths. Wrong-role access to a route that
  // DOES exist is handled by ProtectedRoute's redirect, not this.
  { path: '*', element: <NotFoundPage /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
