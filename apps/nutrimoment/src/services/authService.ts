import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
export {
  buildFreeAiCreditsExhaustedNotice,
  FREE_LIFETIME_AI_CREDITS
} from "@/lib/freeAiCredits";
import { FREE_LIFETIME_AI_CREDITS } from "@/lib/freeAiCredits";
import { logger } from "@/lib/logger";

export type AccessRole = "admin" | "user";
export type AccessTier = "free" | "premium";
export type AiFeatureKey = "image_to_text" | "recipe_generation" | "recipe_image" | "weekly_plan";
export type EntitlementFeatureKey =
  | "mealPlan.weekly"
  | "pantry.imageScan"
  | "recipes.api"
  | "recipes.imageLookup"
  | "recipes.offline"
  | "shoppingList.quantities"
  | "pantry.manual";

export function buildDefaultEntitlementFeatures(tier: AccessTier): Record<EntitlementFeatureKey, boolean> {
  const isPremium = tier === "premium";
  return {
    "mealPlan.weekly": isPremium,
    "pantry.imageScan": isPremium,
    "recipes.api": isPremium,
    "recipes.imageLookup": isPremium,
    "recipes.offline": true,
    "shoppingList.quantities": true,
    "pantry.manual": true
  };
}

// Backward-compatible UI fields now mirror the single shared AI action budget.
export const FREE_LIFETIME_WEEKLY_PLANS = FREE_LIFETIME_AI_CREDITS;
const AI_ACTION_GRANT_TTL_MS = 24 * 60 * 60 * 1000;
const AI_ACTION_IMAGE_LIMITS: Partial<Record<AiFeatureKey, number>> = {
  recipe_generation: 10,
  weekly_plan: 21
};
const FIREBASE_TRANSIENT_RETRY_ATTEMPTS = 5;
const ACCESS_CACHE_TTL_MS = 10 * 60 * 1000;
const accessCache = new Map<string, { access: RequestAccess; expiresAt: number }>();
const AI_FEATURE_TO_ENTITLEMENT_KEY: Record<AiFeatureKey, EntitlementFeatureKey> = {
  image_to_text: "pantry.imageScan",
  recipe_generation: "recipes.api",
  recipe_image: "recipes.imageLookup",
  weekly_plan: "mealPlan.weekly"
};

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
  features: Partial<Record<EntitlementFeatureKey, boolean>>;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  aiCreditsRemaining: number;
  weeklyPlanUsed: number;
  weeklyPlanLimit: number;
  weeklyPlanRemaining: number;
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
  return "Firebase is temporarily busy, so AI access is unavailable right now. Please try again in a few minutes.";
}

interface AuthenticatedUserEnrollment {
  uid: string;
  email: string | null;
  displayName: string | null;
}

async function ensureAuthenticatedUserEnrollment(
  db: ReturnType<typeof getAdminDb>,
  identity: AuthenticatedUserEnrollment
): Promise<Record<string, unknown>> {
  const userRef = db.doc(`users/${identity.uid}`);
  const entitlementRef = db.doc(`entitlements/${identity.uid}`);
  const [userSnapshot, entitlementSnapshot] = await withFirebaseTransientRetry(
    () => db.getAll(userRef, entitlementRef),
    "read user enrollment"
  );

  if (userSnapshot.exists && entitlementSnapshot.exists) {
    return entitlementSnapshot.data() ?? {};
  }

  const defaultEntitlement = {
    uid: identity.uid,
    email: identity.email,
    tier: "free" as const,
    role: "user" as const,
    status: "free",
    features: buildDefaultEntitlementFeatures("free"),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    source: "auto_onboarding"
  };

  return withFirebaseTransientRetry(
    () => db.runTransaction(async (transaction) => {
      const [currentUser, currentEntitlement] = await Promise.all([
        transaction.get(userRef),
        transaction.get(entitlementRef)
      ]);

      if (!currentUser.exists) {
        transaction.set(userRef, {
          uid: identity.uid,
          email: identity.email,
          displayName: identity.displayName,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          source: "auto_onboarding"
        });
      }

      if (!currentEntitlement.exists) {
        transaction.set(entitlementRef, defaultEntitlement);
        return defaultEntitlement;
      }

      return currentEntitlement.data() ?? {};
    }),
    "ensure user enrollment"
  );
}

export async function getRequestAccess(request: Request): Promise<RequestAccess> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AccessError("Sign in is required to use this feature.", 401);
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const decoded = await withFirebaseTransientRetry(() => getAdminAuth().verifyIdToken(token), "verify auth token");
  const db = getAdminDb();
  let entitlementData: Record<string, unknown> | undefined;

  try {
    entitlementData = await ensureAuthenticatedUserEnrollment(
      db,
      {
        uid: decoded.uid,
        email: decoded.email ?? null,
        displayName: decoded.name ?? null
      }
    );
  } catch (error) {
    if (isFirebaseTransientError(error)) {
      const cached = getCachedAccess(decoded.uid);
      if (cached) {
        logger.warn("Serving cached access after transient Firebase entitlement read failure", {
          uid: decoded.uid,
          feature: "access_check",
          errorMessage: error instanceof Error ? error.message : String(error)
        });
        return cached;
      }

      logger.warn("Continuing without entitlement features after transient Firebase entitlement read failure", {
        uid: decoded.uid,
        feature: "access_check",
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    } else {
      throw error;
    }
  }

  const role: AccessRole =
    entitlementData?.role === "admin" || entitlementData?.role === "user"
      ? entitlementData.role
      : decoded.role === "admin"
        ? "admin"
        : "user";
  const tier = resolveEffectiveAccessTier(entitlementData, decoded.tier);
  const features = normalizeEntitlementFeatures(entitlementData?.features);
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
      features,
      aiCreditsUsed: 0,
      aiCreditsLimit: FREE_LIFETIME_AI_CREDITS,
      aiCreditsRemaining: FREE_LIFETIME_AI_CREDITS,
      weeklyPlanUsed: 0,
      weeklyPlanLimit: FREE_LIFETIME_WEEKLY_PLANS,
      weeklyPlanRemaining: FREE_LIFETIME_WEEKLY_PLANS
    });
  }

  const usageRef = db.doc(`users/${decoded.uid}/usage/aiCredits`);
  let usageSnap;

  try {
    usageSnap = await withFirebaseTransientRetry(
      () => usageRef.get(),
      "read free usage"
    );
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
        features,
        aiCreditsUsed: FREE_LIFETIME_AI_CREDITS - 1,
        aiCreditsLimit: FREE_LIFETIME_AI_CREDITS,
        aiCreditsRemaining: 1,
        weeklyPlanUsed: FREE_LIFETIME_WEEKLY_PLANS - 1,
        weeklyPlanLimit: FREE_LIFETIME_WEEKLY_PLANS,
        weeklyPlanRemaining: 1
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
    features,
    aiCreditsUsed,
    aiCreditsLimit: FREE_LIFETIME_AI_CREDITS,
    aiCreditsRemaining: Math.max(FREE_LIFETIME_AI_CREDITS - aiCreditsUsed, 0),
    weeklyPlanUsed: aiCreditsUsed,
    weeklyPlanLimit: FREE_LIFETIME_WEEKLY_PLANS,
    weeklyPlanRemaining: Math.max(FREE_LIFETIME_AI_CREDITS - aiCreditsUsed, 0)
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

export function hasAiFeatureAccess(access: RequestAccess, featureKey: AiFeatureKey) {
  if (featureKey === "recipe_image") {
    return hasRecipeImageAccess(access);
  }

  return access.isAdmin || access.isPremium || access.features[AI_FEATURE_TO_ENTITLEMENT_KEY[featureKey]] === true;
}

export function hasRecipeImageAccess(_access: RequestAccess) {
  void _access;
  return true;
}

export function hasGeneratedRecipeImageAccess(access: RequestAccess) {
  return access.isAdmin || access.isPremium;
}

export function resolveEffectiveAccessTier(entitlementData: Record<string, unknown> | undefined, claimTier: unknown): AccessTier {
  const entitlementTier = entitlementData?.tier === "premium" || entitlementData?.tier === "free"
    ? entitlementData.tier
    : undefined;
  const status = typeof entitlementData?.status === "string" ? entitlementData.status.toLowerCase() : "";
  const expiresAt = getEntitlementExpirationMs(entitlementData);
  const isExpired = expiresAt !== undefined && expiresAt <= Date.now();

  if (["free", "expired", "canceled", "cancelled", "inactive"].includes(status)) return "free";
  if (isExpired) return "free";
  if (entitlementTier === "free") return "free";

  if (
    entitlementTier === "premium" ||
    claimTier === "premium" ||
    ["active", "trial", "trialing"].includes(status)
  ) {
    return "premium";
  }

  return "free";
}

function getEntitlementExpirationMs(entitlementData: Record<string, unknown> | undefined) {
  if (!entitlementData) return undefined;
  return [
    entitlementData.trialEndsAt,
    entitlementData.trialExpiresAt,
    entitlementData.currentPeriodEnd,
    entitlementData.expiresAt,
    entitlementData.endsAt
  ]
    .map(readTimestampMs)
    .find((value): value is number => typeof value === "number");
}

function readTimestampMs(value: unknown): number | undefined {
  if (!value) return undefined;
  if (typeof value === "number") return value > 1_000_000_000_000 ? value : value * 1000;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value === "object") {
    const maybeTimestamp = value as { toMillis?: () => number; _seconds?: number; seconds?: number };
    if (typeof maybeTimestamp.toMillis === "function") return maybeTimestamp.toMillis();
    const seconds = typeof maybeTimestamp._seconds === "number" ? maybeTimestamp._seconds : maybeTimestamp.seconds;
    return typeof seconds === "number" ? seconds * 1000 : undefined;
  }
  return undefined;
}

export async function canUseApiFeature(request: Request, featureKey: AiFeatureKey) {
  const access = await getRequestAccess(request);
  const featureRemaining = access.aiCreditsRemaining;
  const hasFeatureAccess = hasAiFeatureAccess(access, featureKey);
  return {
    access,
    featureKey,
    allowed: hasFeatureAccess || featureRemaining > 0,
    reason: hasFeatureAccess || featureRemaining > 0
      ? null
      : "free_ai_credits_exhausted"
  };
}

export async function consumeFreeAiCredit(access: RequestAccess, featureKey: AiFeatureKey) {
  if (featureKey === "recipe_image") return access;
  const result = await consumeFreeAiAction(access, featureKey, crypto.randomUUID());
  return result.access;
}

export interface FreeAiActionResult {
  access: RequestAccess;
  actionGrantId?: string;
}

export async function consumeFreeAiAction(
  access: RequestAccess,
  featureKey: Exclude<AiFeatureKey, "recipe_image">,
  actionId: string
): Promise<FreeAiActionResult> {
  if (hasAiFeatureAccess(access, featureKey)) {
    return { access };
  }

  const remaining = access.aiCreditsRemaining;
  const limit = FREE_LIFETIME_AI_CREDITS;

  if (remaining <= 0) {
    throw new AccessError(
      "Your 10 free AI credits are used. Shared recipes remain available, or upgrade to premium for more AI actions.",
      402
    );
  }

  const db = getAdminDb();
  const safeActionId = normalizeActionGrantId(actionId);
  const usageRef = db.doc(`users/${access.uid}/usage/aiCredits`);
  const grantRef = db.doc(`users/${access.uid}/aiActionGrants/${safeActionId}`);
  let nextUsed = access.aiCreditsUsed + 1;
  try {
    await withFirebaseTransientRetry(
      () => db.runTransaction(async (transaction) => {
        const [usageSnapshot, grantSnapshot] = await Promise.all([
          transaction.get(usageRef),
          transaction.get(grantRef)
        ]);
        const existingGrant = grantSnapshot.data();
        const existingExpiresAt = Number(existingGrant?.expiresAt ?? 0);
        if (
          grantSnapshot.exists &&
          existingGrant?.feature === featureKey &&
          existingExpiresAt > Date.now()
        ) {
          throw new AccessError("This AI action was already submitted.", 409);
        }

        const currentUsed = Number(usageSnapshot.data()?.lifetimeUsed ?? 0);
        if (currentUsed >= limit) {
          throw new AccessError(
            "Your 10 free AI credits are used. Shared recipes remain available, or upgrade to premium for more AI actions.",
            402
          );
        }
        nextUsed = currentUsed + 1;
        transaction.set(usageRef, {
          uid: access.uid,
          lifetimeLimit: limit,
          lifetimeUsed: nextUsed,
          lastActionId: safeActionId,
          lastFeature: featureKey,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        transaction.set(grantRef, {
          actionId: safeActionId,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: Date.now() + AI_ACTION_GRANT_TTL_MS,
          feature: featureKey,
          imageLimit: AI_ACTION_IMAGE_LIMITS[featureKey] ?? 0,
          imagesUsed: 0,
          uid: access.uid
        });
      }),
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
        aiCreditsRemaining: Math.max(access.aiCreditsRemaining - 1, 0),
        weeklyPlanUsed: access.aiCreditsUsed + 1,
        weeklyPlanRemaining: Math.max(access.aiCreditsRemaining - 1, 0)
      };
      cacheAccess(nextAccess);
      return { access: nextAccess };
    }
    throw error;
  }

  const nextAccess = cacheAccess({
    ...access,
    aiCreditsUsed: nextUsed,
    aiCreditsRemaining: Math.max(limit - nextUsed, 0),
    weeklyPlanUsed: nextUsed,
    weeklyPlanRemaining: Math.max(limit - nextUsed, 0)
  });
  return {
    access: nextAccess,
    ...(AI_ACTION_IMAGE_LIMITS[featureKey] ? { actionGrantId: safeActionId } : {})
  };
}

export async function hasFreeAiActionImageGrant(access: RequestAccess, actionGrantId?: string | null) {
  if (!actionGrantId || access.isAdmin || access.isPremium) return false;
  const snapshot = await getAdminDb().doc(
    `users/${access.uid}/aiActionGrants/${normalizeActionGrantId(actionGrantId)}`
  ).get();
  const data = snapshot.data();
  return snapshot.exists &&
    (data?.feature === "recipe_generation" || data?.feature === "weekly_plan") &&
    Number(data?.expiresAt ?? 0) > Date.now() &&
    Number(data?.imagesUsed ?? 0) < Number(data?.imageLimit ?? 0);
}

export async function consumeFreeAiActionImageGrant(access: RequestAccess, actionGrantId?: string | null) {
  if (access.isAdmin || access.isPremium) return true;
  if (!actionGrantId) return false;
  const grantRef = getAdminDb().doc(
    `users/${access.uid}/aiActionGrants/${normalizeActionGrantId(actionGrantId)}`
  );
  return getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(grantRef);
    const data = snapshot.data();
    const imagesUsed = Number(data?.imagesUsed ?? 0);
    const imageLimit = Number(data?.imageLimit ?? 0);
    const valid = snapshot.exists &&
      (data?.feature === "recipe_generation" || data?.feature === "weekly_plan") &&
      Number(data?.expiresAt ?? 0) > Date.now() &&
      imagesUsed < imageLimit;
    if (!valid) return false;
    transaction.update(grantRef, {
      imagesUsed: imagesUsed + 1,
      lastImageAt: FieldValue.serverTimestamp()
    });
    return true;
  });
}

function normalizeActionGrantId(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
  if (!normalized) throw new AccessError("A valid AI action identifier is required.", 400);
  return normalized;
}

export function accessPayload(access: RequestAccess) {
  return {
    tier: access.tier,
    role: access.role,
    features: access.features,
    aiCreditsUsed: access.aiCreditsUsed,
    aiCreditsLimit: access.aiCreditsLimit,
    aiCreditsRemaining: access.aiCreditsRemaining,
    weeklyPlanUsed: access.weeklyPlanUsed,
    weeklyPlanLimit: access.weeklyPlanLimit,
    weeklyPlanRemaining: access.weeklyPlanRemaining
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

function normalizeEntitlementFeatures(value: unknown): Partial<Record<EntitlementFeatureKey, boolean>> {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [EntitlementFeatureKey, unknown] => isEntitlementFeatureKey(entry[0]))
      .map(([key, enabled]) => [key, enabled === true])
  );
}

function isEntitlementFeatureKey(value: string): value is EntitlementFeatureKey {
  return [
    "mealPlan.weekly",
    "pantry.imageScan",
    "recipes.api",
    "recipes.imageLookup",
    "recipes.offline",
    "shoppingList.quantities",
    "pantry.manual"
  ].includes(value);
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
