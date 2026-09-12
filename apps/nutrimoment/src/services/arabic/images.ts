import { getAdminDb, getAdminStorageBucket } from "@/lib/firebaseAdmin";
import { generateRecipeImageWithReplicate } from "@/lib/replicateRecipeImage";
import { isReplicateGenerationAllowedForUser, recordReplicateGeneration } from "@/services/replicateCostCapService";
import { canReuseRecipePhotoForDiet } from "@/services/recipePhotoReusePolicy";
import { arabicPaths, assertArabicWritePath } from "./repository";
import { arabicEnabled, ARABIC_VALIDATOR_VERSION } from "./config";
import { buildArabicEntry } from "./validation";
import { readEnglishSource, englishSourceFingerprint, englishSourceRecipe } from "./englishSources";
import type { ArabicRecipeEntry } from "./types";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import type { RequestAccess } from "@/services/authService";

export function arabicImageObjectPath(id: string) {
  if (!/^ar-[a-f0-9]{24}$/.test(id)) throw new Error("Invalid Arabic image identity");
  return `arabic-recipe-photos-v1/${id}`;
}
const pending = new Map<string, Promise<string>>();

export async function readValidatedArabicEntry(id: string, restrictions: GenerationRestrictions) {
  const snapshot = await getAdminDb().doc(arabicPaths.shared(id)).get();
  if (!snapshot.exists) throw new Error("Arabic recipe unavailable");
  const entry = snapshot.data() as ArabicRecipeEntry;
  const checked = await buildArabicEntry(entry.canonical, entry.recipe, restrictions, entry.source);
  if (!checked.entry || checked.entry.id !== id || checked.entry.fingerprint !== entry.fingerprint || entry.validatorVersion !== ARABIC_VALIDATOR_VERSION) throw new Error("Arabic recipe validation failed");
  if (entry.source) {
    const source = await readEnglishSource(entry.source.id);
    if (!source || englishSourceFingerprint(source) !== entry.source.fingerprint) throw new Error("English source unavailable or changed");
  }
  return checked.entry;
}

export async function resolveArabicImage(entry: ArabicRecipeEntry, restrictions: GenerationRestrictions, access: RequestAccess, allowGeneration: boolean) {
  if (entry.source) {
    const source = await readEnglishSource(entry.source.id);
    if (!source || englishSourceFingerprint(source) !== entry.source.fingerprint) throw new Error("Source changed");
    const recipe = englishSourceRecipe(source);
    if (canReuseRecipePhotoForDiet(recipe, restrictions.diets, true) && recipe.image_url) return recipe.image_url;
  }
  const cachePath = arabicPaths.image(entry.id);
  const cached = (await getAdminDb().doc(cachePath).get()).data();
  if (cached?.fingerprint === entry.fingerprint && cached.validatorVersion === ARABIC_VALIDATOR_VERSION && typeof cached.imageUrl === "string" && cached.objectPath === arabicImageObjectPath(entry.id)) return cached.imageUrl as string;
  if (!allowGeneration) throw new Error("No verified Arabic image is available");
  const current = pending.get(entry.id);
  if (current) return current;
  const task = (async () => {
    const cap = await isReplicateGenerationAllowedForUser(access);
    if (!cap.allowed) throw new Error("Image generation limit reached");
    const image = await generateRecipeImageWithReplicate(entry.canonical.name, [...entry.canonical.ingredients, ...entry.canonical.missing_ingredients], { exactRecipeName: entry.canonical.name });
    if (!image) throw new Error("Image generation unavailable");
    await recordReplicateGeneration(access, cap.dailyLimit);
    // The URL comes from the configured image provider, never from client input.
    const url = new URL(image.imageUrl);
    if (url.protocol !== "https:" || !(url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery"))) throw new Error("Unexpected image provider URL");
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (!response.ok || !["image/webp", "image/png", "image/jpeg"].includes(contentType ?? "")) throw new Error("Invalid generated image");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 10_000_000) throw new Error("Image too large");
    await readValidatedArabicEntry(entry.id, restrictions);
    if (!arabicEnabled()) throw new Error("Arabic generation disabled");
    const bucket = getAdminStorageBucket(), objectPath = arabicImageObjectPath(entry.id), token = crypto.randomUUID();
    await bucket.file(objectPath).save(buffer, { resumable: false, contentType, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
    assertArabicWritePath(cachePath);
    await getAdminDb().doc(cachePath).set({ imageUrl, objectPath, fingerprint: entry.fingerprint, validatorVersion: ARABIC_VALIDATOR_VERSION, recipeId: entry.id });
    return imageUrl;
  })().finally(() => pending.delete(entry.id));
  pending.set(entry.id, task);
  return task;
}
