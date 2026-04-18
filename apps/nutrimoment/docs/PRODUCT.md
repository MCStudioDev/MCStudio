# NutriMoment - Product Description
**Version:** 1.1
**Date:** 2026-04-17

## Tagline
**"Point. Scan. Eat well."**
Your AI nutrition assistant lives in your kitchen.

## What is NutriMoment?
NutriMoment is an AI-powered nutrition web app that turns ingredients you already have into practical, health-aware recipe ideas. Instead of making users search a huge recipe catalog, NutriMoment starts from the real contents of a fridge, pantry, or grocery bag and builds suggestions from there.

The product is designed around one core idea: healthy eating is easier when the app understands inventory, preferences, and context at the same time.

## Problems It Solves
| Problem | How NutriMoment Helps |
|---|---|
| "I have food but no idea what to cook." | Scan ingredients and generate recipes from what is actually available. |
| "I forget what is in my pantry." | Keep a live pantry list tied to the signed-in user. |
| "Meal planning takes too much effort." | Generate a 7-day meal plan from pantry items and profile settings. |
| "Generic recipes ignore my health needs." | Inject diet and health profile data into AI recipe and meal-plan prompts. |
| "Nutrition apps feel cold and complicated." | Present cooking, planning, and health settings in one warm, lifestyle-oriented interface. |

## Core Features

### Smart Ingredient Scanner
The scanner is the main entry point. Users can upload a fridge or ingredient photo, or manually add ingredients as text.

Current implementation details:
- Upload flow is available from the scanner tab
- Image analysis is handled by `POST /api/scan`
- Detected ingredients are merged into an editable working list
- Manual comma-separated ingredient entry is supported
- The scanner experience now lives in a dedicated dashboard tab instead of a monolithic component

### AI Recipe Generation
NutriMoment generates three recipe options from the current ingredient list.

Current implementation details:
- Recipe generation is handled by `POST /api/generate-recipes`
- The prompt includes:
  - calorie target
  - preferred cuisine
  - max missing ingredients
  - dietary preferences
  - health conditions
- Each recipe card can show:
  - cuisine
  - macros
  - owned ingredients
  - missing ingredients
  - preparation steps
- Generated sessions are stored in Firestore-backed history
- Mock fallbacks are available when OpenAI credentials are not configured

### Pantry Management
NutriMoment keeps a per-user pantry collection in Firestore so ingredients persist across sessions.

Current implementation details:
- Pantry data is stored under `users/{uid}/pantry`
- Users can add items manually
- Users can remove individual pantry items
- Users can clear the whole pantry
- The pantry tab now renders from real hook data instead of hardcoded demo items

Planned improvements:
- normalized units
- category fields
- expiry dates
- freshness logic
- scanner-to-pantry one-click import

### Health Profile
NutriMoment stores user preferences and health constraints so AI output can be personalized.

Current implementation details:
- Firestore-backed health profile is available
- Users can toggle dietary preferences
- Users can toggle health conditions
- Settings persist:
  - calorie target
  - preferred cuisine
  - max missing ingredients
  - voice language
  - recipe language
  - UI language
- Recipe and meal-plan prompts already consume this data

Planned improvements:
- allergies
- macro targets
- richer health profile schema

### AI Meal Planning
NutriMoment can generate a 7-day meal plan using pantry data and profile settings.

Current implementation details:
- Meal plan generation is handled by `POST /api/mealplan`
- The prompt uses pantry items plus health/profile settings
- The meal-plan tab renders:
  - a 7-day meal schedule
  - breakfast, lunch, and dinner blocks
  - a shopping-list panel

Planned improvements:
- Firestore persistence for generated meal plans
- swap/regenerate a single meal slot
- export shopping list

### Recipe History
Every generation session can be stored so users can revisit past results.

Current implementation details:
- History is stored under `users/{uid}/history`
- The history tab shows:
  - saved sessions
  - timestamps
  - ingredient sets
  - generated recipes
- Users can clear all history or remove single entries

Planned improvements:
- favorites
- separate saved recipe library
- search and filtering

### Nutrition Tracking
Nutrition tracking remains a planned feature rather than a completed one.

Planned scope:
- meal logging
- daily calorie and macro totals
- weekly summaries
- streaks and progress views

## Current Implementation Snapshot

### Working now
- Google sign-in and session-aware routing
- Split dashboard with 6 real tab components
- Scanner upload flow and manual ingredient entry
- Recipe generation with profile-aware prompts
- Pantry CRUD backed by Firestore
- Health and settings persistence via Firestore
- Meal-plan generation and rendering
- Recipe history persistence
- Mock AI fallbacks for local development

### Recently fixed
- Missing dashboard tab imports were replaced with real components
- App lint issues were resolved
- TypeScript check is clean
- Debug API route was removed
- Root layout no longer depends on live Google Font fetches at build time

### Still open
- API authentication on route handlers
- rate limiting
- favorites and recipe library
- nutrition tracking
- richer pantry model and freshness logic
- route consolidation for overlapping AI endpoints

## Users and Personas

### Busy professional
Needs a fast way to turn a few ingredients into dinner without spending time browsing.

### Health-managed eater
Needs recipes that respect dietary constraints and health conditions with less manual filtering.

### New cook
Needs clear steps and realistic recipe ideas from whatever is already available at home.

### Household planner
Needs pantry awareness, meal planning, and a shopping list in one place.

## Differentiation
NutriMoment is different from a generic recipe app because it combines:
- ingredient detection
- pantry persistence
- health-aware prompting
- meal planning
- history

The value is not just "generate a recipe." The value is "generate the right recipe from my current kitchen state."

## Technical Highlights
- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Framer Motion
- Firebase Auth and Firestore
- OpenAI-backed route handlers with local mock fallback behavior

## Near-Term Product Priorities
1. Secure all API routes with Firebase token verification.
2. Add rate limiting to AI routes.
3. Consolidate duplicate AI route responsibilities.
4. Improve pantry modeling with units, expiry, and freshness.
5. Add saved recipes and favorites.
6. Add meal-plan persistence.
7. Build nutrition logging.
