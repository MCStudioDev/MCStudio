"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Camera, CheckCircle2, ChefHat, Info, Lock, Plus, Search, Sparkles, Upload, Utensils, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useApp } from "@/contexts/AppContext";
import { useHistory } from "@/hooks/useHistory";
import { usePantry } from "@/hooks/usePantry";
import { containerVariants, itemVariants } from "@/lib/animations";
import { translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";
import { cn, fileToBase64 } from "@/lib/utils";
import type { Recipe } from "@/lib/types";
import { EmptyState } from "./shared";
import { ResultLegalNotice } from "@/components/legal/LegalNotice";
import { hasRecipeImageLookupAccess, useAuth } from "@/contexts/AuthContext";
import { MealRevealCard } from "@/components/dashboard/MealRevealCard";
import { persistRecipeImageForUser } from "@/lib/recipeImageStorage";
import { isUsableRecipeImageForAccess } from "@/lib/recipeImageQuality";
import { buildEnglishRecipePhotoContext, buildEnglishRecipePhotoIngredients } from "@/lib/recipePhotoLanguage";
import { buildRecipePhotoQueryCandidates } from "@/lib/recipePhotoQueries";
import { buildRecipePhotoReuseKeyCandidates } from "@/lib/recipePhotoReuse";
import { buildRecipeDisplayName } from "@/lib/recipeDisplayNames";
import { getCuisineDisplayLabel } from "@/lib/cuisines";
import type { TranslationKey } from "@/lib/translations";
import { RecipeGenerationStatus } from "@/lib/RecipeGenerationStatus";
import {
  forgetPendingRecipeHistoryId,
  isLikelyBackgroundFetchInterruption,
  rememberPendingRecipeHistoryId,
  readPendingRecipeHistoryIds
} from "@/lib/backgroundRecipeJobs";

// Keep a small gap between premium image requests to avoid Replicate burst rate limits
// without making the scanner page feel artificially slow.
const PREMIUM_REPLICATE_LOOKUP_DELAY_MS = 1200;
const PREMIUM_REPLICATE_MAX_RETRIES = 4;
const PREMIUM_REPLICATE_MAX_RETRY_AFTER_MS = 12 * 1000;
const PREMIUM_REPLICATE_REQUEUE_DELAY_MS = 5000;
const PREMIUM_REPLICATE_REQUEUE_ROUNDS = 6;
const PREMIUM_REPLICATE_IMAGE_CONCURRENCY = 10;
const FREE_RECIPE_IMAGE_CONCURRENCY = 10;
const SCANNER_PREMIUM_IMAGE_REPAIR_INTERVAL_MS = 18 * 1000;
const SCAN_ACCESS_RETRY_ATTEMPTS = 3;
const SCAN_ACCESS_RETRY_DELAY_MS = 700;

interface ScanResponseData {
  ingredients?: string[];
  result?: string;
  error?: string;
  fallbackNotice?: string;
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function readScanJson(response: Response): Promise<ScanResponseData> {
  try {
    return (await response.json()) as ScanResponseData;
  } catch {
    return {};
  }
}

function isFirebaseAccessBusyResponse(response: Response, data: ScanResponseData) {
  if (response.status !== 503) return false;
  return /firebase.*temporarily busy|ai access.*unavailable|recipe access.*unavailable/i.test(data.error ?? "");
}

async function waitForScanAccessRetry(attempt: number) {
  await new Promise((resolve) => setTimeout(resolve, SCAN_ACCESS_RETRY_DELAY_MS * attempt));
}

interface ScannerIngredient {
  id: string;
  name: string;
}

function createScannerIngredient(name: string): ScannerIngredient {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name
  };
}

async function readImageFileForScan(file: File) {
  if (!file.type.startsWith("image/")) {
    return fileToBase64(file);
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImageElement(objectUrl);
      return scaleImageToDataUrl(image);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return fileToBase64(file);
  }
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

function captureVideoFrame(video: HTMLVideoElement) {
  return scaleImageToDataUrl(video);
}

function scaleImageToDataUrl(source: CanvasImageSource) {
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

function getRecipeIngredientLabel(ingredient: unknown) {
  if (typeof ingredient === "string") return ingredient;

  if (ingredient && typeof ingredient === "object") {
    const maybeIngredient = ingredient as { name?: unknown; quantity?: unknown };
    const name = typeof maybeIngredient.name === "string" ? maybeIngredient.name : "";
    const quantity = typeof maybeIngredient.quantity === "string" ? maybeIngredient.quantity : "";

    return [name, quantity].filter(Boolean).join(" - ") || JSON.stringify(ingredient);
  }

  return String(ingredient);
}

export function ScannerTab() {
  const { t, settings, health, setError, addNotification, rtl } = useApp();
  const { access, getAuthHeaders, refreshAccess, user } = useAuth();
  const hasGeneratedImageAccess = hasRecipeImageLookupAccess(access);
  const isPremiumFeatureUnlocked = access.role === "admin" || access.tier === "premium";
  const canUseFridgeScan = isPremiumFeatureUnlocked;
  const { addEntry, items: historyItems, replaceEntryRecipes, updateEntryStatus, updateRecipeImage } = useHistory();
  const { addItems: addPantryItems, items: pantryItems } = usePantry();
  const scannerInputRef = useRef<HTMLInputElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recipeRequestVersionRef = useRef(0);
  const notifiedHistoryEntriesRef = useRef<Set<string>>(new Set());
  const [manualEntry, setManualEntry] = useState("");
  const [ingredients, setIngredients] = useState<ScannerIngredient[]>([]);
  const [lastScanImage, setLastScanImage] = useState<string | null>(null);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scannerInputKey, setScannerInputKey] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeGenerationStatus, setRecipeGenerationStatus] = useState<RecipeGenerationStatus | null>(null);
  const [imageRepairVersion, setImageRepairVersion] = useState(0);
  const [historyEntryId, setHistoryEntryId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void | Promise<void>;
  } | null>(null);

  const hydrateRecipePhotos = useCallback(
    async (inputRecipes: Recipe[], historyEntryId: string | null, requestVersion: number) => {
      if (requestVersion !== recipeRequestVersionRef.current) return;
      const isPremium = hasGeneratedImageAccess;
      const recipeReuseKeys = inputRecipes.map(getRecipePhotoReuseKey);

      const renderableImageCounts = new Map<string, number>();
      inputRecipes.forEach((recipe) => {
        if (!hasStrictRenderableImage(recipe.image_url, isPremium)) return;
        renderableImageCounts.set(recipe.image_url, (renderableImageCounts.get(recipe.image_url) ?? 0) + 1);
      });

      const keptRenderableUrls = new Map<string, string>();
      const duplicateRefreshFlags = inputRecipes.map((recipe, index) => {
        if (!hasStrictRenderableImage(recipe.image_url, isPremium)) return false;
        const count = renderableImageCounts.get(recipe.image_url) ?? 0;
        const reuseKey = recipeReuseKeys[index] ?? "";
        if (count <= 1) {
          keptRenderableUrls.set(recipe.image_url, reuseKey);
          return false;
        }
        const existingReuseKey = keptRenderableUrls.get(recipe.image_url);
        if (!existingReuseKey) {
          keptRenderableUrls.set(recipe.image_url, reuseKey);
          return false;
        }
        return existingReuseKey !== reuseKey;
      });

      const seeded = inputRecipes.map((recipe, index) =>
        hasStrictRenderableImage(recipe.image_url, isPremium) && !duplicateRefreshFlags[index]
          ? { ...recipe, image_loading: false, image_error: false }
          : { ...recipe, image_loading: true, image_error: false }
      );

      if (requestVersion !== recipeRequestVersionRef.current) return;
      setRecipes(seeded);

      const usedImageUrls = new Map<string, string>();
      seeded.forEach((recipe, index) => {
        if (duplicateRefreshFlags[index] || !hasStrictRenderableImage(recipe.image_url, isPremium)) return;
        usedImageUrls.set(recipe.image_url, recipeReuseKeys[index] ?? "");
      });
      const resolved: Recipe[] = [...seeded];
      const pendingPremiumIndexes = new Set<number>();
      const maxLookups = inputRecipes.length;

      const resolveRecipePhoto = async (recipe: Recipe) => {
        let response: Response | null = null;
        let data:
          | {
              imageAttributionName?: string;
              imageAttributionUrl?: string;
              imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
              imageUrl?: string;
              fallbackNotice?: string;
              source?: string;
            }
          | null = null;
        let attempt = 0;

        while (attempt <= (isPremium ? PREMIUM_REPLICATE_MAX_RETRIES : 0)) {
          const authHeaders = await getAuthHeaders();
          response = await fetch(
            buildRecipePhotoRequestUrl(
              buildRecipePhotoQuery(recipe),
              buildRecipePhotoPromptIngredients(recipe),
              getUsedImageUrlsForDifferentReuseKey(usedImageUrls, getRecipePhotoReuseKey(recipe)),
              {
                cuisine: buildRecipePhotoCuisine(recipe),
                exactNames: buildRecipePhotoExactNames(recipe),
                photoIdentity: recipe.photo_identity
              }
            ),
            {
              headers: authHeaders
            }
          );
          data = (await response.json()) as {
            imageAttributionName?: string;
            imageAttributionUrl?: string;
            imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
            imageUrl?: string;
            fallbackNotice?: string;
            source?: string;
          };

          if (!isPremium) {
            await refreshAccess();
          }

          if (
            response.ok &&
            hasStrictRenderableImage(data.imageUrl, isPremium) &&
            canUseImageUrlForReuseKey(usedImageUrls, data.imageUrl, getRecipePhotoReuseKey(recipe))
          ) {
            return { data, ok: true as const, response };
          }

          const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? "0") || 0;
          const canRetry =
            isPremium &&
            attempt < PREMIUM_REPLICATE_MAX_RETRIES &&
            (response.status === 429 || response.status === 503);

          if (!canRetry) {
            break;
          }

          attempt += 1;
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.min(
                PREMIUM_REPLICATE_MAX_RETRY_AFTER_MS,
                Math.max(PREMIUM_REPLICATE_LOOKUP_DELAY_MS, retryAfterSeconds * 1000)
              )
            )
          );
        }

        return { data, ok: false as const, response };
      };

      const lookupCandidates = seeded
        .map((recipe, index) => ({ index, recipe }))
        .filter(({ index, recipe }) => duplicateRefreshFlags[index] || !hasStrictRenderableImage(recipe.image_url, isPremium));
      const lookupTasks = lookupCandidates.slice(0, maxLookups);
      const skippedLookupIndexes = new Set(lookupCandidates.slice(maxLookups).map(({ index }) => index));

      seeded.forEach((recipe, index) => {
        const needsLookup = duplicateRefreshFlags[index] || !hasStrictRenderableImage(recipe.image_url, isPremium);
        if (!needsLookup || skippedLookupIndexes.has(index)) {
          resolved[index] = { ...recipe, image_loading: false, image_error: false };
        }
      });

      if (requestVersion === recipeRequestVersionRef.current) {
        setRecipes([...resolved]);
      }

      await runWithConcurrency(lookupTasks, isPremium ? PREMIUM_REPLICATE_IMAGE_CONCURRENCY : FREE_RECIPE_IMAGE_CONCURRENCY, async ({ index, recipe }) => {
        if (requestVersion !== recipeRequestVersionRef.current) return;

        try {
          const { data, ok } = await resolveRecipePhoto(recipe);

          if (
            !ok ||
            !data ||
            !hasStrictRenderableImage(data.imageUrl, isPremium) ||
            !canUseImageUrlForReuseKey(usedImageUrls, data.imageUrl, getRecipePhotoReuseKey(recipe))
          ) {
            resolved[index] = {
              ...recipe,
              image_loading: isPremium,
              image_error: !isPremium
            };
            if (isPremium) {
              pendingPremiumIndexes.add(index);
            }
            if (requestVersion === recipeRequestVersionRef.current) {
              setRecipes([...resolved]);
            }
            if (historyEntryId && !isPremium) {
              await updateRecipeImage(historyEntryId, index, recipe.image_url ?? "", true, recipe.image_source, {
                name: recipe.image_attribution_name,
                url: recipe.image_attribution_url
              });
            }
            return;
          }

          usedImageUrls.set(data.imageUrl, getRecipePhotoReuseKey(recipe));
          resolved[index] = {
            ...recipe,
            image_attribution_name: data.imageAttributionName,
            image_attribution_url: data.imageAttributionUrl,
            image_source: data.imageSource,
            image_url: data.imageUrl,
            image_loading: false,
            image_error: false
          };
          if (requestVersion === recipeRequestVersionRef.current) {
            setRecipes([...resolved]);
          }
          if (historyEntryId) {
            await updateRecipeImage(historyEntryId, index, data.imageUrl, false, data.imageSource, {
              name: data.imageAttributionName,
              url: data.imageAttributionUrl
            });
          }
        } catch {
          resolved[index] = { ...recipe, image_loading: isPremium, image_error: !isPremium };
          if (isPremium) {
            pendingPremiumIndexes.add(index);
          }
          if (requestVersion === recipeRequestVersionRef.current) {
            setRecipes([...resolved]);
          }
          if (historyEntryId && !isPremium) {
            await updateRecipeImage(historyEntryId, index, recipe.image_url ?? "", true, recipe.image_source, {
              name: recipe.image_attribution_name,
              url: recipe.image_attribution_url
            });
          }
        }
      });

      if (isPremium) {
        for (let round = 0; round < PREMIUM_REPLICATE_REQUEUE_ROUNDS && pendingPremiumIndexes.size > 0; round += 1) {
          await new Promise((resolve) => setTimeout(resolve, PREMIUM_REPLICATE_REQUEUE_DELAY_MS));
          const isLastRound = round === PREMIUM_REPLICATE_REQUEUE_ROUNDS - 1;

          await runWithConcurrency(Array.from(pendingPremiumIndexes), PREMIUM_REPLICATE_IMAGE_CONCURRENCY, async (index) => {
            if (requestVersion !== recipeRequestVersionRef.current) return;

            const recipe = resolved[index];
            try {
              const { data, ok } = await resolveRecipePhoto(recipe);
              if (
                !ok ||
                !data ||
                !hasStrictRenderableImage(data.imageUrl, isPremium) ||
                !canUseImageUrlForReuseKey(usedImageUrls, data.imageUrl, getRecipePhotoReuseKey(recipe))
              ) {
                resolved[index] = {
                  ...recipe,
                  image_loading: true,
                  image_error: false
                };

                if (isLastRound) {
                  if (historyEntryId) {
                    await updateRecipeImage(historyEntryId, index, recipe.image_url ?? "", false, recipe.image_source, {
                      name: recipe.image_attribution_name,
                      url: recipe.image_attribution_url
                    });
                  }
                }
              } else {
                usedImageUrls.set(data.imageUrl, getRecipePhotoReuseKey(recipe));
                resolved[index] = {
                  ...recipe,
                  image_attribution_name: data.imageAttributionName,
                  image_attribution_url: data.imageAttributionUrl,
                  image_source: data.imageSource,
                  image_url: data.imageUrl,
                  image_loading: false,
                  image_error: false
                };
                pendingPremiumIndexes.delete(index);

                if (historyEntryId) {
                  await updateRecipeImage(historyEntryId, index, data.imageUrl, false, data.imageSource, {
                    name: data.imageAttributionName,
                    url: data.imageAttributionUrl
                  });
                }
              }
            } catch {
              resolved[index] = {
                ...recipe,
                image_loading: true,
                image_error: false
              };
            }

            if (requestVersion === recipeRequestVersionRef.current) {
              setRecipes([...resolved]);
            }
          });
        }
      }

      if (requestVersion !== recipeRequestVersionRef.current) return;

      if (historyEntryId) {
        await replaceEntryRecipes(historyEntryId, resolved);
      }

      if (requestVersion !== recipeRequestVersionRef.current) return;
      setRecipes(resolved);
    },
    [getAuthHeaders, hasGeneratedImageAccess, refreshAccess, replaceEntryRecipes, updateRecipeImage]
  );

  useEffect(() => {
    setShowOnboarding(localStorage.getItem("nutrimoment.scannerOnboardingDismissed") !== "true");
  }, []);

  useEffect(() => {
    return () => {
      if (scanPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(scanPreviewUrl);
      }
    };
  }, [scanPreviewUrl]);

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!cameraOpen || !cameraStream || !video) return;

    let cancelled = false;
    setCameraReady(false);
    video.srcObject = cameraStream;
    video.muted = true;
    video.setAttribute("playsinline", "true");

    const markReady = () => {
      if (!cancelled && video.videoWidth > 0 && video.videoHeight > 0) {
        setCameraReady(true);
      }
    };

    const playPreview = async () => {
      try {
        await video.play();
        markReady();
      } catch {
        markReady();
      }
    };

    video.addEventListener("loadedmetadata", playPreview);
    video.addEventListener("canplay", markReady);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      void playPreview();
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", playPreview);
      video.removeEventListener("canplay", markReady);
      if (video.srcObject === cameraStream) {
        video.srcObject = null;
      }
    };
  }, [cameraOpen, cameraStream]);

  useEffect(() => {
    const pendingIds = readPendingRecipeHistoryIds();
    if (!pendingIds.length) return;

    const completedEntry = historyItems.find(
      (entry) =>
        pendingIds.includes(entry.id) &&
        entry.generationStatus === "completed" &&
        entry.recipes.length > 0 &&
        !notifiedHistoryEntriesRef.current.has(entry.id)
    );
    if (completedEntry) {
      notifiedHistoryEntriesRef.current.add(completedEntry.id);
      setHistoryEntryId(completedEntry.id);
      setRecipes(completedEntry.recipes);
      setRecipeLoading(false);
      void hydrateRecipePhotos(completedEntry.recipes, completedEntry.id, recipeRequestVersionRef.current);
      return;
    }

    const failedEntry = historyItems.find(
      (entry) =>
        pendingIds.includes(entry.id) &&
        entry.generationStatus === "failed" &&
        !notifiedHistoryEntriesRef.current.has(entry.id)
    );
    if (failedEntry) {
      notifiedHistoryEntriesRef.current.add(failedEntry.id);
      setRecipeLoading(false);
      setError(failedEntry.generationMessage ?? t("backgroundRecipesFailed"));
    }
  }, [historyItems, hydrateRecipePhotos, setError, t]);

  const missingPremiumRecipeImages = recipes.filter(
    (recipe) => !hasStrictRenderableImage(recipe.image_url, hasGeneratedImageAccess)
  ).length;

  useEffect(() => {
    if (!hasGeneratedImageAccess || recipeLoading || !missingPremiumRecipeImages) return;
    const interval = globalThis.setInterval(() => {
      setImageRepairVersion((value) => value + 1);
    }, SCANNER_PREMIUM_IMAGE_REPAIR_INTERVAL_MS);
    return () => globalThis.clearInterval(interval);
  }, [hasGeneratedImageAccess, missingPremiumRecipeImages, recipeLoading]);

  const dismissOnboarding = () => {
    localStorage.setItem("nutrimoment.scannerOnboardingDismissed", "true");
    setShowOnboarding(false);
  };

  const addManualIngredient = () => {
    const next = manualEntry
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !ingredients.some((ingredient) => ingredient.name.toLowerCase() === item.toLowerCase()))
      .map((item) => createScannerIngredient(item));

    if (!next.length) return;
    setIngredients((current) => [...current, ...next]);
    setManualEntry("");
  };

  const removeIngredient = (ingredientId: string) => {
    setIngredients((current) => current.filter((item) => item.id !== ingredientId));
  };

  function stopScannerCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraReady(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    setCameraStarting(false);
  }

  const startScannerCamera = async () => {
    if (!canUseFridgeScan) {
      setError(t("freePlanScanner"));
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      scannerInputRef.current?.click();
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
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Camera unavailable";
      setError(message);
      scannerInputRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  };

  const captureScannerCamera = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!cameraReady || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setError(t("cameraStillStarting"));
      return;
    }

    const image = captureVideoFrame(video);
    const previewUrl = image;
    stopScannerCamera();
    await processScannedImage(image, previewUrl);
  };

  const processScannedImage = async (image: string, previewUrl?: string) => {
    if (!canUseFridgeScan) {
      setError(t("freePlanScanner"));
      return;
    }

    if (previewUrl) {
      setScanPreviewUrl((current) => {
        if (current?.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }
        return previewUrl;
      });
    }

    setScanLoading(true);
    try {
      setLastScanImage(image);
      let response: Response | null = null;
      let data: ScanResponseData = {};

      for (let attempt = 1; attempt <= SCAN_ACCESS_RETRY_ATTEMPTS; attempt += 1) {
        response = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
          body: JSON.stringify({
            image,
            language: settings.uiLanguage,
            isPantry: false
          })
        });
        data = await readScanJson(response);

        if (!isFirebaseAccessBusyResponse(response, data) || attempt === SCAN_ACCESS_RETRY_ATTEMPTS) {
          break;
        }

        await waitForScanAccessRetry(attempt);
      }

      await refreshAccess().catch(() => undefined);
      if (!response) {
        throw new Error("Failed to scan image");
      }
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to scan image");
      }
      if (data.fallbackNotice) {
        setError(data.fallbackNotice);
      }

      const scanned = (Array.isArray(data.ingredients) ? data.ingredients : safeJsonParse<string[]>(data.result ?? "[]", []))
        .map((item) => item.trim())
        .filter(Boolean);

      if (!scanned.length) {
        setError(t("noIngredientsDetected"));
        return;
      }

      setIngredients((current) => {
        const existing = new Set(current.map((item) => normalizeIngredientKey(item.name)));
        const nextScanned = scanned
          .filter((item) => !existing.has(normalizeIngredientKey(item)))
          .map((item) => createScannerIngredient(item));

        return [...current, ...nextScanned];
      });

      const existingPantry = new Set(pantryItems.map((item) => normalizeIngredientKey(item.name)));
      const pantryAdditions = scanned
        .filter((item) => {
          const key = normalizeIngredientKey(item);
          if (!key || existingPantry.has(key)) return false;
          existingPantry.add(key);
          return true;
        })
        .map((item) => ({ name: item, quantity: "1 item" }));

      if (pantryAdditions.length) {
        await addPantryItems(pantryAdditions);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to scan image";
      setError(message);
    } finally {
      setScanLoading(false);
    }
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    event.currentTarget.blur();
    scannerInputRef.current?.blur();
    setScannerInputKey((current) => current + 1);
    if (!file) return;
    if (!canUseFridgeScan) {
      setError(t("freePlanScanner"));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    try {
      const image = await readImageFileForScan(file);
      await processScannedImage(image, previewUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to scan image";
      setError(message);
    }
  };

  const handleGenerateRecipes = async () => {
    const canUseReferenceImage = canUseFridgeScan && Boolean(lastScanImage);
    if (!ingredients.length && !canUseReferenceImage) {
      setError(t("addOrScanFirst"));
      return;
    }

    const requestVersion = recipeRequestVersionRef.current + 1;
    recipeRequestVersionRef.current = requestVersion;
    setRecipeLoading(true);
    setRecipeGenerationStatus(null);
    let pendingEntryId: string | null = null;
    try {
      const ingredientNames = ingredients.map((item) => item.name);
      pendingEntryId = await addEntry({
        timestamp: new Date().toISOString(),
        ingredients: ingredientNames,
        recipes: [],
        generationStatus: "pending",
        generationMessage: t("backgroundRecipesQueued")
      });
      setHistoryEntryId(pendingEntryId);
      if (pendingEntryId) {
        rememberPendingRecipeHistoryId(pendingEntryId);
        addNotification(t("backgroundRecipesQueued"), settings.uiLanguage);
      }
      const response = await fetch("/api/generate-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          ingredients: ingredientNames.length ? ingredientNames : undefined,
          historyEntryId: pendingEntryId ?? undefined,
          referenceImage: canUseReferenceImage ? lastScanImage ?? undefined : undefined,
          recipeCount: settings.recipeCount,
          uiLanguage: settings.uiLanguage,
          preferredCuisine: settings.preferredCuisine,
          calorieTarget: settings.calorieTarget,
          maxMissingIngredients: settings.maxMissingIngredients,
          diets: health.diets,
          conditions: health.conditions,
          allergens: health.allergens ?? []
        })
      });

      const data = (await response.json()) as {
        result?: string;
        error?: string;
        message?: string;
        servedFrom?: "shared_pool" | "fallback_ai" | "mock" | "recipe_reference" | "local_recipe_sources";
        generationStatus?: RecipeGenerationStatus;
      };
      await refreshAccess();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to generate recipes");
      }

      const nextRecipes = safeJsonParse<Recipe[]>(data.result ?? "[]", []);
      if (requestVersion !== recipeRequestVersionRef.current) {
        return;
      }

      setRecipeGenerationStatus(
        resolveRecipeGenerationStatus(data.generationStatus, data.servedFrom, nextRecipes.length, settings.recipeCount)
      );
      setRecipes(nextRecipes);
      if (!nextRecipes.length) {
        setHistoryEntryId(null);
        if (pendingEntryId) {
          notifiedHistoryEntriesRef.current.add(pendingEntryId);
          forgetPendingRecipeHistoryId(pendingEntryId);
        }
        return;
      }
      setHistoryEntryId(pendingEntryId);
      void hydrateRecipePhotos(nextRecipes, pendingEntryId, requestVersion);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Recipe generation failed";
      if (pendingEntryId) {
        if (isLikelyBackgroundFetchInterruption(error)) {
          setError(t("backgroundRecipesContinuingInHistory"));
          return;
        }
        await updateEntryStatus(pendingEntryId, "failed", message);
        forgetPendingRecipeHistoryId(pendingEntryId);
      }
      setError(message);
      setRecipeGenerationStatus(null);
    } finally {
      setRecipeLoading(false);
    }
  };

  const loadingStatus = getScannerLoadingStatus({
    accessTier: access.tier,
    imageLoadingCount: recipes.filter((recipe) => recipe.image_loading).length,
    recipeLoading,
    scanLoading,
    t
  });

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-4 sm:space-y-5">
      {showOnboarding ? (
        <motion.div variants={itemVariants}>
          <Card className="rounded-[1.4rem] border-cyan-200/18 bg-cyan-400/10 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                  {rtl ? "ابدأ بسرعة" : "Quick start"}
                </p>
                <ol className="grid gap-2 text-sm font-medium leading-relaxed text-emerald-50/82 sm:grid-cols-3">
                  <li>{isPremiumFeatureUnlocked ? (rtl ? "1. أضف أو امسح المكونات" : "1. Add or scan ingredients") : (rtl ? "1. أضف المكونات يدويًا" : "1. Add ingredients manually")}</li>
                  <li>{rtl ? "2. ولّد وصفات مناسبة" : "2. Generate matched recipes"}</li>
                  <li>{rtl ? "3. افتح الوصفة واطبخ" : "3. Open the recipe and cook"}</li>
                </ol>
              </div>
              <Button variant="secondary" onClick={dismissOnboarding}>
                {rtl ? "فهمت" : "Got it"}
              </Button>
            </div>
          </Card>
        </motion.div>
      ) : null}

      <motion.div variants={itemVariants}>
        <Card className="space-y-3.5 rounded-[1.4rem] p-3.5 sm:rounded-[1.7rem] sm:p-4.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
                <span>{t("scanIng")}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] tracking-[0.14em] text-emerald-50/72">
                  {ingredients.length} {t("ingredientsStat")}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] tracking-[0.14em] text-emerald-50/72">
                  {recipes.length ? `${recipes.length} ${t("readyStatus")}` : t("waitingStatus")}
                </span>
              </div>
              <h3 className="text-base font-display font-bold text-white sm:text-lg">{t("whatIng")}</h3>
              <p className="max-w-2xl text-sm leading-relaxed text-emerald-50/62">{t("scannerCompactLead")}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.08] p-2.5 text-cyan-100">
              <Utensils className="h-4.5 w-4.5" />
            </div>
          </div>

          <div
            className={
              access.tier === "free"
                ? "rounded-[1.2rem] border border-amber-200/16 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-50/90"
                : "rounded-[1.2rem] border border-emerald-200/16 bg-emerald-400/10 px-4 py-3 text-xs leading-relaxed text-emerald-50/90"
            }
          >
            {access.tier === "free"
              ? t("freePlanScanner")
                  .replace("{remaining}", String(access.aiCreditsRemaining))
                  .replace("{limit}", String(access.aiCreditsLimit))
              : t("premiumPlanScanner")}
          </div>

          <div className="grid gap-3.5 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-3.5">
              {cameraOpen ? (
                <div className="overflow-hidden rounded-[1.25rem] border border-cyan-200/18 bg-black/35">
                  <div className="relative aspect-[4/3] bg-black">
                    <video
                      ref={videoRef}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      autoPlay
                    />
                    {!cameraReady ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-sm font-semibold text-white">
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        {t("cameraPreviewStarting")}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-2.5">
                    <Button variant="secondary" leftIcon={<Camera className="h-4 w-4" />} onClick={captureScannerCamera} disabled={!cameraReady}>
                      {t("capturePhoto")}
                    </Button>
                    <Button variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={stopScannerCamera}>
                      {t("cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <motion.button
                      type="button"
                      onClick={startScannerCamera}
                      disabled={!canUseFridgeScan || cameraStarting || scanLoading}
                      aria-busy={cameraStarting || undefined}
                      whileHover={!canUseFridgeScan || cameraStarting || scanLoading ? undefined : { y: -3, scale: 1.015 }}
                      whileTap={!canUseFridgeScan || cameraStarting || scanLoading ? undefined : { scale: 0.985 }}
                      className={cn(
                        "focus-ring group relative min-h-32 overflow-hidden rounded-[1.35rem] border border-cyan-200/20 bg-cyan-300/10 p-4 text-start text-emerald-50 shadow-[0_18px_50px_rgba(34,211,238,0.10)] transition-ui sm:min-h-36",
                        "hover:border-cyan-200/42 hover:bg-cyan-300/14 hover:shadow-[0_22px_65px_rgba(34,211,238,0.18)]",
                        "disabled:cursor-not-allowed disabled:opacity-60"
                      )}
                    >
                      <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-200/16 blur-2xl transition group-hover:bg-cyan-200/24" />
                      <span className="relative flex h-full flex-col justify-between gap-5">
                        <span className="flex items-start justify-between gap-3">
                          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-100/18 bg-cyan-200/14 text-cyan-100">
                            {cameraStarting ? (
                              <span className="h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            ) : !canUseFridgeScan ? (
                              <Lock className="h-5 w-5" />
                            ) : (
                              <Camera className="h-5 w-5" />
                            )}
                          </span>
                          <Sparkles className="h-4 w-4 text-cyan-100/55 transition group-hover:rotate-12 group-hover:text-cyan-100" />
                        </span>
                        <span>
                          <span className="block text-base font-display font-bold leading-tight text-white sm:text-lg">
                            {cameraStarting ? t("identifying") : t("takePhoto")}
                          </span>
                          <span className="mt-1 block text-xs leading-snug text-emerald-50/60">
                            {canUseFridgeScan ? t("scanIng") : t("premiumRequired")}
                          </span>
                        </span>
                      </span>
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={() => {
                        if (!canUseFridgeScan) {
                          setError(t("freePlanScanner"));
                          return;
                        }
                        scannerInputRef.current?.click();
                      }}
                      disabled={!canUseFridgeScan || scanLoading}
                      aria-busy={scanLoading || undefined}
                      whileHover={!canUseFridgeScan || scanLoading ? undefined : { y: -3, scale: 1.015 }}
                      whileTap={!canUseFridgeScan || scanLoading ? undefined : { scale: 0.985 }}
                      className={cn(
                        "focus-ring group relative min-h-32 overflow-hidden rounded-[1.35rem] border border-emerald-200/20 bg-emerald-300/10 p-4 text-start text-emerald-50 shadow-[0_18px_50px_rgba(16,185,129,0.10)] transition-ui sm:min-h-36",
                        "hover:border-emerald-200/42 hover:bg-emerald-300/14 hover:shadow-[0_22px_65px_rgba(16,185,129,0.18)]",
                        "disabled:cursor-not-allowed disabled:opacity-60"
                      )}
                    >
                      <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-200/16 blur-2xl transition group-hover:bg-emerald-200/24" />
                      <span className="relative flex h-full flex-col justify-between gap-5">
                        <span className="flex items-start justify-between gap-3">
                          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-100/18 bg-emerald-200/14 text-emerald-100">
                            {scanLoading ? (
                              <span className="h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            ) : !canUseFridgeScan ? (
                              <Lock className="h-5 w-5" />
                            ) : (
                              <Upload className="h-5 w-5" />
                            )}
                          </span>
                          <Sparkles className="h-4 w-4 text-emerald-100/55 transition group-hover:rotate-12 group-hover:text-emerald-100" />
                        </span>
                        <span>
                          <span className="block text-base font-display font-bold leading-tight text-white sm:text-lg">
                            {scanLoading ? t("identifying") : t("uploadFridgePhoto")}
                          </span>
                          <span className="mt-1 block text-xs leading-snug text-emerald-50/60">
                            {canUseFridgeScan ? t("scannerCompactActions") : t("premiumRequired")}
                          </span>
                        </span>
                      </span>
                    </motion.button>
                  </div>
                  <input
                    key={scannerInputKey}
                    ref={scannerInputRef}
                    id="scanner-photo-upload"
                    name="scanner-photo-upload"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleImageUpload}
                    disabled={!canUseFridgeScan}
                    aria-label={t("uploadFridgePhoto")}
                  />
                  {scanPreviewUrl ? (
                    <div className="relative h-24 overflow-hidden rounded-[1rem] border border-white/10 bg-black/20">
                      {/* Browser object URLs from camera uploads should render without Next image optimization. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={scanPreviewUrl}
                        alt={t("scannerImagePreviewAlt")}
                        className="h-full w-full object-cover"
                      />
                      {scanLoading ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/38 text-xs font-semibold text-white">
                          <span className="mr-2 h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                          {t("scannerStageExtracting")}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}

              <div className="space-y-2.5">
                <label htmlFor="scanner-manual-ingredient" className="text-sm font-semibold text-emerald-50/88">
                  {t("typeIng")}
                </label>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    id="scanner-manual-ingredient"
                    name="ingredient"
                    value={manualEntry}
                    onChange={(event) => setManualEntry(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addManualIngredient();
                      }
                    }}
                    placeholder={t("quickAdd")}
                    autoComplete="off"
                    spellCheck
                    className="focus-ring neo-input h-12 rounded-2xl px-4 text-sm transition-ui"
                  />
                  <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={addManualIngredient}>
                    {t("add")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{t("reviewIng")}</p>
                  <h3 className="text-base font-display font-bold text-white sm:text-lg">{t("detectedIng")}</h3>
                </div>
                <div className="rounded-2xl bg-white/[0.08] p-2.5 text-cyan-100">
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
              </div>

              {ingredients.length ? (
                <div className="grid gap-2.5">
                  {ingredients.map((ingredient) => (
                    <div
                      key={ingredient.id}
                      className="grid gap-2.5 rounded-[1.1rem] border border-white/10 bg-white/[0.04] p-3 text-sm font-medium text-emerald-50/82 sm:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{ingredient.name}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            title: t("removeIngredientTitle"),
                            description: t("removeIngredientDescription").replace("{name}", ingredient.name),
                            confirmLabel: t("remove"),
                            action: () => removeIngredient(ingredient.id)
                          })
                        }
                        aria-label={`${t("remove")} ${ingredient.name}`}
                        className="focus-ring rounded-2xl bg-white/[0.05] px-3 py-2 text-xs font-semibold text-emerald-50/65 transition-ui hover:bg-red-500/12 hover:text-red-100"
                      >
                        {t("remove")}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-white/12 bg-white/[0.04] px-4 py-5 text-sm text-emerald-50/55">
                  {t("scanFridgeStart")}
                </div>
              )}

              <div className="grid gap-2.5 sm:grid-cols-3">
                <Card variant="plain" className="rounded-[1.2rem] p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("preferredCuisine")}</p>
                  <p className="mt-1.5 text-base font-semibold text-white">
                    {getCuisineDisplayLabel(settings.preferredCuisine, settings.uiLanguage)}
                  </p>
                </Card>
                <Card variant="plain" className="rounded-[1.2rem] p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("dailyCalorieTarget")}</p>
                  <p className="mt-1.5 text-base font-semibold text-white">{settings.calorieTarget} kcal</p>
                </Card>
                <Card variant="plain" className="rounded-[1.2rem] p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("recipeCount")}</p>
                  <p className="mt-1.5 text-base font-semibold text-white">{settings.recipeCount}</p>
                </Card>
              </div>

              {(health.diets.length > 0 || health.conditions.length > 0 || (health.allergens ?? []).length > 0) && (
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-3.5 space-y-3">
                  {health.diets.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("dietaryPrefs")}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {health.diets.map((diet) => (
                          <span key={diet} className="rounded-full border border-emerald-200/22 bg-emerald-400/14 px-2.5 py-0.5 text-xs font-semibold text-emerald-50">
                            {t(diet as TranslationKey)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {health.conditions.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("healthConditions")}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {health.conditions.map((condition) => (
                          <span key={condition} className="rounded-full border border-amber-200/22 bg-amber-400/12 px-2.5 py-0.5 text-xs font-semibold text-amber-100">
                            {t(condition as TranslationKey)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(health.allergens ?? []).length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-50/52">{t("allergensTitle")}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(health.allergens ?? []).map((allergen) => (
                          <span key={allergen} className="rounded-full border border-red-200/20 bg-red-400/10 px-2.5 py-0.5 text-xs font-semibold text-red-100">
                            {allergen}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                fullWidth
                size="lg"
                loading={recipeLoading}
                leftIcon={<ChefHat className="h-5 w-5" />}
                onClick={handleGenerateRecipes}
              >
                {recipeLoading ? t("aiThinking") : t("generateRecipes")}
              </Button>

              {loadingStatus ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="theme-scanner-loading-status rounded-[1.2rem] border border-cyan-200/18 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50 shadow-[0_18px_55px_rgba(20,184,166,0.12)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    <div className="space-y-1">
                      <p className="font-semibold">{loadingStatus.title}</p>
                      <p className="text-xs leading-relaxed text-cyan-50/68">{loadingStatus.detail}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        {recipeLoading && !recipes.length ? (
          <div className="space-y-4" aria-busy="true">
            <ResultLegalNotice mode="recipes" />
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
              {Array.from({ length: Math.min(Math.max(settings.recipeCount, 3), 6) }).map((_, index) => (
                <div
                  key={index}
                  className="min-h-[26rem] animate-pulse rounded-[1.7rem] border border-cyan-200/14 bg-cyan-300/10"
                />
              ))}
            </div>
          </div>
        ) : recipes.length ? (
          <div className="space-y-4">
            <RecipeGenerationStatusCard status={recipeGenerationStatus} rtl={rtl} />
            <ResultLegalNotice mode="recipes" />
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
              {recipes.map((recipe, index) => (
                <MealRevealCard
                  key={`${recipe.id ?? recipe.name}-${index}`}
                  disableAutoImageLookup={hasGeneratedImageAccess}
                  deferImageLookup={index >= 2}
                  imageLookupVersion={imageRepairVersion}
                  eyebrow={getRecipeEyebrow(recipe, t)}
                  name={buildRecipeDisplayName(recipe, settings.uiLanguage)}
                  visualMatchLabel={recipe.visual_match_label}
                  summary={buildRecipeSummary(recipe, t, settings.uiLanguage)}
                  previewLabel={getRecipePreviewLabel(recipe, t)}
                  previewItems={buildRecipePreviewItems(recipe)}
                  imageUrl={hasStrictRenderableImage(recipe.image_url, hasGeneratedImageAccess) ? recipe.image_url : undefined}
                  imageSource={recipe.image_source}
                  imageAttributionName={recipe.image_attribution_name}
                  imageAttributionUrl={recipe.image_attribution_url}
                  imageLoading={recipe.image_loading}
                  imageError={recipe.image_error}
                  imagePlaceholder={recipe.image_placeholder}
                  imageQuery={buildRecipePhotoQuery(recipe)}
                  imageExactNames={buildRecipePhotoExactNames(recipe)}
                  imageCuisine={buildRecipePhotoCuisine(recipe)}
                  imagePhotoIdentity={recipe.photo_identity}
                  imagePromptIngredients={buildRecipePhotoPromptIngredients(recipe)}
                  onImageResolved={
                    user && historyEntryId
                      ? async ({ imageAttributionName, imageAttributionUrl, imageSource, imageUrl }) => {
                          const persistedImageUrl =
                            hasGeneratedImageAccess
                              ? null
                              : await persistRecipeImageForUser({
                                  uid: user.uid,
                                  imageUrl,
                                  query: serializeRecipePhotoQuery(buildRecipePhotoQuery(recipe))
                                });
                          const nextImageUrl = persistedImageUrl || imageUrl;
                          setRecipes((currentRecipes) =>
                            currentRecipes.map((currentRecipe, currentIndex) =>
                              currentIndex === index
                                ? {
                                    ...currentRecipe,
                                    image_attribution_name: imageAttributionName,
                                    image_attribution_url: imageAttributionUrl,
                                    image_error: false,
                                    image_loading: false,
                                    image_source: imageSource,
                                    image_url: nextImageUrl
                                  }
                                : currentRecipe
                            )
                          );
                          await updateRecipeImage(
                            historyEntryId,
                            index,
                            nextImageUrl,
                            false,
                            imageSource,
                            { name: imageAttributionName, url: imageAttributionUrl }
                          );
                        }
                      : undefined
                  }
                  stats={buildRecipeStats(recipe)}
                  sections={buildRecipeSections(recipe, t)}
                />
              ))}
            </div>
          </div>
        ) : recipeGenerationStatus === RecipeGenerationStatus.NO_RESULTS ? (
          <RecipeGenerationStatusCard status={recipeGenerationStatus} rtl={rtl} />
        ) : (
          <EmptyState
            title={t("readyToCook")}
            description={t("readyToCookDesc")}
          />
        )}
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

function resolveRecipeGenerationStatus(
  status: RecipeGenerationStatus | undefined,
  servedFrom: string | undefined,
  recipeCount: number,
  requestedCount: number
) {
  if (status) return status;
  if (recipeCount <= 0) return RecipeGenerationStatus.NO_RESULTS;
  if (recipeCount < requestedCount) return RecipeGenerationStatus.PARTIAL_RESULTS;
  if (servedFrom === "fallback_ai" || servedFrom === "mock") return RecipeGenerationStatus.SUCCESS_AI;
  return RecipeGenerationStatus.SUCCESS_DATASET;
}

function RecipeGenerationStatusCard({
  rtl,
  status
}: {
  rtl: boolean;
  status: RecipeGenerationStatus | null;
}) {
  if (!status) return null;

  const copy = getRecipeGenerationStatusCopy(status, rtl);
  const Icon = copy.icon;

  return (
    <div
      role={status === RecipeGenerationStatus.NO_RESULTS ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "rounded-[1.15rem] border px-4 py-3 text-sm shadow-[0_18px_55px_rgba(20,184,166,0.10)]",
        copy.className
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold">{copy.title}</p>
          <p className="text-xs leading-relaxed opacity-80">{copy.detail}</p>
        </div>
      </div>
    </div>
  );
}

function getRecipeGenerationStatusCopy(status: RecipeGenerationStatus, rtl: boolean) {
  const copies = {
    [RecipeGenerationStatus.SUCCESS_AI]: {
      icon: CheckCircle2,
      className: "border-emerald-200/28 bg-emerald-400/12 text-emerald-50",
      title: rtl ? "\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0648\u0635\u0641\u0627\u062a \u0645\u062e\u0635\u0635\u0629" : "Custom recipes are ready",
      detail: rtl
        ? "\u0627\u0644\u0648\u0635\u0641\u0627\u062a \u0645\u0628\u0646\u064a\u0629 \u0639\u0644\u0649 \u0645\u0643\u0648\u0646\u0627\u062a\u0643 \u0648\u062a\u0641\u0636\u064a\u0644\u0627\u062a\u0643."
        : "These recipes were tailored to your ingredients and preferences."
    },
    [RecipeGenerationStatus.SUCCESS_DATASET]: {
      icon: Search,
      className: "border-sky-200/28 bg-sky-400/12 text-sky-50",
      title: rtl ? "\u0648\u062c\u062f\u0646\u0627 \u0648\u0635\u0641\u0627\u062a \u0645\u0646\u0627\u0633\u0628\u0629" : "We found matching recipes",
      detail: rtl
        ? "\u062a\u0645 \u0627\u062e\u062a\u064a\u0627\u0631 \u0648\u0635\u0641\u0627\u062a \u062a\u0646\u0627\u0633\u0628 \u0627\u0644\u0645\u0643\u0648\u0646\u0627\u062a \u0627\u0644\u062a\u064a \u0623\u0636\u0641\u062a\u0647\u0627."
        : "These recipes match the ingredients you added."
    },
    [RecipeGenerationStatus.SUCCESS_CACHE]: {
      icon: Info,
      className: "border-cyan-200/28 bg-cyan-400/12 text-cyan-50",
      title: rtl ? "\u0648\u062c\u062f\u0646\u0627 \u0648\u0635\u0641\u0627\u062a \u062c\u0627\u0647\u0632\u0629" : "Ready recipes found",
      detail: rtl
        ? "\u062a\u0645 \u0627\u062e\u062a\u064a\u0627\u0631 \u0648\u0635\u0641\u0627\u062a \u0645\u0646\u0627\u0633\u0628\u0629 \u0628\u0633\u0631\u0639\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0643\u0648\u0646\u0627\u062a."
        : "We quickly matched recipes that fit these ingredients."
    },
    [RecipeGenerationStatus.PARTIAL_RESULTS]: {
      icon: Info,
      className: "border-amber-200/30 bg-amber-400/12 text-amber-50",
      title: rtl ? "\u0639\u0631\u0636\u0646\u0627 \u0623\u0641\u0636\u0644 \u0627\u0644\u0646\u062a\u0627\u0626\u062c" : "Best available matches",
      detail: rtl
        ? "\u0642\u062f \u062a\u0638\u0647\u0631 \u0646\u062a\u0627\u0626\u062c \u0623\u0643\u062b\u0631 \u0625\u0630\u0627 \u0623\u0636\u0641\u062a \u0645\u0643\u0648\u0646\u0627\u062a \u0623\u0648 \u063a\u064a\u0631\u062a \u0627\u0644\u0645\u0637\u0628\u062e."
        : "Adding another ingredient or changing the cuisine may unlock more options."
    },
    [RecipeGenerationStatus.NO_RESULTS]: {
      icon: AlertTriangle,
      className: "border-amber-200/34 bg-amber-400/14 text-amber-50",
      title: rtl ? "\u0644\u0645 \u0646\u062c\u062f \u0648\u0635\u0641\u0627\u062a \u0645\u0646\u0627\u0633\u0628\u0629" : "No matching recipes yet",
      detail: rtl
        ? "\u062c\u0631\u0628 \u0625\u0636\u0627\u0641\u0629 \u0645\u0643\u0648\u0646 \u0622\u062e\u0631 \u0623\u0648 \u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0645\u0637\u0628\u062e \u0644\u0646\u0642\u062a\u0631\u062d \u0648\u0635\u0641\u0627\u062a \u0623\u0641\u0636\u0644."
        : "Try adding another ingredient or changing the cuisine for better matches."
    }
  } satisfies Record<RecipeGenerationStatus, {
    icon: LucideIcon;
    className: string;
    title: string;
    detail: string;
  }>;

  return copies[status];
}

function hasStrictRenderableImage(imageUrl: string | undefined, strictGeneratedOnly: boolean): imageUrl is string {
  return isUsableRecipeImageForAccess(imageUrl, strictGeneratedOnly);
}

function getScannerLoadingStatus({
  accessTier,
  imageLoadingCount,
  recipeLoading,
  scanLoading,
  t
}: {
  accessTier: "free" | "premium";
  imageLoadingCount: number;
  recipeLoading: boolean;
  scanLoading: boolean;
  t: ReturnType<typeof useApp>["t"];
}) {
  if (scanLoading) {
    return {
      detail: t("scannerKeepOpenHint"),
      title: t("scannerStageExtracting")
    };
  }

  if (recipeLoading) {
    return {
      detail: t("scannerKeepOpenHint"),
      title: t("scannerStageRecipes")
    };
  }

  if (imageLoadingCount > 0) {
    return {
      detail: t("scannerKeepOpenHint"),
      title:
        accessTier === "premium"
          ? t("scannerStageImagesPremium").replace("{count}", String(imageLoadingCount))
          : t("scannerStageImages").replace("{count}", String(imageLoadingCount))
    };
  }

  return null;
}

function buildRecipePhotoQuery(recipe: Recipe) {
  const photoContext = buildEnglishRecipePhotoContext(recipe);
  return buildRecipePhotoQueryCandidates({
    cuisine: photoContext.cuisine,
    dishIntent: photoContext.dishIntent,
    imageSearchIndex: photoContext.imageSearchIndex,
    imageSearchIndices: photoContext.imageSearchIndices,
    ingredients: photoContext.ingredients,
    missingIngredients: photoContext.missingIngredients,
    name: photoContext.name
  });
}

function getRecipePhotoReuseKey(recipe: Recipe) {
  const identityKey = [
    recipe.photo_identity?.dish_slug,
    recipe.photo_identity?.cuisine_key,
    recipe.photo_identity?.protein,
    recipe.photo_identity?.starch,
    recipe.photo_identity?.sauce,
    recipe.photo_identity?.method
  ]
    .map(normalizeRecipePhotoIdentityPart)
    .filter(Boolean)
    .join("::");
  if (identityKey) return identityKey;

  return buildRecipePhotoReuseKeyCandidates(buildRecipePhotoQuery(recipe))[0] ?? "";
}

function normalizeRecipePhotoIdentityPart(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getUsedImageUrlsForDifferentReuseKey(usedImageUrls: Map<string, string>, reuseKey: string) {
  return Array.from(usedImageUrls.entries())
    .filter(([, usedReuseKey]) => usedReuseKey !== reuseKey)
    .map(([imageUrl]) => imageUrl);
}

function canUseImageUrlForReuseKey(usedImageUrls: Map<string, string>, imageUrl: string | undefined, reuseKey: string) {
  if (!imageUrl) return false;
  const usedReuseKey = usedImageUrls.get(imageUrl);
  return !usedReuseKey || usedReuseKey === reuseKey;
}

function buildRecipePhotoRequestUrl(
  queries: string[],
  ingredients: string[] = [],
  excludeUrls: string[] = [],
  exactContext: { cuisine?: string; exactNames?: string[]; photoIdentity?: Recipe["photo_identity"] } = {}
) {
  const params = new URLSearchParams();
  queries.slice(0, 5).forEach((query, index) => {
    if (index === 0) {
      params.set("query", query);
    } else {
      params.append("alt", query);
    }
  });
  ingredients
    .map(normalizeRecipePhotoParam)
    .filter(Boolean)
    .slice(0, 10)
    .forEach((ingredient) => params.append("ingredient", ingredient));
  exactContext.exactNames
    ?.map(normalizeRecipePhotoParam)
    .filter(Boolean)
    .slice(0, 8)
    .forEach((name) => params.append("exact", name));
  const cuisine = normalizeRecipePhotoParam(exactContext.cuisine);
  if (cuisine) {
    params.set("cuisine", cuisine);
  }
  appendPhotoIdentityParams(params, exactContext.photoIdentity);
  excludeUrls.slice(0, 20).forEach((url) => params.append("exclude", url));

  return `/api/recipe-photo?${params.toString()}`;
}

function appendPhotoIdentityParams(params: URLSearchParams, identity: Recipe["photo_identity"]) {
  const photoSlug = normalizeRecipePhotoParam(identity?.dish_slug);
  if (!photoSlug) return;
  params.set("photoSlug", photoSlug);
  const photoCuisineKey = normalizeRecipePhotoParam(identity?.cuisine_key);
  const photoProtein = normalizeRecipePhotoParam(identity?.protein);
  const photoStarch = normalizeRecipePhotoParam(identity?.starch);
  const photoSauce = normalizeRecipePhotoParam(identity?.sauce);
  const photoMethod = normalizeRecipePhotoParam(identity?.method);
  if (photoCuisineKey) params.set("photoCuisineKey", photoCuisineKey);
  if (photoProtein) params.set("photoProtein", photoProtein);
  if (photoStarch) params.set("photoStarch", photoStarch);
  if (photoSauce) params.set("photoSauce", photoSauce);
  if (photoMethod) params.set("photoMethod", photoMethod);
}

function normalizeRecipePhotoParam(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeRecipePhotoQuery(queries: string[]) {
  return queries.join(" || ");
}

function buildRecipePhotoPromptIngredients(recipe: Recipe) {
  return buildEnglishRecipePhotoIngredients(recipe);
}

function buildRecipePhotoExactNames(recipe: Recipe) {
  return Array.from(
    new Set(
      [
        recipe.localized?.English?.name,
        recipe.localized?.Arabic?.name,
        recipe.name,
        recipe.dish_intent?.dish_name,
        recipe.localized?.English?.dish_intent?.dish_name,
        recipe.localized?.Arabic?.dish_intent?.dish_name,
        recipe.image_search_index,
        recipe.localized?.English?.image_search_index,
        recipe.localized?.Arabic?.image_search_index
      ]
        .map(normalizeRecipePhotoParam)
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 8);
}

function buildRecipePhotoCuisine(recipe: Recipe) {
  return recipe.localized?.English?.cuisine ?? recipe.cuisine;
}

function normalizeIngredientKey(value: string) {
  return translateIngredientToEnglish(value).trim().toLowerCase();
}

function buildRecipeStats(recipe: Recipe) {
  return [
    { label: "kcal", value: recipe.calories },
    { label: "protein", value: recipe.protein },
    { label: "carbs", value: recipe.carbs },
    { label: "fat", value: recipe.fat }
  ];
}

function buildRecipeSummary(recipe: Recipe, t: ReturnType<typeof useApp>["t"], language: string) {
  const isArabicRecipe = containsArabicText(`${recipe.name} ${recipe.cuisine}`);
  const cuisineLabel = getCuisineDisplayLabel(recipe.cuisine, language === "ar" || isArabicRecipe ? "ar" : language);
  const originLabel =
    recipe.recipe_origin === "exact_scan_match"
      ? t("exactScannedDish")
      : recipe.recipe_origin === "similar_ingredients"
        ? t("similarIngredients")
        : null;
  const dishStyle = formatRecipeDishStyle(recipe, isArabicRecipe);
  const preferenceHits = recipe.preference_hits?.length
    ? t("preferenceMatches").replace("{count}", String(recipe.preference_hits.length))
    : null;
  const scanExplanation =
    recipe.recipe_origin === "exact_scan_match" && recipe.scan_match_explanation
      ? recipe.scan_match_explanation
      : null;

  return [
    originLabel,
    cuisineLabel,
    dishStyle,
    formatRecipeMatchQuality(recipe.match_quality, isArabicRecipe),
    preferenceHits,
    scanExplanation
  ].filter(Boolean).join(" / ");
}

function formatRecipeDishStyle(recipe: Recipe, isArabicRecipe: boolean) {
  const mealType = recipe.dish_intent?.meal_type;
  const cookingMethod = recipe.dish_intent?.cooking_method;
  const genericCookingMethod = cookingMethod === "assembled";
  const values = [mealType, genericCookingMethod ? undefined : cookingMethod].filter(Boolean) as string[];
  if (!values.length) return null;
  if (!isArabicRecipe) return values.join(" ");

  const translated = values
    .map((value) => ARABIC_DISH_STYLE_LABELS[value.toLowerCase()] ?? "")
    .filter(Boolean);

  return translated.length ? translated.join(" ") : null;
}

function formatRecipeMatchQuality(matchQuality: Recipe["match_quality"], isArabicRecipe: boolean) {
  if (!matchQuality) return null;
  if (!isArabicRecipe) return matchQuality;
  return ARABIC_MATCH_QUALITY_LABELS[matchQuality] ?? null;
}

function containsArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

const ARABIC_DISH_STYLE_LABELS: Record<string, string> = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
  snack: "وجبة خفيفة",
  grilled: "مشوي",
  baked: "مخبوز",
  fried: "مقلي",
  "stir-fried": "سوتيه",
  simmered: "مطهو بهدوء",
  skillet: "في المقلاة"
};

const ARABIC_MATCH_QUALITY_LABELS: Record<NonNullable<Recipe["match_quality"]>, string> = {
  great: "مطابقة ممتازة",
  good: "مطابقة جيدة",
  possible: "مطابقة ممكنة",
  stretch: "مطابقة ضعيفة"
};

function buildRecipePreviewItems(recipe: Recipe) {
  const pantryItems = recipe.ingredients.map(getRecipeIngredientLabel).filter(Boolean);
  if (pantryItems.length) return pantryItems.slice(0, 5);
  return recipe.missing_ingredients.map(getRecipeIngredientLabel).slice(0, 5);
}

function buildRecipeSections(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  return [
    {
      title: t("ingredientsYouHave"),
      tone: "have" as const,
      items: recipe.ingredients.map(getRecipeIngredientLabel)
    },
    {
      title: t("ingredientsYouNeed"),
      tone: "need" as const,
      items: recipe.missing_ingredients.map(getRecipeIngredientLabel)
    },
    {
      title: t("prepSteps"),
      tone: "steps" as const,
      items: recipe.steps
    }
  ];
}

function getRecipeEyebrow(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  if (recipe.recipe_origin === "exact_scan_match") return t("exactScannedDish");
  if (recipe.recipe_origin === "similar_ingredients") return t("similarIngredients");
  return undefined;
}

function getRecipePreviewLabel(recipe: Recipe, t: ReturnType<typeof useApp>["t"]) {
  if (recipe.recipe_origin === "exact_scan_match") {
    return t("exactRecipePreview");
  }

  if (recipe.recipe_origin === "similar_ingredients") {
    return t("similarRecipePreview");
  }

  return t("previewIngredientsMacros");
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  const queue = [...items];
  const workerCount = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item === undefined) return;
        await worker(item);
      }
    })
  );
}
