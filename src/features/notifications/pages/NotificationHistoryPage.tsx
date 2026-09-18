import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseFirestoreDate } from "@/shared/utils/dateUtils";
import { useNotificationHistory } from "@/features/notifications/hooks/useNotifications";
import { LoadingScreen } from "@/shared/components/feedback/LoadingScreen";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { AdminSendNotificationModal } from "../components/AdminSendNotificationModal";
import type { Notification } from "@/shared/types";
import {
  History,
  Search,
  Bell,
  CreditCard,
  Truck,
  User,
  AlertCircle,
  Info,
  ShoppingBag,
  Settings,
  Send,
} from "lucide-react";
import { format } from "date-fns";

function ChannelBadge({ channel }: { channel: string }) {
  const tone =
    channel === "email"
      ? "info"
      : channel === "whatsapp"
        ? "success"
        : "default";
  return (
    <Badge variant={tone} className="text-[9px] uppercase font-bold">
      {channel.replace("_", "-")}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "delivered" || status === "read"
      ? "success"
      : status === "failed"
        ? "danger"
        : status === "pending"
          ? "warning"
          : "default";
  return (
    <Badge variant={tone} className="text-[9px] uppercase font-bold">
      {status}
    </Badge>
  );
}

function TypeIcon({ type }: { type: string }) {
  const cls = "shrink-0 text-text-muted";
  if (type.includes("payment")) return <CreditCard size={14} className="shrink-0 text-amber-600" />;
  if (type.includes("subscription"))
    return <ShoppingBag size={14} className="shrink-0 text-blue-600" />;
  if (
    type.includes("delivery") ||
    type.includes("out_for") ||
    type === "delivered"
  )
    return <Truck size={14} className="shrink-0 text-emerald-600" />;
  if (type.includes("staff") || type.includes("role"))
    return <User size={14} className="shrink-0 text-purple-600" />;
  if (type.includes("settings") || type.includes("backup"))
    return <Settings size={14} className={cls} />;
  if (type.includes("error"))
    return <AlertCircle size={14} className="shrink-0 text-danger" />;
  return <Info size={14} className={cls} />;
}

function NotificationRow({ n }: { n: Notification }) {
  const [expanded, setExpanded] = useState(false);
  const parsedDate = parseFirestoreDate(n.createdAt);
  const dateStr = parsedDate ? format(parsedDate, "MMM dd, yyyy HH:mm") : "—";

  return (
    <>
      <tr
        className="block md:table-row bg-card md:bg-transparent hover:bg-primary/[0.03] cursor-pointer border-b border-border transition-colors p-4 md:p-0 space-y-3 md:space-y-0"
        onClick={() => setExpanded((p) => !p)}
      >
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3.5">
          <span className="md:hidden font-semibold text-text-muted text-[10px] uppercase tracking-wider">
            Type
          </span>
          <div className="flex items-center gap-2">
            <TypeIcon type={n.type} />
            <span className="text-xs font-mono text-text-muted">{n.type}</span>
          </div>
        </td>
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3.5">
          <span className="md:hidden font-semibold text-text-muted text-[10px] uppercase tracking-wider">
            Title / Recipient
          </span>
          <div className="text-right md:text-left">
            <div className="font-semibold text-text text-sm">{n.title}</div>
            <div className="text-text-muted font-mono text-xs truncate max-w-[180px]">
              {n.recipientId}
            </div>
          </div>
        </td>
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3.5">
          <span className="md:hidden font-semibold text-text-muted text-[10px] uppercase tracking-wider">
            Channel
          </span>
          <ChannelBadge channel={n.channel} />
        </td>
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3.5">
          <span className="md:hidden font-semibold text-text-muted text-[10px] uppercase tracking-wider">
            Status
          </span>
          <StatusBadge status={n.status} />
        </td>
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3.5 text-xs text-text-muted font-sans">
          <span className="md:hidden font-semibold text-text-muted text-[10px] uppercase tracking-wider">
            Created
          </span>
          {dateStr}
        </td>
        <td className="flex justify-between items-center md:table-cell px-0 py-1 md:px-4 md:py-3.5 text-center text-xs text-text-muted font-data">
          <span className="md:hidden font-semibold text-text-muted text-[10px] uppercase tracking-wider">
            Retries
          </span>
          {n.retryCount}
        </td>
      </tr>
      {expanded && (
        <tr className="block md:table-row bg-surface-2 border-b border-border">
          <td colSpan={6} className="block md:table-cell px-4 md:px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
              <div>
                <div className="text-text-muted uppercase tracking-wider font-semibold mb-1">
                  Message
                </div>
                <div className="text-text leading-relaxed font-medium">{n.message}</div>
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-text-muted uppercase tracking-wider font-semibold">
                    Related Entity:{" "}
                  </span>
                  <span className="font-mono text-text">
                    {n.relatedEntityType ?? "—"} / {n.relatedEntityId ?? "—"}
                  </span>
                </div>
                {n.errorMessage && (
                  <div>
                    <span className="text-danger font-semibold">Error: </span>
                    <span className="text-danger">{n.errorMessage}</span>
                  </div>
                )}
                {n.sentAt && (
                  <div>
                    <span className="text-text-muted">Sent: </span>
                    <span className="text-text font-mono">
                      {parseFirestoreDate(n.sentAt)
                        ? format(
                            parseFirestoreDate(n.sentAt) as Date,
                            "MMM dd, HH:mm",
                          )
                        : "—"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function NotificationHistoryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showSendModal, setShowSendModal] = useState(false);
  const {
    data: notifications,
    isLoading,
    error,
    refetch,
  } = useNotificationHistory();

  if (isLoading) return <LoadingScreen />;
  if (error) {
    return (
      <ErrorState
        title="Could not load notification history"
        description="Please try again."
        onRetry={refetch}
      />
    );
  }

  const filtered = (notifications ?? []).filter((n) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      n.type.toLowerCase().includes(q) ||
      n.recipientId.toLowerCase().includes(q) ||
      n.message.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 lg:py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-primary flex items-center gap-3">
            <History className="text-gold" size={32} />
            Notification History
          </h1>
          <p className="text-text-muted font-sans text-sm md:text-base mt-2">
            Complete audit trail of all notifications across all delivery channels.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap self-start md:self-auto">
          <Button
            variant="primary"
            onClick={() => setShowSendModal(true)}
            className="gap-2 font-sans font-bold shadow-sm min-h-[44px]"
          >
            <Send size={16} /> Send Notification
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate("/admin/notifications")}
            className="gap-2 font-sans font-bold shadow-sm min-h-[44px]"
          >
            <Bell size={16} /> Notification Center
          </Button>
        </div>
      </div>

      <div className="relative mb-6">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by type, title, recipient, message..."
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm font-sans focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-colors shadow-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Bell size={40} className="text-text-muted/40" />}
          title="No notification history"
          description="No notifications have been sent yet."
        />
      ) : (
        <Card className="border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full text-sm block md:table">
              <thead className="hidden md:table-header-group bg-surface-2 border-b border-border text-text-muted text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Title / Recipient</th>
                  <th className="px-4 py-3 text-left">Channel</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-center">Retries</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group divide-y divide-border/60">
                {filtered.map((n) => (
                  <NotificationRow key={n.id} n={n} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border bg-surface-2 text-xs text-text-muted font-sans font-medium">
            Showing {filtered.length} notification
            {filtered.length !== 1 ? "s" : ""}
          </div>
        </Card>
      )}

      {/* Admin Send Notification Modal */}
      <AdminSendNotificationModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
      />
    </div>
  );
}
