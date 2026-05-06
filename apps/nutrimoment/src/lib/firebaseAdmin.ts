import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

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

function getStorageBucketName() {
  const adminBucket = cleanEnvValue(process.env.FIREBASE_ADMIN_STORAGE_BUCKET);
  if (adminBucket) return adminBucket;

  const publicBucket = cleanEnvValue(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  if (publicBucket) return publicBucket;

  const projectId =
    cleanEnvValue(process.env.FIREBASE_ADMIN_PROJECT_ID) ??
    cleanEnvValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  return projectId ? `${projectId}.appspot.com` : publicBucket;
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
      }),
      storageBucket: getStorageBucketName()
    });
  }
}

export function getAdminDb() {
  ensureAdminApp();
  const databaseId = cleanEnvValue(process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID);
  return databaseId ? getFirestore(databaseId) : getFirestore();
}

export function getAdminAuth() {
  ensureAdminApp();
  return getAuth();
}

export function getAdminStorageBucket() {
  ensureAdminApp();

  const bucketName = getStorageBucketName();
  if (!bucketName) {
    throw new Error("Firebase Storage bucket is not configured.");
  }

  return getStorage().bucket(bucketName);
}
