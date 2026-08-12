import type { Recipe } from "@/lib/types";
import { normalizeIngredients } from "@/services/ingredientNormalizationService";
import { LanguageService } from "./languageService";
import { RecipeRankingService } from "./recipeRankingService";
import { RecipeValidator } from "./recipeValidator";
import { ShoppingListBuilder, type ShoppingListSections } from "./shoppingListBuilder";
import type { RecipeLanguage } from "@/services/ingredientDictionaryService";

export interface RecipeSource {
  id: "internal" | "google_grounded" | "trusted_web" | "recipe_api";
  search(input: SourceSearchInput): Promise<Recipe[]>;
}

export interface SourceSearchInput {
  ingredients: string[];
  language: RecipeLanguage;
  preferredCuisine?: string;
}

export interface SourceFirstRecipePipelineResult {
  language: RecipeLanguage;
  normalizedIngredients: string[];
  recipes: Array<{ recipe: Recipe; shoppingList: ShoppingListSections }>;
  sourceIds: string[];
}

/**
 * Deterministic orchestration for recipe discovery. Sources are injected so
 * the HTTP route can choose internal Firestore, Google grounding, trusted web,
 * and recipe APIs without putting provider logic in the ranking layer.
 */
export class SourceFirstRecipePipeline {
  constructor(
    private readonly dependencies: {
      language: LanguageService;
      ranking: RecipeRankingService;
      shopping: ShoppingListBuilder;
      sources: RecipeSource[];
      validator: RecipeValidator;
    }
  ) {}

  async discover(input: { ingredients: string[]; preferredCuisine?: string; requestedLanguage?: string; limit?: number }) {
    const language = this.dependencies.language.detect({
      ingredients: input.ingredients,
      requestedLanguage: input.requestedLanguage
    });
    const normalized = await normalizeIngredients(input.ingredients);
    const limit = Math.max(1, Math.min(input.limit ?? 5, 5));
    const sourceInput: SourceSearchInput = {
      ingredients: normalized.normalized,
      language,
      preferredCuisine: input.preferredCuisine
    };

    const sourceIds: string[] = [];
    const candidates: Recipe[] = [];
    for (const source of this.dependencies.sources) {
      const recipes = await source.search(sourceInput);
      if (!recipes.length) continue;
      sourceIds.push(source.id);
      candidates.push(...recipes);
      // A complete, validated internal source result wins over external calls.
      const validInternal = candidates.filter((recipe) => this.dependencies.validator.validate(recipe).valid);
      if (source.id === "internal" && validInternal.length >= limit) break;
    }

    const valid = candidates.filter((recipe) => this.dependencies.validator.validate(recipe).valid);
    const ranked = this.dependencies.ranking.rank(valid, {
      ingredients: normalized.normalized,
      preferredCuisine: input.preferredCuisine,
      limit
    });
    const recipes = this.dependencies.ranking.selectDiverse(ranked, limit).map((recipe) => ({
      recipe,
      shoppingList: this.dependencies.shopping.build({
        available: normalized.normalized,
        recipeIngredients: [...recipe.ingredients, ...recipe.missing_ingredients],
        language
      })
    }));

    return {
      language,
      normalizedIngredients: normalized.normalized,
      recipes,
      sourceIds
    } satisfies SourceFirstRecipePipelineResult;
  }
}
