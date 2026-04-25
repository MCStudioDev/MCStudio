# NutriMoment Public Deployment Guide

This guide is optimized for the current low-cost launch path:

- Hosting: Vercel Hobby for a personal/non-commercial public beta.
- Auth and database: Firebase Spark.
- AI: Gemini API free tier while traffic is small.
- Photos: Unsplash access key, with optional Pexels fallback.

If the app becomes commercial, upgrade Vercel to Pro before accepting paid usage, ads, sponsors, or client work.

## What Users Get

Users sign in with any Google account once Firebase Google Auth is enabled and the production domain is authorized.

The current free AI model is lifetime-based, not daily:

- Each Firebase user ID starts with 5 lifetime AI credits.
- The same Google account keeps the same credit history.
- A different Google account creates a different Firebase user and gets its own credits.
- Premium/admin access is granted manually through the admin script or admin UI.

## 1. Create Firebase

1. Create a Firebase project.
2. Add a Web app in Firebase project settings.
3. Enable Authentication -> Sign-in method -> Google.
4. Create a Firestore database. Use `(default)` unless you intentionally create a named database.
5. Set `NEXT_PUBLIC_FIRESTORE_DATABASE_ID` to the exact database ID, usually `(default)`.
6. Enable Firebase Storage if you plan to store scanned images.
7. In Authentication -> Settings -> Authorized domains, add:
   - `localhost` for local testing.
   - Your Vercel domain after the first deploy.
   - Your custom domain if you add one later.

## 2. Create Firebase Admin Credentials

1. Open Firebase project settings -> Service accounts.
2. Generate a new private key.
3. Copy these values into local `.env.local` and Vercel environment variables:
   - `FIREBASE_ADMIN_PROJECT_ID`
   - `FIREBASE_ADMIN_CLIENT_EMAIL`
   - `FIREBASE_ADMIN_PRIVATE_KEY`

Keep the private key server-only. Never expose it with `NEXT_PUBLIC_`.

## 3. Create API Keys

1. Create a Gemini API key in Google AI Studio.
2. Create an Unsplash access key.
3. Optional: create a Pexels API key as a fallback photo source.

Add the keys to `.env.local` and Vercel:

```env
GEMINI_API_KEY=...
UNSPLASH_ACCESS_KEY=...
PEXELS_API_KEY=...
```

Use `docs/DEPLOYMENT_ENV_CHECKLIST.md` as the copy/paste checklist when filling Vercel environment variables.

## 4. Validate Local Production Setup

From `apps/nutrimoment`, run:

```bash
npm run validate:prod-env
```

Before launch, run the full predeploy check:

```bash
npm run predeploy:check
```

This runs lint, build, and required production environment validation.

## 5. Deploy Firestore Rules

Install Firebase CLI if needed:

```bash
npm install -g firebase-tools
firebase login
```

From `apps/nutrimoment`, deploy only Firestore rules:

```bash
firebase deploy --only firestore:rules --project your-project-id
```

## 6. Seed Recipe Catalog

From `apps/nutrimoment`, with Firebase Admin env vars configured:

```bash
npm run seed:offline-catalog
```

This generates the local manifest and imports the public read-only recipe catalog into Firestore.

## 7. Deploy on Vercel

Recommended Vercel settings:

- Framework Preset: Next.js
- Root Directory: `apps/nutrimoment`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: leave default
- Node.js Version: 20 or newer

Add all required variables from `.env.example` in Vercel Project Settings -> Environment Variables.

After the first deploy:

1. Copy the Vercel production URL.
2. Set `NEXT_PUBLIC_APP_URL` to that exact URL.
3. Redeploy so sitemap and metadata use the public URL.
4. Add the Vercel domain to Firebase authorized domains.

If Vercel has trouble with the workspace layout, use repository root as the Vercel root instead:

- Root Directory: repository root
- Build Command: `npm run build:nutrimoment`
- Output Directory: `apps/nutrimoment/.next`

## 8. Create Admin or Premium Users

After the user signs in once, promote them from `apps/nutrimoment`:

```bash
npm run set:user-access -- user@example.com premium admin
```

For premium without admin:

```bash
npm run set:user-access -- user@example.com premium user
```

Ask the user to sign out and sign back in after changing access.

## 9. Smoke Test

Test these before sharing publicly:

- `https://your-domain.com/api/healthz`
- `https://your-domain.com/robots.txt`
- `https://your-domain.com/sitemap.xml`
- Google sign-in with a normal account.
- Pantry scan upload.
- Recipe generation.
- Arabic UI and Arabic meal/recipe output.
- Free account reaches the 5-credit limit.
- Premium account can access premium meal planning.

## Launch Notes

Keep Gemini usage server-side only. The app already keeps `GEMINI_API_KEY` off the browser, which protects the key better than public client-side usage.

For a real commercial launch, move from the free beta stack to paid production plans and add billing alerts before increasing traffic.

## Official References

- Vercel Hobby plan: https://vercel.com/docs/accounts/plans/hobby
- Firebase pricing plans: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Gemini API pricing: https://ai.google.dev/pricing
- Gemini API rate limits: https://ai.google.dev/gemini-api/docs/quota
