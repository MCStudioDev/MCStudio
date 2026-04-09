import { useState, useEffect, useMemo } from 'react';
import { Clock, MapPin, User, Car, X, Zap, Filter, ArrowUpDown, AlertTriangle, Trash2, Calendar, Route, Loader2, CheckCircle2 } from 'lucide-react';
import { db } from '../config/firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { geocodeAddress } from '../utils/geocoding';
import { optimizeRoute, formatDistance, findBestDriverForTrip } from '../utils/routeOptimization';
import { useTenant } from '../contexts/TenantContext';

// Helper: Haversine distance in km
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

// Helper: Check if driver's vehicle capacity can handle patient mobility
// Capacity hierarchy: Bariatric > Stretcher > Wheelchair > Ambulatory
function canHandleMobility(driverCapacity: string, patientMobility: string) {
  const capacityLevel: Record<string, number> = {
    'Ambulatory': 1,
    'Wheelchair': 2,
    'Stretcher': 3,
    'Bariatric': 4
  };
  
  const driverLevel = capacityLevel[driverCapacity] || 1;
  const patientLevel = capacityLevel[patientMobility] || 1;
  
  // Driver can handle if their capacity level >= patient's required level
  return driverLevel >= patientLevel;
}

// Helper: Convert "HH:MM" to minutes for easy comparison
function timeToMins(timeStr: string) {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Helper: Estimate travel time in minutes between two points
function estimateTravelTime(lat1: number, lon1: number, lat2: number, lon2: number) {
  const distance = getDistance(lat1, lon1, lat2, lon2);
  const averageSpeedKmh = 30; // 30 km/h average city speed
  const travelTimeMins = (distance / averageSpeedKmh) * 60;
  return Math.ceil(travelTimeMins);
}

// Helper: Extract lat/lng from various location formats
function getLoc(loc: any): [number, number] {
  if (!loc) return [42.3314, -83.0458]; // Detroit default
  if (Array.isArray(loc)) return [loc[0], loc[1]];
  if (typeof loc === 'object') return [loc.lat || loc[0], loc.lng || loc[1]];
  return [42.3314, -83.0458];
}

// Helper: Check if a new trip overlaps or conflicts with existing trips based on travel times
function getScheduleConflict(
  driverId: string, 
  newPickupDate: string,
  newPickupTime: string, 
  newPickupLoc: [number, number],
  newDropoffLoc: [number, number],
  allTrips: any[], 
  excludeTripId: string | null = null
) {
  const bufferMins = 15; // 15-minute safety buffer
  const loadingMins = 5;  // 5-minute loading/unloading time
  
  const newStartMins = timeToMins(newPickupTime);
  const newRideDuration = estimateTravelTime(newPickupLoc[0], newPickupLoc[1], newDropoffLoc[0], newDropoffLoc[1]) + loadingMins;
  const newEndMins = newStartMins + newRideDuration;
  
  const driverTrips = allTrips.filter(t => 
    t.driver_id === driverId && 
    t.status !== 'Completed' && 
    t.status !== 'Cancelled' && 
    t.id !== excludeTripId &&
    (t.pickup_date === newPickupDate || !t.pickup_date) // Only check same day
  );
  
  for (const trip of driverTrips) {
    const tripStartMins = timeToMins(trip.pickup_time || '00:00');
    const tripPickupLoc = getLoc(trip.pickup_location);
    const tripDropoffLoc = getLoc(trip.dropoff_location);
    
    const tripDuration = estimateTravelTime(tripPickupLoc[0], tripPickupLoc[1], tripDropoffLoc[0], tripDropoffLoc[1]) + loadingMins;
    const tripEndMins = tripStartMins + tripDuration;

    // Case 1: New trip is AFTER existing trip
    if (newStartMins >= tripStartMins) {
      const travelFromExistingToNew = estimateTravelTime(tripDropoffLoc[0], tripDropoffLoc[1], newPickupLoc[0], newPickupLoc[1]);
      const earliestPossibleStart = tripEndMins + travelFromExistingToNew + bufferMins;
      if (newStartMins < earliestPossibleStart) {
        return { 
          hasConflict: true, 
          reason: `Insufficient time after previous trip. Needs ${travelFromExistingToNew + bufferMins}m buffer, but only has ${newStartMins - tripEndMins}m.` 
        };
      }
    }
    
    // Case 2: New trip is BEFORE existing trip
    if (newStartMins < tripStartMins) {
      const travelFromNewToExisting = estimateTravelTime(newDropoffLoc[0], newDropoffLoc[1], tripPickupLoc[0], tripPickupLoc[1]);
      const latestPossibleEnd = tripStartMins - travelFromNewToExisting - bufferMins;
      if (newEndMins > latestPossibleEnd) {
        return { 
          hasConflict: true, 
          reason: `Insufficient time before next trip. Needs ${travelFromNewToExisting + bufferMins}m buffer, but only has ${tripStartMins - newEndMins}m.` 
        };
      }
    }
  }
  return { hasConflict: false, reason: '' };
}

// Helper: Check if trip is within driver's shift
function isWithinShift(shiftStart: string, shiftEnd: string, pickupTime: string, appointmentTime: string) {
  if (!shiftStart || !shiftEnd) return true; // If no shift defined, assume available
  const sStart = timeToMins(shiftStart);
  const sEnd = timeToMins(shiftEnd);
  const tStart = timeToMins(pickupTime);
  const tEnd = timeToMins(appointmentTime) + 30; // Assume 30 mins to finish dropoff

  return tStart >= sStart && tEnd <= sEnd;
}

export default function Bookings() {
  const [trips, setTrips] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  
  // Multi-tenancy: scope all data to current company
  const { companyId } = useTenant();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [tripToDelete, setTripToDelete] = useState<any>(null);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    patient_id: '',
    pickup_date: new Date().toISOString().split('T')[0],
    pickup_time: '',
    appointment_date: new Date().toISOString().split('T')[0],
    appointment_time: '',
    assignment_method: 'optimized',
    driver_id: '',
    pickup_address: '',
    dropoff_address: ''
  });

  // Filter and Sort States
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterDriver, setFilterDriver] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'patient'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Route Optimization States
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<{ driverId: string; distance: number; percentage: number } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const tripsQ = query(collection(db, 'trips'), where('companyId', '==', companyId));
    const patientsQ = query(collection(db, 'patients'), where('companyId', '==', companyId));
    const driversQ = query(collection(db, 'drivers'), where('companyId', '==', companyId));

    const unsubTrips = onSnapshot(tripsQ, (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'trips'));
    const unsubPatients = onSnapshot(patientsQ, (snapshot) => {
      setPatients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'patients'));
    const unsubDrivers = onSnapshot(driversQ, (snapshot) => {
      setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'drivers'));

    return () => {
      unsubTrips();
      unsubPatients();
      unsubDrivers();
    };
  }, [companyId]);

  const handlePatientChange = (e: any) => {
    const patientId = e.target.value;
    const patient = patients.find(p => p.id === patientId);
    setFormData({
      ...formData,
      patient_id: patientId,
      pickup_address: patient ? patient.home_address : ''
    });
  };

  const handleEditClick = (trip: any) => {
    setEditingTripId(trip.id);
    setFormData({
      patient_id: trip.patient_id,
      pickup_date: trip.pickup_date || new Date().toISOString().split('T')[0],
      pickup_time: trip.pickup_time,
      appointment_date: trip.appointment_date || new Date().toISOString().split('T')[0],
      appointment_time: trip.appointment_time,
      assignment_method: 'manual', // Default to manual when editing to preserve current driver
      driver_id: trip.driver_id,
      pickup_address: trip.pickup_address || '',
      dropoff_address: trip.dropoff_address || ''
    });
    setIsModalOpen(true);
  };

  const handleNewBookingClick = () => {
    setEditingTripId(null);
    setFormData({
      patient_id: '',
      pickup_date: new Date().toISOString().split('T')[0],
      pickup_time: '',
      appointment_date: new Date().toISOString().split('T')[0],
      appointment_time: '',
      assignment_method: 'optimized',
      driver_id: '',
      pickup_address: '',
      dropoff_address: ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    
    // ================== VALIDATION ==================
    const validationErrors: string[] = [];
    
    // Required fields
    if (!formData.patient_id) validationErrors.push('Please select a patient');
    if (!formData.pickup_time) validationErrors.push('Please enter pickup time');
    if (!formData.appointment_time) validationErrors.push('Please enter appointment time');
    if (!formData.pickup_date) validationErrors.push('Please enter pickup date');
    
    // Time validation: appointment must be after pickup
    if (formData.pickup_time && formData.appointment_time) {
      const pickupMins = timeToMins(formData.pickup_time);
      const appointmentMins = timeToMins(formData.appointment_time);
      
      if (appointmentMins <= pickupMins) {
        validationErrors.push('Appointment time must be after pickup time');
      }
      
      // Minimum 15 minutes between pickup and appointment
      if (appointmentMins - pickupMins < 15) {
        validationErrors.push('Appointment must be at least 15 minutes after pickup');
      }
    }
    
    // Manual assignment requires driver selection
    if (formData.assignment_method === 'manual' && !formData.driver_id) {
      validationErrors.push('Please select a driver for manual assignment');
    }
    
    if (validationErrors.length > 0) {
      alert('Validation Errors:\n\n' + validationErrors.join('\n'));
      return;
    }
    // ================== END VALIDATION ==================
    
    let assignedDriverId = formData.driver_id;
    let optimalTripOrder: number | undefined;
    const patient = patients.find(p => p.id === formData.patient_id);
    
    // Get coordinates for the new trip
    const pickupCoords = await geocodeAddress(formData.pickup_address || patient?.home_address || '100 Renaissance Center, Detroit, MI');
    const dropoffCoords = await geocodeAddress(formData.dropoff_address || 'Henry Ford Hospital');
    
    const newTripData = {
      pickup_location: pickupCoords || { lat: 42.3314, lng: -83.0458 },
      dropoff_location: dropoffCoords || { lat: 42.3670, lng: -83.0853 },
      pickup_time: formData.pickup_time,
      appointment_time: formData.appointment_time
    };
    
    if (formData.assignment_method === 'optimized') {
      const mobility = patient?.mobility_status || 'Ambulatory';
      
      // Smart auto-assignment using route optimization
      const bestAssignment = findBestDriverForTrip(
        newTripData,
        drivers.map(d => ({
          id: d.id,
          current_location: d.current_location,
          shift_start: d.shift_start,
          shift_end: d.shift_end,
          vehicle_capacity: d.vehicle_capacity || 'Ambulatory'
        })),
        trips.filter(t => t.id !== editingTripId), // Exclude current trip if editing
        (driver, trip) => {
          // 1. Check vehicle capacity compatibility
          if (!canHandleMobility(driver.vehicle_capacity || 'Ambulatory', mobility)) {
            return { valid: false, reason: `Driver capacity (${driver.vehicle_capacity || 'Ambulatory'}) cannot handle ${mobility} patients` };
          }

          // 2. Check schedule availability (overlap + travel time + buffer)
          const conflict = getScheduleConflict(
            driver.id, 
            formData.pickup_date, 
            trip.pickup_time, 
            [trip.pickup_location.lat, trip.pickup_location.lng], 
            [trip.dropoff_location.lat, trip.dropoff_location.lng], 
            trips, 
            editingTripId
          );
          if (conflict.hasConflict) {
            return { valid: false, reason: conflict.reason };
          }

          // 3. Check shift availability
          if (!isWithinShift(driver.shift_start, driver.shift_end, trip.pickup_time, trip.appointment_time)) {
            return { valid: false, reason: 'Outside shift hours' };
          }

          return { valid: true };
        }
      );

      if (bestAssignment) {
        assignedDriverId = bestAssignment.driverId;
        optimalTripOrder = bestAssignment.optimalPosition;
      } else {
        // No optimal driver found - check why and provide helpful message
        if (drivers.length === 0) {
          alert('No drivers available. Please add a driver first.');
          return;
        }
        
        // Check each driver to find available one or explain why none work
        const driverIssues: string[] = [];
        let fallbackDriverId: string | null = null;
        
        for (const driver of drivers) {
          const driverCapacity = driver.vehicle_capacity || 'Ambulatory';
          const mobility = patient?.mobility_status || 'Ambulatory';
          
          if (!canHandleMobility(driverCapacity, mobility)) {
            driverIssues.push(`${driver.name}: Capacity (${driverCapacity}) cannot handle ${mobility} patients`);
            continue;
          }
          
          if (!isWithinShift(driver.shift_start, driver.shift_end, formData.pickup_time, formData.appointment_time)) {
            driverIssues.push(`${driver.name}: Outside shift hours (${driver.shift_start}-${driver.shift_end})`);
            continue;
          }
          
          const conflict = getScheduleConflict(
            driver.id, 
            formData.pickup_date, 
            formData.pickup_time, 
            [newTripData.pickup_location.lat, newTripData.pickup_location.lng], 
            [newTripData.dropoff_location.lat, newTripData.dropoff_location.lng], 
            trips, 
            editingTripId
          );
          
          if (conflict.hasConflict) {
            driverIssues.push(`${driver.name}: ${conflict.reason}`);
            continue;
          }
          
          // This driver is available!
          fallbackDriverId = driver.id;
          break;
        }
        
        if (fallbackDriverId) {
          assignedDriverId = fallbackDriverId;
        } else {
          alert('No suitable driver available:\n\n' + driverIssues.join('\n') + '\n\nPlease adjust the time or manually assign a driver.');
          return;
        }
      }
    }
    
    // Ensure we have a driver assigned
    if (!assignedDriverId) {
      alert('Could not assign a driver. Please select one manually.');
      return;
    }

    if (formData.assignment_method === 'manual') {
      const selectedDriver = drivers.find(d => d.id === assignedDriverId);
      const driverCapacity = selectedDriver?.vehicle_capacity || 'Ambulatory';
      const mobility = patient?.mobility_status || 'Ambulatory';
      const manualWarnings: string[] = [];
      
      // Check vehicle capacity compatibility
      if (!canHandleMobility(driverCapacity, mobility)) {
        manualWarnings.push(`Driver capacity (${driverCapacity}) cannot handle ${mobility} patients`);
      }
      
      // Check shift
      if (selectedDriver && !isWithinShift(selectedDriver.shift_start, selectedDriver.shift_end, formData.pickup_time, formData.appointment_time)) {
        manualWarnings.push(`Trip is outside driver's shift (${selectedDriver.shift_start}-${selectedDriver.shift_end})`);
      }
      
      // Check schedule conflict
      const conflict = getScheduleConflict(
        assignedDriverId, 
        formData.pickup_date, 
        formData.pickup_time, 
        [newTripData.pickup_location.lat, newTripData.pickup_location.lng], 
        [newTripData.dropoff_location.lat, newTripData.dropoff_location.lng], 
        trips, 
        editingTripId
      );
      if (conflict.hasConflict) {
        manualWarnings.push(conflict.reason);
      }
      
      if (manualWarnings.length > 0) {
        const proceed = confirm('⚠️ Manual Assignment Warnings:\n\n' + manualWarnings.join('\n') + '\n\nDo you want to proceed anyway?');
        if (!proceed) {
          return;
        }
      }
    }

    try {
      const tripData: Record<string, any> = {
        patient_id: formData.patient_id,
        driver_id: assignedDriverId,
        pickup_date: formData.pickup_date,
        pickup_time: formData.pickup_time,
        appointment_date: formData.appointment_date,
        appointment_time: formData.appointment_time,
        pickup_address: formData.pickup_address || patient?.home_address || '100 Renaissance Center, Detroit, MI',
        dropoff_address: formData.dropoff_address || 'Henry Ford Hospital',
      };
      
      // Only add optional fields if they have values
      if (pickupCoords) tripData.pickup_location = pickupCoords;
      if (dropoffCoords) tripData.dropoff_location = dropoffCoords;
      if (optimalTripOrder !== undefined) tripData.optimized_order = optimalTripOrder;

      if (editingTripId) {
        await updateDoc(doc(db, 'trips', editingTripId), tripData);
      } else {
        await addDoc(collection(db, 'trips'), {
          ...tripData,
          status: 'Scheduled',
          companyId,
        });
      }
      
      setIsModalOpen(false);
      setEditingTripId(null);
      setFormData({
        patient_id: '',
        pickup_date: new Date().toISOString().split('T')[0],
        pickup_time: '',
        appointment_date: new Date().toISOString().split('T')[0],
        appointment_time: '',
        assignment_method: 'optimized',
        driver_id: '',
        pickup_address: '',
        dropoff_address: ''
      });
    } catch (error) {
      handleFirestoreError(error, editingTripId ? OperationType.UPDATE : OperationType.CREATE, 'trips');
    }
  };

  const handleDeleteTrip = (trip: any) => {
    setTripToDelete(trip);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!tripToDelete) return;
    try {
      await deleteDoc(doc(db, 'trips', tripToDelete.id));
      setIsDeleteModalOpen(false);
      setTripToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `trips/${tripToDelete.id}`);
    }
  };

  const handleOptimizeDriverRoutes = async (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    
    // Get active trips for this driver (exclude completed/cancelled)
    const driverTrips = trips.filter(t => 
      t.driver_id === driverId && 
      t.status !== 'Completed' && 
      t.status !== 'Cancelled'
    );
    
    if (driverTrips.length < 2) {
      alert('Need at least 2 active trips to optimize');
      return;
    }
    
    setIsOptimizing(true);
    setOptimizationResult(null);
    
    try {
      const startLoc = driver.current_location || { lat: 42.3314, lng: -83.0458 };
      const { optimizedTrips, savings } = await optimizeRoute(driverTrips, startLoc);
      
      // Update trip order in Firebase by setting optimized_order field
      const batch = writeBatch(db);
      optimizedTrips.forEach((trip: any, index: number) => {
        const tripRef = doc(db, 'trips', trip.id);
        batch.update(tripRef, { optimized_order: index });
      });
      await batch.commit();
      
      setOptimizationResult({ driverId, distance: savings.distance, percentage: savings.percentage });
      
      // Clear result after 5 seconds
      setTimeout(() => setOptimizationResult(null), 5000);
    } catch (error) {
      console.error('Optimization failed:', error);
      alert('Failed to optimize routes. Please try again.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled': return 'bg-blue-100 text-blue-700';
      case 'En Route': return 'bg-purple-100 text-purple-700';
      case 'Arrived': return 'bg-amber-100 text-amber-700';
      case 'Onboard': return 'bg-orange-100 text-orange-700';
      case 'Completed': return 'bg-emerald-100 text-emerald-700';
      case 'Cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  // Join trips with patient and driver info for display and check for conflicts
  const processedTrips = useMemo(() => {
    return trips.map(trip => {
      const patient = patients.find(p => p.id === trip.patient_id);
      const driver = drivers.find(d => d.id === trip.driver_id);
      const driverCapacity = driver?.vehicle_capacity || 'Ambulatory';
      
      // Collect all issues with this trip
      const issues: string[] = [];
      
      // Check time logic: appointment must be after pickup
      if (trip.pickup_time && trip.appointment_time) {
        const pickupMins = timeToMins(trip.pickup_time);
        const appointmentMins = timeToMins(trip.appointment_time);
        if (appointmentMins <= pickupMins) {
          issues.push('Appointment time is before/same as pickup time');
        }
      }
      
      // Check vehicle capacity compatibility
      if (patient && driver && !canHandleMobility(driverCapacity, patient.mobility_status)) {
        issues.push(`Driver capacity (${driverCapacity}) incompatible with ${patient.mobility_status}`);
      }
      
      // Check driver shift
      if (driver && trip.pickup_time && trip.appointment_time) {
        if (!isWithinShift(driver.shift_start, driver.shift_end, trip.pickup_time, trip.appointment_time)) {
          issues.push(`Outside driver shift (${driver.shift_start}-${driver.shift_end})`);
        }
      }
      
      // Check if this existing trip has any conflicts with other trips
      const conflict = getScheduleConflict(
        trip.driver_id,
        trip.pickup_date || new Date().toISOString().split('T')[0],
        trip.pickup_time || '00:00',
        getLoc(trip.pickup_location),
        getLoc(trip.dropoff_location),
        trips,
        trip.id
      );
      
      if (conflict.hasConflict) {
        issues.push(conflict.reason);
      }

      return {
        ...trip,
        patient,
        driver,
        hasConflict: issues.length > 0,
        conflictReason: issues.join(' | ')
      };
    })
    .filter(trip => {
      const matchesStatus = filterStatus === 'All' || trip.status === filterStatus;
      const matchesDriver = filterDriver === 'All' || trip.driver_id === filterDriver;
      const matchesSearch = !searchTerm || 
        trip.patient?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.pickup_address?.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesStatus && matchesDriver && matchesSearch;
    })
    .sort((a, b) => {
      // When viewing a specific driver, prioritize optimized_order
      if (filterDriver !== 'All') {
        if (a.optimized_order !== undefined && b.optimized_order !== undefined) {
          return a.optimized_order - b.optimized_order;
        }
      }
      
      let comparison = 0;
      if (sortBy === 'time') {
        const dateA = a.pickup_date || '';
        const dateB = b.pickup_date || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        comparison = timeToMins(a.pickup_time) - timeToMins(b.pickup_time);
      } else {
        comparison = (a.patient?.name || '').localeCompare(b.patient?.name || '');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [trips, patients, drivers, filterStatus, filterDriver, searchTerm, sortBy, sortOrder]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl font-bold text-slate-800">Today's Schedule</h2>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
            >
              <option value="All">All Statuses</option>
              <option value="Scheduled">Scheduled</option>
              <option value="En Route">En Route</option>
              <option value="Arrived">Arrived</option>
              <option value="Onboard">Onboard</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <select 
            value={filterDriver}
            onChange={(e) => setFilterDriver(e.target.value)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
          >
            <option value="All">All Drivers</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <input 
            type="text"
            placeholder="Search patient..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
          />
          {filterDriver !== 'All' && (
            <button 
              onClick={() => handleOptimizeDriverRoutes(filterDriver)}
              disabled={isOptimizing}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition flex items-center gap-2 disabled:opacity-50"
            >
              {isOptimizing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Optimizing...
                </>
              ) : (
                <>
                  <Route className="w-4 h-4" />
                  Optimize Routes
                </>
              )}
            </button>
          )}
          <button 
            onClick={handleNewBookingClick}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
          >
            + New Booking
          </button>
        </div>
      </div>

      {/* Optimization Result */}
      {optimizationResult && optimizationResult.driverId === filterDriver && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span className="text-emerald-700 font-medium">
            Routes optimized! Saved {formatDistance(optimizationResult.distance)} ({optimizationResult.percentage}% shorter route)
          </span>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">
                <button 
                  onClick={() => {
                    if (sortBy === 'time') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('time'); setSortOrder('asc'); }
                  }}
                  className="flex items-center gap-1 hover:text-indigo-600 transition"
                >
                  Time <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-4">
                <button 
                  onClick={() => {
                    if (sortBy === 'patient') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('patient'); setSortOrder('asc'); }
                  }}
                  className="flex items-center gap-1 hover:text-indigo-600 transition"
                >
                  Patient <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-4">Driver</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {processedTrips.map((trip) => (
              <tr key={trip.id} className={`hover:bg-slate-50 transition ${trip.hasConflict ? 'bg-red-50/30' : ''}`}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-slate-900 font-medium">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">{trip.pickup_date}</span>
                      <span>{trip.pickup_time}</span>
                    </div>
                    {trip.hasConflict && (
                      <div title={trip.conflictReason}>
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Appt: {trip.appointment_date} {trip.appointment_time}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-slate-900 font-medium">
                    <User className="w-4 h-4 text-slate-400" />
                    {trip.patient ? trip.patient.name : <span className="text-red-500 italic">Deleted Patient</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{trip.patient?.mobility_status || 'N/A'}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-slate-900 font-medium">
                    <Car className="w-4 h-4 text-slate-400" />
                    {trip.driver ? trip.driver.name : <span className="text-amber-600 italic">Unassigned/Deleted</span>}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(trip.status)}`}>
                    {trip.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-3">
                    <a 
                      href={`/patient/${trip.id}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-emerald-600 hover:text-emerald-800 font-medium text-sm"
                    >
                      Track
                    </a>
                    <button 
                      onClick={() => handleEditClick(trip)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDeleteTrip(trip)}
                      className="text-red-600 hover:text-red-800 font-medium text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
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
              <h3 className="text-xl font-bold text-slate-800">
                {editingTripId ? 'Edit Booking' : 'New Booking'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
                <select 
                  required
                  value={formData.patient_id}
                  onChange={handlePatientChange}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select a patient...</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.mobility_status})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pickup Address</label>
                <input 
                  type="text" 
                  required
                  value={formData.pickup_address}
                  onChange={e => setFormData({...formData, pickup_address: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="123 Main St"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dropoff Address</label>
                <input 
                  type="text" 
                  required
                  value={formData.dropoff_address}
                  onChange={e => setFormData({...formData, dropoff_address: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Destination facility or address"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pickup Date</label>
                  <input 
                    type="date" 
                    required
                    value={formData.pickup_date}
                    onChange={e => setFormData({...formData, pickup_date: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pickup Time</label>
                  <input 
                    type="time" 
                    required
                    value={formData.pickup_time}
                    onChange={e => setFormData({...formData, pickup_time: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Appt Date</label>
                  <input 
                    type="date" 
                    required
                    value={formData.appointment_date}
                    onChange={e => setFormData({...formData, appointment_date: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Appt Time</label>
                  <input 
                    type="time" 
                    required
                    value={formData.appointment_time}
                    onChange={e => setFormData({...formData, appointment_time: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="block text-sm font-medium text-slate-700 mb-3">Assignment Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`border rounded-lg p-3 cursor-pointer flex items-center gap-2 transition ${formData.assignment_method === 'optimized' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input 
                      type="radio" 
                      name="assignment" 
                      value="optimized" 
                      checked={formData.assignment_method === 'optimized'}
                      onChange={() => setFormData({...formData, assignment_method: 'optimized'})}
                      className="hidden" 
                    />
                    <Zap className={`w-5 h-5 ${formData.assignment_method === 'optimized' ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="font-medium text-sm">Auto-Optimize</span>
                  </label>
                  <label className={`border rounded-lg p-3 cursor-pointer flex items-center gap-2 transition ${formData.assignment_method === 'manual' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input 
                      type="radio" 
                      name="assignment" 
                      value="manual" 
                      checked={formData.assignment_method === 'manual'}
                      onChange={() => setFormData({...formData, assignment_method: 'manual'})}
                      className="hidden" 
                    />
                    <User className={`w-5 h-5 ${formData.assignment_method === 'manual' ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="font-medium text-sm">Manual</span>
                  </label>
                </div>
              </div>

              {formData.assignment_method === 'manual' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Select Driver</label>
                  <select 
                    required
                    value={formData.driver_id}
                    onChange={e => setFormData({...formData, driver_id: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Select a driver...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.license_number})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-6">
                <button 
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-lg shadow-md transition"
                >
                  {editingTripId ? 'Save Changes' : 'Create Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Booking?</h3>
            <p className="text-slate-600 mb-6">
              Are you sure you want to remove the booking for <span className="font-semibold text-slate-900">{tripToDelete?.patient?.name}</span> at <span className="font-semibold text-slate-900">{tripToDelete?.pickup_time}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {isWarningModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
            <div className="flex items-center gap-3 text-amber-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-xl font-bold text-slate-800">Schedule Warning</h3>
            </div>
            <p className="text-slate-600 mb-6">
              {warningMessage}
            </p>
            <button 
              onClick={() => setIsWarningModalOpen(false)}
              className="w-full bg-slate-800 text-white py-2 rounded-lg font-medium hover:bg-slate-900 transition"
            >
              I Understand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
