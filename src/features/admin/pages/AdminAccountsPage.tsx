import { useState, useMemo, useRef, useId } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useScrollLock } from "@/shared/hooks/useScrollLock";
import { useFocusTrap } from "@/shared/hooks/useFocusTrap";
import {
  CreditCard,
  Banknote,
  Users,
  Download,
  IndianRupee,
  ReceiptText,
  Loader2,
  Search,
  Eye,
  Ban,
  PlusCircle,
  History,
  Wallet,
  X,
} from "lucide-react";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { HeroBanner as PageHeader } from "@/shared/components/ui/HeroBanner";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumInput as Input } from "@/shared/components/ui/PremiumInput";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { MetricCard } from "@/shared/components/ui/MetricCard";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { TableSkeleton } from "@/shared/components/feedback/SkeletonLoader";
import { accountsRepository } from "@/shared/services/firestore/accountsRepository";
import { ledgerRepository } from "@/shared/services/firestore/ledgerRepository";
import { userRepository } from "@/shared/services/firestore/userRepository";
import { auditRepository } from "@/shared/services/firestore/auditRepository";
import { useAdminPayments } from "@/features/customer/hooks/usePayments";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getTodayIST } from "@/features/kitchen/hooks/useKitchenDashboard";
import { parseFirestoreDate } from "@/shared/utils/dateUtils";
import { format } from "date-fns";
import { getAuth } from "firebase/auth";
import toast from "react-hot-toast";
import type { Invoice, InvoiceStatus, UserProfile, CustomerProfile, PaymentMethod } from "@/shared/types";
import { getInvoicePaidAmount, isInvoiceCollectedAmountKnown, getInvoiceRemainingDue, getInvoiceRemainingToRefund } from "@/shared/types";

// ----------------------------------------------------------------------------
// Date Helpers
// ----------------------------------------------------------------------------

function getStartAndEndOfMonth() {
  const today = getTodayIST();
  const year = parseInt(today.substring(0, 4), 10);
  const month = parseInt(today.substring(5, 7), 10);
  const paddedMonth = month.toString().padStart(2, "0");
  const lastDay = new Date(year, month, 0)
    .getDate()
    .toString()
    .padStart(2, "0");

  const start = new Date(`${year}-${paddedMonth}-01T00:00:00+05:30`);
  const end = new Date(`${year}-${paddedMonth}-${lastDay}T23:59:59.999+05:30`);
  return { start, end };
}

function formatPeriod(start?: string, end?: string): string {
  if (!start && !end) return "—";
  try {
    const s = start ? format(new Date(`${start}T00:00:00Z`), "MMM dd") : "";
    const e = end ? format(new Date(`${end}T00:00:00Z`), "MMM dd, yyyy") : "";
    return `${s} – ${e}`;
  } catch {
    return `${start || ""} – ${end || ""}`;
  }
}

function invoiceStatusVariant(status: InvoiceStatus): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "paid":
      return "success";
    case "issued":
      return "warning";
    case "overdue":
      return "danger";
    case "void":
      return "default";
    default:
      return "default";
  }
}

// ----------------------------------------------------------------------------
// Main Page Component
// ----------------------------------------------------------------------------

export function AdminAccountsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = getTodayIST();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const { role } = useAuth();
  const isAdmin = role === "admin";

  // 1. Fetch current month payments for revenue calculation
  const { start, end } = useMemo(() => getStartAndEndOfMonth(), []);
  const {
    data: monthPayments = [],
    isLoading: isLoadingPayments,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin", "revenue", start.toISOString(), end.toISOString()],
    queryFn: () => accountsRepository.getPaymentsInRange(start, end),
  });

  const currentMonthRevenue = useMemo(() => {
    return monthPayments.reduce((total, p) => total + p.amount, 0);
  }, [monthPayments]);

  // 2. Fetch pending verifications count
  const { data: pendingData, isLoading: isLoadingPending } =
    useAdminPayments("pending");
  const pendingCount = pendingData?.payments.length || 0;
  const hasMorePending = pendingData?.lastDoc != null;

  // 3. Fetch All Invoices
  const {
    data: allInvoices = [],
    isLoading: isLoadingInvoices,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ["admin", "invoices"],
    queryFn: () => accountsRepository.getAllInvoices(),
  });

  // Enrich invoices with customer profiles for names & displayIds
  const customerIdsNeeded = useMemo(() => {
    const ids = new Set<string>();
    allInvoices.forEach((inv) => {
      if (inv.customerId) ids.add(inv.customerId);
    });
    return Array.from(ids);
  }, [allInvoices]);

  const { data: customerProfiles = [] } = useQuery({
    queryKey: ["admin", "invoiceCustomerProfiles", customerIdsNeeded],
    queryFn: () => userRepository.getByIds(customerIdsNeeded),
    enabled: customerIdsNeeded.length > 0,
  });

  const customerProfileMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    customerProfiles.forEach((p) => {
      if (p.id) map.set(p.id, p);
    });
    return map;
  }, [customerProfiles]);

  // 4. Invoices Filtering & Searching
  type FilterStatus = "all" | "issued" | "paid" | "overdue" | "void";
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredInvoices = useMemo(() => {
    return allInvoices.filter((inv) => {
      // Status filter
      if (statusFilter !== "all" && inv.status !== statusFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const profile = customerProfileMap.get(inv.customerId) as CustomerProfile | undefined;
        const name = (profile?.fullName || "").toLowerCase();
        const displayId = (profile?.displayId || "").toLowerCase();
        const invNum = (inv.invoiceNumber || inv.id || "").toLowerCase();
        const custId = (inv.customerId || "").toLowerCase();

        const matches =
          name.includes(q) ||
          displayId.includes(q) ||
          invNum.includes(q) ||
          custId.includes(q);

        if (!matches) return false;
      }
      return true;
    });
  }, [allInvoices, statusFilter, searchQuery, customerProfileMap]);

  // Invoice Metric Totals
  const { totalOutstanding, totalPaidInvoicesCount } = useMemo(() => {
    let outstanding = 0;
    let paidCount = 0;
    allInvoices.forEach((inv) => {
      if (inv.status === "paid") {
        paidCount++;
      } else if (inv.status !== "void") {
        outstanding += getInvoiceRemainingDue(inv);
      }
    });
    return { totalOutstanding: outstanding, totalPaidInvoicesCount: paidCount };
  }, [allInvoices]);

  // 5. Selected Invoice Modal States
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [voidInvoiceTarget, setVoidInvoiceTarget] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [offlinePaymentTarget, setOfflinePaymentTarget] = useState<Invoice | null>(null);
  const [offlineAmount, setOfflineAmount] = useState("");
  const [offlineMethod, setOfflineMethod] = useState<PaymentMethod>("cash");
  const [offlineRefNumber, setOfflineRefNumber] = useState("");
  const [offlineDate, setOfflineDate] = useState(getTodayIST());
  const [offlineNotes, setOfflineNotes] = useState("");

  // Modal refs & IDs for accessibility and focus management
  const viewInvoiceRef = useRef<HTMLDivElement>(null);
  const voidInvoiceRef = useRef<HTMLDivElement>(null);
  const offlinePaymentRef = useRef<HTMLDivElement>(null);

  const viewInvoiceTitleId = useId();
  const voidInvoiceTitleId = useId();
  const offlinePaymentTitleId = useId();

  useScrollLock(Boolean(viewInvoice || voidInvoiceTarget || offlinePaymentTarget));
  useFocusTrap(viewInvoiceRef, Boolean(viewInvoice));
  useFocusTrap(voidInvoiceRef, Boolean(voidInvoiceTarget));
  useFocusTrap(offlinePaymentRef, Boolean(offlinePaymentTarget));

  // Mutations
  const voidInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!voidInvoiceTarget) return;
      if (!voidReason.trim()) {
        throw new Error("A reason is required to void this invoice.");
      }
      await accountsRepository.voidInvoice(
        voidInvoiceTarget.id,
        voidReason.trim(),
        currentUser?.uid || "admin",
        currentUser?.displayName || "Admin",
      );
      if (currentUser) {
        await auditRepository.logAction(
          "invoice_voided",
          currentUser.uid,
          "admin",
          currentUser.displayName || "Admin",
          voidInvoiceTarget.id,
          "invoice",
          {
            invoiceNumber: voidInvoiceTarget.invoiceNumber,
            reason: voidReason.trim(),
          },
        );
      }
    },
    onSuccess: () => {
      toast.success("Invoice voided successfully");
      setVoidInvoiceTarget(null);
      setVoidReason("");
      queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to void invoice");
    },
  });

  const recordOfflinePaymentMutation = useMutation({
    mutationFn: async () => {
      if (!offlinePaymentTarget) return;
      const amt = parseFloat(offlineAmount);
      if (isNaN(amt) || amt <= 0) {
        throw new Error("Payment amount must be greater than zero.");
      }
      if (offlineMethod !== "cash" && !offlineRefNumber.trim()) {
        throw new Error("Reference number / UTR is required for non-cash payment.");
      }

      await accountsRepository.recordOfflinePayment({
        invoiceId: offlinePaymentTarget.id,
        amount: amt,
        paymentMethod: offlineMethod,
        referenceNumber: offlineMethod === "cash" ? undefined : offlineRefNumber.trim() || undefined,
        paymentDate: offlineDate,
        notes: offlineNotes.trim() || undefined,
        adminUid: currentUser?.uid || "admin",
        adminName: currentUser?.displayName || "Admin Staff",
      });

      if (currentUser) {
        await auditRepository.logAction(
          "offline_payment_recorded",
          currentUser.uid,
          "admin",
          currentUser.displayName || "Admin",
          offlinePaymentTarget.id,
          "payment",
          {
            invoiceId: offlinePaymentTarget.id,
            amount: amt,
            paymentMethod: offlineMethod,
            paymentDate: offlineDate,
          },
        );
      }
    },
    onSuccess: () => {
      toast.success("Offline payment recorded & reconciled!");
      setOfflinePaymentTarget(null);
      setOfflineAmount("");
      setOfflineRefNumber("");
      setOfflineNotes("");
      queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "revenue"] });
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to record payment");
    },
  });

  // 6. Customer Credit & Ledger Management
  const [customerSearchId, setCustomerSearchId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<UserProfile | null>(null);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);

  const handleLookupCustomer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = customerSearchId.trim();
    if (!query) {
      toast.error("Please enter a customer Display ID, Phone, Email, or UID.");
      return;
    }
    try {
      setIsSearchingCustomer(true);
      let found: UserProfile | null = null;
      if (query.length === 28) {
        found = await userRepository.getById(query);
      }
      if (!found) {
        found = await userRepository.getByDisplayIdOrPhone(query);
      }
      if (found) {
        setSelectedCustomer(found);
      } else {
        toast.error(`No customer found for "${query}".`);
      }
    } catch {
      toast.error("Failed to lookup customer.");
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  // Fetch Ledger for selected customer
  const {
    data: customerLedger = [],
    isLoading: isLoadingLedger,
  } = useQuery({
    queryKey: ["admin", "customerLedger", selectedCustomer?.id],
    queryFn: () => (selectedCustomer?.id ? ledgerRepository.getCustomerLedger(selectedCustomer.id) : []),
    enabled: !!selectedCustomer?.id,
  });

  // 7. Manual Invoicing State & Mutation
  const [invoiceCustomerId, setInvoiceCustomerId] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDesc, setInvoiceDesc] = useState("");

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceCustomerId || !invoiceAmount || !invoiceDesc) {
        throw new Error("All fields are required");
      }
      const amount = parseFloat(invoiceAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Amount must be a valid positive number");
      }

      let targetUid = invoiceCustomerId.trim();
      if (targetUid.length !== 28) {
        const found = await userRepository.getByDisplayIdOrPhone(targetUid);
        if (found) {
          targetUid = found.id;
        } else {
          throw new Error(
            `Customer not found for "${invoiceCustomerId}". Please enter a valid UID, Display ID (e.g. MP-A001), phone, or email.`,
          );
        }
      }

      await accountsRepository.generateInvoice({
        customerId: targetUid,
        amount,
        description: invoiceDesc.trim(),
      });

      if (currentUser) {
        await auditRepository.logAction(
          "manual_invoice_created",
          currentUser.uid,
          "admin",
          currentUser.displayName || "Admin",
          targetUid,
          "invoice",
          {
            customerId: targetUid,
            amount,
            description: invoiceDesc.trim(),
          },
        );
      }
    },
    onSuccess: () => {
      toast.success("Manual invoice created successfully!");
      setInvoiceCustomerId("");
      setInvoiceAmount("");
      setInvoiceDesc("");
      refetchInvoices();
    },
    onError: (err: unknown) => {
      toast.error((err as Error).message || "Failed to create invoice");
    },
  });

  // 8. Financial Report Download Handlers
  const triggerDownload = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadDaily = async () => {
    try {
      const csvString = await accountsRepository.generateDailyReport(today);
      triggerDownload(csvString, `daily_report_${today}.csv`);
      toast.success("Daily report downloaded");
    } catch {
      toast.error("Failed to generate daily report");
    }
  };

  const handleDownloadMonthly = async () => {
    try {
      const monthStr = today.substring(0, 7);
      const csvString = await accountsRepository.generateMonthlyReport(monthStr);
      triggerDownload(csvString, `monthly_report_${monthStr}.csv`);
      toast.success("Monthly report downloaded");
    } catch {
      toast.error("Failed to generate monthly report");
    }
  };

  if (isError) {
    return (
      <div className="space-y-8">
        <PageHeader
          userName="Accounts & Billing"
          subtitle="Dashboard / Accounts"
        />
        <ErrorState
          title="Failed to load accounts data"
          description={
            error instanceof Error ? error.message : "Unknown error occurred"
          }
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        userName="Accounts & Billing"
        subtitle="Operational invoicing, verified payment reconciliation, and ledger credit management"
        actions={
          <div className="flex gap-4">
            <Button
              onClick={() => navigate("/admin/payroll")}
              variant="secondary"
              className="bg-white/10 text-primary hover:bg-gold/10 hover:text-gold"
            >
              <Users className="mr-2 h-4 w-4" />
              Payroll Processing
            </Button>
            <Button
              onClick={() => navigate("/admin/payments")}
              variant="primary"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Verify Payments
            </Button>
          </div>
        }
      />

      {/* Top Metrics Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {isLoadingPayments ? (
          <div className="animate-pulse h-32 bg-primary/10 rounded-xl" />
        ) : (
          <MetricCard
            title="Current Month Revenue"
            value={`₹${currentMonthRevenue.toLocaleString("en-IN")}`}
            icon={<IndianRupee size={24} />}
            color="mint"
          />
        )}

        <MetricCard
          title="Outstanding Receivable"
          value={`₹${totalOutstanding.toLocaleString("en-IN")}`}
          icon={<ReceiptText size={24} />}
          color="gold"
        />

        {isLoadingPending ? (
          <div className="animate-pulse h-32 bg-primary/10 rounded-xl" />
        ) : (
          <Card
            hoverLift
            className="p-5 border-amber-200/50 bg-gradient-to-br from-background to-amber-50/30 cursor-pointer"
            onClick={() => navigate("/admin/payments")}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 shadow-sm border border-amber-200/50">
                <Banknote size={24} />
              </div>
              <div>
                <h3 className="font-display font-bold text-primary">
                  Pending Actions
                </h3>
                <p className="text-sm text-text-muted">
                  Awaiting Verification
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-gold/10 flex items-center justify-between">
              <span className="text-4xl font-display font-bold text-primary">
                {pendingCount}
                {hasMorePending ? "+" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/admin/payments");
                }}
              >
                Review <CreditCard size={14} className="ml-2" />
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Reports and Manual Invoicing Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Financial Reports */}
        <Card hoverLift className="p-5 sm:p-6">
          <div className="mb-4">
            <h3 className="font-display font-bold text-lg text-primary">
              Financial Reports
            </h3>
            <p className="text-sm text-text-muted">
              Download system-generated accounting CSV reports ({totalPaidInvoicesCount} paid invoices recorded)
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="border border-gold/20 rounded-xl p-4 flex items-center justify-between bg-gradient-to-br from-background to-primary/5 hover:border-gold/40">
              <div className="min-w-0 pr-2">
                <h4 className="font-display font-bold text-primary text-sm truncate">
                  Daily Report
                </h4>
                <p className="text-xs text-text-muted truncate">For {today}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadDaily}
                className="bg-white hover:bg-gold/10 hover:text-gold border-gold/20 shrink-0"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>

            <div className="border border-gold/20 rounded-xl p-4 flex items-center justify-between bg-gradient-to-br from-background to-primary/5 hover:border-gold/40">
              <div className="min-w-0 pr-2">
                <h4 className="font-display font-bold text-primary text-sm truncate">
                  Monthly Report
                </h4>
                <p className="text-xs text-text-muted truncate">
                  For {today.substring(0, 7)}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadMonthly}
                className="bg-white hover:bg-gold/10 hover:text-gold border-gold/20 shrink-0"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Generate Manual Invoice */}
        <Card hoverLift className="p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <ReceiptText className="text-primary" size={20} />
            <div>
              <h3 className="font-display font-bold text-lg text-primary">
                Generate Manual Invoice
              </h3>
              <p className="text-sm text-text-muted">
                Issue a standalone bill to a customer
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Input
                  placeholder="Customer (MP-A001, phone, or email)"
                  value={invoiceCustomerId}
                  onChange={(e) => setInvoiceCustomerId(e.target.value)}
                  className="bg-background text-sm"
                />
              </div>
              <div>
                <Input
                  type="number"
                  placeholder="Amount (₹)"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="bg-background text-sm font-display"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Input
                placeholder="Description (e.g. Special Event Catering)"
                value={invoiceDesc}
                onChange={(e) => setInvoiceDesc(e.target.value)}
                className="bg-background text-sm flex-1"
              />
              <Button
                onClick={() => createInvoiceMutation.mutate()}
                disabled={createInvoiceMutation.isPending}
                className="w-full sm:w-32 min-h-[44px]"
              >
                {createInvoiceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Create"
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Customer Credit Ledger & Adjustment Section */}
      <Card className="p-5 sm:p-6 border-gold/30">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="text-gold" size={22} />
              <h3 className="font-display font-bold text-xl text-primary">
                Customer Credit Ledger & Adjustments
              </h3>
            </div>
            <p className="text-sm text-text-muted mt-0.5">
              Lookup customer credit balances, inspect audit history, or apply manual adjustments
            </p>
          </div>

          <form onSubmit={handleLookupCustomer} className="flex gap-2 w-full sm:w-auto">
            <Input
              placeholder="Search MP-A001, phone, or UID"
              value={customerSearchId}
              onChange={(e) => setCustomerSearchId(e.target.value)}
              className="bg-background text-sm sm:w-64"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={isSearchingCustomer}
              size="sm"
              className="shrink-0"
            >
              {isSearchingCustomer ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search size={16} />
              )}
            </Button>
          </form>
        </div>

        {selectedCustomer ? (
          <div className="space-y-6">
            {/* Customer Details & Current Balance */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-primary font-display text-base">
                    {selectedCustomer.fullName}
                  </span>
                  <Badge variant="default" className="text-[11px] font-mono">
                    {selectedCustomer.displayId || selectedCustomer.id.slice(0, 8)}
                  </Badge>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Phone: {selectedCustomer.phone || "—"} | Email: {selectedCustomer.email || "—"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs text-text-muted uppercase font-bold tracking-wider block">
                    Historical Wallet Credit
                  </span>
                  <span className="font-data font-bold text-lg text-stone-600">
                    ₹{((selectedCustomer as CustomerProfile).creditBalance ?? 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>

            {/* Wallet Credit Deprecation Notice */}
            <div className="p-4 rounded-xl border border-border bg-stone-50/70 text-xs text-text-muted space-y-1">
              <div className="font-semibold text-stone-800">
                Customer Wallet Credit Discontinued
              </div>
              <p>
                Meal billing follows a strict consumption basis where cancelled meals reduce the bill directly. Wallet credit adjustments are discontinued. Historical ledger entries are preserved below for audit records.
              </p>
            </div>

            {/* Ledger History Table */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <History size={16} className="text-primary" />
                <h4 className="font-display font-bold text-sm text-primary">
                  Customer Ledger History
                </h4>
              </div>

              {isLoadingLedger ? (
                <TableSkeleton rows={3} cols={5} />
              ) : customerLedger.length === 0 ? (
                <p className="text-xs text-text-muted italic py-3">
                  No credit ledger transactions found for this customer.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-primary/5 text-primary uppercase font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Timestamp</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Balance After</th>
                        <th className="px-4 py-3">Reason / Details</th>
                        <th className="px-4 py-3">Actor / Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {customerLedger.map((entry) => {
                        const parsedDate = parseFirestoreDate(entry.createdAt);
                        const dateStr = parsedDate ? format(parsedDate, "MMM dd, yyyy HH:mm") : "—";
                        const isPos = entry.amount >= 0;
                        return (
                          <tr key={entry.id} className="hover:bg-primary/5 transition-colors">
                            <td className="px-4 py-2.5 text-text-muted">{dateStr}</td>
                            <td className="px-4 py-2.5">
                              <Badge variant="default" className="text-[10px] uppercase font-mono">
                                {entry.type}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 font-bold font-data">
                              <span className={isPos ? "text-emerald-700" : "text-danger"}>
                                {isPos ? "+" : ""}₹{Math.abs(entry.amount).toLocaleString("en-IN")}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-data text-stone-900 font-semibold">
                              ₹{entry.balanceAfter.toLocaleString("en-IN")}
                            </td>
                            <td className="px-4 py-2.5 text-stone-800">{entry.reason}</td>
                            <td className="px-4 py-2.5 text-text-muted">
                              {entry.actorId || entry.actorRole || entry.invoiceId || entry.paymentId || "System"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-sm text-text-muted">
            Search for a customer above using their Display ID (e.g. MP-A001), phone, or email to inspect their ledger.
          </div>
        )}
      </Card>

      {/* Operational Invoices Management Section */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h3 className="font-display font-bold text-xl text-primary">
              Operational Invoices Table
            </h3>
            <p className="text-sm text-text-muted mt-0.5">
              Review invoice amounts, tracked payments, applied credits, and record offline settlements
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <Input
                placeholder="Search invoice #, customer name/ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background text-sm w-full"
              />
            </div>
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-3">
          {(["all", "issued", "paid", "overdue", "void"] as FilterStatus[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                statusFilter === tab
                  ? "bg-primary text-white shadow-xs"
                  : "bg-primary/5 text-text-muted hover:bg-primary/10 hover:text-stone-900"
              }`}
            >
              {tab === "all" ? "All Invoices" : tab}
            </button>
          ))}
        </div>

        {/* Invoices Table */}
        {isLoadingInvoices ? (
          <TableSkeleton rows={5} cols={8} />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            title="No invoices found"
            description="No invoices match the selected filter criteria."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-primary/5 text-primary uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Billing Period</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Credit Applied</th>
                  <th className="px-4 py-3">Paid Amount</th>
                  <th className="px-4 py-3">Remaining Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.map((inv) => {
                  const profile = customerProfileMap.get(inv.customerId) as CustomerProfile | undefined;
                  const custName = profile?.fullName || "Customer";
                  const displayId = profile?.displayId || inv.customerId.slice(0, 8);
                  const isPaid = inv.status === "paid";
                  const isVoid = inv.status === "void";
                  const paid = getInvoicePaidAmount(inv);
                  const remainingDue = getInvoiceRemainingDue(inv);

                  return (
                    <tr key={inv.id} className="hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3 font-bold font-sans text-primary">
                        {inv.invoiceNumber || inv.id.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-stone-900">{custName}</div>
                        <div className="text-[11px] text-text-muted font-mono">{displayId}</div>
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {formatPeriod(inv.billingPeriodStart, inv.billingPeriodEnd)}
                      </td>
                      <td className="px-4 py-3 font-data font-semibold text-stone-900">
                        ₹{inv.totalAmount.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 font-data text-emerald-700">
                        {inv.creditApplied && inv.creditApplied > 0
                          ? `₹${inv.creditApplied.toLocaleString("en-IN")}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-data text-blue-700">
                        {paid > 0 ? `₹${paid.toLocaleString("en-IN")}` : "—"}
                        {isInvoiceCollectedAmountKnown(inv) && (inv.collectedAmount ?? 0) > paid && (
                          <div className="text-[10px] text-stone-600 font-semibold mt-0.5">
                            Collected: ₹{(inv.collectedAmount ?? 0).toLocaleString("en-IN")}
                          </div>
                        )}
                        {!isInvoiceCollectedAmountKnown(inv) && (
                          <div className="text-[10px] text-stone-400 italic mt-0.5" title="Historical invoice created before separate gross collection tracking">
                            Collected: Unknown (Legacy)
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-data font-bold">
                        <span className={remainingDue > 0 ? "text-amber-800" : "text-emerald-700"}>
                          ₹{remainingDue.toLocaleString("en-IN")}
                        </span>
                        {getInvoiceRemainingToRefund(inv) > 0 && (
                          <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                            Remaining to Refund: ₹{getInvoiceRemainingToRefund(inv).toLocaleString("en-IN")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={invoiceStatusVariant(inv.status)}
                          className="text-[10px] uppercase font-bold tracking-wider"
                        >
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="xs"
                            title="View Invoice Details"
                            aria-label="View Invoice Details"
                            onClick={() => setViewInvoice(inv)}
                          >
                            <Eye size={14} />
                          </Button>

                          {!isVoid && !isPaid && remainingDue > 0 && isAdmin && (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                              title="Record Offline Payment"
                              aria-label="Record Offline Payment"
                              onClick={() => {
                                setOfflinePaymentTarget(inv);
                                setOfflineAmount(remainingDue.toString());
                                setOfflineMethod("cash");
                                setOfflineRefNumber("");
                                setOfflineDate(getTodayIST());
                                setOfflineNotes("");
                              }}
                            >
                              <PlusCircle size={14} />
                            </Button>
                          )}

                          {!isVoid && isAdmin && (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="text-danger hover:text-danger hover:bg-danger/10"
                              title="Void Invoice"
                              aria-label="Void Invoice"
                              onClick={() => {
                                setVoidInvoiceTarget(inv);
                                setVoidReason("");
                              }}
                            >
                              <Ban size={14} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* MODAL: Invoice Details */}
      {viewInvoice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={viewInvoiceTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pb-safe"
        >
          <div
            ref={viewInvoiceRef}
            className="bg-background rounded-2xl max-w-xl w-full p-6 shadow-xl border border-border space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div>
                <h3
                  id={viewInvoiceTitleId}
                  className="font-display font-bold text-lg text-primary"
                >
                  Invoice Details — {viewInvoice.invoiceNumber || viewInvoice.id}
                </h3>
                <p className="text-xs text-text-muted">
                  Billing Period: {formatPeriod(viewInvoice.billingPeriodStart, viewInvoice.billingPeriodEnd)}
                </p>
              </div>
              <button
                onClick={() => setViewInvoice(null)}
                aria-label="Close invoice details"
                className="text-text-muted hover:text-stone-900"
              >
                <X size={20} />
              </button>
            </div>

            {/* Line items table */}
            <div className="space-y-2">
              <h4 className="font-display font-bold text-xs uppercase tracking-wider text-text-muted">
                Line Items
              </h4>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-primary/5 text-primary font-bold">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(viewInvoice.lineItems || []).map((item, idx) => (
                      <tr key={idx} className="hover:bg-primary/5">
                        <td className="px-3 py-2 text-stone-900">{item.description}</td>
                        <td className="px-3 py-2 text-right text-text-muted">{item.quantity}</td>
                        <td className="px-3 py-2 text-right text-text-muted">₹{item.unitPrice}</td>
                        <td className="px-3 py-2 text-right font-data font-semibold">₹{item.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Subtotal:</span>
                <span className="font-data font-semibold">₹{(viewInvoice.subtotal ?? viewInvoice.totalAmount).toLocaleString("en-IN")}</span>
              </div>
              {viewInvoice.creditApplied && viewInvoice.creditApplied > 0 ? (
                <div className="flex justify-between text-emerald-700">
                  <span>Credit Applied:</span>
                  <span className="font-data">-₹{viewInvoice.creditApplied.toLocaleString("en-IN")}</span>
                </div>
              ) : null}
              {viewInvoice.depositHeld && viewInvoice.depositHeld > 0 ? (
                <div className="flex justify-between text-blue-700">
                  <span>Security Deposit Held:</span>
                  <span className="font-data">₹{viewInvoice.depositHeld.toLocaleString("en-IN")}</span>
                </div>
              ) : null}
              <div className="flex justify-between font-bold text-primary pt-1 border-t border-primary/10">
                <span>Total Due:</span>
                <span className="font-data text-sm">₹{viewInvoice.totalAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-blue-700">
                <span>Applied Payment:</span>
                <span className="font-data">
                  ₹{getInvoicePaidAmount(viewInvoice).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between text-stone-700">
                <span>Total Cash Collected:</span>
                <span className="font-data">
                  {isInvoiceCollectedAmountKnown(viewInvoice)
                    ? `₹${(viewInvoice.collectedAmount ?? 0).toLocaleString("en-IN")}`
                    : "Not recorded (Legacy invoice)"}
                </span>
              </div>
              <div className="flex justify-between font-bold text-amber-800">
                <span>Remaining Balance Due:</span>
                <span className="font-data">
                  ₹{getInvoiceRemainingDue(viewInvoice).toLocaleString("en-IN")}
                </span>
              </div>
              {getInvoiceRemainingToRefund(viewInvoice) > 0 && (
                <div className="flex justify-between font-bold text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  <span>Remaining to Refund:</span>
                  <span className="font-data">
                    ₹{getInvoiceRemainingToRefund(viewInvoice).toLocaleString("en-IN")}
                  </span>
                </div>
              )}
            </div>

            {/* Void information if voided */}
            {viewInvoice.status === "void" && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
                <div className="font-bold">Invoice Voided</div>
                <div>Reason: {viewInvoice.voidReason || "Not provided"}</div>
                {viewInvoice.voidedBy && <div>Voided by: {viewInvoice.voidedBy}</div>}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setViewInvoice(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Void Invoice Confirmation */}
      {voidInvoiceTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={voidInvoiceTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pb-safe"
        >
          <div
            ref={voidInvoiceRef}
            className="bg-background rounded-2xl max-w-md w-full p-6 shadow-xl border border-border space-y-4"
          >
            <div className="flex items-center gap-2 text-danger">
              <Ban size={22} />
              <h3
                id={voidInvoiceTitleId}
                className="font-display font-bold text-lg"
              >
                Void Invoice
              </h3>
            </div>
            <p className="text-xs text-text-muted">
              You are voiding invoice <span className="font-bold text-stone-900">{voidInvoiceTarget.invoiceNumber || voidInvoiceTarget.id}</span>.
              Financial records are preserved for audit purposes. Please enter a valid mandatory reason.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider">
                Void Reason (Required)
              </label>
              <Input
                placeholder="e.g. Billed in error, plan customized offline"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="bg-background text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVoidInvoiceTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-danger hover:bg-danger/90 text-white"
                onClick={() => voidInvoiceMutation.mutate()}
                disabled={voidInvoiceMutation.isPending || !voidReason.trim()}
              >
                {voidInvoiceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Confirm Void"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Record Offline Payment */}
      {offlinePaymentTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={offlinePaymentTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pb-safe"
        >
          <div
            ref={offlinePaymentRef}
            className="bg-background rounded-2xl max-w-md w-full p-6 shadow-xl border border-border space-y-4"
          >
            <div className="flex items-center gap-2 text-emerald-700">
              <IndianRupee size={22} />
              <h3
                id={offlinePaymentTitleId}
                className="font-display font-bold text-lg"
              >
                Record Offline Payment
              </h3>
            </div>
            <p className="text-xs text-text-muted">
              Record a payment received in cash, direct UPI, or bank transfer against invoice{" "}
              <span className="font-bold text-stone-900">{offlinePaymentTarget.invoiceNumber || offlinePaymentTarget.id}</span>.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1">
                  Payment Method
                </label>
                <select
                  value={offlineMethod}
                  onChange={(e) => setOfflineMethod(e.target.value as PaymentMethod)}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-gold"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1">
                  Amount Received (₹)
                </label>
                <Input
                  type="number"
                  value={offlineAmount}
                  onChange={(e) => setOfflineAmount(e.target.value)}
                  className="bg-background text-sm font-display"
                />
              </div>

              {offlineMethod !== "cash" && (
                <div>
                  <label className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1">
                    Reference / UTR Number (Required)
                  </label>
                  <Input
                    placeholder="12-digit UTR or transaction ref"
                    value={offlineRefNumber}
                    onChange={(e) => setOfflineRefNumber(e.target.value)}
                    className="bg-background text-sm"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1">
                  Payment Date
                </label>
                <Input
                  type="date"
                  value={offlineDate}
                  onChange={(e) => setOfflineDate(e.target.value)}
                  className="bg-background text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1">
                  Staff Notes (Optional)
                </label>
                <Input
                  placeholder="e.g. Received by delivery supervisor"
                  value={offlineNotes}
                  onChange={(e) => setOfflineNotes(e.target.value)}
                  className="bg-background text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOfflinePaymentTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => recordOfflinePaymentMutation.mutate()}
                disabled={recordOfflinePaymentMutation.isPending}
              >
                {recordOfflinePaymentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Record Payment"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
