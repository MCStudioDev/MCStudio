# NutriMoment Production Readiness

Last reviewed: 2026-04-25

## Status Snapshot

| Area | State | Notes |
| --- | --- | --- |
| Auth (server) | OK | Firebase Admin verifies ID tokens through `authService`. |
| Input validation | OK | Zod schemas on API `POST` routes. |
| Firestore rules | OK | User isolation and role-protected writes are documented in `firestore.rules`. |
| Secrets | OK | Runtime env only; no hardcoded API keys. |
| Security headers | OK | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy in `next.config.ts`. |
| Image hosts | OK | Unsplash, Pexels, Wikimedia, Google CDN, and Firebase Storage allowlisted. |
| Structured logging | OK | API/service logging uses `src/lib/logger.ts`; direct console use remains only inside the logger. |
| Rate limiting | OK | In-app fixed-window limiter covers recipe generation, meal planning, image scans, and recipe-photo lookup. |
| Health checks | OK | `GET /api/healthz` reports required provider config and returns `503` when required config is missing. |
| SEO hygiene | OK | App Router `robots.ts` and `sitemap.ts` added. |
| Tests | Missing | No unit, integration, or E2E coverage yet. |
| Error tracking | Missing | No Sentry/equivalent wired up yet. |

## Implemented In This Production Pass

- Added missing rate-limit coverage to `POST /api/scan`, `POST /api/recipes`, and `GET /api/recipe-photo`.
- Kept existing rate-limit coverage on `POST /api/generate-recipes`, `POST /api/mealplan`, `POST /api/analyze-image`, and `POST /api/scan/process`.
- Replaced remaining API/service `console.*` calls with the structured JSON logger.
- Added `GET /api/healthz` with `Cache-Control: no-store`.
- Added `robots.txt` and `sitemap.xml` via Next.js App Router metadata routes.
- Updated `.env.example` with `NEXT_PUBLIC_APP_URL`, `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`, and `LOG_LEVEL`.
- Added `npm run predeploy:check` for lint, build, and production env validation.
- Added `firebase.json` so Firestore rules can be deployed from `apps/nutrimoment`.
- Added `docs/PUBLIC_DEPLOYMENT_GUIDE.md` for Firebase, Vercel, API keys, catalog seed, and free-credit launch flow.
- Added `docs/DEPLOYMENT_ENV_CHECKLIST.md` for Vercel environment variable setup.

## Required Env At Deploy Time

Mandatory:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIRESTORE_DATABASE_ID`
- `NEXT_PUBLIC_APP_URL`
- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`
- `GEMINI_API_KEY`
- `UNSPLASH_ACCESS_KEY`

Optional:

- `PEXELS_API_KEY`
- `LOG_LEVEL` (`debug`, `info`, `warn`, `error`; defaults to `info` in production)
- `USE_MOCK_API=true` for local/demo mode only

## Launch Checklist

- [ ] Follow `docs/PUBLIC_DEPLOYMENT_GUIDE.md`.
- [ ] Fill Vercel env vars using `docs/DEPLOYMENT_ENV_CHECKLIST.md`.
- [ ] Fill all mandatory production environment variables in Vercel.
- [ ] Run `npm.cmd run predeploy:nutrimoment` from the repository root.
- [ ] Deploy latest `firestore.rules` with `firebase deploy --only firestore:rules --project your-project-id`.
- [ ] Seed the offline catalog with `npm run seed:offline-catalog` from `apps/nutrimoment`.
- [ ] Confirm production domain is added to Firebase authorized domains and Google OAuth client.
- [ ] Confirm `NEXT_PUBLIC_APP_URL` matches the production domain so sitemap/robots are correct.
- [ ] Confirm `/api/healthz` returns `200` in production.
- [ ] Trigger one recipe scan and one meal plan with real production credentials.
- [ ] Configure external uptime monitoring against `/api/healthz`.
- [ ] Configure Firestore backups/export policy.

## Remaining Work Before Public Launch

1. **Error tracking**
   - Add Sentry or similar.
   - Forward `logger.error` events.
   - Upload source maps during CI/CD builds.

2. **Automated tests**
   - Add Playwright smoke tests for sign-in, scanner upload, recipe generation, Arabic language switch, and meal-plan generation.
   - Add lightweight unit tests for prompt builders, Arabic localization, rate limiter, and meal-plan normalization.

3. **Distributed rate limiting**
   - Current limiter is in-memory and safe for single-instance/serverful deployments.
   - For multi-instance Vercel/serverless production, replace the backing store with Upstash Redis or Vercel WAF rate rules.

4. **Dependency audit**
   - Run `npm audit` before launch.
   - Plan any major dependency upgrades separately, especially Firebase packages.

## Offline Catalog Expansion Plan

### Goal

Build NutriMoment toward a large offline-first recipe system with:

- rich per-recipe metadata
- bilingual English/Arabic recipe storage
- dialect-aware ingredient indexing
- separate shared image cache
- strong offline ranking for pantry, cuisine, and health-condition matching

### Core Principle

The goal is not just "store many recipes." The goal is to store recipes in a way that makes offline search smart.

That means:

- one canonical recipe document
- two localized recipe variants (`English`, `Arabic`)
- rich search and health metadata
- ingredient lexicon normalization before ranking
- shared image references instead of one unique cached image per recipe

### Target Collections

Recommended Firestore / Storage shape:

- `recipes`
  - canonical recipe catalog documents
- `ingredientRecipeIndex`
  - canonical ingredient -> recipe ids
- `ingredientAliases`
  - raw user term / dialect term -> canonical ingredient
- `recipePhotoCache`
  - shared photo metadata by signature
- `users/{uid}/offlineRecipeCache`
  - user-specific cached recipes generated or touched in-app
- Firebase Storage `recipe-photo-cache/...`
  - only for generated or uploaded image assets when needed

### Canonical Recipe Document

Each recipe should keep the current shape and continue expanding toward:

- base identity
  - `id`, `title`, `slug`, `description`
- ingredients
  - `ingredients`
  - `ingredientCanonicals`
  - `requiredCanonicals`
  - `optionalCanonicals`
- nutrition
  - calories, protein, carbs, fat, fiber, sugar, sodium
  - calorie band
- experience metadata
  - `mealType`, `difficulty`, `prepMinutes`, `cookMinutes`, `totalMinutes`
- cuisine metadata
  - `cuisine`
  - `regionalCuisines`
  - `styleTags`
- health metadata
  - condition-safe tags
  - condition caution flags
  - nutrition claims like `high-protein`, `low-sodium`, `high-fiber`
- search metadata
  - generic `searchTokens`
  - alias tokens
  - cuisine tokens
  - ingredient variant entries by locale/region
- localization
  - `localized.English`
  - `localized.Arabic`
- image metadata
  - direct URL/path references
  - shared image signature
  - source query / cache key

### Rich Metadata Requirements

Rich metadata per recipe remains required. It is the foundation of the offline system.

Each recipe should eventually carry:

- health tags
  - `diabetes-friendly`
  - `low-sodium`
  - `high-protein`
  - `weight-loss-friendly`
  - `renal-friendly` where appropriate
- caution flags
  - `high-potassium`
  - `high-purine`
  - `contains-dairy`
  - `contains-gluten`
  - `contains-egg`
- style and context tags
  - `egyptian-home-style`
  - `street-food-inspired`
  - `grilled`
  - `one-pan`
  - `high-volume-low-calorie`

### Dialect-Aware Indexing

Indexing must normalize language variants, not just translate labels.

Examples:

- beef / meat
  - canonical: `beef`
  - English variants: `beef`, `meat`, `beef cubes`, `stew beef`
  - Arabic MSA variants: `لحم`, `لحم بقري`
  - Arabic dialect variants: `لحمة`, `لحمه`, `لحوم`
- chicken
  - canonical: `chicken breast`
  - English variants: `chicken`, `chicken breast`, `boneless chicken`
  - Arabic variants: `دجاج`, `فراخ`, `صدر دجاج`, `صدور دجاج`
- eggplant
  - canonical: `eggplant`
  - Arabic variants: `باذنجان`, `بتنجان`
- potato
  - canonical: `potato`
  - Arabic variants: `بطاطس`, `بطاطا`

The normalization pipeline should always resolve these variants to one canonical ingredient before retrieval and ranking.

### Image Strategy

Recipes and images should remain separate systems.

Why:

- recipe docs are content + metadata
- image cache docs are shared assets
- many similar recipes can reuse the same image cluster
- image storage cost must stay independent from recipe growth

Recipe docs should store:

- `image.storagePath`
- `image.thumbPath`
- `image.signature`
- `image.sharedCacheKey`

Shared image cache should store:

- resolved image URL
- attribution name / URL
- source (`generated`, `unsplash`, `pexels`, `wikimedia`, etc.)
- query used
- signature
- optional cuisine/style tags for future reuse heuristics

### Scaling Plan

Do not jump directly to 1M recipes as a first migration.

Phase 1:

- expand the canonical schema
- expand ingredient aliases for English, Arabic, and dialects
- improve health metadata coverage
- improve image signature reuse

Phase 2:

- seed `10k-50k` high-quality canonical recipes
- validate ranking quality for pantry search and health filtering
- validate Arabic and dialect matching

Phase 3:

- scale toward `100k+` recipes
- add structured style/cuisine variants
- add broader region-aware indexing

Phase 4:

- consider synthetic expansion toward `1M` if quality, storage cost, and ranking remain strong

### Execution Checklist

- [ ] Expand `RecipeCatalogDoc` with richer optional metadata.
- [ ] Define canonical ingredient taxonomy and health-tag taxonomy.
- [ ] Build bilingual + dialect ingredient alias seed lists.
- [ ] Add region-aware ingredient variants for Egyptian, Levantine, Gulf, and generic MSA Arabic.
- [ ] Add image signatures / shared cache keys to recipe docs.
- [ ] Write seeding scripts for canonical recipes plus indexes.
- [ ] Add retrieval tests for English, Arabic, and dialect terms such as `لحمة`, `فراخ`, and `بطاطس`.
- [ ] Validate offline ranking quality before increasing catalog size aggressively.
