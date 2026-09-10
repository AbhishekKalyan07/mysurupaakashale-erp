import { useState } from "react";
import { HeroBanner as PageHeader } from "@/shared/components/ui/HeroBanner";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { PremiumBadge as Badge } from "@/shared/components/ui/PremiumBadge";
import { TableSkeleton } from "@/shared/components/feedback/SkeletonLoader";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { useDeliveryZones, useDeleteZone } from "../hooks/useDeliveryZones";
import { ZoneModal } from "../components/ZoneModal";
import { Plus, Map, MapPin } from "lucide-react";
import type { DeliveryZone } from "@/shared/types";

export function AdminZonesPage() {
  const { data: zones, isLoading, isError } = useDeliveryZones();
  const deleteMutation = useDeleteZone();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);

  if (isLoading)
    return (
      <div className="p-8">
        <TableSkeleton />
      </div>
    );
  if (isError)
    return (
      <div className="p-8 text-red-500 font-bold">Failed to load zones.</div>
    );

  return (
    <div className="space-y-8">
      <div className="relative">
        <PageHeader
          userName="Delivery Zones"
          subtitle="Manage geographic regions and map pincodes to delivery areas."
        />
        <div className="absolute top-6 right-6 hidden sm:block">
          <Button
            variant="primary"
            onClick={() => setIsModalOpen(true)}
            className="shadow-lg"
          >
            <Plus size={18} className="mr-2" />
            Create Zone
          </Button>
        </div>
      </div>

      <div className="sm:hidden flex justify-end">
        <Button
          variant="primary"
          onClick={() => setIsModalOpen(true)}
          className="w-full shadow-md"
        >
          <Plus size={18} className="mr-2" />
          Create Zone
        </Button>
      </div>

      {zones && zones.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {zones.map((zone) => (
            <Card
              key={zone.id}
              className="p-6 flex flex-col hover:border-gold/30 transition-colors shadow-sm bg-background-alt border-primary/10"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant={zone.isActive ? "success" : "default"}
                      dot
                      className="text-[10px] shadow-sm font-bold tracking-wide"
                    >
                      {zone.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-xl text-primary">
                    {zone.name}
                  </h3>
                </div>
                <div className="bg-primary/5 text-primary p-2.5 rounded-xl border border-primary/10 shadow-sm">
                  <Map size={22} className="text-primary" />
                </div>
              </div>

              <div className="flex-1 space-y-5">
                <div>
                  <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <MapPin size={12} className="text-primary/60" />
                    <span>Pincodes ({zone.pincodes.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {zone.pincodes.map((pin) => (
                      <span
                        key={pin}
                        className="inline-flex items-center px-2.5 py-1 bg-primary/5 border border-primary/10 rounded-md text-xs font-mono font-semibold text-primary shadow-sm"
                      >
                        {pin}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-background p-3 rounded-lg border border-primary/5 shadow-inner">
                  <div>
                    <div className="text-[9px] text-text-muted font-bold uppercase tracking-wider mb-1">
                      City
                    </div>
                    <div className="text-sm font-medium text-text">
                      {zone.city}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-text-muted font-bold uppercase tracking-wider mb-1">
                      Kitchen ID
                    </div>
                    <div className="text-xs font-mono font-medium text-text-muted break-all">
                      {zone.kitchenId}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-primary/10 flex justify-end gap-2 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  className="font-bold text-primary shadow-sm"
                  onClick={() => setEditingZone(zone)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 font-bold hover:bg-red-50 hover:text-red-600 transition-colors"
                  isLoading={
                    deleteMutation.isPending &&
                    deleteMutation.variables === zone.id
                  }
                  onClick={() => {
                    if (
                      confirm(`Are you sure you want to delete ${zone.name}?`)
                    ) {
                      deleteMutation.mutate(zone.id);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8">
          <EmptyState
            title="No Zones Configured"
            description="Create your first Delivery Zone to start mapping pincodes."
          />
        </Card>
      )}

      {isModalOpen && <ZoneModal onClose={() => setIsModalOpen(false)} />}
      {editingZone && (
        <ZoneModal zone={editingZone} onClose={() => setEditingZone(null)} />
      )}
    </div>
  );
}
