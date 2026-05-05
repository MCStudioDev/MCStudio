import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import { normalizeCachedRecipeCatalogDoc } from "../src/data/offline/recipeMetadata";
import type { RecipeCatalogDoc } from "../src/lib/domain";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const COLLECTION_NAME = "sharedOfflineRecipeCache";
const DEFAULT_PAGE_SIZE = 150;
const MAX_WRITE_ATTEMPTS = 6;
const BASE_RETRY_DELAY_MS = 5_000;
const WRITE_PACING_DELAY_MS = 150;
const SAMPLE_LIMIT = 20;

const DRY_RUN = hasFlag("--dry-run");
const CONFIRMED = hasFlag("--confirm");
const PAGE_SIZE = readNumberArg("--page-size") ?? DEFAULT_PAGE_SIZE;

type CleanupDecision =
  | { action: "keep"; reason: string; normalized: RecipeCatalogDoc }
  | { action: "update"; reason: string; normalized: RecipeCatalogDoc }
  | { action: "delete"; reason: string; normalized: RecipeCatalogDoc };

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  if (!DRY_RUN && !CONFIRMED) {
    throw new Error(
      `Refusing to modify ${COLLECTION_NAME} without --confirm. Run with --dry-run first, then rerun with --confirm.`
    );
  }

  const db = getAdminDb();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let scanned = 0;
  let kept = 0;
  let updated = 0;
  let deleted = 0;
  const samples: string[] = [];

  process.stdout.write(
    `${DRY_RUN ? "Dry run" : "Cleanup"} for ${COLLECTION_NAME}. Page size: ${PAGE_SIZE}\n`
  );

  while (true) {
    let query = db.collection(COLLECTION_NAME).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const docSnap of snapshot.docs) {
      scanned += 1;
      const current = stripUndefinedDeep(docSnap.data() as RecipeCatalogDoc);
      const decision = decideCleanup(current);
      const label = formatSample(docSnap.id, current, decision.reason);

      if (decision.action === "delete") {
        deleted += 1;
        if (samples.length < SAMPLE_LIMIT) samples.push(`DELETE ${label}`);
        if (!DRY_RUN) {
          await deleteDocWithRetry(docSnap.ref, `${COLLECTION_NAME}/${docSnap.id}`);
          await sleep(WRITE_PACING_DELAY_MS);
        }
        continue;
      }

      if (decision.action === "update") {
        updated += 1;
        if (samples.length < SAMPLE_LIMIT) samples.push(`UPDATE ${label}`);
        if (!DRY_RUN) {
          await setDocWithRetry(
            docSnap.ref,
            stripUndefinedDeep({ ...decision.normalized, updatedAt: Date.now() }),
            `${COLLECTION_NAME}/${docSnap.id}`
          );
          await sleep(WRITE_PACING_DELAY_MS);
        }
        continue;
      }

      kept += 1;
    }

    process.stdout.write(`Scanned ${scanned}, deleted ${deleted}, updated ${updated}, kept ${kept}\n`);
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }

  process.stdout.write(
    `Done. scanned=${scanned}, deleted=${deleted}, updated=${updated}, kept=${kept}\n`
  );
  if (samples.length) {
    process.stdout.write(`Samples:\n${samples.map((sample) => `- ${sample}`).join("\n")}\n`);
  }
  if (DRY_RUN) {
    process.stdout.write("Dry run only. No Firestore writes were performed.\n");
  }
}

function decideCleanup(current: RecipeCatalogDoc): CleanupDecision {
  const normalized = stripUndefinedDeep(normalizeCachedRecipeCatalogDoc(repairWeakSharedRecipeIdentity(current)));
  const quality = inspectRecipeQuality(normalized);

  if (!quality.usable) {
    return {
      action: "delete",
      reason: quality.reason,
      normalized
    };
  }

  if (!isSameRecipeDoc(current, normalized)) {
    return {
      action: "update",
      reason: "normalized recoverable shared recipe",
      normalized
    };
  }

  return {
    action: "keep",
    reason: "already usable",
    normalized
  };
}

function repairWeakSharedRecipeIdentity(recipe: RecipeCatalogDoc): RecipeCatalogDoc {
  const normalized = stripUndefinedDeep(normalizeCachedRecipeCatalogDoc(recipe));
  const englishName = normalized.localized?.English?.name ?? normalized.title ?? "";
  if (!isWeakSharedTitle(englishName)) return normalized;

  const specificIdentity = pickSpecificIdentity(normalized);
  if (!specificIdentity) return normalized;

  const repairedTitle = toTitleCase(specificIdentity);
  const repaired: RecipeCatalogDoc = {
    ...normalized,
    title: repairedTitle,
    slug: slugify(repairedTitle) || normalized.slug,
    description: isWeakSharedTitle(normalized.description ?? "") ? repairedTitle : normalized.description,
    image: {
      ...normalized.image,
      sourceQuery: repairedTitle
    },
    localized: {
      ...(normalized.localized ?? {}),
      English: normalized.localized?.English
        ? {
            ...normalized.localized.English,
            name: repairedTitle,
            image_search_index: repairedTitle,
            image_search_indices: [
              repairedTitle,
              ...(normalized.localized.English.image_search_indices ?? [])
            ].filter((value, index, values) => values.indexOf(value) === index)
          }
        : undefined
    },
    searchTokens: [
      repairedTitle,
      ...(normalized.searchTokens ?? [])
    ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
  };

  return stripUndefinedDeep(normalizeCachedRecipeCatalogDoc(repaired));
}

function inspectRecipeQuality(recipe: RecipeCatalogDoc) {
  const englishName = recipe.localized?.English?.name ?? recipe.title ?? "";
  const arabicName = recipe.localized?.Arabic?.name ?? "";
  const visibleText = collectVisibleText(recipe).join(" ");

  if (!recipe.isActive) {
    return { usable: false, reason: "inactive recipe" };
  }

  if (containsCorruptPlaceholder(visibleText)) {
    return { usable: false, reason: "corrupt Arabic placeholder text" };
  }

  if (hasRepeatedContentToken(englishName)) {
    return { usable: false, reason: "repeated English title tokens" };
  }

  if (isWeakSharedTitle(englishName) && !pickSpecificIdentity(recipe)) {
    return { usable: false, reason: "generic title without recoverable dish identity" };
  }

  if (arabicName && containsLatinText(arabicName) && !containsArabicText(arabicName)) {
    return { usable: false, reason: "Arabic title is not Arabic" };
  }

  if (!recipe.ingredientCanonicals?.length) {
    return { usable: false, reason: "missing ingredient canonicals" };
  }

  return { usable: true, reason: "usable" };
}

function pickSpecificIdentity(recipe: RecipeCatalogDoc) {
  return [
    recipe.localized?.English?.dish_intent?.dish_name,
    recipe.dishIntent?.dish_name,
    recipe.localized?.English?.image_search_index,
    ...(recipe.localized?.English?.image_search_indices ?? []),
    recipe.image?.sourceQuery,
    recipe.title
  ].find((value) => typeof value === "string" && isSpecificIdentity(value));
}

function isWeakSharedTitle(value: string) {
  const normalized = value.toLowerCase();
  return (
    /\bany\b/.test(normalized) ||
    /\bdinner plate\b/.test(normalized) ||
    /\blunch bowl\b/.test(normalized) ||
    /\bbreakfast bowl\b/.test(normalized) ||
    /\bsnack plate\b/.test(normalized) ||
    /\b(global|generic|unknown) food\b/.test(normalized) ||
    hasRepeatedContentToken(normalized) ||
    containsCorruptPlaceholder(value)
  );
}

function isSpecificIdentity(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || !containsLatinText(normalized) || containsArabicText(normalized)) return false;
  if (normalized.length < 4) return false;
  if (/\b(any|unknown|global|generic|food|meal|recipe)\b/.test(normalized)) return false;
  if (/\b(assembled|prepared|plated)\b/.test(normalized)) return false;
  if (/\b(dinner plate|lunch bowl|breakfast bowl|snack plate)\b/.test(normalized)) return false;
  if (hasRepeatedContentToken(normalized)) return false;
  return true;
}

function collectVisibleText(recipe: RecipeCatalogDoc) {
  return [
    recipe.title,
    recipe.description,
    recipe.cuisine,
    recipe.image?.sourceQuery,
    recipe.localized?.English?.name,
    recipe.localized?.English?.cuisine,
    recipe.localized?.English?.image_search_index,
    ...(recipe.localized?.English?.image_search_indices ?? []),
    ...(recipe.localized?.English?.ingredients ?? []),
    ...(recipe.localized?.English?.missing_ingredients ?? []),
    ...(recipe.localized?.English?.steps ?? []),
    recipe.localized?.Arabic?.name,
    recipe.localized?.Arabic?.cuisine,
    recipe.localized?.Arabic?.image_search_index,
    ...(recipe.localized?.Arabic?.image_search_indices ?? []),
    ...(recipe.localized?.Arabic?.ingredients ?? []),
    ...(recipe.localized?.Arabic?.missing_ingredients ?? []),
    ...(recipe.localized?.Arabic?.steps ?? [])
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function containsCorruptPlaceholder(value: string) {
  return /مكون إضافي|Ù…ÙƒÙˆÙ† Ø¥Ø¶Ø§ÙÙŠ/u.test(value);
}

function containsArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function containsLatinText(value: string) {
  return /[A-Za-z]/.test(value);
}

function hasRepeatedContentToken(value: string) {
  const tokens = value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 4 && !["with", "style", "food"].includes(token));
  const seen = new Set<string>();

  for (const token of tokens) {
    if (seen.has(token)) return true;
    seen.add(token);
  }

  return false;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleCase(value: string) {
  return value
    .trim()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function setDocWithRetry(
  ref: FirebaseFirestore.DocumentReference,
  data: FirebaseFirestore.DocumentData,
  label: string
) {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      await ref.set(data);
      return;
    } catch (error) {
      if (!isRetryableWriteError(error) || attempt === MAX_WRITE_ATTEMPTS) throw error;
      const delayMs = BASE_RETRY_DELAY_MS * attempt;
      process.stdout.write(
        `${label} hit a transient Firestore quota limit. Retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_WRITE_ATTEMPTS}).\n`
      );
      await sleep(delayMs);
    }
  }
}

async function deleteDocWithRetry(ref: FirebaseFirestore.DocumentReference, label: string) {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      await ref.delete();
      return;
    } catch (error) {
      if (!isRetryableWriteError(error) || attempt === MAX_WRITE_ATTEMPTS) throw error;
      const delayMs = BASE_RETRY_DELAY_MS * attempt;
      process.stdout.write(
        `${label} hit a transient Firestore quota limit. Retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_WRITE_ATTEMPTS}).\n`
      );
      await sleep(delayMs);
    }
  }
}

function isRetryableWriteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /RESOURCE_EXHAUSTED|Quota exceeded|Total timeout|Deadline exceeded/i.test(message);
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => stripUndefinedDeep(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
    ) as T;
  }

  return value;
}

function isSameRecipeDoc(left: RecipeCatalogDoc, right: RecipeCatalogDoc) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown) {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeysDeep(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entry]) => [key, sortKeysDeep(entry)])
    );
  }

  return value;
}

function formatSample(id: string, recipe: RecipeCatalogDoc, reason: string) {
  const title = recipe.localized?.English?.name ?? recipe.title ?? "(untitled)";
  return `${id} | ${reason} | ${title}`;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readStringArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function readNumberArg(flag: string) {
  const value = readStringArg(flag);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
