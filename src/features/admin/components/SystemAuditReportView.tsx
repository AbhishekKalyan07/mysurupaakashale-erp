import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { formatINR } from "@/shared/utils/currency";
import { parseAuditLogDetails } from "@/shared/utils/auditParser";

interface SystemAuditReportViewProps {
  details: any;
  action?: string;
  reason?: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy reference"
      className="inline-flex items-center ml-1.5 p-0.5 text-text-muted hover:text-primary transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
    </button>
  );
}

function formatPaymentMethod(method?: unknown): string {
  if (!method || typeof method !== "string") return "Payment";
  const lower = method.toLowerCase().trim();
  if (lower === "upi") return "UPI";
  if (lower === "bank_transfer" || lower === "bank" || lower === "net_banking") return "Bank Transfer";
  if (lower === "cash") return "Cash";
  if (lower === "card") return "Card";
  if (lower === "razorpay") return "Razorpay";
  if (lower === "cheque" || lower === "check") return "Cheque";
  return method
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPaymentPurpose(purpose?: unknown): string {
  if (!purpose || typeof purpose !== "string") return "";
  const lower = purpose.toLowerCase().trim();
  if (lower === "security_deposit") return "Security Deposit";
  if (lower === "usage" || lower === "monthly_usage") return "Monthly Usage";
  if (lower === "extra_meal" || lower === "extra_meals") return "Extra Meals";
  if (lower === "delivery_charge") return "Delivery Charge";
  return purpose
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMeal(meal?: unknown): string {
  if (!meal || typeof meal !== "string") return "";
  const lower = meal.toLowerCase().trim();
  if (lower === "breakfast") return "Breakfast";
  if (lower === "lunch") return "Lunch";
  if (lower === "dinner") return "Dinner";
  return meal.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatKey(key: string): string {
  const customMap: Record<string, string> = {
    newPartnerId: "New Partner ID",
    oldPartnerId: "Old Partner ID",
    newPartnerName: "Assigned Partner",
    oldPartnerName: "Previous Partner",
    subscriptionId: "Subscription ID",
    customerId: "Customer ID",
    billingMonth: "Billing Month",
    invoiceId: "Invoice ID",
    paymentMethod: "Payment Method",
    referenceNumber: "Reference Number",
    staffId: "Staff ID",
    planTier: "Plan Tier",
    startDate: "Start Date",
    endDate: "End Date",
    pauseStartDate: "Pause Start",
    pauseEndDate: "Pause End",
    totalAmount: "Total Amount",
    kitchenId: "Kitchen ID",
    zoneId: "Zone ID",
    mealType: "Meal Type",
  };
  if (customMap[key]) return customMap[key];
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function RawJsonInspector({ details }: { details: any }) {
  return (
    <details className="mt-2 text-[10px] text-text-muted group">
      <summary className="cursor-pointer hover:text-primary font-mono text-[10px] select-none inline-flex items-center gap-1 transition-colors">
        <span>View Raw JSON</span>
        <span className="text-[8px] group-open:rotate-180 transition-transform">▼</span>
      </summary>
      <pre className="text-[10px] text-text-muted w-full overflow-x-auto bg-background-alt p-3 rounded-lg border border-primary/10 whitespace-pre-wrap word-break shadow-inner font-medium mt-1">
        {JSON.stringify(details, null, 2)}
      </pre>
    </details>
  );
}

export function SystemAuditReportView({
  details,
  action,
  reason,
}: SystemAuditReportViewProps) {
  const { isRawDump, report } = parseAuditLogDetails(details);

  // 1. Existing Terminal CLI / System Audit Report Dump
  if (isRawDump && report) {
    const isPassed = report.status === "passed";
    const statusText = isPassed
      ? "✅ Passed"
      : report.status === "warning"
        ? "⚠️ Warning"
        : "❌ Failed";

    return (
      <div className="flex flex-col gap-4 font-sans w-full max-w-full bg-background-alt p-4 rounded-xl border border-primary/10">
        <h3 className="font-bold text-sm text-primary uppercase tracking-wider mb-2">
          System Audit Report
        </h3>

        <div className="text-xs">
          <span className="font-bold text-text-muted">Status: </span>
          <span
            className={
              isPassed ? "text-green-600 font-bold" : "text-red-600 font-bold"
            }
          >
            {statusText}
          </span>
        </div>

        <div className="text-xs">
          <span className="font-bold text-text-muted">Summary: </span>
          <span className="text-primary">{report.summary}</span>
        </div>

        {report.checksPerformed.length > 0 ? (
          <div className="text-xs">
            <span className="font-bold text-text-muted block mb-1">
              Checks Performed
            </span>
            <ul className="list-disc pl-4 text-primary space-y-0.5">
              {report.checksPerformed.map((check, i) => (
                <li key={i}>{check}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-xs">
            <span className="font-bold text-text-muted block mb-1">
              Checks Performed
            </span>
            <span className="text-primary">Not available</span>
          </div>
        )}

        <div className="text-xs">
          <span className="font-bold text-text-muted block mb-1">Tests</span>
          {report.tests.length > 0 ? (
            <span className="text-primary">
              {report.tests.filter((t) => t.status === "passed").length}/
              {report.tests.length} tests passed
            </span>
          ) : (
            <span className="text-primary">Not available</span>
          )}
        </div>

        <div className="text-xs">
          <span className="font-bold text-text-muted block mb-1">
            Issues Found
          </span>
          {report.issuesFound.length > 0 ? (
            <ul className="list-disc pl-4 text-red-600 space-y-0.5">
              {report.issuesFound.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          ) : (
            <span className="text-primary">None</span>
          )}
        </div>

        <div className="text-xs">
          <span className="font-bold text-text-muted block mb-1">
            Recommendations
          </span>
          {report.recommendations.length > 0 ? (
            <ul className="list-disc pl-4 text-primary space-y-0.5">
              {report.recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          ) : (
            <span className="text-primary">No immediate action required</span>
          )}
        </div>
      </div>
    );
  }

  // 2. Empty details handling
  if (!details || (typeof details === "object" && Object.keys(details).length === 0)) {
    if (reason) {
      return (
        <div className="text-xs space-y-1">
          <div className="p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger font-medium">
            <span className="font-bold">Reason: </span>
            {reason}
          </div>
        </div>
      );
    }
    return (
      <span className="text-[10px] text-text-muted font-medium italic">
        No additional details provided.
      </span>
    );
  }

  // Non-object primitive string/number details
  if (typeof details !== "object") {
    return (
      <div>
        <div className="text-xs text-text">{String(details)}</div>
        <RawJsonInspector details={details} />
      </div>
    );
  }

  // 3. Structured Business Events Formatter
  const effectiveAction = action || details.action;
  const effectiveReason = details.reason || reason;

  const isPayment =
    effectiveAction?.startsWith("payment_") ||
    effectiveAction === "invoice_generated" ||
    details.amount !== undefined ||
    details.paymentMethod !== undefined ||
    details.method !== undefined ||
    details.utr !== undefined ||
    details.referenceNumber !== undefined ||
    details.purpose === "security_deposit" ||
    details.purpose === "usage" ||
    details.purpose === "monthly_usage";

  const isDeliveryPartner =
    effectiveAction === "delivery_partner_assigned" ||
    details.newPartnerName !== undefined ||
    (details.mealType !== undefined && (details.oldPartnerId !== undefined || details.newPartnerId !== undefined));

  const isSubscription =
    effectiveAction?.startsWith("subscription_") ||
    (details.planTier !== undefined && (details.status !== undefined || details.startDate !== undefined));

  // 3A. Payment Event Card
  if (isPayment) {
    const paymentTitle =
      effectiveAction === "payment_submitted"
        ? "PAYMENT SUBMITTED"
        : effectiveAction === "payment_rejected"
          ? "PAYMENT REJECTED"
          : effectiveAction === "invoice_generated"
            ? "INVOICE GENERATED"
            : "PAYMENT RECEIVED";

    const method = details.paymentMethod || details.method;
    const refNum = details.utr || details.referenceNumber;
    const purposeText = formatPaymentPurpose(details.purpose);

    return (
      <div className="space-y-2 text-xs font-sans w-full">
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-primary/10 pb-1.5">
          <span className="font-bold text-[10px] tracking-wider uppercase text-primary">
            {paymentTitle}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {method && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                {formatPaymentMethod(method)}
              </span>
            )}
            {purposeText && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gold/15 text-gold-darker border border-gold/30">
                {purposeText}
              </span>
            )}
          </div>
        </div>

        {details.amount !== undefined && (
          <div className="text-sm font-bold font-data text-primary">
            {formatINR(details.amount)}
          </div>
        )}

        <div className="space-y-1 text-[11px] text-text">
          {refNum && (
            <div className="flex items-center text-text-muted">
              <span className="font-semibold text-text">
                {details.utr ? "UTR: " : "Reference: "}
              </span>
              <span className="font-mono ml-1 text-primary">{refNum}</span>
              <CopyButton text={String(refNum)} />
            </div>
          )}
          {details.customerName && (
            <div>
              <span className="text-text-muted font-medium">Customer: </span>
              <span className="font-semibold">{details.customerName}</span>
            </div>
          )}
          {details.subscriptionId && (
            <div>
              <span className="text-text-muted font-medium">Subscription: </span>
              <span className="font-mono text-[10px]">{details.subscriptionId}</span>
            </div>
          )}
          {details.billingMonth && (
            <div>
              <span className="text-text-muted font-medium">Billing Month: </span>
              <span>{details.billingMonth}</span>
            </div>
          )}
          {details.invoiceId && (
            <div>
              <span className="text-text-muted font-medium">Invoice: </span>
              <span className="font-mono text-[10px]">{details.invoiceId}</span>
            </div>
          )}
        </div>

        {effectiveReason && (
          <div className="p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger font-medium">
            <span className="font-bold">Reason: </span>
            {effectiveReason}
          </div>
        )}

        {details.notes && !effectiveReason && (
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/10 text-text-muted">
            <span className="font-semibold text-text">Note: </span>
            {details.notes}
          </div>
        )}

        <RawJsonInspector details={details} />
      </div>
    );
  }

  // 3B. Delivery Partner Event Card
  if (isDeliveryPartner) {
    const meal = formatMeal(details.mealType);
    const assigned = details.newPartnerName || details.newPartnerId;
    const previous = details.oldPartnerName || details.oldPartnerId;

    return (
      <div className="space-y-2 text-xs font-sans w-full">
        <div className="flex items-center justify-between gap-2 border-b border-primary/10 pb-1.5">
          <span className="font-bold text-[10px] tracking-wider uppercase text-primary">
            DELIVERY PARTNER ASSIGNED
          </span>
          {meal && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              {meal}
            </span>
          )}
        </div>

        <div className="space-y-1 text-[11px]">
          {assigned && (
            <div>
              <span className="text-text-muted font-medium">Assigned Partner: </span>
              <span className="font-bold text-text">{assigned}</span>
            </div>
          )}
          {previous && (
            <div>
              <span className="text-text-muted font-medium">Previous Partner: </span>
              <span className="text-text opacity-80">{previous}</span>
            </div>
          )}
        </div>

        <RawJsonInspector details={details} />
      </div>
    );
  }

  // 3C. Subscription Event Card
  if (isSubscription) {
    const titleAction = effectiveAction
      ? effectiveAction.replace(/^subscription_/, "").replace(/_/g, " ").toUpperCase()
      : "EVENT";

    return (
      <div className="space-y-2 text-xs font-sans w-full">
        <div className="flex items-center justify-between gap-2 border-b border-primary/10 pb-1.5">
          <span className="font-bold text-[10px] tracking-wider uppercase text-primary">
            {`SUBSCRIPTION ${titleAction}`}
          </span>
          {details.planTier && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              {details.planTier}
            </span>
          )}
        </div>

        <div className="space-y-1 text-[11px]">
          {details.status && (
            <div>
              <span className="text-text-muted font-medium">Status: </span>
              <span className="font-semibold capitalize">{details.status}</span>
            </div>
          )}
          {(details.startDate || details.endDate) && (
            <div>
              <span className="text-text-muted font-medium">Period: </span>
              <span className="font-mono text-[10px]">
                {`${details.startDate || "Start"} → ${details.endDate || "Ongoing"}`}
              </span>
            </div>
          )}
          {(details.pauseStartDate || details.pauseEndDate) && (
            <div>
              <span className="text-text-muted font-medium">Pause: </span>
              <span className="font-mono text-[10px]">
                {`${details.pauseStartDate} → ${details.pauseEndDate || "Indefinite"}`}
              </span>
            </div>
          )}
          {effectiveReason && (
            <div className="p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger font-medium mt-1">
              <span className="font-bold">Reason: </span>
              {effectiveReason}
            </div>
          )}
        </div>

        <RawJsonInspector details={details} />
      </div>
    );
  }

  // 3D. Generic Structured Business Event (Pill / Key-Value rows)
  const entries = Object.entries(details).filter(
    ([k]) => k !== "action" && k !== "previousValue" && k !== "newValue",
  );

  return (
    <div className="space-y-2 text-xs font-sans w-full">
      {effectiveAction && (
        <div className="border-b border-primary/10 pb-1 font-bold text-[10px] uppercase tracking-wider text-primary">
          {effectiveAction.replace(/_/g, " ")}
        </div>
      )}

      {entries.length > 0 ? (
        <div className="grid grid-cols-1 gap-1 text-[11px]">
          {entries.map(([key, val]) => (
            <div key={key} className="flex items-baseline gap-1.5 break-all">
              <span className="font-semibold text-text-muted text-[10px] uppercase tracking-wider min-w-[90px] flex-shrink-0">
                {`${formatKey(key)}:`}
              </span>
              <span className="text-text font-medium">{formatValue(val)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {effectiveReason && (
        <div className="p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger font-medium">
          <span className="font-bold">Reason: </span>
          {effectiveReason}
        </div>
      )}

      <RawJsonInspector details={details} />
    </div>
  );
}
