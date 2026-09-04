"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ChefHat, Scale, SlidersHorizontal, Utensils } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { useApp } from "@/contexts/AppContext";
import { containerVariants, itemVariants } from "@/lib/animations";
import { CUISINE_OPTIONS, getCuisineDisplayLabel } from "@/lib/cuisines";
import { HealthSafetySettingsSection, HealthSettingsSection } from "./HealthTab";
import { SectionHero } from "./shared";

export function SettingsTab() {
  const { t, settings, saveSettings } = useApp();
  const currentLanguageLabel = settings.uiLanguage === "ar" ? t("arabic") : t("english");
  const preferredCuisineLabel = getCuisineDisplayLabel(settings.preferredCuisine, settings.uiLanguage);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-5 sm:space-y-6">
      <SectionHero
        title={t("preferences")}
        description={t("preferencesDesc")}
        eyebrow={t("controlCenter")}
        chips={[t("caloriesChip"), t("dietChip"), t("cuisineChip")]}
        icon={<SlidersHorizontal className="h-6 w-6" />}
        stats={[
          { label: t("targetStat"), value: `${settings.calorieTarget} kcal` },
          { label: t("cuisineChip"), value: preferredCuisineLabel },
          { label: t("languageSwitch"), value: currentLanguageLabel }
        ]}
        aside={
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("personalTuning")}</p>
            <p className="text-sm leading-relaxed text-emerald-50/72">
              {t("settingsAside")}
            </p>
          </div>
        }
      />

      <motion.div variants={itemVariants}>
        <SettingCard
          icon={<Utensils className="h-5 w-5" />}
          eyebrow={t("preferredCuisine")}
          title={preferredCuisineLabel}
        >
          <div className="flex flex-wrap gap-2">
            {CUISINE_OPTIONS.map((cuisine) => (
              <Pill
                key={cuisine}
                active={settings.preferredCuisine === cuisine}
                onClick={() => void saveSettings({ preferredCuisine: cuisine })}
              >
                {getCuisineDisplayLabel(cuisine, settings.uiLanguage)}
              </Pill>
            ))}
          </div>
        </SettingCard>
      </motion.div>

      <HealthSettingsSection />

      <motion.div variants={itemVariants} className="grid min-w-0 grid-cols-1 gap-5 2xl:grid-cols-2">
        <SettingCard
          icon={<SlidersHorizontal className="h-5 w-5" />}
          eyebrow={t("maxMissingIngredients")}
          title={`${settings.maxMissingIngredients}`}
        >
          <label htmlFor="settings-max-missing-ingredients" className="sr-only">
            {t("maxMissingIngredients")}
          </label>
          <input
            id="settings-max-missing-ingredients"
            name="maxMissingIngredients"
            type="range"
            min="0"
            max="5"
            step="1"
            inputMode="decimal"
            value={settings.maxMissingIngredients}
            onChange={(event) => void saveSettings({ maxMissingIngredients: Number(event.target.value) })}
            className="focus-ring w-full accent-emerald-600"
          />
          <p className="text-sm text-emerald-50/62">
            {t("recipesWillAllowUpTo")} {settings.maxMissingIngredients} {t("missingIngredients")}
          </p>
          <p className="text-xs font-medium text-cyan-200/85">{t("pantryMatchesRecommended")}</p>
        </SettingCard>

        <SettingCard
          icon={<ChefHat className="h-5 w-5" />}
          eyebrow={t("recipeCount")}
          title={`${settings.recipeCount}`}
        >
          <label htmlFor="settings-recipe-count" className="sr-only">
            {t("recipeCount")}
          </label>
          <input
            id="settings-recipe-count"
            name="recipeCount"
            type="range"
            min="1"
            max="10"
            step="1"
            inputMode="decimal"
            value={settings.recipeCount}
            onChange={(event) => void saveSettings({ recipeCount: Number(event.target.value) })}
            className="focus-ring w-full accent-emerald-600"
          />
          <p className="text-sm text-emerald-50/62">
            {t("recipesWillGenerate")} {settings.recipeCount} {t("recipesPerScan")}
          </p>
        </SettingCard>

      </motion.div>

      <HealthSafetySettingsSection />

      <motion.div variants={itemVariants}>
        <SettingCard
          icon={<Scale className="h-5 w-5" />}
          eyebrow={t("legalSafety")}
          title={t("useWithVerification")}
        >
          <p className="text-sm leading-relaxed text-emerald-50/62">
            {t("settingsLegalDesc")}
          </p>
          <div className="flex flex-wrap gap-3">
            <LegalLink href="/legal/disclaimer">{t("aiDisclaimerShort")}</LegalLink>
            <LegalLink href="/legal/terms">{t("termsOfService")}</LegalLink>
            <LegalLink href="/legal/privacy">{t("privacyPolicy")}</LegalLink>
          </div>
        </SettingCard>
      </motion.div>
    </motion.div>
  );
}

function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="focus-ring inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-emerald-50 transition-ui hover:border-cyan-300/30 hover:bg-white/[0.10]"
    >
      {children}
    </Link>
  );
}

function SettingCard({
  eyebrow,
  title,
  icon,
  children,
  className
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className ? `min-w-0 rounded-[1.6rem] space-y-4 sm:rounded-[2rem] ${className}` : "min-w-0 rounded-[1.6rem] space-y-4 sm:rounded-[2rem]"}>
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-white/[0.08] p-3 text-cyan-100">{icon}</div>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{eyebrow}</p>
          <h3 className="text-xl font-display font-bold text-white sm:text-2xl">{title}</h3>
        </div>
      </div>
      {children}
    </Card>
  );
}
