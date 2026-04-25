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
