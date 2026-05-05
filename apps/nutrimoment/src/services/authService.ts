import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";

export type AccessRole = "admin" | "user";
export type AccessTier = "free" | "premium";
export type AiFeatureKey = "image_to_text" | "recipe_generation" | "recipe_image" | "weekly_plan";

export const FREE_LIFETIME_AI_CREDITS = 5;
const FIREBASE_TRANSIENT_RETRY_ATTEMPTS = 5;
const ACCESS_CACHE_TTL_MS = 10 * 60 * 1000;
const accessCache = new Map<string, { access: RequestAccess; expiresAt: number }>();

export class AccessError extends Error {
  constructor(
    message: string,
    public status = 401
  ) {
    super(message);
  }
}

export interface RequestAccess {
  uid: string;
  email: string | null;
  role: AccessRole;
  tier: AccessTier;
  isAdmin: boolean;
  isPremium: boolean;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  aiCreditsRemaining: number;
}

export function isFirebaseTransientError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
  const message = error instanceof Error ? error.message : String(error);

  return (
    status === 429 ||
    status === 503 ||
    /RESOURCE_EXHAUSTED|Quota exceeded|deadline exceeded|UNAVAILABLE|too many requests|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(message)
  );
}

export function getFirebaseAccessErrorMessage() {
  return "Firebase is temporarily busy, so recipe access is unavailable right now. Please try again in a few minutes.";
}

export async function getRequestAccess(request: Request): Promise<RequestAccess> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AccessError("Sign in is required to use this feature.", 401);
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const decoded = await withFirebaseTransientRetry(() => getAdminAuth().verifyIdToken(token), "verify auth token");
  const role = decoded.role === "admin" ? "admin" : "user";
  const tier = decoded.tier === "premium" ? "premium" : "free";
  const isAdmin = role === "admin";
  const isPremium = tier === "premium";

  if (isAdmin || isPremium) {
    return cacheAccess({
      uid: decoded.uid,
      email: decoded.email ?? null,
      role,
      tier,
      isAdmin,
      isPremium,
      aiCreditsUsed: 0,
      aiCreditsLimit: FREE_LIFETIME_AI_CREDITS,
      aiCreditsRemaining: FREE_LIFETIME_AI_CREDITS
    });
  }

  const db = getAdminDb();
  const usageRef = db.doc(`users/${decoded.uid}/usage/aiCredits`);
  let usageSnap;

  try {
    usageSnap = await withFirebaseTransientRetry(() => usageRef.get(), "read AI credit usage");
  } catch (error) {
    if (isFirebaseTransientError(error)) {
      const cached = getCachedAccess(decoded.uid);
      if (cached) {
        logger.warn("Serving cached access after transient Firebase usage read failure", {
          uid: decoded.uid,
          feature: "access_check",
          errorMessage: error instanceof Error ? error.message : String(error)
        });
        return cached;
      }

      logger.warn("Serving temporary free access after transient Firebase usage read failure", {
        uid: decoded.uid,
        feature: "access_check",
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      return cacheAccess({
        uid: decoded.uid,
        email: decoded.email ?? null,
        role,
        tier,
        isAdmin,
        isPremium,
        aiCreditsUsed: FREE_LIFETIME_AI_CREDITS - 1,
        aiCreditsLimit: FREE_LIFETIME_AI_CREDITS,
        aiCreditsRemaining: 1
      });
    }
    throw error;
  }

  const usageData = usageSnap.data();
  const aiCreditsUsed = Number(usageData?.lifetimeUsed ?? 0);

  return cacheAccess({
    uid: decoded.uid,
    email: decoded.email ?? null,
    role,
    tier,
    isAdmin,
    isPremium,
    aiCreditsUsed,
    aiCreditsLimit: FREE_LIFETIME_AI_CREDITS,
    aiCreditsRemaining: Math.max(FREE_LIFETIME_AI_CREDITS - aiCreditsUsed, 0)
  });
}

export async function requireUser(request: Request) {
  return getRequestAccess(request);
}

export async function requireAdmin(request: Request) {
  const access = await getRequestAccess(request);
  if (!access.isAdmin) {
    throw new AccessError("Admin access is required.", 403);
  }
  return access;
}

export async function requirePremium(request: Request) {
  const access = await getRequestAccess(request);
  if (!access.isPremium) {
    throw new AccessError("Premium access is required for this feature.", 403);
  }
  return access;
}

export async function canUseApiFeature(request: Request, featureKey: AiFeatureKey) {
  const access = await getRequestAccess(request);
  return {
    access,
    featureKey,
    allowed: access.isPremium || access.aiCreditsRemaining > 0,
    reason: access.isPremium || access.aiCreditsRemaining > 0 ? null : "free_ai_credits_exhausted"
  };
}

export async function consumeFreeAiCredit(access: RequestAccess, featureKey: AiFeatureKey) {
  if (access.isPremium || access.isAdmin) {
    return access;
  }

  if (access.aiCreditsRemaining <= 0) {
    throw new AccessError("Your free AI credits are used. Continue manually with offline recipes or upgrade to premium.", 402);
  }

  const db = getAdminDb();
  const usageRef = db.doc(`users/${access.uid}/usage/aiCredits`);
  try {
    await withFirebaseTransientRetry(
      () =>
        usageRef.set(
          {
            uid: access.uid,
            lifetimeLimit: FREE_LIFETIME_AI_CREDITS,
            lifetimeUsed: FieldValue.increment(1),
            lastFeature: featureKey,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        ),
      "consume AI credit"
    );
  } catch (error) {
    if (isFirebaseTransientError(error)) {
      logger.warn("Continuing after transient Firebase credit write failure", {
        uid: access.uid,
        featureKey,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      const nextAccess = {
        ...access,
        aiCreditsUsed: access.aiCreditsUsed + 1,
        aiCreditsRemaining: Math.max(access.aiCreditsRemaining - 1, 0)
      };
      cacheAccess(nextAccess);
      return nextAccess;
    }
    throw error;
  }

  return cacheAccess({
    ...access,
    aiCreditsUsed: access.aiCreditsUsed + 1,
    aiCreditsRemaining: Math.max(access.aiCreditsRemaining - 1, 0)
  });
}

export function accessPayload(access: RequestAccess) {
  return {
    tier: access.tier,
    role: access.role,
    aiCreditsUsed: access.aiCreditsUsed,
    aiCreditsLimit: access.aiCreditsLimit,
    aiCreditsRemaining: access.aiCreditsRemaining
  };
}

export function accessErrorResponse(error: unknown) {
  if (error instanceof AccessError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (isFirebaseTransientError(error)) {
    return Response.json({ error: getFirebaseAccessErrorMessage() }, { status: 503 });
  }

  const message = error instanceof Error ? error.message : "Authentication failed";
  const status = message.includes("Firebase Admin credentials") ? 503 : 401;
  return Response.json({ error: message }, { status });
}

async function withFirebaseTransientRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < FIREBASE_TRANSIENT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isFirebaseTransientError(error) || attempt === FIREBASE_TRANSIENT_RETRY_ATTEMPTS - 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }

  if (isFirebaseTransientError(lastError)) {
    throw new AccessError(`${getFirebaseAccessErrorMessage()} (${label})`, 503);
  }
  throw lastError;
}

function cacheAccess(access: RequestAccess) {
  const cached = {
    ...access
  };
  accessCache.set(access.uid, {
    access: cached,
    expiresAt: Date.now() + ACCESS_CACHE_TTL_MS
  });
  return cached;
}

function getCachedAccess(uid: string) {
  const cached = accessCache.get(uid);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    accessCache.delete(uid);
    return null;
  }
  return {
    ...cached.access
  };
}
