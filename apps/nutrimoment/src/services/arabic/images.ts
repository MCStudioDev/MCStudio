import { getAdminDb, getAdminStorageBucket } from "@/lib/firebaseAdmin";
import { generateArabicRecipeImage, ARABIC_IMAGE_PROMPT_VERSION } from "./imageProvider";
import { isReplicateGenerationAllowedForUser, recordReplicateGeneration } from "@/services/replicateCostCapService";
import { canReuseRecipePhotoForDiet } from "@/services/recipePhotoReusePolicy";
import { arabicPaths, assertArabicWritePath } from "./repository";
import { arabicEnabled, ARABIC_VALIDATOR_VERSION, ARABIC_READABLE_VERSIONS } from "./config";
import { revalidateArabicEntry } from "./validation";
import { arabicSourceIsCurrent } from "./sourceEligibility";
import { readEnglishSource, englishSourceFingerprint, englishSourceRecipe } from "./englishSources";
import type { ArabicRecipeEntry } from "./types";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import type { RequestAccess } from "@/services/authService";
import type { Recipe } from "@/lib/types";
import { acquireArabicImageLease, releaseArabicImageLease } from "./imageLease";
import { logger } from "@/lib/logger";
import { readTrustedArabicSource, trustedArabicSourceFingerprint } from "./trustedSources";
import { arabicSourceFoodIds, sameArabicSourceDish } from "./sourceCandidates";
import { arabicFoodById } from "./foodCatalog";
import { arabicImageIdentity, ARABIC_IMAGE_IDENTITY_VERSION } from "./imageIdentity";

export function arabicImageObjectPath(id: string) {
  if (!/^(?:ar-[a-f0-9]{24}|dish-[a-f0-9]{40})$/.test(id)) throw new Error("Invalid Arabic image identity");
  return `arabic-recipe-photos-v1/${id}`;
}
const pending = new Map<string, Promise<string>>();

export async function readValidatedArabicEntry(id: string, restrictions: GenerationRestrictions) {
  const snapshot = await getAdminDb().doc(arabicPaths.shared(id)).get();
  if (!snapshot.exists) throw new Error("Arabic recipe unavailable");
  const entry = snapshot.data() as ArabicRecipeEntry;
  const checked = await revalidateArabicEntry(entry, restrictions);
  if (!checked.entry || checked.entry.id !== id || checked.entry.fingerprint !== entry.fingerprint || !ARABIC_READABLE_VERSIONS.has(entry.validatorVersion)) throw new Error("Arabic recipe validation failed");
  if (entry.source && !await arabicSourceIsCurrent(entry.source)) throw new Error("English source unavailable or changed");
  return checked.entry;
}

export async function resolveArabicImage(entry: ArabicRecipeEntry, restrictions: GenerationRestrictions, access: RequestAccess, allowGeneration: boolean) {
  const cached = await readArabicImage(entry, restrictions);
  if (cached) return cached.imageUrl;
  if (!allowGeneration) throw new Error("ARABIC_IMAGE_NOT_CACHED");
  if (!arabicEnabled()) throw new Error("ARABIC_GENERATION_DISABLED");
  const identity = await arabicImageIdentity(entry), cachePath = arabicPaths.image(identity.id);
  const current = pending.get(identity.id);
  if (current) {
    const imageUrl = await current;
    // A sibling recipe may have a different source which changed while waiting.
    await readValidatedArabicEntry(entry.id, restrictions);
    return imageUrl;
  }
  const task = (async () => {
    const owner = crypto.randomUUID();
    await acquireArabicImageLease(identity.id, owner);
    try {
    // Another worker may have finished between the first read and our lease.
    const ready = await readArabicImage(entry, restrictions);
    if (ready) return ready.imageUrl;
    const cap = await isReplicateGenerationAllowedForUser(access);
    if (!cap.allowed) throw new Error("ARABIC_IMAGE_LIMIT_REACHED");
    const image = await generateArabicRecipeImage(entry.canonical);
    if (!image) throw new Error("Image generation unavailable");
    await recordReplicateGeneration(access, cap.dailyLimit);
    const url = new URL(image.imageUrl);
    if (url.protocol !== "https:" || !(url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery"))) throw new Error("Unexpected image provider URL");
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (!response.ok || !["image/webp", "image/png", "image/jpeg"].includes(contentType ?? "")) throw new Error("Invalid generated image");
    if (Number(response.headers.get("content-length") ?? 0) > 10_000_000) throw new Error("Image too large");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 10_000_000) throw new Error("Image too large");
    await readValidatedArabicEntry(entry.id, restrictions);
    if (!arabicEnabled()) throw new Error("Arabic generation disabled");
    const bucket = getAdminStorageBucket(), objectPath = arabicImageObjectPath(identity.id), token = crypto.randomUUID();
    await bucket.file(objectPath).save(buffer, { resumable: false, contentType, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
    assertArabicWritePath(cachePath);
    // One Arabic dish photo serves all validated recipe versions. Content
    // fingerprints and source eligibility remain independent safety checks.
    const db = getAdminDb();
    await db.runTransaction(async transaction => {
      if (entry.source && !await arabicSourceIsCurrent(entry.source, transaction)) throw new Error("Source changed before Arabic image publication");
      const lease = (await transaction.get(db.doc(cachePath))).data();
      if (lease?.leaseOwner !== owner) throw new Error("Arabic image lease lost");
      transaction.set(db.doc(cachePath), { imageUrl, imageSource: "replicate", objectPath, fingerprint: entry.fingerprint,
        validatorVersion: ARABIC_VALIDATOR_VERSION, promptVersion: ARABIC_IMAGE_PROMPT_VERSION, recipeId: entry.id,
        identityVersion: ARABIC_IMAGE_IDENTITY_VERSION, identityFingerprint: identity.fingerprint, source: entry.source ?? null });
    });
    return imageUrl;
    } finally {
      await releaseArabicImageLease(identity.id, owner).catch(() => logger.warn("Arabic image lease cleanup deferred until expiry"));
    }
  })().finally(() => pending.delete(identity.id));
  pending.set(identity.id, task);
  return task;
}

export async function readArabicImage(entry: ArabicRecipeEntry, restrictions: GenerationRestrictions) {
  if (entry.source && !await arabicSourceIsCurrent(entry.source)) throw new Error("Source changed");
  const db = getAdminDb(), identity = await arabicImageIdentity(entry), sharedPath = arabicPaths.image(identity.id);
  const stable = (await db.doc(sharedPath).get()).data();
  if (await usableDishPhoto(stable, identity)) return photoResult(stable!);
  const legacy = (await db.doc(arabicPaths.image(entry.id)).get()).data();
  if (legacy?.fingerprint === entry.fingerprint && legacy.promptVersion === ARABIC_IMAGE_PROMPT_VERSION
    && ARABIC_READABLE_VERSIONS.has(legacy.validatorVersion) && typeof legacy.imageUrl === "string"
    && /^https:\/\//.test(legacy.imageUrl) && legacy.objectPath === arabicImageObjectPath(entry.id)) {
    // Lazily bind an existing Arabic photo instead of regenerating it. A
    // transaction makes concurrent old recipe versions converge on one winner.
    // The original recipe, image object and English data are never rewritten.
    assertArabicWritePath(sharedPath);
    const winner = await db.runTransaction(async transaction => {
      const current = (await transaction.get(db.doc(sharedPath))).data();
      if (await usableDishPhoto(current, identity, transaction)) return current!;
      if (current?.leaseUntil > Date.now()) throw new Error("ARABIC_IMAGE_PENDING");
      if (entry.source && !await arabicSourceIsCurrent(entry.source, transaction)) throw new Error("Source changed");
      const bound = { imageUrl: legacy.imageUrl, imageSource: "replicate", objectPath: legacy.objectPath,
        fingerprint: entry.fingerprint, validatorVersion: entry.validatorVersion, promptVersion: ARABIC_IMAGE_PROMPT_VERSION,
        recipeId: entry.id, source: entry.source ?? null, identityVersion: ARABIC_IMAGE_IDENTITY_VERSION, identityFingerprint: identity.fingerprint };
      transaction.set(db.doc(sharedPath), bound);
      return bound;
    });
    return photoResult(winner);
  }
  if (entry.source?.editorKey) {
    const cached = (await getAdminDb().doc(`recipeEditorSemanticCache/${entry.source.editorKey}`).get()).data();
    const recipe = cached?.recipe as Recipe | undefined;
    if (recipe && await canReuseArabicSourcePicture(recipe, entry.canonical, restrictions) && recipe.image_url && /^https:\/\//.test(recipe.image_url)) return { imageUrl: recipe.image_url, imageSource: recipe.image_source, imageAttributionName: recipe.image_attribution_name, imageAttributionUrl: recipe.image_attribution_url };
  }
  if (entry.source && entry.source.kind !== "reference") {
    const source = entry.source.kind === "trusted" ? readTrustedArabicSource(entry.source.id) : await readEnglishSource(entry.source.id);
    if (!source || (entry.source.kind === "trusted" ? trustedArabicSourceFingerprint(source) : englishSourceFingerprint(source)) !== entry.source.fingerprint) throw new Error("Source changed");
    const recipe = englishSourceRecipe(source);
    if (await canReuseArabicSourcePicture(recipe, entry.canonical, restrictions) && recipe.image_url && /^https:\/\//.test(recipe.image_url)) return { imageUrl: recipe.image_url, imageSource: recipe.image_source, imageAttributionName: recipe.image_attribution_name, imageAttributionUrl: recipe.image_attribution_url };
  }
  return null;
}

function photoResult(record: Record<string, unknown>) {
  return { imageUrl: record.imageUrl as string, imageSource: "replicate" as const };
}
async function usableDishPhoto(record: Record<string, unknown> | undefined, identity: Awaited<ReturnType<typeof arabicImageIdentity>>,
  transaction?: import("firebase-admin/firestore").Transaction) {
  if (!record || record.identityVersion !== ARABIC_IMAGE_IDENTITY_VERSION || record.identityFingerprint !== identity.fingerprint
    || record.promptVersion !== ARABIC_IMAGE_PROMPT_VERSION || !ARABIC_READABLE_VERSIONS.has(record.validatorVersion as string)
    || typeof record.imageUrl !== "string" || !/^https:\/\//.test(record.imageUrl)
    || typeof record.recipeId !== "string" || !/^ar-[a-f0-9]{24}$/.test(record.recipeId)
    || ![arabicImageObjectPath(identity.id), arabicImageObjectPath(record.recipeId)].includes(record.objectPath as string)) return false;
  return !record.source || await arabicSourceIsCurrent(record.source as NonNullable<ArabicRecipeEntry["source"]>, transaction);
}

async function canReuseArabicSourcePicture(recipe: Recipe, corrected: Recipe, restrictions: GenerationRestrictions) {
  if (!canReuseRecipePhotoForDiet(recipe, restrictions.diets, true) || !sameArabicSourceDish(recipe.name, corrected.name)) return false;
  const [source, output] = await Promise.all([recipe, corrected].map(item => arabicSourceFoodIds([...item.ingredients, ...(item.missing_ingredients ?? [])])));
  if (source.unclear || output.unclear) return false;
  const core = (ids: string[]) => ids.filter(id => {
    const food = arabicFoodById(id)!;
    return food.en !== "water" && food.en !== "salt" && !/oil|spice|seasoning|herb|fat/.test(food.categories.join(" "));
  }).sort().join("|");
  return !!core(source.ids) && core(source.ids) === core(output.ids);
}
