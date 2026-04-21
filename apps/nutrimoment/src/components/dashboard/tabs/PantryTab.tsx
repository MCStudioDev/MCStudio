"use client";

import { ChangeEvent, useState } from "react";
import { motion } from "framer-motion";
import { ImagePlus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useApp } from "@/contexts/AppContext";
import { usePantry } from "@/hooks/usePantry";
import { containerVariants, itemVariants } from "@/lib/animations";
import { getPantryQuantityHint } from "@/lib/pantryQuantity";
import { fileToBase64 } from "@/lib/utils";
import type { PantryItem } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";

export function PantryTab() {
  const { t, setError } = useApp();
  const { items, addItem, removeItem, clear, loading } = usePantry();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scannedItems, setScannedItems] = useState<PantryItem[]>([]);

  const handleAddItem = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addItem({
        name: name.trim(),
        quantity: quantity.trim() || "1"
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

  const handleScanPantry = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setScanLoading(true);
    try {
      const image = await fileToBase64(file);
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          language: "English",
          isPantry: true
        })
      });
      const data = (await response.json()) as { pantryItems?: PantryItem[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to scan pantry");
      }

      setScannedItems(Array.isArray(data.pantryItems) ? data.pantryItems : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to scan pantry";
      setError(message);
    } finally {
      setScanLoading(false);
    }
  };

  const updateScannedItem = (index: number, field: "name" | "quantity", value: string) => {
    setScannedItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    );
  };

  const addManualScannedItem = () => {
    setScannedItems((current) => [...current, { name: "", quantity: "1 item" }]);
  };

  const removeScannedItem = (index: number) => {
    setScannedItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const saveScannedItems = async () => {
    const validItems = scannedItems
      .map((item) => ({
        name: item.name.trim(),
        quantity: item.quantity?.trim() || "1 item"
      }))
      .filter((item) => Boolean(item.name));

    if (!validItems.length) {
      setError("No pantry items to save.");
      return;
    }

    setSaving(true);
    try {
      for (const pantryItem of validItems) {
        await addItem(pantryItem);
      }
      setScannedItems([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save scanned pantry items";
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

          <label className="block">
            <input type="file" accept="image/*" className="hidden" onChange={handleScanPantry} />
            <span className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-emerald-200 bg-emerald-50/60 px-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50">
              <ImagePlus className="h-8 w-8 text-emerald-600" />
              <span className="text-sm font-semibold text-stone-800">
                {scanLoading ? t("analyzingPantry") : "Upload a pantry image"}
              </span>
              <span className="text-xs text-stone-500">We will estimate pantry items and approximate quantities.</span>
            </span>
          </label>

          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("ingredientName")}
            className="h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm outline-none focus:border-emerald-400"
          />
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder={name.trim() ? getPantryQuantityHint(name) : t("quantity")}
            className="h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm outline-none focus:border-emerald-400"
          />
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-xs leading-relaxed text-cyan-800">
            Quantity guide: rice/oats/lentils use cups, tomato/onion/egg use whole/items, garlic uses cloves,
            olive oil uses tbsp, chicken breast uses lb, yogurt uses cups.
          </div>

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
          {scannedItems.length ? (
            <Card className="rounded-[2rem] space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{t("pantryScan")}</p>
                  <h3 className="mt-2 text-2xl font-display font-bold text-stone-900">Review scanned pantry items</h3>
                  <p className="mt-2 text-sm text-stone-500">Adjust names or quantities before saving them to your pantry.</p>
                </div>
                <Button variant="ghost" onClick={addManualScannedItem}>
                  {t("add")}
                </Button>
              </div>

              <div className="grid gap-3">
                {scannedItems.map((item, index) => (
                  <Card key={`${item.name}-${index}`} variant="plain" className="rounded-[1.5rem] p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                      <input
                        value={item.name}
                        onChange={(event) => updateScannedItem(index, "name", event.target.value)}
                        placeholder={t("ingredientName")}
                        className="h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm outline-none focus:border-emerald-400"
                      />
                      <input
                        value={item.quantity ?? ""}
                        onChange={(event) => updateScannedItem(index, "quantity", event.target.value)}
                        placeholder={item.name.trim() ? getPantryQuantityHint(item.name) : t("quantity")}
                        className="h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm outline-none focus:border-emerald-400"
                      />
                      <button
                        type="button"
                        onClick={() => removeScannedItem(index)}
                        className="rounded-2xl bg-red-50 p-3 text-red-600 transition hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>

              <Button fullWidth loading={saving} onClick={saveScannedItems}>
                {t("addItemsToPantry")}
              </Button>
            </Card>
          ) : loading ? (
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
