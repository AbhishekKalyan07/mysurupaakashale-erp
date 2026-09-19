import { useState, useEffect } from "react";
import {
  Send,
  Users,
  User,
  Truck,
  ChefHat,
  Shield,
  Bell,
  CreditCard,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { PremiumModal } from "@/shared/components/ui/PremiumModal";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumInput as Input } from "@/shared/components/ui/PremiumInput";
import {
  sendAdminBroadcastNotification,
  type BroadcastNotificationParams,
} from "@/shared/services/firestore/notificationService";
import { userRepository } from "@/shared/services/firestore/userRepository";
import type { UserProfile, NotificationType, NotificationPriority } from "@/shared/types";
import { toast } from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/queryKeys";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminSendNotificationModal({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  const [targetAudience, setTargetAudience] = useState<
    BroadcastNotificationParams["targetAudience"]
  >("customer");
  const [specificUserId, setSpecificUserId] = useState("");
  const [type, setType] = useState<NotificationType>("system_alert");
  const [priority, setPriority] = useState<NotificationPriority>("normal");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  // For specific user selection
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && targetAudience === "specific_user") {
      setIsLoadingUsers(true);
      userRepository
        .list()
        .then((users) => {
          setCustomers(users.filter((u) => u.isActive !== false));
        })
        .catch((err) => {
          console.error("Failed to load users for notification modal:", err);
        })
        .finally(() => {
          setIsLoadingUsers(false);
        });
    }
  }, [isOpen, targetAudience]);

  const filteredUsers = customers.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      (u.fullName || "").toLowerCase().includes(q) ||
      (u.phone || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q)
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a notification title");
      return;
    }
    if (!message.trim()) {
      toast.error("Please enter a notification message");
      return;
    }
    if (targetAudience === "specific_user" && !specificUserId) {
      toast.error("Please select a recipient");
      return;
    }

    setIsSending(true);
    try {
      const selectedUser = customers.find((u) => u.id === specificUserId);
      const res = await sendAdminBroadcastNotification({
        targetAudience,
        specificUserId: specificUserId || undefined,
        specificUserRole: selectedUser?.role || "customer",
        type,
        title: title.trim(),
        message: message.trim(),
        priority,
      });

      toast.success(
        `Notification sent successfully to ${res.recipientCount} recipient${res.recipientCount !== 1 ? "s" : ""}!`,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      onClose();
      // Reset form
      setTitle("");
      setMessage("");
      setSpecificUserId("");
      setUserSearch("");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to send notification.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PremiumModal
      isOpen={isOpen}
      onClose={onClose}
      title="Compose & Send Notification"
      className="max-w-2xl max-h-[90dvh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="space-y-5 font-sans">
        {/* Target Audience */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text mb-2">
            Target Audience
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: "customer", label: "All Customers", icon: Users },
              { id: "delivery_partner", label: "Delivery Partners", icon: Truck },
              { id: "kitchen", label: "Kitchen Staff", icon: ChefHat },
              { id: "staff", label: "All Staff", icon: Shield },
              { id: "all", label: "Everyone", icon: Sparkles },
              { id: "specific_user", label: "Specific User", icon: User },
            ].map((opt) => {
              const Icon = opt.icon;
              const isSelected = targetAudience === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setTargetAudience(
                      opt.id as BroadcastNotificationParams["targetAudience"],
                    )
                  }
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all text-left ${
                    isSelected
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-surface-2 text-text hover:bg-surface-3 border-border"
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Specific User Dropdown if chosen */}
        {targetAudience === "specific_user" && (
          <div className="bg-surface-2 p-3.5 rounded-xl border border-border">
            <label className="block text-xs font-bold text-text mb-1.5">
              Select Recipient
            </label>
            {isLoadingUsers ? (
              <p className="text-xs text-text-muted">Loading user accounts…</p>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Filter users by name, phone, or email..."
                  className="w-full h-10 px-3 rounded-lg border border-border bg-white text-xs placeholder:text-text-muted/60 focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <select
                  value={specificUserId}
                  onChange={(e) => setSpecificUserId(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  required
                >
                  <option value="">
                    -- Choose User ({filteredUsers.length} available) --
                  </option>
                  {filteredUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || "Unnamed"} ({u.phone || u.email || u.id}) — [
                      {u.role}]
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Category & Priority Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text mb-1.5">
              Notification Category
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as NotificationType)}
              className="w-full h-11 px-3 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="system_alert">📢 General Announcement</option>
              <option value="kitchen_production_ready">🍽️ Menu / Food Update</option>
              <option value="out_for_delivery">🛵 Delivery Notice</option>
              <option value="payment_reminder">💳 Payment Reminder</option>
              <option value="subscription_renewal_reminder">
                📋 Subscription Notice
              </option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text mb-1.5">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as NotificationPriority)
              }
              className="w-full h-11 px-3 rounded-lg border border-border bg-white text-sm focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="normal">Normal (Standard In-App Alert)</option>
              <option value="high">High (Prominent Golden Tag)</option>
              <option value="critical">Critical (Urgent Alert)</option>
            </select>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text mb-1.5">
            Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Special Festival Feast Today!"
            maxLength={100}
            required
            className="w-full h-11"
          />
        </div>

        {/* Message */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text mb-1.5">
            Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write the message that users will receive in their notification drawer..."
            rows={3}
            maxLength={400}
            required
            className="w-full rounded-xl border border-border bg-white p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none leading-relaxed"
          />
          <span className="text-[11px] text-text-muted float-right mt-1">
            {message.length} / 400 characters
          </span>
        </div>

        {/* Live Preview Card */}
        <div className="pt-2">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
            Recipient Live Preview
          </label>
          <div className="p-4 rounded-xl border border-primary/15 bg-primary/[0.03] flex items-start gap-3">
            <div className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {type.includes("payment") ? (
                <CreditCard size={18} className="text-amber-600" />
              ) : type.includes("delivery") ? (
                <Truck size={18} className="text-emerald-600" />
              ) : type.includes("subscription") ? (
                <ShoppingBag size={18} className="text-blue-600" />
              ) : (
                <Bell size={18} className="text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-primary truncate">
                  {title || "Notification Title"}
                </span>
                {priority === "critical" && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-danger/10 text-danger border border-danger/20 shrink-0">
                    Critical
                  </span>
                )}
                {priority === "high" && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-gold/10 text-gold border border-gold/30 shrink-0">
                    High
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted mt-0.5 leading-relaxed line-clamp-2">
                {message ||
                  "Your notification message will appear here for recipients."}
              </p>
              <span className="text-[10px] text-text-muted/60 font-semibold mt-1 inline-block">
                Just now
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSending}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={isSending}
            className="min-h-[44px] gap-2 font-bold px-5"
          >
            <Send size={16} /> Send Notification
          </Button>
        </div>
      </form>
    </PremiumModal>
  );
}
