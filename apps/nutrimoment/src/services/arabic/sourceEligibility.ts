import type { Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { ArabicRecipeEntry } from "./types";
import { englishSourceFingerprint, readEnglishSource } from "./englishSources";
import { readArabicReferenceSource, referenceFingerprint } from "./referenceSources";
import { arabicFingerprint } from "./fingerprint";
import { readTrustedArabicSource, trustedArabicSourceFingerprint } from "./trustedSources";

export async function arabicSourceIsCurrent(source: NonNullable<ArabicRecipeEntry["source"]>, transaction?: Transaction) {
  if (source.kind === "trusted") {
    const current = readTrustedArabicSource(source.id);
    if (!current || trustedArabicSourceFingerprint(current) !== source.fingerprint) return false;
  } else if (source.kind !== "reference") {
    const current = await readEnglishSource(source.id, transaction);
    if (!current || englishSourceFingerprint(current) !== source.fingerprint) return false;
  } else {
    const current = await readArabicReferenceSource(source.id, transaction);
    if (!current || referenceFingerprint(current) !== source.fingerprint) return false;
  }
  if (source.editorKey) {
    if (!/^[a-f0-9]{64}$/.test(source.editorKey)) return false;
    const ref = getAdminDb().doc(`recipeEditorSemanticCache/${source.editorKey}`);
    const value = (transaction ? await transaction.get(ref) : await ref.get()).data();
    if (!value?.recipe || value.cacheVersion !== "recipe-editor-v11-validation-identity-v1" || value.expiresAt?.toMillis?.() <= Date.now()
      || typeof value.expiresAt?.toMillis !== "function" || arabicFingerprint(value.recipe) !== source.editorFingerprint) return false;
  }
  return true;
}
