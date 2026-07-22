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
  constructor(private readonly minimumConfidence = 75) {}

  classify(input: RecipeCuisineClassifierInput): RecipeCuisineClassification {
    return classifyRecipeCuisine(input);
  }

  predict(input: RecipeCuisineClassifierInput): RecipeCuisineClassification {
    return this.classify(input);
  }

  shouldEscalate(classification: RecipeCuisineClassification, minimumConfidence = this.minimumConfidence) {
    return classification.needsReview || classification.confidence < minimumConfidence;
  }

  shouldUseGenerativeInference(classification: RecipeCuisineClassification) {
    return this.shouldEscalate(classification, this.minimumConfidence);
  }
}

export type { RecipeCuisineClassification, RecipeCuisineClassifierInput };
