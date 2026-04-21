"use client";

import { motion } from "framer-motion";
import { Heart } from "lucide-react";
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

  const toggleValue = async (group: "diets" | "conditions", value: string) => {
    const current = health[group];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    await saveHealth({ [group]: next });
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero
        title={t("healthProfile")}
        description={t("healthProfileDesc")}
        icon={<Heart className="h-6 w-6" />}
      />

      <motion.div variants={itemVariants} className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-[2rem] space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{t("dietaryPrefs")}</p>
            <h3 className="mt-2 text-2xl font-display font-bold text-stone-900">Dietary profile</h3>
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
              <div key={diet.id} className="rounded-2xl border border-emerald-100 bg-white px-4 py-3">
                <p className="font-semibold text-stone-900">{t(diet.key)}</p>
                <p className="mt-1 text-sm text-stone-500">{t(diet.desc)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[2rem] space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{t("healthConditions")}</p>
            <h3 className="mt-2 text-2xl font-display font-bold text-stone-900">Health conditions</h3>
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

          <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-900">
            <strong>{t("medicalDisclaimer")}</strong> {t("medicalDisclaimerText")}
            <p className="mt-2">
              NutriMoment cannot confirm diagnosis-specific safety, allergens, medication interactions, pregnancy needs,
              or pediatric suitability. Review every result with a qualified professional when health risk is involved.
            </p>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
