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
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';

export interface UserAccessState {
  role: "admin" | "user";
  tier: "free" | "premium";
  aiCreditsLimit: number;
  aiCreditsUsed: number;
  aiCreditsRemaining: number;
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
  aiCreditsLimit: 5,
  aiCreditsUsed: 0,
  aiCreditsRemaining: 5,
  loading: true
};

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

    const tokenResult = await getIdTokenResult(currentUser, true);
    const tier = tokenResult.claims.tier === "premium" ? "premium" : "free";
    const role = tokenResult.claims.role === "admin" ? "admin" : "user";
    setAccess((current) => ({
      ...current,
      role,
      tier,
      aiCreditsRemaining:
        tier === "premium" ? current.aiCreditsLimit : Math.max(current.aiCreditsLimit - current.aiCreditsUsed, 0),
      loading: false
    }));
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Ensure user document exists in Firestore
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
          await setDoc(userDocRef, {
            email: currentUser.email,
            displayName: currentUser.displayName,
            createdAt: new Date().toISOString(),
          });
        }

        await refreshAccessForUser(currentUser);
      } else {
        setAccess({ ...DEFAULT_ACCESS, loading: false });
      }
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [refreshAccessForUser]);

  useEffect(() => {
    if (!user) return;

    const usageRef = doc(db, "users", user.uid, "usage", "aiCredits");
    const unsubscribeUsage = onSnapshot(
      usageRef,
      (snapshot) => {
        const data = snapshot.data();
        const used = Number(data?.lifetimeUsed ?? 0);
        const limit = Number(data?.lifetimeLimit ?? 5);
        setAccess((current) => ({
          ...current,
          aiCreditsUsed: used,
          aiCreditsLimit: limit,
          aiCreditsRemaining: current.tier === "premium" ? limit : Math.max(limit - used, 0),
          loading: false
        }));
      },
      () => {
        setAccess((current) => ({ ...current, loading: false }));
      }
    );

    const entitlementRef = doc(db, "entitlements", user.uid);
    const unsubscribeEntitlement = onSnapshot(
      entitlementRef,
      (snapshot) => {
        const data = snapshot.data();
        if (!data) return;
        const tier = data.tier === "premium" ? "premium" : "free";
        const role = data.role === "admin" ? "admin" : "user";
        setAccess((current) => ({
          ...current,
          tier,
          role,
          aiCreditsRemaining: tier === "premium" ? current.aiCreditsLimit : Math.max(current.aiCreditsLimit - current.aiCreditsUsed, 0)
        }));
      },
      () => {}
    );

    return () => {
      unsubscribeUsage();
      unsubscribeEntitlement();
    };
  }, [user]);

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
    await refreshAccessForUser(auth.currentUser);
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
