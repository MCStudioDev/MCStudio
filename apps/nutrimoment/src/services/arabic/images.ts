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

export function arabicImageObjectPath(id: string) {
  if (!/^ar-[a-f0-9]{24}$/.test(id)) throw new Error("Invalid Arabic image identity");
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
  const cachePath = arabicPaths.image(entry.id);
  const current = pending.get(entry.id);
  if (current) return current;
  const task = (async () => {
    const owner = crypto.randomUUID();
    await acquireArabicImageLease(entry.id, owner);
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
    const bucket = getAdminStorageBucket(), objectPath = arabicImageObjectPath(entry.id), token = crypto.randomUUID();
    await bucket.file(objectPath).save(buffer, { resumable: false, contentType, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
    assertArabicWritePath(cachePath);
    // This durable document is also the recipe-to-photo association. History,
    // scanner and plans hydrate it by Arabic recipe ID instead of duplicating
    // image data into old result records or writing English photo links.
    const db = getAdminDb();
    await db.runTransaction(async transaction => {
      if (entry.source && !await arabicSourceIsCurrent(entry.source, transaction)) throw new Error("Source changed before Arabic image publication");
      const lease = (await transaction.get(db.doc(cachePath))).data();
      if (lease?.leaseOwner !== owner) throw new Error("Arabic image lease lost");
      transaction.set(db.doc(cachePath), { imageUrl, imageSource: "replicate", objectPath, fingerprint: entry.fingerprint, validatorVersion: ARABIC_VALIDATOR_VERSION, promptVersion: ARABIC_IMAGE_PROMPT_VERSION, recipeId: entry.id });
    });
    return imageUrl;
    } finally {
      await releaseArabicImageLease(entry.id, owner).catch(() => logger.warn("Arabic image lease cleanup deferred until expiry"));
    }
  })().finally(() => pending.delete(entry.id));
  pending.set(entry.id, task);
  return task;
}

export async function readArabicImage(entry: ArabicRecipeEntry, restrictions: GenerationRestrictions) {
  if (entry.source && !await arabicSourceIsCurrent(entry.source)) throw new Error("Source changed");
  if (entry.source?.kind === "reference" && entry.source.editorKey) {
    const cached = (await getAdminDb().doc(`recipeEditorSemanticCache/${entry.source.editorKey}`).get()).data();
    const recipe = cached?.recipe as Recipe | undefined;
    if (recipe && canReuseRecipePhotoForDiet(recipe, restrictions.diets, true) && recipe.image_url && /^https:\/\//.test(recipe.image_url)) return { imageUrl: recipe.image_url, imageSource: recipe.image_source, imageAttributionName: recipe.image_attribution_name, imageAttributionUrl: recipe.image_attribution_url };
  }
  if (entry.source && entry.source.kind !== "reference") {
    const source = await readEnglishSource(entry.source.id);
    if (!source || englishSourceFingerprint(source) !== entry.source.fingerprint) throw new Error("Source changed");
    const recipe = englishSourceRecipe(source);
    if (canReuseRecipePhotoForDiet(recipe, restrictions.diets, true) && recipe.image_url && /^https:\/\//.test(recipe.image_url)) return { imageUrl: recipe.image_url, imageSource: recipe.image_source, imageAttributionName: recipe.image_attribution_name, imageAttributionUrl: recipe.image_attribution_url };
  }
  const cachePath = arabicPaths.image(entry.id);
  const cached = (await getAdminDb().doc(cachePath).get()).data();
  if (cached?.fingerprint === entry.fingerprint && cached.promptVersion === ARABIC_IMAGE_PROMPT_VERSION && ARABIC_READABLE_VERSIONS.has(cached.validatorVersion) && typeof cached.imageUrl === "string" && /^https:\/\//.test(cached.imageUrl) && cached.objectPath === arabicImageObjectPath(entry.id)) return { imageUrl: cached.imageUrl as string, imageSource: "replicate" as const };
  return null;
}
