"use client";

const PENDING_RECIPE_HISTORY_STORAGE_KEY = "nutrimoment.pendingRecipeHistoryIds";
const NOTIFIED_RECIPE_HISTORY_STORAGE_KEY = "nutrimoment.notifiedRecipeHistoryIds";
const MAX_STORED_RECIPE_JOB_IDS = 80;

function readStringArray(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeStringArray(key: string, value: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value.slice(-MAX_STORED_RECIPE_JOB_IDS)));
}

export function readPendingRecipeHistoryIds() {
  return readStringArray(PENDING_RECIPE_HISTORY_STORAGE_KEY);
}

export function rememberPendingRecipeHistoryId(entryId: string) {
  const next = Array.from(new Set([...readPendingRecipeHistoryIds(), entryId]));
  writeStringArray(PENDING_RECIPE_HISTORY_STORAGE_KEY, next);
}

export function forgetPendingRecipeHistoryId(entryId: string) {
  const next = readPendingRecipeHistoryIds().filter((item) => item !== entryId);
  writeStringArray(PENDING_RECIPE_HISTORY_STORAGE_KEY, next);
}

export function hasNotifiedRecipeHistoryId(entryId: string) {
  return readStringArray(NOTIFIED_RECIPE_HISTORY_STORAGE_KEY).includes(entryId);
}

export function markNotifiedRecipeHistoryId(entryId: string) {
  const next = Array.from(new Set([...readStringArray(NOTIFIED_RECIPE_HISTORY_STORAGE_KEY), entryId]));
  writeStringArray(NOTIFIED_RECIPE_HISTORY_STORAGE_KEY, next);
}

export function isLikelyBackgroundFetchInterruption(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /load failed|failed to fetch|networkerror|network request failed|aborted|cancelled|canceled|offline/i.test(message);
}
