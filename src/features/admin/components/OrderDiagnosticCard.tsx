import { useState } from "react";
import {
  Calendar,
  CalendarOff,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  PauseCircle,
  SkipForward,
  Clock,
  PackageSearch,
  ChevronDown,
  ChevronUp,
  XCircle,
  ShieldCheck,
} from "lucide-react";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import type { OrderDiagnosticResult } from "@/shared/services/business/orderDiagnosticService";
import { cn } from "@/shared/lib/cn";

interface OrderDiagnosticCardProps {
  diagnostic: OrderDiagnosticResult | null;
  isChecking: boolean;
  onRecheck: () => void;
  compact?: boolean;
  className?: string;
}

export function OrderDiagnosticCard({
  diagnostic,
  isChecking,
  onRecheck,
  compact = false,
  className,
}: OrderDiagnosticCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (isChecking) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center p-8 rounded-[20px] border border-secondary/30 bg-pastel-lavender/30 text-center animate-pulse",
          className,
        )}
      >
        <RefreshCw className="h-8 w-8 animate-spin text-secondary mb-3" />
        <h4 className="text-base font-display font-semibold text-primary">
          Analyzing Order Schedules & Deliveries...
        </h4>
        <p className="text-xs text-text-muted mt-1 max-w-sm">
          Checking active subscriptions, pause intervals, customer skips, and zone routing for this date.
        </p>
      </div>
    );
  }

  if (!diagnostic) {
    return null;
  }

  const {
    status,
    summaryText,
    pausedCustomers = [],
    skippedCustomers = [],
    cancelledOrders = [],
    futureSubscribers = [],
    faultDetails = [],
    autoHealedCount = 0,
  } = diagnostic;

  const hasBreakdown =
    pausedCustomers.length > 0 ||
    skippedCustomers.length > 0 ||
    cancelledOrders.length > 0 ||
    futureSubscribers.length > 0 ||
    faultDetails.length > 0;

  // Visual themes according to diagnosis status
  let icon = <PackageSearch className="h-6 w-6 text-text-muted" />;
  let cardBg = "bg-surface-2 border-border";
  let titleColor = "text-text";
  let badgeText = "Status";
  let badgeClass = "bg-surface-3 text-text-muted";
  let title = "Order Generation Report";

  switch (status) {
    case "sunday_holiday":
      icon = <Calendar className="h-6 w-6 text-amber-500" />;
      cardBg = "bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40";
      titleColor = "text-amber-900 dark:text-amber-300";
      badgeText = "Weekly Off";
      badgeClass = "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200";
      title = "Sunday Weekly Holiday";
      break;

    case "official_holiday":
      icon = <CalendarOff className="h-6 w-6 text-purple-600 dark:text-purple-400" />;
      cardBg = "bg-purple-50/80 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40";
      titleColor = "text-purple-900 dark:text-purple-300";
      badgeText = "Kitchen Closed";
      badgeClass = "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200";
      title = "Scheduled Kitchen Holiday";
      break;

    case "all_paused_or_skipped":
      icon = <PauseCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />;
      cardBg = "bg-blue-50/80 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40";
      titleColor = "text-blue-900 dark:text-blue-300";
      badgeText = "Paused / Skipped";
      badgeClass = "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200";
      title = "All Active Subscriptions Paused or Skipped";
      break;

    case "future_only":
      icon = <Clock className="h-6 w-6 text-teal-600 dark:text-teal-400" />;
      cardBg = "bg-teal-50/80 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800/40";
      titleColor = "text-teal-900 dark:text-teal-300";
      badgeText = "Upcoming";
      badgeClass = "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200";
      title = "No Subscriptions Active For This Date";
      break;

    case "no_active_subscriptions":
      icon = <PackageSearch className="h-6 w-6 text-text-muted" />;
      cardBg = "bg-surface-2 border-border";
      titleColor = "text-text";
      badgeText = "No Subscribers";
      badgeClass = "bg-surface-3 text-text-muted";
      title = "No Active Subscriptions";
      break;

    case "fault_detected":
      icon = <AlertTriangle className="h-6 w-6 text-danger" />;
      cardBg = "bg-danger-subtle/40 border-danger/30";
      titleColor = "text-danger";
      badgeText = "Action Required";
      badgeClass = "bg-danger-subtle text-danger border border-danger/30";
      title = "Configuration Fault Detected";
      break;

    case "auto_healed":
      icon = <CheckCircle2 className="h-6 w-6 text-success" />;
      cardBg = "bg-success-subtle/30 border-success/30";
      titleColor = "text-success";
      badgeText = "Self-Healed";
      badgeClass = "bg-success-subtle text-success";
      title = `Auto-Generated ${autoHealedCount} Missing Order(s)`;
      break;

    case "healthy":
      icon = <ShieldCheck className="h-6 w-6 text-secondary" />;
      cardBg = "bg-pastel-lavender/30 border-secondary/30";
      titleColor = "text-primary";
      badgeText = "Healthy";
      badgeClass = "bg-secondary/10 text-secondary";
      title = "Order Health Validated";
      break;
  }

  return (
    <div
      className={cn(
        "rounded-[20px] border p-5 transition-all shadow-xs",
        cardBg,
        className,
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-[14px] bg-card shadow-xs shrink-0 mt-0.5">
            {icon}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className={cn("text-base font-display font-bold", titleColor)}>
                {title}
              </h4>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider",
                  badgeClass,
                )}
              >
                {badgeText}
              </span>
            </div>
            <p className="text-sm text-text-muted mt-1 max-w-2xl leading-relaxed">
              {summaryText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          {hasBreakdown && !compact && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-text px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-surface-2 transition-colors"
            >
              {showDetails ? (
                <>
                  <span>Hide Details</span>
                  <ChevronUp size={14} />
                </>
              ) : (
                <>
                  <span>View Details</span>
                  <ChevronDown size={14} />
                </>
              )}
            </button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={onRecheck}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <RefreshCw size={13} />
            <span>Re-check Orders</span>
          </Button>
        </div>
      </div>

      {/* Summary Pills */}
      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/40">
        <span className="text-xs font-semibold text-text-faint uppercase tracking-wider">
          Daily Impact:
        </span>

        {pausedCustomers.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100/70 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
            <PauseCircle size={13} />
            {pausedCustomers.length} Paused
          </span>
        )}

        {skippedCustomers.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100/70 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
            <SkipForward size={13} />
            {skippedCustomers.length} Skipped
          </span>
        )}

        {cancelledOrders.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <XCircle size={13} />
            {cancelledOrders.length} Cancelled (Preserved)
          </span>
        )}

        {futureSubscribers.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-100/70 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300">
            <Clock size={13} />
            {futureSubscribers.length} Future Starts
          </span>
        )}

        {faultDetails.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-danger-subtle text-danger">
            <AlertTriangle size={13} />
            {faultDetails.length} Fault(s)
          </span>
        )}

        {pausedCustomers.length === 0 &&
          skippedCustomers.length === 0 &&
          cancelledOrders.length === 0 &&
          futureSubscribers.length === 0 &&
          faultDetails.length === 0 && (
            <span className="text-xs text-text-muted">No pause or skip restrictions recorded for this date.</span>
          )}
      </div>

      {/* Expandable Breakdown Drawer */}
      {showDetails && hasBreakdown && (
        <div className="mt-4 pt-4 border-t border-border/60 space-y-3">
          {/* Fault details */}
          {faultDetails.length > 0 && (
            <div className="bg-danger-subtle/50 rounded-xl p-3 border border-danger/30 space-y-1.5">
              <h5 className="text-xs font-bold text-danger uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={14} /> Attention Needed (Routing / Setup Faults)
              </h5>
              <div className="space-y-1">
                {faultDetails.map((f, idx) => (
                  <div key={idx} className="text-xs text-text flex items-start gap-2">
                    <span className="font-semibold text-danger">{f.customerName}:</span>
                    <span>{f.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paused customers */}
          {pausedCustomers.length > 0 && (
            <div className="bg-card rounded-xl p-3 border border-border space-y-1.5">
              <h5 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <PauseCircle size={14} className="text-amber-500" /> Paused Subscriptions
              </h5>
              <div className="grid gap-2 sm:grid-cols-2">
                {pausedCustomers.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-surface-2 text-xs"
                  >
                    <span className="font-medium text-text">{p.customerName}</span>
                    <span className="text-text-muted">
                      {p.pauseStartDate && p.pauseEndDate
                        ? `${p.pauseStartDate} to ${p.pauseEndDate}`
                        : "Indefinitely paused"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skipped customers */}
          {skippedCustomers.length > 0 && (
            <div className="bg-card rounded-xl p-3 border border-border space-y-1.5">
              <h5 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <SkipForward size={14} className="text-blue-500" /> Customer Skips Today
              </h5>
              <div className="grid gap-2 sm:grid-cols-2">
                {skippedCustomers.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-surface-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-text block">{s.customerName}</span>
                      {s.reason && (
                        <span className="text-[11px] text-text-muted italic">"{s.reason}"</span>
                      )}
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold text-[11px]">
                      {s.mealTypes.join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cancelled orders */}
          {cancelledOrders.length > 0 && (
            <div className="bg-card rounded-xl p-3 border border-border space-y-1.5">
              <h5 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <XCircle size={14} className="text-slate-500" /> Cancelled Orders (Strictly Excluded)
              </h5>
              <div className="grid gap-2 sm:grid-cols-2">
                {cancelledOrders.map((c, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-surface-2 text-xs"
                  >
                    <span className="font-medium text-text">{c.customerName}</span>
                    <span className="text-text-muted capitalize">
                      {c.mealType} · Cancelled by customer
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Future subscribers */}
          {futureSubscribers.length > 0 && (
            <div className="bg-card rounded-xl p-3 border border-border space-y-1.5">
              <h5 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={14} className="text-teal-500" /> Upcoming Subscriptions
              </h5>
              <div className="grid gap-2 sm:grid-cols-2">
                {futureSubscribers.map((fs, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-surface-2 text-xs"
                  >
                    <span className="font-medium text-text">{fs.customerName}</span>
                    <span className="text-teal-600 dark:text-teal-400 font-medium">
                      Starts {fs.startDate}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
