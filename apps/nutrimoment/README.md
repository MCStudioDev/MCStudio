# NutriMoment

NutriMoment is a Next.js nutrition app that is being migrated from an AI-first runtime to an offline-first recipe engine.

Current capabilities include:
- fridge and pantry scanning
- offline catalog-backed recipe retrieval
- offline catalog-backed meal planning
- pantry persistence
- pantry image scan review with editable approximate quantities
- profile-aware ranking inputs
- cuisine-aware results, including Egyptian, Middle Eastern, and Mediterranean coverage
- persisted current weekly plan
- quantity-aware shopping lists that subtract pantry stock
- scan and recipe history (server-side `/api/history` returns the latest 50 sessions)
- Arabic UI support with RTL layout
- in-app legal/safety notices and legal pages
- shared recipe photos: all users reuse validated Replicate photos persisted with V2 recipes; eligible generation requests create missing photos through Replicate (`flux-schnell` by default)
- server-enforced free-tier quotas: 10 lifetime AI credits and 3 lifetime weekly meal plans per Firebase user

## Development

Run the app locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Architecture and Deployment

The canonical architecture, pipeline, tier workflow, deployment requirements, verification commands, audit baseline, and maturity plan are maintained in:

- `docs/NUTRIMOMENT_ARCHITECTURE.md`

Before sharing the app publicly, run:

```bash
npm run predeploy:check
```

From the monorepo root, the same check is available as:

```bash
npm run predeploy:nutrimoment
```

## Firestore Security Rule Tests

Run the security-rule test suite against the Firebase Local Emulator Suite:

```bash
npm run test:rules
```

Prerequisites: Java (the emulator runs on the JVM) and `firebase-tools` (`npm install -g firebase-tools`). The script wraps vitest with `firebase emulators:exec`, which starts a Firestore emulator on port 8080, runs the tests, and stops the emulator on exit.

The tests cover owner / admin / unauthenticated access across every rule path in `firestore.rules`. They do not connect to your real project — they spin up a disposable in-memory Firestore instance.

To type-check the test file without running the emulator:

```bash
npx tsc --noEmit -p tsconfig.test.json
```

## Offline Catalog Seed

Generate the offline catalog manifest:

```bash
npm run seed:offline-catalog
```

If Firebase Admin credentials are configured in `.env.local`, the same script will also import the offline catalog into Firestore collections:
- `recipes`
- `ingredients`
- `ingredientAliases`
- `ingredientRecipeIndex`

### Required admin env vars

```env
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Without those values, the seed script safely falls back to manifest generation only.

## Key Files

- Architecture, pipeline, operations, and maturity: `docs/NUTRIMOMENT_ARCHITECTURE.md`
- Client Firebase config: `src/config/firebase.ts`
- Firebase Admin helper: `src/lib/firebaseAdmin.ts`
- Offline data seed source: `src/data/offline`
- Pantry quantity normalization: `src/lib/pantryQuantity.ts`
- Weekly meal-plan persistence hook: `src/hooks/useMealPlan.ts`
- Replicate generation: `src/lib/replicateRecipeImage.ts`
- Legal pages: `src/app/legal`
