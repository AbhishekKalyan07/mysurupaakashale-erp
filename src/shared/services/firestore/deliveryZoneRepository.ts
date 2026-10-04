import { db } from "@/shared/lib/firebase";
import { BaseRepository, createConverter } from "./BaseRepository";
import type { DeliveryZone } from "@/shared/types";
import type { QueryConstraint } from "firebase/firestore";

import { MYSURU_CITY_PINCODES } from "@/shared/types/delivery.types";

export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  {
    id: "zone-1",
    name: "Mysuru City Delivery Zone",
    city: "Mysuru",
    pincodes: [...MYSURU_CITY_PINCODES],
    boundary: null,
    kitchenId: "kitchen-1",
    isActive: true,
    createdAt: null as any,
  },
];

class DeliveryZoneRepository extends BaseRepository<DeliveryZone> {
  constructor() {
    super(db, "deliveryZones", createConverter<DeliveryZone>());
  }

  override async list(...constraints: QueryConstraint[]): Promise<DeliveryZone[]> {
    try {
      const zones = await super.list(...constraints);
      if (zones && zones.length > 0) {
        return zones;
      }
    } catch {
      // Fallback if collection is uninitialized or unseeded
    }
    return DEFAULT_DELIVERY_ZONES;
  }
}

export const deliveryZoneRepository = new DeliveryZoneRepository();
