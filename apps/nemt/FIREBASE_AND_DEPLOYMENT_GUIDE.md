# Firebase Setup & Deployment Guide

## 📊 FIREBASE DATABASE ARCHITECTURE

### Project Details
```
Project ID: gen-lang-client-0220167683
Firestore Database: ai-studio-c1ea52c0-a959-48de-abfa-1bed5f730a83
Auth Method: Google OAuth (Dispatcher) + Name+PIN (Driver)
Region: Default (US multi-region if not specified)
```

### Database Collections & Schema

#### 1️⃣ **Patients** - Medical Information
```json
patients/
  p1: {
    "id": "p1",
    "name": "Robert Chen",
    "mobility_status": "Wheelchair | Ambulatory | Stretcher | Bariatric Wheelchair",
    "home_address": "100 Renaissance Center, Detroit, MI",
    "phone": "313-555-0101",
    "geo_coordinates": { "lat": 42.3290, "lng": -83.0397 }
  }
```

#### 2️⃣ **Drivers** - Transportation Staff
```json
drivers/
  d1: {
    "id": "d1",
    "name": "Marcus Detroit",          // Used for PIN login
    "license_number": "DL-MI-001",
    "current_location": { "lat": 42.3314, "lng": -83.0458 },  // Updated by driver app
    "shift_start": "06:00",
    "shift_end": "14:00",
    "vehicle_id": "v1"
  }
```

#### 3️⃣ **Vehicles** - Transportation Assets
```json
vehicles/
  v1: {
    "id": "v1",
    "license_plate": "MI-ABC-123",
    "type": "Van",
    "capacity": "2 wheelchairs + 4 seats"
  }
```

#### 4️⃣ **Facilities** - Healthcare Locations
```json
facilities/
  f1: {
    "id": "f1",
    "name": "Henry Ford Hospital",
    "address": "2799 W Grand Blvd, Detroit, MI",
    "geo_coordinates": { "lat": 42.3670, "lng": -83.0853 }
  }
```

#### 5️⃣ **Trips** - Booking & Scheduling Core
```json
trips/
  t1: {
    "id": "t1",
    "patient_id": "p1",
    "driver_id": "d1",
    "pickup_time": "08:00",
    "appointment_time": "09:00",
    "status": "Scheduled | En Route | Completed | Cancelled",
    "pickup_address": "100 Renaissance Center, Detroit, MI",
    "dropoff_address": "Henry Ford Hospital",
    "pickup_location": { "lat": 42.3290, "lng": -83.0397 },
    "dropoff_location": { "lat": 42.3670, "lng": -83.0853 },
    "optimized_order": 1
  }
```

#### 6️⃣ **Activities** - Audit Log
```json
activities/
  activity_123: {
    "timestamp": "2026-04-04T10:30:00Z",
    "user_id": "dispatcher_1",
    "action": "TRIP_CREATED | TRIP_ASSIGNED | STATUS_UPDATED",
    "details": { ... }
  }
```

### Security Rules Summary

| Collection | Dispatcher | Driver | Public |
|-----------|-----------|--------|--------|
| **patients** | CRUD | Read | Read |
| **drivers** | CRUD | Read + Update location | ❌ |
| **vehicles** | CRUD | Read | ❌ |
| **trips** | CRUD | Read + Update status | Read |
| **facilities** | CRUD | Read | Read |
| **activities** | CRUD+Read | ❌ | ❌ |

---

## 🚀 ROUTE OPTIMIZATION SYSTEM

### Current Algorithm: Nearest Neighbor (Greedy)

**Location**: `src/utils/routeOptimization.ts`

```typescript
// Workflow
1. Get all trips for a driver
2. Filter trips with valid coordinates
3. Start at driver's current location
4. Find nearest unvisited trip (Haversine distance)
5. Move to pickup→dropoff location
6. Repeat until all trips visited
7. Return optimized trip order
```

### Features Implemented ✅
- ✅ Haversine distance calculation (lat/lng to km)
- ✅ Nearest neighbor greedy algorithm
- ✅ Vehicle capacity validation
- ✅ Shift time compliance
- ✅ 15-minute buffer between trips
- ✅ Fallback to time-based sorting

### Features MISSING ❌
- ❌ Real travel time (uses straight-line distance only)
- ❌ Traffic/road network awareness
- ❌ Time window constraints (hard deadlines)
- ❌ Multi-vehicle coordination
- ❌ Dynamic re-optimization (mid-route changes)

### To Enable Real Route Optimization

**1. Add OpenRouteService API**
```typescript
// In routeOptimization.ts, add:
const OPENROUTE_API_KEY = 'your-key-here';  // Get free at: https://openrouteservice.org/dev/#/signup

// Function to call API for real distance/time
async function getMatrixDistance(locations: Location[][]): Promise<number[][]> {
  const response = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
    method: 'POST',
    headers: { 'Authorization': OPENROUTE_API_KEY },
    body: JSON.stringify({ locations })
  });
  return response.json();
}
```

**2. Integrate Google Maps Geocoding**
```typescript
// In geocoding.ts, add:
const GOOGLE_MAPS_API_KEY = 'your-key-here';

async function geocodeAddress(address: string): Promise<Location> {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${GOOGLE_MAPS_API_KEY}`
  );
  const data = response.json();
  return { lat: data.results[0].geometry.location.lat, lng: data.results[0].geometry.location.lng };
}
```

---

## 🌐 DEPLOYMENT TO WEBHOST

### Option 1: Vercel (Recommended - Already Configured ✅)

**Status**: Partially configured (see `vercel.json`)

**Steps to Deploy:**

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login to Vercel
vercel login

# 3. Deploy
vercel

# 4. Add environment variables in Vercel dashboard
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_OPENROUTE_API_KEY=...    # Optional
VITE_GOOGLE_MAPS_API_KEY=...  # Optional
```

**5. Add Vercel Domain to Firebase:**
- Go to Firebase Console
- Authentication → Settings → Authorized domains
- Add your Vercel URL (e.g., `nemt-dispatch.vercel.app`)

### Option 2: Firebase Hosting

```bash
# 1. Install Firebase CLI
npm i -g firebase-tools

# 2. Login
firebase login

# 3. Initialize hosting
firebase init hosting

# 4. Deploy
firebase deploy
```

### Option 3: Docker + Cloud Run (GCP)

```dockerfile
# Dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# Deploy to Cloud Run
gcloud run deploy nemt-dispatch \
  --source . \
  --platform managed \
  --region us-central1
```

---

## ✅ CHECKLIST: READY FOR PRODUCTION

### Phase 1: Core Features (COMPLETE ✅)
- [x] Firebase setup
- [x] Database schema
- [x] Security rules
- [x] Dispatcher auth (Google OAuth)
- [x] Driver auth (Name + PIN)
- [x] Route optimization (basic)
- [x] Project reorganized
- [x] All imports fixed

### Phase 2: Enhanced Route Optimization (REMAINING)
- [ ] Add API keys (OpenRouteService, Google Maps)
- [ ] Implement real travel time matrix
- [ ] Add geocoding for addresses
- [ ] Test route optimization accuracy
- [ ] Add time window constraints
- [ ] Handle dynamic route changes

### Phase 3: Deployment (REMAINING)
- [ ] Set up Vercel project
- [ ] Add environment variables
- [ ] Configure Firebase Authorized Domains
- [ ] Test all three portals on live domain
- [ ] Enable CORS for APIs
- [ ] Set up monitoring/logging

### Phase 4: Production Hardening (REMAINING)
- [ ] Remove mock data from production
- [ ] Enable rate limiting
- [ ] Add error tracking (Sentry)
- [ ] Set up analytics (Mixpanel)
- [ ] Enable backup strategy
- [ ] Document API endpoints
- [ ] Load testing

### Phase 5: Optional Features (FUTURE)
- [ ] SMS notifications (Twilio)
- [ ] Real-time chat (Socket.IO)
- [ ] Vehicle tracking map updates
- [ ] Automated trip reassignment
- [ ] Driver performance metrics
- [ ] Invoice/billing integration

---

## 🔧 ENVIRONMENT VARIABLES NEEDED

Create `.env.local` in project root:

```env
# Firebase (already in firebase-applet-config.json, but can override)
VITE_FIREBASE_API_KEY=AIzaSyBQ3zd-lb0oCd4ZmmBQz1dLLLnRpPfDeJ0
VITE_FIREBASE_AUTH_DOMAIN=gen-lang-client-0220167683.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gen-lang-client-0220167683
VITE_FIRESTORE_DATABASE_ID=ai-studio-c1ea52c0-a959-48de-abfa-1bed5f730a83

# Route Optimization APIs (REQUIRED for real optimization)
VITE_OPENROUTE_API_KEY=your-key-here        # Get from: https://openrouteservice.org
VITE_GOOGLE_MAPS_API_KEY=your-key-here      # Get from: https://cloud.google.com/maps-platform

# Optional: Analytics & Monitoring
VITE_SENTRY_DSN=
VITE_MIXPANEL_TOKEN=

# Server
PORT=3000
NODE_ENV=development
```

---

## 📱 TESTING EACH PORTAL

### 1. Dispatcher Portal
```
URL: http://localhost:3000/dispatch
Auth: Google Sign-In required
Test: Create/edit trips, assign drivers, view fleet map
```

### 2. Driver App  
```
URL: http://localhost:3000/driver
Auth: Name "Marcus Detroit" + PIN from database
Test: View manifest, update status, see optimized route
```

### 3. Patient Tracker
```
URL: http://localhost:3000/patient/t1
Auth: None (public)
Test: Track trip in real-time, see ETA updates
```

---

## 🚨 Common Issues & Solutions

### Issue: "Firebase config not found"
**Solution**: Ensure `firebase-applet-config.json` is in `src/config/`

### Issue: "Authorized domain error"
**Solution**: Add your deployment domain to Firebase Console → Authentication → Authorized domains

### Issue: "Route optimization not working"
**Solution**: Add trips with `pickup_location` and `dropoff_location` coordinates to database

### Issue: "Driver location not updating"
**Solution**: Ensure driver app has location permission and is running updateLocation hook

---

## 📊 Performance Optimization Tips

1. **Enable Firestore indexing** for frequently queried fields
2. **Cache geocoding results** to avoid API rate limits
3. **Use Firestore batch operations** for multi-document writes
4. **Enable CDN** on Vercel for static assets
5. **Monitor Firestore read/write costs** in Firebase Console

---

## 🔗 Useful Links

- Firebase Console: https://console.firebase.google.com
- Vercel Dashboard: https://vercel.com/dashboard
- OpenRouteService: https://openrouteservice.org
- Google Maps API: https://cloud.google.com/maps-platform
- Firestore Docs: https://firebase.google.com/docs/firestore
- Vite Docs: https://vitejs.dev

---

**Next Steps**: 
1. Choose hosting option (Vercel recommended)
2. Add API keys for route optimization
3. Deploy to production
4. Monitor performance and errors
