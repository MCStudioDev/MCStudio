import { db } from '../config/firebase';
import { collection, getDocs, doc, setDoc, query, where } from 'firebase/firestore';

/**
 * Seeds the database with demo data for a specific company.
 * Every document gets the companyId field for multi-tenant isolation.
 */
export async function seedDatabaseIfEmpty(companyId: string) {
  if (!companyId) {
    console.error('Cannot seed database: No companyId provided');
    return;
  }

  try {
    // Check if this company already has data
    const q = query(collection(db, 'patients'), where('companyId', '==', companyId));
    const patientsSnap = await getDocs(q);
    if (!patientsSnap.empty) return; // Already seeded for this company

    console.log(`Seeding database for company: ${companyId}...`);
    
    const patients = [
      { id: `${companyId}_p1`, name: 'Robert Chen', mobility_status: 'Wheelchair', home_address: '100 Renaissance Center, Detroit, MI', phone: '313-555-0101', geo_coordinates: { lat: 42.3290, lng: -83.0397 }, companyId },
      { id: `${companyId}_p2`, name: 'Maria Garcia', mobility_status: 'Ambulatory', home_address: '15000 Ford Rd, Dearborn, MI', phone: '313-555-0102', geo_coordinates: { lat: 42.3223, lng: -83.1763 }, companyId },
      { id: `${companyId}_p3`, name: 'James Smith', mobility_status: 'Stretcher', home_address: '26000 Evergreen Rd, Southfield, MI', phone: '248-555-0103', geo_coordinates: { lat: 42.4734, lng: -83.2219 }, companyId },
      { id: `${companyId}_p4`, name: 'Linda Johnson', mobility_status: 'Wheelchair', home_address: '30000 Van Dyke Ave, Warren, MI', phone: '586-555-0104', geo_coordinates: { lat: 42.4919, lng: -83.0238 }, companyId },
      { id: `${companyId}_p5`, name: 'William Davis', mobility_status: 'Ambulatory', home_address: '33000 Civic Center Dr, Livonia, MI', phone: '734-555-0105', geo_coordinates: { lat: 42.3953, lng: -83.3527 }, companyId },
      { id: `${companyId}_p6`, name: 'Patricia Miller', mobility_status: 'Bariatric Wheelchair', home_address: '500 W Big Beaver Rd, Troy, MI', phone: '248-555-0106', geo_coordinates: { lat: 42.6064, lng: -83.1498 }, companyId },
      { id: `${companyId}_p7`, name: 'Richard Wilson', mobility_status: 'Ambulatory', home_address: '43200 11 Mile Rd, Novi, MI', phone: '248-555-0107', geo_coordinates: { lat: 42.4806, lng: -83.4755 }, companyId },
      { id: `${companyId}_p8`, name: 'Susan Moore', mobility_status: 'Wheelchair', home_address: '200 S Main St, Royal Oak, MI', phone: '248-555-0108', geo_coordinates: { lat: 42.4895, lng: -83.1446 }, companyId },
      { id: `${companyId}_p9`, name: 'Joseph Taylor', mobility_status: 'Stretcher', home_address: '46000 Summit Pkwy, Canton, MI', phone: '734-555-0109', geo_coordinates: { lat: 42.3086, lng: -83.4821 }, companyId },
      { id: `${companyId}_p10`, name: 'Margaret Anderson', mobility_status: 'Ambulatory', home_address: '40000 Dodge Park Rd, Sterling Heights, MI', phone: '586-555-0110', geo_coordinates: { lat: 42.5803, lng: -83.0302 }, companyId },
    ];

    const drivers = [
      { id: `${companyId}_d1`, name: 'Marcus Detroit', license_number: 'DL-MI-001', current_location: { lat: 42.3314, lng: -83.0458 }, shift_start: '06:00', shift_end: '14:00', vehicle_id: `${companyId}_v1`, pin: '1234', companyId },
      { id: `${companyId}_d2`, name: 'Alicia Motorcity', license_number: 'DL-MI-002', current_location: { lat: 42.4734, lng: -83.2219 }, shift_start: '08:00', shift_end: '16:00', vehicle_id: `${companyId}_v2`, pin: '5678', companyId },
    ];

    const vehicles = [
      { id: `${companyId}_v1`, license_plate: 'MI-ABC-123', type: 'Van', capacity: '2 wheelchairs + 4 seats', companyId },
      { id: `${companyId}_v2`, license_plate: 'MI-XYZ-789', type: 'Sedan', capacity: '0 wheelchairs + 4 seats', companyId },
    ];

    const facilities = [
      { id: `${companyId}_f1`, name: 'Henry Ford Hospital', address: '2799 W Grand Blvd, Detroit, MI', geo_coordinates: { lat: 42.3670, lng: -83.0853 }, companyId },
      { id: `${companyId}_f2`, name: 'Beaumont Hospital Royal Oak', address: '3601 W 13 Mile Rd, Royal Oak, MI', geo_coordinates: { lat: 42.5159, lng: -83.1788 }, companyId },
    ];

    const trips = [
      { id: `${companyId}_t1`, patient_id: `${companyId}_p1`, driver_id: `${companyId}_d1`, pickup_time: '08:00', appointment_time: '09:00', status: 'Scheduled', pickup_address: '100 Renaissance Center, Detroit, MI', dropoff_address: 'Henry Ford Hospital', pickup_location: { lat: 42.3290, lng: -83.0397 }, dropoff_location: { lat: 42.3670, lng: -83.0853 }, companyId },
      { id: `${companyId}_t2`, patient_id: `${companyId}_p2`, driver_id: `${companyId}_d2`, pickup_time: '09:30', appointment_time: '10:30', status: 'En Route', pickup_address: '15000 Ford Rd, Dearborn, MI', dropoff_address: 'Beaumont Hospital Royal Oak', pickup_location: { lat: 42.3223, lng: -83.1763 }, dropoff_location: { lat: 42.5159, lng: -83.1788 }, companyId },
    ];

    for (const patient of patients) {
      await setDoc(doc(db, 'patients', patient.id), patient);
    }
    for (const driver of drivers) {
      await setDoc(doc(db, 'drivers', driver.id), driver);
    }
    for (const vehicle of vehicles) {
      await setDoc(doc(db, 'vehicles', vehicle.id), vehicle);
    }
    for (const facility of facilities) {
      await setDoc(doc(db, 'facilities', facility.id), facility);
    }
    for (const trip of trips) {
      await setDoc(doc(db, 'trips', trip.id), trip);
    }
    
    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}
