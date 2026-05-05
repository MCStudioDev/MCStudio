import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorageBucket, hasFirebaseAdminConfig } from "@/lib/firebaseAdmin";

export interface SharedRecipePhotoEntry {
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageUrl: string;
  model?: string;
  query: string;
  signature: string;
  source: "generated" | "google_search" | "pexels_search" | "unsplash_search" | "wikimedia";
}

const COLLECTION_NAME = "recipePhotoCache";

export async function getSharedRecipePhoto(signature: string): Promise<SharedRecipePhotoEntry | null> {
  if (!hasFirebaseAdminConfig()) return null;

  const snapshot = await getAdminDb().collection(COLLECTION_NAME).doc(signature).get();
  if (!snapshot.exists) return null;

  const data = snapshot.data();
  if (!data?.imageUrl || !data?.source) return null;

  return {
    imageAttributionName: typeof data.imageAttributionName === "string" ? data.imageAttributionName : undefined,
    imageAttributionUrl: typeof data.imageAttributionUrl === "string" ? data.imageAttributionUrl : undefined,
    imageUrl: String(data.imageUrl),
    model: typeof data.model === "string" ? data.model : undefined,
    query: typeof data.query === "string" ? data.query : "",
    signature,
    source:
      data.source === "generated"
        ? "generated"
        : data.source === "google_search"
          ? "google_search"
          : data.source === "unsplash_search"
            ? "unsplash_search"
          : data.source === "pexels_search"
            ? "pexels_search"
            : "wikimedia"
  };
}

export async function getSharedRecipePhotoBySignatures(signatures: string[]) {
  for (const signature of signatures) {
    const entry = await getSharedRecipePhoto(signature);
    if (entry) {
      return entry;
    }
  }

  return null;
}

export async function getSharedRecipePhotoByExactAliases(aliases: string[]) {
  return getSharedRecipePhotoBySignatures(aliases);
}

export async function persistSharedRecipePhoto(entry: SharedRecipePhotoEntry) {
  if (!hasFirebaseAdminConfig()) return entry;

  const persistedImageUrl = /^data:/i.test(entry.imageUrl)
    ? await uploadSharedRecipeImage(entry.signature, entry.imageUrl)
    : entry.imageUrl;

  const nextEntry = {
    ...entry,
    imageUrl: persistedImageUrl
  };

  await getAdminDb()
    .collection(COLLECTION_NAME)
    .doc(entry.signature)
    .set(
      {
        imageUrl: nextEntry.imageUrl,
        imageAttributionName: nextEntry.imageAttributionName ?? null,
        imageAttributionUrl: nextEntry.imageAttributionUrl ?? null,
        model: nextEntry.model ?? null,
        query: nextEntry.query,
        signature: nextEntry.signature,
        source: nextEntry.source,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

  return nextEntry;
}

export async function persistSharedRecipePhotoAliases(entry: SharedRecipePhotoEntry, aliases: string[]) {
  const persisted = await persistSharedRecipePhoto(entry);

  if (!hasFirebaseAdminConfig() || !aliases.length) {
    return persisted;
  }

  const uniqueAliases = Array.from(new Set(aliases.filter((alias) => alias && alias !== entry.signature)));
  if (!uniqueAliases.length) {
    return persisted;
  }

  const db = getAdminDb();
  const writes = uniqueAliases.map((alias) =>
    db
      .collection(COLLECTION_NAME)
      .doc(alias)
      .set(
        {
          imageUrl: persisted.imageUrl,
          imageAttributionName: persisted.imageAttributionName ?? null,
          imageAttributionUrl: persisted.imageAttributionUrl ?? null,
          model: persisted.model ?? null,
          query: persisted.query,
          signature: alias,
          source: persisted.source,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      )
  );

  await Promise.all(writes);
  return persisted;
}

export async function persistSharedRecipePhotoExactAliases(entry: SharedRecipePhotoEntry, aliases: string[]) {
  return persistSharedRecipePhotoAliases(entry, aliases);
}

async function uploadSharedRecipeImage(signature: string, imageUrl: string) {
  const parsed = parseDataUrl(imageUrl);
  const bucket = getAdminStorageBucket();
  const extension = getImageExtension(parsed.mimeType);
  const objectPath = `recipe-photo-cache/${signature}.${extension}`;
  const downloadToken = randomUUID();
  const file = bucket.file(objectPath);

  await file.save(parsed.buffer, {
    contentType: parsed.mimeType,
    metadata: {
      cacheControl: "public,max-age=31536000,immutable",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken
      }
    },
    resumable: false
  });

  return buildFirebaseDownloadUrl(bucket, objectPath, downloadToken);
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Generated image payload was not a supported data URL.");
  }

  return {
    buffer: Buffer.from(match[2], "base64"),
    mimeType: match[1]
  };
}

function getImageExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

function buildFirebaseDownloadUrl(
  bucket: ReturnType<typeof getAdminStorageBucket>,
  objectPath: string,
  downloadToken: string
) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
}
