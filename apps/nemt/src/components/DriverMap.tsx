import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { updateDocument } from '../hooks/useData';

const driverIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3204/3204121.png',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

interface DriverMapProps {
  driverId?: string | null;
}

export default function DriverMap({ driverId }: DriverMapProps) {
  const [position, setPosition] = useState<[number, number] | null>(null);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
        (err) => {
          console.error(err);
          setPosition([42.3314, -83.0458]); // Fallback to Detroit
        },
        { enableHighAccuracy: true }
      );
    } else {
      setPosition([42.3314, -83.0458]);
    }
  }, []);

  if (!position) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Current Location</h2>
        {driverId && (
          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold uppercase tracking-wider animate-pulse">
            Live Tracking Active
          </span>
        )}
      </div>
      <div className="flex-1 rounded-xl overflow-hidden shadow-sm border border-slate-200 relative z-0">
        <MapContainer center={position} zoom={15} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          <Marker position={position} icon={driverIcon}>
            <Popup>You are here</Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}
