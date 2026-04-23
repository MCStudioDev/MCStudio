import { z } from "zod";
import { findFreeRecipePhoto } from "@/lib/freeRecipePhotos";
import { generateRecipeImageWithImagen, isImagenConfigured } from "@/lib/googleImagen";

export const runtime = "nodejs";
export const maxDuration = 60;

const querySchema = z.object({
  query: z.string().min(3)
});

type CachedRecipePhoto = {
  imageUrl: string;
  source: "wikimedia" | "generated";
  model?: string;
};

const recipePhotoCache = new Map<string, CachedRecipePhoto>();
const MAX_RECIPE_PHOTO_CACHE_ITEMS = 80;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    query: searchParams.get("query")
  });

  if (!parsed.success) {
    return Response.json({ error: "A recipe photo query is required." }, { status: 400 });
  }

  const query = parsed.data.query.trim();
  const cacheKey = getRecipePhotoCacheKey(query);
  const cached = recipePhotoCache.get(cacheKey);
  if (cached) {
    console.info("Recipe photo served", {
      source: cached.source,
      query,
      cached: true,
      model: cached.model
    });

    return Response.json(cached);
  }

  try {
    const result = await findFreeRecipePhoto(query);
    if (result) {
      setRecipePhotoCache(cacheKey, result);
      console.info("Recipe photo served", {
        source: result.source,
        query,
        imageUrl: result.imageUrl
      });

      return Response.json(result);
    }

    const generated = await generateRecipeImageWithImagen(query);
    if (generated) {
      setRecipePhotoCache(cacheKey, generated);
      console.info("Recipe photo served", {
        source: generated.source,
        query,
        model: generated.model
      });

      return Response.json(generated);
    }

    console.info("Recipe photo served", {
      source: "unavailable",
      query,
      imagenConfigured: isImagenConfigured()
    });

    return Response.json(
      {
        error: isImagenConfigured()
          ? "No strict matching recipe photo or generated image was available."
          : "No strict matching recipe photo was found, and Imagen fallback is not configured.",
        imageUrl: "",
        source: "unavailable"
      },
      { status: 404 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to look up a recipe photo.";
    console.error("Recipe photo generation failed", {
      query,
      message
    });

    return Response.json({ error: message }, { status: 500 });
  }
}

function getRecipePhotoCacheKey(query: string) {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

function setRecipePhotoCache(key: string, value: CachedRecipePhoto) {
  if (recipePhotoCache.size >= MAX_RECIPE_PHOTO_CACHE_ITEMS) {
    const oldestKey = recipePhotoCache.keys().next().value;
    if (oldestKey) recipePhotoCache.delete(oldestKey);
  }

  recipePhotoCache.set(key, value);
}
