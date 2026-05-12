# NutriMoment - Product Description
**Version:** 1.4  
**Date:** 2026-05-11

## Tagline
**"Scan what you have. Cook what fits."**

## What NutriMoment Is
NutriMoment is a pantry-aware nutrition and recipe web app that helps signed-in users turn ingredients they already have into realistic recipe suggestions and weekly meal plans.

The app is built around a practical workflow:
1. scan or type ingredients
2. normalize what those ingredients mean
3. retrieve strong offline recipe candidates
4. rank them against pantry fit, health settings, cuisine preference, and calorie target
5. fall back to AI only when needed

NutriMoment is informational support for cooking and meal planning. It is not medical advice, diagnosis, or treatment.

## Problems It Solves
| Problem | How NutriMoment Helps |
|---|---|
| "I have food but do not know what to cook." | Generates ranked recipe suggestions from scanned or typed ingredients. |
| "I forget what is in my pantry." | Stores pantry items per signed-in user in Firestore. |
| "Meal planning is too much work." | Builds and saves a weekly meal plan plus shopping list. |
| "Recipe apps ignore my preferences." | Applies diet, condition, allergen, cuisine, calorie, and pantry-fit rules to ranking. |
| "I buy duplicates because I do not track quantities." | Uses pantry quantities to reduce meal-plan shopping-list overages. |

## Core Product Behavior

### 1. Ingredient Scanning
Users can upload an ingredient or pantry image from the scanner tab.

Current behavior:
- `POST /api/scan` is the active scanner endpoint used by the UI.
- The scan route is protected by Firebase ID token verification.
- Free and premium users can scan while they still have access under the current access rules.
- Pantry scans return editable `{ name, quantity }` items.
- Ingredient scans return normalized ingredient names plus a stored `scanId`.
- Scanner sessions can be saved into history.

### 2. Offline-First Recipe Suggestions
Recipe generation is no longer purely AI-first. The app now uses catalog retrieval and ranking as the main path.

Current behavior:
- `POST /api/generate-recipes` is the active recipe route used by the UI.
- The route is protected by Firebase ID token verification.
- It retrieves from the offline catalog first, then falls back to Gemini text generation only when needed.
- Results are re-ranked by:
  - owned ingredients
  - missing ingredients
  - calorie proximity
  - cuisine preference
  - diet and condition fit
  - max missing ingredients
- The scanner currently shows 5 ranked recipe suggestions.
- Recipe output supports `image_search_index` and `image_search_indices` to improve external photo lookup.

### 3. Pantry Management
Pantry data is stored per user and drives meal-plan shopping subtraction.

Current behavior:
- Pantry items live under `users/{uid}/pantry`.
- Users can add, edit, remove, and clear items.
- Pantry image scan review is supported before saving.
- Quantity hints help users enter compatible units.
- Pantry quantities are used in shopping-list reconciliation for meal plans.

### 4. Health, Diet, and Settings
NutriMoment stores user settings and uses them in ranking and meal-plan generation.

Current behavior:
- Firestore-backed profile and settings are active.
- Users can set:
  - calorie target
  - preferred cuisine
  - max missing ingredients
  - recipe language
  - UI language
  - diet tags
  - health conditions
  - allergens
- Arabic UI and RTL layout are supported.

### 5. Weekly Meal Planning
Weekly meal planning is gated by a lifetime quota for free users and unlimited for premium/admin.

Current behavior:
- `POST /api/mealplan` is the active route.
- Premium/admin users have unmetered access.
- Free users get 3 lifetime weekly plans (`FREE_LIFETIME_WEEKLY_PLANS` in `src/services/authService.ts`).
- The route first searches the offline catalog and then optionally uses Gemini text fallback if needed.
- The current plan is stored at `users/{uid}/plans/currentWeekly`.
- The shopping list is reconciled against pantry quantities.
- The plan survives refresh until replaced.

### 6. Recipe Photos
Recipe photos use a two-mode pipeline, decided per request from caller tier.

Current active behavior:
- `GET /api/recipe-photo` is the active image lookup route.
- The route is protected by Firebase ID token verification.
- Mode is chosen by `hasGeneratedRecipeImageAccess()`:
  - **Premium/admin → generated mode**: Replicate (`black-forest-labs/flux-schnell` by default, overridable via `REPLICATE_IMAGE_MODEL`) is the primary source. Recent product direction is to enforce generated images only for this tier and aggressively reuse them via shared cache.
  - **Free / unauthenticated public hydration → search mode**: in-memory cache → shared Firestore photo cache → Unsplash → Pexels → Wikimedia (allow-listed canonical dishes only) → `unavailable`.
- All modes consult the in-memory server cache and shared Firestore photo cache first; failures are negatively cached.
- Unsplash attribution is preserved and displayed when an Unsplash photo is returned.
- Resolved image URLs are persisted into history and meal-plan records.
- `recipePhotoCache/{signature}` and exact-alias entries are shared across users to reduce regeneration cost.

Important notes:
- Replicate is now the **primary** photo path for premium users. The Replicate token must be present in production or premium photo generation will fall back to a `no exact photo` response.
- `src/lib/googleImagen.ts` is still in the tree but is not used by the active route.

### 7. History
Generated recipe sessions are saved and can be revisited later.

Current behavior:
- History is stored under `users/{uid}/history`.
- History entries include timestamp, ingredient list, recipes, and resolved recipe images.
- Users can remove single entries or clear history.

### 8. Access Control
NutriMoment now has server-enforced access control.

Current behavior:
- Firebase Auth custom claims are the trusted source for `role` and `tier`.
- The backend verifies Firebase ID tokens on protected routes.
- Any signed-in user defaults to `free` unless premium is granted.
- Premium users can use:
  - API-assisted scans
  - API-assisted recipe generation
  - recipe photo search
  - weekly meal plans
- Free users currently operate under a lifetime AI-credit model:
  - 10 lifetime AI-assisted feature credits (`FREE_LIFETIME_AI_CREDITS`).
  - 3 lifetime weekly meal plans (`FREE_LIFETIME_WEEKLY_PLANS`).
- Free users use search-mode (Unsplash/Pexels/Wikimedia) recipe photos; premium users get Replicate-generated photos.

### 9. Legal and Safety Layer
The app positions itself as informational meal-planning support.

Current behavior:
- legal pages exist at:
  - `/legal/disclaimer`
  - `/legal/privacy`
  - `/legal/terms`
- disclaimer messaging is present in health and result surfaces
- the app avoids presenting itself as a clinician or medical authority

## Current Implementation Snapshot

### Working Now
- Google sign-in and session-aware routing
- Firebase Auth + Firestore + Storage integration
- split dashboard with scanner, pantry, meal plan, health, history, and settings tabs
- offline-first recipe retrieval and ranking
- pantry CRUD with quantity-aware editing
- pantry scan review flow
- persisted weekly meal plans
- shopping-list subtraction against pantry stock
- history persistence
- recipe photo hydration through Unsplash and Pexels
- Unsplash attribution persistence
- Arabic UI and RTL shell
- protected backend access model for free, premium, and admin
- clean `eslint` and production `next build` baseline

### Still Open
- nutrition tracking
- favorites and saved-recipe library separate from history
- richer pantry freshness / expiry modeling
- stronger unit conversion for packaged goods
- route consolidation for overlapping legacy endpoints
- automated tests for retrieval, ranking, and shopping-list math
- formal production observability and rate limiting

## Technical Highlights
- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Framer Motion
- Firebase Auth
- Firestore
- Firebase Storage
- Gemini SDK (`@google/genai`) for text and vision fallback flows
- offline recipe catalog and ingredient index
- Unsplash, Pexels, and allow-listed Wikimedia recipe-photo search pipeline (free tier)
- Replicate image generation for premium recipe photos (`flux-schnell` by default)

## Near-Term Product Priorities
1. Add route-level rate limiting and abuse protection.
2. Consolidate overlapping legacy AI routes.
3. Strengthen pantry unit conversion and freshness modeling.
4. Add favorites and a saved-recipe library.
5. Expand automated coverage for ranking and meal-plan math.
6. Build nutrition logging when the recipe and planning core is more stable.
