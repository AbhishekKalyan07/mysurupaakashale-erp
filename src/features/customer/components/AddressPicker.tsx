import { useState, useRef, useEffect } from "react";
import {
  MapPin,
  Search,
  Loader2,
  X,
  Map,
} from "lucide-react";
import { MapPinPicker } from "./MapPinPicker";

interface NominatimResult {
  place_id: number;
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  lat: string;
  lon: string;
}

export interface PickedAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
}

interface AddressPickerProps {
  onPick: (address: PickedAddress) => void;
}

/**
 * Forward geocode query → address suggestions via Nominatim (text search only).
 * No browser/device geolocation is used here.
 */
async function searchAddress(query: string): Promise<NominatimResult[]> {
  if (query.length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + " Mysuru India")}&addressdetails=1&limit=6&countrycodes=in&email=admin@mysurupaakashale.in`;
  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "en" },
    });
    if (!res.ok) return [];
    return res.json();
  } catch (error) {
    console.error("Nominatim search error:", error);
    return [];
  }
}

function parseNominatim(result: NominatimResult): PickedAddress {
  const a = result.address;
  const road = [a.house_number, a.road].filter(Boolean).join(", ");
  const line1 = road || result.display_name.split(",")[0];
  const line2 = [a.neighbourhood, a.suburb].filter(Boolean).join(", ");
  const city = a.city || a.town || a.village || "Mysuru";
  const state = a.state || "Karnataka";
  const pincode = a.postcode || "";
  return {
    line1,
    line2: line2 || undefined,
    city,
    state,
    pincode,
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
  };
}

/**
 * AddressPicker — allows the customer to find and confirm a delivery address
 * entirely through manual text search + map pin adjustment.
 *
 * D7 NOTE: Browser device-location API ("Use My Current Location") has been
 * intentionally removed. No automatic location detection occurs.
 * Customers must use the search field to locate their address.
 */
export function AddressPicker({ onPick }: AddressPickerProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Holds a candidate address while the customer adjusts the map pin
  const [tempAddress, setTempAddress] = useState<PickedAddress | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced Nominatim text search
  useEffect(() => {
    let currentRequestId = Date.now();

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = currentRequestId;
      setIsSearching(true);
      const results = await searchAddress(query);

      // Discard stale results if a newer request was started
      if (currentRequestId !== requestId) return;

      setSuggestions(results);
      setShowDropdown(results.length > 0);
      setIsSearching(false);
    }, 500);
    return () => {
      currentRequestId = -1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelectSuggestion = (result: NominatimResult) => {
    const picked = parseNominatim(result);
    setQuery(result.display_name.split(",").slice(0, 2).join(","));
    setShowDropdown(false);
    setSuggestions([]);
    setTempAddress(picked);
  };

  const handleConfirmLocation = () => {
    if (tempAddress) {
      onPick(tempAddress);
      setTempAddress(null);
      setQuery("");
    }
  };

  const handleMapPinChange = (loc: { lat: number; lng: number }) => {
    if (tempAddress) {
      setTempAddress({ ...tempAddress, lat: loc.lat, lng: loc.lng });
    }
  };

  // If we have a candidate address, show the map pin-adjustment view
  if (tempAddress) {
    return (
      <div className="space-y-4 animate-fade-in bg-rice-50 p-4 rounded-xl border border-emerald-200">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-sm font-bold text-ink-900 flex items-center gap-2">
              <Map size={16} className="text-emerald-600" /> Adjust Pin Location
            </h4>
            <p className="text-xs text-ink-500 mt-1">
              Drag the pin to exactly where you want your meals delivered.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTempAddress(null)}
            aria-label="Close pin picker"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-500 hover:text-ink-700 hover:bg-rice-200 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        <MapPinPicker
          initialLocation={{ lat: tempAddress.lat, lng: tempAddress.lng }}
          onLocationChange={handleMapPinChange}
        />

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setTempAddress(null)}
            className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold text-ink-600 hover:bg-rice-200 rounded-lg transition flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmLocation}
            className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition flex items-center justify-center"
          >
            Confirm Exact Location
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Manual Address Search Box — no geolocation permission is requested */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none"
          />
          {isSearching && (
            <Loader2
              size={15}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 animate-spin"
            />
          )}
          <input
            id="address-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your street, landmark, area…"
            aria-label="Search address"
            className="w-full h-11 pl-9 pr-10 text-sm font-sans border border-rice-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white text-ink-900 placeholder:text-ink-500 transition"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setSuggestions([]);
                setShowDropdown(false);
              }}
              className="absolute right-0 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-500 hover:text-ink-700"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Suggestions Dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 top-full mt-1.5 left-0 right-0 bg-white border border-rice-200 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((result) => (
              <button
                key={result.place_id}
                type="button"
                onClick={() => handleSelectSuggestion(result)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-rice-50 transition-colors text-left border-b border-rice-100 last:border-0"
              >
                <MapPin
                  size={14}
                  className="text-emerald-600 shrink-0 mt-0.5"
                />
                <div className="min-w-0">
                  <p className="text-sm font-sans text-ink-800 font-medium leading-tight line-clamp-1">
                    {result.display_name.split(",").slice(0, 2).join(",")}
                  </p>
                  <p className="text-xs text-ink-500 mt-0.5 line-clamp-1">
                    {result.display_name.split(",").slice(2, 5).join(",")}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
