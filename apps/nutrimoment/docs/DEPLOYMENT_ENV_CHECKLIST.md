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

- `GEMINI_API_KEY`
- `UNSPLASH_ACCESS_KEY`
- `PEXELS_API_KEY` - optional fallback
- `LOG_LEVEL` - optional, use `info` for production

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
