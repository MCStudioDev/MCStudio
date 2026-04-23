import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export type AccessRole = "admin" | "user";
export type AccessTier = "free" | "premium";
export type AiFeatureKey = "image_to_text" | "recipe_generation" | "weekly_plan";

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

export async function getRequestAccess(request: Request): Promise<RequestAccess> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AccessError("Sign in is required to use this feature.", 401);
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const role = decoded.role === "admin" ? "admin" : "user";
  const tier = decoded.tier === "premium" ? "premium" : "free";
  const db = getAdminDb();

  const usageRef = db.doc(`users/${decoded.uid}/usage/aiCredits`);
  const entitlementRef = db.doc(`entitlements/${decoded.uid}`);
  const [usageSnap, entitlementSnap] = await Promise.all([usageRef.get(), entitlementRef.get()]);
  const usageData = usageSnap.data();
  const entitlementData = entitlementSnap.data();
  const mirroredTier = entitlementData?.tier === "premium" ? "premium" : tier;
  const aiCreditsUsed = Number(usageData?.lifetimeUsed ?? 0);

  if (!entitlementSnap.exists) {
    await entitlementRef.set(
      {
        uid: decoded.uid,
        email: decoded.email ?? null,
        tier: mirroredTier,
        role,
        status: mirroredTier === "premium" ? "active" : "free",
        features: buildFeatureMap(mirroredTier),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    role,
    tier: mirroredTier,
    isAdmin: role === "admin",
    isPremium: mirroredTier === "premium",
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

  const message = error instanceof Error ? error.message : "Authentication failed";
  const status = message.includes("Firebase Admin credentials") ? 503 : 401;
  return Response.json({ error: message }, { status });
}

function buildFeatureMap(tier: AccessTier) {
  const premium = tier === "premium";
  return {
    "pantry.manual": true,
    "pantry.imageScan": premium,
    "recipes.offline": true,
    "recipes.api": premium,
    "recipes.imageLookup": true,
    "mealPlan.weekly": premium,
    "shoppingList.quantities": true
  };
}
