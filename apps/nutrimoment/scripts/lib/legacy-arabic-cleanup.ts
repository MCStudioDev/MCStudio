import { createHash } from "node:crypto";

export const LEGACY_ARABIC_COLLECTION = "sharedRecipesV2";
export const LEGACY_ARABIC_FIELD = "localized.Arabic";

export function assertLegacyArabicTarget(path: string) {
  if (!/^sharedRecipesV2\/[\w-]+$/.test(path)) throw new Error("Cleanup target outside approved shared recipe collection");
}

/** Remove exactly one nested field without mutating the snapshot or other locales. */
export function withoutLegacyArabic(data: Record<string, unknown>): Record<string, unknown> {
  const localized = data.localized;
  if (!localized || typeof localized !== "object" || Array.isArray(localized)) return { ...data };
  const remaining = { ...localized } as Record<string, unknown>;
  delete remaining.Arabic;
  return { ...data, localized: remaining };
}

// Firestore snapshots have deterministic JSON representations, including timestamp
// seconds/nanoseconds. Sort map keys but preserve array order and every value.
export function cleanupFingerprint(value: unknown): string {
  const json = JSON.parse(JSON.stringify(value));
  function stable(item: unknown): string {
    if (Array.isArray(item)) return `[${item.map(stable).join(",")}]`;
    if (item && typeof item === "object") return `{${Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stable(val)}`).join(",")}}`;
    return JSON.stringify(item);
  }
  return createHash("sha256").update(stable(json)).digest("hex");
}
