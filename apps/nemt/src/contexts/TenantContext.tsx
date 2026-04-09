import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

interface TenantContextType {
  companyId: string | null;
  companyName: string | null;
  userRole: 'admin' | 'dispatcher' | 'driver' | null;
  isLoading: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextType>({
  companyId: null,
  companyName: null,
  userRole: null,
  isLoading: true,
  error: null,
});

export const useTenant = () => useContext(TenantContext);

/**
 * TenantProvider loads the current user's company affiliation from Firestore.
 * 
 * Firestore schema for multi-tenancy:
 *   /users/{uid} → { companyId, role, email, displayName }
 *   /companies/{companyId} → { name, createdAt, plan }
 * 
 * Every data document (patients, drivers, trips, etc.) MUST have a companyId field.
 * All queries MUST filter by companyId to enforce tenant isolation.
 */
export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenantState, setTenantState] = useState<TenantContextType>({
    companyId: null,
    companyName: null,
    userRole: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      if (!user) {
        setTenantState({
          companyId: null,
          companyName: null,
          userRole: null,
          isLoading: false,
          error: null,
        });
        return;
      }

      try {
        // Look up user's company affiliation
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (!userDoc.exists()) {
          // First-time user — auto-provision a company for them (demo/dev mode)
          // In production, an admin would assign users to companies
          const newCompanyId = `company_${user.uid.substring(0, 8)}`;

          // Create company document
          await setDoc(doc(db, 'companies', newCompanyId), {
            name: user.displayName ? `${user.displayName}'s Company` : 'New Company',
            createdAt: new Date().toISOString(),
            plan: 'free',
            ownerUid: user.uid,
          });

          // Create user document linked to company
          await setDoc(doc(db, 'users', user.uid), {
            companyId: newCompanyId,
            role: 'admin',
            email: user.email,
            displayName: user.displayName,
            createdAt: new Date().toISOString(),
          });

          setTenantState({
            companyId: newCompanyId,
            companyName: user.displayName ? `${user.displayName}'s Company` : 'New Company',
            userRole: 'admin',
            isLoading: false,
            error: null,
          });
          return;
        }

        const userData = userDoc.data();
        const companyId = userData.companyId;

        if (!companyId) {
          setTenantState({
            companyId: null,
            companyName: null,
            userRole: null,
            isLoading: false,
            error: 'Your account is not assigned to any company. Contact your administrator.',
          });
          return;
        }

        // Load company name
        let companyName = 'Unknown Company';
        try {
          const companyDoc = await getDoc(doc(db, 'companies', companyId));
          if (companyDoc.exists()) {
            companyName = companyDoc.data().name || companyName;
          }
        } catch (err) {
          console.warn('Could not load company details:', err);
        }

        setTenantState({
          companyId,
          companyName,
          userRole: userData.role || 'dispatcher',
          isLoading: false,
          error: null,
        });
      } catch (err) {
        console.error('Error loading tenant info:', err);
        setTenantState({
          companyId: null,
          companyName: null,
          userRole: null,
          isLoading: false,
          error: 'Failed to load company information. Please try again.',
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <TenantContext.Provider value={tenantState}>
      {children}
    </TenantContext.Provider>
  );
}
