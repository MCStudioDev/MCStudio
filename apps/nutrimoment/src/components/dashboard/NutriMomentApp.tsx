"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TopNav } from "./TopNav";
import { ErrorBanner } from "./ErrorBanner";
import { ScannerTab } from "./tabs/ScannerTab";
import { PantryTab } from "./tabs/PantryTab";
import { HealthTab } from "./tabs/HealthTab";
import { MealPlanTab } from "./tabs/MealPlanTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { SettingsTab } from "./tabs/SettingsTab";
import type { Tab } from "@/lib/types";

const TAB_COMPONENTS: Record<Tab, React.ComponentType> = {
  scanner: ScannerTab,
  pantry: PantryTab,
  mealplan: MealPlanTab,
  health: HealthTab,
  history: HistoryTab,
  settings: SettingsTab
};

export function NutriMomentApp() {
  const [activeTab, setActiveTab] = useState<Tab>("scanner");
  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="relative min-h-screen">
      <TopNav activeTab={activeTab} onTabChange={setActiveTab} />
      <ErrorBanner />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 md:py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <ActiveComponent />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
