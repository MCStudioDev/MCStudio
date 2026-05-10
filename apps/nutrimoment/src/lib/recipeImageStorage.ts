"use client";

import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { storage } from "@/config/firebase";
import { isTransientRecipeImageUrl } from "@/lib/recipeImageDurability";

export async function persistRecipeImageForUser(options: {
  uid: string;
  imageUrl: string;
  query: string;
}) {
  const { uid, imageUrl, query } = options;

  if (!imageUrl) return "";
  if (isTransientRecipeImageUrl(imageUrl)) return "";
  if (/^https?:/i.test(imageUrl)) return imageUrl;
  if (!/^data:/i.test(imageUrl)) return imageUrl;

  const extension = getImageExtension(imageUrl);
  const storageRef = ref(storage, `users/${uid}/recipe-images/${hashQuery(query)}.${extension}`);

  await uploadString(storageRef, imageUrl, "data_url");
  return getDownloadURL(storageRef);
}

function getImageExtension(imageUrl: string) {
  const match = imageUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
  const mimeSubtype = match?.[1]?.toLowerCase() ?? "jpeg";

  switch (mimeSubtype) {
    case "png":
      return "png";
    case "webp":
      return "webp";
    case "gif":
      return "gif";
    default:
      return "jpg";
  }
}

function hashQuery(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}
