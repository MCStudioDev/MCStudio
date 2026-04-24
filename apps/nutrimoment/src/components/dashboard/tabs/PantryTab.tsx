"use client";

import { ChangeEvent, useState } from "react";
import { motion } from "framer-motion";
import { ImagePlus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePantry } from "@/hooks/usePantry";
import { containerVariants, itemVariants } from "@/lib/animations";
import { getPantryQuantityHint } from "@/lib/pantryQuantity";
import { fileToBase64 } from "@/lib/utils";
import type { PantryItem } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";

export function PantryTab() {
  const { t, setError } = useApp();
  const { access, getAuthHeaders, refreshAccess } = useAuth();
  const { items, addItem, removeItem, clear, loading } = usePantry();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expiration, setExpiration] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scannedItems, setScannedItems] = useState<PantryItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => Promise<void> | void;
  } | null>(null);

  const handleAddItem = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addItem({
        name: name.trim(),
        quantity: quantity.trim() || "1",
        expiration: expiration.trim() || undefined
      });
      setName("");
      setQuantity("");
      setExpiration("");
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
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          image,
          language: "English",
          isPantry: true
        })
      });
      const data = (await response.json()) as { pantryItems?: PantryItem[]; error?: string; fallbackNotice?: string };
      await refreshAccess();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to scan pantry");
      }
      if (data.fallbackNotice) {
        setError(data.fallbackNotice);
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

  const openConfirm = (options: NonNullable<typeof confirmState>) => setConfirmState(options);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <SectionHero title={t("myPantry")} description={t("keepTrack")} icon={<ShoppingCart className="h-6 w-6" />} />

      <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[2rem] space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{t("addItem")}</p>
            <h3 className="mt-2 text-2xl font-display font-bold text-stone-900">Add to your pantry</h3>
          </div>

          {access.tier === "free" ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
              Free plan: pantry image scans use your shared AI credits ({access.aiCreditsRemaining}/{access.aiCreditsLimit} left).
              Manual pantry entry always stays available.
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-800">
              Premium plan: pantry image scans are API-first with manual fallback.
            </div>
          )}

          <label htmlFor="pantry-photo-upload" className="block">
            <span className="sr-only">Upload a pantry image</span>
            <input
              id="pantry-photo-upload"
              name="pantry-photo-upload"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleScanPantry}
              aria-label="Upload a pantry image"
            />
            <span className="focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-emerald-200 bg-emerald-50/60 px-6 text-center transition-ui hover:border-emerald-400 hover:bg-emerald-50">
              <ImagePlus className="h-8 w-8 text-emerald-600" aria-hidden="true" />
              <span className="text-sm font-semibold text-stone-800" aria-live="polite">
                {scanLoading ? t("analyzingPantry") : "Upload a pantry image"}
              </span>
              <span className="text-xs text-stone-500">We will estimate pantry items and approximate quantities.</span>
            </span>
          </label>

          <label htmlFor="pantry-item-name" className="sr-only">
            {t("ingredientName")}
          </label>
          <input
            id="pantry-item-name"
            name="pantry-item-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("ingredientName")}
            autoComplete="off"
            spellCheck
            className="focus-ring h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm transition-ui focus:border-emerald-400"
          />
          <label htmlFor="pantry-item-quantity" className="sr-only">
            {t("quantity")}
          </label>
          <input
            id="pantry-item-quantity"
            name="pantry-item-quantity"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder={name.trim() ? getPantryQuantityHint(name) : t("quantity")}
            autoComplete="off"
            inputMode="text"
            className="focus-ring h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm transition-ui focus:border-emerald-400"
          />
          <div className="space-y-2">
            <label htmlFor="pantry-item-expiration" className="text-sm font-semibold text-stone-800">
              {t("expiration")}
            </label>
            <input
              id="pantry-item-expiration"
              name="pantry-item-expiration"
              type="date"
              value={expiration}
              onChange={(event) => setExpiration(event.target.value)}
              autoComplete="off"
              className="focus-ring h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm transition-ui focus:border-emerald-400"
            />
          </div>
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
            <p className="mt-2 text-3xl font-display font-bold text-stone-900 tabular-nums">{items.length}</p>
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
                        id={`scanned-pantry-name-${index}`}
                        name={`scanned-pantry-name-${index}`}
                        value={item.name}
                        onChange={(event) => updateScannedItem(index, "name", event.target.value)}
                        placeholder={t("ingredientName")}
                        aria-label={`Scanned item ${index + 1} name`}
                        autoComplete="off"
                        spellCheck
                        className="focus-ring h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm transition-ui focus:border-emerald-400"
                      />
                      <input
                        id={`scanned-pantry-quantity-${index}`}
                        name={`scanned-pantry-quantity-${index}`}
                        value={item.quantity ?? ""}
                        onChange={(event) => updateScannedItem(index, "quantity", event.target.value)}
                        placeholder={item.name.trim() ? getPantryQuantityHint(item.name) : t("quantity")}
                        aria-label={`Scanned item ${index + 1} quantity`}
                        autoComplete="off"
                        inputMode="text"
                        className="focus-ring h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm transition-ui focus:border-emerald-400"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          openConfirm({
                            title: "Remove scanned item?",
                            description: item.name
                              ? `${item.name} will be removed from this review list.`
                              : `Scanned item ${index + 1} will be removed from this review list.`,
                            confirmLabel: "Remove",
                            action: () => removeScannedItem(index)
                          })
                        }
                        aria-label={item.name ? `Remove ${item.name}` : `Remove scanned item ${index + 1}`}
                        className="focus-ring rounded-2xl bg-red-50 p-3 text-red-600 transition-ui hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
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
            <Card className="rounded-[2rem] text-sm text-stone-500">Loading pantry…</Card>
          ) : items.length ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  onClick={() =>
                    openConfirm({
                      title: "Clear pantry?",
                      description: "This removes every pantry item from your saved list.",
                      confirmLabel: t("clearAll"),
                      action: async () => {
                        try {
                          await clear();
                        } catch (error) {
                          const message = error instanceof Error ? error.message : "Failed to clear pantry";
                          setError(message);
                        }
                      }
                    })
                  }
                >
                  {t("clearAll")}
                </Button>
              </div>
              <div className="grid gap-4">
                {items.map((item) => (
                  <Card key={item.id ?? item.name} className="rounded-[1.75rem] flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-stone-900 truncate">{item.name}</p>
                      <p className="text-sm text-stone-500">{item.quantity || "1"}</p>
                      {item.expiration ? <p className="text-xs text-stone-400">Expires {item.expiration}</p> : null}
                    </div>
                    {item.id ? (
                      <button
                        type="button"
                        onClick={() =>
                          openConfirm({
                            title: "Remove pantry item?",
                            description: `${item.name} will be removed from your pantry.`,
                            confirmLabel: "Remove",
                            action: async () => {
                              await removeItem(item.id!);
                            }
                          })
                        }
                        aria-label={`Remove ${item.name}`}
                        className="focus-ring rounded-2xl bg-red-50 p-3 text-red-600 transition-ui hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
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
      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        onCancel={() => setConfirmState(null)}
        onConfirm={async () => {
          if (!confirmState) return;
          try {
            await confirmState.action();
          } finally {
            setConfirmState(null);
          }
        }}
      />
    </motion.div>
  );
}
