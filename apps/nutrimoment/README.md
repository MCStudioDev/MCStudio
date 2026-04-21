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
- scan and recipe history
- Arabic UI support with RTL layout
- in-app legal/safety notices and legal pages
- public web recipe photo hydration without AI image generation

## Development

Run the app locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

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

- Offline engine spec: `docs/OFFLINE-ENGINE-SPEC.md`
- Client Firebase config: `src/config/firebase.ts`
- Firebase Admin helper: `src/lib/firebaseAdmin.ts`
- Offline data seed source: `src/data/offline`
- Pantry quantity normalization: `src/lib/pantryQuantity.ts`
- Weekly meal-plan persistence hook: `src/hooks/useMealPlan.ts`
- Legal pages: `src/app/legal`
