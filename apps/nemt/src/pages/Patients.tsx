import { useState, useEffect, useMemo } from 'react';
import { User, MapPin, Phone, Activity, X, Trash2, Filter, ArrowUpDown, Search } from 'lucide-react';
import { db } from '../config/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { geocodeAddress } from '../utils/geocoding';
import { useTenant } from '../contexts/TenantContext';

export default function Patients() {
  const [patients, setPatients] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    mobility_status: 'Ambulatory',
    home_address: '',
    phone: ''
  });
  const { companyId } = useTenant();

  // Filter and Sort States
  const [filterMobility, setFilterMobility] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'mobility'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, 'patients'), where('companyId', '==', companyId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const patientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatients(patientsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));
    return () => unsubscribe();
  }, [companyId]);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    try {
      const coords = await geocodeAddress(formData.home_address);
      await addDoc(collection(db, 'patients'), {
        ...formData,
        geo_coordinates: coords,
        companyId,
      });
      setIsModalOpen(false);
      setFormData({
        name: '',
        mobility_status: 'Ambulatory',
        home_address: '',
        phone: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'patients');
    }
  };

  const handleDelete = async () => {
    if (!patientToDelete) return;
    try {
      await deleteDoc(doc(db, 'patients', patientToDelete.id));
      setIsDeleteModalOpen(false);
      setPatientToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `patients/${patientToDelete.id}`);
    }
  };

  const processedPatients = useMemo(() => {
    return patients
      .filter(p => {
        const matchesMobility = filterMobility === 'All' || p.mobility_status === filterMobility;
        const matchesSearch = !searchTerm || 
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.home_address.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesMobility && matchesSearch;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'name') {
          comparison = a.name.localeCompare(b.name);
        } else {
          comparison = a.mobility_status.localeCompare(b.mobility_status);
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [patients, filterMobility, searchTerm, sortBy, sortOrder]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl font-bold text-slate-800">Patients Directory</h2>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-full md:w-64 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              value={filterMobility}
              onChange={(e) => setFilterMobility(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
            >
              <option value="All">All Mobility</option>
              <option value="Ambulatory">Ambulatory</option>
              <option value="Wheelchair">Wheelchair</option>
              <option value="Stretcher">Stretcher</option>
              <option value="Bariatric Wheelchair">Bariatric Wheelchair</option>
            </select>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
          >
            + Add Patient
          </button>
        </div>
      </div>

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
                  Name <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-4">
                <button 
                  onClick={() => {
                    if (sortBy === 'mobility') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('mobility'); setSortOrder('asc'); }
                  }}
                  className="flex items-center gap-1 hover:text-indigo-600 transition"
                >
                  Mobility Status <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-4">Home Address</th>
              <th className="px-6 py-4">Phone</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {processedPatients.map((patient) => (
              <tr key={patient.id} className="hover:bg-slate-50 transition">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-slate-900 font-medium">
                    <User className="w-4 h-4 text-slate-400" />
                    {patient.name}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-slate-900">
                    <Activity className="w-4 h-4 text-slate-400" />
                    {patient.mobility_status}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-slate-900">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {patient.home_address}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-slate-900">
                    <Phone className="w-4 h-4 text-slate-400" />
                    {patient.phone}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => {
                      setPatientToDelete(patient);
                      setIsDeleteModalOpen(true);
                    }}
                    className="text-slate-400 hover:text-red-600 transition p-1"
                    title="Delete Patient"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">Add New Patient</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Jane Smith"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mobility Status</label>
                <select 
                  required
                  value={formData.mobility_status}
                  onChange={e => setFormData({...formData, mobility_status: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="Ambulatory">Ambulatory</option>
                  <option value="Wheelchair">Wheelchair</option>
                  <option value="Stretcher">Stretcher</option>
                  <option value="Bariatric Wheelchair">Bariatric Wheelchair</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Home Address</label>
                <input 
                  type="text" 
                  required
                  value={formData.home_address}
                  onChange={e => setFormData({...formData, home_address: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="123 Main St, City, State"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input 
                  type="tel" 
                  required
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="555-0100"
                />
              </div>

              <div className="pt-6">
                <button 
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-lg shadow-md transition"
                >
                  Add Patient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Patient?</h3>
            <p className="text-slate-600 mb-6">
              Are you sure you want to remove <span className="font-semibold text-slate-900">{patientToDelete?.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleDelete}
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
