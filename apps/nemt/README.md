<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# NEMT Dispatch System

Non-Emergency Medical Transportation dispatch system for managing drivers, patients, and trips.

## Features

- **Dispatcher Portal** (Google auth required)
  - Dashboard with live stats
  - Fleet management (drivers with vehicle capacity)
  - Live fleet map
  - Smart booking with auto-assignment & route optimization
  - Patient management with mobility status

- **Driver App** (Name + PIN login)
  - Trip manifest view (optimized order)
  - Navigation integration (Google Maps, Waze, Apple Maps)  
  - Status updates
  - GPS location tracking

- **Smart Scheduling**
  - Auto-assigns best driver based on route optimization
  - Checks vehicle capacity vs patient mobility
  - Buffer time validation between trips
  - Shift compliance checking

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the app:
   ```bash
   npm run dev
   ```

3. Open http://localhost:3000

## Deployment (Vercel)

1. Push code to GitHub

2. Go to https://vercel.com, sign in with GitHub

3. Click "Import Project" → select your repo

4. Deploy (auto-configured via vercel.json)

5. Add your deployed domain to Firebase:
   - Firebase Console → Authentication → Settings → Authorized domains
   - Add your Vercel URL (e.g., `nemt-dispatch.vercel.app`)

6. Update Firestore rules in Firebase Console:
   - Select database: `ai-studio-c1ea52c0-a959-48de-abfa-1bed5f730a83`
   - Rules tab → copy from `firestore.rules` → Publish

## URLs

- **Dispatcher:** `/dispatch` (requires Google sign-in)
- **Driver App:** `/driver` (name + PIN login)
- **Patient Tracker:** `/patient/:tripId` (public)

## Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication (Google provider)
3. Create Firestore database
4. Copy `firestore.rules` content to Firestore → Rules
5. Add authorized domains in Authentication → Settings
