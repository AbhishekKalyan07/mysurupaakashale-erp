import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from "lucide-react";
import { HeroBanner } from "@/shared/components/ui/HeroBanner";
import { PremiumCard } from "@/shared/components/ui/PremiumCard";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { failureQueueService } from "../services/failureQueueService";
import type { FailureQueueRecord } from "@/shared/services/firestore/failureQueueRepository";
import { useAuth } from "@/features/auth/hooks/useAuth";
import toast from "react-hot-toast";

type FilterStatus = "all" | "pending" | "resolved" | "ignored";

export function AdminFailureQueuePage() {
  const queryClient = useQueryClient();
  const { profile, firebaseUser } = useAuth();
  const [filter, setFilter] = useState<FilterStatus>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);

  const adminActor = useMemo(() => ({
    uid: firebaseUser?.uid || profile?.id || "admin",
    role: "admin",
    name: profile?.fullName || profile?.email || "Admin User",
  }), [firebaseUser, profile]);

  const {
    data: incidents = [],
    isLoading,
    error,
    refetch,
  } = useQuery<FailureQueueRecord[]>({
    queryKey: ["admin", "failureQueue", filter],
    queryFn: () =>
      failureQueueService.listFailures(
        filter === "all" ? undefined : filter,
      ),
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      return failureQueueService.retryFailure(id, adminActor);
    },
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["admin", "failureQueue"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to retry incident");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return failureQueueService.resolveFailure(id, adminActor, reason);
    },
    onSuccess: () => {
      toast.success("Incident marked as resolved");
      queryClient.invalidateQueries({ queryKey: ["admin", "failureQueue"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to resolve incident");
    },
  });

  const ignoreMutation = useMutation({
    mutationFn: async (id: string) => {
      return failureQueueService.ignoreFailure(id, adminActor);
    },
    onSuccess: () => {
      toast.success("Incident marked as ignored");
      queryClient.invalidateQueries({ queryKey: ["admin", "failureQueue"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to ignore incident");
    },
  });

  const filteredIncidents = useMemo(() => {
    if (!searchQuery.trim()) return incidents;
    const q = searchQuery.toLowerCase();
    return incidents.filter(
      (item) =>
        item.customerId?.toLowerCase().includes(q) ||
        item.subscriptionId?.toLowerCase().includes(q) ||
        item.reason?.toLowerCase().includes(q) ||
        item.date?.includes(q) ||
        item.mealType?.toLowerCase().includes(q),
    );
  }, [incidents, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: incidents.length,
      pending: incidents.filter((i) => i.status === "pending").length,
      resolved: incidents.filter((i) => i.status === "resolved").length,
      retried: incidents.filter((i) => (i.retryCount || 0) > 0).length,
    };
  }, [incidents]);

  if (error) {
    return (
      <ErrorState
        title="Failed to load Failure Queue incidents"
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <HeroBanner
        title="Failure Queue & Incident Resolution"
        subtitle="Quarantined operational failures from daily automation and order generation"
      />

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <PremiumCard className="p-4 flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">Pending Action</div>
          </div>
        </PremiumCard>

        <PremiumCard className="p-4 flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.retried}</div>
            <div className="text-xs text-muted-foreground">Retries Run</div>
          </div>
        </PremiumCard>

        <PremiumCard className="p-4 flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.resolved}</div>
            <div className="text-xs text-muted-foreground">Resolved</div>
          </div>
        </PremiumCard>

        <PremiumCard className="p-4 flex items-center gap-3">
          <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total In View</div>
          </div>
        </PremiumCard>
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1">
          {(["pending", "all", "resolved", "ignored"] as FilterStatus[]).map((tab) => (
            <button
              key={tab}
              id={`tab-${tab}`}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                filter === tab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            id="failure-queue-search"
            type="text"
            placeholder="Search by customer, sub, or error..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Incidents List */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          <span>Loading failure queue...</span>
        </div>
      ) : filteredIncidents.length === 0 ? (
        <PremiumCard className="p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold">No Quarantined Incidents</h3>
          <p className="text-sm text-muted-foreground mt-1">
            There are no incidents matching the current status filter.
          </p>
        </PremiumCard>
      ) : (
        <div className="space-y-3">
          {filteredIncidents.map((incident) => {
            const isExpanded = expandedTraceId === incident.id;
            const isPending = incident.status === "pending";

            return (
              <PremiumCard
                key={incident.id}
                id={`incident-card-${incident.id}`}
                className="p-5 transition-all hover:border-primary/20"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Incident Info */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                          incident.status === "pending"
                            ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                            : incident.status === "resolved"
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {incident.status.toUpperCase()}
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        {incident.mealType?.toUpperCase() || "MEAL"}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {incident.date}
                      </span>
                      {incident.retryCount > 0 && (
                        <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-md">
                          Retries: {incident.retryCount}
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-medium text-foreground">
                      {incident.reason}
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span>Customer: <code className="bg-muted px-1.5 py-0.5 rounded">{incident.customerId}</code></span>
                      {incident.subscriptionId && (
                        <span>Subscription: <code className="bg-muted px-1.5 py-0.5 rounded">{incident.subscriptionId}</code></span>
                      )}
                      {incident.resolvedBy && (
                        <span>Resolved by: <code className="bg-muted px-1.5 py-0.5 rounded">{incident.resolvedBy}</code></span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end md:self-center">
                    {incident.stackTrace && (
                      <button
                        onClick={() =>
                          setExpandedTraceId(isExpanded ? null : incident.id)
                        }
                        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted/50 rounded-lg flex items-center gap-1"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" /> Hide Trace
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" /> Stack Trace
                          </>
                        )}
                      </button>
                    )}

                    {isPending && (
                      <>
                        <button
                          id={`btn-retry-${incident.id}`}
                          disabled={retryMutation.isPending}
                          onClick={() => retryMutation.mutate(incident.id)}
                          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              retryMutation.isPending ? "animate-spin" : ""
                            }`}
                          />
                          Retry
                        </button>

                        <button
                          id={`btn-resolve-${incident.id}`}
                          disabled={resolveMutation.isPending}
                          onClick={() =>
                            resolveMutation.mutate({ id: incident.id })
                          }
                          className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Resolve
                        </button>

                        <button
                          id={`btn-ignore-${incident.id}`}
                          disabled={ignoreMutation.isPending}
                          onClick={() => ignoreMutation.mutate(incident.id)}
                          className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/60 rounded-lg transition-colors"
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Collapsible Stack Trace */}
                {isExpanded && incident.stackTrace && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">
                      Exception Stack Trace:
                    </div>
                    <pre className="text-xs bg-muted/70 p-3 rounded-lg overflow-x-auto text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap">
                      {incident.stackTrace}
                    </pre>
                  </div>
                )}
              </PremiumCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
