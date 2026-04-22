# NutriMoment - Product Description
**Version:** 1.2
**Date:** 2026-04-20

## Tagline
**"Point. Scan. Eat well."**
AI-guided recipe and meal-planning support for your kitchen.

## What Is NutriMoment?
NutriMoment is an AI-guided nutrition and recipe web app that turns ingredients users already have into practical, preference-aware recipe ideas. Instead of making users search a huge recipe catalog, NutriMoment starts from the real contents of a fridge, pantry, or grocery bag and builds suggestions from there.

The product is designed around one core idea: healthy eating is easier when the app understands inventory, preferences, cuisine, and context at the same time.

NutriMoment is informational meal-planning support. It is not medical advice, diagnosis, treatment, or a substitute for professional care.

## Problems It Solves
| Problem | How NutriMoment Helps |
|---|---|
| "I have food but no idea what to cook." | Scan ingredients and generate recipes from what is actually available. |
| "I forget what is in my pantry." | Keep a live pantry list tied to the signed-in user. |
| "Meal planning takes too much effort." | Generate and save a 7-day meal plan from pantry items and profile settings. |
| "Generic recipes ignore my preferences." | Use diet, cuisine, calorie, and health profile data in catalog ranking and fallback prompts. |
| "I do not know what to buy." | Build a shopping list from missing meal-plan ingredients after subtracting pantry quantities. |

## Core Features

### Smart Ingredient Scanner
The scanner is the main entry point. Users can upload a fridge or ingredient photo, or manually add ingredients as text.

Current implementation details:
- Upload flow is available from the scanner tab.
- Image analysis is handled by `POST /api/scan`.
- Detected ingredients are merged into an editable working list.
- Manual comma-separated ingredient entry is supported.
- Generated recipe sessions are saved into Firestore-backed history.

### Free/Premium Recipe Generation
NutriMoment uses access-aware recipe generation. Free users receive a limited AI trial, then continue with offline catalog recipes. Premium users get API-first recipe generation with offline catalog fallback.

Current implementation details:
- Recipe generation is handled by `POST /api/generate-recipes`.
- Free users receive 5 lifetime shared AI uses across image-to-text scans and recipe photo lookup/generation.
- After the free credits are used, recipe generation uses `src/data/offline/recipes.ts` and placeholder/local images.
- Premium recipe generation uses Gemini first and falls back to offline catalog matches when API output is unavailable or weak.
- Retrieval uses ingredient normalization, an ingredient recipe index, and ranking services.
- Ranking considers calorie target, cuisine preference, max missing ingredients, diet preferences, health conditions, popularity, and quality score.
- Recipe cards show cuisine, macros, owned ingredients, missing ingredients, preparation steps, and preference-hit badges.
- Recipe cards can hydrate public web photos through `/api/recipe-photo`; this counts against the shared free AI/photo credits for free users.

### Pantry Management
NutriMoment keeps a per-user pantry collection in Firestore so ingredients persist across sessions.

Current implementation details:
- Pantry data is stored under `users/{uid}/pantry`.
- Users can add items manually.
- Users can scan pantry images, review detected items, and edit quantities before saving.
- Users can remove individual pantry items or clear the pantry.
- Pantry quantities are used by weekly meal-plan shopping-list subtraction.
- Quantity hints guide users toward compatible units:
  - rice, oats, lentils, quinoa: cups
  - tomato, onion, egg: whole/items
  - garlic: cloves
  - olive oil: tbsp
  - chicken breast: lb
  - yogurt / greek yogurt: cups

Planned improvements:
- expiry dates and freshness logic
- category fields
- richer conversion for bags, boxes, cans, containers, and package sizes

### Health, Diet, and Cuisine Preferences
NutriMoment stores user preferences and health constraints so results can be personalized.

Current implementation details:
- Firestore-backed health profile is available.
- Users can toggle dietary preferences and health conditions.
- Settings persist calorie target, preferred cuisine, max missing ingredients, voice language, recipe language, and UI language.
- Cuisine preference includes Egyptian, Middle Eastern, Mediterranean, Italian, Indian, Mexican, American, Asian, Thai, and Any.
- Recipe ranking and meal-plan generation consume this data.
- Arabic UI language and RTL layout support are available.

Planned improvements:
- allergies
- macro targets
- richer health profile schema
- clinician-reviewed condition wording if health guidance becomes a central product promise

### Pantry-Aware Weekly Meal Planning
NutriMoment can generate and save a 7-day meal plan using pantry data and profile settings.

Current implementation details:
- Meal plan generation is handled by `POST /api/mealplan`.
- Weekly meal planning is premium-gated.
- Premium weekly plans use Gemini first and fall back to catalog-backed planning if the API is unavailable.
- The active plan is persisted at `users/{uid}/plans/currentWeekly`.
- The plan remains available until the user generates a new one.
- The meal-plan tab renders breakfast, lunch, and dinner blocks for seven days.
- The shopping list sums ingredient quantities required by all selected meals and subtracts matching pantry quantities.
- If the pantry is empty, the route still generates a plan from cuisine, calorie, diet, and health settings.

Planned improvements:
- swap or regenerate a single meal slot
- export shopping list
- checked shopping-list items
- structured shopping-list objects instead of display strings

### Recipe History
Every generation session can be stored so users can revisit past results.

Current implementation details:
- History is stored under `users/{uid}/history`.
- The history tab shows timestamps, ingredient sets, generated recipes, and saved recipe images.
- Users can clear all history or remove single entries.

Planned improvements:
- favorites
- separate saved recipe library
- search and filtering

### Legal and Safety Layer
NutriMoment presents recipe and meal planning as informational support, not medical advice.

Current implementation details:
- App-wide legal banner.
- Health-tab medical disclaimer.
- Result-level safety notice on recipe and meal-plan outputs.
- Legal pages under `/legal/disclaimer`, `/legal/terms`, and `/legal/privacy`.
- Marketing copy avoids positioning the app as a medical or nutrition expert.

### Access Control and Admin
NutriMoment now has a server-enforced access model for free, premium, and admin users.

Current implementation details:
- Firebase Auth custom claims are the trusted source for `role` and `tier`.
- Any signed-in user defaults to free unless a premium claim is granted.
- Free users get 5 lifetime shared credits for image-to-text scanning and recipe image/photo lookup.
- Premium users get API-first recipes, scans, recipe imagery, and weekly plans.
- Admin users can update roles and tiers through protected backend control.
- Firestore mirrors entitlement and usage data for UI display, while server routes enforce the actual access checks.

### Nutrition Tracking
Nutrition tracking remains a planned feature rather than a completed one.

Planned scope:
- meal logging
- daily calorie and macro totals
- weekly summaries
- streaks and progress views

## Current Implementation Snapshot

### Working Now
- Google sign-in and session-aware routing
- Split dashboard with scanner, pantry, meal plan, health, history, and settings tabs
- Scanner upload flow and manual ingredient entry
- Offline catalog-backed recipe retrieval with profile-aware ranking
- Pantry CRUD and pantry image scan review backed by Firestore
- Health and settings persistence via Firestore
- Persisted weekly meal-plan generation and rendering
- Quantity-aware shopping lists that subtract pantry stock
- Recipe history persistence
- Public web recipe-photo hydration
- Free/premium access gating with lifetime AI-credit tracking
- Admin backend access control for role/tier updates
- Arabic UI translations and RTL dashboard shell
- Legal disclaimer, terms, and privacy pages
- Mock AI fallbacks for local development

### Recently Fixed
- Firestore `undefined` write errors were fixed for pantry and meal-plan saves.
- Meal plans now display locally even if Firestore persistence fails.
- Pantry ingredient aliases such as `yogurt` and `greek yogurt` are normalized for shopping-list subtraction.
- Shopping lists now include quantities and subtract pantry stock by canonical ingredient and compatible units.
- Pantry recipe match cards were removed from the meal-plan page so the page focuses on the generated plan and missing shopping quantities.

### Still Open
- rate limiting
- favorites and recipe library
- nutrition tracking
- richer pantry freshness logic and advanced unit conversions
- route consolidation for overlapping AI endpoints
- automated tests for ranking, pantry normalization, and shopping-list math

## Users and Personas

### Busy Professional
Needs a fast way to turn a few ingredients into dinner without spending time browsing.

### Health-Managed Eater
Needs recipes that respect selected dietary constraints and conditions with less manual filtering.

### New Cook
Needs clear steps and realistic recipe ideas from whatever is already available at home.

### Household Planner
Needs pantry awareness, meal planning, and a missing-items shopping list in one place.

## Differentiation
NutriMoment is different from a generic recipe app because it combines:
- ingredient detection
- pantry persistence
- cuisine and health-aware ranking
- catalog-backed meal planning
- quantity-aware missing shopping lists
- history

The value is not just "generate a recipe." The value is "generate the right recipe from my current kitchen state."

## Technical Highlights
- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Framer Motion
- Firebase Auth and Firestore
- Gemini-backed route handlers with local mock fallback behavior
- Offline recipe catalog and ingredient index
- Catalog retrieval, normalization, and ranking services

## Near-Term Product Priorities
1. Add rate limiting to AI routes.
2. Consolidate duplicate AI route responsibilities.
3. Add an in-app admin dashboard on top of the protected backend access route.
4. Improve pantry modeling with expiry, freshness, and advanced unit conversion.
5. Add saved recipes and favorites.
6. Add meal-slot swaps and shopping-list export.
7. Build nutrition logging.
