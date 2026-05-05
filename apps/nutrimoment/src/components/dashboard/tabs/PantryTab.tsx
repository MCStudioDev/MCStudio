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
  const { t, settings, setError, rtl } = useApp();
  const { access, getAuthHeaders, refreshAccess } = useAuth();
  const { items, addItem, removeItem, clear, loading } = usePantry();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expiration, setExpiration] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
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
    const savedName = name.trim();
    setSaving(true);
    try {
      await addItem({
        name: savedName,
        quantity: quantity.trim() || "1",
        expiration: expiration.trim() || undefined
      });
      setName("");
      setQuantity("");
      setExpiration("");
      setSuccessMessage(rtl ? `تمت إضافة ${savedName} إلى المخزن.` : `${savedName} added to pantry.`);
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
          language: settings.uiLanguage,
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
      setSuccessMessage(
        rtl
          ? `تم حفظ ${validItems.length} عناصر في المخزن.`
          : `${validItems.length} scanned pantry ${validItems.length === 1 ? "item" : "items"} saved.`
      );
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
      <SectionHero
        title={t("myPantry")}
        description={t("keepTrack")}
        eyebrow={t("kitchenInventory")}
        chips={[t("trackChip"), t("scanChip"), t("restockChip")]}
        icon={<ShoppingCart className="h-6 w-6" />}
        stats={[
          { label: t("savedItems"), value: `${items.length}` },
          { label: t("scanQueue"), value: scannedItems.length ? `${scannedItems.length} ${t("reviewingStatus")}` : t("clearStatus") },
          { label: t("modeStat"), value: access.tier === "premium" ? t("apiVision") : t("manualAi") }
        ]}
        aside={
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("kitchenSignal")}</p>
            <p className="text-sm leading-relaxed text-emerald-50/72">
              {t("pantryAside")}
            </p>
          </div>
        }
      />

      <div className="rounded-[1.35rem] border border-cyan-200/16 bg-cyan-400/10 px-4 py-3 text-sm leading-relaxed text-cyan-50/92">
        {rtl
          ? "المخزن يحتفظ بالأساسيات التي لديك دائمًا، والماسح يستخدمها لترتيب الوصفات بشكل أذكى."
          : "Pantry remembers staples you usually have; Scanner uses them to rank recipes smarter."}
      </div>

      <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[2rem] space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("addItem")}</p>
            <h3 className="mt-2 text-2xl font-display font-bold text-white">{t("addToPantry")}</h3>
          </div>

          {access.tier === "free" ? (
            <div className="rounded-2xl border border-amber-200/16 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-50/88">
              {t("freePantryNotice")
                .replace("{remaining}", String(access.aiCreditsRemaining))
                .replace("{limit}", String(access.aiCreditsLimit))}
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200/16 bg-emerald-400/10 px-4 py-3 text-xs leading-relaxed text-emerald-50/88">
              {t("premiumPantryNotice")}
            </div>
          )}

          <label htmlFor="pantry-photo-upload" className="block">
            <span className="sr-only">{t("uploadPantryImage")}</span>
            <input
              id="pantry-photo-upload"
              name="pantry-photo-upload"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleScanPantry}
              aria-label={t("uploadPantryImage")}
            />
            <span className="focus-within:ring-2 focus-within:ring-cyan-300 focus-within:ring-offset-2 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-white/12 bg-white/[0.04] px-6 text-center transition-ui hover:border-cyan-300/35 hover:bg-white/[0.07]">
              <ImagePlus className="h-8 w-8 text-cyan-200" aria-hidden="true" />
              <span className="text-sm font-semibold text-white" aria-live="polite">
                {scanLoading ? t("analyzingPantry") : t("uploadPantryImage")}
              </span>
              <span className="text-xs text-emerald-50/55">{t("pantryImageHelper")}</span>
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
            className="focus-ring neo-input h-12 w-full rounded-2xl px-4 text-sm transition-ui"
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
            className="focus-ring neo-input h-12 w-full rounded-2xl px-4 text-sm transition-ui"
          />
          <div className="space-y-2">
            <label htmlFor="pantry-item-expiration" className="text-sm font-semibold text-emerald-50/88">
              {t("expiration")}
            </label>
            <input
              id="pantry-item-expiration"
              name="pantry-item-expiration"
              type="date"
              value={expiration}
              onChange={(event) => setExpiration(event.target.value)}
              autoComplete="off"
              className="focus-ring neo-input h-12 w-full rounded-2xl px-4 text-sm transition-ui"
            />
          </div>
          <div className="theme-callout-info rounded-2xl border border-cyan-200/16 bg-cyan-400/10 px-4 py-3 text-sm font-medium leading-relaxed text-cyan-50/92">
            {t("quantityGuide")}: {t("quantityGuideDetails")}
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

          <div aria-live="polite" className="min-h-6">
            {successMessage ? (
              <p className="rounded-2xl border border-emerald-200/16 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-50">
                {successMessage}
              </p>
            ) : null}
          </div>

          <Card variant="plain" className="rounded-[1.5rem] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-50/52">{t("items")}</p>
            <p className="mt-2 text-3xl font-display font-bold text-white tabular-nums">{items.length}</p>
          </Card>
        </Card>

        <motion.div variants={itemVariants}>
          {scannedItems.length ? (
            <Card className="rounded-[2rem] space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("pantryScan")}</p>
                  <h3 className="mt-2 text-2xl font-display font-bold text-white">{t("reviewScannedPantryItems")}</h3>
                  <p className="mt-2 text-sm text-emerald-50/60">{t("reviewScannedPantryDesc")}</p>
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
                        className="focus-ring neo-input h-12 w-full rounded-2xl px-4 text-sm transition-ui"
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
                        className="focus-ring neo-input h-12 w-full rounded-2xl px-4 text-sm transition-ui"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          openConfirm({
                            title: t("removeScannedItemTitle"),
                            description: t("removeScannedItemDescription"),
                            confirmLabel: t("remove"),
                            action: () => removeScannedItem(index)
                          })
                        }
                        aria-label={item.name ? `${t("remove")} ${item.name}` : `${t("remove")} ${index + 1}`}
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
            <Card className="rounded-[2rem] space-y-4" aria-busy="true">
              <p className="text-sm font-semibold text-emerald-50/72">{t("loadingPantry")}</p>
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/[0.06]" />
              ))}
            </Card>
          ) : items.length ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  onClick={() =>
                    openConfirm({
                      title: t("clearPantryTitle"),
                      description: t("clearPantryDescription"),
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
                      <p className="truncate text-lg font-semibold text-white">{item.name}</p>
                      <p className="text-sm text-emerald-50/62">{item.quantity || "1"}</p>
                      {item.expiration ? <p className="text-xs text-emerald-50/42">{t("expires")} {item.expiration}</p> : null}
                    </div>
                    {item.id ? (
                      <button
                        type="button"
                        onClick={() =>
                          openConfirm({
                            title: t("removePantryItemTitle"),
                            description: t("removePantryItemDescription").replace("{name}", item.name),
                            confirmLabel: t("remove"),
                            action: async () => {
                              await removeItem(item.id!);
                            }
                          })
                        }
                        aria-label={`${t("remove")} ${item.name}`}
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
