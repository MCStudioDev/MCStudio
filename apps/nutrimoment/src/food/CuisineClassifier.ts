import {
  classifyRecipeCuisine,
  type RecipeCuisineClassification,
  type RecipeCuisineClassifierInput
} from "@/lib/recipeReferenceTaxonomy";

/**
 * Import-time classifier for source recipes that do not include trustworthy
 * cuisine metadata. Results are deterministic and safe to persist with the
 * recipe; low-confidence records are explicitly marked for optional review.
 */
export class CuisineClassifier {
  classify(input: RecipeCuisineClassifierInput): RecipeCuisineClassification {
    return classifyRecipeCuisine(input);
  }

  shouldEscalate(classification: RecipeCuisineClassification, minimumConfidence = 75) {
    return classification.needsReview || classification.confidence < minimumConfidence;
  }
}

export type { RecipeCuisineClassification, RecipeCuisineClassifierInput };
