// Mock data for local development without Firebase

export const mockPatients = [
  { id: 'p1', name: 'Robert Chen', mobility_status: 'Wheelchair', home_address: '100 Renaissance Center, Detroit, MI', phone: '313-555-0101', geo_coordinates: { lat: 42.3290, lng: -83.0397 } },
  { id: 'p2', name: 'Maria Garcia', mobility_status: 'Ambulatory', home_address: '15000 Ford Rd, Dearborn, MI', phone: '313-555-0102', geo_coordinates: { lat: 42.3223, lng: -83.1763 } },
  { id: 'p3', name: 'James Smith', mobility_status: 'Stretcher', home_address: '26000 Evergreen Rd, Southfield, MI', phone: '248-555-0103', geo_coordinates: { lat: 42.4734, lng: -83.2219 } },
  { id: 'p4', name: 'Linda Johnson', mobility_status: 'Wheelchair', home_address: '30000 Van Dyke Ave, Warren, MI', phone: '586-555-0104', geo_coordinates: { lat: 42.4919, lng: -83.0238 } },
  { id: 'p5', name: 'William Davis', mobility_status: 'Ambulatory', home_address: '33000 Civic Center Dr, Livonia, MI', phone: '734-555-0105', geo_coordinates: { lat: 42.3953, lng: -83.3527 } },
];

export const mockDrivers = [
  { id: 'd1', name: 'Marcus Detroit', license_number: 'DL-MI-001', current_location: { lat: 42.3314, lng: -83.0458 }, shift_start: '06:00', shift_end: '14:00', vehicle_id: 'v1', pin: '1234' },
  { id: 'd2', name: 'Alicia Motorcity', license_number: 'DL-MI-002', current_location: { lat: 42.4734, lng: -83.2219 }, shift_start: '08:00', shift_end: '16:00', vehicle_id: 'v2', pin: '5678' },
];

export const mockVehicles = [
  { id: 'v1', license_plate: 'MI-ABC-123', type: 'Van', capacity: '2 wheelchairs + 4 seats' },
  { id: 'v2', license_plate: 'MI-XYZ-789', type: 'Sedan', capacity: '0 wheelchairs + 4 seats' },
];

export const mockFacilities = [
  { id: 'f1', name: 'Henry Ford Hospital', address: '2799 W Grand Blvd, Detroit, MI', geo_coordinates: { lat: 42.3670, lng: -83.0853 } },
  { id: 'f2', name: 'Beaumont Hospital Royal Oak', address: '3601 W 13 Mile Rd, Royal Oak, MI', geo_coordinates: { lat: 42.5159, lng: -83.1788 } },
];

export const mockTrips = [
  { id: 't1', patient_id: 'p1', driver_id: 'd1', pickup_time: '08:00', appointment_time: '09:00', status: 'Scheduled', pickup_address: '100 Renaissance Center, Detroit, MI', dropoff_address: 'Henry Ford Hospital', pickup_location: { lat: 42.3290, lng: -83.0397 }, dropoff_location: { lat: 42.3670, lng: -83.0853 } },
  { id: 't2', patient_id: 'p2', driver_id: 'd2', pickup_time: '09:30', appointment_time: '10:30', status: 'En Route', pickup_address: '15000 Ford Rd, Dearborn, MI', dropoff_address: 'Beaumont Hospital Royal Oak', pickup_location: { lat: 42.3223, lng: -83.1763 }, dropoff_location: { lat: 42.5159, lng: -83.1788 } },
  { id: 't3', patient_id: 'p3', driver_id: 'd1', pickup_time: '11:00', appointment_time: '12:00', status: 'Scheduled', pickup_address: '26000 Evergreen Rd, Southfield, MI', dropoff_address: 'Henry Ford Hospital', pickup_location: { lat: 42.4734, lng: -83.2219 }, dropoff_location: { lat: 42.3670, lng: -83.0853 } },
];

// In-memory store with reactivity callbacks
type Callback = (data: any[]) => void;
const listeners: Record<string, Callback[]> = {
  patients: [],
  drivers: [],
  vehicles: [],
  facilities: [],
  trips: [],
  activities: [],
};

const store: Record<string, any[]> = {
  patients: [...mockPatients],
  drivers: [...mockDrivers],
  vehicles: [...mockVehicles],
  facilities: [...mockFacilities],
  trips: [...mockTrips],
  activities: [],
};

function notifyListeners(collection: string) {
  listeners[collection]?.forEach(cb => cb([...store[collection]]));
}

export const mockDb = {
  subscribe(collection: string, callback: Callback) {
    if (!listeners[collection]) listeners[collection] = [];
    listeners[collection].push(callback);
    // Immediately call with current data
    callback([...store[collection]]);
    // Return unsubscribe function
    return () => {
      listeners[collection] = listeners[collection].filter(cb => cb !== callback);
    };
  },

  getAll(collection: string) {
    return [...store[collection]];
  },

  get(collection: string, id: string) {
    return store[collection]?.find(item => item.id === id);
  },

  add(collection: string, data: any) {
    const id = `${collection[0]}${Date.now()}`;
    const newItem = { ...data, id };
    store[collection].push(newItem);
    notifyListeners(collection);
    return newItem;
  },

  update(collection: string, id: string, data: any) {
    const index = store[collection].findIndex(item => item.id === id);
    if (index !== -1) {
      store[collection][index] = { ...store[collection][index], ...data };
      notifyListeners(collection);
    }
  },

  delete(collection: string, id: string) {
    store[collection] = store[collection].filter(item => item.id !== id);
    notifyListeners(collection);
  },

  set(collection: string, id: string, data: any) {
    const index = store[collection].findIndex(item => item.id === id);
    if (index !== -1) {
      store[collection][index] = { ...data, id };
    } else {
      store[collection].push({ ...data, id });
    }
    notifyListeners(collection);
  }
};

// Activity logging helper
export function logActivity(type: 'success' | 'info' | 'warning', message: string, details?: string) {
  const activity = {
    id: `a${Date.now()}`,
    type,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
  store.activities.unshift(activity); // Add to beginning
  if (store.activities.length > 50) store.activities.pop(); // Keep max 50
  notifyListeners('activities');
}

// Flag to check if we're in mock mode
export const USE_MOCK_DATA = false;
