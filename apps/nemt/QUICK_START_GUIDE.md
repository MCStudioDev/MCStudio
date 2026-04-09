# QUICK START: Deploy & Optimize

## 🚀 DEPLOY TO VERCEL (10 minutes)

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Deploy from project root
cd c:\Users\gamal\Desktop\NEMT_V2\nemt_v2
vercel

# 4. Follow prompts - accept defaults

# 5. Your app is now at: https://your-project.vercel.app
```

## 🔒 ADD DOMAIN TO FIREBASE (5 minutes)

1. Go to: https://console.firebase.google.com
2. Select Project: "gen-lang-client-0220167683"
3. Click "Authentication" (left sidebar)
4. Click "Settings" (top right gear icon)
5. Click "Authorized domains" tab
6. Click "Add domain"
7. Paste your Vercel URL (e.g., `nemt-dispatch.vercel.app`)
8. Click "Add"

## 🧭 TEST ON LIVE (5 minutes)

```
1. Dispatcher Portal (needs Google login):
   https://your-project.vercel.app/dispatch
   
2. Driver App (needs Name+PIN):
   https://your-project.vercel.app/driver
   - Name: Marcus Detroit
   - PIN: (find in database or use mock)
   
3. Patient Tracker (public):
   https://your-project.vercel.app/patient/t1
```

---

## 🗺️ ENABLE REAL ROUTE OPTIMIZATION (30 minutes)

### Step 1: Get API Keys

**OpenRouteService (FREE):**
1. Visit: https://openrouteservice.org/dev/#/signup
2. Create account
3. Click "Tokens" tab
4. Copy your API Key

**Google Maps (PAID - $7/1000 requests):**
1. Visit: https://cloud.google.com/maps-platform
2. Create new project
3. Enable Maps APIs
4. Create API Key

### Step 2: Add Keys to .env.local

Create or edit `.env.local` in project root:

```env
VITE_OPENROUTE_API_KEY=paste-your-key-here
VITE_GOOGLE_MAPS_API_KEY=paste-your-key-here
```

### Step 3: Update Route Optimization

Edit `src/utils/routeOptimization.ts`:

```typescript
// Around line 3, replace empty string with:
const OPENROUTE_API_KEY = import.meta.env.VITE_OPENROUTE_API_KEY || '';

// Add new function for real distance (after line 50):
async function getRealDistance(locations: Location[][]): Promise<number[][]> {
  if (!OPENROUTE_API_KEY) {
    console.warn('OpenRouteService API key not set, using haversine fallback');
    // Fall back to haversine
    return locations.map((from, i) => 
      locations.map((to, j) => haversineDistance(from, to))
    );
  }
  
  try {
    const response = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
      method: 'POST',
      headers: {
        'Authorization': OPENROUTE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ locations })
    });
    const data = await response.json();
    return data.distances;
  } catch (error) {
    console.error('Error getting real distance:', error);
    // Fall back to haversine
    return locations.map((from, i) => 
      locations.map((to, j) => haversineDistance(from, to))
    );
  }
}
```

### Step 4: Test

1. Create a trip in Dispatcher Portal with 2+ pickups
2. View in Driver App → should show optimized order
3. Check browser console for API calls
4. Verify distance/time calculations are realistic

---

## 📊 DATABASE SETUP STATUS

### What's Already Done ✅
- Project: `gen-lang-client-0220167683`
- Database: `ai-studio-c1ea52c0-a959-48de-abfa-1bed5f730a83`
- 6 Collections (patients, drivers, vehicles, trips, facilities, activities)
- 10 sample patients + 2 sample drivers (for testing)
- Security rules configured
- Auth methods: Google OAuth + Name+PIN

### What You Can Do Now
```
Dispatcher Portal (Google sign-in):
├─ Create new patients
├─ Add vehicles
├─ Create trips
└─ Assign drivers

Driver App (Name+PIN login):
├─ View assigned trips
├─ See optimized route order
├─ Update trip status
└─ Report location

Patient Tracker:
└─ Track trip progress (public link)
```

---

## 🔧 ENVIRONMENT VARIABLES REFERENCE

### For Local Development (.env.local)
```env
# Optional - these are already in firebase-applet-config.json
VITE_FIREBASE_API_KEY=AIzaSyBQ3zd-lb0oCd4ZmmBQz1dLLLnRpPfDeJ0
VITE_FIREBASE_AUTH_DOMAIN=gen-lang-client-0220167683.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gen-lang-client-0220167683
VITE_FIRESTORE_DATABASE_ID=ai-studio-c1ea52c0-a959-48de-abfa-1bed5f730a83

# These you need to add
VITE_OPENROUTE_API_KEY=your-key-here
VITE_GOOGLE_MAPS_API_KEY=your-key-here
```

### For Vercel Deployment
1. Go to Vercel Dashboard
2. Select your project
3. Settings → Environment Variables
4. Add the same variables as above
5. Redeploy

---

## 🎯 CURRENT STATE VS COMPLETE

### Firebase Database: 95% Complete ✅
```
Schema:     ✅ All 6 collections defined
Data:       ✅ Sample data seeded
Security:   ✅ Rules configured
Auth:       ✅ Google + Name+PIN working
Testing:    ✅ Can create/edit data via UI
```

### Route Optimization: 35% Complete 🟨
```
Basic Algo:        ✅ Nearest Neighbor works
Real Distance:     ❌ Uses straight-line distance only
Geocoding:         ❌ Manual coordinates only
API Integration:   ❌ No API calls yet
```

### Deployment: 20% Complete 🟥
```
Code Ready:        ✅ App builds successfully
Vercel Config:     ✅ vercel.json exists
Dev Server:        ✅ Running locally
Live Domain:       ❌ Not deployed yet
Auth Domain Setup: ❌ Need to add Firebase domain
```

---

## 🚨 TROUBLESHOOTING

### "Failed to resolve import" errors
```
Solution: Already fixed! All imports updated for new folder structure.
Check: src/hooks/useData.ts imports use ../config/firebase
```

### "Database not seeding"
```
Go to Dispatcher Portal → Dashboard
Click "Seed Database" button
Check browser console for logs
```

### "Route not optimized"
```
Make sure trips have:
├─ pickup_location: {lat, lng}
└─ dropoff_location: {lat, lng}

If manual addresses only:
├─ Need VITE_GOOGLE_MAPS_API_KEY in .env.local
└─ Restart dev server (npm run dev)
```

### "Can't log in as driver"
```
Default test driver:
├─ Name: Marcus Detroit
├─ PIN: Check Firestore console under drivers/d1
└─ Add more drivers in Dispatcher Portal → Fleet
```

---

## ✅ VERIFICATION CHECKLIST

Before considering this "production ready":

- [ ] App deployed to Vercel
- [ ] Domain added to Firebase Authorized domains
- [ ] All 3 portals working on live URL
- [ ] Database seeded with test data
- [ ] Can create new trips in Dispatcher
- [ ] Driver can view trips with optimized route
- [ ] Patient tracker link works (no auth)
- [ ] Route optimization uses real travel time (after API key setup)
- [ ] No console errors
- [ ] Page load time < 3s

---

## 📞 QUICK REFERENCE

| Component | Location | Status |
|-----------|----------|--------|
| Firebase Config | src/config/firebase.ts | ✅ Ready |
| Database Schema | src/config/firestore.rules | ✅ Ready |
| Route Optimization | src/utils/routeOptimization.ts | 🟨 Partial |
| Data Hook | src/hooks/useData.ts | ✅ Ready |
| Dispatcher Portal | src/pages/DispatcherPortal.tsx | ✅ Ready |
| Driver App | src/pages/DriverApp.tsx | ✅ Ready |
| Patient Tracker | src/pages/PatientTracker.tsx | ✅ Ready |
| Deployment Config | vercel.json | ✅ Ready |

---

**NEXT IMMEDIATE STEP:**
```
1. Run: vercel deploy
2. Add domain to Firebase
3. Test: https://your-project.vercel.app/dispatch
```

Done! 🎉
