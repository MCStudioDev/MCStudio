import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

const querySchema = z.object({
  query: z.string().min(3)
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    query: searchParams.get("query")
  });

  if (!parsed.success) {
    return Response.json({ error: "A recipe photo query is required." }, { status: 400 });
  }

  const query = parsed.data.query.trim();

  try {
    const wikimediaImage = await searchWikimediaCommons(query);
    if (wikimediaImage) {
      return Response.json({ imageUrl: wikimediaImage, source: "wikimedia" });
    }

    return Response.json({
      imageUrl: buildLoremFlickrUrl(query),
      source: "loremflickr"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to look up a recipe photo.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function searchWikimediaCommons(query: string) {
  const url = `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(
    query
  )}&title=Special:MediaSearch&go=Go&type=image`;

  const response = await fetch(url, {
    headers: {
      "user-agent": "NutriMoment/1.0 (+https://localhost:3000)"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const matches = html.match(/https?:\/\/upload\.wikimedia\.org\/[^"'<> ]+?\.(?:jpg|jpeg|png|webp)(?:[^"'<> ]*)/gi) ?? [];

  for (const match of matches) {
    const clean = match.replace(/&amp;/g, "&");
    if (clean.includes("/thumb/") || clean.includes("/wikipedia/commons/")) {
      return clean;
    }
  }

  return null;
}

function buildLoremFlickrUrl(query: string) {
  const keywords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, " ")
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 4);

  const path = keywords.length ? keywords.join(",") : "food,recipe";
  const lock = hashQuery(query);
  return `https://loremflickr.com/800/600/${path}?lock=${lock}`;
}

function hashQuery(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
