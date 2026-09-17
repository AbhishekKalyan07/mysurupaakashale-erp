import { useState } from "react";
import { useMyPayments, useMyInvoices } from "../hooks/usePayments";
import { useMySubscription } from "../hooks/useMySubscription";
import { ManualPaymentPanel } from "../components/ManualPaymentPanel";
import { LoadingScreen } from "@/shared/components/feedback/LoadingScreen";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { PremiumButton } from "@/shared/components/ui/PremiumButton";
import { parseFirestoreDate } from "@/shared/utils/dateUtils";
import {
  Receipt,
  Calendar,
  Smartphone,
  Banknote,
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import type {
  ManualPayment,
  ManualPaymentStatus,
  PaymentMethod,
  Invoice,
  InvoiceStatus,
} from "@/shared/types";

function statusBadgeVariant(
  status: ManualPaymentStatus,
): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "verified":
      return "success";
    case "pending":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "default";
  }
}

function statusLabel(status: ManualPaymentStatus): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "pending":
      return "Pending Verification";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

function StatusIcon({ status }: { status: ManualPaymentStatus }) {
  switch (status) {
    case "verified":
      return <CheckCircle size={14} className="text-success" />;
    case "pending":
      return <Clock size={14} className="text-warning" />;
    case "rejected":
      return <XCircle size={14} className="text-danger" />;
    default:
      return null;
  }
}

function MethodIcon({ method }: { method: PaymentMethod }) {
  switch (method) {
    case "upi":
      return <Smartphone size={14} />;
    case "cash":
      return <Banknote size={14} />;
    case "bank_transfer":
      return <Building2 size={14} />;
    default:
      return null;
  }
}

function methodLabel(method: PaymentMethod): string {
  switch (method) {
    case "upi":
      return "UPI";
    case "cash":
      return "Cash";
    case "bank_transfer":
      return "Bank Transfer";
    default:
      return method;
  }
}

function invoiceStatusBadgeVariant(
  status: InvoiceStatus,
): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "paid":
      return "success";
    case "issued":
      return "warning";
    case "overdue":
      return "danger";
    default:
      return "default";
  }
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

function InvoiceRow({
  invoice,
  onPay,
}: {
  invoice: Invoice;
  onPay?: (invoice: Invoice) => void;
}) {
  const isPaid = invoice.status === "paid";
  const parsedPaidAt = invoice.paidAt ? parseFirestoreDate(invoice.paidAt) : null;
  const paidDateStr = parsedPaidAt ? format(parsedPaidAt, "MMM dd, yyyy") : null;

  return (
    <tr className="block md:table-row bg-background md:bg-transparent hover:bg-primary/5 transition-colors border-b border-primary/10 last:border-0 p-4 md:p-0 space-y-3 md:space-y-0">
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans">
          Invoice #
        </span>
        <div className="flex items-center gap-2 text-primary font-bold font-sans text-sm">
          <FileText size={14} className="text-gold shrink-0 hidden md:block" />
          {invoice.invoiceNumber || invoice.id.slice(0, 10)}
        </div>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans">
          Billing Period
        </span>
        <div className="text-right md:text-left text-xs font-sans text-text-muted">
          <div className="flex items-center justify-end md:justify-start gap-1 font-medium text-stone-800">
            <Calendar size={12} className="text-primary shrink-0" />
            {formatPeriod(invoice.billingPeriodStart, invoice.billingPeriodEnd)}
          </div>
          {invoice.depositHeld && invoice.depositHeld > 0 ? (
            <span className="text-[11px] text-emerald-600 font-sans">
              (₹{invoice.depositHeld.toLocaleString("en-IN")} deposit applied)
            </span>
          ) : null}
        </div>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans">
          Total Due
        </span>
        <span className="font-bold text-primary font-data text-base">
          ₹{invoice.totalAmount.toLocaleString("en-IN")}
        </span>
      </td>
      <td className="flex justify-between items-start md:items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans mt-0.5">
          Status & Action
        </span>
        <div className="flex flex-col md:flex-row items-end md:items-center gap-2">
          <Badge
            variant={invoiceStatusBadgeVariant(invoice.status)}
            className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 shadow-sm"
          >
            {invoice.status === "issued" ? "Due" : invoice.status}
          </Badge>
          {!isPaid && onPay && invoice.totalAmount > 0 && (
            <PremiumButton
              variant="primary"
              size="xs"
              onClick={() => onPay(invoice)}
              className="text-xs py-1 px-3 shadow-xs"
            >
              Pay Bill
            </PremiumButton>
          )}
          {isPaid && paidDateStr && (
            <span className="text-[11px] text-text-muted hidden md:inline">
              Paid on {paidDateStr}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function PaymentRow({ payment }: { payment: ManualPayment }) {
  const parsedDate = parseFirestoreDate(payment.createdAt);
  const dateStr = parsedDate
    ? format(parsedDate, "MMM dd, yyyy")
    : payment.paymentDate;

  return (
    <tr className="block md:table-row bg-background md:bg-transparent hover:bg-primary/5 transition-colors border-b border-primary/10 last:border-0 p-4 md:p-0 space-y-3 md:space-y-0">
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans">
          Date
        </span>
        <div className="flex items-center gap-2 text-primary font-bold font-sans text-sm">
          <Calendar size={14} className="text-gold shrink-0 hidden md:block" />
          {dateStr}
        </div>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans">
          Amount
        </span>
        <span className="font-bold text-primary font-data text-base">
          ₹{payment.amount.toLocaleString("en-IN")}
        </span>
      </td>
      <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans">
          Method / Ref
        </span>
        <div className="text-right md:text-left">
          <div className="flex items-center justify-end md:justify-start gap-2 text-text-muted font-sans font-medium text-sm capitalize">
            <MethodIcon method={payment.paymentMethod} />
            {methodLabel(payment.paymentMethod)}
          </div>
          {payment.referenceNumber && (
            <div className="text-gold text-xs font-data mt-1 truncate max-w-[150px]">
              {payment.referenceNumber}
            </div>
          )}
        </div>
      </td>
      <td className="flex justify-between items-start md:items-center md:table-cell px-0 py-1 md:px-6 md:py-4">
        <span className="md:hidden font-bold text-text-muted text-[10px] uppercase tracking-wider font-sans mt-0.5">
          Status
        </span>
        <div className="flex flex-col items-end md:items-start">
          <div className="flex items-center gap-2">
            <StatusIcon status={payment.status} />
            <Badge
              variant={statusBadgeVariant(payment.status)}
              className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 shadow-sm"
            >
              {statusLabel(payment.status)}
            </Badge>
          </div>
          {payment.verificationNotes && payment.status === "rejected" && (
            <p className="text-xs text-danger mt-1.5 font-sans font-medium text-right md:text-left max-w-[200px]">
              {payment.verificationNotes}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}

export function PaymentHistoryPage() {
  const [activeTab, setActiveTab] = useState<"invoices" | "payments">("invoices");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const {
    data: payments,
    isLoading: isLoadingPayments,
    error: paymentsError,
    refetch: refetchPayments,
  } = useMyPayments();

  const {
    data: invoices,
    isLoading: isLoadingInvoices,
    error: invoicesError,
    refetch: refetchInvoices,
  } = useMyInvoices();

  const { data: activeSubscription } = useMySubscription();

  const isLoading = isLoadingPayments || isLoadingInvoices;

  if (isLoading) return <LoadingScreen />;

  if (paymentsError && invoicesError) {
    return (
      <div className="space-y-8 p-4 md:p-8">
        <ErrorState
          title="Could not load billing data"
          description="We had trouble retrieving your invoice and payment records. Please try again."
          onRetry={() => {
            refetchPayments();
            refetchInvoices();
          }}
        />
      </div>
    );
  }

  // Invoice calculations
  const invoiceList = invoices || [];
  const dueInvoices = invoiceList.filter(
    (inv) => inv.status === "issued" || inv.status === "overdue",
  );
  const paidInvoices = invoiceList.filter((inv) => inv.status === "paid");
  const totalOutstandingDue = dueInvoices.reduce(
    (acc, inv) => acc + (inv.totalAmount || 0),
    0,
  );

  // Payment calculations
  const paymentList = payments || [];
  const verified = paymentList.filter((p) => p.status === "verified").length;
  const pending = paymentList.filter((p) => p.status === "pending").length;
  const rejected = paymentList.filter((p) => p.status === "rejected").length;

  return (
    <div className="space-y-8 pb-12 pt-6">
      <div className="max-w-5xl mx-auto space-y-8 px-4 md:px-0">
        <div className="mb-8">
          <h1 className="text-3xl font-display text-primary font-bold">
            Billing & Payments
          </h1>
          <p className="text-text-muted mt-2 font-sans font-medium">
            View your monthly invoices, outstanding dues, and submitted payment receipts.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-primary/15 gap-8 mb-6">
          <button
            onClick={() => setActiveTab("invoices")}
            className={`pb-3 font-sans text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "invoices"
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-stone-800"
            }`}
          >
            <FileText size={16} />
            <span>Monthly Invoices</span>
            {dueInvoices.length > 0 ? (
              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {dueInvoices.length} Due
              </span>
            ) : invoiceList.length > 0 ? (
              <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                {invoiceList.length}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`pb-3 font-sans text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "payments"
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-stone-800"
            }`}
          >
            <Receipt size={16} />
            <span>Submitted Payments</span>
            {paymentList.length > 0 && (
              <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                {paymentList.length}
              </span>
            )}
          </button>
        </div>

        {/* INVOICES TAB */}
        {activeTab === "invoices" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
              <Card className="p-6 text-center border-primary/20 shadow-sm bg-gradient-to-b from-primary/5 to-transparent">
                <div className="text-3xl font-bold font-data text-primary mb-2">
                  {invoiceList.length}
                </div>
                <Badge
                  variant="default"
                  className="mt-1 text-[10px] uppercase font-bold tracking-widest shadow-sm"
                >
                  Total Invoices
                </Badge>
              </Card>

              <Card className="p-6 text-center border-amber-300 shadow-sm bg-gradient-to-b from-amber-50 to-transparent">
                <div className="text-3xl font-bold font-data text-amber-900 mb-2">
                  ₹{totalOutstandingDue.toLocaleString("en-IN")}
                </div>
                <Badge
                  variant={totalOutstandingDue > 0 ? "warning" : "success"}
                  className="mt-1 text-[10px] uppercase font-bold tracking-widest shadow-sm"
                >
                  {totalOutstandingDue > 0 ? "Outstanding Due" : "All Clear"}
                </Badge>
              </Card>

              <Card className="p-6 text-center border-emerald-300 shadow-sm bg-gradient-to-b from-emerald-50 to-transparent">
                <div className="text-3xl font-bold font-data text-emerald-800 mb-2">
                  {paidInvoices.length}
                </div>
                <Badge
                  variant="success"
                  className="mt-1 text-[10px] uppercase font-bold tracking-widest shadow-sm"
                >
                  Paid Invoices
                </Badge>
              </Card>
            </div>

            {/* Pay Bill Form Modal / Panel if selected */}
            {selectedInvoice && (
              <div className="mb-6 p-4 rounded-xl border border-amber-300 bg-amber-50/40">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-sm font-sans">
                    <AlertCircle size={16} />
                    <span>Pay Invoice #{selectedInvoice.invoiceNumber}</span>
                  </div>
                  <PremiumButton
                    variant="ghost"
                    size="xs"
                    onClick={() => setSelectedInvoice(null)}
                  >
                    Cancel
                  </PremiumButton>
                </div>
                <ManualPaymentPanel
                  subscriptionId={
                    selectedInvoice.subscriptionId ||
                    activeSubscription?.id ||
                    ""
                  }
                  amount={selectedInvoice.totalAmount}
                  purpose="usage"
                  onClose={() => setSelectedInvoice(null)}
                  onSuccess={() => {
                    setSelectedInvoice(null);
                    refetchInvoices();
                    refetchPayments();
                  }}
                />
              </div>
            )}

            {/* Invoices Table */}
            {invoiceList.length === 0 ? (
              <EmptyState
                icon={<FileText size={48} className="text-primary/40" />}
                title="No Invoices Yet"
                description="Your meal subscription billing statement is generated automatically at the end of each calendar month based on the actual meals delivered."
              />
            ) : (
              <Card className="border-primary/20 overflow-hidden shadow-sm p-0">
                <div className="overflow-x-auto md:overflow-visible">
                  <table className="w-full text-left font-sans text-sm block md:table">
                    <thead className="hidden md:table-header-group bg-primary/5 border-b border-primary/10 text-primary font-bold uppercase tracking-wider text-xs">
                      <tr>
                        <th className="px-6 py-5">Invoice #</th>
                        <th className="px-6 py-5">Billing Period</th>
                        <th className="px-6 py-5">Total Due</th>
                        <th className="px-6 py-5">Status & Action</th>
                      </tr>
                    </thead>
                    <tbody className="block md:table-row-group bg-background divide-y divide-primary/5">
                      {invoiceList.map((invoice) => (
                        <InvoiceRow
                          key={invoice.id}
                          invoice={invoice}
                          onPay={(inv) => setSelectedInvoice(inv)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}

        {/* SUBMITTED PAYMENTS TAB */}
        {activeTab === "payments" && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-6 mb-8">
              {[
                { label: "Verified", count: verified, variant: "success" },
                { label: "Pending", count: pending, variant: "warning" },
                { label: "Rejected", count: rejected, variant: "danger" },
              ].map(({ label, count, variant }) => (
                <Card
                  key={label}
                  className="p-6 text-center border-primary/20 shadow-sm bg-gradient-to-b from-primary/5 to-transparent"
                >
                  <div className="text-3xl font-bold font-data text-primary mb-2">
                    {count}
                  </div>
                  <Badge
                    variant={variant as any}
                    className="mt-1 text-[10px] uppercase font-bold tracking-widest shadow-sm"
                  >
                    {label}
                  </Badge>
                </Card>
              ))}
            </div>

            {paymentList.length === 0 ? (
              <EmptyState
                icon={<Receipt size={48} className="text-primary/40" />}
                title="No Payment History"
                description="You have not submitted any payments yet. Once you submit a payment for your subscription it will appear here."
              />
            ) : (
              <Card className="border-primary/20 overflow-hidden shadow-sm p-0">
                <div className="overflow-x-auto md:overflow-visible">
                  <table className="w-full text-left font-sans text-sm block md:table">
                    <thead className="hidden md:table-header-group bg-primary/5 border-b border-primary/10 text-primary font-bold uppercase tracking-wider text-xs">
                      <tr>
                        <th className="px-6 py-5">Date</th>
                        <th className="px-6 py-5">Amount</th>
                        <th className="px-6 py-5">Method / Ref</th>
                        <th className="px-6 py-5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="block md:table-row-group bg-background divide-y divide-primary/5">
                      {paymentList.map((payment) => (
                        <PaymentRow key={payment.id} payment={payment} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
