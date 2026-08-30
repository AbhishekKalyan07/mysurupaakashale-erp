import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Navigation, Search, Loader2, X, CheckCircle2, Map } from 'lucide-react';
import { MapPinPicker } from './MapPinPicker';

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

// Reverse geocode lat/lng → address via Nominatim
async function reverseGeocode(lat: number, lng: number): Promise<NominatimResult | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&email=admin@mysurupaakashale.in`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error('Nominatim reverse geocode error:', error);
    return null;
  }
}

// Forward geocode query → suggestions
async function searchAddress(query: string): Promise<NominatimResult[]> {
  if (query.length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Mysuru India')}&addressdetails=1&limit=6&countrycodes=in&email=admin@mysurupaakashale.in`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return [];
    return res.json();
  } catch (error) {
    console.error('Nominatim search error:', error);
    return [];
  }
}

function parseNominatim(result: NominatimResult): PickedAddress {
  const a = result.address;
  const road = [a.house_number, a.road].filter(Boolean).join(', ');
  const line1 = road || result.display_name.split(',')[0];
  const line2 = [a.neighbourhood, a.suburb].filter(Boolean).join(', ');
  const city = a.city || a.town || a.village || 'Mysuru';
  const state = a.state || 'Karnataka';
  const pincode = a.postcode || '';
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

export function AddressPicker({ onPick }: AddressPickerProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [locationMessage, setLocationMessage] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  
  // New state to hold the address before confirmation
  const [tempAddress, setTempAddress] = useState<PickedAddress | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    let currentRequestId = Date.now();
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = currentRequestId;
      setIsSearching(true);
      const results = await searchAddress(query);
      
      // If a newer request was started, discard these results
      if (currentRequestId !== requestId) return;
      
      setSuggestions(results);
      setShowDropdown(results.length > 0);
      setIsSearching(false);
    }, 500);
    return () => {
      currentRequestId = -1; // invalidate any pending requests on unmount/re-render
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleUseLiveLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationMessage('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setLocationStatus('idle');
    setLocationMessage('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const result = await reverseGeocode(latitude, longitude);
          if (!result) throw new Error('Could not resolve address');
          const picked = parseNominatim(result);
          setLocationStatus('success');
          setLocationMessage('Location detected! Please review and adjust the pin below.');
          setTempAddress(picked);
          // Don't call onPick yet, let them adjust the map
        } catch {
          setLocationStatus('error');
          setLocationMessage('Could not get address for your location. Please search manually.');
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        setIsLocating(false);
        setLocationStatus('error');
        if (err.code === 1) {
          setLocationMessage('Location access denied. Please allow location permission and try again.');
        } else {
          setLocationMessage('Could not detect location. Please search manually.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleSelectSuggestion = (result: NominatimResult) => {
    const picked = parseNominatim(result);
    setQuery(result.display_name.split(',').slice(0, 2).join(','));
    setShowDropdown(false);
    setSuggestions([]);
    setTempAddress(picked);
    setLocationStatus('idle');
    setLocationMessage('');
  };

  const handleConfirmLocation = () => {
    if (tempAddress) {
      onPick(tempAddress);
      setTempAddress(null);
      setQuery('');
      setLocationStatus('idle');
    }
  };

  const handleMapPinChange = (loc: { lat: number, lng: number }) => {
    if (tempAddress) {
      setTempAddress({ ...tempAddress, lat: loc.lat, lng: loc.lng });
    }
  };

  // If we have a temp address, show the map instead of the search box
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
          <button aria-label="Button action" 
            type="button" 
            onClick={() => setTempAddress(null)}
            className="p-1 text-ink-500 hover:text-ink-700 hover:bg-rice-200 rounded-lg transition"
          >
            <X size={16} />
          </button>
        </div>
        
        <MapPinPicker 
          initialLocation={{ lat: tempAddress.lat, lng: tempAddress.lng }}
          onLocationChange={handleMapPinChange}
        />
        
        <div className="flex justify-end gap-3 pt-2">
          <button aria-label="Button action"
            type="button"
            onClick={() => setTempAddress(null)}
            className="px-4 py-2 text-xs font-bold text-ink-600 hover:bg-rice-200 rounded-lg transition"
          >
            Cancel
          </button>
          <button aria-label="Button action"
            type="button"
            onClick={handleConfirmLocation}
            className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition"
          >
            Confirm Exact Location
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Live Location Button */}
      <button aria-label="Button action"
        type="button"
        onClick={handleUseLiveLocation}
        disabled={isLocating}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-700 font-sans font-semibold text-sm transition-all hover:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed group"
      >
        {isLocating ? (
          <Loader2 size={18} className="animate-spin shrink-0" />
        ) : (
          <Navigation size={18} className="shrink-0 group-hover:scale-110 transition-transform" />
        )}
        <span>{isLocating ? 'Detecting your location…' : 'Use My Current Location'}</span>
      </button>

      {/* Location status feedback */}
      {locationStatus !== 'idle' && (
        <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs font-sans ${
          locationStatus === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {locationStatus === 'success' ? (
            <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          ) : (
            <X size={14} className="shrink-0 mt-0.5" />
          )}
          <span>{locationMessage}</span>
        </div>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-rice-200" />
        <span className="text-xs text-ink-500 font-sans">or search</span>
        <div className="flex-1 h-px bg-rice-200" />
      </div>

      {/* Search Box */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
          {isSearching && (
            <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 animate-spin" />
          )}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your street, landmark, area…"
            className="w-full pl-9 pr-9 py-2.5 text-sm font-sans border border-rice-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white text-ink-900 placeholder:text-ink-500 transition"
          />
          {query && (
            <button aria-label="Button action"
              type="button"
              onClick={() => { setQuery(''); setSuggestions([]); setShowDropdown(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-700"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Suggestions Dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 top-full mt-1.5 left-0 right-0 bg-white border border-rice-200 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((result) => (
              <button aria-label="Button action"
                key={result.place_id}
                type="button"
                onClick={() => handleSelectSuggestion(result)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-rice-50 transition-colors text-left border-b border-rice-100 last:border-0"
              >
                <MapPin size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-sans text-ink-800 font-medium leading-tight line-clamp-1">
                    {result.display_name.split(',').slice(0, 2).join(',')}
                  </p>
                  <p className="text-xs text-ink-500 mt-0.5 line-clamp-1">
                    {result.display_name.split(',').slice(2, 5).join(',')}
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
