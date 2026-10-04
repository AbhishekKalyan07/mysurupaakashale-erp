import type { Address } from "./user.types";
import type { ID, TimeWindow, Timestamp } from "./common.types";

export type DeliveryStatus =
  | "unassigned"
  | "assigned"
  | "picked_up"
  | "out_for_delivery"
  | "delivered"
  | "failed";

/**
 * Firestore: `deliveryZones/{zoneId}`.
 * v1 matches customers to a zone by pincode (`pincodes`), which is simple,
 * fast, and needs no map interaction at signup. `boundary` is optional
 * lat/lng polygon points for when Admin wants to draw exact zone shapes on
 * the Leaflet map instead of/in addition to a pincode list — both can
 * coexist; pincode match is the dependable fallback.
 */
/**
 * Project-owner-provided Mysuru City master pincode list.
 * Exactly 32 verified Mysuru CITY 570xxx pincodes (570001–570032).
 */
export const MYSURU_CITY_PINCODES = [
  "570001",
  "570002",
  "570003",
  "570004",
  "570005",
  "570006",
  "570007",
  "570008",
  "570009",
  "570010",
  "570011",
  "570012",
  "570013",
  "570014",
  "570015",
  "570016",
  "570017",
  "570018",
  "570019",
  "570020",
  "570021",
  "570022",
  "570023",
  "570024",
  "570025",
  "570026",
  "570027",
  "570028",
  "570029",
  "570030",
  "570031",
  "570032",
] as const;

export type MysuruCityPincode = (typeof MYSURU_CITY_PINCODES)[number];

/**
 * Project-owner-provided authoritative locality mapping for the 32 Mysuru City pincodes.
 */
export const MYSURU_CITY_PINCODE_LOCALITIES: Record<MysuruCityPincode, string> = {
  "570001": "Mysuru Head Post Office, Devaraja Mohalla, Lashkar Mohalla",
  "570002": "Gokulam Extension, Vani Vilas Mohalla",
  "570003": "Sri Krishnarajendra Mills, Note Mudran Nagar, Siddalingapura",
  "570004": "Lakshmipuram, Krishnamurthypuram, Chamundipuram, Mysuru Fort",
  "570005": "University Campus (Manasagangothri), Mysuru Law Courts",
  "570006": "Regional College of Education, University Campus Area",
  "570007": "Narasimharaja Mohalla, Gandhinagar, Rajendranagar",
  "570008": "Ashokpuram, Srirampura (1st Stage), Industrial Suburb, J.P. Nagar",
  "570009": "Saraswathipuram",
  "570010": "Nazarbad, Ittigegud, Chamundi Betta (Hill), PTC Campus",
  "570011": "Siddarthanagar, Jyothinagar, Administrative Training Institute",
  "570012": "Jayalakshmipuram Extension",
  "570013": "Food Technology (CFTRI Campus Area)",
  "570014": "Vidyaranyapuram, Jayanagar Extension",
  "570015": "Bannimantap, Shivarathreeswara Nagar (SS Nagar)",
  "570016": "Metagalli, Hebbal Layout (1st & 2nd Stages)",
  "570017": "Vijayanagar (Stages I, II, III), Hinkal",
  "570018": "Belavadi, Koorgalli Industrial Area",
  "570019": "Udayagiri, Jalapuri, Kyathamaranahalli, Rajivnagar",
  "570020": "Yadavagiri, Brindavan Extension, Industrial Estate",
  "570021": "Mandi Mohalla, New Bamboo Bazar, Tilak Nagar",
  "570022": "Ramakrishna Nagar (A-H Blocks), Sharadadevi Nagar",
  "570023": "Kuvempunagar, J.T. Extension",
  "570024": "K.R. Mohalla",
  "570025": "G S Ashram, Bandipalya (APMC Market area)",
  "570026": "Bogadi, Kergalli, BEML Layout, Alanahalli Village",
  "570027": "Infosys Campus (Hebbal Electronic City)",
  "570028": "Alanahalli Suburban Layout, Lalithadripura, Harohalli",
  "570029": "Shakthinagar, Sathagalli Extn, Kalyanagiri",
  "570030": "Srirampura 2nd Stage / Outer Ring Road Residential Blocks (New)",
  "570031": "Police Layout / SVP Nagar Area (New)",
  "570032": "Vijayanagar 4th Stage (New)",
};

export interface DeliveryZone {
  id: ID;
  name: string;
  city: string; // not hardcoded to Mysuru — keeps multi-city expansion schema-compatible
  pincodes: string[];
  boundary: { lat: number; lng: number }[] | null;
  kitchenId: ID;
  isActive: boolean;
  createdAt: Timestamp;
}

/**
 * Firestore: `deliveries/{deliveryId}`.
 * Deliberately separate from `orders/{orderId}` (one-to-one, linked by
 * orderId): Kitchen cares about the Order (what to cook), Delivery Partner
 * cares about this (logistics, proof of delivery, live location) — keeping
 * them apart means each role's security rules and queries stay narrow and
 * each collection stays single-purpose.
 */
export interface Delivery {
  id: ID;
  orderId: ID;
  customerId: ID;
  deliveryPartnerId: ID | null;
  zoneId: ID | null;
  status: DeliveryStatus;
  /** Snapshot so a later address edit never rewrites where a past delivery actually went. */
  addressSnapshot: Address;
  scheduledWindow: TimeWindow;
  assignedAt: Timestamp | null;
  pickedUpAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  /** Firebase Storage path, e.g. `delivery-proof/{deliveryId}.jpg` — see storage.rules. */
  proofOfDeliveryUrl: string | null;
  failureReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
