"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Flame, Languages, Scale, SlidersHorizontal, Utensils } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { useApp } from "@/contexts/AppContext";
import { containerVariants, itemVariants } from "@/lib/animations";
import { CUISINE_OPTIONS, normalizeCuisineLabel } from "@/lib/cuisines";
import { PILOT_RECIPE_LANGUAGES } from "@/lib/language";
import { SectionHero } from "./shared";

export function SettingsTab() {
  const { t, settings, saveSettings } = useApp();

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero
        title={t("preferences")}
        description={t("preferencesDesc")}
        eyebrow="Control center"
        chips={["Calories", "Cuisine", "Output"]}
        icon={<SlidersHorizontal className="h-6 w-6" />}
        stats={[
          { label: "Target", value: `${settings.calorieTarget} kcal` },
          { label: "Cuisine", value: normalizeCuisineLabel(settings.preferredCuisine) },
          { label: "Recipe lang", value: settings.recipeLanguage }
        ]}
        aside={
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Personal tuning</p>
            <p className="text-sm leading-relaxed text-emerald-50/72">
              Fine-tune how the app thinks so your recipe output feels faster, clearer, and more aligned to your goals.
            </p>
          </div>
        }
      />

      <motion.div variants={itemVariants} className="grid gap-6 xl:grid-cols-2">
        <SettingCard
          icon={<Flame className="h-5 w-5" />}
          eyebrow={t("dailyCalorieTarget")}
          title={`${settings.calorieTarget} kcal`}
        >
          <label htmlFor="settings-calorie-target" className="sr-only">
            {t("dailyCalorieTarget")}
          </label>
          <input
            id="settings-calorie-target"
            name="calorieTarget"
            type="range"
            min="1200"
            max="4000"
            step="50"
            inputMode="decimal"
            value={settings.calorieTarget}
            onChange={(event) => saveSettings({ calorieTarget: Number(event.target.value) })}
            className="focus-ring w-full accent-emerald-600"
          />
          <p className="text-sm text-emerald-50/62">
            {t("recipesWillAimFor")} {Math.round(settings.calorieTarget / 3)} {t("kcalPerMeal")}
          </p>
        </SettingCard>

        <SettingCard
          icon={<Utensils className="h-5 w-5" />}
          eyebrow={t("preferredCuisine")}
          title={normalizeCuisineLabel(settings.preferredCuisine)}
        >
          <div className="flex flex-wrap gap-2">
            {CUISINE_OPTIONS.map((cuisine) => (
              <Pill
                key={cuisine}
                active={settings.preferredCuisine === cuisine}
                onClick={() => saveSettings({ preferredCuisine: cuisine })}
              >
                {cuisine === "Any" ? t("anyCuisine") : cuisine}
              </Pill>
            ))}
          </div>
        </SettingCard>

        <SettingCard
          icon={<Languages className="h-5 w-5" />}
          eyebrow={t("recipeOutputLang")}
          title={settings.recipeLanguage}
        >
          <div className="flex flex-wrap gap-2">
            {PILOT_RECIPE_LANGUAGES.map((language) => (
              <Pill
                key={language}
                active={settings.recipeLanguage === language}
                onClick={() => saveSettings({ recipeLanguage: language })}
              >
                {language}
              </Pill>
            ))}
          </div>
        </SettingCard>

        <SettingCard
          icon={<SlidersHorizontal className="h-5 w-5" />}
          eyebrow={t("maxMissingIngredients")}
          title={`${settings.maxMissingIngredients}`}
          className="xl:col-span-2"
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
            onChange={(event) => saveSettings({ maxMissingIngredients: Number(event.target.value) })}
            className="focus-ring w-full accent-emerald-600"
          />
          <p className="text-sm text-emerald-50/62">
            {t("recipesWillAllowUpTo")} {settings.maxMissingIngredients} {t("missingIngredients")}
          </p>
        </SettingCard>

        <SettingCard
          icon={<Scale className="h-5 w-5" />}
          eyebrow="Legal & Safety"
          title="Use with verification"
          className="xl:col-span-2"
        >
          <p className="text-sm leading-relaxed text-emerald-50/62">
            NutriMoment is designed for informational meal support. Review the disclaimer, terms, and privacy details
            before relying on generated recipes or meal plans.
          </p>
          <div className="flex flex-wrap gap-3">
            <LegalLink href="/legal/disclaimer">AI Disclaimer</LegalLink>
            <LegalLink href="/legal/terms">Terms of Service</LegalLink>
            <LegalLink href="/legal/privacy">Privacy Policy</LegalLink>
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
    <Card className={className ? `rounded-[2rem] space-y-4 ${className}` : "rounded-[2rem] space-y-4"}>
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-white/[0.08] p-3 text-cyan-100">{icon}</div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{eyebrow}</p>
          <h3 className="text-2xl font-display font-bold text-white">{title}</h3>
        </div>
      </div>
      {children}
    </Card>
  );
}
