"use client";

import { motion } from "framer-motion";
import { ChefHat, Languages, LogOut, ShoppingCart, Heart, History, Settings, Camera, Calendar } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import type { Tab, Language } from "@/lib/types";
import { LANGUAGES } from "@/lib/translations";

interface TopNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; icon: typeof ChefHat; key: Parameters<ReturnType<typeof useApp>["t"]>[0] }[] = [
  { id: "scanner", icon: Camera, key: "scanner" },
  { id: "pantry", icon: ShoppingCart, key: "pantry" },
  { id: "mealplan", icon: Calendar, key: "mealplan" },
  { id: "health", icon: Heart, key: "health" },
  { id: "history", icon: History, key: "history" },
  { id: "settings", icon: Settings, key: "settings" }
];

export function TopNav({ activeTab, onTabChange }: TopNavProps) {
  const { user, access, signOut } = useAuth();
  const { t, language, setLanguage } = useApp();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const langContainerRef = useRef<HTMLDivElement | null>(null);

  const handleLangPick = async (lang: Language) => {
    await setLanguage(lang);
    setShowLangMenu(false);
  };

  const handleSignOut = async () => {
    const ok = typeof window !== "undefined" ? window.confirm("Sign out of NutriMoment?") : true;
    if (!ok) return;
    await signOut();
  };

  useEffect(() => {
    if (!showLangMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!langContainerRef.current) return;
      if (!langContainerRef.current.contains(event.target as Node)) {
        setShowLangMenu(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowLangMenu(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showLangMenu]);

  return (
    <header className="sticky top-0 z-[80]">
      <div className="relative z-30 bg-white/90 backdrop-blur-xl border-b border-emerald-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-20 gap-4">
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ rotate: 10 }}
                transition={{ type: "spring", stiffness: 200, damping: 14 }}
                className="gradient-emerald p-2.5 rounded-2xl shadow-glow"
              >
                <ChefHat className="h-6 w-6 text-white" />
              </motion.div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-display font-bold text-stone-900 leading-none">
                  {t("appTitle")}
                </h1>
                <p className="text-[11px] text-stone-500 mt-1 leading-none">
                  {t("appSubtitle")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden rounded-2xl border border-emerald-100 bg-white px-3 py-2 text-xs font-semibold text-stone-700 sm:block">
                <span className="uppercase tracking-[0.16em] text-emerald-600">{access.tier}</span>
                {access.tier === "free" ? (
                  <span className="ml-2 text-stone-500 tabular-nums">
                    {access.aiCreditsRemaining}/{access.aiCreditsLimit} AI left
                  </span>
                ) : (
                  <span className="ml-2 text-stone-500">API-first</span>
                )}
              </div>
              <div className="relative" ref={langContainerRef}>
                <button
                  type="button"
                  onClick={() => setShowLangMenu((v) => !v)}
                  className="focus-ring p-2.5 rounded-xl text-stone-700 hover:bg-emerald-50 transition-ui flex items-center gap-1.5"
                  aria-label="Switch language"
                  aria-haspopup="menu"
                  aria-expanded={showLangMenu}
                >
                  <Languages className="h-5 w-5" aria-hidden="true" />
                  <span className="text-xs font-semibold uppercase">{language}</span>
                </button>
                {showLangMenu ? (
                  <div
                    role="menu"
                    aria-label="Language"
                    className="absolute right-0 top-full z-[120] mt-2 min-w-44 rounded-2xl border border-emerald-100 bg-white p-1.5 shadow-soft ring-1 ring-stone-900/5"
                  >
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        role="menuitem"
                        onClick={() => handleLangPick(lang.code)}
                        className={cn(
                          "focus-ring w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-ui flex justify-between items-center",
                          language === lang.code
                            ? "bg-emerald-50 text-emerald-700"
                            : "hover:bg-stone-50 text-stone-700"
                        )}
                      >
                        <span>{lang.nativeLabel}</span>
                        <span className="text-[10px] uppercase text-stone-400">{lang.code}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                className="focus-ring p-2.5 rounded-xl text-stone-700 hover:bg-red-50 hover:text-red-600 transition-ui"
                aria-label={t("logout")}
                title={user?.email ?? ""}
              >
                <LogOut className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-xl border-b border-emerald-100">
        <div className="max-w-6xl mx-auto px-2 sm:px-6">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hidden py-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "focus-ring relative flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold whitespace-nowrap transition-ui",
                    isActive ? "text-white" : "text-stone-600 hover:text-emerald-700 hover:bg-emerald-50"
                  )}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="active-tab-pill"
                      className="absolute inset-0 gradient-emerald rounded-2xl shadow-glow"
                      transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    />
                  ) : null}
                  <span className="relative flex items-center gap-2">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {t(tab.key)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </header>
  );
}
