import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, hasFirebaseAdminConfig } from "@/lib/firebaseAdmin";

export async function trackImageAiModelCall(options: { model: string }) {
  if (!hasFirebaseAdminConfig()) return;

  const { model } = options;
  const db = getAdminDb();
  const dayKey = new Date().toISOString().slice(0, 10);
  const safeModel = sanitizeModelKey(model);

  await Promise.all([
    db.doc("metrics/imageAi").set(
      {
        [`models.${safeModel}.calls`]: FieldValue.increment(1),
        lastCallAt: FieldValue.serverTimestamp(),
        totalCalls: FieldValue.increment(1)
      },
      { merge: true }
    ),
    db.collection("metrics").doc("imageAiDays").collection("days").doc(dayKey).set(
      {
        [`models.${safeModel}.calls`]: FieldValue.increment(1),
        date: dayKey,
        totalCalls: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    )
  ]);
}

function sanitizeModelKey(model: string) {
  return model.replace(/[^a-zA-Z0-9]+/g, "_");
}
