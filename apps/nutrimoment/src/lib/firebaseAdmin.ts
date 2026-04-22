import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getPrivateKey() {
  const value = cleanEnvValue(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
  if (!value) return undefined;

  const normalized = value.replace(/\\n/g, "\n");
  const begin = normalized.indexOf("-----BEGIN PRIVATE KEY-----");
  const endMarker = "-----END PRIVATE KEY-----";
  const end = normalized.indexOf(endMarker);

  if (begin >= 0 && end >= begin) {
    return normalized.slice(begin, end + endMarker.length);
  }

  return normalized.trim();
}

function cleanEnvValue(value: string | undefined) {
  if (!value) return undefined;
  return value.trim().replace(/^"/, "").replace(/",?$/, "").replace(/,$/, "");
}

export function hasFirebaseAdminConfig() {
  return Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );
}

function ensureAdminApp() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error(
      "Firebase Admin credentials are not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY in apps/nutrimoment/.env.local."
    );
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: cleanEnvValue(process.env.FIREBASE_ADMIN_PROJECT_ID),
        clientEmail: cleanEnvValue(process.env.FIREBASE_ADMIN_CLIENT_EMAIL),
        privateKey: getPrivateKey()
      })
    });
  }
}

export function getAdminDb() {
  ensureAdminApp();
  return getFirestore();
}

export function getAdminAuth() {
  ensureAdminApp();
  return getAuth();
}
