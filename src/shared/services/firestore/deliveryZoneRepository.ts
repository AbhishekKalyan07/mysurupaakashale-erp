import { db } from '@/shared/lib/firebase';
import { BaseRepository, createConverter } from './BaseRepository';
import type { DeliveryZone } from '@/shared/types';

class DeliveryZoneRepository extends BaseRepository<DeliveryZone> {
  constructor() {
    super(db, 'deliveryZones', createConverter<DeliveryZone>());
  }
}

export const deliveryZoneRepository = new DeliveryZoneRepository();
