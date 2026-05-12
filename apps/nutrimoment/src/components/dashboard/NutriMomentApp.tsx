"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TopNav } from "./TopNav";
import { ErrorBanner } from "./ErrorBanner";
import { ScannerTab } from "./tabs/ScannerTab";
import { PantryTab } from "./tabs/PantryTab";
import { HealthTab } from "./tabs/HealthTab";
import { MealPlanTab } from "./tabs/MealPlanTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { BackgroundRecipeNotifier } from "./BackgroundRecipeNotifier";
import { AppLegalBanner } from "@/components/legal/LegalNotice";
import { useApp } from "@/contexts/AppContext";
import type { Tab } from "@/lib/types";

const TAB_COMPONENTS: Record<Tab, React.ComponentType> = {
  scanner: ScannerTab,
  pantry: PantryTab,
  mealplan: MealPlanTab,
  health: HealthTab,
  history: HistoryTab,
  settings: SettingsTab
};

const DASHBOARD_TAB_STORAGE_KEY = "nutrimoment.dashboard.activeTab";
const DASHBOARD_TABS = Object.keys(TAB_COMPONENTS) as Tab[];

export function NutriMomentApp() {
  const [activeTab, setActiveTab] = useState<Tab>("scanner");
  const shellRef = useRef<HTMLDivElement | null>(null);
  const restoredTabRef = useRef(false);
  const { settings } = useApp();
  const ActiveComponent = TAB_COMPONENTS[activeTab];
  const themeMode = settings.themeMode ?? "auroraDark";

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!shellRef.current) return;
    const bounds = shellRef.current.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    shellRef.current.style.setProperty("--pointer-x", `${x}%`);
    shellRef.current.style.setProperty("--pointer-y", `${y}%`);
  };

  const handlePointerLeave = () => {
    if (!shellRef.current) return;
    shellRef.current.style.setProperty("--pointer-x", "50%");
    shellRef.current.style.setProperty("--pointer-y", "18%");
  };

  useEffect(() => {
    document.body.setAttribute("data-dashboard-theme", themeMode);
    return () => {
      document.body.removeAttribute("data-dashboard-theme");
    };
  }, [themeMode]);

  useEffect(() => {
    const savedTab = getSavedDashboardTab();
    if (!savedTab) {
      restoredTabRef.current = true;
      return;
    }

    const restoreId = window.setTimeout(() => {
      restoredTabRef.current = true;
      setActiveTab(savedTab);
    }, 0);

    return () => window.clearTimeout(restoreId);
  }, []);

  useEffect(() => {
    if (!restoredTabRef.current) return;
    persistDashboardTab(activeTab);
  }, [activeTab]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
  };

  return (
    <>
      <TopNav activeTab={activeTab} onTabChange={handleTabChange} />
      <BackgroundRecipeNotifier />

      <div
        ref={shellRef}
        className="dashboard-shell interactive-shell relative min-h-screen overflow-hidden"
        data-dashboard-theme={themeMode}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <div className="blob animate-blob left-[-5rem] top-16 h-56 w-56 bg-emerald-300/16" data-parallax-layer="soft" />
        <div className="blob animate-blob right-[-2rem] top-44 h-72 w-72 bg-cyan-300/12 [animation-delay:-4s]" data-parallax-layer="soft" />
        <div className="blob animate-blob bottom-12 left-[22%] h-60 w-60 bg-lime-200/10 [animation-delay:-8s]" data-parallax-layer="soft" />
        <div className="relative pt-[3.65rem] sm:pt-[4.1rem]">
          <AppLegalBanner />
          <ErrorBanner />
          <main id="main-content" className="shell-frame relative px-3 pb-10 pt-1 sm:px-6 sm:pt-2 md:pb-16">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="section-band"
              >
                <ActiveComponent />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </>
  );
}

function isDashboardTab(value: string | null): value is Tab {
  return Boolean(value && DASHBOARD_TABS.includes(value as Tab));
}

function getSavedDashboardTab() {
  if (typeof window === "undefined") return null;

  const urlTab = new URLSearchParams(window.location.search).get("tab");
  if (isDashboardTab(urlTab)) return urlTab;

  const storedTab = safeReadDashboardTab();
  return isDashboardTab(storedTab) ? storedTab : null;
}

function persistDashboardTab(tab: Tab) {
  if (typeof window === "undefined") return;

  safeWriteDashboardTab(tab);

  const url = new URL(window.location.href);
  if (!url.pathname.startsWith("/dashboard")) return;
  if (url.searchParams.get("tab") === tab) return;

  url.searchParams.set("tab", tab);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function safeReadDashboardTab() {
  try {
    return window.localStorage.getItem(DASHBOARD_TAB_STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeWriteDashboardTab(tab: Tab) {
  try {
    window.localStorage.setItem(DASHBOARD_TAB_STORAGE_KEY, tab);
  } catch {
    // The URL tab parameter still preserves refresh state when storage is blocked.
  }
}
