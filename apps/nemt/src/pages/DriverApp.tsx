import { Routes, Route, Link, useLocation } from 'react-router';
import { MapPin, Navigation, CheckCircle, Clock, Users, KeyRound } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useCollection, updateDocument } from '../hooks/useData';
import DriverManifest from '../components/DriverManifest';
import TripDetails from './TripDetails';
import DriverMap from '../components/DriverMap';

export default function DriverApp() {
  const location = useLocation();
  const { data: drivers } = useCollection('drivers');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(localStorage.getItem('selectedDriverId'));
  const [pinInput, setPinInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifyingDriver, setVerifyingDriver] = useState<any>(null);
  const [loginMode, setLoginMode] = useState<'select' | 'manual'>('select');

  const selectedDriver = drivers.find(d => d.id === selectedDriverId);

  useEffect(() => {
    let watchId: number;

    if (selectedDriverId && 'geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            await updateDocument('drivers', selectedDriverId, {
              current_location: { lat: pos.coords.latitude, lng: pos.coords.longitude }
            });
          } catch (error) {
            console.error('Error updating driver location:', error);
          }
        },
        (err) => console.error('Geolocation error:', err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [selectedDriverId]);

  const handleSelectDriver = (driver: any) => {
    setVerifyingDriver(driver);
    setPinInput('');
    setError(null);
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyingDriver.pin === pinInput) {
      setSelectedDriverId(verifyingDriver.id);
      localStorage.setItem('selectedDriverId', verifyingDriver.id);
      setVerifyingDriver(null);
    } else {
      setError('Invalid PIN. Please try again.');
    }
  };

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Find driver by name (case-insensitive partial match)
    const driver = drivers.find(d => 
      d.name.toLowerCase().includes(nameInput.toLowerCase().trim())
    );
    
    if (!driver) {
      setError('Driver not found. Please check your name.');
      return;
    }
    
    if (driver.pin !== pinInput) {
      setError('Invalid PIN. Please try again.');
      return;
    }
    
    setSelectedDriverId(driver.id);
    localStorage.setItem('selectedDriverId', driver.id);
  };

  if (verifyingDriver) {
    return (
      <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto shadow-2xl overflow-hidden p-6 items-center justify-center">
        <div className="w-full bg-white p-8 rounded-2xl shadow-lg border border-slate-100">
          <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">Enter PIN</h2>
          <p className="text-slate-500 mb-6 text-center">Please enter your 4-digit PIN for <span className="font-bold text-indigo-600">{verifyingDriver.name}</span></p>
          
          <form onSubmit={handleVerifyPin} className="space-y-4">
            <input 
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="\d{4}"
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              className="w-full text-center text-3xl tracking-[1em] font-bold py-4 border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none transition"
              placeholder="••••"
            />
            {error && <p className="text-red-500 text-sm text-center font-medium">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setVerifyingDriver(null)}
                className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={pinInput.length !== 4}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50"
              >
                Login
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (!selectedDriverId) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 max-w-md mx-auto shadow-2xl overflow-hidden p-6 items-center justify-center">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-indigo-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Driver Login</h1>
        <p className="text-slate-500 mb-6 text-center">Enter your credentials to start your shift.</p>
        
        {/* Toggle between login modes */}
        <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setLoginMode('manual')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${loginMode === 'manual' ? 'bg-white shadow text-indigo-600' : 'text-slate-600'}`}
          >
            <KeyRound className="w-4 h-4 inline mr-1" />
            Name & PIN
          </button>
          <button
            onClick={() => setLoginMode('select')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${loginMode === 'select' ? 'bg-white shadow text-indigo-600' : 'text-slate-600'}`}
          >
            <Users className="w-4 h-4 inline mr-1" />
            Select Profile
          </button>
        </div>

        {loginMode === 'manual' ? (
          <form onSubmit={handleManualLogin} className="w-full space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Name</label>
              <input 
                type="text"
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition"
                placeholder="Enter your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">4-Digit PIN</label>
              <input 
                type="password"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-2xl tracking-[0.5em] font-bold py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 outline-none transition"
                placeholder="••••"
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center font-medium">{error}</p>}
            <button 
              type="submit"
              disabled={!nameInput.trim() || pinInput.length !== 4}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50"
            >
              Login
            </button>
          </form>
        ) : (
          <div className="w-full space-y-3 overflow-y-auto max-h-[50vh] pr-1">
            {drivers.length === 0 ? (
              <p className="text-center text-slate-400 py-8">No drivers registered yet.</p>
            ) : (
              drivers.map(driver => (
                <button
                  key={driver.id}
                  onClick={() => handleSelectDriver(driver)}
                  className="w-full bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:border-indigo-500 hover:bg-indigo-50 transition text-left flex justify-between items-center"
                >
                  <div>
                    <div className="font-bold text-slate-900">{driver.name}</div>
                    <div className="text-xs text-slate-500">{driver.license_number}</div>
                  </div>
                  <Navigation className="w-5 h-5 text-slate-300" />
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      {/* Header */}
      <header className="bg-indigo-600 text-white p-4 shadow-md shrink-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold">Driver App</h1>
          <p className="text-xs text-indigo-200">{selectedDriver?.name} ({selectedDriver?.license_number})</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              setSelectedDriverId(null);
              localStorage.removeItem('selectedDriverId');
            }}
            className="text-[10px] bg-indigo-500/50 px-2 py-1 rounded text-white hover:bg-indigo-500 transition"
          >
            Switch
          </button>
          <Link to="/dispatch" className="text-[10px] bg-indigo-700 px-2 py-1 rounded text-white hover:bg-indigo-800 transition">
            Exit
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4">
        <Routes>
          <Route path="/" element={<DriverManifest driverId={selectedDriverId} driverLocation={selectedDriver?.current_location} />} />
          <Route path="/trip/:id" element={<TripDetails />} />
          <Route path="/map" element={<DriverMap driverId={selectedDriverId} />} />
        </Routes>
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-white border-t border-slate-200 flex justify-around p-3 shrink-0 pb-safe">
        <Link 
          to="/driver" 
          className={`flex flex-col items-center gap-1 ${location.pathname === '/driver' ? 'text-indigo-600' : 'text-slate-500'}`}
        >
          <Clock className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Manifest</span>
        </Link>
        <Link 
          to="/driver/map"
          className={`flex flex-col items-center gap-1 ${location.pathname === '/driver/map' ? 'text-indigo-600' : 'text-slate-500'}`}
        >
          <Navigation className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Navigate</span>
        </Link>
        <div className="flex flex-col items-center gap-1 text-slate-400 cursor-not-allowed">
          <CheckCircle className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Completed</span>
        </div>
      </nav>
    </div>
  );
}
