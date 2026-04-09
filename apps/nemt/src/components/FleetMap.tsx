import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useCollection } from '../hooks/useData';

// Fix Leaflet's default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const driverIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Component to auto-fit bounds
function MapBounds({ drivers }: { drivers: any[] }) {
  const map = useMap();
  
  useEffect(() => {
    const bounds = new L.LatLngBounds([]);
    
    drivers.forEach(d => {
      if (d.current_location) {
        try {
          if (Array.isArray(d.current_location)) {
            bounds.extend(d.current_location);
          } else if (d.current_location.lat !== undefined && d.current_location.lng !== undefined) {
            bounds.extend([d.current_location.lat, d.current_location.lng]);
          }
        } catch (e) {
          console.warn('Invalid location for driver:', d.id);
        }
      }
    });
    
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [drivers, map]);
  
  return null;
}

export default function FleetMap() {
  const { data: drivers } = useCollection('drivers');

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Live Fleet Map</h2>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-slate-600">Drivers ({drivers.length})</span>
          </div>
        </div>
      </div>
      
      <div className="h-[calc(100vh-12rem)] rounded-xl overflow-hidden shadow-sm border border-slate-200">
        <MapContainer center={[42.3314, -83.0458]} zoom={10} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <MapBounds drivers={drivers} />
          
          {/* Driver markers */}
          {drivers.map(driver => {
            if (!driver.current_location) return null;
            
            const position: [number, number] = Array.isArray(driver.current_location) 
              ? [driver.current_location[0], driver.current_location[1]]
              : [driver.current_location.lat, driver.current_location.lng];

            if (isNaN(position[0]) || isNaN(position[1])) return null;

            return (
              <Marker key={`driver-${driver.id}`} position={position} icon={driverIcon}>
                <Popup>
                  <div className="font-semibold text-blue-700">{driver.name}</div>
                  <div className="text-xs text-slate-500">License: {driver.license_number}</div>
                  <div className="text-xs text-slate-500">Shift: {driver.shift_start} - {driver.shift_end}</div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
