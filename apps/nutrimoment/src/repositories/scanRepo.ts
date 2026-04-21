import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import type { ScanDoc } from "@/lib/domain";

export async function saveScan(scan: ScanDoc): Promise<void> {
  try {
    await setDoc(doc(db, "scans", scan.id), {
      ...scan,
      createdAt: serverTimestamp()
    });
  } catch {
    // Fire-and-forget for now until server auth/admin credentials are added.
  }
}
