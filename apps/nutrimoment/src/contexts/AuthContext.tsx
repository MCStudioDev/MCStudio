"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  getIdTokenResult,
  onAuthStateChanged,
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface UserAccessState {
  role: "admin" | "user";
  tier: "free" | "premium";
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
  aiCreditsLimit: 10,
  aiCreditsUsed: 0,
  aiCreditsRemaining: 10,
  weeklyPlanLimit: 3,
  weeklyPlanUsed: 0,
  weeklyPlanRemaining: 3,
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

  const refreshAccessForUser = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setAccess({ ...DEFAULT_ACCESS, loading: false });
      return;
    }

    const [tokenResult, usageDoc, weeklyPlanUsageDoc, entitlementDoc] = await Promise.all([
      withFirebaseClientRetry(() => getIdTokenResult(currentUser, true)),
      withFirebaseClientRetry(() => getDoc(doc(db, "users", currentUser.uid, "usage", "aiCredits"))),
      withFirebaseClientRetry(() => getDoc(doc(db, "users", currentUser.uid, "usage", "weeklyPlans"))),
      withFirebaseClientRetry(() => getDoc(doc(db, "entitlements", currentUser.uid)))
    ]);

    const usage = usageDoc.data();
    const weeklyPlanUsage = weeklyPlanUsageDoc.data();
    const entitlement = entitlementDoc.data();
    const tier = entitlement?.tier === "premium" || tokenResult.claims.tier === "premium" ? "premium" : "free";
    const role = entitlement?.role === "admin" || tokenResult.claims.role === "admin" ? "admin" : "user";
    const aiCreditsUsed = Number(usage?.lifetimeUsed ?? 0);
    const aiCreditsLimit = Math.max(10, Number(usage?.lifetimeLimit ?? 10));
    const weeklyPlanUsed = Number(weeklyPlanUsage?.lifetimeUsed ?? 0);
    const weeklyPlanLimit = Math.max(3, Number(weeklyPlanUsage?.lifetimeLimit ?? 3));

    setAccess({
      role,
      tier,
      aiCreditsLimit,
      aiCreditsUsed,
      aiCreditsRemaining: tier === "premium" ? aiCreditsLimit : Math.max(aiCreditsLimit - aiCreditsUsed, 0),
      weeklyPlanLimit,
      weeklyPlanUsed,
      weeklyPlanRemaining: tier === "premium" ? weeklyPlanLimit : Math.max(weeklyPlanLimit - weeklyPlanUsed, 0),
      loading: false
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          // Ensure user document exists in Firestore
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await withFirebaseClientRetry(() => getDoc(userDocRef));

          if (!userDoc.exists()) {
            await withFirebaseClientRetry(() => setDoc(userDocRef, {
              email: currentUser.email,
              displayName: currentUser.displayName,
              createdAt: new Date().toISOString(),
            }));
          }

          await refreshAccessForUser(currentUser);
        } catch (error) {
          console.warn("Access refresh failed; keeping previous access state.", error);
          setAccess((current) => ({ ...current, loading: false }));
        }
      } else {
        setAccess({ ...DEFAULT_ACCESS, loading: false });
      }
      setUser(currentUser);
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
