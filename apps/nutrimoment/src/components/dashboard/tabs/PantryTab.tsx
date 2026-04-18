"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useApp } from "@/contexts/AppContext";
import { usePantry } from "@/hooks/usePantry";
import { containerVariants, itemVariants } from "@/lib/animations";
import { EmptyState, SectionHero } from "./shared";

export function PantryTab() {
  const { t, setError } = useApp();
  const { items, addItem, removeItem, clear, loading } = usePantry();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAddItem = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addItem({
        name: name.trim(),
        quantity: quantity.trim() || "1",
        expiration: undefined
      });
      setName("");
      setQuantity("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add pantry item";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      await clear();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear pantry";
      setError(message);
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero title={t("myPantry")} description={t("keepTrack")} icon={<ShoppingCart className="h-6 w-6" />} />

      <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[2rem] space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{t("addItem")}</p>
            <h3 className="mt-2 text-2xl font-display font-bold text-stone-900">Add to your pantry</h3>
          </div>

          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("ingredientName")}
            className="h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm outline-none focus:border-emerald-400"
          />
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder={t("quantity")}
            className="h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm outline-none focus:border-emerald-400"
          />

          <Button
            fullWidth
            variant="secondary"
            loading={saving}
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={handleAddItem}
          >
            {t("add")}
          </Button>

          <Card variant="plain" className="rounded-[1.5rem] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{t("items")}</p>
            <p className="mt-2 text-3xl font-display font-bold text-stone-900">{items.length}</p>
          </Card>
        </Card>

        <motion.div variants={itemVariants}>
          {loading ? (
            <Card className="rounded-[2rem] text-sm text-stone-500">Loading pantry...</Card>
          ) : items.length ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="ghost" onClick={handleClear}>
                  {t("clearAll")}
                </Button>
              </div>
              <div className="grid gap-4">
                {items.map((item) => (
                  <Card key={item.id ?? item.name} className="rounded-[1.75rem] flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-stone-900 truncate">{item.name}</p>
                      <p className="text-sm text-stone-500">{item.quantity || "1"}</p>
                    </div>
                    {item.id ? (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id!)}
                        className="rounded-2xl bg-red-50 p-3 text-red-600 transition hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title={t("pantryEmpty")} description={t("scanFridgeStart")} />
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
