"use client";

import { motion } from "framer-motion";
import { Calendar, Camera, ChefHat, Heart, History, LogOut, Menu, MoonStar, Settings, ShoppingCart, SunMedium, X } from "lucide-react";
import { useEffect, useState } from "react";
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
  const { t, language, rtl, setLanguage, settings, saveSettings } = useApp();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const activeLanguage = PILOT_LANGUAGES.find((item) => item.code === language) ?? PILOT_LANGUAGES[0];
  const activeLanguageChip = activeLanguage.code === "ar" ? "AR" : "EN";
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const ActiveTabIcon = activeTabMeta.icon;

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

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  return (
    <header className="theme-topbar pointer-events-none fixed inset-x-0 top-0 z-[160] px-1.5 sm:px-4" data-theme={settings.themeMode ?? "auroraDark"}>
      <div className="shell-frame pointer-events-none">
        <div className="pointer-events-auto floating-shell theme-topbar-shell overflow-hidden rounded-b-[1rem] border-x border-b border-t-0 border-white/10 px-2.5 py-2 shadow-soft sm:rounded-b-[1.35rem] sm:px-4 sm:py-2.5">
          <div className="relative flex min-w-0 items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                className="focus-ring theme-topbar-control flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] border border-white/10 transition-ui hover:-translate-y-0.5 hover:border-cyan-200/24 hover:bg-white/[0.08] sm:h-11 sm:w-11 sm:rounded-2xl"
                aria-label={t("openNavigation")}
                aria-expanded={isMenuOpen}
                aria-controls="dashboard-side-navigation"
              >
                <Menu className="h-4.5 w-4.5 text-cyan-100 sm:h-5 sm:w-5" aria-hidden="true" />
              </button>

              <motion.div
                whileHover={{ rotate: 10 }}
                transition={{ type: "spring", stiffness: 200, damping: 14 }}
                className="hidden rounded-2xl p-2.5 shadow-glow gradient-emerald sm:flex"
              >
                <ChefHat className="h-5 w-5 text-[#032019]" aria-hidden="true" />
              </motion.div>

              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="theme-topbar-title truncate font-display text-sm font-bold leading-none sm:text-lg">
                    {t("appTitle")}
                  </h1>
                  <span className="hidden rounded-full border border-cyan-200/18 bg-cyan-300/12 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100 sm:inline-flex">
                    {access.tier}
                  </span>
                </div>
                <p className="theme-topbar-kicker mt-1 flex min-w-0 items-center gap-1 truncate text-[10px] font-semibold text-emerald-50/72 sm:gap-1.5 sm:text-[11px]">
                  <ActiveTabIcon className="h-3.5 w-3.5 shrink-0 text-cyan-100" aria-hidden="true" />
                  <span className="truncate">{t(activeTabMeta.key)}</span>
                </p>
              </div>
            </div>

            <div className="theme-topbar-control flex h-9 max-w-[5.2rem] shrink-0 items-center gap-1 rounded-[0.9rem] border border-white/10 px-2 text-[10px] font-semibold sm:h-10 sm:max-w-none sm:gap-2 sm:rounded-2xl sm:px-3 sm:text-[11px]">
              <span className="theme-topbar-accent uppercase tracking-[0.14em]">{access.tier}</span>
              {access.tier === "free" ? (
                <span className="hidden tabular-nums theme-topbar-muted xs:inline">
                  {access.aiCreditsRemaining}/{access.aiCreditsLimit}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "pointer-events-auto fixed inset-0 z-[170] transition",
          isMenuOpen ? "visible" : "invisible delay-200"
        )}
      >
        <button
          type="button"
          className={cn(
            "absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity",
            isMenuOpen ? "opacity-100" : "opacity-0"
          )}
          aria-label={t("closeNavigation")}
          onClick={() => setIsMenuOpen(false)}
        />

        <aside
          id="dashboard-side-navigation"
          aria-label={t("navigationMenu")}
          className={cn(
            "floating-shell theme-topbar-shell absolute top-2 flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[22rem] flex-col rounded-[1.35rem] border border-white/10 p-2.5 shadow-2xl transition-transform duration-300 sm:top-3 sm:h-[calc(100dvh-1.5rem)] sm:w-[min(22rem,calc(100vw-1.5rem))] sm:rounded-[1.6rem] sm:p-3",
            rtl ? "right-2 sm:right-3" : "left-2 sm:left-3",
            isMenuOpen ? "translate-x-0" : rtl ? "translate-x-[115%]" : "-translate-x-[115%]"
          )}
        >
          <div className="flex items-center justify-between gap-3 px-1 py-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <motion.div
                whileHover={{ rotate: 10 }}
                transition={{ type: "spring", stiffness: 200, damping: 14 }}
                className="gradient-emerald rounded-xl p-2 shadow-glow"
              >
                <ChefHat className="h-4 w-4 text-[#032019]" aria-hidden="true" />
              </motion.div>
              <div className="min-w-0">
                <h1 className="theme-topbar-title truncate font-display text-base font-bold leading-none">
                  {t("appTitle")}
                </h1>
                <p className="theme-topbar-kicker mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.16em]">
                  {access.tier}
                  {access.tier === "free" ? ` ${access.aiCreditsRemaining}/${access.aiCreditsLimit}` : ""}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="focus-ring theme-topbar-control flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 transition-ui hover:bg-white/[0.08]"
              aria-label={t("closeNavigation")}
            >
              <X className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
          </div>

          <div className="theme-topbar-divider my-3 h-px w-full" />

          <nav className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-hidden">
            <div className="grid gap-2">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      onTabChange(tab.id);
                      setIsMenuOpen(false);
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "focus-ring theme-topbar-tab relative flex min-h-12 items-center gap-3 rounded-[1.05rem] px-3 py-3 text-sm font-semibold transition-ui",
                      isActive
                        ? "text-[#032019]"
                        : "border border-white/6 bg-white/[0.03] text-emerald-50/76 hover:bg-white/[0.08] hover:text-white"
                    )}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="active-sidebar-tab-pill"
                        className="absolute inset-0 rounded-[1.05rem] gradient-emerald shadow-glow"
                        transition={{ type: "spring", stiffness: 300, damping: 28 }}
                      />
                    ) : null}
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.08]">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="relative min-w-0 flex-1 truncate text-start">{t(tab.key)}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="theme-topbar-divider my-3 h-px w-full" />

          <div className="grid gap-2">
            {user?.email ? (
              <div
                className="theme-topbar-control theme-topbar-muted truncate rounded-xl border border-white/10 px-3 py-2 text-xs font-medium"
                title={user.email}
              >
                {user.email}
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void handleThemeToggle()}
                className="focus-ring theme-topbar-control flex h-11 items-center justify-center rounded-xl border border-white/10 transition-ui"
                aria-label={settings.themeMode === "mintWhite" ? t("switchToDarkTheme") : t("switchToMintTheme")}
                title={settings.themeMode === "mintWhite" ? t("switchToDarkTheme") : t("switchToMintTheme")}
              >
                {settings.themeMode === "mintWhite" ? (
                  <MoonStar className="h-4.5 w-4.5" aria-hidden="true" />
                ) : (
                  <SunMedium className="h-4.5 w-4.5" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={() => void handleLanguageToggle()}
                className="focus-ring theme-topbar-control flex h-11 items-center justify-center rounded-xl border border-white/10 transition-ui"
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

              <button
                type="button"
                onClick={() => setShowSignOutConfirm(true)}
                className="focus-ring theme-topbar-control flex h-11 items-center justify-center rounded-xl border border-white/10 transition-ui hover:bg-red-500/12 hover:text-red-100"
                aria-label={t("logout")}
                title={user?.email ?? ""}
              >
                <LogOut className="h-4.5 w-4.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>
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
