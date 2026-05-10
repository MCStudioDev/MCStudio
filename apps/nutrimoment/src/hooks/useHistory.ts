"use client";

import { useEffect, useReducer } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  getDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";
import { isDurableRecipeImageUrl } from "@/lib/recipeImageDurability";
import type { HistoryItem, Recipe, RecipeImageSource } from "@/lib/types";

const MAX_HISTORY_ITEMS = 50;

interface UseHistoryResult {
  items: HistoryItem[];
  loading: boolean;
  error: Error | null;
  addEntry: (entry: Omit<HistoryItem, "id">) => Promise<string | null>;
  replaceEntryRecipes: (entryId: string, recipes: Recipe[]) => Promise<void>;
  updateEntryStatus: (
    entryId: string,
    status: NonNullable<HistoryItem["generationStatus"]>,
    message?: string
  ) => Promise<void>;
  updateRecipeImage: (
    entryId: string,
    recipeIndex: number,
    imageUrl: string,
    errored?: boolean,
    imageSource?: RecipeImageSource,
    imageAttribution?: { name?: string; url?: string }
  ) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

interface HistoryState {
  items: HistoryItem[];
  loading: boolean;
  error: Error | null;
}

type HistoryAction =
  | { type: "loading"; payload: boolean }
  | { type: "items"; payload: HistoryItem[] }
  | { type: "recipes"; payload: { entryId: string; recipes: Recipe[] } }
  | { type: "error"; payload: Error | null };

const INITIAL_STATE: HistoryState = {
  items: [],
  loading: false,
  error: null
};

function stripUndefined<T extends object>(value: T): T {
  const next: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) next[key] = v;
  }
  return next as T;
}

function isFirestoreQuotaError(error: unknown) {
  return (
    error instanceof Error &&
    /resource-exhausted|quota exceeded|too many requests|unavailable/i.test(error.message)
  );
}

function isRenderableImage(imageUrl?: string) {
  return isDurableRecipeImageUrl(imageUrl);
}

function getRecipeImageIdentity(recipe: Recipe) {
  return [
    recipe.id,
    recipe.name,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? [])
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean)
    .join("::");
}

function sanitizeHistoryRecipeImage(recipe: Recipe): Recipe {
  const imageUrl = isRenderableImage(recipe.image_url) ? recipe.image_url : undefined;
  return stripUndefined({
    ...recipe,
    image_url: imageUrl,
    image_source: imageUrl ? recipe.image_source : undefined,
    image_attribution_name: imageUrl ? recipe.image_attribution_name : undefined,
    image_attribution_url: imageUrl ? recipe.image_attribution_url : undefined
  });
}

function preserveExistingRecipeImage(nextRecipe: Recipe, existingRecipe?: Recipe): Recipe {
  const sanitizedNextRecipe = sanitizeHistoryRecipeImage(nextRecipe);
  if (!existingRecipe || isRenderableImage(sanitizedNextRecipe.image_url)) {
    return sanitizedNextRecipe;
  }

  if (!isRenderableImage(existingRecipe.image_url)) {
    return sanitizedNextRecipe;
  }

  return stripUndefined({
    ...sanitizedNextRecipe,
    image_url: existingRecipe.image_url,
    image_source: sanitizedNextRecipe.image_source ?? existingRecipe.image_source,
    image_attribution_name: sanitizedNextRecipe.image_attribution_name ?? existingRecipe.image_attribution_name,
    image_attribution_url: sanitizedNextRecipe.image_attribution_url ?? existingRecipe.image_attribution_url,
    image_loading: false,
    image_error: false
  });
}

async function getLatestHistoryEntryForMerge(
  entryRef: ReturnType<typeof doc>,
  entryId: string,
  localItems: HistoryItem[]
): Promise<HistoryItem | null> {
  try {
    const snapshot = await getDoc(entryRef);
    if (snapshot.exists()) {
        const data = snapshot.data() as {
          completedAt?: string;
          generationMessage?: string;
          generationStatus?: HistoryItem["generationStatus"];
          ingredients?: string[];
          recipes?: Recipe[];
          sessionType?: HistoryItem["sessionType"];
          timestamp?: string;
          title?: string;
        };

      return {
        id: entryId,
        timestamp: data.timestamp ?? new Date().toISOString(),
        title: data.title,
        sessionType: data.sessionType,
        ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
        recipes: Array.isArray(data.recipes) ? data.recipes.map(sanitizeHistoryRecipeImage) : [],
        generationStatus: data.generationStatus,
        generationMessage: data.generationMessage,
        completedAt: data.completedAt
      };
    }
  } catch (error) {
    logger.warn("History merge read failed; using local history state", {
      entryId,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }

  return localItems.find((item) => item.id === entryId) ?? null;
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "loading":
      return { ...state, loading: action.payload };
    case "items":
      return { ...state, items: action.payload, error: null };
    case "recipes":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload.entryId ? { ...item, recipes: action.payload.recipes } : item
        )
      };
    case "error":
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

export function useHistory(): UseHistoryResult {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(historyReducer, INITIAL_STATE);

  useEffect(() => {
    if (!user) {
      return;
    }

    dispatch({ type: "loading", payload: true });
    void pruneHistoryToLatestLimit(user.uid).catch((error) => {
      logger.warn("History pruning failed during initialization", {
        uid: user.uid,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    });
    const q = query(
      collection(db, `users/${user.uid}/history`),
      orderBy("createdAt", "desc"),
      limit(MAX_HISTORY_ITEMS)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: HistoryItem[] = snap.docs.map((d) => {
          const data = d.data() as {
            completedAt?: string;
            generationMessage?: string;
            generationStatus?: HistoryItem["generationStatus"];
            timestamp?: string;
            title?: string;
            sessionType?: HistoryItem["sessionType"];
            ingredients?: string[];
            recipes?: Recipe[];
          };
          return {
            id: d.id,
            timestamp: data.timestamp ?? new Date().toISOString(),
            title: data.title,
            sessionType: data.sessionType,
            ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
            recipes: Array.isArray(data.recipes) ? data.recipes.map(sanitizeHistoryRecipeImage) : [],
            generationStatus: data.generationStatus,
            generationMessage: data.generationMessage,
            completedAt: data.completedAt
          };
        });
        dispatch({ type: "items", payload: next });
        dispatch({ type: "loading", payload: false });
      },
      (err) => {
        dispatch({ type: "error", payload: err });
        dispatch({ type: "loading", payload: false });
      }
    );

    return () => unsub();
  }, [user]);

  const items = user ? state.items : [];
  const effectiveLoading = user ? state.loading : false;

  const addEntry = async (entry: Omit<HistoryItem, "id">): Promise<string | null> => {
    if (!user) return null;
    const ref = await addDoc(collection(db, `users/${user.uid}/history`), stripUndefined({
      timestamp: entry.timestamp,
      title: entry.title,
      sessionType: entry.sessionType,
      ingredients: entry.ingredients,
      recipes: entry.recipes.map(sanitizeHistoryRecipeImage),
      generationStatus: entry.generationStatus,
      generationMessage: entry.generationMessage,
      completedAt: entry.completedAt,
      createdAt: serverTimestamp()
    }));
    await pruneHistoryToLatestLimit(user.uid);
    return ref.id;
  };

  const replaceEntryRecipes = async (entryId: string, recipes: Recipe[]) => {
    if (!user) return;
    const entryRef = doc(db, `users/${user.uid}/history`, entryId);
    const current = await getLatestHistoryEntryForMerge(entryRef, entryId, state.items);
    const existingRecipesByIdentity = new Map(
      (current?.recipes ?? [])
        .map((recipe) => [getRecipeImageIdentity(recipe), recipe] as const)
        .filter(([identity, recipe]) => Boolean(identity) && isRenderableImage(recipe.image_url))
    );
    const sanitizedRecipes = recipes.map((recipe, index) => {
      const nextRecipe = sanitizeHistoryRecipeImage(stripUndefined(recipe));
      const identity = getRecipeImageIdentity(nextRecipe);
      const existingAtIndex = current?.recipes[index];
      const matchingIndexedRecipe =
        existingAtIndex && getRecipeImageIdentity(existingAtIndex) === identity ? existingAtIndex : undefined;
      return preserveExistingRecipeImage(
        nextRecipe,
        matchingIndexedRecipe ?? existingRecipesByIdentity.get(identity)
      );
    });
    dispatch({ type: "recipes", payload: { entryId, recipes: sanitizedRecipes } });

    try {
      await updateDoc(entryRef, {
        recipes: sanitizedRecipes,
        generationStatus: "completed",
        generationMessage: null,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        logger.warn("Skipping batched history recipe persistence after Firestore throttling", { entryId });
        return;
      }
      throw error;
    }
  };

  const updateEntryStatus = async (
    entryId: string,
    status: NonNullable<HistoryItem["generationStatus"]>,
    message?: string
  ) => {
    if (!user) return;
    await updateDoc(doc(db, `users/${user.uid}/history`, entryId), stripUndefined({
      completedAt: status === "completed" ? new Date().toISOString() : undefined,
      generationMessage: message ?? null,
      generationStatus: status
    }));
  };

  const updateRecipeImage = async (
    entryId: string,
    recipeIndex: number,
    imageUrl: string,
    errored = false,
    imageSource?: RecipeImageSource,
    imageAttribution?: { name?: string; url?: string }
  ) => {
    if (!user) return;
    const entryRef = doc(db, `users/${user.uid}/history`, entryId);
    const current = await getLatestHistoryEntryForMerge(entryRef, entryId, state.items);
    if (!current) return;
    const recipes = [...current.recipes];
    if (!recipes[recipeIndex]) return;
    const currentRecipe = recipes[recipeIndex];
    const requestedImageUrl = isRenderableImage(imageUrl) ? imageUrl : undefined;
    const currentImageUrl = isRenderableImage(currentRecipe.image_url) ? currentRecipe.image_url : undefined;
    const nextImageUrl = requestedImageUrl ?? currentImageUrl;
    const nextImageSource = nextImageUrl ? imageSource ?? currentRecipe.image_source : undefined;
    const nextAttributionName = nextImageUrl ? imageAttribution?.name ?? currentRecipe.image_attribution_name : undefined;
    const nextAttributionUrl = nextImageUrl ? imageAttribution?.url ?? currentRecipe.image_attribution_url : undefined;

    if (
      currentRecipe.image_url === nextImageUrl &&
      currentRecipe.image_error === errored &&
      currentRecipe.image_loading === false &&
      currentRecipe.image_source === nextImageSource &&
      currentRecipe.image_attribution_name === nextAttributionName &&
      currentRecipe.image_attribution_url === nextAttributionUrl
    ) {
      return;
    }

    recipes[recipeIndex] = {
      ...currentRecipe,
      image_url: nextImageUrl,
      image_source: nextImageSource,
      image_attribution_name: nextAttributionName,
      image_attribution_url: nextAttributionUrl,
      image_loading: false,
      image_error: errored
    };
    const sanitizedRecipes = recipes.map(stripUndefined);
    dispatch({ type: "recipes", payload: { entryId, recipes: sanitizedRecipes } });

    try {
      await updateDoc(entryRef, { recipes: sanitizedRecipes });
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        logger.warn("Skipping history image persistence after Firestore throttling", { entryId, recipeIndex });
        return;
      }
      throw error;
    }
  };

  const removeEntry = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, `users/${user.uid}/history`, id));
  };

  const clear = async () => {
    if (!user) return;
    const batch = writeBatch(db);
    items.forEach((item) => {
      batch.delete(doc(db, `users/${user.uid}/history`, item.id));
    });
    await batch.commit();
  };

  return {
    items,
    loading: effectiveLoading,
    error: state.error,
    addEntry,
    replaceEntryRecipes,
    updateEntryStatus,
    updateRecipeImage,
    removeEntry,
    clear
  };
}

async function pruneHistoryToLatestLimit(uid: string) {
  const q = query(
    collection(db, `users/${uid}/history`),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  if (snap.docs.length <= MAX_HISTORY_ITEMS) {
    return;
  }

  const overflowDocs = snap.docs.slice(MAX_HISTORY_ITEMS);
  const batches = chunkArray(overflowDocs, 400);

  for (const docs of batches) {
    const batch = writeBatch(db);
    docs.forEach((entry) => {
      batch.delete(entry.ref);
    });
    await batch.commit();
  }
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
