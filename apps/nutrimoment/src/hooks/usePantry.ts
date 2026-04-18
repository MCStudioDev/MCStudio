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
  writeBatch
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { PantryItem } from "@/lib/types";

interface UsePantryResult {
  items: PantryItem[];
  loading: boolean;
  error: Error | null;
  addItem: (item: Omit<PantryItem, "id">) => Promise<void>;
  addItems: (items: Omit<PantryItem, "id">[]) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

interface PantryState {
  items: PantryItem[];
  loading: boolean;
  error: Error | null;
}

type PantryAction =
  | { type: "loading"; payload: boolean }
  | { type: "items"; payload: PantryItem[] }
  | { type: "error"; payload: Error | null };

const INITIAL_STATE: PantryState = {
  items: [],
  loading: false,
  error: null
};

function pantryReducer(state: PantryState, action: PantryAction): PantryState {
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

export function usePantry(): UsePantryResult {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(pantryReducer, INITIAL_STATE);

  useEffect(() => {
    if (!user) {
      return;
    }

    dispatch({ type: "loading", payload: true });
    const q = query(collection(db, `users/${user.uid}/pantry`), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: PantryItem[] = snap.docs.map((d) => {
          const data = d.data() as { name?: string; quantity?: string; expiration?: string };
          return {
            id: d.id,
            name: data.name ?? "",
            quantity: data.quantity ?? "",
            expiration: data.expiration
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

  const addItem = async (item: Omit<PantryItem, "id">) => {
    if (!user) throw new Error("Must be logged in");
    await addDoc(collection(db, `users/${user.uid}/pantry`), {
      ...item,
      createdAt: serverTimestamp()
    });
  };

  const addItems = async (incoming: Omit<PantryItem, "id">[]) => {
    if (!user) throw new Error("Must be logged in");
    for (const item of incoming) {
      await addDoc(collection(db, `users/${user.uid}/pantry`), {
        ...item,
        createdAt: serverTimestamp()
      });
    }
  };

  const removeItem = async (id: string) => {
    if (!user) throw new Error("Must be logged in");
    await deleteDoc(doc(db, `users/${user.uid}/pantry`, id));
  };

  const clear = async () => {
    if (!user) throw new Error("Must be logged in");
    const batch = writeBatch(db);
    items.forEach((item) => {
      if (item.id) {
        batch.delete(doc(db, `users/${user.uid}/pantry`, item.id));
      }
    });
    await batch.commit();
  };

  return { items, loading: effectiveLoading, error: state.error, addItem, addItems, removeItem, clear };
}
