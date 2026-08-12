"use client";

import { KeyboardEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Heart, Plus, Ruler, Scale } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useApp } from "@/contexts/AppContext";
import { containerVariants, itemVariants } from "@/lib/animations";
import type { TranslationKey } from "@/lib/translations";
import { cn } from "@/lib/utils";
import { SectionHero } from "./shared";

const DIETS = [
  { id: "vegetarian", key: "vegetarian", desc: "vegetarianDesc" },
  { id: "pescatarian", key: "pescatarian", desc: "pescatarianDesc" },
  { id: "vegan", key: "vegan", desc: "veganDesc" },
  { id: "keto", key: "keto", desc: "ketoDesc" },
  { id: "paleo", key: "paleo", desc: "paleoDesc" },
  { id: "glutenFree", key: "glutenFree", desc: "glutenFreeDesc" },
  { id: "dairyFree", key: "dairyFree", desc: "dairyFreeDesc" }
] as const;

export function HealthTab() {
  const { t, health, saveHealth, rtl } = useApp();
  const [allergenInput, setAllergenInput] = useState("");
  const bmiValue = computeBmi(health.weightKg ?? null, health.heightCm ?? null);

  const toggleDiet = async (value: string) => {
    const current = health.diets;
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    await saveHealth({ diets: next });
  };

  const addAllergen = async () => {
    const value = allergenInput.trim().toLowerCase();
    if (!value) return;

    const next = Array.from(new Set([...(health.allergens ?? []), value]));
    await saveHealth({ allergens: next });
    setAllergenInput("");
  };

  const removeAllergen = async (value: string) => {
    await saveHealth({ allergens: (health.allergens ?? []).filter((item) => item !== value) });
  };

  const handleAllergenKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await addAllergen();
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-5 sm:space-y-6">
      <SectionHero
        title={t("healthProfile")}
        description={t("healthProfileDesc")}
        eyebrow={t("personalNutritionRules")}
        chips={[t("dietChip"), t("conditionsChip"), t("allergensChip")]}
        icon={<Heart className="h-6 w-6" />}
        stats={[
          { label: t("currentWeight"), value: formatMetric(health.weightKg, "kg", t) },
          { label: t("height"), value: formatMetric(health.heightCm, "cm", t) },
          { label: t("bmiLabel"), value: bmiValue != null ? bmiValue.toFixed(1) : t("notSet") }
        ]}
        aside={
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("trustLayer")}</p>
            <p className="text-sm leading-relaxed text-emerald-50/72">
              {t("healthAside")}
            </p>
          </div>
        }
      />

      <motion.div variants={itemVariants} className="grid gap-5 2xl:grid-cols-2">
        <BodyMetricsCard
          key={`${health.weightKg ?? ""}:${health.heightCm ?? ""}`}
          savedWeightKg={health.weightKg ?? null}
          savedHeightCm={health.heightCm ?? null}
          bmiValue={bmiValue}
          t={t}
          onSave={(next) => saveHealth(next)}
        />

        <Card className="rounded-[1.6rem] space-y-4 sm:rounded-[2rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("dietaryPrefs")}</p>
            <h3 className="mt-2 text-xl font-display font-bold text-white sm:text-2xl">{t("dietaryProfile")}</h3>
          </div>

          <div className="grid gap-3">
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

        <Card className="rounded-[1.6rem] space-y-4 sm:rounded-[2rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("healthConditions")}</p>
            <h3 className="mt-2 text-xl font-display font-bold text-white sm:text-2xl">{t("healthConditionsTitle")}</h3>
            <p className="mt-2 text-sm font-semibold text-cyan-100/72">{t("comingSoon")}</p>
          </div>

          <div className="theme-callout-warn rounded-[1.35rem] border border-amber-200/16 bg-amber-400/10 px-4 py-4 text-sm font-medium leading-relaxed text-amber-50/92 sm:rounded-[1.5rem] sm:px-5">
            <strong>{t("medicalDisclaimer")}</strong> {t("medicalDisclaimerText")}
            <p className="mt-2">{t("healthRiskExtra")}</p>
          </div>
        </Card>

        <Card className="rounded-[1.6rem] space-y-4 sm:rounded-[2rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("allergensTitle")}</p>
            <h3 className="mt-2 text-xl font-display font-bold text-white sm:text-2xl">{t("allergensTitle")}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-50/62">
              {t("allergensDesc")}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="health-allergen-input" className="sr-only">
              {t("addAllergen")}
            </label>
            <input
              id="health-allergen-input"
              name="health-allergen-input"
              value={allergenInput}
              onChange={(event) => setAllergenInput(event.target.value)}
              onKeyDown={(event) => void handleAllergenKeyDown(event)}
              placeholder={t("addAllergen")}
              autoComplete="off"
              spellCheck={false}
              className="focus-ring neo-input h-12 flex-1 rounded-2xl px-4 text-sm transition-ui"
            />
            <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => void addAllergen()}>
              {t("addAllergen")}
            </Button>
          </div>

          {(health.allergens ?? []).length ? (
            <div className="flex flex-wrap gap-3">
              {(health.allergens ?? []).map((allergen) => (
                <button
                  key={allergen}
                  type="button"
                  onClick={() => void removeAllergen(allergen)}
                  className="focus-ring rounded-full border border-emerald-200/22 bg-emerald-400/18 px-3 py-1.5 text-sm font-semibold text-emerald-50 transition-ui hover:bg-red-500/12 hover:text-red-100"
                >
                  {allergen}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.35rem] border border-dashed border-white/12 bg-white/[0.04] px-5 py-4 text-sm text-emerald-50/58 sm:rounded-[1.5rem]">
              {t("noAllergens")}
            </div>
          )}
        </Card>
      </motion.div>
    </motion.div>
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
  t,
  onSave
}: {
  savedWeightKg: number | null;
  savedHeightCm: number | null;
  bmiValue: number | null;
  t: (key: TranslationKey) => string;
  onSave: (next: { weightKg: number | null; heightCm: number | null }) => Promise<void>;
}) {
  const [weightInput, setWeightInput] = useState(savedWeightKg != null ? String(savedWeightKg) : "");
  const [heightInput, setHeightInput] = useState(savedHeightCm != null ? String(savedHeightCm) : "");

  const parsedWeight = parseMetricInput(weightInput, 400);
  const parsedHeight = parseMetricInput(heightInput, 260);
  const metricsDirty =
    weightInput !== (savedWeightKg != null ? String(savedWeightKg) : "") ||
    heightInput !== (savedHeightCm != null ? String(savedHeightCm) : "");

  useEffect(() => {
    if (!metricsDirty) return;

    const timeout = window.setTimeout(() => {
      void onSave({ weightKg: parsedWeight, heightCm: parsedHeight });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [heightInput, metricsDirty, onSave, parsedHeight, parsedWeight, weightInput]);

  return (
    <Card className="rounded-[1.6rem] space-y-4 sm:rounded-[2rem]">
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
    </Card>
  );
}
