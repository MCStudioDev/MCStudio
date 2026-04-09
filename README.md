# MCStudio

**A SaaS platform with four products, deployed as independent modules from a single monorepo.**

---

## Architecture

```
mcstudio/
├── apps/
│   ├── nemt/              NEMT Dispatch — Dialysis transport management
│   ├── nutrimoment/       NutriMoment — AI-powered nutrition & recipe app
│   ├── realestate/        Real Estate AI — Property listing content generator
│   └── mina-energy/       Mina Energy Consulting — Corporate website
├── packages/
│   └── shared/            Shared utilities, types, and Firebase helpers
├── package.json           Monorepo root (npm workspaces)
└── README.md              ← You are here
```

## Apps

| App | Stack | Database | Auth | Status |
|-----|-------|----------|------|--------|
| **NEMT Dispatch** | Vite + React + TypeScript | Firebase Firestore | Firebase Auth (Google) | ✅ Multi-tenancy implemented |
| **NutriMoment** | Vite + React + TypeScript | SQLite → **migrating to Firestore** | Custom JWT → **migrating to Firebase Auth** | 🔄 Pending migration |
| **Real Estate AI** | TBD (Next.js) | Firebase Firestore | Firebase Auth | 📋 Planned |
| **Mina Energy** | Static HTML/CSS/JS | None | None | ✅ Complete |

## Infrastructure

| Layer | Service | Configuration |
|-------|---------|---------------|
| **Version Control** | GitHub | Single monorepo |
| **Hosting & CI/CD** | Vercel | 1 team, 4 projects (each pointing to its `apps/` subdirectory) |
| **Database** | Firebase Firestore | 3 separate Firebase projects for data isolation |
| **Auth** | Firebase Auth | Google + Email/Password sign-in |
| **AI Engine** | Google Gemini | Vision API for NutriMoment, text generation for Real Estate |
| **File Storage** | Firebase Cloud Storage | Fridge photos (NutriMoment), driver licenses (NEMT) |

## Getting Started

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9 (ships with Node 18+)
- A Firebase project ([console.firebase.google.com](https://console.firebase.google.com))

### Install Dependencies
```bash
# From the monorepo root — installs all workspaces
npm install
```

### Run an App Locally
```bash
# NEMT Dispatch
npm run dev:nemt

# NutriMoment
npm run dev:nutrimoment
```

### Environment Variables
Each app has its own `.env.example` file. Copy it to `.env` and fill in your values:

```bash
cd apps/nemt
cp .env.example .env
# Edit .env with your Firebase config
```

## Multi-Tenancy (NEMT)

The NEMT app implements full multi-tenant data isolation:

1. **Application Layer** — All Firestore queries include `where('companyId', '==', companyId)``
2. **Database Layer** — Firestore security rules validate `companyId` on every read/write
3. **Auto-Provisioning** — First-time users get a company auto-created for them
4. **Admin Panel** — Available at `/admin` for creating companies and managing users

## Deploying to Vercel

Each app deploys independently. In Vercel:

1. Import the GitHub repo
2. Set **Root Directory** to the app's path (e.g., `apps/nemt`)
3. Set environment variables in Vercel project settings
4. Vercel auto-detects Vite/Next.js and deploys on every push

| Vercel Project | Root Directory | Framework |
|---------------|----------------|-----------|
| nemt-dispatch | `apps/nemt` | Vite |
| nutrimoment | `apps/nutrimoment` | Vite → Next.js (planned) |
| realestate-ai | `apps/realestate` | Next.js (planned) |
| mina-energy | `apps/mina-energy` | Static (Other) |

## Security

- **Firebase keys** are loaded from environment variables, never committed to source
- **Firestore rules** enforce tenant isolation at the database level — see `apps/nemt/firestore.rules`
- **HIPAA considerations**: NEMT handles patient data. Each company's data is isolated by `companyId` in every document and enforced in Firestore security rules

## Shared Packages

The `packages/shared` workspace (`@mcstudio/shared`) will hold:
- Firebase initialization patterns
- Gemini API utility functions
- Common TypeScript types
- Shared UI components (as needed)

To use in an app:
```json
// apps/nemt/package.json
{
  "dependencies": {
    "@mcstudio/shared": "*"
  }
}
```

## License

Proprietary — All rights reserved.
