import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorageBucket, hasFirebaseAdminConfig } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";

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
  if (entry.source !== "generated") {
    logger.info("Shared recipe photo cache skipped non-generated provider image", {
      signature: entry.signature,
      source: entry.source
    });
    return entry;
  }

  let persistedImageUrl = entry.imageUrl;
  try {
    persistedImageUrl = await persistSharedRecipeImageUrl(entry);
  } catch (error) {
    logger.warn("Shared recipe photo image persistence failed; caching original URL instead.", {
      signature: entry.signature,
      source: entry.source,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }

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

async function persistSharedRecipeImageUrl(entry: SharedRecipePhotoEntry) {
  if (/^data:/i.test(entry.imageUrl)) {
    const parsed = parseDataUrl(entry.imageUrl);
    return uploadSharedRecipeImage(entry.signature, parsed.buffer, parsed.mimeType);
  }

  if (entry.source === "generated" && /^https?:\/\//i.test(entry.imageUrl)) {
    const parsed = await fetchRemoteImage(entry.imageUrl);
    return uploadSharedRecipeImage(entry.signature, parsed.buffer, parsed.mimeType);
  }

  return entry.imageUrl;
}

async function uploadSharedRecipeImage(signature: string, buffer: Buffer, mimeType: string) {
  const bucket = getAdminStorageBucket();
  const extension = getImageExtension(mimeType);
  const objectPath = `recipe-photo-cache/${signature}.${extension}`;
  const downloadToken = randomUUID();
  const file = bucket.file(objectPath);

  await file.save(buffer, {
    contentType: mimeType,
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

async function fetchRemoteImage(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Generated image download failed with status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Generated image download returned ${contentType}.`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: contentType
  };
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
