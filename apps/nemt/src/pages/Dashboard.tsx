import { Activity, Car, Clock, Users, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { useCollection } from '../hooks/useData';

function formatTimeAgo(timestamp: string) {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  return time.toLocaleDateString();
}

export default function Dashboard() {
  const { data: trips } = useCollection('trips');
  const { data: drivers } = useCollection('drivers');
  const { data: patients } = useCollection('patients');
  const { data: activities } = useCollection('activities');

  const stats = {
    totalTrips: trips.length,
    activeTrips: trips.filter((t: any) => ['En Route', 'Arrived', 'Onboard'].includes(t.status)).length,
    availableDrivers: drivers.length,
    patients: patients.length,
  };

  const statCards = [
    { title: 'Total Trips Today', value: stats.totalTrips, icon: Activity, color: 'bg-blue-500' },
    { title: 'Active Trips', value: stats.activeTrips, icon: Clock, color: 'bg-amber-500' },
    { title: 'Available Drivers', value: stats.availableDrivers, icon: Car, color: 'bg-emerald-500' },
    { title: 'Registered Patients', value: stats.patients, icon: Users, color: 'bg-indigo-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Dispatch Overview</h2>
        <Link 
          to="/driver" 
          target="_blank"
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition shadow-sm"
        >
          <ExternalLink className="w-4 h-4" />
          Open Driver App (Mobile View)
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
              <div className={`${stat.color} p-4 rounded-lg text-white`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{stat.title}</p>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Recent Activity</h3>
        <div className="space-y-4">
          {activities.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No recent activity. Actions like adding drivers, updating trips, etc. will appear here.</p>
          ) : (
            activities.slice(0, 10).map((activity: any) => (
              <div key={activity.id} className="flex items-center gap-4 text-sm">
                <div className={`w-2 h-2 rounded-full ${
                  activity.type === 'success' ? 'bg-emerald-500' : 
                  activity.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                }`}></div>
                <p className="text-slate-600 flex-1">{activity.message}</p>
                <span className="text-slate-400 whitespace-nowrap">{formatTimeAgo(activity.timestamp)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
