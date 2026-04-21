# NutriMoment - Offline-First Recipe Engine Spec
**Version:** 1.0
**Date:** 2026-04-18
**Status:** Partially implemented in the current Next.js/Firebase codebase

## Purpose
This document translates the offline-first recipe engine proposal into a concrete implementation plan for the current NutriMoment app in `apps/nutrimoment`.

The goal is to move NutriMoment from:

```text
scan -> AI generation -> recipes
```

to:

```text
scan -> ingredient extraction -> normalization -> retrieval -> ranking -> recipes
```

with AI used only for:
- image ingredient extraction
- low-confidence fallback
- transformations like "make it keto" or "give me more creative ideas"

## Current Baseline
The current implementation already provides:
- authenticated users via Firebase Auth
- Firestore-backed pantry, history, and health/settings state
- scanner UI flow in `src/components/dashboard/tabs/ScannerTab.tsx`
- route handlers for:
  - `POST /api/scan`
  - `POST /api/generate-recipes`
  - `POST /api/mealplan`

The current recipe and meal-plan flows have moved to an offline-first MVP:
- `/api/scan` and `/api/scan/process` extract ingredient or pantry item names from images
- `/api/generate-recipes` retrieves and ranks recipes from the offline catalog first
- `/api/mealplan` composes a 7-day meal plan from catalog recipes first
- Gemini remains available for extraction and fallback behavior

This means the current app now has the right runtime direction for lower-cost scale, although the catalog and index still need much more depth before production.

## Target Runtime Architecture
The recommended runtime architecture for this repo is:

```text
Client
  -> /api/scan/process
     -> Firebase Auth verification
     -> Storage upload lookup
     -> Ingredient extraction service
     -> Ingredient normalization service
     -> Recipe retrieval service
     -> Ranking service
     -> Firestore-backed catalog/index reads
     -> optional AI fallback
```

### Primary Path
- User uploads a fridge or pantry image
- Backend extracts likely ingredient names
- Backend normalizes them to canonical ingredients
- Backend retrieves candidate recipes from an offline catalog
- Backend ranks the candidates using user profile and pantry constraints
- Backend returns the best 3 to 5 recipes
- For meal planning, backend composes breakfast, lunch, and dinner slots for 7 days
- Shopping list quantities are summed from selected recipe ingredients and pantry quantities are subtracted when names and units match

### Fallback Path
Fallback AI should run only when:
- extraction confidence is low
- no recipe passes the minimum score threshold
- the user asks for a transformation or creative variation
- strict preferences leave no usable catalog plan

## Current-to-Target Mapping
### What can stay
- Firebase Auth
- Firestore as the main application database
- Firebase Storage for uploaded scan images and recipe images
- current scanner tab UI
- current pantry and history hooks
- current user settings and health profile model as the first ranking inputs

### Implemented in the Current MVP
- local offline recipe catalog in `src/data/offline/recipes.ts`
- local ingredient recipe index in `src/data/offline/ingredientIndex.ts`
- ingredient normalization service
- recipe retrieval service
- ranking service
- catalog-backed `/api/generate-recipes`
- catalog-backed `/api/mealplan`
- pantry scan extraction with editable quantities
- persisted current weekly meal plan at `users/{uid}/plans/currentWeekly`
- quantity-aware shopping list subtraction via `src/lib/pantryQuantity.ts`
- public web recipe photo hydration via `/api/recipe-photo`

### Still To Improve
- grow the catalog from seed-size to thousands of recipes
- add stronger ingredient aliases and unit conversion
- verify route authentication and rate limiting
- add test coverage for ranking and shopping-list math

## Recommended Firestore Schema
### Existing collections to keep
```text
users/{uid}
users/{uid}/pantry/{itemId}
users/{uid}/history/{historyId}
users/{uid}/profile/settings
users/{uid}/profile/health
users/{uid}/plans/currentWeekly
```

### New collections to add
```text
recipes/{recipeId}
ingredients/{ingredientId}
ingredientAliases/{aliasId}
ingredientRecipeIndex/{canonicalIngredient}
scans/{scanId}
users/{uid}/favorites/{favoriteId}
users/{uid}/mealPlans/{mealPlanId}
```

### `recipes/{recipeId}`
This becomes the source of truth for recipes returned to users.

```ts
export interface RecipeCatalogDoc {
  id: string;
  title: string;
  slug: string;
  description: string;
  ingredients: Array<{
    name: string;
    canonical: string;
    quantity?: number;
    unit?: string;
    required: boolean;
  }>;
  ingredientCanonicals: string[];
  requiredCanonicals: string[];
  optionalCanonicals: string[];
  dietTags: string[];
  allergenTags: string[];
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  cuisine: string;
  prepMinutes: number;
  cookMinutes: number;
  totalMinutes: number;
  difficulty: "easy" | "medium" | "hard";
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  calorieBand: "0_300" | "301_500" | "501_700" | "701_plus";
  servings: number;
  steps: string[];
  image: {
    storagePath: string;
    thumbPath?: string;
  };
  searchTokens: string[];
  popularityScore: number;
  qualityScore: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### `users/{uid}/plans/currentWeekly`
This stores the most recent generated weekly plan until the user generates a new one.

```ts
export interface CurrentWeeklyPlanDoc {
  mealPlan: {
    plan: Array<{
      day: string;
      breakfast: MealPlanMeal;
      lunch: MealPlanMeal;
      dinner: MealPlanMeal;
    }>;
    shoppingList: string[];
    servedFrom?: "offline_catalog" | "fallback_ai" | "mock";
  };
  updatedAt: Timestamp;
}
```

Shopping list entries are currently stored as display strings:

```text
rice - 4 cup
tomato - 8 whole
chicken breast - 2 lb
```

Future versions should store structured shopping-list objects so the UI can support checked items, grouping, and stronger unit conversion.

### `ingredients/{ingredientId}`
This stores canonical ingredient metadata.

```ts
export interface IngredientDoc {
  id: string;
  name: string;
  category: string;
  broadCategory: string;
  dietCompatibility: string[];
  commonSubstitutes: string[];
  isActive: boolean;
}
```

### `ingredientAliases/{aliasId}`
This supports normalization from raw extraction output into canonical names.

```ts
export interface IngredientAliasDoc {
  id: string;
  raw: string;
  canonical: string;
  category?: string;
  synonyms: string[];
  misspellings: string[];
  isActive: boolean;
}
```

### `ingredientRecipeIndex/{canonicalIngredient}`
This is the retrieval accelerator for catalog lookup.

For MVP:

```ts
export interface IngredientRecipeIndexDoc {
  ingredient: string;
  recipeIds: string[];
  updatedAt: number;
}
```

Important note:
- this shape is acceptable only for MVP or moderate postings lists
- if recipe counts per ingredient get large, the index should be sharded into buckets

### `scans/{scanId}`
This stores the scan pipeline output and powers analytics, quality review, and future history enrichment.

```ts
export interface ScanDoc {
  id: string;
  uid: string;
  imagePath: string;
  scanType: "fridge" | "pantry" | "dish";
  ingredientsRaw: string[];
  ingredientsNormalized: string[];
  candidateRecipeIds: string[];
  selectedRecipeIds: string[];
  servedFrom: "offline_catalog" | "fallback_ai" | "mock";
  fallbackUsed: boolean;
  filters: {
    dietTags: string[];
    maxCalories?: number;
    mealType?: string;
    cuisine?: string;
  };
  createdAt: number;
}
```

## Recommended TypeScript Domain Model Changes
The current `src/lib/types.ts` is UI-oriented. It should evolve into two layers:

### 1. Domain types
New file recommended:

```text
src/lib/domain.ts
```

This file should contain:
- `RecipeCatalogDoc`
- `IngredientDoc`
- `IngredientAliasDoc`
- `IngredientRecipeIndexDoc`
- `ScanDoc`
- `RankedRecipeResult`

### 2. UI-facing types
Keep `src/lib/types.ts` for UI usage, but update `Recipe` to reflect ranked offline results:

```ts
export interface Recipe {
  id?: string;
  name: string;
  cuisine: string;
  ingredients: string[];
  missing_ingredients: string[];
  steps: string[];
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
  fiber?: string;
  sugar?: string;
  sodium?: string;
  cook_time: string;
  difficulty: string;
  image_url?: string;
  image_loading?: boolean;
  image_error?: boolean;
  match_quality?: "great" | "good" | "possible" | "stretch";
  matched_required_count?: number;
  matched_optional_count?: number;
}
```

## Service Layer Plan
The current route handlers contain most of the business logic inline. That should be replaced with explicit services.

Recommended structure:

```text
src/services/
  authService.ts
  ingredientExtractionService.ts
  ingredientNormalizationService.ts
  recipeRetrievalService.ts
  rankingService.ts
  mealPlanService.ts
  fallbackAiService.ts
  scanService.ts

src/repositories/
  recipeRepo.ts
  ingredientRepo.ts
  aliasRepo.ts
  indexRepo.ts
  scanRepo.ts
  userProfileRepo.ts
```

### `ingredientExtractionService.ts`
Responsibilities:
- accept image input
- call the current vision provider
- return raw ingredient guesses

Important:
- keep provider-specific code hidden here
- do not let route handlers build extraction prompts directly

### `ingredientNormalizationService.ts`
Responsibilities:
- lowercase and trim raw names
- map synonyms and misspellings to canonical ingredients
- drop duplicates
- optionally assign categories

Example contract:

```ts
export interface IngredientNormalizationResult {
  raw: string[];
  normalized: string[];
  unmapped: string[];
}
```

### `recipeRetrievalService.ts`
Responsibilities:
- read candidate `recipeIds` from `ingredientRecipeIndex`
- build a candidate pool from union/intersection
- fetch recipe docs from `recipes`

### `rankingService.ts`
Responsibilities:
- score candidates using pantry, profile, and filters
- assign `match_quality`
- reject allergen/diet violations
- return top ranked recipes

### `mealPlanService.ts`
Responsibilities:
- create a weekly plan from ranked catalog recipes
- assemble shopping list from selected recipes and pantry items
- store meal plans under `users/{uid}/mealPlans`

### `fallbackAiService.ts`
Responsibilities:
- generate fallback recipes only when retrieval fails
- transform existing catalog recipes when user requests creative changes

## Ranking Formula v1
The current app has no ranking engine. The first production-safe version should be deterministic and easy to tune.

Recommended v1:

```text
score =
+ 8 * matchedRequiredCount
+ 3 * matchedOptionalCount
- 7 * missingRequiredCount
- 2 * missingOptionalCount
+ 5 * dietMatch
+ 3 * calorieMatch
+ 2 * cuisineMatch
+ 2 * mealTypeMatch
+ 1 * popularityBoost
+ 1 * qualityBoost
- 100 * allergenViolation
```

### Required runtime inputs
- normalized ingredients from scan
- pantry ingredients
- user diets
- user conditions
- preferred cuisine
- calorie target
- meal type if present

### Match quality labels
- `great`: all required ingredients matched and most optional ingredients matched
- `good`: all required ingredients matched, few optional missing
- `possible`: one required ingredient missing
- `stretch`: more than one required ingredient missing

## API Migration Plan
### Keep the current UI endpoints initially
Do not change the scanner tab UI first.

Keep:
- `POST /api/scan`
- `POST /api/generate-recipes`
- `POST /api/mealplan`

but change what they do internally.

### Stage 1: `/api/scan`
Current behavior:
- extract ingredient names from image

Recommended next behavior:
- extract ingredient names
- normalize ingredient names
- create a `scans/{scanId}` record
- return normalized ingredients and scan ID

Target response shape:

```ts
{
  scanId: string;
  ingredientsRaw: string[];
  ingredientsNormalized: string[];
}
```

### Stage 2: `/api/generate-recipes`
Current behavior:
- send ingredients to Gemini and receive fresh recipes

Recommended next behavior:
- accept normalized ingredient list and user filters
- fetch candidate recipe docs from index
- rank recipes
- return top 3 to 5 ranked catalog recipes

This route should eventually be renamed to reflect retrieval rather than generation:

```text
POST /api/recipes/search
```

but the current endpoint can be retained as a compatibility wrapper during migration.

### Stage 3: `/api/mealplan`
Current behavior:
- generate weekly meal plan fully from AI

Recommended next behavior:
- build meal plans from ranked catalog recipes plus pantry gaps
- persist result
- optionally use fallback AI only when a day slot has no valid candidate

## Firestore Query Strategy
### MVP strategy
Use:
- ingredient index lookup
- Firestore document fetch
- Node-side ranking

This avoids introducing an external search engine too early.

### Candidate retrieval pattern
1. normalize ingredients
2. fetch index docs for each ingredient
3. union and count recipe ID hits
4. fetch candidate recipe docs
5. rank in Node

### Why this fits the current stack
- Firestore is already integrated
- Vercel Node functions can handle scoring logic
- no external search dependency is required initially

## Migration Slices
### Slice 1 - Schema and domain layer
Deliverables:
- add `src/lib/domain.ts`
- define Firestore document types
- define ranking result type
- add repositories for recipes, ingredients, aliases, and index

Outcome:
- no visible product change yet

### Slice 2 - Normalization
Deliverables:
- implement `ingredientNormalizationService`
- seed `ingredients` and `ingredientAliases`
- update `/api/scan` to return normalized ingredients

Outcome:
- scan output becomes more consistent

### Slice 3 - Retrieval MVP
Deliverables:
- add `recipes` catalog
- add `ingredientRecipeIndex`
- implement `recipeRetrievalService`
- implement `rankingService`
- switch `/api/generate-recipes` from AI generation to catalog retrieval

Outcome:
- biggest runtime-cost reduction lands here

### Slice 4 - Meal-plan migration
Deliverables:
- implement `mealPlanService`
- generate plans from recipe catalog
- persist plans

Outcome:
- meal planning becomes cheaper and more predictable

### Slice 5 - AI fallback
Deliverables:
- add quality thresholding
- add fallback AI for weak results
- add clear response metadata like `servedFrom` and `fallbackUsed`

Outcome:
- AI becomes augmentation rather than default runtime behavior

### Slice 6 - Favorites and library
Deliverables:
- add `users/{uid}/favorites`
- add recipe detail route
- add saved recipe UI

Outcome:
- catalog-first product becomes visible to users over time

## Recommended Response Contracts
### Ranked recipe result
```ts
export interface RankedRecipeResult {
  recipeId: string;
  score: number;
  matchQuality: "great" | "good" | "possible" | "stretch";
  matchedRequiredCount: number;
  matchedOptionalCount: number;
  missingRequired: string[];
  missingOptional: string[];
  servedFrom: "offline_catalog" | "fallback_ai";
}
```

### Recipe search response
```ts
export interface RecipeSearchResponse {
  scanId?: string;
  ingredientsNormalized: string[];
  recipes: Recipe[];
  servedFrom: "offline_catalog" | "fallback_ai" | "mock";
  canLoadMore: boolean;
}
```

## Constraints and Risks
### Firestore document size
Large `recipeIds` arrays in `ingredientRecipeIndex` may outgrow a single document.

Mitigation:
- start with MVP-sized data
- shard high-volume ingredients later

### Catalog quality risk
An offline engine is only as good as the catalog and normalization quality.

Mitigation:
- start with 5k to 10k high-quality recipes
- require structured ingredients and nutrition
- enforce catalog QA before publish

### Current route duplication
The app currently has overlapping APIs:
- `scan` and `analyze-image`
- `recipes` and `generate-recipes`

Mitigation:
- consolidate route responsibilities during Slice 3

### Security gap
Current AI and retrieval routes do not yet verify Firebase ID tokens.

Mitigation:
- make auth verification part of Slice 1 or earlier

## Final Recommendation
For this repo, the best next-state architecture is:

```text
image
-> ingredient extraction
-> ingredient normalization
-> ingredient index lookup
-> candidate recipe retrieval
-> ranking engine
-> return top matches
-> fallback AI only when retrieval quality is weak
```

This should be treated as a controlled migration from the current AI-first app, not a full rewrite.

The highest-value next implementation step is:
- define the domain types
- create the Firestore collections and repositories
- implement normalization and retrieval
- switch `/api/generate-recipes` to catalog-first behavior
