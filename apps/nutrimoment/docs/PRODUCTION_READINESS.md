# NutriMoment Production Readiness

Last reviewed: 2026-05-11
Status: entering production testing.

## Status Snapshot

| Area | State | Notes |
| --- | --- | --- |
| Auth (server) | OK | Firebase Admin verifies ID tokens through `authService`. |
| Input validation | OK | Zod schemas on API `POST` routes. |
| Firestore rules | OK | User isolation and role-protected writes in `firestore.rules`; deny-by-default catch-all at the bottom. |
| Secrets | OK | Runtime env only; no hardcoded API keys. |
| Security headers | OK | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy in `next.config.ts`. CSP allow-lists Replicate delivery hosts. |
| Image hosts | OK | Unsplash, Pexels, Wikimedia, Google CDN, Firebase Storage, and Replicate delivery allowlisted. |
| Structured logging | OK | API/service logging uses `src/lib/logger.ts`. |
| Rate limiting | **Weak** | Fixed-window limiter is **in-memory per instance** — it does not protect across Vercel serverless instances. See weak points #2. |
| Health checks | OK | `GET /api/healthz` now surfaces Gemini, Firebase Admin, `NEXT_PUBLIC_APP_URL`, free-tier photo providers, Replicate, and a `mockMode` danger flag for `USE_MOCK_API=true` in production. |
| Env validation | OK | `validate:prod-env` warns when `REPLICATE_API_TOKEN` / `REPLICATE_IMAGE_MODEL` are unset and fails outright if `USE_MOCK_API=true`. `.env.example` lists all Replicate vars. |
| SEO hygiene | OK | App Router `robots.ts` and `sitemap.ts` present. |
| Mock-mode safety | OK | `src/lib/openai.ts` throws at startup when `NODE_ENV=production` and `USE_MOCK_API=true`. |
| Tests | Missing | No unit, integration, or E2E coverage yet. |
| Error tracking | Missing | No Sentry/equivalent wired up yet. |
| Cost controls | OK | Per-user daily Replicate generation counter at `users/{uid}/usage/replicateImages` plus global on/off flag at `globalControls/replicateImages`. Server-side Replicate billing cap is still the recommended backstop. See operator notes below. |
| Legacy/overlapping routes | **Weak** | `recipes` and `analyze-image` still exist alongside the live `generate-recipes` and `scan`. (`debug/` directory removed in 2026-05-11 pass.) See weak points #6. |
| Premium photo resilience | OK | When Replicate fails or is capped for a canonical dish, the recipe-photo route falls through to the search-mode pipeline. Non-canonical recipes still get a 503 retry. Server-side Replicate billing cap is still recommended. |
| Firestore rules tests | Harness shipped (unverified) | Vitest + `@firebase/rules-unit-testing` suite at `src/__tests__/firestore-rules.test.ts`. Requires Java + `firebase-tools` to execute. Type-checked locally; awaiting first end-to-end run. |

## Production Weak Points (Open Before Public Launch)

These are the items most likely to bite NutriMoment in production. They are documentation-only flags — no code changes were made while compiling them. Severity column reflects the operational risk if the app goes public without addressing the item.

| # | Weakness | Severity | Detail | Status / Suggested action |
|---|---|---|---|---|
| 1 | `REPLICATE_API_TOKEN` is not validated at deploy time | High | `src/lib/replicateRecipeImage.ts` reads `process.env.REPLICATE_API_TOKEN`. Without it, premium recipe photos silently degrade to "no exact photo". | **Closed (2026-05-11):** added to `.env.example`, surfaced as an optional check (with explicit warning) in `scripts/validate-production-env.ts`, and reflected in `/api/healthz` under `premiumImageGeneration`. Token is still not *strictly required* for build to pass — a deploy without it just runs the search-mode fallback for everyone — but the operator now sees the gap. |
| 2 | Rate limiter is per-instance in-memory only | High | `src/services/rateLimitService.ts` uses a `Map` keyed by `bucketKey`. On Vercel serverless each instance has its own map, so a sustained attacker can multiply their effective budget by the number of warm instances. Hits expensive routes: `generate-recipes`, `mealplan`, `analyze-image`, `scan`, `scan/process`, `recipe-photo`. | **Open.** Swap the backing store for Upstash Redis or Vercel WAF rate rules. The route call sites already have a `consume(bucketKey, config)` contract — a Redis-backed adapter is a drop-in replacement. |
| 3 | No cost cap on Replicate generation | High | The recipe-photo route generates one or more Replicate images per premium-tier miss. Without an in-app cap, a leaked premium account or curiosity-driven attacker can burn the Replicate balance unbounded within in-memory limits. | **Closed (2026-05-11):** added `src/services/replicateCostCapService.ts`. Per-uid daily counter at `users/{uid}/usage/replicateImages` (default 20/day, override via `REPLICATE_DAILY_LIMIT_PER_USER` env or `globalControls/replicateImages.dailyLimitPerUser`). Global kill switch at `globalControls/replicateImages.enabled = false`. Admins bypass per-user cap but still honor global flag. When capped, premium users gracefully degrade to search-mode photos. Counter only increments on fresh generations (`imageSource === "api" && source === "generated"`); cache hits do not consume budget. Still recommended: set a Replicate monthly billing cap server-side as the hard backstop. |
| 4 | `/api/healthz` does not reflect required image-provider config | Medium | The probe returns `ok` even when no Unsplash/Pexels key is set, when `REPLICATE_API_TOKEN` is missing, when `NEXT_PUBLIC_APP_URL` is missing, or when mock mode is on. | **Closed (2026-05-11):** probe now reports `aiProvider`, `firebaseAdmin`, `appUrl`, `recipePhotosFreeTier`, `premiumImageGeneration`, and `mockMode`. Missing free-tier provider, missing app URL, or `mockMode=danger` flips overall status to 503. |
| 5 | No automated test coverage | Medium | Ranking, ingredient normalization, pantry math, the rate limiter, the access guard, the recipe-photo identity gate, and Arabic localization all rely on manual smoke tests. Regressions are easy to ship. | **Open.** Add a Vitest unit suite first (`src/lib/*`, `src/services/*` pure logic). Add Playwright after auth-aware smoke is repeatable. |
| 6 | Legacy / overlapping API routes still on disk | Medium | `src/app/api/recipes/route.ts` and `src/app/api/analyze-image/route.ts` duplicate the live `generate-recipes` and `scan` flows. | **Partially closed (2026-05-11):** empty `src/app/api/debug/` directory removed. Legacy `recipes` and `analyze-image` still in tree pending consolidation decision. Until then, both have rate limiting identical to the live routes. |
| 7 | No error tracker | Medium | `logger.error` writes structured JSON to stdout; nothing forwards it. Production errors are only visible by tailing Vercel logs. | **Open.** Add Sentry (or Logtail / Axiom), forward `logger.error`, and upload Next.js source maps in CI. |
| 8 | Firestore rules audit is informal | Medium | The rules look correct (deny-by-default catch-all, owner/admin gates) but no automated test asserts that, for example, a free user cannot bump their own `aiCreditsUsed` to a negative number via a profile update or read another user's `entitlements` document. | **Harness shipped (2026-05-11):** `src/__tests__/firestore-rules.test.ts` covers `users/{uid}` profile (no role/tier/aiCredits writes), `users/{uid}/usage` (owner-read / admin-write), `users/{uid}/pantry|history|plans` (owner-only), `entitlements` (owner-read / admin-write), `globalControls` (auth-read / admin-write), public catalog (read-anywhere / write-nowhere), `recipePhotoCache` (auth-read / server-only-write), `scans` (uid-bound), `metrics` (admin-only), and the catch-all deny. Run with `npm run test:rules` from `apps/nutrimoment`. Prerequisites: Java + `firebase-tools` installed globally (`npm install -g firebase-tools`). The npm script wraps vitest with `firebase emulators:exec`. Tests have been type-checked (`tsc -p tsconfig.test.json`) but not executed end-to-end yet on the dev machine — verify on a Java-equipped machine or in CI before relying on them. |
| 9 | Single-vendor dependency on Replicate for premium photos | Medium | The whole premium photo experience leans on one provider. Outage, rate limit, or pricing change = product regression for the highest-value users. | **Closed (2026-05-11):** when Replicate fails for a premium user on a canonical dish (`baseIdentity.canonicalDishKey` set), `performRecipePhotoLookup` now falls through to the existing search-mode pipeline (Wikimedia allow-list → Unsplash → Pexels) instead of returning a 503 retry. The existing strict identity gates and `MIN_ACCEPTED_PROVIDER_SCORE` thresholds reject weak matches, so the worst case stays at "no exact photo" — same as before. Non-canonical recipes still get the fast 503 retry (search-mode would only return weak matches anyway). Server-side cache segregation (`canUseCachedRecipePhotoForVisualRequest` for the Replicate path) prevents the fallback from poisoning the premium cache. Log lines tag the served event with `replicateFailedWithFallback: true` for observability. Remaining gap: no second-vendor generator yet (e.g., a Gemini Imagen path), so during a full Replicate outage non-canonical recipes still show "no exact photo". |
| 10 | History endpoint loads up to 50 docs unbounded by time | Low | `GET /api/history` pulled every history doc, sorted in memory, and sliced to 50. For long-lived users this scanned the whole collection on every call. | **Closed (2026-05-11):** route now uses `historyRef.orderBy("createdAt", "desc").limit(50)`. Falls back to the old in-memory sort only when the Firestore query throws (legacy docs without `createdAt`). |
| 11 | Logs and dev artifacts checked in at app root | Low | `dev-server.log`, `dev-server.err.log`, `firebase-debug.log` exist at `apps/nutrimoment/` and risk PII leakage if zipped into a release artifact. | **Closed (2026-05-11):** `apps/nutrimoment/.gitignore` now explicitly covers `firebase-debug.log*`, `dev-server.log`, `dev-server.err.log`, and `output/`. |
| 12 | `tsconfig.tsbuildinfo` committed checks may drift | Low | Build artifact present at `apps/nutrimoment/tsconfig.tsbuildinfo`. | **Closed (2026-05-11):** verified gitignored via `*.tsbuildinfo` in `apps/nutrimoment/.gitignore`. |
| 13 | `src/lib/googleImagen.ts` is dead code | Low | Earlier Gemini-image-generation helper. | **Closed (2026-05-11):** removed after grep confirmed no code references. |
| 14 | Free users can generate 3 weekly meal plans (was "premium-only" in older docs) | Low/UX | Code grants `FREE_LIFETIME_WEEKLY_PLANS = 3` to free users; earlier docs and marketing called meal plans "premium-only". | **Closed (2026-05-11):** product decision is to keep the 3-trial behavior as a free hook into premium. Code is unchanged. Docs (`SRS.md`, `V-DIAGRAM.md`, `PRODUCT.md`, `MATURITY-PLAN.md`, `PUBLIC_DEPLOYMENT_GUIDE.md`, `README.md`) now describe meal plans as "3 lifetime trial plans for free users; unmetered for premium/admin". UI strings (`freeMealPlanNotice` / `premiumMealPlanNotice` in `translations.ts`) already reflect the trial-style policy correctly. |
| 15 | Mock-mode flag is a single env var | Low | `USE_MOCK_API=true` flips real routes to canned responses with no audit log. | **Closed (2026-05-11):** `src/lib/openai.ts` now throws at startup when `NODE_ENV=production` and `USE_MOCK_API=true`; `validate:prod-env` fails the same case; `/api/healthz` reports `mockMode: danger`. |

## Implemented In Previous Production Passes

- Rate-limit coverage on `POST /api/scan`, `POST /api/scan/process`, `POST /api/recipes`, `POST /api/generate-recipes`, `POST /api/mealplan`, `POST /api/analyze-image`, and `GET /api/recipe-photo`.
- Structured JSON logger via `src/lib/logger.ts`; direct `console.*` use removed from API/service code.
- `GET /api/healthz` with `Cache-Control: no-store`.
- `robots.txt` and `sitemap.xml` via App Router metadata routes.
- `.env.example` covering Firebase, Gemini, Unsplash, Pexels, `LOG_LEVEL`, and `NEXT_PUBLIC_APP_URL` (still missing `REPLICATE_*` — see weak point #1).
- `npm run predeploy:check` for lint, build, and production env validation.
- `firebase.json` for Firestore-rules deployment.
- `docs/PUBLIC_DEPLOYMENT_GUIDE.md` and `docs/DEPLOYMENT_ENV_CHECKLIST.md`.
- Replicate generation pipeline for premium recipe photos (`src/lib/replicateRecipeImage.ts`), including shared-cache reuse, exact-alias dedupe, and CSP/image-host allow-listing for `replicate.delivery`.
- `GET /api/history` server route returning the latest 50 history entries per user.

## Replicate Cost Cap — Operator Notes

The recipe-photo route gates every Replicate generation through `src/services/replicateCostCapService.ts`. Two layers of control:

### Global kill switch (`globalControls/replicateImages`)

Single Firestore document. Fields:

| Field | Type | Effect |
| --- | --- | --- |
| `enabled` | boolean | `false` blocks all Replicate calls system-wide. Defaults to `true` when the doc is missing or the field is absent. |
| `dailyLimitPerUser` | number (optional) | Overrides the env-driven default per-user daily cap. |
| `updatedAt` | timestamp | Audit field. |

Auth model: any signed-in user can **read** (so the UI can surface a "premium photos paused" message later); only admin custom claims can **write**. Service-account writes from the admin SDK always bypass rules.

The control doc is cached in-process for 60 seconds. Flips take effect within a minute across all warm instances. To force an immediate re-read, restart the deployment or wait for the TTL.

To stop spending right now:

```bash
# Using firebase CLI as an admin user, or via the Firebase console:
# Set globalControls/replicateImages = { enabled: false, updatedAt: <serverTimestamp> }
```

When `enabled === false`, premium users gracefully fall through to the search-mode photo pipeline (Unsplash → Pexels → allow-listed Wikimedia → `no exact photo`). Admins also fall through — this is intentional so a misclick on a personal admin account does not turn the switch back on by accident.

### Per-user daily cap

Counter doc per user: `users/{uid}/usage/replicateImages`. Fields:

| Field | Type | Effect |
| --- | --- | --- |
| `count` | number | Number of paid Replicate generations on `day`. |
| `day` | string (`YYYY-MM-DD`, UTC) | Rollover boundary. |
| `limit` | number | Cap at time of last increment (for diagnostics only — live cap comes from env / global doc). |
| `updatedAt` | timestamp | Audit field. |

Default: 20 generations per UTC day per user. Override priority: `globalControls/replicateImages.dailyLimitPerUser` > `REPLICATE_DAILY_LIMIT_PER_USER` env > 20.

Admins are exempt. Counter only increments when Replicate actually generated a fresh image; in-memory and shared cache hits do not consume budget.

### Failure modes

- Firestore read failure on the global doc or the user counter → **fail open**, allow the request, warn-log. Rationale: a Firestore outage should not blank premium users; the server-side Replicate billing cap remains as the hard backstop.
- Firestore write failure on the increment → warn-log only; response is still returned to the user.

## Required Env At Deploy Time

Mandatory (checked by `npm run validate:prod-env`):

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

Conditionally required (not currently checked — see weak point #1):

- `REPLICATE_API_TOKEN` — required if any user has premium/admin access; without it premium recipe photos always degrade.

Optional:

- `PEXELS_API_KEY`
- `REPLICATE_IMAGE_MODEL` (defaults to `black-forest-labs/flux-schnell`)
- `REPLICATE_IMAGE_INPUT_JSON`
- `REPLICATE_DAILY_LIMIT_PER_USER` — integer daily cap on Replicate generations per non-admin user. Defaults to `20`. Overridable per-deployment by the `globalControls/replicateImages.dailyLimitPerUser` Firestore field.
- `LOG_LEVEL` (`debug`, `info`, `warn`, `error`; defaults to `info` in production)
- `USE_MOCK_API=true` for local/demo mode only — **never set in production** (see weak point #15)
- `DISABLE_USER_RECIPE_CACHE`, `DISABLE_SHARED_RECIPE_POOL` — operational kill-switches used by `generate-recipes`

## Launch Checklist

- [ ] Follow `docs/PUBLIC_DEPLOYMENT_GUIDE.md`.
- [ ] Fill Vercel env vars using `docs/DEPLOYMENT_ENV_CHECKLIST.md` (including `REPLICATE_API_TOKEN` if you offer premium image generation).
- [ ] Fill all mandatory production environment variables in Vercel.
- [ ] Manually confirm `REPLICATE_API_TOKEN` and `REPLICATE_IMAGE_MODEL` are present (validator does not catch a missing token — weak point #1).
- [ ] Set a Replicate monthly spend cap and Gemini billing alert.
- [ ] Confirm `REPLICATE_DAILY_LIMIT_PER_USER` (or `globalControls/replicateImages.dailyLimitPerUser`) is set to a number you are comfortable footing the bill for if every premium user hits it.
- [ ] Confirm an admin Firebase account can toggle `globalControls/replicateImages.enabled` — practice the kill-switch once before launch.
- [ ] Run `npm run predeploy:nutrimoment` from the repository root.
- [ ] Deploy latest `firestore.rules` with `firebase deploy --only firestore:rules --project your-project-id`.
- [ ] Seed the offline catalog with `npm run seed:offline-catalog` from `apps/nutrimoment`.
- [ ] Confirm production domain is added to Firebase authorized domains and Google OAuth client.
- [ ] Confirm `NEXT_PUBLIC_APP_URL` matches the production domain so sitemap/robots are correct.
- [ ] Confirm `/api/healthz` returns `200` in production (it will return `200` even if Replicate is misconfigured — manually verify premium photo flow separately).
- [ ] Trigger one recipe scan, one meal plan, and one premium recipe-photo request with real production credentials.
- [ ] Confirm a free-tier account hits the 10-credit and 3-weekly-plan walls cleanly.
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

- `recipeSources`
  - import registry and trust/licensing metadata for each external source
- `recipeRawImports`
  - raw imported recipe payloads before canonicalization or dedupe
- `recipeCanonicalStaging`
  - normalized and deduplicated recipes awaiting promotion into the serving catalog
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

### Real-Source 200K Roadmap

The practical path to `200K` recipes should be a real-source import pipeline, not hand-authored seeds.

Recommended weighting:

- `50K` Italian
- `45K` Middle Eastern
- `25K` Egyptian
- `80K` broader global coverage

Pipeline stages:

1. source registry
   - track provider, trust score, cuisine focus, language, license, and import priority
2. raw import storage
   - store fetched title, ingredients, steps, image URL, source URL, and fingerprint before normalization
3. canonical staging
   - normalize ingredients, language, cuisine, and duplicate keys before promotion
4. serving promotion
   - only write deduplicated, bilingual, metadata-rich recipes into `recipes`

Quality gates before promotion:

- must come from a real source with attribution
- must have a stable source URL or external ID
- must have enough ingredients and steps to be a real recipe
- must pass duplicate clustering
- must carry both `localized.English` and `localized.Arabic`
- must carry health and search metadata

The current importer should keep expanding by adapters, starting with sources that are strongest for Italian, Egyptian, and Middle Eastern cuisines, then wider global coverage after ranking quality is validated.

### Execution Checklist

- [ ] Expand `RecipeCatalogDoc` with richer optional metadata.
- [ ] Define canonical ingredient taxonomy and health-tag taxonomy.
- [ ] Build bilingual + dialect ingredient alias seed lists.
- [ ] Add region-aware ingredient variants for Egyptian, Levantine, Gulf, and generic MSA Arabic.
- [ ] Add image signatures / shared cache keys to recipe docs.
- [ ] Write seeding scripts for canonical recipes plus indexes.
- [ ] Add retrieval tests for English, Arabic, and dialect terms such as `لحمة`, `فراخ`, and `بطاطس`.
- [ ] Validate offline ranking quality before increasing catalog size aggressively.
