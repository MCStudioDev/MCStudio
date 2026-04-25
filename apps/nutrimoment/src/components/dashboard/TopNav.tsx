"use client";

import { motion } from "framer-motion";
import { ChefHat, LogOut, ShoppingCart, Heart, History, Settings, Camera, Calendar } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import type { Tab, Language } from "@/lib/types";

const PILOT_LANGUAGES: Array<{ code: Language; label: string; nativeLabel: string; rtl?: boolean }> = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", rtl: true }
];

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
  const activeLanguage = PILOT_LANGUAGES.find((item) => item.code === language) ?? PILOT_LANGUAGES[0];
  const activeLanguageChip = activeLanguage.code === "ar" ? "ع" : "EN";
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const langContainerRef = useRef<HTMLDivElement | null>(null);

  const handleLangPick = async (lang: Language) => {
    await setLanguage(lang);
    setShowLangMenu(false);
  };

  const handleSignOut = async () => {
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
    <header className="sticky top-0 z-[80] px-3 pt-3 sm:px-4 sm:pt-3">
      <div className="shell-frame relative z-30">
        <div className="floating-shell rounded-[1.5rem] px-3 sm:px-5">
          <div className="flex flex-col gap-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <motion.div
                whileHover={{ rotate: 10 }}
                transition={{ type: "spring", stiffness: 200, damping: 14 }}
                className="gradient-emerald p-2 rounded-xl shadow-glow"
              >
                <ChefHat className="h-4 w-4 text-[#032019]" aria-hidden="true" />
              </motion.div>
              <h1 className="font-display text-base font-bold leading-none text-white sm:text-lg">
                {t("appTitle")}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-emerald-50 backdrop-blur-xl">
                <span className="uppercase tracking-[0.14em] text-cyan-200">{access.tier}</span>
                {access.tier === "free" ? (
                  <span className="ml-1.5 tabular-nums text-emerald-50/65">
                    {access.aiCreditsRemaining}/{access.aiCreditsLimit}
                  </span>
                ) : null}
              </div>
              {user?.email ? (
                <div
                  className="hidden max-w-44 truncate rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-emerald-50/75 backdrop-blur-xl md:block"
                  title={user.email}
                >
                  {user.email}
                </div>
              ) : null}
              <div className="relative" ref={langContainerRef}>
                <button
                  type="button"
                  onClick={() => setShowLangMenu((v) => !v)}
                  className="focus-ring flex h-8 min-w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-emerald-50/80 hover:bg-white/[0.08] transition-ui"
                  aria-label={t("languageSwitch")}
                  aria-haspopup="menu"
                  aria-expanded={showLangMenu}
                >
                  <span
                    className={cn("text-sm font-bold", activeLanguage.rtl ? "tracking-normal" : "uppercase")}
                    dir={activeLanguage.rtl ? "rtl" : "ltr"}
                  >
                    {activeLanguageChip}
                  </span>
                </button>
                {showLangMenu ? (
                  <div
                    role="menu"
                    aria-label={t("languageMenu")}
                    className="absolute right-0 top-full z-[120] mt-2 min-w-44 rounded-2xl border border-white/10 bg-[#0d221e]/96 p-1.5 shadow-soft ring-1 ring-white/10"
                  >
                    {PILOT_LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        role="menuitem"
                        onClick={() => handleLangPick(lang.code)}
                        className={cn(
                          "focus-ring w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-ui flex justify-between items-center",
                          language === lang.code
                            ? "bg-white/[0.08] text-emerald-50"
                            : "hover:bg-white/[0.05] text-emerald-50/75"
                        )}
                      >
                        <span className={lang.rtl ? "tracking-normal" : "uppercase"} dir={lang.rtl ? "rtl" : "ltr"}>
                          {lang.nativeLabel}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-50/45">
                          {lang.code === "ar" ? "ع" : "EN"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setShowSignOutConfirm(true)}
                className="focus-ring flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-emerald-50/80 hover:bg-red-500/12 hover:text-red-100 transition-ui"
                aria-label={t("logout")}
                title={user?.email ?? ""}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <nav className="relative z-10 mt-2">
        <div className="shell-frame px-1 sm:px-3">
          <div className="nav-pill-track flex items-center gap-1.5 overflow-x-auto rounded-[1.4rem] px-1.5 py-1.5 scrollbar-hidden">
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
                    "focus-ring relative flex items-center gap-1.5 rounded-[1rem] px-3 py-2 text-[13px] font-semibold whitespace-nowrap transition-ui",
                    isActive
                      ? "text-[#032019]"
                      : "border border-white/6 bg-transparent text-emerald-50/68 hover:text-white hover:bg-white/[0.06]"
                  )}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="active-tab-pill"
                      className="absolute inset-0 gradient-emerald rounded-[1rem] shadow-glow"
                      transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    />
                  ) : null}
                  <span className="relative flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(tab.key)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
      <ConfirmDialog
        open={showSignOutConfirm}
        title={t("signOutTitle")}
        description={t("signOutDescription")}
        confirmLabel={t("logout")}
        onCancel={() => setShowSignOutConfirm(false)}
        onConfirm={async () => {
          try {
            await handleSignOut();
          } finally {
            setShowSignOutConfirm(false);
          }
        }}
      />
    </header>
  );
}
