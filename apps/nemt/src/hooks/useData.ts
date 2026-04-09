// Data hook that abstracts between mock data and Firebase
// ALL queries are scoped by companyId for multi-tenant isolation
import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc, getDoc, query, where } from 'firebase/firestore';
import { mockDb, USE_MOCK_DATA, logActivity } from '../utils/mockData';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { useTenant } from '../contexts/TenantContext';

type CollectionName = 'patients' | 'drivers' | 'vehicles' | 'facilities' | 'trips' | 'activities';

/**
 * useCollection — Returns all documents in a collection scoped to the current company.
 * Every query includes `where('companyId', '==', companyId)` to enforce tenant isolation.
 */
export function useCollection(collectionName: CollectionName) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { companyId } = useTenant();

  useEffect(() => {
    if (USE_MOCK_DATA) {
      const unsubscribe = mockDb.subscribe(collectionName, (items) => {
        setData(items);
        setLoading(false);
      });
      return unsubscribe;
    }

    // Don't query until we have a companyId
    if (!companyId) {
      setData([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, collectionName),
      where('companyId', '==', companyId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort activities by timestamp desc
        if (collectionName === 'activities') {
          items = items.sort((a: any, b: any) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        }
        setData(items);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, collectionName);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [collectionName, companyId]);

  return { data, loading };
}

/**
 * useDocument — Returns a single document by ID. 
 * Verifies the document belongs to the current company before returning.
 */
export function useDocument(collectionName: CollectionName, docId: string | null) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { companyId } = useTenant();

  useEffect(() => {
    if (!docId) {
      setData(null);
      setLoading(false);
      return;
    }

    if (USE_MOCK_DATA) {
      const item = mockDb.get(collectionName, docId);
      setData(item);
      setLoading(false);
      
      // Subscribe for updates
      const unsubscribe = mockDb.subscribe(collectionName, (items) => {
        const found = items.find(i => i.id === docId);
        setData(found || null);
      });
      return unsubscribe;
    }

    if (!companyId) {
      setData(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, collectionName, docId),
      (docSnap) => {
        if (docSnap.exists()) {
          const docData = docSnap.data();
          // Verify tenant isolation — only return data that belongs to this company
          if (docData.companyId && docData.companyId !== companyId) {
            console.warn(`Tenant isolation: Blocked access to ${collectionName}/${docId} — belongs to different company`);
            setData(null);
          } else {
            setData({ id: docSnap.id, ...docData });
          }
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `${collectionName}/${docId}`);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [collectionName, docId, companyId]);

  return { data, loading };
}

// Firebase activity logger — scoped to company
async function logActivityToFirebase(companyId: string, type: 'success' | 'info' | 'warning', message: string) {
  if (USE_MOCK_DATA) {
    logActivity(type, message);
  } else {
    try {
      await addDoc(collection(db, 'activities'), {
        companyId,
        type,
        message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to log activity:', err);
    }
  }
}

/**
 * addDocument — Creates a new document with companyId auto-injected.
 * The companyId parameter is required to ensure every document is tenant-scoped.
 */
export async function addDocument(collectionName: CollectionName, data: any, companyId: string) {
  if (USE_MOCK_DATA) {
    const result = mockDb.add(collectionName, data);
    // Log activity
    if (collectionName === 'drivers') {
      logActivity('success', `New driver added: ${data.name}`);
    } else if (collectionName === 'vehicles') {
      logActivity('info', `New vehicle added: ${data.license_plate}`);
    } else if (collectionName === 'trips') {
      logActivity('info', `New trip scheduled`);
    } else if (collectionName === 'patients') {
      logActivity('success', `New patient registered: ${data.name}`);
    }
    return result;
  } else {
    if (!companyId) {
      throw new Error('Cannot create document: No companyId available. User must be authenticated and assigned to a company.');
    }
    try {
      // Auto-inject companyId into every document
      const docRef = await addDoc(collection(db, collectionName), {
        ...data,
        companyId,
      });
      // Log activity for Firebase
      if (collectionName === 'drivers') {
        await logActivityToFirebase(companyId, 'success', `New driver added: ${data.name}`);
      } else if (collectionName === 'vehicles') {
        await logActivityToFirebase(companyId, 'info', `New vehicle added: ${data.license_plate}`);
      } else if (collectionName === 'trips') {
        await logActivityToFirebase(companyId, 'info', `New trip scheduled`);
      } else if (collectionName === 'patients') {
        await logActivityToFirebase(companyId, 'success', `New patient registered: ${data.name}`);
      }
      return { id: docRef.id, ...data, companyId };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, collectionName);
      throw error;
    }
  }
}

export async function updateDocument(collectionName: CollectionName, docId: string, data: any) {
  if (USE_MOCK_DATA) {
    const existing = mockDb.get(collectionName, docId);
    mockDb.update(collectionName, docId, data);
    // Log activity for status changes
    if (collectionName === 'trips' && data.status && existing?.status !== data.status) {
      logActivity('info', `Trip status changed to ${data.status}`);
    } else if (collectionName === 'drivers' && existing) {
      logActivity('info', `Driver ${existing.name || data.name} updated`);
    }
  } else {
    try {
      // Never allow companyId to be changed via update
      const { companyId: _, ...safeData } = data;
      await updateDoc(doc(db, collectionName, docId), safeData);
      // Log activity for Firebase
      if (collectionName === 'trips' && data.status) {
        // We don't have companyId here, so skip activity logging in updates
        // Activity will be visible from the trip status change itself
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${docId}`);
      throw error;
    }
  }
}

export async function deleteDocument(collectionName: CollectionName, docId: string) {
  if (USE_MOCK_DATA) {
    const existing = mockDb.get(collectionName, docId);
    mockDb.delete(collectionName, docId);
    // Log activity
    if (collectionName === 'drivers' && existing) {
      logActivity('warning', `Driver removed: ${existing.name}`);
    } else if (collectionName === 'vehicles' && existing) {
      logActivity('warning', `Vehicle removed: ${existing.license_plate}`);
    }
  } else {
    try {
      await deleteDoc(doc(db, collectionName, docId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${docId}`);
      throw error;
    }
  }
}

export async function setDocument(collectionName: CollectionName, docId: string, data: any, companyId: string) {
  if (USE_MOCK_DATA) {
    mockDb.set(collectionName, docId, data);
  } else {
    if (!companyId) {
      throw new Error('Cannot set document: No companyId available.');
    }
    try {
      await setDoc(doc(db, collectionName, docId), { ...data, companyId });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${docId}`);
      throw error;
    }
  }
}

export async function getDocument(collectionName: CollectionName, docId: string) {
  if (USE_MOCK_DATA) {
    return mockDb.get(collectionName, docId);
  } else {
    try {
      const docSnap = await getDoc(doc(db, collectionName, docId));
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${collectionName}/${docId}`);
      throw error;
    }
  }
}

export { USE_MOCK_DATA };
