"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Calculator, ChefHat, Flame, Scale, SlidersHorizontal, Target, Utensils } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { useApp } from "@/contexts/AppContext";
import { containerVariants, itemVariants } from "@/lib/animations";
import { CUISINE_OPTIONS, getCuisineDisplayLabel } from "@/lib/cuisines";
import type { TranslationKey } from "@/lib/translations";
import { SectionHero } from "./shared";

export function SettingsTab() {
  const { t, settings, saveSettings, health } = useApp();
  const currentLanguageLabel = settings.uiLanguage === "ar" ? t("arabic") : t("english");
  const preferredCuisineLabel = getCuisineDisplayLabel(settings.preferredCuisine, settings.uiLanguage);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-5 sm:space-y-6">
      <SectionHero
        title={t("preferences")}
        description={t("preferencesDesc")}
        eyebrow={t("controlCenter")}
        chips={[t("caloriesChip"), t("cuisineChip"), currentLanguageLabel]}
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

      <motion.div variants={itemVariants} className="grid min-w-0 grid-cols-1 gap-5 2xl:grid-cols-2">
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
            onChange={(event) => void saveSettings({ calorieTarget: Number(event.target.value) })}
            className="focus-ring w-full accent-emerald-600"
          />
          <p className="text-sm text-emerald-50/62">
            {t("recipesWillAimFor")} {Math.round(settings.calorieTarget / 3)} {t("kcalPerMeal")}
          </p>
        </SettingCard>

        <GoalPlannerCard
          key={`${settings.targetWeightKg ?? ""}:${settings.goalTimelineMonths ?? ""}:${health.weightKg ?? ""}`}
          currentWeightKg={health.weightKg ?? null}
          savedTargetWeightKg={settings.targetWeightKg ?? null}
          savedGoalTimelineMonths={settings.goalTimelineMonths ?? null}
          t={t}
          onSave={saveSettings}
        />

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

        <SettingCard
          icon={<Scale className="h-5 w-5" />}
          eyebrow={t("legalSafety")}
          title={t("useWithVerification")}
          className="2xl:col-span-2"
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

function parsePositiveNumber(value: string, max: number): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(max, Math.round(parsed * 10) / 10);
}

function parsePositiveInteger(value: string, max: number): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(max, Math.max(1, Math.round(parsed)));
}

function clampCalories(value: number) {
  return Math.max(1200, Math.min(4000, value));
}

function roundToNearest50(value: number) {
  return Math.round(value / 50) * 50;
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

function PlannerStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
      <div className="flex items-center gap-2 text-cyan-200">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">{label}</p>
      </div>
      <p className="mt-2 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function GoalPlannerCard({
  currentWeightKg,
  savedTargetWeightKg,
  savedGoalTimelineMonths,
  t,
  onSave
}: {
  currentWeightKg: number | null;
  savedTargetWeightKg: number | null;
  savedGoalTimelineMonths: number | null;
  t: (key: TranslationKey) => string;
  onSave: (next: {
    targetWeightKg?: number | null;
    goalTimelineMonths?: number | null;
    calorieTarget?: number;
  }) => Promise<void>;
}) {
  const [targetWeightInput, setTargetWeightInput] = useState(savedTargetWeightKg != null ? String(savedTargetWeightKg) : "");
  const [timelineInput, setTimelineInput] = useState(savedGoalTimelineMonths != null ? String(savedGoalTimelineMonths) : "");

  const plannerInputs = useMemo(() => {
    const targetWeightKg = parsePositiveNumber(targetWeightInput, 400);
    const goalTimelineMonths = parsePositiveInteger(timelineInput, 24);
    const maintenanceCalories = currentWeightKg ? roundToNearest50(currentWeightKg * 30) : null;
    const dailyAdjustmentCalories =
      currentWeightKg != null && targetWeightKg != null && goalTimelineMonths != null
        ? Math.round(((targetWeightKg - currentWeightKg) * 7700) / (goalTimelineMonths * 30.4))
        : null;
    const suggestedCalorieTarget =
      maintenanceCalories != null && dailyAdjustmentCalories != null
        ? clampCalories(roundToNearest50(maintenanceCalories + dailyAdjustmentCalories))
        : null;
    const monthlyWeightDeltaKg =
      currentWeightKg != null && targetWeightKg != null && goalTimelineMonths != null
        ? Math.round((((targetWeightKg - currentWeightKg) / goalTimelineMonths) * 10)) / 10
        : null;

    return {
      targetWeightKg,
      goalTimelineMonths,
      maintenanceCalories,
      dailyAdjustmentCalories,
      suggestedCalorieTarget,
      monthlyWeightDeltaKg
    };
  }, [currentWeightKg, targetWeightInput, timelineInput]);

  const saveGoalPlanner = useCallback(
    async (includeSuggestedCalories: boolean) => {
      const next: Parameters<typeof onSave>[0] = {
        targetWeightKg: plannerInputs.targetWeightKg,
        goalTimelineMonths: plannerInputs.goalTimelineMonths
      };

      if (includeSuggestedCalories && plannerInputs.suggestedCalorieTarget != null) {
        next.calorieTarget = plannerInputs.suggestedCalorieTarget;
      }

      await onSave(next);
    },
    [onSave, plannerInputs.goalTimelineMonths, plannerInputs.suggestedCalorieTarget, plannerInputs.targetWeightKg]
  );

  const plannerDirty =
    targetWeightInput !== (savedTargetWeightKg != null ? String(savedTargetWeightKg) : "") ||
    timelineInput !== (savedGoalTimelineMonths != null ? String(savedGoalTimelineMonths) : "");

  useEffect(() => {
    if (!plannerDirty) return;

    const timeout = window.setTimeout(() => {
      void saveGoalPlanner(true);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [plannerDirty, saveGoalPlanner]);

  return (
    <SettingCard
      icon={<Calculator className="h-5 w-5" />}
      eyebrow={t("goalCaloriePlanner")}
      title={plannerInputs.suggestedCalorieTarget != null ? `${plannerInputs.suggestedCalorieTarget} kcal` : t("setGoalInputs")}
    >
      <p className="text-sm leading-relaxed text-emerald-50/62">{t("goalCaloriePlannerDesc")}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50/52">
            {t("targetWeight")}
          </span>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={targetWeightInput}
              onChange={(event) => setTargetWeightInput(event.target.value)}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.1"
              placeholder="68"
              className="focus-ring neo-input h-11 min-w-0 flex-1 rounded-2xl px-4 text-sm transition-ui"
            />
            <span className="text-sm font-semibold text-emerald-50/72">kg</span>
          </div>
        </label>

        <label className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50/52">
            {t("goalTimelineMonths")}
          </span>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={timelineInput}
              onChange={(event) => setTimelineInput(event.target.value)}
              inputMode="numeric"
              type="number"
              min="1"
              step="1"
              placeholder="4"
              className="focus-ring neo-input h-11 min-w-0 flex-1 rounded-2xl px-4 text-sm transition-ui"
            />
            <span className="text-sm font-semibold text-emerald-50/72">{t("monthsShort")}</span>
          </div>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <PlannerStat
          label={t("estimatedMaintenance")}
          value={plannerInputs.maintenanceCalories != null ? `${plannerInputs.maintenanceCalories} kcal` : t("addWeightFirst")}
          icon={<Scale className="h-4 w-4" />}
        />
        <PlannerStat
          label={t("dailyAdjustment")}
          value={
            plannerInputs.dailyAdjustmentCalories != null
              ? `${plannerInputs.dailyAdjustmentCalories > 0 ? "+" : ""}${plannerInputs.dailyAdjustmentCalories} kcal`
              : t("setGoalInputs")
          }
          icon={<Target className="h-4 w-4" />}
        />
        <PlannerStat
          label={t("monthlyPace")}
          value={
            plannerInputs.monthlyWeightDeltaKg != null
              ? `${plannerInputs.monthlyWeightDeltaKg > 0 ? "+" : ""}${plannerInputs.monthlyWeightDeltaKg} kg`
              : t("setGoalInputs")
          }
          icon={<Calculator className="h-4 w-4" />}
        />
      </div>

      {currentWeightKg == null ? (
        <div className="rounded-[1.35rem] border border-amber-200/16 bg-amber-400/10 px-4 py-4 text-sm leading-relaxed text-amber-50/90">
          {t("goalPlannerNeedsWeight")}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-emerald-50/58">{t("goalPlannerDisclaimer")}</p>
      )}

      <div className="space-y-2">
        <p className="text-sm leading-relaxed text-emerald-50/58">{t("goalPlannerAutoApply")}</p>
        <p className="text-xs font-medium text-cyan-200/85">{t("goalPlannerAutoSave")}</p>
      </div>
    </SettingCard>
  );
}
