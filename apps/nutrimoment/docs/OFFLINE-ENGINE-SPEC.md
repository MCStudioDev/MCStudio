# NutriMoment - Offline-First Recipe Engine Spec
**Version:** 1.1  
**Date:** 2026-04-24  
**Status:** Partially implemented and actively used by the current app

## Purpose
This document describes the actual offline-first engine direction now used by NutriMoment.

The app has already moved away from:

```text
scan -> AI generation -> recipes
```

toward:

```text
scan -> extraction -> normalization -> retrieval -> ranking -> recipes
```

with AI used as fallback or augmentation rather than the default runtime path.

## Current Runtime Path

### Ingredient Scan Path
```text
image upload
-> /api/scan
-> Firebase token verification
-> ingredient extraction
-> ingredient normalization
-> save scan record
-> return normalized ingredients
```

### Recipe Suggestion Path
```text
ingredients
-> /api/generate-recipes
-> Firebase token verification
-> search catalog recipes
-> strict ingredient ownership
-> rank candidates
-> return top 5 recipes
-> fallback Gemini text only if needed
```

### Weekly Meal Plan Path
```text
pantry + settings
-> /api/mealplan
-> Firebase token verification
-> premium check
-> search catalog recipes
-> build weekly plan
-> reconcile shopping list with pantry
-> fallback Gemini text only if needed
```

## What Is Implemented Today

### Data and Retrieval
- offline recipe catalog
- ingredient index
- ingredient normalization service
- recipe search service
- ranking logic for recipe results
- meal-plan composition service
- scan persistence

### Practical Effects in the Live App
- recipe suggestions are catalog-first
- weekly meal plans are catalog-first
- pantry quantities reduce shopping-list output
- Gemini is no longer the main recipe engine path

## Current Service Layer
Important current files:

```text
src/services/ingredientExtractionService.ts
src/services/ingredientNormalizationService.ts
src/services/recipeSearchService.ts
src/services/mealPlanService.ts
src/services/fallbackAiService.ts
src/services/scanService.ts
src/repositories/recipeRepo.ts
src/repositories/scanRepo.ts
```

## Current Domain Model Direction
The app now uses a more explicit domain layer than the earlier draft assumed.

Important files:

```text
src/lib/domain.ts
src/lib/mealPlan.ts
src/lib/types.ts
```

Practical split:
- `domain.ts` and repository/service code handle retrieval and persistence shape
- `types.ts` handles UI-facing shapes used by tabs and cards

## Current Firestore Usage
Actively relevant structures:

```text
users/{uid}/pantry/{itemId}
users/{uid}/history/{historyId}
users/{uid}/plans/currentWeekly
users/{uid}/usage/aiCredits
entitlements/{uid}
scans/{scanId}
recipePhotoCache/{signature}
```

## Ranking Behavior
The app’s ranking now effectively optimizes for:
- owned ingredients first
- fewer missing ingredients
- calorie fit
- cuisine preference fit
- diet / condition / allergen fit
- match quality and preference hits

This makes the catalog path more deterministic and more controllable than pure text generation.

## What Is Still Missing
- much larger catalog depth
- richer alias coverage
- stronger unit conversion
- automated tests for retrieval and ranking
- quality-review tooling for weak matches

## AI Role Today
AI is still important, but its role is narrower:

### Active AI Uses
- image-to-text ingredient extraction
- recipe text fallback when retrieval is weak
- meal-plan text fallback when catalog planning is weak

### Not the Primary Path
- routine recipe suggestion
- routine weekly planning
- routine recipe photo lookup

## Recipe Photos in the Offline-First World
Photo resolution now follows a separate stack:

```text
cache
-> shared cache
-> Unsplash
-> Pexels
-> unavailable
```

This is important because photo lookup is now decoupled from recipe generation. Recipe retrieval can be deterministic even when no exact image exists.

## Recommended Next Steps
1. Expand the offline recipe catalog.
2. Expand ingredient alias and normalization coverage.
3. Add tests for ranking and shopping-list reconciliation.
4. Add rate limiting and stronger operational safeguards.
5. Continue treating Gemini as fallback, not primary.
