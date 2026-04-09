import { Routes, Route, Link, useLocation } from 'react-router';
import { LayoutDashboard, Map as MapIcon, Users, Car, Calendar, Database, CheckCircle2, LogOut, Shield } from 'lucide-react';
import Dashboard from './Dashboard';
import FleetMap from '../components/FleetMap';
import Bookings from './Bookings';
import Patients from './Patients';
import Fleet from './Fleet';
import { seedDatabaseIfEmpty } from '../utils/seedDatabase';
import { useState, useEffect } from 'react';
import { useAuth } from '../components/DispatcherAuthWrapper';
import { useTenant } from '../contexts/TenantContext';

export default function DispatcherPortal() {
  const location = useLocation();
  const { user, signOutUser } = useAuth();
  const { companyId, companyName, userRole } = useTenant();
  const [isSeeding, setIsSeeding] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const handleSeed = async () => {
    if (!companyId) return;
    setIsSeeding(true);
    await seedDatabaseIfEmpty(companyId);
    setIsSeeding(false);
    setNotification('Database seeded successfully!');
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const navItems = [
    { path: '/dispatch', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/dispatch/map', icon: MapIcon, label: 'Fleet Map' },
    { path: '/dispatch/bookings', icon: Calendar, label: 'Bookings' },
    { path: '/dispatch/patients', icon: Users, label: 'Patients' },
    { path: '/dispatch/vehicles', icon: Car, label: 'Drivers' },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white tracking-tight">NEMT Dispatch</h1>
          <p className="text-xs text-slate-500 mt-1">{companyName || 'Loading...'}</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-indigo-600 text-white' 
                    : 'hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Admin Link */}
        {userRole === 'admin' && (
          <div className="px-4 py-2">
            <Link
              to="/admin"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-amber-400 hover:bg-slate-800 hover:text-amber-300"
            >
              <Shield className="w-5 h-5" />
              Admin Panel
            </Link>
          </div>
        )}
        
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
                {user?.displayName?.[0] || user?.email?.[0] || 'D'}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{user?.displayName || 'Dispatcher'}</p>
                <p className="text-xs text-slate-500">{user?.uid === 'dev-dispatcher' ? 'Dev Mode' : 'Admin'}</p>
              </div>
            </div>
            <button
              onClick={signOutUser}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 justify-between shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">
            {navItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
          </h2>
          <div className="flex items-center gap-4">
            <button 
              onClick={handleSeed}
              disabled={isSeeding}
              className="flex items-center gap-2 text-sm text-slate-600 font-medium hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-md hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <Database className="w-4 h-4" />
              {isSeeding ? 'Seeding...' : 'Seed Database'}
            </button>
            <Link to="/driver" className="text-sm text-indigo-600 font-medium hover:underline ml-4 border-l pl-4">
              Switch to Driver App
            </Link>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/map" element={<FleetMap />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/vehicles" element={<Fleet />} />
          </Routes>
        </div>
      </main>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 z-50 border border-slate-700">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="font-medium">{notification}</span>
        </div>
      )}
    </div>
  );
}
