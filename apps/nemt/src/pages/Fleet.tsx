import { useState, useMemo } from 'react';
import { User, Car, Clock, X, Trash2, Search, ArrowUpDown, Pencil, Plus, Accessibility } from 'lucide-react';
import { useCollection, addDocument, deleteDocument, updateDocument } from '../hooks/useData';
import { useTenant } from '../contexts/TenantContext';

// Vehicle capacity options - determines what type of patients can be transported
const VEHICLE_CAPACITIES = [
  { value: 'Ambulatory', label: 'Ambulatory Only', description: 'Standard sedan/van for walking patients' },
  { value: 'Wheelchair', label: 'Wheelchair Accessible', description: 'Can transport wheelchair patients' },
  { value: 'Stretcher', label: 'Stretcher Capable', description: 'Can transport stretcher/gurney patients' },
  { value: 'Bariatric', label: 'Bariatric Capable', description: 'Can transport bariatric patients (500+ lbs)' },
];

export default function Fleet() {
  const { data: drivers } = useCollection('drivers');
  const { companyId } = useTenant();
  
  // Driver state
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [isDeleteDriverModalOpen, setIsDeleteDriverModalOpen] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<any>(null);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [driverFormData, setDriverFormData] = useState({
    name: '',
    license_number: '',
    shift_start: '08:00',
    shift_end: '16:00',
    pin: '',
    vehicle_capacity: 'Ambulatory'
  });

  // Filter and Sort States
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'license'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Driver functions
  const resetDriverForm = () => {
    setDriverFormData({
      name: '',
      license_number: '',
      shift_start: '08:00',
      shift_end: '16:00',
      pin: '',
      vehicle_capacity: 'Ambulatory'
    });
    setEditingDriverId(null);
  };

  const handleEditDriverClick = (driver: any) => {
    setEditingDriverId(driver.id);
    setDriverFormData({
      name: driver.name,
      license_number: driver.license_number,
      shift_start: driver.shift_start || '08:00',
      shift_end: driver.shift_end || '16:00',
      pin: driver.pin || '',
      vehicle_capacity: driver.vehicle_capacity || 'Ambulatory'
    });
    setIsDriverModalOpen(true);
  };

  const handleDriverSubmit = async (e: any) => {
    e.preventDefault();
    try {
      if (editingDriverId) {
        await updateDocument('drivers', editingDriverId, driverFormData);
      } else {
        await addDocument('drivers', {
          ...driverFormData,
          current_location: { lat: 42.3314, lng: -83.0458 },
          status: 'Active'
        }, companyId!);
      }
      setIsDriverModalOpen(false);
      resetDriverForm();
    } catch (error) {
      console.error('Error saving driver:', error);
    }
  };

  const handleDeleteDriver = async () => {
    if (!driverToDelete) return;
    try {
      await deleteDocument('drivers', driverToDelete.id);
      setIsDeleteDriverModalOpen(false);
      setDriverToDelete(null);
    } catch (error) {
      console.error('Error deleting driver:', error);
    }
  };

  const getCapacityColor = (capacity: string) => {
    switch (capacity) {
      case 'Ambulatory': return 'bg-slate-100 text-slate-700';
      case 'Wheelchair': return 'bg-blue-100 text-blue-700';
      case 'Stretcher': return 'bg-purple-100 text-purple-700';
      case 'Bariatric': return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const processedDrivers = useMemo(() => {
    return drivers
      .filter(d => {
        const matchesSearch = !searchTerm || 
          d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          d.license_number.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'name') {
          comparison = a.name.localeCompare(b.name);
        } else {
          comparison = a.license_number.localeCompare(b.license_number);
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [drivers, searchTerm, sortBy, sortOrder]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl font-bold text-slate-800">Fleet Management</h2>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search drivers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-full md:w-64 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <button 
            onClick={() => { resetDriverForm(); setIsDriverModalOpen(true); }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Driver
          </button>
        </div>
      </div>

      {/* Drivers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">
                <button 
                  onClick={() => {
                    if (sortBy === 'name') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('name'); setSortOrder('asc'); }
                  }}
                  className="flex items-center gap-1 hover:text-indigo-600 transition"
                >
                  Driver Name <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-4">
                <button 
                  onClick={() => {
                    if (sortBy === 'license') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('license'); setSortOrder('asc'); }
                  }}
                  className="flex items-center gap-1 hover:text-indigo-600 transition"
                >
                  License Number <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-4">Vehicle Capacity</th>
              <th className="px-6 py-4">Shift</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {processedDrivers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                  No drivers found. Add your first driver to get started.
                </td>
              </tr>
            ) : (
              processedDrivers.map((driver) => (
                <tr key={driver.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-900 font-medium">
                      <User className="w-4 h-4 text-slate-400" />
                      {driver.name}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-900">
                      <Car className="w-4 h-4 text-slate-400" />
                      {driver.license_number}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getCapacityColor(driver.vehicle_capacity)}`}>
                      {driver.vehicle_capacity || 'Ambulatory'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-900">
                      <Clock className="w-4 h-4 text-slate-400" />
                      {driver.shift_start} - {driver.shift_end}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleEditDriverClick(driver)}
                        className="text-slate-400 hover:text-indigo-600 transition p-1"
                        title="Edit Driver"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setDriverToDelete(driver);
                          setIsDeleteDriverModalOpen(true);
                        }}
                        className="text-slate-400 hover:text-red-600 transition p-1"
                        title="Delete Driver"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Driver Modal */}
      {isDriverModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">{editingDriverId ? 'Edit Driver' : 'Add New Driver'}</h3>
              <button onClick={() => { setIsDriverModalOpen(false); resetDriverForm(); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleDriverSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input 
                  type="text" 
                  required
                  value={driverFormData.name}
                  onChange={e => setDriverFormData({...driverFormData, name: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">License Number</label>
                <input 
                  type="text" 
                  required
                  value={driverFormData.license_number}
                  onChange={e => setDriverFormData({...driverFormData, license_number: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="DL-MI-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Driver PIN (4 digits)</label>
                <input 
                  type="text" 
                  required
                  maxLength={4}
                  inputMode="numeric"
                  pattern="\d{4}"
                  value={driverFormData.pin}
                  onChange={e => setDriverFormData({...driverFormData, pin: e.target.value.replace(/\D/g, '')})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="1234"
                />
                <p className="text-xs text-slate-400 mt-1">Drivers use this PIN to log into the mobile app</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Accessibility className="w-4 h-4" />
                    Vehicle Capacity
                  </div>
                </label>
                <select
                  required
                  value={driverFormData.vehicle_capacity}
                  onChange={e => setDriverFormData({...driverFormData, vehicle_capacity: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  {VEHICLE_CAPACITIES.map(cap => (
                    <option key={cap.value} value={cap.value}>{cap.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {VEHICLE_CAPACITIES.find(c => c.value === driverFormData.vehicle_capacity)?.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Shift Start</label>
                  <input 
                    type="time" 
                    required
                    value={driverFormData.shift_start}
                    onChange={e => setDriverFormData({...driverFormData, shift_start: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Shift End</label>
                  <input 
                    type="time" 
                    required
                    value={driverFormData.shift_end}
                    onChange={e => setDriverFormData({...driverFormData, shift_end: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-lg shadow-md transition"
                >
                  {editingDriverId ? 'Save Changes' : 'Add Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Driver Modal */}
      {isDeleteDriverModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Driver?</h3>
            <p className="text-slate-600 mb-6">
              Are you sure you want to remove <span className="font-semibold text-slate-900">{driverToDelete?.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsDeleteDriverModalOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteDriver}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
