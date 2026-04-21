# NutriMoment Source Mapping
**Date:** 2026-04-17
**Source app:** `C:\Users\gamal\Downloads\nutrimoment`
**Target app:** `apps/nutrimoment`

## Current Mapping Status - 2026-04-20
The major source-app UI sections have now been mapped into the target Next.js app as real dashboard tabs.

Implemented target areas:
- `ScannerTab.tsx` for image/manual ingredient input and catalog-backed recipe results
- `PantryTab.tsx` for Firestore pantry CRUD, pantry image scan review, editable quantities, and quantity guidance
- `HealthTab.tsx` for diet and health preference selection plus medical disclaimer
- `MealPlanTab.tsx` for persisted weekly meal plans and missing-quantity shopping lists
- `HistoryTab.tsx` for saved recipe generations and hydrated recipe photos
- `SettingsTab.tsx` for calorie, cuisine, language, missing-ingredient, and legal settings

Additional target-only improvements beyond the source prototype:
- offline recipe catalog and ingredient index under `src/data/offline`
- retrieval and ranking services under `src/services`
- Firestore catalog seed script under `scripts/seed-offline-catalog.ts`
- cuisine matching for Egyptian, Middle Eastern, Mediterranean, and related cuisines
- public web recipe-photo lookup through `/api/recipe-photo`
- Arabic translation override and RTL dashboard shell
- legal pages under `/legal/disclaimer`, `/legal/terms`, and `/legal/privacy`
- pantry-aware weekly shopping lists that subtract stored pantry quantities from selected meal ingredients

Remaining mapping/cleanup work:
- consolidate overlapping routes such as `scan` vs `analyze-image` and `recipes` vs `generate-recipes`
- add API route authentication and rate limiting
- expand the offline catalog and alias dictionary
- add automated tests for pantry quantity normalization, ranking, and shopping-list math

## Goal
Map the downloaded NutriMoment prototype into the monorepo Next.js app without blindly copying the old architecture.

The source app is a Vite + Express + SQLite prototype with most UI and behavior living in one large file:
- `C:\Users\gamal\Downloads\nutrimoment\src\App.tsx`
- `C:\Users\gamal\Downloads\nutrimoment\server.ts`

The target app is a Next.js 16 + Firebase + App Router rewrite with better separation already started:
- `apps/nutrimoment/src/app/page.tsx`
- `apps/nutrimoment/src/components/dashboard/NutriMomentApp.tsx`
- `apps/nutrimoment/src/contexts/AppContext.tsx`
- `apps/nutrimoment/src/hooks/usePantry.ts`
- `apps/nutrimoment/src/hooks/useHistory.ts`
- `apps/nutrimoment/src/app/api/scan/route.ts`
- `apps/nutrimoment/src/app/api/generate-recipes/route.ts`
- `apps/nutrimoment/src/app/api/mealplan/route.ts`

## Skill Use Notes
The request asked to use all available skills. I used them as planning lenses for this mapping:

- `imagegen`: checked whether NutriMoment's graphics should be recreated as bitmap assets. Conclusion: no bitmap generation is needed yet because the source graphics are code-native gradients, blobs, typography, and icons.
- `openai-docs`: checked relevance for current provider migration work. Conclusion: official provider docs were useful for validating Gemini SDK choices, even though the app runtime now targets Gemini APIs.
- `plugin-creator`: checked whether this mapping should become a plugin. Conclusion: not needed for the app migration itself.
- `skill-creator`: used as the model for turning this into a reusable, step-by-step migration artifact instead of loose notes.
- `skill-installer`: checked whether any missing external skills were required. Conclusion: no installation needed because the needed skills are already available.

## Architecture Mapping

| Concern | Source prototype | Target app | Mapping decision |
|---|---|---|---|
| Framework | Vite SPA + Express server | Next.js App Router | Keep target framework; do not port the Express shell |
| Persistence | SQLite in `server.ts` | Firebase Auth + Firestore | Keep Firestore; do not migrate SQLite schema literally |
| Auth | Firebase Google sign-in verified by Express | Firebase Google sign-in in app + context | Keep target auth path |
| AI routes | Express `/api/*` endpoints | Next route handlers in `src/app/api/*` | Keep Next route handlers |
| UI composition | One giant `App.tsx` | Split dashboard tabs/components | Continue split; do not re-monolith the app |
| Styling | Tailwind v4 + custom classes in `src/index.css` | Tailwind v4 + global utility classes in `src/app/globals.css` | Port visual tokens, not raw CSS line-by-line |
| Motion | `motion/react` in source | `framer-motion` in target | Keep `framer-motion` already used in target |

## UI Graphics Mapping

### Visual language to preserve
These are the graphics concepts that define the source NutriMoment look and should be mapped into reusable target components and utility classes.

| Source graphic pattern | Where it appears in source | Target destination | Notes |
|---|---|---|---|
| Emerald-to-cyan gradients | hero cards, buttons, active states, modals | `src/app/globals.css`, shared button/card classes | Already partially present as `gradient-emerald` |
| Soft blurred blob background | source page shells and section backdrops | `src/components/ui/HeroBlobs.tsx` and page-level background utilities | Already partially present; extend instead of replacing |
| Rounded premium cards | most panels in `App.tsx` | shared `Card`, `Button`, section shell components | Keep consistent rounded system across tabs |
| Serif display + sans body pairing | source `src/index.css` uses Playfair + Inter | target already defines display/sans fonts | Preserve typography pairing |
| Lucide icon-driven navigation | source tab bar and action buttons | `TopNav.tsx` and tab-level action rows | Keep icon vocabulary aligned with source |
| Glass / frosted surfaces | auth card, panels, overlays | `glass-card`, `glass-card-strong` utilities | Already present in target |
| Status chips for nutrition and pantry | recipe metadata, item states | reusable `Pill` or badge variants | Build semantic variants instead of ad hoc spans |
| Animated tab/page transitions | source container/item animation variants | `NutriMomentApp.tsx` and tab components | Preserve motion rhythm, not exact code |

### Concrete graphics tokens to port
Use these as the canonical source-derived tokens:

1. Typography
   - Display: Playfair-style heading treatment
   - Body: Inter-style UI text
   - Uppercase micro-labels for metadata and helper labels

2. Shape system
   - Primary cards: `rounded-[2rem]` to `rounded-[2.5rem]`
   - Buttons: `rounded-2xl`
   - Icon badges: `rounded-xl` to `rounded-2xl`

3. Color system
   - Primary brand: emerald/teal/cyan progression
   - Surface: white or white/transparent glass
   - Accent neutrals: soft stone/gray text hierarchy
   - Error: warm red, used sparingly

4. Motion system
   - Page entrance: fade + slight Y translate
   - Tab transition: spring or fast ease-out
   - Hover: scale `1.02` to `1.05`
   - Floating blobs: slow continuous ambient motion

## Function Mapping

### Features already represented in the target app
These source behaviors already have a clean target landing zone.

| Source feature | Source location | Target location | Status |
|---|---|---|---|
| Google sign-in | `src/App.tsx`, `src/config/firebase.ts`, `server.ts` | `src/contexts/AuthContext.tsx`, `src/config/firebase.ts`, landing page | Mostly mapped |
| Ingredient image scan | `server.ts` `/api/scan` | `src/app/api/scan/route.ts`, `src/app/api/analyze-image/route.ts` | Mapped, duplicated routes need consolidation |
| Recipe generation | `server.ts` `/api/recipes` | `src/app/api/generate-recipes/route.ts`, `src/app/api/recipes/route.ts` | Mapped, prompt alignment still needed |
| Meal plan generation | `server.ts` `/api/mealplan` | `src/app/api/mealplan/route.ts` | Mapped, UI still missing |
| Pantry persistence | SQLite `pantry` table | `src/hooks/usePantry.ts` | Better than source |
| History persistence | SQLite `recipes` + local history behavior | `src/hooks/useHistory.ts` | Better than source |
| Translations | giant inline object in `App.tsx` | `src/lib/translations.ts` | Better than source |
| Settings/profile persistence | SQLite `settings`, `health_profile` | `src/contexts/AppContext.tsx` + Firestore docs | Better than source |

### Features not yet wired in the target app
These are the biggest gaps between source behavior and target implementation.

| Feature | Source behavior | Target gap |
|---|---|---|
| Scanner tab UI | Full scanner flow exists in source | Tab component missing from tree |
| Pantry tab UI | Full pantry mock + scan/import flow exists | Tab component missing from tree |
| Health tab UI | Health and diet controls exist in source | Tab component missing from tree |
| Meal plan tab UI | Meal plan presentation exists in source | Tab component missing from tree |
| History tab UI | Recipe history grid exists in source | Tab component missing from tree |
| Settings tab UI | Preference sliders and language toggles exist | Tab component missing from tree |
| Recipe image generation | Source `/api/generate-image` exists | Target route exists, but feature needs UI wiring |
| Trial gating modal | Source has free-scan trial modal | No target equivalent yet |

## Critical Findings

1. `NutriMomentApp.tsx` imports `./tabs/ScannerTab`, `./tabs/PantryTab`, `./tabs/HealthTab`, `./tabs/MealPlanTab`, `./tabs/HistoryTab`, and `./tabs/SettingsTab`, but those files are not present in the target tree.
2. The target app has duplicate API concepts:
   - `src/app/api/scan/route.ts`
   - `src/app/api/analyze-image/route.ts`
   - `src/app/api/generate-recipes/route.ts`
   - `src/app/api/recipes/route.ts`
   These should be normalized before wiring all UI.
3. The target docs already acknowledge this gap in `docs/MATURITY-PLAN.md`: the dashboard is intended to be decomposed and the mock tabs replaced with real Firestore-backed UI.
4. The source app includes some product promises not yet represented in target data types:
   - favorites
   - saved recipe library
   - nutrition logging
   - pantry freshness states
   - allergies and macro targets

## Step-by-Step Mapping Plan

### Step 1: Preserve the design system, not the monolith
Source of truth:
- `C:\Users\gamal\Downloads\nutrimoment\src\index.css`
- visual sections inside `C:\Users\gamal\Downloads\nutrimoment\src\App.tsx`

Target destination:
- `apps/nutrimoment/src/app/globals.css`
- `apps/nutrimoment/src/components/ui/*`

Action:
- extract source visual patterns into reusable utilities and shared components
- avoid copying the full source `App.tsx` layout directly

### Step 2: Recreate the missing tab component layer
Source of truth:
- scanner, pantry, meal plan, health, history, and settings sections inside source `App.tsx`

Target destination:
- `apps/nutrimoment/src/components/dashboard/tabs/ScannerTab.tsx`
- `apps/nutrimoment/src/components/dashboard/tabs/PantryTab.tsx`
- `apps/nutrimoment/src/components/dashboard/tabs/MealPlanTab.tsx`
- `apps/nutrimoment/src/components/dashboard/tabs/HealthTab.tsx`
- `apps/nutrimoment/src/components/dashboard/tabs/HistoryTab.tsx`
- `apps/nutrimoment/src/components/dashboard/tabs/SettingsTab.tsx`

Action:
- create the folder first
- move one source section into one tab at a time
- wire each tab to hooks/context instead of local monolith state

### Step 3: Make Scanner the first migrated tab
Reason:
- it is the core entry point and already has target API support

Source behavior to map:
- camera/upload flow
- manual ingredient input
- editable ingredient review
- generate recipes CTA
- loading states
- recipe card presentation

Target dependencies:
- `src/app/api/scan/route.ts`
- `src/app/api/generate-recipes/route.ts`
- `src/hooks/useHistory.ts`
- `src/contexts/AppContext.tsx`

### Step 4: Map Pantry to Firestore, not SQLite semantics
Source behavior to map:
- add items
- import scanned pantry items
- delete items
- empty state

Target dependencies:
- `src/hooks/usePantry.ts`
- `src/hooks/useInventory.ts` should likely be merged into one pantry model

Decision:
- standardize on `usePantry.ts`
- either retire `useInventory.ts` or refactor it into the same schema to avoid duplicate inventory hooks

### Step 5: Map Health tab into the existing App context
Source behavior to map:
- dietary preference chips
- health condition chips
- calorie target
- cuisine preference
- max missing ingredients
- voice language
- recipe output language

Target dependencies:
- `src/contexts/AppContext.tsx`
- `src/lib/types.ts`
- `src/lib/translations.ts`

Needed type expansion:
- add allergy support
- add macro target support if the product doc remains the goal

### Step 6: Map Meal Plan to the existing API route
Source behavior to map:
- weekly plan presentation
- loading state
- shopping list panel
- regenerate action

Target dependencies:
- `src/app/api/mealplan/route.ts`
- health settings from `AppContext`
- pantry items from `usePantry`

### Step 7: Map History to saved recipe persistence
Source behavior to map:
- recipe cards
- reopen recipe in scanner flow
- clear history
- image preview

Target dependencies:
- `src/hooks/useHistory.ts`

Needed expansion:
- if "favorites" is still in scope, add a recipe library collection separate from generation history

### Step 8: Map Settings without reintroducing local-only state
Source behavior to map:
- language selectors
- cuisine selectors
- calorie slider
- missing ingredient slider
- voice language and recipe language
- legal links

Target dependencies:
- `src/contexts/AppContext.tsx`
- `src/lib/translations.ts`
- markdown/legal content from source root:
  - `privacy-policy.md`
  - `terms-of-service.md`
  - `ai-disclaimer.md`

### Step 9: Normalize routes before finishing UI wiring
Current target overlap:
- scan/analyze-image
- generate-recipes/recipes

Action:
- pick one route per responsibility
- update the tab components to use only the normalized routes
- remove duplicate routes after the UI is migrated

### Step 10: Only then add stretch features
After parity with the source prototype:
- favorites
- nutrition logging
- freshness indicators
- recipe detail pages
- trial gating or monetization

## Recommended Build Order

1. Create missing tab component files so the dashboard structure is real.
2. Migrate Scanner tab because it is the app's primary action.
3. Migrate Pantry tab using `usePantry`.
4. Migrate Settings and Health because they feed prompt generation.
5. Migrate Meal Plan once health + pantry inputs are real.
6. Migrate History once scanner output is persisted consistently.
7. Normalize duplicate routes.
8. Add product-level enhancements from `PRODUCT.md` and `MATURITY-PLAN.md`.

## File-by-File Source -> Target Map

| Source file | Main responsibility | Target destination |
|---|---|---|
| `C:\Users\gamal\Downloads\nutrimoment\src\App.tsx` | all dashboard sections, tab navigation, local state, auth UI | split across `src/app/page.tsx`, `src/components/dashboard/TopNav.tsx`, `src/components/dashboard/tabs/*`, contexts, and hooks |
| `C:\Users\gamal\Downloads\nutrimoment\src\index.css` | fonts, theme, markdown styles | `src/app/globals.css` plus shared UI components |
| `C:\Users\gamal\Downloads\nutrimoment\server.ts` | auth verification, AI routes, SQLite CRUD | Next route handlers under `src/app/api/*`; Firestore hooks/contexts instead of SQLite |
| `C:\Users\gamal\Downloads\nutrimoment\src\config\firebase.ts` | Firebase bootstrap | keep target `src/config/firebase.ts` |
| `C:\Users\gamal\Downloads\nutrimoment\privacy-policy.md` | legal content | render in settings/legal routes or modal |
| `C:\Users\gamal\Downloads\nutrimoment\terms-of-service.md` | legal content | render in settings/legal routes or modal |
| `C:\Users\gamal\Downloads\nutrimoment\ai-disclaimer.md` | legal content | render in settings/legal routes or modal |

## Recommended Next Concrete Change
If continuing implementation, the first code change should be:

1. create `src/components/dashboard/tabs/`
2. implement `ScannerTab.tsx` from the source scanner section
3. wire it to:
   - `POST /api/scan`
   - `POST /api/generate-recipes`
   - `useHistory`
   - `useApp`

That gives the fastest path to visible parity while respecting the better target architecture.
