import { useState } from "react";
import {
  Plus,
  Edit2,
  UtensilsCrossed,
  IndianRupee,
  Lock,
  Layers,
  Sparkles,
} from "lucide-react";
import { HeroBanner as PageHeader } from "@/shared/components/ui/HeroBanner";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { MealBadge } from "@/shared/components/ui/MealBadge";
import { TableSkeleton } from "@/shared/components/feedback/SkeletonLoader";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import {
  useAdminMealPlans,
  useCreateMealPlan,
  useUpdateMealPlan,
  useToggleMealPlanStatus,
  useAddMealOption,
  useUpdateMealOption,
  useToggleMealOptionStatus,
  useToggleMealOptionSelectable,
} from "../hooks/useAdminMealPlans";
import type {
  MealPlan,
  MealType,
  MealOption,
  CreateMealPlanInput,
  UpdateMealPlanInput,
  CreateMealOptionInput,
  UpdateMealOptionInput,
} from "@/shared/types";

export function AdminMealPlansPage() {
  const { data: plans = [], isLoading, error, refetch } = useAdminMealPlans(true);
  const createPlanMutation = useCreateMealPlan();
  const updatePlanMutation = useUpdateMealPlan();
  const togglePlanMutation = useToggleMealPlanStatus();
  const addOptionMutation = useAddMealOption();
  const updateOptionMutation = useUpdateMealOption();
  const toggleOptionMutation = useToggleMealOptionStatus();
  const toggleSelectableMutation = useToggleMealOptionSelectable();

  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  // Plan modal state
  const [planModalMode, setPlanModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<MealPlan | null>(null);
  const [planName, setPlanName] = useState("");
  const [planTier, setPlanTier] = useState("basic");
  const [planPrice, setPlanPrice] = useState<number | "">("");
  const [planDesc, setPlanDesc] = useState("");
  const [planSortOrder, setPlanSortOrder] = useState<number | "">(1);

  // Option modal state
  const [optionModalMode, setOptionModalMode] = useState<"create" | "edit" | null>(null);
  const [targetPlanId, setTargetPlanId] = useState<string>("");
  const [targetMealType, setTargetMealType] = useState<MealType>("lunch");
  const [selectedOption, setSelectedOption] = useState<MealOption | null>(null);
  const [optionLabel, setOptionLabel] = useState("");
  const [optionItems, setOptionItems] = useState("");
  const [optionDesc, setOptionDesc] = useState("");
  const [optionIsCustomerSelectable, setOptionIsCustomerSelectable] = useState(true);

  // Open plan create modal
  const openCreatePlanModal = () => {
    setSelectedPlan(null);
    setPlanName("");
    setPlanTier("basic");
    setPlanPrice("");
    setPlanDesc("");
    setPlanSortOrder((plans.length || 0) + 1);
    setPlanModalMode("create");
  };

  // Open plan edit modal
  const openEditPlanModal = (plan: MealPlan) => {
    setSelectedPlan(plan);
    setPlanName(plan.name);
    setPlanTier(plan.tier);
    setPlanPrice(plan.pricePerDay);
    setPlanDesc(plan.description || "");
    setPlanSortOrder(plan.sortOrder || 1);
    setPlanModalMode("edit");
  };

  // Open option create modal
  const openCreateOptionModal = (planId: string, mealType: MealType) => {
    setTargetPlanId(planId);
    setTargetMealType(mealType);
    setSelectedOption(null);
    setOptionLabel("");
    setOptionItems("");
    setOptionDesc("");
    setOptionIsCustomerSelectable(true);
    setOptionModalMode("create");
  };

  // Open option edit modal
  const openEditOptionModal = (planId: string, mealType: MealType, option: MealOption) => {
    setTargetPlanId(planId);
    setTargetMealType(mealType);
    setSelectedOption(option);
    setOptionLabel(option.label);
    setOptionItems(option.items ? option.items.join(", ") : "");
    setOptionDesc(option.description || "");
    setOptionIsCustomerSelectable(option.isCustomerSelectable !== false);
    setOptionModalMode("edit");
  };

  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName.trim()) {
      alert("Please provide a plan name.");
      return;
    }
    const priceNum = typeof planPrice === "number" ? planPrice : parseFloat(planPrice as string);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert("Please enter a valid price greater than 0.");
      return;
    }
    const sortNum = typeof planSortOrder === "number" ? planSortOrder : parseInt(planSortOrder as string, 10) || 1;

    if (planModalMode === "create") {
      const payload: CreateMealPlanInput = {
        name: planName.trim(),
        tier: planTier,
        pricePerDay: priceNum,
        description: planDesc.trim(),
        sortOrder: sortNum,
        isActive: true,
      };
      await createPlanMutation.mutateAsync(payload);
      setPlanModalMode(null);
    } else if (planModalMode === "edit" && selectedPlan) {
      const payload: UpdateMealPlanInput = {
        name: planName.trim(),
        tier: planTier,
        pricePerDay: priceNum,
        description: planDesc.trim(),
        sortOrder: sortNum,
      };
      await updatePlanMutation.mutateAsync({ id: selectedPlan.id, updates: payload });
      setPlanModalMode(null);
    }
  };

  const handleOptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optionLabel.trim()) {
      alert("Please provide an option label.");
      return;
    }
    const itemsArray = optionItems
      .split(",")
      .map((i) => i.trim())
      .filter(Boolean);

    if (optionModalMode === "create") {
      const payload: CreateMealOptionInput = {
        label: optionLabel.trim(),
        items: itemsArray.length > 0 ? itemsArray : [optionLabel.trim()],
        description: optionDesc.trim(),
        isCustomerSelectable: targetMealType === "breakfast" ? false : optionIsCustomerSelectable,
        isActive: true,
      };
      await addOptionMutation.mutateAsync({
        planId: targetPlanId,
        mealType: targetMealType,
        input: payload,
      });
      setOptionModalMode(null);
    } else if (optionModalMode === "edit" && selectedOption) {
      const payload: UpdateMealOptionInput = {
        label: optionLabel.trim(),
        items: itemsArray.length > 0 ? itemsArray : [optionLabel.trim()],
        description: optionDesc.trim(),
        isCustomerSelectable: targetMealType === "breakfast" ? false : optionIsCustomerSelectable,
      };
      await updateOptionMutation.mutateAsync({
        planId: targetPlanId,
        mealType: targetMealType,
        optionId: selectedOption.id,
        updates: payload,
      });
      setOptionModalMode(null);
    }
  };

  const filteredPlans = plans.filter((p) => {
    if (filter === "active" && !p.isActive) return false;
    if (filter === "inactive" && p.isActive) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <TableSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          userName="Meal Plans"
          subtitle="Failed to load meal plans."
        />
        <div className="p-6 bg-danger/10 border border-danger/30 rounded-2xl text-danger">
          <p className="font-bold">Failed to load meal plans.</p>
          <Button variant="ghost" onClick={() => refetch()} className="mt-3">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        userName="Meal Plans & Options"
        subtitle="Manage authoritative plan tiers, daily pricing, and customer-selectable lunch & dinner meal options."
      />

      {/* Control bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider mr-1">
            Status:
          </span>
          {(["all", "active", "inactive"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                filter === mode
                  ? "bg-primary text-background shadow-xs font-bold"
                  : "text-text-muted hover:text-text bg-surface-1/50"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <Button
          variant="primary"
          onClick={openCreatePlanModal}
          className="flex items-center gap-1.5 shrink-0"
        >
          <Plus size={16} /> Create Plan
        </Button>
      </div>

      {/* Plans List */}
      {filteredPlans.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed size={40} className="text-text-muted/40" />}
          title="No Meal Plans Found"
          description="No meal plan configurations found for the selected filter."
        />
      ) : (
        <div className="space-y-8">
          {filteredPlans.map((plan) => (
            <Card
              key={plan.id}
              data-testid={`meal-plan-card-${plan.id}`}
              className={`p-6 border transition-all ${
                plan.isActive
                  ? "border-primary/30 bg-background shadow-sm"
                  : "border-border/60 bg-surface-1/40 opacity-80"
              }`}
            >
              {/* Plan Header */}
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-border/60">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl font-bold text-primary font-display">
                      {plan.name}
                    </h2>
                    <Badge variant="default" className="font-mono text-xs uppercase tracking-wider font-bold">
                      {plan.tier} Tier
                    </Badge>
                    <Badge
                      variant={plan.isActive ? "success" : "default"}
                      className="text-[10px] font-bold uppercase tracking-wider"
                    >
                      {plan.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <span className="text-xs font-mono text-text-muted">
                      ID: {plan.id}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted max-w-2xl">
                    {plan.description || "Daily homestyle meals delivered to customer doorstep."}
                  </p>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                      Daily Rate
                    </span>
                    <span className="text-2xl font-black text-primary font-mono flex items-center justify-end">
                      <IndianRupee size={18} /> {plan.pricePerDay}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEditPlanModal(plan)}
                      className="flex items-center gap-1 text-xs"
                    >
                      <Edit2 size={13} /> Edit Plan
                    </Button>
                    <Button
                      variant={plan.isActive ? "ghost" : "primary"}
                      size="sm"
                      onClick={() =>
                        togglePlanMutation.mutate({
                          id: plan.id,
                          isActive: !plan.isActive,
                        })
                      }
                      className="text-xs"
                    >
                      {plan.isActive ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Meal Slots Section */}
              <div className="mt-6 space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                  <Layers size={14} className="text-primary" /> Meal Slot Configurations & Options
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* BREAKFAST SLOT (Fixed rule) */}
                  <div className="bg-surface-1/40 rounded-2xl p-4 border border-border flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MealBadge mealType="breakfast" />
                          <span className="text-xs font-bold text-text">Breakfast</span>
                        </div>
                        <Badge variant="warning" className="text-[9px] uppercase font-bold tracking-wider flex items-center gap-1">
                          <Lock size={10} /> DailyMenu Rotating
                        </Badge>
                      </div>

                      <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 text-xs text-text-muted space-y-1">
                        <p className="font-semibold text-text flex items-center gap-1">
                          <Sparkles size={13} className="text-gold" /> Daily Menu Authority
                        </p>
                        <p className="text-[11px] leading-relaxed">
                          Breakfast follows the kitchen's daily rotating menu (Idli, Shavige Bath, Khara Bath, etc.). Non-selectable by customers per business rule.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider block">
                          Baseline Preset
                        </span>
                        {plan.mealSlots?.find((s) => s.mealType === "breakfast")?.options?.map((opt) => (
                          <div
                            key={opt.id}
                            className="p-2.5 rounded-xl bg-background border border-border text-xs flex items-center justify-between"
                          >
                            <span className="font-semibold text-text">{opt.label}</span>
                            <span className="text-[10px] text-text-muted font-mono">Rotating</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* LUNCH SLOT (Customer Selectable) */}
                  <div className="bg-surface-1/40 rounded-2xl p-4 border border-border flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MealBadge mealType="lunch" />
                          <span className="text-xs font-bold text-text">Lunch</span>
                        </div>
                        <Badge variant="success" className="text-[9px] uppercase font-bold tracking-wider">
                          Selectable Slot
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        {plan.mealSlots
                          ?.find((s) => s.mealType === "lunch")
                          ?.options?.map((opt) => (
                            <div
                              key={opt.id}
                              data-testid={`meal-option-${opt.id}`}
                              className={`p-3 rounded-xl border transition-all text-xs space-y-2 ${
                                opt.isActive !== false
                                  ? "bg-background border-border"
                                  : "bg-surface-2/60 border-border/40 opacity-70"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bold text-text text-sm">{opt.label}</div>
                                  {opt.items && opt.items.length > 0 && (
                                    <div className="text-[11px] text-text-muted mt-0.5">
                                      {opt.items.join(" • ")}
                                    </div>
                                  )}
                                  {opt.description && (
                                    <div className="text-[10px] text-text-muted italic mt-0.5">
                                      {opt.description}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <Badge
                                    variant={opt.isActive !== false ? "success" : "default"}
                                    className="text-[9px] font-bold uppercase"
                                  >
                                    {opt.isActive !== false ? "Active" : "Disabled"}
                                  </Badge>
                                  {opt.isCustomerSelectable === false && (
                                    <Badge variant="warning" className="text-[9px] uppercase font-bold">
                                      Staff Only
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border/40">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditOptionModal(plan.id, "lunch", opt)}
                                  className="h-7 text-[11px] px-2"
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    toggleOptionMutation.mutate({
                                      planId: plan.id,
                                      mealType: "lunch",
                                      optionId: opt.id,
                                      isActive: opt.isActive === false,
                                    })
                                  }
                                  className="h-7 text-[11px] px-2 text-danger hover:bg-danger/10"
                                >
                                  {opt.isActive !== false ? "Disable" : "Enable"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    toggleSelectableMutation.mutate({
                                      planId: plan.id,
                                      mealType: "lunch",
                                      optionId: opt.id,
                                      isCustomerSelectable: opt.isCustomerSelectable === false,
                                    })
                                  }
                                  className="h-7 text-[11px] px-2 text-text-muted"
                                >
                                  {opt.isCustomerSelectable !== false ? "Hide from Customer" : "Make Selectable"}
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openCreateOptionModal(plan.id, "lunch")}
                      className="w-full mt-3 text-xs flex items-center justify-center gap-1"
                    >
                      <Plus size={14} /> Add Lunch Option
                    </Button>
                  </div>

                  {/* DINNER SLOT (Customer Selectable) */}
                  <div className="bg-surface-1/40 rounded-2xl p-4 border border-border flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MealBadge mealType="dinner" />
                          <span className="text-xs font-bold text-text">Dinner</span>
                        </div>
                        <Badge variant="success" className="text-[9px] uppercase font-bold tracking-wider">
                          Selectable Slot
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        {plan.mealSlots
                          ?.find((s) => s.mealType === "dinner")
                          ?.options?.map((opt) => (
                            <div
                              key={opt.id}
                              data-testid={`meal-option-${opt.id}`}
                              className={`p-3 rounded-xl border transition-all text-xs space-y-2 ${
                                opt.isActive !== false
                                  ? "bg-background border-border"
                                  : "bg-surface-2/60 border-border/40 opacity-70"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bold text-text text-sm">{opt.label}</div>
                                  {opt.items && opt.items.length > 0 && (
                                    <div className="text-[11px] text-text-muted mt-0.5">
                                      {opt.items.join(" • ")}
                                    </div>
                                  )}
                                  {opt.description && (
                                    <div className="text-[10px] text-text-muted italic mt-0.5">
                                      {opt.description}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <Badge
                                    variant={opt.isActive !== false ? "success" : "default"}
                                    className="text-[9px] font-bold uppercase"
                                  >
                                    {opt.isActive !== false ? "Active" : "Disabled"}
                                  </Badge>
                                  {opt.isCustomerSelectable === false && (
                                    <Badge variant="warning" className="text-[9px] uppercase font-bold">
                                      Staff Only
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border/40">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditOptionModal(plan.id, "dinner", opt)}
                                  className="h-7 text-[11px] px-2"
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    toggleOptionMutation.mutate({
                                      planId: plan.id,
                                      mealType: "dinner",
                                      optionId: opt.id,
                                      isActive: opt.isActive === false,
                                    })
                                  }
                                  className="h-7 text-[11px] px-2 text-danger hover:bg-danger/10"
                                >
                                  {opt.isActive !== false ? "Disable" : "Enable"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    toggleSelectableMutation.mutate({
                                      planId: plan.id,
                                      mealType: "dinner",
                                      optionId: opt.id,
                                      isCustomerSelectable: opt.isCustomerSelectable === false,
                                    })
                                  }
                                  className="h-7 text-[11px] px-2 text-text-muted"
                                >
                                  {opt.isCustomerSelectable !== false ? "Hide from Customer" : "Make Selectable"}
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openCreateOptionModal(plan.id, "dinner")}
                      className="w-full mt-3 text-xs flex items-center justify-center gap-1"
                    >
                      <Plus size={14} /> Add Dinner Option
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── PLAN MODAL (CREATE / EDIT) ── */}
      {planModalMode && (
        <div
          role="dialog"
          aria-labelledby="plan-modal-title"
          className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-background rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-primary/20 space-y-5 my-8">
            <h2 id="plan-modal-title" className="text-lg font-bold text-primary font-display">
              {planModalMode === "create" ? "Create New Meal Plan" : "Edit Meal Plan"}
            </h2>

            <form onSubmit={handlePlanSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-text block mb-1">Plan Name *</label>
                <input
                  type="text"
                  name="name"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="e.g. Deluxe Healthy Plan"
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background focus:ring-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-text block mb-1">Tier *</label>
                  <select
                    value={planTier}
                    onChange={(e) => setPlanTier(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-border bg-background focus:ring-primary"
                  >
                    <option value="basic">basic</option>
                    <option value="regular">regular</option>
                    <option value="premium">premium</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-text block mb-1">Daily Price (₹) *</label>
                  <input
                    type="number"
                    name="pricePerDay"
                    value={planPrice}
                    onChange={(e) => setPlanPrice(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="180"
                    min="1"
                    className="w-full text-xs p-2.5 rounded-xl border border-border bg-background focus:ring-primary"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-text block mb-1">Description</label>
                <textarea
                  name="description"
                  value={planDesc}
                  onChange={(e) => setPlanDesc(e.target.value)}
                  rows={2}
                  placeholder="Plan features, included meals, and delivery notes"
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text block mb-1">Sort Order</label>
                <input
                  type="number"
                  name="sortOrder"
                  value={planSortOrder}
                  onChange={(e) => setPlanSortOrder(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background focus:ring-primary"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1 text-xs"
                  onClick={() => setPlanModalMode(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1 text-xs"
                  disabled={createPlanMutation.isPending || updatePlanMutation.isPending}
                >
                  {planModalMode === "create" ? "Create Plan" : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── OPTION MODAL (CREATE / EDIT) ── */}
      {optionModalMode && (
        <div
          role="dialog"
          aria-labelledby="option-modal-title"
          className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-background rounded-2xl shadow-2xl max-w-md w-full p-6 border border-primary/20 space-y-5 my-8">
            <h2 id="option-modal-title" className="text-lg font-bold text-primary font-display flex items-center gap-2">
              <MealBadge mealType={targetMealType} compact />
              {optionModalMode === "create" ? `Add ${targetMealType} Option` : `Edit ${targetMealType} Option`}
            </h2>

            <form onSubmit={handleOptionSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-text block mb-1">Option Label *</label>
                <input
                  type="text"
                  name="optionLabel"
                  value={optionLabel}
                  onChange={(e) => setOptionLabel(e.target.value)}
                  placeholder="e.g. Chapati & Mixed Veg Curry"
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text block mb-1">
                  Item Components (comma-separated)
                </label>
                <input
                  type="text"
                  name="optionItems"
                  value={optionItems}
                  onChange={(e) => setOptionItems(e.target.value)}
                  placeholder="e.g. 3 Chapati, Veg Kurma, Salad"
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background focus:ring-primary"
                />
                <span className="text-[10px] text-text-muted mt-1 block">
                  Displayed as bullet items on customer meal card & kitchen prep list.
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-text block mb-1">Short Description</label>
                <textarea
                  name="optionDescription"
                  value={optionDesc}
                  onChange={(e) => setOptionDesc(e.target.value)}
                  rows={2}
                  placeholder="Optional nutritious notes or spice level"
                  className="w-full text-xs p-2.5 rounded-xl border border-border bg-background focus:ring-primary"
                />
              </div>

              {targetMealType !== "breakfast" && (
                <div className="pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      name="isCustomerSelectable"
                      checked={optionIsCustomerSelectable}
                      onChange={(e) => setOptionIsCustomerSelectable(e.target.checked)}
                      className="w-4 h-4 text-primary rounded"
                    />
                    <div>
                      <span className="text-xs font-bold text-text block">
                        Customer Selectable
                      </span>
                      <span className="text-[10px] text-text-muted">
                        If unchecked, only Admin/Call-center can select this option.
                      </span>
                    </div>
                  </label>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1 text-xs"
                  onClick={() => setOptionModalMode(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1 text-xs"
                  disabled={addOptionMutation.isPending || updateOptionMutation.isPending}
                >
                  {optionModalMode === "create" ? "Add Option" : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default AdminMealPlansPage;
