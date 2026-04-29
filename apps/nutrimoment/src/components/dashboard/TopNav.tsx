"use client";

import { motion } from "framer-motion";
import { Calendar, Camera, ChefHat, Heart, History, LogOut, MoonStar, Settings, ShoppingCart, SunMedium } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import type { Language, Tab } from "@/lib/types";

const PILOT_LANGUAGES: Array<{ code: Language; nativeLabel: string; rtl?: boolean }> = [
  { code: "en", nativeLabel: "English" },
  { code: "ar", nativeLabel: "العربية", rtl: true }
];

interface TopNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; icon: typeof ChefHat; key: Parameters<ReturnType<typeof useApp>["t"]>[0] }[] = [
  { id: "scanner", icon: Camera, key: "scanner" },
  { id: "pantry", icon: ShoppingCart, key: "pantry" },
  { id: "mealplan", icon: Calendar, key: "mealplan" },
  { id: "history", icon: History, key: "history" },
  { id: "health", icon: Heart, key: "health" },
  { id: "settings", icon: Settings, key: "settings" }
];

export function TopNav({ activeTab, onTabChange }: TopNavProps) {
  const { user, access, signOut } = useAuth();
  const { t, language, setLanguage, settings, saveSettings } = useApp();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const activeLanguage = PILOT_LANGUAGES.find((item) => item.code === language) ?? PILOT_LANGUAGES[0];
  const activeLanguageChip = activeLanguage.code === "ar" ? "AR" : "EN";

  const handleSignOut = async () => {
    await signOut();
  };

  const handleThemeToggle = async () => {
    await saveSettings({
      themeMode: settings.themeMode === "mintWhite" ? "auroraDark" : "mintWhite"
    });
  };

  const handleLanguageToggle = async () => {
    const nextLanguage: Language = language === "ar" ? "en" : "ar";
    await setLanguage(nextLanguage);
  };

  return (
    <header className="theme-topbar px-2.5 pt-2.5 sm:px-4 sm:pt-3" data-theme={settings.themeMode ?? "auroraDark"}>
      <div className="shell-frame relative z-30">
        <div className="floating-shell theme-topbar-shell rounded-[1.35rem] px-3 sm:rounded-[1.5rem] sm:px-5">
          <div className="flex flex-col gap-3 py-2.5 sm:gap-3.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <motion.div
                  whileHover={{ rotate: 10 }}
                  transition={{ type: "spring", stiffness: 200, damping: 14 }}
                  className="gradient-emerald p-2 rounded-xl shadow-glow"
                >
                  <ChefHat className="h-4 w-4 text-[#032019]" aria-hidden="true" />
                </motion.div>
                <h1 className="theme-topbar-title font-display text-base font-bold leading-none sm:text-lg">
                  {t("appTitle")}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowSignOutConfirm(true)}
                  className="focus-ring theme-topbar-control flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 px-2.5 transition-ui hover:bg-red-500/12 hover:text-red-100"
                  aria-label={t("logout")}
                  title={user?.email ?? ""}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => void handleThemeToggle()}
                  className="focus-ring theme-topbar-control flex h-8 min-w-10 items-center justify-center rounded-xl border border-white/10 px-2.5 transition-ui"
                  aria-label={settings.themeMode === "mintWhite" ? t("switchToDarkTheme") : t("switchToMintTheme")}
                  title={settings.themeMode === "mintWhite" ? t("switchToDarkTheme") : t("switchToMintTheme")}
                >
                  {settings.themeMode === "mintWhite" ? (
                    <MoonStar className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <SunMedium className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void handleLanguageToggle()}
                  className="focus-ring theme-topbar-control flex h-8 min-w-10 items-center justify-center rounded-xl border border-white/10 px-2.5 transition-ui"
                  aria-label={t("languageSwitch")}
                  title={activeLanguage.nativeLabel}
                >
                  <span
                    className={cn("text-sm font-bold uppercase tracking-[0.12em]", activeLanguage.rtl ? "tracking-normal" : undefined)}
                    dir={activeLanguage.rtl ? "rtl" : "ltr"}
                  >
                    {activeLanguageChip}
                  </span>
                </button>

                {user?.email ? (
                  <div
                    className="theme-topbar-control theme-topbar-muted hidden max-w-44 truncate rounded-xl border border-white/10 px-2.5 py-1.5 text-[11px] font-medium md:block"
                    title={user.email}
                  >
                    {user.email}
                  </div>
                ) : null}

                <div className="theme-topbar-control rounded-xl border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur-xl">
                  <span className="theme-topbar-accent uppercase tracking-[0.14em]">{access.tier}</span>
                  {access.tier === "free" ? (
                    <span className="ml-1.5 tabular-nums theme-topbar-muted">
                      {access.aiCreditsRemaining}/{access.aiCreditsLimit}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="theme-topbar-divider h-px w-full" />

            <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="theme-topbar-brandline flex items-center gap-3">
                <span className="theme-topbar-kicker text-[10px] font-semibold uppercase tracking-[0.18em]">
                  NutriMoment
                </span>
                <span className="theme-topbar-kicker hidden text-[10px] font-medium tracking-[0.08em] text-emerald-50/48 sm:inline">
                  {t(activeTab === "scanner" ? "scannerCompactLead" : "preferencesDesc")}
                </span>
              </div>

              <nav className="relative z-10 min-w-0 w-full sm:w-auto">
                <div className="nav-pill-track theme-topbar-track grid w-full grid-cols-3 gap-1 rounded-[1.15rem] px-1 py-1 sm:flex sm:max-w-full sm:items-center sm:gap-1.5 sm:overflow-x-auto sm:rounded-[1.4rem] sm:px-1.5 sm:py-1.5 sm:scrollbar-hidden">
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
                          "focus-ring theme-topbar-tab relative flex min-h-[3.25rem] min-w-0 items-center justify-center rounded-[0.95rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight transition-ui sm:min-h-0 sm:flex-none sm:rounded-[1rem] sm:px-3 sm:py-2 sm:text-[13px]",
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
                        <span className="relative flex min-w-0 flex-col items-center justify-center gap-0.5 sm:flex-row sm:gap-1.5">
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="truncate">{t(tab.key)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </nav>
            </div>
          </div>
        </div>
      </div>

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
