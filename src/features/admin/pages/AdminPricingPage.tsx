import { useState } from "react";
import {
  usePricingConfigurations,
  useCreatePricingConfig,
  useDeletePricingConfig,
  useEffectivePricing,
} from "../hooks/usePricing";
import { getTodayIST } from "@/shared/lib/date";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PageHeader } from "@/shared/components/layout/PageHeader";
import { LoadingScreen } from "@/shared/components/feedback/LoadingScreen";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import {
  Calendar,
  Plus,
  ShieldCheck,
  Clock,
  Trash2,
  AlertTriangle,
  X,
  Layers,
} from "lucide-react";
import type { PricingConfiguration } from "@/shared/types";

export function AdminPricingPage() {
  const today = getTodayIST();
  const { data: configs = [], isLoading, error, refetch } = usePricingConfigurations();
  const { data: currentMatrix } = useEffectivePricing(today);
  const createMutation = useCreatePricingConfig();
  const deleteMutation = useDeletePricingConfig();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [scope, setScope] = useState("general");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [breakfast, setBreakfast] = useState(60);
  const [lunch, setLunch] = useState(85);
  const [dinner, setDinner] = useState(85);
  const [breakfastLunch, setBreakfastLunch] = useState<number | "">("");
  const [lunchDinner, setLunchDinner] = useState<number | "">("");
  const [fullDay, setFullDay] = useState<number | "">("");

  if (isLoading) return <LoadingScreen message="Loading pricing configurations..." />;
  if (error) return <ErrorState title="Failed to load pricing" onRetry={() => refetch()} />;

  const activeConfigs = configs.filter(
    (c) => c.effectiveFrom <= today && (!c.effectiveTo || c.effectiveTo >= today),
  );
  const scheduledConfigs = configs.filter((c) => c.effectiveFrom > today);
  const pastConfigs = configs.filter((c) => c.effectiveTo && c.effectiveTo < today);

  const handleOpenCreateModal = () => {
    setName("");
    setScope("general");
    setEffectiveFrom("");
    setEffectiveTo("");
    setBreakfast(60);
    setLunch(85);
    setDinner(85);
    setBreakfastLunch("");
    setLunchDinner("");
    setFullDay("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!effectiveFrom) {
      setFormError("Effective From date is required.");
      return;
    }

    if (effectiveTo && effectiveTo < effectiveFrom) {
      setFormError("Effective To date must be on or after Effective From date.");
      return;
    }

    const b = Number(breakfast);
    const l = Number(lunch);
    const d = Number(dinner);

    if (isNaN(b) || b < 0 || isNaN(l) || l < 0 || isNaN(d) || d < 0) {
      setFormError("All meal prices must be non-negative numbers.");
      return;
    }

    const bl = breakfastLunch !== "" ? Number(breakfastLunch) : b + l;
    const ld = lunchDinner !== "" ? Number(lunchDinner) : l + d;
    const bd = b + d;
    const bld = fullDay !== "" ? Number(fullDay) : b + l + d;

    try {
      await createMutation.mutateAsync({
        name: name.trim() || undefined,
        scope,
        effectiveFrom,
        effectiveTo: effectiveTo ? effectiveTo : null,
        status: effectiveFrom > today ? "scheduled" : "active",
        pricing: {
          breakfast: b,
          lunch: l,
          dinner: d,
          breakfast_lunch: bl,
          lunch_dinner: ld,
          breakfast_dinner: bd,
          breakfast_lunch_dinner: bld,
        },
        createdBy: "admin",
        updatedBy: "admin",
      });
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || "Failed to create pricing configuration.");
    }
  };

  const handleDelete = async (config: PricingConfiguration) => {
    if (config.effectiveFrom <= today) {
      alert("Cannot delete active or historical pricing version. Past records are protected.");
      return;
    }
    if (confirm(`Delete scheduled pricing version effective from ${config.effectiveFrom}?`)) {
      await deleteMutation.mutateAsync({ id: config.id, config });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing Configuration"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Pricing" },
        ]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 h-9"
          >
            <Plus size={16} />
            <span>Schedule Price Change</span>
          </Button>
        }
      />

      {/* Current Active Pricing Section */}
      <Card className="p-6 border-primary/20 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-success-subtle text-success border border-success/30">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-primary font-display">
                Active Base Pricing
              </h2>
              <p className="text-xs text-text-muted">
                Authoritative baseline used for new orders and uncustomized subscribers
                {activeConfigs[0]?.id && ` · Active Version: ${activeConfigs[0].name || activeConfigs[0].id}`}
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-success-subtle text-success border border-success/30">
            Active · IST
          </span>
        </div>

        {currentMatrix && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="bg-surface-2 p-3.5 rounded-xl border border-border">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                Breakfast
              </span>
              <span className="text-xl font-black text-primary font-mono">
                ₹{currentMatrix.breakfast}
              </span>
            </div>
            <div className="bg-surface-2 p-3.5 rounded-xl border border-border">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                Lunch
              </span>
              <span className="text-xl font-black text-primary font-mono">
                ₹{currentMatrix.lunch}
              </span>
            </div>
            <div className="bg-surface-2 p-3.5 rounded-xl border border-border">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                Dinner
              </span>
              <span className="text-xl font-black text-primary font-mono">
                ₹{currentMatrix.dinner}
              </span>
            </div>
            <div className="bg-surface-2 p-3.5 rounded-xl border border-border">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                Full Day Combo
              </span>
              <span className="text-xl font-black text-primary font-mono">
                ₹{currentMatrix.breakfast_lunch_dinner}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Future Scheduled Pricing Versions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-secondary" />
          <h3 className="text-base font-bold text-primary font-display">
            Future Scheduled Pricing Versions ({scheduledConfigs.length})
          </h3>
        </div>

        {scheduledConfigs.length === 0 ? (
          <div className="p-8 border border-dashed border-border rounded-2xl bg-surface-2 text-center text-sm text-text-muted">
            No future pricing revisions scheduled. Base pricing will remain unchanged on future dates.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {scheduledConfigs.map((cfg) => (
              <Card key={cfg.id} className="p-4 border-secondary/30 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-text text-sm">
                        {cfg.name || "Scheduled Revision"}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pastel-lavender text-secondary border border-secondary/20">
                        Scheduled
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-text-muted mt-1">
                      <Calendar size={12} />
                      <span>
                        Effective: {cfg.effectiveFrom} {cfg.effectiveTo ? `to ${cfg.effectiveTo}` : "(Ongoing)"}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="danger-tonal"
                    size="sm"
                    onClick={() => handleDelete(cfg)}
                    disabled={deleteMutation.isPending}
                    className="h-8 w-8 p-0"
                    title="Delete scheduled version"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border/60 text-center">
                  <div>
                    <span className="text-[10px] text-text-muted block">Bkfst</span>
                    <span className="text-xs font-bold font-mono">₹{cfg.pricing.breakfast}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted block">Lunch</span>
                    <span className="text-xs font-bold font-mono">₹{cfg.pricing.lunch}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted block">Dinner</span>
                    <span className="text-xs font-bold font-mono">₹{cfg.pricing.dinner}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted block">Combo</span>
                    <span className="text-xs font-bold font-mono">₹{cfg.pricing.breakfast_lunch_dinner}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Historical Versions */}
      {pastConfigs.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-bold text-text-muted font-display flex items-center gap-1.5">
            <Layers size={16} /> Past Pricing Periods ({pastConfigs.length})
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 opacity-75">
            {pastConfigs.map((cfg) => (
              <div
                key={cfg.id}
                className="p-3 rounded-xl border border-border bg-surface-2 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold block text-text">
                    {cfg.name || "Historical Period"}
                  </span>
                  <span className="text-text-muted font-mono text-[11px]">
                    {cfg.effectiveFrom} to {cfg.effectiveTo}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] bg-black/5 font-semibold text-text-muted">
                  Archived / Locked
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Version Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-background rounded-2xl border border-primary/20 max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex items-center justify-between bg-primary/5">
              <h2 className="text-base font-bold text-primary font-display flex items-center gap-2">
                <Calendar size={18} /> Schedule Pricing Version
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-text p-1 rounded-full"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-danger-subtle text-danger rounded-xl text-xs border border-danger/20 flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-text-muted block mb-1">
                  Revision Label / Name (Optional)
                </label>
                <input
                  type="text"
                  name="name"
                  placeholder="e.g., Q4 2026 Price Revision"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-muted block mb-1">
                    Effective From *
                  </label>
                  <input
                    type="date"
                    name="effectiveFrom"
                    required
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-muted block mb-1">
                    Effective To (Optional)
                  </label>
                  <input
                    type="date"
                    name="effectiveTo"
                    value={effectiveTo}
                    onChange={(e) => setEffectiveTo(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-card text-sm"
                  />
                </div>
              </div>

              <div className="border-t border-border/80 pt-3">
                <span className="text-xs font-bold text-primary block mb-2 font-display">
                  Base Meal Prices (₹)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] text-text-muted block mb-1">Breakfast</label>
                    <input
                      type="number"
                      name="breakfast"
                      required
                      min="0"
                      value={breakfast}
                      onChange={(e) => setBreakfast(Number(e.target.value))}
                      className="w-full h-10 px-2 rounded-xl border border-border bg-card text-sm font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-text-muted block mb-1">Lunch</label>
                    <input
                      type="number"
                      name="lunch"
                      required
                      min="0"
                      value={lunch}
                      onChange={(e) => setLunch(Number(e.target.value))}
                      className="w-full h-10 px-2 rounded-xl border border-border bg-card text-sm font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-text-muted block mb-1">Dinner</label>
                    <input
                      type="number"
                      name="dinner"
                      required
                      min="0"
                      value={dinner}
                      onChange={(e) => setDinner(Number(e.target.value))}
                      className="w-full h-10 px-2 rounded-xl border border-border bg-card text-sm font-mono text-center"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border/80 pt-3">
                <span className="text-xs font-bold text-primary block mb-2 font-display">
                  Bundle Combos (Optional Custom Rate)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-text-muted block mb-1 truncate">
                      Bkfst+Lunch
                    </label>
                    <input
                      type="number"
                      name="breakfast_lunch"
                      min="0"
                      placeholder={`₹${breakfast + lunch}`}
                      value={breakfastLunch}
                      onChange={(e) =>
                        setBreakfastLunch(e.target.value ? Number(e.target.value) : "")
                      }
                      className="w-full h-10 px-2 rounded-xl border border-border bg-card text-sm font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted block mb-1 truncate">
                      Lunch+Dinner
                    </label>
                    <input
                      type="number"
                      name="lunch_dinner"
                      min="0"
                      placeholder={`₹${lunch + dinner}`}
                      value={lunchDinner}
                      onChange={(e) =>
                        setLunchDinner(e.target.value ? Number(e.target.value) : "")
                      }
                      className="w-full h-10 px-2 rounded-xl border border-border bg-card text-sm font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted block mb-1 truncate">
                      All 3 Meals
                    </label>
                    <input
                      type="number"
                      name="all_three"
                      min="0"
                      placeholder={`₹${breakfast + lunch + dinner}`}
                      value={fullDay}
                      onChange={(e) =>
                        setFullDay(e.target.value ? Number(e.target.value) : "")
                      }
                      className="w-full h-10 px-2 rounded-xl border border-border bg-card text-sm font-mono text-center"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-text-muted mt-1">
                  Leave blank to auto-calculate sum of individual meal prices.
                </p>
              </div>

              <div className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={createMutation.isPending}
                  className="flex-1"
                >
                  {createMutation.isPending ? "Scheduling..." : "Schedule Pricing"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
