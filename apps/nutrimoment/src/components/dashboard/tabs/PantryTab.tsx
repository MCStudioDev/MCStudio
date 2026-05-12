"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Plus, ShoppingCart, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePantry } from "@/hooks/usePantry";
import { containerVariants, itemVariants } from "@/lib/animations";
import { getPantryQuantityHint } from "@/lib/pantryQuantity";
import { cn, fileToBase64 } from "@/lib/utils";
import type { PantryItem } from "@/lib/types";
import { EmptyState, SectionHero } from "./shared";

export function PantryTab() {
  const { t, settings, setError, rtl } = useApp();
  const { access, getAuthHeaders, refreshAccess } = useAuth();
  const { items, addItem, removeItem, clear, loading } = usePantry();
  const pantryInputRef = useRef<HTMLInputElement | null>(null);
  const pantryCameraStreamRef = useRef<MediaStream | null>(null);
  const pantryVideoRef = useRef<HTMLVideoElement | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expiration, setExpiration] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
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

  useEffect(() => {
    const video = pantryVideoRef.current;
    if (!cameraOpen || !cameraStream || !video) return;

    setCameraReady(false);
    video.srcObject = cameraStream;
    const handleReady = () => setCameraReady(true);
    video.addEventListener("loadedmetadata", handleReady);
    void video.play().catch(() => undefined);

    return () => {
      video.removeEventListener("loadedmetadata", handleReady);
    };
  }, [cameraOpen, cameraStream]);

  useEffect(() => () => stopPantryCamera(), []);

  const processPantryImage = async (image: string) => {
    setScanLoading(true);
    try {
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

  const handleScanPantry = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    event.currentTarget.blur();
    pantryInputRef.current?.blur();
    if (!file) return;

    try {
      const image = await readPantryImageFile(file);
      await processPantryImage(image);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to scan pantry";
      setError(message);
    }
  };

  function stopPantryCamera() {
    pantryCameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    pantryCameraStreamRef.current = null;
    setCameraStream(null);
    setCameraReady(false);
    if (pantryVideoRef.current) {
      pantryVideoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    setCameraStarting(false);
  }

  const startPantryCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      pantryInputRef.current?.click();
      return;
    }

    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" }
        }
      });
      pantryCameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Camera unavailable";
      setError(message);
      pantryInputRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  };

  const capturePantryCamera = async () => {
    const video = pantryVideoRef.current;
    if (!video) return;
    if (!cameraReady || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setError(t("cameraStillStarting"));
      return;
    }

    const image = capturePantryVideoFrame(video);
    stopPantryCamera();
    await processPantryImage(image);
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

          {cameraOpen ? (
            <div className="overflow-hidden rounded-[1.35rem] border border-cyan-200/18 bg-black/35">
              <div className="relative aspect-[4/3] bg-black">
                <video ref={pantryVideoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
                {!cameraReady ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-sm font-semibold text-white">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t("cameraPreviewStarting")}
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2 p-2.5">
                <Button variant="secondary" leftIcon={<Camera className="h-4 w-4" />} onClick={capturePantryCamera} disabled={!cameraReady}>
                  {t("capturePhoto")}
                </Button>
                <Button variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={stopPantryCamera}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <PantryScanAction
                  busy={cameraStarting}
                  disabled={cameraStarting || scanLoading}
                  helper={t("pantryImageHelper")}
                  icon={Camera}
                  loadingLabel={t("identifying")}
                  onClick={startPantryCamera}
                  tone="cyan"
                  title={t("takePhoto")}
                />
                <PantryScanAction
                  busy={scanLoading}
                  disabled={scanLoading}
                  helper={t("pantryImageHelper")}
                  icon={Upload}
                  loadingLabel={t("analyzingPantry")}
                  onClick={() => pantryInputRef.current?.click()}
                  tone="emerald"
                  title={t("uploadPantryImage")}
                />
              </div>
              <input
                ref={pantryInputRef}
                id="pantry-photo-upload"
                name="pantry-photo-upload"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleScanPantry}
                aria-label={t("uploadPantryImage")}
              />
            </>
          )}

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

function PantryScanAction({
  busy,
  disabled,
  helper,
  icon: Icon,
  loadingLabel,
  onClick,
  title,
  tone
}: {
  busy: boolean;
  disabled: boolean;
  helper: string;
  icon: typeof Camera;
  loadingLabel: string;
  onClick: () => void;
  title: string;
  tone: "cyan" | "emerald";
}) {
  const isCyan = tone === "cyan";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      whileHover={disabled ? undefined : { y: -3, scale: 1.015 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      className={cn(
        "focus-ring group relative min-h-32 overflow-hidden rounded-[1.35rem] p-4 text-start text-emerald-50 shadow-[0_18px_50px_rgba(16,185,129,0.10)] transition-ui sm:min-h-36",
        "disabled:cursor-not-allowed disabled:opacity-60",
        isCyan
          ? "border border-cyan-200/20 bg-cyan-300/10 hover:border-cyan-200/42 hover:bg-cyan-300/14 hover:shadow-[0_22px_65px_rgba(34,211,238,0.18)]"
          : "border border-emerald-200/20 bg-emerald-300/10 hover:border-emerald-200/42 hover:bg-emerald-300/14 hover:shadow-[0_22px_65px_rgba(16,185,129,0.18)]"
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition",
          isCyan ? "bg-cyan-200/16 group-hover:bg-cyan-200/24" : "bg-emerald-200/16 group-hover:bg-emerald-200/24"
        )}
      />
      <span className="relative flex h-full flex-col justify-between gap-5">
        <span className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl border",
              isCyan ? "border-cyan-100/18 bg-cyan-200/14 text-cyan-100" : "border-emerald-100/18 bg-emerald-200/14 text-emerald-100"
            )}
          >
            {busy ? (
              <span className="h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <Icon className="h-5 w-5" />
            )}
          </span>
          <Sparkles
            className={cn(
              "h-4 w-4 transition group-hover:rotate-12",
              isCyan ? "text-cyan-100/55 group-hover:text-cyan-100" : "text-emerald-100/55 group-hover:text-emerald-100"
            )}
          />
        </span>
        <span>
          <span className="block text-base font-display font-bold leading-tight text-white sm:text-lg">
            {busy ? loadingLabel : title}
          </span>
          <span className="mt-1 block text-xs leading-snug text-emerald-50/60">{helper}</span>
        </span>
      </span>
    </motion.button>
  );
}

async function readPantryImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    return fileToBase64(file);
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadPantryImageElement(objectUrl);
      return scalePantryImageToDataUrl(image);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return fileToBase64(file);
  }
}

function loadPantryImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

function capturePantryVideoFrame(video: HTMLVideoElement) {
  return scalePantryImageToDataUrl(video);
}

function scalePantryImageToDataUrl(source: CanvasImageSource) {
  const sourceWidth =
    "videoWidth" in source && typeof source.videoWidth === "number"
      ? source.videoWidth
      : "naturalWidth" in source && typeof source.naturalWidth === "number"
        ? source.naturalWidth
        : "width" in source && typeof source.width === "number"
          ? source.width
          : 1280;
  const sourceHeight =
    "videoHeight" in source && typeof source.videoHeight === "number"
      ? source.videoHeight
      : "naturalHeight" in source && typeof source.naturalHeight === "number"
        ? source.naturalHeight
        : "height" in source && typeof source.height === "number"
          ? source.height
          : 1280;
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare image");
  }
  context.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.84);
}
