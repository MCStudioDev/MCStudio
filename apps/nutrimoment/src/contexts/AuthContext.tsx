"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  getIdTokenResult,
  onAuthStateChanged,
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

export type EntitlementFeatureKey =
  | "mealPlan.weekly"
  | "pantry.imageScan"
  | "recipes.api"
  | "recipes.imageLookup"
  | "recipes.offline"
  | "shoppingList.quantities"
  | "pantry.manual";

export interface UserAccessState {
  role: "admin" | "user";
  tier: "free" | "premium";
  features: Partial<Record<EntitlementFeatureKey, boolean>>;
  aiCreditsLimit: number;
  aiCreditsUsed: number;
  aiCreditsRemaining: number;
  weeklyPlanLimit: number;
  weeklyPlanUsed: number;
  weeklyPlanRemaining: number;
  loading: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  access: UserAccessState;
  refreshAccess: () => Promise<void>;
  getAuthHeaders: () => Promise<Record<string, string>>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const DEFAULT_ACCESS: UserAccessState = {
  role: "user",
  tier: "free",
  features: {},
  aiCreditsLimit: 10,
  aiCreditsUsed: 0,
  aiCreditsRemaining: 10,
  weeklyPlanLimit: 10,
  weeklyPlanUsed: 0,
  weeklyPlanRemaining: 10,
  loading: true
};
const FIREBASE_CLIENT_RETRY_ATTEMPTS = 3;

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  access: DEFAULT_ACCESS,
  refreshAccess: async () => {},
  getAuthHeaders: async () => ({}),
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<UserAccessState>(DEFAULT_ACCESS);
  const accessRefreshSequenceRef = useRef(0);

  const refreshAccessForUser = useCallback(async (currentUser: User | null) => {
    const refreshSequence = ++accessRefreshSequenceRef.current;
    if (!currentUser) {
      setAccess({ ...DEFAULT_ACCESS, loading: false });
      return;
    }

    const tokenResult = await withFirebaseClientRetry(() => getIdTokenResult(currentUser, true));
    let entitlement: Record<string, unknown> | undefined;
    try {
      const entitlementDoc = await withFirebaseClientRetry(() => getDoc(doc(db, "entitlements", currentUser.uid)));
      entitlement = entitlementDoc.data();
    } catch (error) {
      // Signed custom claims remain authoritative when Firestore is temporarily unavailable.
      console.warn("Entitlement read failed; using signed access claims.", error);
    }

    if (refreshSequence !== accessRefreshSequenceRef.current) return;

    const tier = resolveEffectiveAccessTier(entitlement, tokenResult.claims.tier);
    const role: UserAccessState["role"] =
      entitlement?.role === "admin" || entitlement?.role === "user"
        ? entitlement.role
        : tokenResult.claims.role === "admin"
          ? "admin"
          : "user";
    const features = normalizeEntitlementFeatures(entitlement?.features);

    setAccess((current) => ({
      ...current,
      role,
      tier,
      features,
      aiCreditsRemaining: tier === "premium" ? current.aiCreditsLimit : Math.max(current.aiCreditsLimit - current.aiCreditsUsed, 0),
      weeklyPlanRemaining: tier === "premium" ? current.weeklyPlanLimit : Math.max(current.weeklyPlanLimit - current.weeklyPlanUsed, 0),
      loading: false
    }));

    const usageResult = await Promise.resolve(
      withFirebaseClientRetry(() => getDoc(doc(db, "users", currentUser.uid, "usage", "aiCredits")))
    ).then(
      (value) => ({ status: "fulfilled", value }) as const,
      (reason) => ({ status: "rejected", reason }) as const
    );
    if (refreshSequence !== accessRefreshSequenceRef.current) return;

    const usage = usageResult.status === "fulfilled" ? usageResult.value.data() : undefined;
    setAccess((current) => {
      const aiCreditsUsed = Number(usage?.lifetimeUsed ?? current.aiCreditsUsed);
      const aiCreditsLimit = Math.max(10, Number(usage?.lifetimeLimit ?? current.aiCreditsLimit));

      return {
        ...current,
        aiCreditsLimit,
        aiCreditsUsed,
        aiCreditsRemaining: tier === "premium" ? aiCreditsLimit : Math.max(aiCreditsLimit - aiCreditsUsed, 0),
        weeklyPlanLimit: aiCreditsLimit,
        weeklyPlanUsed: aiCreditsUsed,
        weeklyPlanRemaining: tier === "premium" ? aiCreditsLimit : Math.max(aiCreditsLimit - aiCreditsUsed, 0)
      };
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          await ensureServerEnrollment(currentUser);
        } catch (error) {
          console.warn("Server-side user enrollment failed; access will retry on the next authenticated request.", error);
        }

        try {
          await refreshAccessForUser(currentUser);
        } catch (error) {
          console.warn("Access refresh failed; keeping previous access state.", error);
          setAccess((current) => ({ ...current, loading: false }));
        }
      } else {
        await refreshAccessForUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [refreshAccessForUser]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }, []);

  const refreshAccess = useCallback(async () => {
    try {
      await refreshAccessForUser(auth.currentUser);
    } catch (error) {
      console.warn("Access refresh failed; keeping previous access state.", error);
      setAccess((current) => ({ ...current, loading: false }));
    }
  }, [refreshAccessForUser]);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const currentUser = auth.currentUser;
    if (!currentUser) return {};
    const token = await currentUser.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, access, refreshAccess, getAuthHeaders, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function hasRecipeImageLookupAccess(access: UserAccessState) {
  return access.role === "admin" || access.tier === "premium";
}

function resolveEffectiveAccessTier(entitlement: Record<string, unknown> | undefined, claimTier: unknown): UserAccessState["tier"] {
  const entitlementTier = entitlement?.tier === "premium" || entitlement?.tier === "free"
    ? entitlement.tier
    : undefined;
  const status = typeof entitlement?.status === "string" ? entitlement.status.toLowerCase() : "";
  const expiresAt = getEntitlementExpirationMs(entitlement);
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

function getEntitlementExpirationMs(entitlement: Record<string, unknown> | undefined) {
  if (!entitlement) return undefined;
  return [
    entitlement.trialEndsAt,
    entitlement.trialExpiresAt,
    entitlement.currentPeriodEnd,
    entitlement.expiresAt,
    entitlement.endsAt
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
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTimestamp.toMillis === "function") return maybeTimestamp.toMillis();
    return typeof maybeTimestamp.seconds === "number" ? maybeTimestamp.seconds * 1000 : undefined;
  }
  return undefined;
}

async function withFirebaseClientRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < FIREBASE_CLIENT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isTransient = /RESOURCE_EXHAUSTED|Quota exceeded|deadline exceeded|UNAVAILABLE|too many requests|ECONNRESET|ETIMEDOUT|socket hang up|network|offline/i.test(message);
      if (!isTransient || attempt === FIREBASE_CLIENT_RETRY_ATTEMPTS - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }

  throw lastError;
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

async function ensureServerEnrollment(currentUser: User) {
  const token = await currentUser.getIdToken();
  const response = await fetch("/api/auth/onboard", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? `Enrollment failed with status ${response.status}.`);
  }
}
