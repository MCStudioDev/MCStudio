import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { MapPin, Clock, User, Phone, Navigation, Route } from 'lucide-react';
import { useCollection, getDocument } from '../hooks/useData';
import { calculateTotalDistance, formatDistance, estimateDriveTime, formatDriveTime } from '../utils/routeOptimization';

interface DriverManifestProps {
  driverId?: string | null;
  driverLocation?: { lat: number; lng: number } | null;
}

export default function DriverManifest({ driverId, driverLocation }: DriverManifestProps) {
  const { data: allTrips } = useCollection('trips');
  const [trips, setTrips] = useState<any[]>([]);
  const [gpsStatus, setGpsStatus] = useState<'locating' | 'active' | 'error'>('locating');

  useEffect(() => {
    if (!driverId) return;

    // Filter trips for current driver and populate patient data
    const driverTrips = allTrips.filter(trip => trip.driver_id === driverId);
    
    const populatePatients = async () => {
      const populatedTrips = await Promise.all(driverTrips.map(async (trip: any) => {
        if (trip.patient_id) {
          const patient = await getDocument('patients', trip.patient_id);
          if (patient) {
            return { ...trip, patient };
          }
        }
        return trip;
      }));
      
      // Sort by optimized_order (set by dispatcher) or pickup_time
      populatedTrips.sort((a, b) => {
        if (a.optimized_order !== undefined && b.optimized_order !== undefined) {
          return a.optimized_order - b.optimized_order;
        }
        // Fallback to pickup time
        const timeToMins = (t: string) => {
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m;
        };
        return timeToMins(a.pickup_time || '00:00') - timeToMins(b.pickup_time || '00:00');
      });
      
      setTrips(populatedTrips);
      setGpsStatus('active');
    };

    populatePatients();
  }, [driverId, allTrips]);

  // Calculate current route stats
  const routeStats = trips.length > 0 ? {
    totalDistance: calculateTotalDistance(trips, driverLocation || undefined),
    estimatedTime: estimateDriveTime(calculateTotalDistance(trips, driverLocation || undefined))
  } : null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'En Route': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Arrived': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Onboard': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-bold text-slate-800">Today's Manifest</h2>
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {gpsStatus === 'active' && (
            <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              GPS Active
            </span>
          )}
          {gpsStatus === 'locating' && (
            <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Locating...</span>
          )}
          {gpsStatus === 'error' && (
            <span className="text-red-600 bg-red-50 px-2 py-1 rounded-full">GPS Error</span>
          )}
        </div>
      </div>

      {/* Route Stats (read-only - optimization done by dispatcher) */}
      {trips.length > 1 && routeStats && (
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route className="w-5 h-5 text-slate-600" />
              <span className="font-semibold text-slate-800">{trips.length} Stops</span>
            </div>
            <div className="text-sm text-slate-600">
              ~{formatDistance(routeStats.totalDistance)} • {formatDriveTime(routeStats.estimatedTime)}
            </div>
          </div>
        </div>
      )}
      
      {trips.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          <p>No trips assigned for today.</p>
        </div>
      )}
      
      {trips.map((trip) => (
        <Link 
          key={trip.id} 
          to={`/driver/trip/${trip.id}`}
          className={`block bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition ${getStatusColor(trip.status)}`}
        >
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 opacity-70" />
              <div className="flex flex-col">
                <span className="text-xs opacity-70">{trip.pickup_date}</span>
                <span className="font-bold text-lg">{trip.pickup_time}</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-white/50">
              {trip.status}
            </span>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 opacity-50 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">{trip.patient ? trip.patient.name : <span className="text-red-500 italic">Deleted Patient</span>}</p>
                <p className="text-sm opacity-80">{trip.patient?.mobility_status || 'N/A'}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 opacity-50 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-900">{trip.pickup_address || trip.patient?.home_address}</p>
                <p className="text-xs opacity-80">Pickup Location</p>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
