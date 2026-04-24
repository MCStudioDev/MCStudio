"use client";

import { useEffect, useReducer } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { HistoryItem, Recipe, RecipeImageSource } from "@/lib/types";

interface UseHistoryResult {
  items: HistoryItem[];
  loading: boolean;
  error: Error | null;
  addEntry: (entry: Omit<HistoryItem, "id">) => Promise<string | null>;
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
  | { type: "error"; payload: Error | null };

const INITIAL_STATE: HistoryState = {
  items: [],
  loading: false,
  error: null
};

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "loading":
      return { ...state, loading: action.payload };
    case "items":
      return { ...state, items: action.payload, error: null };
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
    const q = query(collection(db, `users/${user.uid}/history`), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: HistoryItem[] = snap.docs.map((d) => {
          const data = d.data() as {
            timestamp?: string;
            ingredients?: string[];
            recipes?: Recipe[];
          };
          return {
            id: d.id,
            timestamp: data.timestamp ?? new Date().toISOString(),
            ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
            recipes: Array.isArray(data.recipes) ? data.recipes : []
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
    const ref = await addDoc(collection(db, `users/${user.uid}/history`), {
      timestamp: entry.timestamp,
      ingredients: entry.ingredients,
      recipes: entry.recipes,
      createdAt: serverTimestamp()
    });
    return ref.id;
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
    const current = state.items.find((i) => i.id === entryId);
    if (!current) return;
    const recipes = [...current.recipes];
    if (!recipes[recipeIndex]) return;
    recipes[recipeIndex] = {
      ...recipes[recipeIndex],
      image_url: imageUrl || recipes[recipeIndex].image_url,
      image_source: imageSource ?? recipes[recipeIndex].image_source,
      image_attribution_name: imageAttribution?.name ?? recipes[recipeIndex].image_attribution_name,
      image_attribution_url: imageAttribution?.url ?? recipes[recipeIndex].image_attribution_url,
      image_loading: false,
      image_error: errored
    };
    await updateDoc(doc(db, `users/${user.uid}/history`, entryId), { recipes });
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

  return { items, loading: effectiveLoading, error: state.error, addEntry, updateRecipeImage, removeEntry, clear };
}
