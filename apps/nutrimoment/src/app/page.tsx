"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChefHat, Sparkles, Camera, Heart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { HeroBlobs } from "@/components/ui/HeroBlobs";
import { Loader } from "@/components/ui/Loader";

export default function Landing() {
  const { user, loading, signInWithGoogle } = useAuth();
  const { t, rtl, language } = useApp();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      setError(message);
    } finally {
      setSigningIn(false);
    }
  };

  if (loading || !isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader label="Checking your session..." />
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader label="Redirecting to your kitchen..." />
      </div>
    );
  }

  return (
    <main
      className="relative min-h-screen flex items-center justify-center px-6 py-12 overflow-hidden"
      dir={rtl ? "rtl" : "ltr"}
      lang={language}
    >
      <HeroBlobs />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="glass-card-strong rounded-[32px] p-8 md:p-10 text-center space-y-8">
          <div className="flex flex-col items-center space-y-5">
            <motion.div
              whileHover={{ rotate: 12, scale: 1.05 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="gradient-emerald rounded-3xl p-4 shadow-glow"
            >
              <ChefHat className="h-10 w-10 text-white" />
            </motion.div>
            <div className="space-y-2">
              <h1 className="text-4xl font-display font-bold tracking-tight text-stone-900">
                {t("appTitle")}
              </h1>
              <p className="text-stone-600 text-sm leading-relaxed max-w-xs mx-auto">
                {t("appSubtitle")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs text-stone-600">
            <Feature icon={<Camera className="h-4 w-4" />} label={t("scanIng")} />
            <Feature icon={<Sparkles className="h-4 w-4" />} label={t("aiGenerated")} />
            <Feature icon={<Heart className="h-4 w-4" />} label={t("healthProfile")} />
          </div>

          <div className="space-y-3 pt-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSignIn}
              disabled={signingIn}
              className="w-full h-14 flex items-center justify-center gap-3 bg-white text-stone-800 rounded-2xl font-semibold text-sm border border-stone-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all disabled:opacity-60"
            >
              <GoogleIcon />
              {signingIn ? "Connecting..." : "Continue with Google"}
            </motion.button>
            {error ? (
              <p className="text-xs text-red-600">{error}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-stone-400 uppercase tracking-widest font-semibold">Powered by Gemini</p>
                <p className="text-[11px] leading-relaxed text-stone-400">
                  Informational recipe support only. Verify allergens, nutrition, and food safety before use.
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </main>
  );
}

interface FeatureProps {
  icon: React.ReactNode;
  label: string;
}

function Feature({ icon, label }: FeatureProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/60 border border-emerald-100 py-3 px-2">
      <div className="text-emerald-700">{icon}</div>
      <span className="text-[11px] font-medium leading-tight text-stone-700 text-center">{label}</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-1.5 3.6-5.5 3.6-3.3 0-6.1-2.7-6.1-6.1s2.8-6.1 6.1-6.1c1.9 0 3.2.8 4 1.5l2.7-2.6C17 2.8 14.7 2 12 2 6.9 2 2.8 6.1 2.8 11.2S6.9 20.4 12 20.4c6.9 0 9.2-4.8 9.2-7.3 0-.5-.1-.9-.1-1.3H12z" />
      <path fill="#34A853" d="M3.8 7.6l3.2 2.3c.9-1.7 2.7-2.9 5-2.9 1.9 0 3.2.8 4 1.5l2.7-2.6C17 2.8 14.7 2 12 2 8.5 2 5.5 4 3.8 7.6z" />
      <path fill="#FBBC05" d="M12 20.4c2.6 0 4.8-.9 6.5-2.4l-3-2.4c-.8.6-1.9 1.1-3.5 1.1-3.3 0-6-2.2-7-5.2l-3.3 2.6c1.7 3.4 5.3 5.7 10.3 5.7z" />
      <path fill="#4285F4" d="M21.2 13.1c0-.6-.1-1-.2-1.5H12v3.9h5.5c-.3 1.4-1.1 2.5-2.2 3.3l3 2.4c1.8-1.7 2.9-4.1 2.9-8.1z" />
    </svg>
  );
}
