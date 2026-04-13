"use client";

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: string;
  addedAt: Date;
}

export function useInventory() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

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
        
        setItems(results);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching inventory:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

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

  return { items, loading, error, addItem, removeItem };
}
