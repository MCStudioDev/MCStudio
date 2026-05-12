# Deployment Environment Checklist

Use this when filling Vercel Project Settings -> Environment Variables.

## Firebase Web

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIRESTORE_DATABASE_ID` - usually `(default)`
- `NEXT_PUBLIC_APP_URL` - final Vercel or custom production URL, for example `https://your-app.vercel.app`

## Firebase Admin

- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

Use the exact private key from the Firebase service account JSON. Keep the surrounding quotes when storing it in `.env.local`; in Vercel, paste the full value with newline escapes if needed.

## AI And Images

- `GEMINI_API_KEY` - text and vision flows
- `UNSPLASH_ACCESS_KEY` - free-tier recipe photo search (and required by `validate:prod-env`)
- `PEXELS_API_KEY` - optional fallback for free-tier photo search
- `REPLICATE_API_TOKEN` - **required for premium recipe-image generation**. Without it, premium users will fall through to "no exact photo" instead of receiving Replicate-generated images.
- `REPLICATE_IMAGE_MODEL` - optional, default `black-forest-labs/flux-schnell`. Override if you want a different Replicate model.
- `REPLICATE_IMAGE_INPUT_JSON` - optional JSON blob of extra Replicate `input` overrides (e.g. `output_format`, `aspect_ratio`).
- `LOG_LEVEL` - optional, use `info` for production
- `USE_MOCK_API=true` - local/demo mode only; never set in production

Note: `REPLICATE_API_TOKEN` and `REPLICATE_IMAGE_MODEL` are not currently checked by `validate:prod-env` or `/api/healthz`. Verify them manually before launch.

## Local Verification

From the repository root:

```bash
npm run validate:nutrimoment-env
```

From the app directory:

```bash
npm run validate:prod-env
```

The check must pass before running the full predeploy command.
