import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { renderToString } from 'react-dom/server';
import { MapPin } from 'lucide-react';

// Create a custom icon using Lucide React to avoid Leaflet's default image path issues
const customMarkerIcon = L.divIcon({
  html: renderToString(<div className="text-leaf-600 drop-shadow-md relative -top-8 -left-3"><MapPin size={32} strokeWidth={2.5} fill="white" /></div>),
  className: 'custom-leaflet-marker',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

interface Location {
  lat: number;
  lng: number;
}

interface MapPinPickerProps {
  initialLocation?: Location | null;
  onLocationChange: (location: Location) => void;
}

// Default center to Mysuru
const DEFAULT_CENTER: Location = { lat: 12.2958, lng: 76.6394 };

function MapEvents({ onLocationSelected }: { onLocationSelected: (loc: Location) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelected({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export function MapPinPicker({ initialLocation, onLocationChange }: MapPinPickerProps) {
  const [position, setPosition] = useState<Location>(initialLocation || DEFAULT_CENTER);
  const mapRef = useRef<L.Map | null>(null);

  // Sync prop changes (e.g. when search results change)
  useEffect(() => {
    if (initialLocation) {
      setPosition(initialLocation);
      if (mapRef.current) {
        mapRef.current.flyTo([initialLocation.lat, initialLocation.lng], 16, {
          duration: 0.5
        });
      }
    }
  }, [initialLocation]);

  const handleLocationChange = (newPos: Location) => {
    setPosition(newPos);
    onLocationChange(newPos);
  };

  return (
    <div className="w-full h-[300px] rounded-xl overflow-hidden border-2 border-rice-300 relative z-0">
      <MapContainer
        center={[position.lat, position.lng]}
        zoom={16}
        scrollWheelZoom={true}
        className="w-full h-full"
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker 
          position={[position.lat, position.lng]} 
          icon={customMarkerIcon}
          draggable={true}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const pos = marker.getLatLng();
              handleLocationChange({ lat: pos.lat, lng: pos.lng });
            },
          }}
        />
        <MapEvents onLocationSelected={handleLocationChange} />
      </MapContainer>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[400] bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-rice-200 pointer-events-none">
        <p className="text-xs font-sans font-bold text-ink-700">Drag the pin to adjust</p>
      </div>
    </div>
  );
}
