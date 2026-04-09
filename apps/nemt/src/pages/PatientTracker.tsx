import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Clock, MapPin, Navigation, User, CheckCircle } from 'lucide-react';
import { db } from '../config/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

const driverIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const pickupIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const dropoffIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function PatientTracker() {
  const { tripId } = useParams();
  const [trip, setTrip] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const normalizeCoord = (coord: any): [number, number] | null => {
    if (!coord) return null;
    if (Array.isArray(coord)) return [coord[0], coord[1]];
    if (typeof coord === 'object' && coord.lat !== undefined && coord.lng !== undefined) {
      return [coord.lat, coord.lng];
    }
    return null;
  };

  useEffect(() => {
    if (!tripId) return;

    const unsubscribeTrip = onSnapshot(doc(db, 'trips', tripId), async (tripDoc) => {
      if (tripDoc.exists()) {
        const tripData = { id: tripDoc.id, ...tripDoc.data() } as any;
        
        if (tripData.patient_id) {
          try {
            const patientDoc = await getDoc(doc(db, 'patients', tripData.patient_id));
            if (patientDoc.exists()) {
              tripData.patient = { id: patientDoc.id, ...patientDoc.data() };
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, `patients/${tripData.patient_id}`);
          }
        }

        if (tripData.driver_id) {
          try {
            const driverDoc = await getDoc(doc(db, 'drivers', tripData.driver_id));
            if (driverDoc.exists()) {
              tripData.driver = { id: driverDoc.id, ...driverDoc.data() };
              const normalized = normalizeCoord(tripData.driver.current_location);
              if (normalized) {
                setDriverLocation(normalized);
              }
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, `drivers/${tripData.driver_id}`);
          }
        }

        setTrip(tripData);
        setLoading(false);
      } else {
        setTrip(null);
        setLoading(false);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `trips/${tripId}`));

    return () => unsubscribeTrip();
  }, [tripId]);

  useEffect(() => {
    if (!trip?.driver_id) return;

    const unsubscribeDriver = onSnapshot(doc(db, 'drivers', trip.driver_id), (doc) => {
      if (doc.exists()) {
        const driverData = doc.data();
        const normalized = normalizeCoord(driverData.current_location);
        if (normalized) {
          setDriverLocation(normalized);
        }
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `drivers/${trip.driver_id}`));

    return () => unsubscribeDriver();
  }, [trip?.driver_id]);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading trip details...</div>;
  if (!trip) return <div className="p-8 text-center text-slate-500">Trip not found.</div>;

  const getStatusDisplay = () => {
    switch (trip.status) {
      case 'Scheduled':
        return { color: 'text-blue-600', bg: 'bg-blue-100', text: 'Scheduled', icon: Clock };
      case 'En Route':
        return { color: 'text-purple-600', bg: 'bg-purple-100', text: 'Driver En Route', icon: Navigation };
      case 'Arrived':
        return { color: 'text-amber-600', bg: 'bg-amber-100', text: 'Driver Arrived', icon: MapPin };
      case 'Onboard':
        return { color: 'text-orange-600', bg: 'bg-orange-100', text: 'Onboard', icon: User };
      case 'Completed':
        return { color: 'text-emerald-600', bg: 'bg-emerald-100', text: 'Completed', icon: CheckCircle };
      default:
        return { color: 'text-slate-600', bg: 'bg-slate-100', text: trip.status, icon: Clock };
    }
  };

  const statusDisplay = getStatusDisplay();
  const StatusIcon = statusDisplay.icon;

  const pickupLocation = normalizeCoord(trip.pickup_location);
  const dropoffLocation = normalizeCoord(trip.dropoff_location);

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      <header className="bg-indigo-600 text-white p-4 shadow-md shrink-0 z-10 text-center">
        <h1 className="text-lg font-bold">NEMT Ride Tracker</h1>
        <p className="text-xs text-indigo-200">Trip #{trip.id}</p>
      </header>

      <main className="flex-1 overflow-auto flex flex-col">
        <div className="h-64 shrink-0 relative z-0">
          {(pickupLocation || driverLocation) ? (
            <MapContainer 
              center={(driverLocation || pickupLocation) as [number, number]} 
              zoom={13} 
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {driverLocation && (
                <Marker position={driverLocation} icon={driverIcon}>
                  <Popup>Your Driver</Popup>
                </Marker>
              )}
              {pickupLocation && (
                <Marker position={pickupLocation} icon={pickupIcon}>
                  <Popup>Pickup Location</Popup>
                </Marker>
              )}
              {dropoffLocation && (
                <Marker position={dropoffLocation} icon={dropoffIcon}>
                  <Popup>Dropoff Location</Popup>
                </Marker>
              )}
            </MapContainer>
          ) : (
            <div className="h-full w-full bg-slate-200 flex items-center justify-center text-slate-400">
              Map Unavailable
            </div>
          )}
        </div>

        {/* Details Section */}
        <div className="p-6 space-y-6 flex-1 bg-white rounded-t-3xl -mt-6 relative z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Hi, {trip.patient?.name?.split(' ')[0] || 'Patient'}</h2>
              <p className="text-slate-500 text-sm mt-1">Here is your trip status:</p>
            </div>
            <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-2xl ${statusDisplay.bg} ${statusDisplay.color}`}>
              <StatusIcon className="w-8 h-8 mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight">
                {statusDisplay.text}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pickup Time</p>
                <p className="text-lg font-bold text-slate-900">{trip.pickup_time}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Your Driver</p>
                <p className="text-lg font-bold text-slate-900">{trip.driver?.name || 'Unassigned'}</p>
                <p className="text-sm text-slate-600">{trip.driver?.license_number}</p>
              </div>
            </div>
          </div>

          {/* Notifications */}
          {notifications.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Recent Updates</h3>
              <div className="space-y-2">
                {notifications.map((msg, idx) => (
                  <div key={idx} className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r-lg">
                    <p className="text-sm text-blue-800 font-medium">{msg}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
