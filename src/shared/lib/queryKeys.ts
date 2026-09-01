/**
 * Centralized TanStack Query key factory. Every feature builds its query
 * keys through this file rather than hand-writing array literals — with
 * hand-written keys, a typo in one component silently breaks cache
 * invalidation elsewhere; with a factory, that's a compiler error instead.
 */
export const queryKeys = {
  auth: {
    profile: (uid: string) => ['auth', 'profile', uid] as const,
  },
  mealPlans: {
    all: ['mealPlans'] as const,
    detail: (id: string) => ['mealPlans', 'detail', id] as const,
  },
  subscriptions: {
    all: ['subscriptions'] as const,
    byCustomer: (customerId: string) => ['subscriptions', 'customer', customerId] as const,
    active: (customerId: string) => ['subscriptions', 'active', customerId] as const,
    detail: (id: string) => ['subscriptions', 'detail', id] as const,
    /** Admin paginated (useInfiniteQuery) list — keyed on status filter so each tab has its own cache. */
    adminList: (status: string) => ['subscriptions', 'admin', status] as const,
  },
  payments: {
    all: ['payments'] as const,
    byCustomer: (customerId: string) => ['payments', 'customer', customerId] as const,
    detail: (id: string) => ['payments', 'detail', id] as const,
    /** Admin paginated list — keyed on status filter so each tab has its own cache. */
    adminList: (status: string, page: number | string) => ['payments', 'admin', status, page] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    byRecipient: (recipientId: string) => ['notifications', 'recipient', recipientId] as const,
    unreadCount: (recipientId: string) => ['notifications', 'unread', recipientId] as const,
    adminHistory: (page: number) => ['notifications', 'admin', 'history', page] as const,
    detail: (id: string) => ['notifications', 'detail', id] as const,
  },
  kitchen: {
    base: ['kitchen'] as const,
    dayOrders: (date: string, kitchenId: string = 'all') => ['kitchen', 'orders', date, kitchenId] as const,
    dashboard: (date: string, kitchenId: string) => ['kitchen', 'dashboard', date, kitchenId] as const,
    dailyMenu: (date: string) => ['kitchen', 'dailyMenu', date] as const,
    dailyMenuList: ['kitchen', 'dailyMenus'] as const,
    dailyMenuDetail: (id: string) => ['kitchen', 'dailyMenus', 'detail', id] as const,
    mealTypeOrders: (date: string, mealType: string) =>
      ['kitchen', 'orders', date, mealType] as const,
  },
  delivery: {
    base: ['delivery'] as const,
    unassignedOrders: (date: string) => ['delivery', 'unassigned', date] as const,
    assignedOrders: (date: string) => ['delivery', 'assigned', date] as const,
    partnerOrders: (partnerId: string, date: string) => ['delivery', 'partner', partnerId, date] as const,
  },
  accounts: {
    base: ['accounts'] as const,
    payments: (start: string, end: string) => ['accounts', 'payments', start, end] as const,
    invoices: (start: string, end: string) => ['accounts', 'invoices', start, end] as const,
    orders: (start: string, end: string) => ['accounts', 'orders', start, end] as const,
  },
  users: {
    all: ['users'] as const,
  },
  settings: {
    business: ['settings', 'business'] as const,
  },
} as const;
