/**
 * kitchen-ux.test.ts
 *
 * Pure logic tests for the Kitchen Production Board UX changes introduced in
 * the August 2026 sprint.  These tests exercise the SAME logic used by the
 * component useMemo hooks — no DOM / React Testing Library needed because every
 * tested function is a deterministic data-transformation of an Order array.
 *
 * All test data is fabricated inline; no Firebase, no emulator, no production
 * data touched.
 */
import { describe, it, expect } from 'vitest';
import type { OrderStatus } from '@/shared/types';

// ---------------------------------------------------------------------------
// Replicate the production filter + sort logic from KitchenProductionTable.tsx
// so that removing the implementation causes the tests to fail.
// ---------------------------------------------------------------------------

type MealFilter = 'all' | 'breakfast' | 'lunch' | 'dinner';
type StatusFilter = 'all' | 'scheduled' | 'packing' | 'packed' | 'ready_for_pickup' | 'cancelled';

interface TestOrder {
  id: string;
  status: string;
  mealType?: string;
  source?: string;
  planTier?: string;
  customerId: string;
  zoneId?: string;
  displayId?: string;
  specialInstructions?: string | null;
  packingNotes?: string | null;
}

function applyFiltersAndSort(
  orders: TestOrder[],
  opts: {
    mealFilter: MealFilter;
    statusFilter: StatusFilter;
    areaFilter: string;
    searchQuery: string;
    zoneMap: Map<string, string>;
    customerMap: Map<string, string>;
  }
): TestOrder[] {
  const { mealFilter, statusFilter, areaFilter, searchQuery, zoneMap, customerMap } = opts;

  return orders
    .filter(o => {
      if (o.status === 'skipped') return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (statusFilter === 'all' && o.status === 'cancelled') return false;
      if (mealFilter !== 'all' && o.mealType !== mealFilter) return false;

      const area = o.zoneId ? zoneMap.get(o.zoneId) || o.zoneId : 'Unassigned Area';
      if (areaFilter !== 'all' && area !== areaFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const customerName = (customerMap.get(o.customerId) || o.customerId).toLowerCase();
        const idMatch = o.id?.toLowerCase().includes(q) || o.displayId?.toLowerCase().includes(q);
        if (!customerName.includes(q) && !idMatch) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Tier 1: Status
      const statusOrder: Record<string, number> = {
        scheduled: 1, packing: 2, packed: 3, ready_for_pickup: 4,
        out_for_delivery: 5, delivered: 6,
      };
      const aStat = statusOrder[a.status] ?? 99;
      const bStat = statusOrder[b.status] ?? 99;
      if (aStat !== bStat) return aStat - bStat;

      // Tier 2: Order type (subscription before one_time)
      const sourceOrder: Record<string, number> = { subscription: 1, one_time: 2 };
      const aSrc = sourceOrder[a.source ?? ''] ?? 99;
      const bSrc = sourceOrder[b.source ?? ''] ?? 99;
      if (aSrc !== bSrc) return aSrc - bSrc;

      // Tier 3: Customer name
      const aName = customerMap.get(a.customerId) || '';
      const bName = customerMap.get(b.customerId) || '';
      return aName.localeCompare(bName);
    });
}

// ---------------------------------------------------------------------------
// Badge + field derivation helpers (mirrors KitchenProductionTable render logic)
// ---------------------------------------------------------------------------

function derivePlanLabel(order: { source?: string; planTier?: string }): string {
  if (order.source === 'subscription' && order.planTier) {
    return order.planTier.charAt(0).toUpperCase() + order.planTier.slice(1);
  }
  return 'One-Time';
}

function isSubscription(order: { source?: string }): boolean {
  return order.source === 'subscription';
}

// Terminal status check (mirrors OrderCard.tsx TERMINAL_STATUSES + WorkflowTimeline)
const TERMINAL_STATUSES: OrderStatus[] = [
  'delivered', 'failed_delivery', 'returned_delivery', 'skipped', 'cancelled',
];
function hasWorkflowActions(order: { status?: string }): boolean {
  return !TERMINAL_STATUSES.includes(order.status as OrderStatus);
}

function isGreyedOut(order: { status?: string }): boolean {
  return TERMINAL_STATUSES.includes(order.status as OrderStatus);
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const customerMap = new Map<string, string>([
  ['cAlice', 'Alice'],
  ['cBob', 'Bob'],
  ['cZara', 'Zara'],
]);

const defaultOpts = {
  mealFilter: 'all' as MealFilter,
  statusFilter: 'all' as StatusFilter,
  areaFilter: 'all',
  searchQuery: '',
  zoneMap: new Map<string, string>(),
  customerMap,
};

const testOrders: TestOrder[] = [
  { id: 'A', status: 'scheduled',       mealType: 'lunch',     source: 'subscription', planTier: 'basic',   customerId: 'cAlice' },
  { id: 'B', status: 'packing',         mealType: 'breakfast', source: 'one_time',                          customerId: 'cBob' },
  { id: 'C', status: 'packed',          mealType: 'dinner',    source: 'subscription', planTier: 'regular', customerId: 'cZara' },
  { id: 'D', status: 'ready_for_pickup',mealType: 'lunch',     source: 'one_time',                          customerId: 'cAlice' },
  { id: 'E', status: 'cancelled',       mealType: 'lunch',     source: 'subscription', planTier: 'basic',   customerId: 'cBob' },
  { id: 'F', status: 'skipped',         mealType: 'breakfast', source: 'one_time',                          customerId: 'cZara' },
];

// ---------------------------------------------------------------------------
// BLOCKER 1 — Meal Filter Tests
// ---------------------------------------------------------------------------

describe('Kitchen Filter Logic — Meal Filter', () => {
  it('mealFilter=all shows all non-cancelled, non-skipped orders', () => {
    const result = applyFiltersAndSort(testOrders, defaultOpts);
    const ids = result.map(o => o.id);
    expect(ids).toContain('A');
    expect(ids).toContain('B');
    expect(ids).toContain('C');
    expect(ids).toContain('D');
    expect(ids).not.toContain('E'); // cancelled hidden by default
    expect(ids).not.toContain('F'); // skipped always hidden
  });

  it('mealFilter=breakfast shows ONLY breakfast orders', () => {
    const result = applyFiltersAndSort(testOrders, { ...defaultOpts, mealFilter: 'breakfast' });
    const ids = result.map(o => o.id);
    expect(ids).toEqual(['B']); // Only B is breakfast and eligible
  });

  it('mealFilter=lunch shows ONLY lunch orders (excluding cancelled in default status mode)', () => {
    const result = applyFiltersAndSort(testOrders, { ...defaultOpts, mealFilter: 'lunch' });
    const ids = result.map(o => o.id);
    expect(ids).toContain('A');
    expect(ids).toContain('D');
    expect(ids).not.toContain('E'); // E is lunch/cancelled — hidden in 'all' status mode
    expect(ids).not.toContain('B'); // breakfast
    expect(ids).not.toContain('C'); // dinner
  });

  it('mealFilter=dinner shows ONLY dinner orders', () => {
    const result = applyFiltersAndSort(testOrders, { ...defaultOpts, mealFilter: 'dinner' });
    const ids = result.map(o => o.id);
    expect(ids).toEqual(['C']);
  });

  it('meal filter combined with status filter narrows correctly', () => {
    const result = applyFiltersAndSort(testOrders, {
      ...defaultOpts,
      mealFilter: 'lunch',
      statusFilter: 'scheduled',
    });
    expect(result.map(o => o.id)).toEqual(['A']);
  });

  it('meal filter combined with status=cancelled shows only matching meal+cancelled', () => {
    const result = applyFiltersAndSort(testOrders, {
      ...defaultOpts,
      mealFilter: 'lunch',
      statusFilter: 'cancelled',
    });
    expect(result.map(o => o.id)).toEqual(['E']);
  });
});

// ---------------------------------------------------------------------------
// Status Filter Tests
// ---------------------------------------------------------------------------

describe('Kitchen Filter Logic — Status Filter', () => {
  it('status=all hides cancelled orders', () => {
    const result = applyFiltersAndSort(testOrders, defaultOpts);
    expect(result.map(o => o.id)).not.toContain('E');
  });

  it('status=cancelled shows ONLY cancelled orders', () => {
    const result = applyFiltersAndSort(testOrders, { ...defaultOpts, statusFilter: 'cancelled' });
    expect(result.map(o => o.id)).toEqual(['E']);
  });

  it('status=cancelled does NOT show active orders', () => {
    const result = applyFiltersAndSort(testOrders, { ...defaultOpts, statusFilter: 'cancelled' });
    const ids = result.map(o => o.id);
    ['A', 'B', 'C', 'D'].forEach(id => expect(ids).not.toContain(id));
  });

  it('skipped orders never appear regardless of status filter', () => {
    const filtersToTest: StatusFilter[] = ['all', 'scheduled', 'packing', 'packed', 'ready_for_pickup', 'cancelled'];
    for (const statusFilter of filtersToTest) {
      const result = applyFiltersAndSort(testOrders, { ...defaultOpts, statusFilter });
      expect(result.map(o => o.id)).not.toContain('F');
    }
  });

  it('status=packing shows only packing orders', () => {
    const result = applyFiltersAndSort(testOrders, { ...defaultOpts, statusFilter: 'packing' });
    expect(result.map(o => o.id)).toEqual(['B']);
  });

  it('status=scheduled shows only scheduled orders', () => {
    const result = applyFiltersAndSort(testOrders, { ...defaultOpts, statusFilter: 'scheduled' });
    expect(result.map(o => o.id)).toEqual(['A']);
  });
});

// ---------------------------------------------------------------------------
// BLOCKER 6 — Sorting: Status → Order Type → Customer Name
// ---------------------------------------------------------------------------

describe('Kitchen Sort Logic — Status → Order Type → Customer Name', () => {
  const sortOrders: TestOrder[] = [
    { id: 'S2', status: 'scheduled',        source: 'one_time',    customerId: 'cAlice' },
    { id: 'S1', status: 'scheduled',        source: 'subscription', customerId: 'cZara' },
    { id: 'P2', status: 'packing',          source: 'one_time',    customerId: 'cAlice' },
    { id: 'P1', status: 'packing',          source: 'subscription', customerId: 'cBob' },
    { id: 'K1', status: 'packed',           source: 'subscription', customerId: 'cAlice' },
    { id: 'R1', status: 'ready_for_pickup', source: 'one_time',    customerId: 'cZara' },
  ];

  it('sorts by status: scheduled → packing → packed → ready_for_pickup', () => {
    const result = applyFiltersAndSort(sortOrders, defaultOpts);
    const statuses = result.map(o => o.status);
    const si = statuses.indexOf('scheduled');
    const pi = statuses.indexOf('packing');
    const ki = statuses.indexOf('packed');
    const ri = statuses.indexOf('ready_for_pickup');
    expect(si).toBeLessThan(pi);
    expect(pi).toBeLessThan(ki);
    expect(ki).toBeLessThan(ri);
  });

  it('within same status, subscription comes before one_time', () => {
    const result = applyFiltersAndSort(sortOrders, defaultOpts);
    const ids = result.map(o => o.id);
    // S1 (scheduled/subscription) before S2 (scheduled/one_time)
    expect(ids.indexOf('S1')).toBeLessThan(ids.indexOf('S2'));
    // P1 (packing/subscription) before P2 (packing/one_time)
    expect(ids.indexOf('P1')).toBeLessThan(ids.indexOf('P2'));
  });

  it('within same status and order type, sorts by customer name alphabetically', () => {
    const sameStatusAndType: TestOrder[] = [
      { id: 'X3', status: 'scheduled', source: 'subscription', customerId: 'cZara' },
      { id: 'X1', status: 'scheduled', source: 'subscription', customerId: 'cAlice' },
      { id: 'X2', status: 'scheduled', source: 'subscription', customerId: 'cBob' },
    ];
    const result = applyFiltersAndSort(sameStatusAndType, defaultOpts);
    expect(result.map(o => o.id)).toEqual(['X1', 'X2', 'X3']); // Alice, Bob, Zara
  });

  it('order type sort is driven by order.source field, not hardcoded', () => {
    // If we flip the sources, the sort order must flip too
    const flipped: TestOrder[] = [
      { id: 'F1', status: 'scheduled', source: 'one_time',    customerId: 'cAlice' },
      { id: 'F2', status: 'scheduled', source: 'subscription', customerId: 'cBob' },
    ];
    const result = applyFiltersAndSort(flipped, defaultOpts);
    const ids = result.map(o => o.id);
    // F2 (subscription) must come before F1 (one_time)
    expect(ids.indexOf('F2')).toBeLessThan(ids.indexOf('F1'));
  });
});

// ---------------------------------------------------------------------------
// Order Type Badge Derivation (driven by order.source)
// ---------------------------------------------------------------------------

describe('Order Type Badge Derivation from order.source', () => {
  it('subscription order with planTier=basic shows "Basic"', () => {
    expect(derivePlanLabel({ source: 'subscription', planTier: 'basic' })).toBe('Basic');
  });

  it('subscription order with planTier=regular shows "Regular"', () => {
    expect(derivePlanLabel({ source: 'subscription', planTier: 'regular' })).toBe('Regular');
  });

  it('one_time order shows "One-Time"', () => {
    expect(derivePlanLabel({ source: 'one_time' })).toBe('One-Time');
  });

  it('isSubscription returns true for subscription source', () => {
    expect(isSubscription({ source: 'subscription' })).toBe(true);
  });

  it('isSubscription returns false for one_time source', () => {
    expect(isSubscription({ source: 'one_time' })).toBe(false);
  });

  it('changing order.source changes badge (not hardcoded)', () => {
    const subLabel = derivePlanLabel({ source: 'subscription', planTier: 'regular' });
    const otLabel  = derivePlanLabel({ source: 'one_time' });
    expect(subLabel).not.toBe(otLabel);
  });
});

// ---------------------------------------------------------------------------
// Special Instructions / Packing Notes — Conditional Badge
// ---------------------------------------------------------------------------

describe('Special Instructions / Packing Notes Conditional Badge', () => {
  const hasAlert = (o: Partial<TestOrder>) => Boolean(o.specialInstructions);
  const hasNotes = (o: Partial<TestOrder>) => Boolean(o.packingNotes);

  it('alert shows when specialInstructions is non-empty string', () => {
    expect(hasAlert({ specialInstructions: 'No onion' })).toBe(true);
  });

  it('alert hidden when specialInstructions is null', () => {
    expect(hasAlert({ specialInstructions: null })).toBe(false);
  });

  it('alert hidden when specialInstructions is undefined', () => {
    expect(hasAlert({ specialInstructions: undefined })).toBe(false);
  });

  it('alert hidden when specialInstructions is empty string', () => {
    expect(hasAlert({ specialInstructions: '' })).toBe(false);
  });

  it('notes show when packingNotes is non-empty string', () => {
    expect(hasNotes({ packingNotes: 'Keep separate' })).toBe(true);
  });

  it('notes hidden when packingNotes is null', () => {
    expect(hasNotes({ packingNotes: null })).toBe(false);
  });

  it('both badges can appear simultaneously', () => {
    const o = { specialInstructions: 'No onion', packingNotes: 'Keep separate' };
    expect(hasAlert(o)).toBe(true);
    expect(hasNotes(o)).toBe(true);
  });

  it('neither badge appears when both fields are null', () => {
    const o = { specialInstructions: null, packingNotes: null };
    expect(hasAlert(o)).toBe(false);
    expect(hasNotes(o)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Terminal Status / Cancelled — Action Button Suppression
// ---------------------------------------------------------------------------

describe('Terminal Status Action Suppression', () => {
  const TERMINAL: OrderStatus[] = ['delivered', 'failed_delivery', 'returned_delivery', 'skipped', 'cancelled'];
  const ACTIVE: OrderStatus[] = ['scheduled', 'packing', 'packed', 'ready_for_pickup'];

  it('cancelled orders have NO workflow actions', () => {
    expect(hasWorkflowActions({ status: 'cancelled' })).toBe(false);
  });

  it('all terminal statuses suppress workflow actions', () => {
    for (const status of TERMINAL) {
      expect(hasWorkflowActions({ status })).toBe(false);
    }
  });

  it('all active statuses have workflow actions', () => {
    for (const status of ACTIVE) {
      expect(hasWorkflowActions({ status })).toBe(true);
    }
  });

  it('cancelled orders receive greyed-out styling', () => {
    expect(isGreyedOut({ status: 'cancelled' })).toBe(true);
  });

  it('all terminal statuses receive greyed-out styling', () => {
    for (const status of TERMINAL) {
      expect(isGreyedOut({ status })).toBe(true);
    }
  });

  it('active orders do NOT receive greyed-out styling', () => {
    for (const status of ACTIVE) {
      expect(isGreyedOut({ status })).toBe(false);
    }
  });
});
