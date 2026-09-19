import { describe, it, expect } from "vitest";
import { queryKeys } from "../queryKeys";

describe("queryKeys factory", () => {
  it("generates correct keys for auth", () => {
    expect(queryKeys.auth.profile("u1")).toEqual(["auth", "profile", "u1"]);
  });

  it("generates correct keys for mealPlans", () => {
    expect(queryKeys.mealPlans.all).toEqual(["mealPlans"]);
    expect(queryKeys.mealPlans.detail("mp1")).toEqual(["mealPlans", "detail", "mp1"]);
  });

  it("generates correct keys for subscriptions", () => {
    expect(queryKeys.subscriptions.all).toEqual(["subscriptions"]);
    expect(queryKeys.subscriptions.byCustomer("c1")).toEqual([
      "subscriptions",
      "customer",
      "c1",
    ]);
    expect(queryKeys.subscriptions.active("c1")).toEqual([
      "subscriptions",
      "active",
      "c1",
    ]);
    expect(queryKeys.subscriptions.detail("s1")).toEqual([
      "subscriptions",
      "detail",
      "s1",
    ]);
    expect(queryKeys.subscriptions.adminList("active")).toEqual([
      "subscriptions",
      "admin",
      "active",
    ]);
  });

  it("generates correct keys for payments", () => {
    expect(queryKeys.payments.all).toEqual(["payments"]);
    expect(queryKeys.payments.byCustomer("c1")).toEqual(["payments", "customer", "c1"]);
    expect(queryKeys.payments.detail("p1")).toEqual(["payments", "detail", "p1"]);
    expect(queryKeys.payments.adminList("pending", 0)).toEqual([
      "payments",
      "admin",
      "pending",
      0,
    ]);
  });

  it("generates correct keys for notifications", () => {
    expect(queryKeys.notifications.all).toEqual(["notifications"]);
    expect(queryKeys.notifications.byRecipient("r1")).toEqual([
      "notifications",
      "recipient",
      "r1",
    ]);
    expect(queryKeys.notifications.unreadCount("r1")).toEqual([
      "notifications",
      "unread",
      "r1",
    ]);
    expect(queryKeys.notifications.adminHistory("doc-1", "all")).toEqual([
      "notifications",
      "admin",
      "history",
      "all",
      "doc-1",
      20,
    ]);
    expect(queryKeys.notifications.adminHistory("doc-1", "all", 50)).toEqual([
      "notifications",
      "admin",
      "history",
      "all",
      "doc-1",
      50,
    ]);
    expect(queryKeys.notifications.adminHistory("doc-1", "all", 20)).not.toEqual(
      queryKeys.notifications.adminHistory("doc-1", "all", 50),
    );
    expect(queryKeys.notifications.detail("n1")).toEqual([
      "notifications",
      "detail",
      "n1",
    ]);
  });

  it("generates correct keys for kitchen", () => {
    expect(queryKeys.kitchen.base).toEqual(["kitchen"]);
    expect(queryKeys.kitchen.dayOrders("2026-09-19", "k1")).toEqual([
      "kitchen",
      "orders",
      "2026-09-19",
      "k1",
    ]);
    expect(queryKeys.kitchen.dashboard("2026-09-19", "k1")).toEqual([
      "kitchen",
      "dashboard",
      "2026-09-19",
      "k1",
    ]);
    expect(queryKeys.kitchen.dailyMenu("2026-09-19")).toEqual([
      "kitchen",
      "dailyMenu",
      "2026-09-19",
    ]);
    expect(queryKeys.kitchen.dailyMenuList).toEqual(["kitchen", "dailyMenus"]);
    expect(queryKeys.kitchen.dailyMenuDetail("dm1")).toEqual([
      "kitchen",
      "dailyMenus",
      "detail",
      "dm1",
    ]);
    expect(queryKeys.kitchen.mealTypeOrders("2026-09-19", "lunch")).toEqual([
      "kitchen",
      "orders",
      "2026-09-19",
      "lunch",
    ]);
  });

  it("generates correct keys for delivery", () => {
    expect(queryKeys.delivery.base).toEqual(["delivery"]);
    expect(queryKeys.delivery.unassignedOrders("2026-09-19")).toEqual([
      "delivery",
      "unassigned",
      "2026-09-19",
    ]);
    expect(queryKeys.delivery.assignedOrders("2026-09-19")).toEqual([
      "delivery",
      "assigned",
      "2026-09-19",
    ]);
    expect(queryKeys.delivery.partnerOrders("dp1", "2026-09-19")).toEqual([
      "delivery",
      "partner",
      "dp1",
      "2026-09-19",
    ]);
  });

  it("generates correct keys for accounts, users, and settings", () => {
    expect(queryKeys.accounts.base).toEqual(["accounts"]);
    expect(queryKeys.accounts.payments("2026-09-01", "2026-09-19")).toEqual([
      "accounts",
      "payments",
      "2026-09-01",
      "2026-09-19",
    ]);
    expect(queryKeys.accounts.invoices("2026-09-01", "2026-09-19")).toEqual([
      "accounts",
      "invoices",
      "2026-09-01",
      "2026-09-19",
    ]);
    expect(queryKeys.accounts.invoicesByCustomer("c1")).toEqual([
      "accounts",
      "invoices",
      "customer",
      "c1",
    ]);
    expect(queryKeys.accounts.orders("2026-09-01", "2026-09-19")).toEqual([
      "accounts",
      "orders",
      "2026-09-01",
      "2026-09-19",
    ]);
    expect(queryKeys.users.all).toEqual(["users"]);
    expect(queryKeys.settings.business).toEqual(["settings", "business"]);
  });
});
