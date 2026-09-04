"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calculator, Check, Flame, Heart, Ruler, Scale, Target, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useApp } from "@/contexts/AppContext";
import { itemVariants } from "@/lib/animations";
import type { TranslationKey } from "@/lib/translations";
import { cn } from "@/lib/utils";

const DIETS = [
  { id: "vegetarian", key: "vegetarian", desc: "vegetarianDesc" },
  { id: "pescatarian", key: "pescatarian", desc: "pescatarianDesc" },
  { id: "vegan", key: "vegan", desc: "veganDesc" },
  { id: "keto", key: "keto", desc: "ketoDesc" },
  { id: "paleo", key: "paleo", desc: "paleoDesc" },
  { id: "glutenFree", key: "glutenFree", desc: "glutenFreeDesc" },
  { id: "dairyFree", key: "dairyFree", desc: "dairyFreeDesc" }
] as const;

export function HealthSettingsSection() {
  const { t, health, saveHealth, rtl, settings, saveSettings } = useApp();
  const bmiValue = computeBmi(health.weightKg ?? null, health.heightCm ?? null);

  const toggleDiet = async (value: string) => {
    const current = health.diets;
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    await saveHealth({ diets: next });
  };

  return (
    <section aria-labelledby="health-settings-title" className="space-y-4 sm:space-y-5">
      <div className="flex items-start gap-3 px-1 sm:gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-cyan-100">
          <Heart className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("personalNutritionRules")}</p>
          <h2 id="health-settings-title" className="mt-1.5 font-display text-2xl font-bold text-white sm:text-3xl">
            {t("healthProfile")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-emerald-50/62">
            {t("healthProfileDesc")}
          </p>
        </div>
      </div>

      <motion.div variants={itemVariants} className="grid gap-5 2xl:grid-cols-2">
        <BodyMetricsCard
          key={`${health.weightKg ?? ""}:${health.heightCm ?? ""}`}
          savedWeightKg={health.weightKg ?? null}
          savedHeightCm={health.heightCm ?? null}
          bmiValue={bmiValue}
          calorieTarget={settings.calorieTarget}
          savedTargetWeightKg={settings.targetWeightKg ?? null}
          savedGoalTimelineMonths={settings.goalTimelineMonths ?? null}
          t={t}
          onSaveHealth={(next) => saveHealth(next)}
          onSaveSettings={saveSettings}
        />

        <Card className="rounded-[1.6rem] space-y-4 sm:rounded-[2rem] 2xl:col-span-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("dietaryPrefs")}</p>
            <h3 className="mt-2 text-xl font-display font-bold text-white sm:text-2xl">{t("dietaryProfile")}</h3>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {DIETS.map((diet) => (
              <SelectableRow
                key={diet.id}
                active={health.diets.includes(diet.id)}
                title={t(diet.key)}
                description={t(diet.desc)}
                rtl={rtl}
                onClick={() => void toggleDiet(diet.id)}
              />
            ))}
          </div>
        </Card>
      </motion.div>
    </section>
  );
}

export function HealthSafetySettingsSection() {
  const { t, health, saveHealth, rtl } = useApp();

  return (
    <motion.section variants={itemVariants} aria-label={t("healthConditions")} className="grid gap-5 2xl:grid-cols-2">

      <Card className="rounded-[1.6rem] space-y-4 sm:rounded-[2rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("healthConditions")}</p>
            <h3 className="mt-2 text-xl font-display font-bold text-white sm:text-2xl">{t("healthConditionsTitle")}</h3>
            <p className="mt-2 text-sm font-semibold text-cyan-100/72">{t("comingSoon")}</p>
          </div>

          {health.conditions.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-wrap gap-2">
                {health.conditions.map((condition) => (
                  <span key={condition} className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-sm text-emerald-50/72">
                    {condition}
                  </span>
                ))}
              </div>
              <Button
                className="mt-3"
                variant="secondary"
                leftIcon={<X className="h-4 w-4" />}
                onClick={() => void saveHealth({ conditions: [] })}
              >
                {rtl ? "مسح الحالات المحفوظة" : "Clear saved conditions"}
              </Button>
            </div>
          )}

          <div className="theme-callout-warn rounded-[1.35rem] border border-amber-200/16 bg-amber-400/10 px-4 py-4 text-sm font-medium leading-relaxed text-amber-50/92 sm:rounded-[1.5rem] sm:px-5">
            <strong>{t("medicalDisclaimer")}</strong> {t("medicalDisclaimerText")}
            <p className="mt-2">{t("healthRiskExtra")}</p>
          </div>
      </Card>

      <Card className="rounded-[1.6rem] space-y-4 sm:rounded-[2rem]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("allergensChip")}</p>
              <h3 className="mt-2 text-xl font-display font-bold text-white sm:text-2xl">{t("allergensTitle")}</h3>
            </div>
            <span className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              {t("comingSoon")}
            </span>
          </div>

          <fieldset disabled aria-disabled="true" className="flex flex-col gap-3 opacity-55 sm:flex-row">
            <label htmlFor="health-allergen-input" className="sr-only">
              {t("addAllergen")}
            </label>
            <input
              id="health-allergen-input"
              name="health-allergen-input"
              placeholder={t("addAllergen")}
              autoComplete="off"
              spellCheck={false}
              className="neo-input h-12 flex-1 cursor-not-allowed rounded-2xl px-4 text-sm"
            />
            <Button variant="secondary" disabled>
              {t("addAllergen")}
            </Button>
          </fieldset>
      </Card>
    </motion.section>
  );
}

function SelectableRow({
  active,
  title,
  description,
  rtl,
  onClick
}: {
  active: boolean;
  title: string;
  description: string;
  rtl: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 transition-ui",
        rtl ? "flex-row-reverse text-right" : "text-left",
        active
          ? "border-emerald-200/28 bg-emerald-400/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-white/10 bg-white/[0.04] hover:border-cyan-200/22 hover:bg-white/[0.07]"
      )}
      dir={rtl ? "rtl" : "ltr"}
    >
      <div className="flex-1">
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm text-emerald-50/58">{description}</p>
      </div>
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-ui",
          active
            ? "border-emerald-200/30 bg-emerald-300/22 text-white"
            : "border-white/10 bg-white/[0.04] text-transparent"
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </button>
  );
}

function parseMetricInput(value: string, max: number): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(max, Math.round(parsed * 10) / 10);
}

function computeBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const meters = heightCm / 100;
  if (meters <= 0) return null;
  return weightKg / (meters * meters);
}

function formatMetric(value: number | null | undefined, unit: string, t: (key: TranslationKey) => string) {
  return value != null ? `${value} ${unit}` : t("notSet");
}

function MetricStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
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

function BodyMetricsCard({
  savedWeightKg,
  savedHeightCm,
  bmiValue,
  calorieTarget,
  savedTargetWeightKg,
  savedGoalTimelineMonths,
  t,
  onSaveHealth,
  onSaveSettings
}: {
  savedWeightKg: number | null;
  savedHeightCm: number | null;
  bmiValue: number | null;
  calorieTarget: number;
  savedTargetWeightKg: number | null;
  savedGoalTimelineMonths: number | null;
  t: (key: TranslationKey) => string;
  onSaveHealth: (next: { weightKg: number | null; heightCm: number | null }) => Promise<void>;
  onSaveSettings: (next: {
    targetWeightKg?: number | null;
    goalTimelineMonths?: number | null;
    calorieTarget?: number;
  }) => Promise<void>;
}) {
  const [weightInput, setWeightInput] = useState(savedWeightKg != null ? String(savedWeightKg) : "");
  const [heightInput, setHeightInput] = useState(savedHeightCm != null ? String(savedHeightCm) : "");
  const [targetWeightInput, setTargetWeightInput] = useState(savedTargetWeightKg != null ? String(savedTargetWeightKg) : "");
  const [timelineInput, setTimelineInput] = useState(savedGoalTimelineMonths != null ? String(savedGoalTimelineMonths) : "");

  const parsedWeight = parseMetricInput(weightInput, 400);
  const parsedHeight = parseMetricInput(heightInput, 260);
  const metricsDirty =
    weightInput !== (savedWeightKg != null ? String(savedWeightKg) : "") ||
    heightInput !== (savedHeightCm != null ? String(savedHeightCm) : "");

  useEffect(() => {
    if (!metricsDirty) return;

    const timeout = window.setTimeout(() => {
      void onSaveHealth({ weightKg: parsedWeight, heightCm: parsedHeight });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [heightInput, metricsDirty, onSaveHealth, parsedHeight, parsedWeight, weightInput]);

  const plannerInputs = useMemo(() => {
    const targetWeightKg = parsePositiveNumber(targetWeightInput, 400);
    const goalTimelineMonths = parsePositiveInteger(timelineInput, 24);
    const maintenanceCalories = savedWeightKg ? roundToNearest50(savedWeightKg * 30) : null;
    const dailyAdjustmentCalories =
      savedWeightKg != null && targetWeightKg != null && goalTimelineMonths != null
        ? Math.round(((targetWeightKg - savedWeightKg) * 7700) / (goalTimelineMonths * 30.4))
        : null;
    const suggestedCalorieTarget =
      maintenanceCalories != null && dailyAdjustmentCalories != null
        ? clampCalories(roundToNearest50(maintenanceCalories + dailyAdjustmentCalories))
        : null;
    const monthlyWeightDeltaKg =
      savedWeightKg != null && targetWeightKg != null && goalTimelineMonths != null
        ? Math.round((((targetWeightKg - savedWeightKg) / goalTimelineMonths) * 10)) / 10
        : null;

    return {
      targetWeightKg,
      goalTimelineMonths,
      maintenanceCalories,
      dailyAdjustmentCalories,
      suggestedCalorieTarget,
      monthlyWeightDeltaKg
    };
  }, [savedWeightKg, targetWeightInput, timelineInput]);

  const saveGoalPlanner = useCallback(async () => {
    await onSaveSettings({
      targetWeightKg: plannerInputs.targetWeightKg,
      goalTimelineMonths: plannerInputs.goalTimelineMonths,
      ...(plannerInputs.suggestedCalorieTarget != null
        ? { calorieTarget: plannerInputs.suggestedCalorieTarget }
        : {})
    });
  }, [onSaveSettings, plannerInputs.goalTimelineMonths, plannerInputs.suggestedCalorieTarget, plannerInputs.targetWeightKg]);

  const plannerDirty =
    targetWeightInput !== (savedTargetWeightKg != null ? String(savedTargetWeightKg) : "") ||
    timelineInput !== (savedGoalTimelineMonths != null ? String(savedGoalTimelineMonths) : "");

  useEffect(() => {
    if (!plannerDirty) return;
    const timeout = window.setTimeout(() => void saveGoalPlanner(), 500);
    return () => window.clearTimeout(timeout);
  }, [plannerDirty, saveGoalPlanner]);

  return (
    <Card className="rounded-[1.6rem] space-y-5 sm:rounded-[2rem] 2xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("bodyMetrics")}</p>
          <h3 className="mt-2 text-xl font-display font-bold text-white sm:text-2xl">{t("bodyMetricsTitle")}</h3>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-emerald-50/62">
            {t("bodyMetricsDesc")}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-cyan-100">
          <Scale className="h-5 w-5" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50/52">
            {t("currentWeight")}
          </span>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={weightInput}
              onChange={(event) => setWeightInput(event.target.value)}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.1"
              placeholder="72"
              className="focus-ring neo-input h-11 min-w-0 flex-1 rounded-2xl px-4 text-sm transition-ui"
            />
            <span className="text-sm font-semibold text-emerald-50/72">kg</span>
          </div>
        </label>

        <label className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50/52">
            {t("height")}
          </span>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={heightInput}
              onChange={(event) => setHeightInput(event.target.value)}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.1"
              placeholder="170"
              className="focus-ring neo-input h-11 min-w-0 flex-1 rounded-2xl px-4 text-sm transition-ui"
            />
            <span className="text-sm font-semibold text-emerald-50/72">cm</span>
          </div>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricStat label={t("currentWeight")} value={formatMetric(savedWeightKg, "kg", t)} icon={<Scale className="h-4 w-4" />} />
        <MetricStat label={t("height")} value={formatMetric(savedHeightCm, "cm", t)} icon={<Ruler className="h-4 w-4" />} />
        <MetricStat label={t("bmiLabel")} value={bmiValue != null ? bmiValue.toFixed(1) : t("notSet")} icon={<Heart className="h-4 w-4" />} />
      </div>

      <div className="space-y-2">
        <p className="text-sm leading-relaxed text-emerald-50/58">{t("bodyMetricsHint")}</p>
        <p className="text-xs font-medium text-cyan-200/85">{t("bodyMetricsAutoSave")}</p>
      </div>

      <div className="h-px bg-white/[0.08]" />

      <section aria-labelledby="body-calorie-target" className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-cyan-100">
            <Flame className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("dailyCalorieTarget")}</p>
            <h4 id="body-calorie-target" className="mt-1 font-display text-xl font-bold text-white">{calorieTarget} kcal</h4>
          </div>
        </div>
        <label htmlFor="settings-calorie-target" className="sr-only">{t("dailyCalorieTarget")}</label>
        <input
          id="settings-calorie-target"
          name="calorieTarget"
          type="range"
          min="1200"
          max="4000"
          step="50"
          inputMode="decimal"
          value={calorieTarget}
          onChange={(event) => void onSaveSettings({ calorieTarget: Number(event.target.value) })}
          className="focus-ring w-full accent-emerald-600"
        />
        <p className="text-sm text-emerald-50/62">
          {t("recipesWillAimFor")} {Math.round(calorieTarget / 3)} {t("kcalPerMeal")}
        </p>
      </section>

      <div className="h-px bg-white/[0.08]" />

      <section aria-labelledby="body-goal-planner" className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-cyan-100">
            <Calculator className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("goalCaloriePlanner")}</p>
            <h4 id="body-goal-planner" className="mt-1 font-display text-xl font-bold text-white">
              {plannerInputs.suggestedCalorieTarget != null ? `${plannerInputs.suggestedCalorieTarget} kcal` : t("setGoalInputs")}
            </h4>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-emerald-50/62">{t("goalCaloriePlannerDesc")}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("targetWeight")}</span>
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
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("goalTimelineMonths")}</span>
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
          <MetricStat
            label={t("estimatedMaintenance")}
            value={plannerInputs.maintenanceCalories != null ? `${plannerInputs.maintenanceCalories} kcal` : t("addWeightFirst")}
            icon={<Scale className="h-4 w-4" />}
          />
          <MetricStat
            label={t("dailyAdjustment")}
            value={plannerInputs.dailyAdjustmentCalories != null
              ? `${plannerInputs.dailyAdjustmentCalories > 0 ? "+" : ""}${plannerInputs.dailyAdjustmentCalories} kcal`
              : t("setGoalInputs")}
            icon={<Target className="h-4 w-4" />}
          />
          <MetricStat
            label={t("monthlyPace")}
            value={plannerInputs.monthlyWeightDeltaKg != null
              ? `${plannerInputs.monthlyWeightDeltaKg > 0 ? "+" : ""}${plannerInputs.monthlyWeightDeltaKg} kg`
              : t("setGoalInputs")}
            icon={<Calculator className="h-4 w-4" />}
          />
        </div>

        {savedWeightKg == null ? (
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
      </section>
    </Card>
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
