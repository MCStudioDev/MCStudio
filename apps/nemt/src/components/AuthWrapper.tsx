import React, { useEffect, useState } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signInAnonymously } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for redirect result on page load
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log('Redirect sign-in successful');
        }
      })
      .catch((err) => {
        console.error('Redirect error:', err);
        setError(`Sign-in failed: ${err.code || err.message}`);
      });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Test connection to Firestore
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (err) {
          if (err instanceof Error && err.message.includes('the client is offline')) {
            setError('Please check your Firebase configuration. The client is offline.');
          } else {
            // Don't throw for missing test document - it's expected
            console.log('Firestore connection test:', err);
          }
        }
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setError(null);
    
    try {
      // Try popup first
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Popup login failed:", err);
      
      // If popup blocked or failed, try redirect
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr: any) {
          console.error("Redirect login failed:", redirectErr);
          setError(`Sign-in failed: ${redirectErr.code || redirectErr.message}`);
        }
      } else {
        setError(`Sign-in failed: ${err.code || err.message}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const handleDevBypass = async () => {
    // Dev mode bypass - uses anonymous authentication for real Firebase auth session
    setError(null);
    try {
      await signInAnonymously(auth);
    } catch (err: any) {
      console.error("Anonymous login failed:", err);
      setError(`Anonymous sign-in failed: ${err.code || err.message}. Enable Anonymous auth in Firebase Console.`);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-xl shadow-sm max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">NEMT Platform</h1>
          <p className="text-slate-500 mb-6">Please sign in to access the portal.</p>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}
          
          <button
            onClick={handleLogin}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            Sign in with Google
          </button>
          
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-400 mb-2">Development Mode</p>
            <button
              onClick={handleDevBypass}
              className="w-full bg-slate-100 text-slate-600 py-2 px-4 rounded-lg hover:bg-slate-200 transition-colors font-medium text-sm"
            >
              Continue without Sign-in (Dev Only)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
