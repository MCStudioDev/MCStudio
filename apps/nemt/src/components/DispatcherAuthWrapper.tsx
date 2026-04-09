import React, { useEffect, useState, createContext, useContext } from 'react';
import { auth } from '../config/firebase';
import { onAuthStateChanged, signInWithPopup, getRedirectResult, GoogleAuthProvider, signOut } from 'firebase/auth';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

// Context to share auth state and signOut function
const AuthContext = createContext<{ user: any; signOutUser: () => void }>({ user: null, signOutUser: () => {} });
export const useAuth = () => useContext(AuthContext);

export default function DispatcherAuthWrapper({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

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
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setError(null);
    setIsAuthenticating(true);
    
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Popup login failed:", err);
      setIsAuthenticating(false);
      
      if (err.code === 'auth/unauthorized-domain') {
        setError('Domain not authorized. Go to Firebase Console → Authentication → Settings → Authorized domains → Add "localhost"');
      } else if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setError('Popup was blocked or closed. Please try again.');
      } else {
        setError(`Sign-in failed: ${err.code || err.message}`);
      }
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
      setUser(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm max-w-md w-full text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Dispatcher Portal</h1>
          <p className="text-slate-500 mb-6">Sign in to access the dispatch dashboard.</p>
          
          {error && (
            <div className="mb-4 p-3 bg-amber-50 text-amber-800 text-sm rounded-lg text-left">
              <p className="font-medium mb-1">⚠️ Authentication Issue</p>
              <p className="text-xs">{error}</p>
            </div>
          )}
          
          <button
            onClick={handleLogin}
            disabled={isAuthenticating}
            className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isAuthenticating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Sign in with Google
          </button>
          
          <div className="mt-6 pt-4 border-t border-slate-200">
            <p className="text-sm text-slate-500 mb-2">Are you a driver?</p>
            <Link
              to="/driver"
              className="text-indigo-600 font-medium hover:underline"
            >
              Go to Driver App →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}
