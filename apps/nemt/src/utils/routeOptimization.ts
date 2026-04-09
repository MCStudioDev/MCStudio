// Route optimization utility
// Uses OpenRouteService API (free: 2000 requests/day) with local fallback

const OPENROUTE_API_KEY = ''; // Get free key at https://openrouteservice.org/dev/#/signup

interface Location {
  lat: number;
  lng: number;
}

interface Trip {
  id: string;
  pickup_location?: Location;
  dropoff_location?: Location;
  pickup_address?: string;
  dropoff_address?: string;
  pickup_time?: string;
  appointment_time?: string;
  [key: string]: any;
}

// Haversine formula - calculate distance between two points in km
function haversineDistance(loc1: Location, loc2: Location): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(loc2.lat - loc1.lat);
  const dLng = toRad(loc2.lng - loc1.lng);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(loc1.lat)) * Math.cos(toRad(loc2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Get location from trip (prefers pickup, uses coordinates or geocoded address)
function getTripLocation(trip: Trip): Location | null {
  if (trip.pickup_location) {
    return {
      lat: trip.pickup_location.lat,
      lng: trip.pickup_location.lng
    };
  }
  return null;
}

// Nearest neighbor algorithm - simple but effective greedy optimization
function nearestNeighborOptimization(trips: Trip[], startLocation: Location): Trip[] {
  if (trips.length <= 1) return trips;

  const tripsWithLocations = trips.filter(t => getTripLocation(t) !== null);
  const tripsWithoutLocations = trips.filter(t => getTripLocation(t) === null);

  if (tripsWithLocations.length === 0) {
    // Fallback: sort by pickup time
    return [...trips].sort((a, b) => {
      const timeA = a.pickup_time || '00:00';
      const timeB = b.pickup_time || '00:00';
      return timeA.localeCompare(timeB);
    });
  }

  const optimized: Trip[] = [];
  let remaining = [...tripsWithLocations];
  let currentLocation = startLocation;

  while (remaining.length > 0) {
    // Find nearest trip
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const tripLoc = getTripLocation(remaining[i]);
      if (tripLoc) {
        const distance = haversineDistance(currentLocation, tripLoc);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }
    }

    const nearest = remaining.splice(nearestIndex, 1)[0];
    optimized.push(nearest);
    
    // Move to dropoff location for next calculation (if available)
    const dropoff = nearest.dropoff_location;
    if (dropoff) {
      currentLocation = { lat: dropoff.lat, lng: dropoff.lng };
    } else {
      const pickup = getTripLocation(nearest);
      if (pickup) currentLocation = pickup;
    }
  }

  // Add trips without locations at the end (sorted by time)
  const timeSorted = tripsWithoutLocations.sort((a, b) => {
    const timeA = a.pickup_time || '00:00';
    const timeB = b.pickup_time || '00:00';
    return timeA.localeCompare(timeB);
  });

  return [...optimized, ...timeSorted];
}

// Calculate total route distance
export function calculateTotalDistance(trips: Trip[], startLocation?: Location): number {
  let total = 0;
  let currentLoc = startLocation || { lat: 42.3314, lng: -83.0458 }; // Detroit default

  for (const trip of trips) {
    const pickupLoc = getTripLocation(trip);
    if (pickupLoc) {
      total += haversineDistance(currentLoc, pickupLoc);
      
      const dropoffLoc = trip.dropoff_location;
      if (dropoffLoc) {
        total += haversineDistance(pickupLoc, dropoffLoc);
        currentLoc = { lat: dropoffLoc.lat, lng: dropoffLoc.lng };
      } else {
        currentLoc = pickupLoc;
      }
    }
  }

  return total;
}

// OpenRouteService API optimization (when API key is available)
async function openRouteServiceOptimization(trips: Trip[], startLocation: Location): Promise<Trip[] | null> {
  if (!OPENROUTE_API_KEY) return null;

  try {
    const jobs = trips.map((trip, index) => {
      const loc = getTripLocation(trip);
      if (!loc) return null;
      return {
        id: index,
        location: [loc.lng, loc.lat], // ORS uses [lng, lat]
        service: 300, // 5 min service time
      };
    }).filter(Boolean);

    if (jobs.length === 0) return null;

    const response = await fetch('https://api.openrouteservice.org/optimization', {
      method: 'POST',
      headers: {
        'Authorization': OPENROUTE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobs,
        vehicles: [{
          id: 1,
          profile: 'driving-car',
          start: [startLocation.lng, startLocation.lat],
        }],
      }),
    });

    if (!response.ok) {
      console.warn('OpenRouteService optimization failed:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.routes && data.routes[0] && data.routes[0].steps) {
      const orderedIndices = data.routes[0].steps
        .filter((s: any) => s.type === 'job')
        .map((s: any) => s.job);
      
      return orderedIndices.map((idx: number) => trips[idx]);
    }

    return null;
  } catch (error) {
    console.error('OpenRouteService error:', error);
    return null;
  }
}

// Main optimization function
export async function optimizeRoute(
  trips: Trip[], 
  driverLocation?: Location
): Promise<{ optimizedTrips: Trip[]; savings: { distance: number; percentage: number } }> {
  
  const startLocation = driverLocation || { lat: 42.3314, lng: -83.0458 }; // Detroit default
  
  // Calculate original distance
  const originalDistance = calculateTotalDistance(trips, startLocation);
  
  // Try OpenRouteService first, fallback to local optimization
  let optimizedTrips = await openRouteServiceOptimization(trips, startLocation);
  
  if (!optimizedTrips) {
    // Use local nearest-neighbor algorithm
    optimizedTrips = nearestNeighborOptimization(trips, startLocation);
  }
  
  // Calculate optimized distance
  const optimizedDistance = calculateTotalDistance(optimizedTrips, startLocation);
  
  const savings = {
    distance: originalDistance - optimizedDistance,
    percentage: originalDistance > 0 
      ? Math.round(((originalDistance - optimizedDistance) / originalDistance) * 100)
      : 0
  };
  
  return { optimizedTrips, savings };
}

// ===============================================================
// Smart Auto-Assignment Functions
// ===============================================================

interface NewTripData {
  pickup_location: Location;
  dropoff_location: Location;
  pickup_time: string;
  appointment_time: string;
}

// Calculate the minimum insertion cost for adding a new trip to existing trips
// Returns the extra distance required to add the new trip optimally
export function calculateInsertionCost(
  existingTrips: Trip[],
  newTrip: NewTripData,
  driverLocation: Location
): { cost: number; optimalPosition: number } {
  // If no existing trips, cost is just: driver -> pickup -> dropoff
  if (existingTrips.length === 0) {
    const cost = 
      haversineDistance(driverLocation, newTrip.pickup_location) +
      haversineDistance(newTrip.pickup_location, newTrip.dropoff_location);
    return { cost, optimalPosition: 0 };
  }

  // Try inserting at each position and find minimum cost increase
  let minCost = Infinity;
  let optimalPosition = 0;

  for (let pos = 0; pos <= existingTrips.length; pos++) {
    const cost = calculateRouteWithInsertion(existingTrips, newTrip, pos, driverLocation);
    if (cost < minCost) {
      minCost = cost;
      optimalPosition = pos;
    }
  }

  return { cost: minCost, optimalPosition };
}

// Calculate total route distance with new trip inserted at a specific position
function calculateRouteWithInsertion(
  existingTrips: Trip[],
  newTrip: NewTripData,
  insertPosition: number,
  driverLocation: Location
): number {
  let total = 0;
  let currentLoc = driverLocation;
  let tripIndex = 0;

  // Process trips in order, inserting new trip at specified position
  for (let i = 0; i <= existingTrips.length; i++) {
    if (i === insertPosition) {
      // Insert new trip here
      total += haversineDistance(currentLoc, newTrip.pickup_location);
      total += haversineDistance(newTrip.pickup_location, newTrip.dropoff_location);
      currentLoc = newTrip.dropoff_location;
    }
    
    if (tripIndex < existingTrips.length) {
      const trip = existingTrips[tripIndex];
      const pickupLoc = getTripLocation(trip);
      if (pickupLoc) {
        total += haversineDistance(currentLoc, pickupLoc);
        const dropoffLoc = trip.dropoff_location;
        if (dropoffLoc) {
          total += haversineDistance(pickupLoc, dropoffLoc);
          currentLoc = { lat: dropoffLoc.lat, lng: dropoffLoc.lng };
        } else {
          currentLoc = pickupLoc;
        }
      }
      tripIndex++;
    }
  }

  return total;
}

// Smart driver assignment - finds the best driver based on route optimization
export function findBestDriverForTrip(
  newTrip: NewTripData,
  drivers: Array<{
    id: string;
    current_location: Location;
    shift_start: string;
    shift_end: string;
  }>,
  existingTrips: Trip[],
  checkConstraints: (driver: any, newTrip: NewTripData) => { valid: boolean; reason?: string }
): { driverId: string; insertionCost: number; optimalPosition: number } | null {
  
  let bestDriver: { driverId: string; insertionCost: number; optimalPosition: number } | null = null;
  let minInsertionCost = Infinity;

  for (const driver of drivers) {
    // Check constraints (vehicle compatibility, shift, schedule conflicts)
    const constraintResult = checkConstraints(driver, newTrip);
    if (!constraintResult.valid) continue;

    // Get this driver's existing active trips
    const driverTrips = existingTrips.filter(t => 
      t.driver_id === driver.id && 
      t.status !== 'Completed' && 
      t.status !== 'Cancelled'
    );

    // Calculate insertion cost
    const driverLoc = {
      lat: driver.current_location?.lat || (driver.current_location as any)?.[0] || 42.3314,
      lng: driver.current_location?.lng || (driver.current_location as any)?.[1] || -83.0458
    };
    
    const { cost, optimalPosition } = calculateInsertionCost(driverTrips, newTrip, driverLoc);

    // Apply traffic/time-of-day multiplier (rush hour = 1.3x, normal = 1.0x)
    const hour = parseInt(newTrip.pickup_time.split(':')[0] || '12');
    const trafficMultiplier = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18) ? 1.3 : 1.0;
    const adjustedCost = cost * trafficMultiplier;

    if (adjustedCost < minInsertionCost) {
      minInsertionCost = adjustedCost;
      bestDriver = { driverId: driver.id, insertionCost: adjustedCost, optimalPosition };
    }
  }

  return bestDriver;
}

// Format distance for display
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

// Estimate drive time (rough estimate: 35 km/h average in city)
export function estimateDriveTime(km: number): number {
  return Math.round((km / 35) * 60); // minutes
}

export function formatDriveTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
