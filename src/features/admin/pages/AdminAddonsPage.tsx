import { useState } from "react";
import { Plus, Edit2, CheckCircle2, XCircle, Search, Utensils, IndianRupee } from "lucide-react";
import { HeroBanner as PageHeader } from "@/shared/components/ui/HeroBanner";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { MealBadge } from "@/shared/components/ui/MealBadge";
import { TableSkeleton } from "@/shared/components/feedback/SkeletonLoader";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import {
  useAddons,
  useCreateAddon,
  useUpdateAddon,
  useToggleAddonStatus,
} from "../hooks/useAdminAddons";
import type { Addon, MealType, CreateAddonInput, UpdateAddonInput } from "@/shared/types";

export function AdminAddonsPage() {
  const { data: addons = [], isLoading, error, refetch } = useAddons();
  const createMutation = useCreateAddon();
  const updateMutation = useUpdateAddon();
  const toggleMutation = useToggleAddonStatus();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedAddon, setSelectedAddon] = useState<Addon | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState<number | "">("");
  const [formDescription, setFormDescription] = useState("");
  const [formMeals, setFormMeals] = useState<{
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
  }>({
    breakfast: false,
    lunch: true,
    dinner: true,
  });
  const [formIsActive, setFormIsActive] = useState(true);

  const openCreateModal = () => {
    setSelectedAddon(null);
    setFormName("");
    setFormPrice("");
    setFormDescription("");
    setFormMeals({ breakfast: false, lunch: true, dinner: true });
    setFormIsActive(true);
    setModalMode("create");
  };

  const openEditModal = (addon: Addon) => {
    setSelectedAddon(addon);
    setFormName(addon.name);
    setFormPrice(addon.price);
    setFormDescription(addon.description || "");
    setFormMeals({
      breakfast: addon.applicableMealTypes.includes("breakfast"),
      lunch: addon.applicableMealTypes.includes("lunch"),
      dinner: addon.applicableMealTypes.includes("dinner"),
    });
    setFormIsActive(addon.isActive);
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedAddon(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert("Please provide an add-on name.");
      return;
    }
    const priceNum = typeof formPrice === "number" ? formPrice : parseFloat(formPrice as string);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert("Please enter a valid price greater than 0.");
      return;
    }

    const applicableMealTypes: MealType[] = [];
    if (formMeals.breakfast) applicableMealTypes.push("breakfast");
    if (formMeals.lunch) applicableMealTypes.push("lunch");
    if (formMeals.dinner) applicableMealTypes.push("dinner");

    if (applicableMealTypes.length === 0) {
      alert("Please select at least one meal slot.");
      return;
    }

    if (modalMode === "create") {
      const payload: CreateAddonInput = {
        name: formName.trim(),
        price: priceNum,
        applicableMealTypes,
        description: formDescription.trim(),
        isActive: formIsActive,
      };
      await createMutation.mutateAsync(payload);
      closeModal();
    } else if (modalMode === "edit" && selectedAddon) {
      const payload: UpdateAddonInput = {
        name: formName.trim(),
        price: priceNum,
        applicableMealTypes,
        description: formDescription.trim(),
        isActive: formIsActive,
      };
      await updateMutation.mutateAsync({ id: selectedAddon.id, updates: payload });
      closeModal();
    }
  };

  const filteredAddons = addons.filter((a) => {
    if (filter === "active" && !a.isActive) return false;
    if (filter === "inactive" && a.isActive) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      (a.description && a.description.toLowerCase().includes(q)) ||
      a.id.toLowerCase().includes(q)
    );
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
          userName="Add-on Catalog"
          subtitle="Manage authoritative meal add-ons, pricing, and availability."
        />
        <div className="p-6 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm text-center">
          Failed to load add-on catalog.
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        userName="Add-on Catalog"
        subtitle="Manage authoritative meal add-ons, pricing, and availability."
      />

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search add-ons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex bg-surface-1 rounded-xl p-1 border border-border">
            {(["all", "active", "inactive"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition-all ${
                  filter === mode
                    ? "bg-primary text-white shadow-xs"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="primary"
          onClick={openCreateModal}
          className="flex items-center gap-1.5 shrink-0"
        >
          <Plus size={16} /> Create Add-on
        </Button>
      </div>

      {/* Catalog Grid */}
      {filteredAddons.length === 0 ? (
        <EmptyState
          icon={<Utensils size={40} className="text-text-muted/40" />}
          title="No Add-ons Found"
          description={
            search
              ? "No add-on matches your search criteria."
              : "No add-on catalog items found."
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAddons.map((addon) => (
            <Card
              key={addon.id}
              data-testid={`addon-card-${addon.id}`}
              className={`p-4 border transition-all flex flex-col justify-between ${
                addon.isActive
                  ? "border-primary/20 bg-background shadow-xs hover:border-primary/40"
                  : "border-border/60 bg-surface-1/40 opacity-75"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-base text-primary font-display">
                      {addon.name}
                    </h3>
                    <span className="text-[10px] font-mono text-text-muted">
                      ID: {addon.id}
                    </span>
                  </div>
                  <Badge
                    variant={addon.isActive ? "success" : "default"}
                    className="text-[10px] font-bold uppercase tracking-wider shrink-0"
                  >
                    {addon.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <p className="text-xs text-text-muted line-clamp-2 min-h-[32px]">
                  {addon.description || "Fresh nutritious add-on dish"}
                </p>

                <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-text-muted block font-semibold uppercase">
                      Price
                    </span>
                    <span className="text-lg font-black text-primary font-mono flex items-center">
                      <IndianRupee size={15} /> {addon.price}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-text-muted block font-semibold uppercase text-right mb-1">
                      Slots
                    </span>
                    <div className="flex items-center gap-1">
                      {addon.applicableMealTypes.map((m) => (
                        <MealBadge key={m} mealType={m} compact />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 mt-3 border-t border-border/40 flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openEditModal(addon)}
                  className="flex-1 flex items-center justify-center gap-1 text-xs"
                >
                  <Edit2 size={13} /> Edit
                </Button>

                <Button
                  variant={addon.isActive ? "ghost" : "secondary"}
                  size="sm"
                  disabled={toggleMutation.isPending}
                  onClick={() =>
                    toggleMutation.mutate({ id: addon.id, isActive: !addon.isActive })
                  }
                  className="flex-1 flex items-center justify-center gap-1 text-xs"
                >
                  {addon.isActive ? (
                    <>
                      <XCircle size={13} className="text-danger" /> Disable
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={13} className="text-success" /> Enable
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background rounded-2xl shadow-2xl max-w-md w-full border border-primary/20 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-primary/10 flex justify-between items-center bg-primary/5">
              <h2 className="text-lg font-bold text-primary font-display">
                {modalMode === "create" ? "Create New Add-on" : `Edit Add-on: ${formName}`}
              </h2>
              <button
                onClick={closeModal}
                className="text-text-muted hover:text-primary transition-colors p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-4 sm:p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                  Add-on Name *
                </label>
                <input
                  type="text"
                  name="name"
                  placeholder="e.g. Paneer Tikka / Extra Chapati"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                  Price (₹) *
                </label>
                <input
                  type="number"
                  name="price"
                  placeholder="e.g. 40"
                  value={formPrice}
                  onChange={(e) =>
                    setFormPrice(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  required
                  min={1}
                  step="1"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                  Allowed Meal Slots *
                </label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
                    <label
                      key={meal}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                        formMeals[meal]
                          ? "border-primary bg-primary/5 text-primary font-bold"
                          : "border-border bg-surface-1/40 text-text-muted"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name={meal}
                        checked={formMeals[meal]}
                        onChange={(e) =>
                          setFormMeals((prev) => ({
                            ...prev,
                            [meal]: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 text-primary rounded"
                      />
                      <span className="text-xs capitalize">{meal}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  placeholder="Detailed description of the add-on dish..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-text">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 text-primary rounded"
                  />
                  <span>Active in Catalog (Available for Customers & Call Center)</span>
                </label>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {modalMode === "create" ? "Create Add-on" : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
