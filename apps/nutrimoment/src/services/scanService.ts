import { saveScan } from "@/repositories/scanRepo";
import type { ScanDoc, ScanFilters, ServedFrom } from "@/lib/domain";
import { extractIngredientsFromImage } from "@/services/ingredientExtractionService";
import { normalizeIngredients } from "@/services/ingredientNormalizationService";

export interface ProcessScanInput {
  uid?: string | null;
  image: string;
  imagePath?: string;
  language?: string;
  isPantry?: boolean;
  filters?: ScanFilters;
}

export interface ProcessScanResult {
  scanId: string;
  ingredientsRaw: string[];
  ingredientsNormalized: string[];
  servedFrom: ServedFrom;
}

export async function processScan({
  uid = null,
  image,
  imagePath = "",
  language = "English",
  isPantry = false,
  filters = { dietTags: [] }
}: ProcessScanInput): Promise<ProcessScanResult> {
  const ingredientsRaw = await extractIngredientsFromImage({ image, language, isPantry });
  const normalized = await normalizeIngredients(ingredientsRaw);
  const scanId = crypto.randomUUID();
  const servedFrom: ServedFrom = "offline_catalog";

  const scanDoc: ScanDoc = {
    id: scanId,
    uid,
    imagePath,
    scanType: isPantry ? "pantry" : "fridge",
    ingredientsRaw,
    ingredientsNormalized: normalized.normalized,
    candidateRecipeIds: [],
    selectedRecipeIds: [],
    servedFrom,
    fallbackUsed: false,
    filters,
    createdAt: Date.now()
  };

  await saveScan(scanDoc);

  return {
    scanId,
    ingredientsRaw,
    ingredientsNormalized: normalized.normalized,
    servedFrom
  };
}
