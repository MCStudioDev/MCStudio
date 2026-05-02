import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export type AccessRole = "admin" | "user";
export type AccessTier = "free" | "premium";
export type AiFeatureKey = "image_to_text" | "recipe_generation" | "recipe_image" | "weekly_plan";

export const FREE_LIFETIME_AI_CREDITS = 5;

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
    /RESOURCE_EXHAUSTED|Quota exceeded|deadline exceeded|UNAVAILABLE|too many requests/i.test(message)
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
  const decoded = await getAdminAuth().verifyIdToken(token);
  const role = decoded.role === "admin" ? "admin" : "user";
  const tier = decoded.tier === "premium" ? "premium" : "free";
  const isAdmin = role === "admin";
  const isPremium = tier === "premium";

  if (isAdmin || isPremium) {
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      role,
      tier,
      isAdmin,
      isPremium,
      aiCreditsUsed: 0,
      aiCreditsLimit: FREE_LIFETIME_AI_CREDITS,
      aiCreditsRemaining: FREE_LIFETIME_AI_CREDITS
    };
  }

  const db = getAdminDb();
  const usageRef = db.doc(`users/${decoded.uid}/usage/aiCredits`);
  let usageSnap;

  try {
    usageSnap = await usageRef.get();
  } catch (error) {
    if (isFirebaseTransientError(error)) {
      throw new AccessError(getFirebaseAccessErrorMessage(), 503);
    }
    throw error;
  }

  const usageData = usageSnap.data();
  const aiCreditsUsed = Number(usageData?.lifetimeUsed ?? 0);

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    role,
    tier,
    isAdmin,
    isPremium,
    aiCreditsUsed,
    aiCreditsLimit: FREE_LIFETIME_AI_CREDITS,
    aiCreditsRemaining: Math.max(FREE_LIFETIME_AI_CREDITS - aiCreditsUsed, 0)
  };
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
    await usageRef.set(
      {
        uid: access.uid,
        lifetimeLimit: FREE_LIFETIME_AI_CREDITS,
        lifetimeUsed: FieldValue.increment(1),
        lastFeature: featureKey,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    if (isFirebaseTransientError(error)) {
      throw new AccessError(getFirebaseAccessErrorMessage(), 503);
    }
    throw error;
  }

  return {
    ...access,
    aiCreditsUsed: access.aiCreditsUsed + 1,
    aiCreditsRemaining: Math.max(access.aiCreditsRemaining - 1, 0)
  };
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
