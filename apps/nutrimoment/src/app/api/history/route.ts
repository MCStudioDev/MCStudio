import { getAdminDb } from "@/lib/firebaseAdmin";
import type { HistoryItem, Recipe } from "@/lib/types";
import { accessErrorResponse, getRequestAccess } from "@/services/authService";

export const runtime = "nodejs";

const MAX_HISTORY_ITEMS = 50;

type TimestampLike = {
  seconds?: number;
  toDate?: () => Date;
  toMillis?: () => number;
};

type HistoryDocData = {
  completedAt?: string;
  createdAt?: TimestampLike | null;
  generationMessage?: string;
  generationStatus?: HistoryItem["generationStatus"];
  ingredients?: string[];
  recipes?: Recipe[];
  sessionType?: HistoryItem["sessionType"];
  timestamp?: string;
  title?: string;
};

function stripUndefined<T extends object>(value: T): T {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item !== undefined) next[key] = item;
  }
  return next as T;
}

function getTimestampMillis(value?: TimestampLike | null) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function getSortTime(item: Pick<HistoryItem, "completedAt" | "timestamp"> & { createdAt?: TimestampLike | null }) {
  return (
    getTimestampMillis(item.createdAt) ||
    Date.parse(item.completedAt ?? "") ||
    Date.parse(item.timestamp ?? "") ||
    0
  );
}

function mapHistoryDoc(id: string, data: HistoryDocData): HistoryItem & { createdAt?: TimestampLike | null } {
  return {
    id,
    timestamp: data.timestamp ?? new Date().toISOString(),
    title: data.title,
    sessionType: data.sessionType,
    ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
    recipes: Array.isArray(data.recipes) ? data.recipes : [],
    generationStatus: data.generationStatus,
    generationMessage: data.generationMessage,
    completedAt: data.completedAt,
    createdAt: data.createdAt
  };
}

export async function GET(request: Request) {
  try {
    const access = await getRequestAccess(request);
    const snapshot = await getAdminDb()
      .collection("users")
      .doc(access.uid)
      .collection("history")
      .get();

    const items = snapshot.docs
      .map((doc) => mapHistoryDoc(doc.id, doc.data() as HistoryDocData))
      .sort((left, right) => getSortTime(right) - getSortTime(left))
      .slice(0, MAX_HISTORY_ITEMS)
      .map((item) =>
        stripUndefined<HistoryItem>({
          id: item.id,
          timestamp: item.timestamp,
          title: item.title,
          sessionType: item.sessionType,
          ingredients: item.ingredients,
          recipes: item.recipes,
          generationStatus: item.generationStatus,
          generationMessage: item.generationMessage,
          completedAt: item.completedAt
        })
      );

    return Response.json({ items });
  } catch (error) {
    return accessErrorResponse(error);
  }
}
