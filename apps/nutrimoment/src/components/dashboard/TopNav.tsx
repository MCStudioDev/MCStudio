"use client";

import { motion } from "framer-motion";
import { ChefHat, Languages, LogOut, ShoppingCart, Heart, History, Settings, Camera, Calendar } from "lucide-react";
import { useState } from "react";
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
  const { user, signOut } = useAuth();
  const { t, language, setLanguage } = useApp();
  const [showLangMenu, setShowLangMenu] = useState(false);

  const handleLangPick = async (lang: Language) => {
    await setLanguage(lang);
    setShowLangMenu(false);
  };

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-white/80 backdrop-blur-xl border-b border-emerald-100 shadow-sm">
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowLangMenu((v) => !v)}
                  className="p-2.5 rounded-xl text-stone-700 hover:bg-emerald-50 transition flex items-center gap-1.5"
                  aria-label="Switch language"
                >
                  <Languages className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase">{language}</span>
                </button>
                {showLangMenu ? (
                  <div className="absolute right-0 mt-2 min-w-44 rounded-2xl border border-emerald-100 bg-white shadow-soft p-1.5 z-50">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => handleLangPick(lang.code)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition flex justify-between items-center",
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
                onClick={() => signOut()}
                className="p-2.5 rounded-xl text-stone-700 hover:bg-red-50 hover:text-red-600 transition"
                aria-label={t("logout")}
                title={user?.email ?? ""}
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <nav className="bg-white/70 backdrop-blur-xl border-b border-emerald-100">
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
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all",
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
                    <Icon className="h-4 w-4" />
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
