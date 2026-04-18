"use client";

import { useEffect, useReducer } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: string;
  addedAt: Date;
}

interface InventoryState {
  items: InventoryItem[];
  loading: boolean;
  error: Error | null;
}

type InventoryAction =
  | { type: "loading"; payload: boolean }
  | { type: "items"; payload: InventoryItem[] }
  | { type: "error"; payload: Error | null };

const INITIAL_STATE: InventoryState = {
  items: [],
  loading: false,
  error: null,
};

function inventoryReducer(state: InventoryState, action: InventoryAction): InventoryState {
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

export function useInventory() {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(inventoryReducer, INITIAL_STATE);

  useEffect(() => {
    if (!user) {
      return;
    }

    dispatch({ type: "loading", payload: true });
    const q = query(
      collection(db, `users/${user.uid}/inventory`),
      orderBy('addedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const results = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          // Convert Firestore timestamp to JS Date
          addedAt: doc.data().addedAt?.toDate() || new Date(),
        })) as InventoryItem[];
        
        dispatch({ type: "items", payload: results });
        dispatch({ type: "loading", payload: false });
      },
      (err) => {
        console.error("Error fetching inventory:", err);
        dispatch({ type: "error", payload: err });
        dispatch({ type: "loading", payload: false });
      }
    );

    return () => unsubscribe();
  }, [user]);

  const items = user ? state.items : [];
  const effectiveLoading = user ? state.loading : false;

  const addItem = async (name: string, quantity: string = '1') => {
    if (!user) throw new Error('Must be logged in to add items');
    
    await addDoc(collection(db, `users/${user.uid}/inventory`), {
      name,
      quantity,
      addedAt: serverTimestamp(),
    });
  };

  const removeItem = async (itemId: string) => {
    if (!user) throw new Error('Must be logged in to remove items');
    
    await deleteDoc(doc(db, `users/${user.uid}/inventory`, itemId));
  };

  return { items, loading: effectiveLoading, error: state.error, addItem, removeItem };
}
