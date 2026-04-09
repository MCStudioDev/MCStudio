# NEMT V2 Project Structure

## Overview
This is a React + Vite + Firebase + Express NEMT (Non-Emergency Medical Transportation) Dispatch System with three main portals:
- **Dispatcher Portal** (`/dispatch`) - Fleet & booking management
- **Driver App** (`/driver`) - Trip manifest & navigation
- **Patient Tracker** (`/patient/:tripId`) - Public trip tracking

---

## Folder Organization

```
nemt_v2/
├── src/                          # Application source code
│   ├── pages/                    # Route/page components (main views)
│   │   ├── Dashboard.tsx         # Dispatcher dashboard stats
│   │   ├── DispatcherPortal.tsx  # Main dispatcher interface
│   │   ├── DriverApp.tsx         # Driver app main interface
│   │   ├── Bookings.tsx          # Booking management page
│   │   ├── Fleet.tsx             # Fleet management page
│   │   ├── Patients.tsx          # Patient management page
│   │   ├── PatientTracker.tsx    # Public patient tracking
│   │   └── TripDetails.tsx       # Trip details view
│   │
│   ├── components/               # Reusable UI components
│   │   ├── ErrorBoundary.tsx     # Error boundary wrapper
│   │   ├── AuthWrapper.tsx       # Auth wrapper for routes
│   │   ├── DispatcherAuthWrapper.tsx  # Dispatcher-specific auth
│   │   ├── DriverManifest.tsx    # Driver trip manifest display
│   │   ├── DriverMap.tsx         # Driver navigation map
│   │   └── FleetMap.tsx          # Live fleet tracking map
│   │
│   ├── hooks/                    # Custom React hooks
│   │   └── useData.ts            # Data fetching/state hook
│   │
│   ├── utils/                    # Utility functions
│   │   ├── geocoding.ts          # Google Maps geocoding utilities
│   │   ├── routeOptimization.ts  # Trip route optimization logic
│   │   ├── seedDatabase.ts       # Database seeding utilities
│   │   ├── firestoreErrorHandler.ts  # Firebase error handling
│   │   └── mockData.ts           # Mock data for development
│   │
│   ├── config/                   # Configuration files
│   │   ├── firebase.ts           # Firebase initialization
│   │   ├── firebase-applet-config.json    # Firebase config
│   │   ├── firebase-blueprint.json        # Firebase schema
│   │   └── firestore.rules       # Firestore security rules
│   │
│   ├── styles/                   # Global styles
│   │   └── index.css             # Main stylesheet (Tailwind)
│   │
│   ├── data/                     # Static data
│   │   └── metadata.json         # App metadata
│   │
│   ├── types/                    # TypeScript types/interfaces
│   │   └── .gitkeep              # Placeholder for type definitions
│   │
│   ├── App.tsx                   # Main App component
│   └── main.tsx                  # Vite entry point
│
├── public/                       # Static assets
│   └── .gitkeep                  # Placeholder for assets
│
├── node_modules/                 # Dependencies (created via npm install)
│   └── .gitkeep                  # Placeholder
│
├── server.ts                     # Express backend server
├── index.html                    # HTML entry point
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # TypeScript config
├── vite.config.ts               # Vite configuration
├── vercel.json                  # Vercel deployment config
├── README.md                    # Project documentation
└── PROJECT_STRUCTURE.md         # This file
```

---

## Key Files & Their Purpose

### Core Application
- **`src/main.tsx`** - Vite entry point that mounts React app
- **`src/App.tsx`** - Root component with routing setup
- **`index.html`** - HTML template

### Backend
- **`server.ts`** - Express server for API routes & WebSocket (Socket.IO)

### Firebase & Database
- **`src/config/firebase.ts`** - Firebase SDK initialization
- **`src/config/firestore.rules`** - Database security rules
- **`src/config/firebase-applet-config.json`** - Firebase credentials

### Smart Features
- **`src/utils/routeOptimization.ts`** - Auto-assigns best driver, validates capacity & shift times
- **`src/utils/geocoding.ts`** - Address/location utilities using Google Maps API
- **`src/utils/firestoreErrorHandler.ts`** - Centralized Firebase error handling

### Data & Mocking
- **`src/hooks/useData.ts`** - React hook for data fetching from Firestore
- **`src/utils/mockData.ts`** - Development/test data
- **`src/utils/seedDatabase.ts`** - Database initialization

### Styling
- **`src/styles/index.css`** - Tailwind CSS + custom styles

---

## Import Path Updates

After reorganization, update import paths in your files:

### Old → New Examples
```typescript
// OLD (from root)
import { Dashboard } from './Dashboard'
import { useData } from './useData'
import { geocoding } from './geocoding'
import { initializeApp } from './firebase'

// NEW (from src)
import { Dashboard } from '@/pages/Dashboard'
import { useData } from '@/hooks/useData'
import { geocoding } from '@/utils/geocoding'
import { initializeApp } from '@/config/firebase'
```

### Configure Path Aliases in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

---

## Dependencies

See `package.json` for full list. Key packages:
- **React 19** - UI framework
- **Vite 6** - Build tool
- **Firebase 12** - Backend & Database
- **Express 4** - Node.js server
- **React Router 7** - Client-side routing
- **Socket.IO** - Real-time updates
- **Tailwind CSS 4** - Styling
- **React Google Maps API** - Map integration
- **Leaflet** - Alternative mapping library

---

## Development Workflow

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run dev server:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   ```

4. **Start production server:**
   ```bash
   npm start
   ```

---

## Notes

- **node_modules** folder is created by `npm install` - the `.gitkeep` file ensures the folder is tracked in version control
- **public/** folder should contain static assets like icons, images, etc.
- **src/types/** should contain TypeScript interfaces and type definitions
- All environment variables should be in `.env.local` (not committed to git)
