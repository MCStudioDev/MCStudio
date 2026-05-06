import { z } from "zod";
import { GET as lookupRecipePhoto } from "../route";

export const runtime = "nodejs";
export const maxDuration = 60;

const batchItemSchema = z.object({
  alt: z.array(z.string()).optional(),
  cuisine: z.string().optional(),
  exact: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  ingredient: z.array(z.string()).optional(),
  query: z.string().min(3),
  queryKey: z.string().min(1).max(500)
});

const batchSchema = z.object({
  items: z.array(batchItemSchema).min(1).max(30)
});

type BatchItem = z.infer<typeof batchItemSchema>;

type BatchRecipePhotoResult = {
  error?: string;
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
  imageUrl?: string;
  ok: boolean;
  retryAfterSeconds?: number;
  source?: "generated" | "google_search" | "pexels_search" | "unsplash_search" | "wikimedia" | "unavailable";
  status: number;
};

export async function POST(request: Request) {
  const parsed = batchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Recipe photo batch items are required." },
      { headers: buildBatchHeaders("failure"), status: 400 }
    );
  }

  const origin = new URL(request.url).origin;
  const uniqueItems = dedupeBatchItems(parsed.data.items);
  const headers = new Headers(request.headers);

  const settled = await Promise.allSettled(
    uniqueItems.map(async (item) => {
      const response = await lookupRecipePhoto(new Request(buildRecipePhotoLookupUrl(origin, item), { headers }));
      const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? "0") || undefined;
      const data = (await response.json().catch(() => null)) as Partial<BatchRecipePhotoResult> | null;

      return [
        item.queryKey,
        {
          error: data?.error,
          imageAttributionName: data?.imageAttributionName,
          imageAttributionUrl: data?.imageAttributionUrl,
          imageSource: data?.imageSource,
          imageUrl: data?.imageUrl,
          ok: response.ok && Boolean(data?.imageUrl),
          retryAfterSeconds,
          source: data?.source,
          status: response.status
        } satisfies BatchRecipePhotoResult
      ] as const;
    })
  );

  const results: Record<string, BatchRecipePhotoResult> = {};
  for (const result of settled) {
    if (result.status === "fulfilled") {
      const [queryKey, value] = result.value;
      results[queryKey] = value;
    }
  }

  for (const item of uniqueItems) {
    if (results[item.queryKey]) continue;
    results[item.queryKey] = {
      error: "Recipe photo lookup failed.",
      ok: false,
      source: "unavailable",
      status: 500
    };
  }

  return Response.json(
    { results },
    { headers: buildBatchHeaders(Object.values(results).some((value) => value.ok) ? "success" : "failure") }
  );
}

function dedupeBatchItems(items: BatchItem[]) {
  const seen = new Set<string>();
  const uniqueItems: BatchItem[] = [];

  for (const item of items) {
    if (seen.has(item.queryKey)) continue;
    seen.add(item.queryKey);
    uniqueItems.push(item);
  }

  return uniqueItems;
}

function buildRecipePhotoLookupUrl(origin: string, item: BatchItem) {
  const params = new URLSearchParams();
  params.set("query", item.query);
  appendValues(params, "alt", item.alt, 4);
  appendValues(params, "ingredient", item.ingredient, 10);
  appendValues(params, "exact", item.exact, 8);
  appendValues(params, "exclude", item.exclude, 8);
  if (item.cuisine?.trim()) {
    params.set("cuisine", item.cuisine.trim());
  }

  return `${origin}/api/recipe-photo?${params.toString()}`;
}

function appendValues(params: URLSearchParams, key: string, values: string[] | undefined, limit: number) {
  values
    ?.map((value) => value.trim())
    .filter(Boolean)
    .slice(0, limit)
    .forEach((value) => params.append(key, value));
}

function buildBatchHeaders(result: "success" | "failure") {
  return {
    "Cache-Control": result === "success"
      ? "private, max-age=300, stale-while-revalidate=86400"
      : "private, max-age=60"
  };
}
