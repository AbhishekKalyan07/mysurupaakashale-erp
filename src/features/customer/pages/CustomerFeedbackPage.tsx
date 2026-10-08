import { useState, useMemo } from "react";
import {
  MessageSquareWarning,
  MessageSquare,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
} from "lucide-react";
import { format } from "date-fns";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { LoadingScreen } from "@/shared/components/feedback/LoadingScreen";
import { FeedbackModal } from "../components/FeedbackModal";
import { useCustomerFeedback } from "../hooks/useCustomerFeedback";
import { formatTicketId } from "@/shared/utils/displayId";
import { parseFirestoreDate } from "@/shared/utils/dateUtils";
import type {
  FeedbackStatus,
  FeedbackCategory,
} from "@/shared/types/feedback.types";

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  food_quality: "Food Quality",
  delivery_issue: "Delivery Issue / Delay",
  packaging: "Packaging Problem",
  other: "Other",
};

const STATUS_CONFIG: Record<
  FeedbackStatus,
  {
    label: string;
    tone: "info" | "warning" | "success";
  }
> = {
  new: { label: "Received", tone: "info" },
  investigating: { label: "Under Review", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
};

function formatSafeDate(ts: unknown): string {
  const parsed = parseFirestoreDate(ts);
  if (!parsed) return "—";
  return format(parsed, "dd MMM yyyy, hh:mm a");
}

export function CustomerFeedbackPage() {
  const { data: tickets = [], isLoading, error, refetch } = useCustomerFeedback();
  const [filter, setFilter] = useState<FeedbackStatus | "all">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const counts = useMemo(() => {
    return {
      all: tickets.length,
      new: tickets.filter((t) => t.status === "new").length,
      investigating: tickets.filter((t) => t.status === "investigating").length,
      resolved: tickets.filter((t) => t.status === "resolved").length,
    };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    if (filter === "all") return tickets;
    return tickets.filter((t) => t.status === filter);
  }, [tickets, filter]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display text-primary font-bold">
              My Feedback & Tickets
            </h1>
            <p className="text-text-muted mt-2 font-sans font-medium">
              Track resolution notes and current status of your submitted tickets.
            </p>
          </div>
        </div>
        <ErrorState
          title="Failed to load feedback"
          description={(error as Error).message || "An error occurred while loading your tickets."}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display text-primary font-bold">
            My Feedback & Tickets
          </h1>
          <p className="text-text-muted mt-2 font-sans font-medium">
            Track operational review and admin resolution responses for issues you have reported.
          </p>
        </div>
        <Button
          id="report-issue-btn"
          onClick={() => setIsModalOpen(true)}
          className="shrink-0 self-start sm:self-auto"
        >
          <MessageSquareWarning size={16} className="mr-1.5" />
          Report an Issue
        </Button>
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          title="No Feedback or Support Tickets"
          description="You haven't submitted any feedback yet. If you ever experience any issue with your meals, delivery, or packaging, let us know and our team will resolve it."
          icon={<MessageSquare className="h-8 w-8 text-primary/60" />}
          action={
            <Button onClick={() => setIsModalOpen(true)}>
              <MessageSquareWarning size={16} className="mr-1.5" />
              Report an Issue
            </Button>
          }
        />
      ) : (
        <>
          {/* Status Filters */}
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/15 pb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5 mr-2">
              <Filter size={14} /> Filter:
            </span>
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                filter === "all"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface-2 text-text-muted hover:bg-surface-3"
              }`}
            >
              <span>All Tickets</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "all" ? "bg-white/20 text-white" : "bg-black/5 text-text-muted"
              }`}>
                {counts.all}
              </span>
            </button>
            <button
              onClick={() => setFilter("new")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                filter === "new"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface-2 text-text-muted hover:bg-surface-3"
              }`}
            >
              <span>Received</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "new" ? "bg-white/20 text-white" : "bg-black/5 text-text-muted"
              }`}>
                {counts.new}
              </span>
            </button>
            <button
              onClick={() => setFilter("investigating")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                filter === "investigating"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface-2 text-text-muted hover:bg-surface-3"
              }`}
            >
              <span>Under Review</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "investigating" ? "bg-white/20 text-white" : "bg-black/5 text-text-muted"
              }`}>
                {counts.investigating}
              </span>
            </button>
            <button
              onClick={() => setFilter("resolved")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                filter === "resolved"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface-2 text-text-muted hover:bg-surface-3"
              }`}
            >
              <span>Resolved</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "resolved" ? "bg-white/20 text-white" : "bg-black/5 text-text-muted"
              }`}>
                {counts.resolved}
              </span>
            </button>
          </div>

          {/* Ticket List */}
          {filteredTickets.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-primary/20 bg-surface-2/40">
              <p className="text-sm text-text-muted font-medium">
                No tickets found for the selected &ldquo;{filter}&rdquo; filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:gap-6">
              {filteredTickets.map((ticket) => {
                const config = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.new;
                const createdDateStr = formatSafeDate(ticket.createdAt);
                const updatedDateStr = ticket.updatedAt ? formatSafeDate(ticket.updatedAt) : null;
                const displayTicketId = formatTicketId(ticket.id);

                return (
                  <Card
                    key={ticket.id}
                    className="p-5 sm:p-6 transition-all hover:shadow-sm"
                  >
                    <div className="space-y-4">
                      {/* Ticket Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-primary/10 pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            aria-label={`Ticket Reference ${displayTicketId}`}
                            className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary"
                          >
                            {displayTicketId}
                          </span>
                          <span className="text-xs font-bold uppercase tracking-wider text-primary/70 bg-primary/5 px-2.5 py-0.5 rounded">
                            {CATEGORY_LABELS[ticket.category] || ticket.category}
                          </span>
                          {ticket.orderId && (
                            <span className="text-xs text-text-muted font-medium">
                              Order Ref: {ticket.orderId}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 self-start sm:self-auto">
                          <Badge
                            tone={config.tone}
                            dot
                            className="text-xs font-bold uppercase tracking-wider"
                          >
                            {config.label}
                          </Badge>
                          <span className="text-xs text-text-muted flex items-center gap-1 font-sans">
                            <Clock size={13} className="text-text-muted" />
                            {createdDateStr}
                          </span>
                        </div>
                      </div>

                      {/* Ticket Description */}
                      <div>
                        <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1 font-sans">
                          Customer Description
                        </h4>
                        <p className="text-sm font-medium text-text whitespace-pre-wrap leading-relaxed">
                          {ticket.message}
                        </p>
                      </div>

                      {/* Admin Resolution Section */}
                      <div className="pt-2">
                        {ticket.resolutionNotes ? (
                          <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                                <CheckCircle2 size={15} className="text-emerald-600" />
                                Admin Resolution Response
                              </span>
                              {updatedDateStr && (
                                <span className="text-xs text-emerald-700 font-medium">
                                  {ticket.status === "resolved" ? "Resolved" : "Updated"}: {updatedDateStr}
                                </span>
                              )}
                            </div>
                            <p className="text-sm leading-relaxed text-emerald-900 whitespace-pre-wrap font-medium">
                              {ticket.resolutionNotes}
                            </p>
                          </div>
                        ) : ticket.status === "resolved" ? (
                          <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200/60 flex flex-wrap items-center justify-between gap-2 text-emerald-900">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                              <span className="text-xs font-semibold">
                                This issue has been reviewed and marked as resolved by our operations team.
                              </span>
                            </div>
                            {updatedDateStr && (
                              <span className="text-xs text-emerald-700 font-medium">
                                Resolved: {updatedDateStr}
                              </span>
                            )}
                          </div>
                        ) : ticket.status === "investigating" ? (
                          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-amber-900">
                            <div className="flex items-center gap-2">
                              <AlertCircle size={16} className="text-amber-600 shrink-0" />
                              <span className="text-xs font-semibold">
                                Our operations team is currently investigating this issue. Resolution notes will appear here soon.
                              </span>
                            </div>
                            {updatedDateStr && (
                              <span className="text-xs text-amber-700 font-medium">
                                Updated: {updatedDateStr}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="p-3.5 rounded-xl bg-surface-2 border border-border flex items-center gap-2 text-text-muted">
                            <Clock size={15} className="text-text-muted shrink-0" />
                            <span className="text-xs font-medium">
                              Ticket received and queued for review by the operations team.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal for reporting feedback */}
      <FeedbackModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
