"use client";

import { KeyboardEvent, useState } from "react";
import { motion } from "framer-motion";
import { Heart, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { useApp } from "@/contexts/AppContext";
import { containerVariants, itemVariants } from "@/lib/animations";
import { SectionHero } from "./shared";

const DIETS = [
  { id: "vegetarian", key: "vegetarian", desc: "vegetarianDesc" },
  { id: "vegan", key: "vegan", desc: "veganDesc" },
  { id: "keto", key: "keto", desc: "ketoDesc" },
  { id: "paleo", key: "paleo", desc: "paleoDesc" },
  { id: "glutenFree", key: "glutenFree", desc: "glutenFreeDesc" },
  { id: "dairyFree", key: "dairyFree", desc: "dairyFreeDesc" }
] as const;

const CONDITIONS = [
  { id: "diabetes", key: "diabetes", desc: "diabetesDesc" },
  { id: "highBloodPressure", key: "highBloodPressure", desc: "highBloodPressureDesc" },
  { id: "lowBloodPressure", key: "lowBloodPressure", desc: "lowBloodPressureDesc" },
  { id: "weightGain", key: "weightGain", desc: "weightGainDesc" },
  { id: "weightLoss", key: "weightLoss", desc: "weightLossDesc" },
  { id: "cholesterol", key: "cholesterol", desc: "cholesterolDesc" }
] as const;

export function HealthTab() {
  const { t, health, saveHealth } = useApp();
  const [allergenInput, setAllergenInput] = useState("");

  const toggleValue = async (group: "diets" | "conditions", value: string) => {
    const current = health[group];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    await saveHealth({ [group]: next });
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
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero
        title={t("healthProfile")}
        description={t("healthProfileDesc")}
        eyebrow={t("personalNutritionRules")}
        chips={[t("dietChip"), t("conditionsChip"), t("allergensChip")]}
        icon={<Heart className="h-6 w-6" />}
        stats={[
          { label: t("dietChip"), value: `${health.diets.length} ${t("activeSuffix")}` },
          { label: t("conditionsChip"), value: `${health.conditions.length} ${t("activeSuffix")}` },
          { label: t("allergensChip"), value: `${(health.allergens ?? []).length} ${t("blockedSuffix")}` }
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

      <motion.div variants={itemVariants} className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-[2rem] space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("dietaryPrefs")}</p>
            <h3 className="mt-2 text-2xl font-display font-bold text-white">{t("dietaryProfile")}</h3>
          </div>

          <div className="flex flex-wrap gap-3">
            {DIETS.map((diet) => (
              <Pill
                key={diet.id}
                active={health.diets.includes(diet.id)}
                onClick={() => toggleValue("diets", diet.id)}
              >
                {t(diet.key)}
              </Pill>
            ))}
          </div>

          <div className="grid gap-3">
            {DIETS.map((diet) => (
              <div key={diet.id} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="font-semibold text-white">{t(diet.key)}</p>
                <p className="mt-1 text-sm text-emerald-50/58">{t(diet.desc)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[2rem] space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("healthConditions")}</p>
            <h3 className="mt-2 text-2xl font-display font-bold text-white">{t("healthConditionsTitle")}</h3>
          </div>

          <div className="flex flex-wrap gap-3">
            {CONDITIONS.map((condition) => (
              <Pill
                key={condition.id}
                active={health.conditions.includes(condition.id)}
                onClick={() => toggleValue("conditions", condition.id)}
              >
                {t(condition.key)}
              </Pill>
            ))}
          </div>

          <div className="rounded-[1.5rem] border border-amber-200/16 bg-amber-400/10 px-5 py-4 text-sm leading-relaxed text-amber-50/90">
            <strong>{t("medicalDisclaimer")}</strong> {t("medicalDisclaimerText")}
            <p className="mt-2">{t("healthRiskExtra")}</p>
          </div>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card className="rounded-[2rem] space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("allergensTitle")}</p>
            <h3 className="mt-2 text-2xl font-display font-bold text-white">{t("allergensTitle")}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-50/62">
              {t("allergensDesc")}
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
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
                <Pill key={allergen} active onClick={() => void removeAllergen(allergen)}>
                  {allergen}
                </Pill>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-white/12 bg-white/[0.04] px-5 py-4 text-sm text-emerald-50/58">
              {t("noAllergens")}
            </div>
          )}
        </Card>
      </motion.div>
    </motion.div>
  );
}
