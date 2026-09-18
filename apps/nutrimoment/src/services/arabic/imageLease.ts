import { getAdminDb } from "@/lib/firebaseAdmin";
import { arabicPaths, assertArabicWritePath } from "./repository";

export async function acquireArabicImageLease(id: string, owner: string) {
  const path = arabicPaths.image(id); assertArabicWritePath(path);
  const db = getAdminDb(), ref = db.doc(path);
  await db.runTransaction(async transaction => {
    const data = (await transaction.get(ref)).data();
    if (data && data.leaseUntil > Date.now() && data.leaseOwner !== owner) throw new Error("ARABIC_IMAGE_PENDING");
    transaction.set(ref, { leaseOwner: owner, leaseUntil: Date.now() + 150000 }, { merge: true });
  });
}
export async function releaseArabicImageLease(id: string, owner: string) {
  const path = arabicPaths.image(id); assertArabicWritePath(path);
  const db = getAdminDb(), ref = db.doc(path);
  await db.runTransaction(async transaction => {
    const data = (await transaction.get(ref)).data();
    if (data?.leaseOwner === owner) transaction.set(ref, { leaseOwner: null, leaseUntil: 0 }, { merge: true });
  });
}
