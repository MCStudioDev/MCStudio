import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { MapPin, Clock, User, Phone, Navigation, CheckCircle, ArrowLeft, ExternalLink } from 'lucide-react';
import { useDocument, getDocument, updateDocument } from '../hooks/useData';

export default function TripDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: trip, loading } = useDocument('trips', id || null);
  const [patient, setPatient] = useState<any>(null);
  const [showNavOptions, setShowNavOptions] = useState<'pickup' | 'dropoff' | null>(null);

  useEffect(() => {
    if (trip?.patient_id) {
      getDocument('patients', trip.patient_id).then(setPatient);
    }
  }, [trip?.patient_id]);

  const updateStatus = async (status: string) => {
    if (!id) return;
    try {
      await updateDocument('trips', id, { status });
    } catch (error) {
      console.error('Error updating trip status:', error);
    }
  };

  // Navigation options
  const getNavigationLinks = (address: string, lat?: number, lng?: number) => {
    const encodedAddress = encodeURIComponent(address);
    const coords = lat && lng ? `${lat},${lng}` : null;
    
    return {
      google: coords 
        ? `https://www.google.com/maps/dir/?api=1&destination=${coords}`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`,
      waze: coords
        ? `https://waze.com/ul?ll=${coords}&navigate=yes`
        : `https://waze.com/ul?q=${encodedAddress}&navigate=yes`,
      apple: coords
        ? `http://maps.apple.com/?daddr=${coords}`
        : `http://maps.apple.com/?daddr=${encodedAddress}`,
    };
  };

  const NavigationModal = ({ destination, lat, lng, onClose }: { destination: string; lat?: number; lng?: number; onClose: () => void }) => {
    const links = getNavigationLinks(destination, lat, lng);
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-t-3xl w-full max-w-md p-6 space-y-3 animate-in slide-in-from-bottom" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-bold text-slate-800 text-center mb-4">Choose Navigation App</h3>
          
          <a 
            href={links.google}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition"
          >
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Google_Maps_icon_%282020%29.svg/1200px-Google_Maps_icon_%282020%29.svg.png" alt="Google Maps" className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">Google Maps</p>
              <p className="text-sm text-slate-500">Turn-by-turn navigation</p>
            </div>
            <ExternalLink className="w-5 h-5 text-slate-400" />
          </a>
          
          <a 
            href={links.waze}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition"
          >
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Waze_logo.svg/2048px-Waze_logo.svg.png" alt="Waze" className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">Waze</p>
              <p className="text-sm text-slate-500">Real-time traffic alerts</p>
            </div>
            <ExternalLink className="w-5 h-5 text-slate-400" />
          </a>
          
          <a 
            href={links.apple}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition"
          >
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Apple_Maps_%28iOS%29.svg/1200px-Apple_Maps_%28iOS%29.svg.png" alt="Apple Maps" className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">Apple Maps</p>
              <p className="text-sm text-slate-500">iOS native navigation</p>
            </div>
            <ExternalLink className="w-5 h-5 text-slate-400" />
          </a>
          
          <button 
            onClick={onClose}
            className="w-full mt-4 py-3 text-slate-500 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading trip details...</div>;
  if (!trip) return <div className="p-8 text-center text-slate-500">Trip not found.</div>;

  const tripWithPatient = { ...trip, patient };

  const pickupAddress = tripWithPatient.pickup_address || tripWithPatient.patient?.home_address || '';
  const pickupLoc = tripWithPatient.pickup_location;
  const dropoffAddress = tripWithPatient.dropoff_address || 'Davita Dialysis Center';
  const dropoffLoc = tripWithPatient.dropoff_location;

  return (
    <div className="space-y-6">
      <button 
        onClick={() => navigate(-1)} 
        className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-800 transition"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Manifest
      </button>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
        <div className="bg-indigo-50 p-6 border-b border-indigo-100">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold text-indigo-900">
              {tripWithPatient.patient ? tripWithPatient.patient.name : <span className="text-red-500 italic">Deleted Patient</span>}
            </h2>
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-indigo-200 text-indigo-800">
              {tripWithPatient.status}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-indigo-600/70 font-medium uppercase tracking-wider">Pickup</p>
                <p className="text-lg font-bold text-indigo-900">{tripWithPatient.pickup_time}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-indigo-600/70 font-medium uppercase tracking-wider">Appt</p>
                <p className="text-lg font-bold text-indigo-900">{tripWithPatient.appointment_time}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 mt-1">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Pickup Location</p>
                <p className="text-base font-semibold text-slate-900">{pickupAddress}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 mt-1">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Dropoff Location</p>
                <p className="text-base font-semibold text-slate-900">{dropoffAddress}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">Patient Needs</h3>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">
                {tripWithPatient.patient?.mobility_status || 'Not specified'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {tripWithPatient.status === 'Scheduled' && (
          <button 
            onClick={() => updateStatus('En Route')}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-md transition flex items-center justify-center gap-2"
          >
            <Navigation className="w-6 h-6" />
            Start Trip (En Route)
          </button>
        )}
        {tripWithPatient.status === 'En Route' && (
          <>
            <button 
              onClick={() => setShowNavOptions('pickup')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-xl font-bold text-lg shadow-md transition flex items-center justify-center gap-2"
            >
              <Navigation className="w-6 h-6" />
              Navigate to Pickup
            </button>
            <button 
              onClick={() => updateStatus('Arrived')}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-xl font-bold text-lg shadow-md transition flex items-center justify-center gap-2"
            >
              <MapPin className="w-6 h-6" />
              Arrived at Pickup
            </button>
          </>
        )}
        {tripWithPatient.status === 'Arrived' && (
          <button 
            onClick={() => updateStatus('Onboard')}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold text-lg shadow-md transition flex items-center justify-center gap-2"
          >
            <User className="w-6 h-6" />
            Patient Onboard
          </button>
        )}
        {tripWithPatient.status === 'Onboard' && (
          <>
            <button 
              onClick={() => setShowNavOptions('dropoff')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-xl font-bold text-lg shadow-md transition flex items-center justify-center gap-2"
            >
              <Navigation className="w-6 h-6" />
              Navigate to Dropoff
            </button>
            <button 
              onClick={() => updateStatus('Completed')}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg shadow-md transition flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-6 h-6" />
              Complete Trip
            </button>
          </>
        )}
        <a 
          href={`tel:${tripWithPatient.patient?.phone || ''}`}
          className="w-full bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 py-4 rounded-xl font-bold text-lg transition flex items-center justify-center gap-2"
        >
          <Phone className="w-6 h-6" />
          Call Patient
        </a>
      </div>

      {/* Navigation Options Modal */}
      {showNavOptions === 'pickup' && (
        <NavigationModal 
          destination={pickupAddress}
          lat={pickupLoc?.lat}
          lng={pickupLoc?.lng}
          onClose={() => setShowNavOptions(null)}
        />
      )}
      {showNavOptions === 'dropoff' && (
        <NavigationModal 
          destination={dropoffAddress}
          lat={dropoffLoc?.lat}
          lng={dropoffLoc?.lng}
          onClose={() => setShowNavOptions(null)}
        />
      )}
    </div>
  );
}
