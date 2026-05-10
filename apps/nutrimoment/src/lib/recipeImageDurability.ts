export function isHttpImageUrl(imageUrl?: string | null): imageUrl is string {
  return Boolean(imageUrl && /^https?:\/\//i.test(imageUrl));
}

export function isTransientRecipeImageUrl(imageUrl?: string | null) {
  if (!isHttpImageUrl(imageUrl)) return false;
  try {
    const url = new URL(imageUrl);
    return url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery");
  } catch {
    return /(^https?:\/\/)?([^/]+\.)?replicate\.delivery\//i.test(imageUrl);
  }
}

export function isDurableRecipeImageUrl(imageUrl?: string | null): imageUrl is string {
  return isHttpImageUrl(imageUrl) && !isTransientRecipeImageUrl(imageUrl);
}

export function isReplicateGeneratedRecipeImageUrl(imageUrl?: string | null): imageUrl is string {
  if (!isDurableRecipeImageUrl(imageUrl)) return false;

  try {
    const url = new URL(imageUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    return decodedPath.includes("/recipe-photo-cache/generated:");
  } catch {
    return /recipe-photo-cache(?:%2f|\/)generated%3a/i.test(imageUrl);
  }
}
