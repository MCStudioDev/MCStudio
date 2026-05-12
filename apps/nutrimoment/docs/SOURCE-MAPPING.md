# NutriMoment Source Mapping
**Date:** 2026-05-11  
**Source app:** historical NutriMoment prototype  
**Target app:** `apps/nutrimoment`

## Summary
The old source-to-target migration is no longer the main story. The target app now has its own working architecture and most of the original prototype UI concepts have already been absorbed into real dashboard tabs.

This document now serves as a "where things live now" map.

## Current Mapping Status

### Fully Landed in the Target App
| Product Area | Current Target Location | Status |
|---|---|---|
| Scanner UI | `src/components/dashboard/tabs/ScannerTab.tsx` | Implemented |
| Pantry UI | `src/components/dashboard/tabs/PantryTab.tsx` | Implemented |
| Health UI | `src/components/dashboard/tabs/HealthTab.tsx` | Implemented |
| Meal plan UI | `src/components/dashboard/tabs/MealPlanTab.tsx` | Implemented |
| History UI | `src/components/dashboard/tabs/HistoryTab.tsx` | Implemented |
| Settings UI | `src/components/dashboard/tabs/SettingsTab.tsx` | Implemented |
| Top-level dashboard shell | `src/components/dashboard/NutriMomentApp.tsx` and related layout components | Implemented |
| Pantry persistence | `src/hooks/usePantry.ts` | Implemented |
| History persistence | `src/hooks/useHistory.ts` | Implemented |
| Weekly plan persistence | `src/hooks/useMealPlan.ts` | Implemented |
| Recipe retrieval and ranking | `src/services/*`, `src/repositories/*`, `src/data/offline/*` | Implemented |
| Recipe photo lookup | `src/app/api/recipe-photo/route.ts` plus `src/lib/*RecipePhoto*` | Implemented |

### Active Backend Routes Used by the UI
| Concern | Current Route |
|---|---|
| ingredient / pantry scan | `src/app/api/scan/route.ts` (+ `scan/process/route.ts`) |
| recipe suggestions | `src/app/api/generate-recipes/route.ts` |
| meal plans | `src/app/api/mealplan/route.ts` |
| recipe photos | `src/app/api/recipe-photo/route.ts` |
| history list | `src/app/api/history/route.ts` |
| health probe | `src/app/api/healthz/route.ts` |
| catalog readiness | `src/app/api/catalog/status/route.ts` |
| admin access management | `src/app/api/admin/access/route.ts` |

### Legacy / Overlapping Routes Still Present
| Route | Current Status | Notes |
|---|---|---|
| `src/app/api/recipes/route.ts` | Still in tree | Earlier recipe route; `generate-recipes` is the live one. Consolidation pending. |
| `src/app/api/analyze-image/route.ts` | Still in tree | Earlier image-to-text route; `scan` is the live one. Consolidation pending. |
| `src/app/api/debug/` | Empty directory | No handler exported. Safe but should be deleted to avoid accidental future surface. |

### Important Supporting Modules
| Concern | Location |
|---|---|
| access control | `src/services/authService.ts` |
| Firebase Admin | `src/lib/firebaseAdmin.ts` |
| Gemini text / vision wrapper | `src/lib/openai.ts` (filename retained from earlier prototype; provider is Gemini) |
| pantry quantity math | `src/lib/pantryQuantity.ts` |
| meal-plan normalization | `src/lib/mealPlan.ts` |
| recipe-photo identity and cache | `src/lib/recipePhotoIdentity.ts`, `src/lib/recipePhotoExactIdentity.ts`, `src/lib/recipePhotoReuse.ts`, `src/lib/sharedRecipePhotoCache.ts` |
| Unsplash photo search | `src/lib/unsplashRecipePhotoSearch.ts` |
| Pexels photo search | `src/lib/pexelsRecipePhotoSearch.ts` |
| Wikimedia / free public photo lookup | `src/lib/freeRecipePhotos.ts` |
| Replicate image generation (premium) | `src/lib/replicateRecipeImage.ts` |
| Cuisine dish catalog (v1) | `src/lib/cuisineCatalogs/` |
| Cuisine catalog v2 (versioned dish identity) | `src/data/cuisineCatalogV2/` |
| Rate limiter | `src/services/rateLimitService.ts` |
| Structured logger | `src/lib/logger.ts` |

## What Changed Since the Original Mapping Notes

### No Longer Accurate from the Old Notes
- "missing tab files" is no longer true
- "meal plan UI mock only" is no longer true
- "health tab UI mock only" is no longer true
- "history tab missing" is no longer true
- "no auth on protected API routes" is no longer true for the active access-gated routes
- "Wikimedia photo path is disabled" is no longer true — Wikimedia is enabled, but only for canonical dishes on the allow-list (`getAllDishes()` plus a small curated extras list)

### Newer Target-Only Improvements
- offline catalog retrieval and ranking are first-class
- meal plans are persisted and pantry-reconciled
- image search indices are returned with recipes and meal-plan meals
- recipe photo lookup uses shared cache plus Unsplash and Pexels
- Unsplash attribution is preserved in UI and persistence
- server-enforced free/premium/admin access exists

## Architecture Mapping Today
| Concern | Historical Prototype | Current Target Decision |
|---|---|---|
| frontend shell | monolithic app | split dashboard tabs and shared UI primitives |
| persistence | lighter prototype persistence | Firestore-backed user state |
| auth | Google sign-in | Firebase Auth + custom claims + mirrored entitlements |
| recipe engine | AI-heavy prototype flow | offline-first retrieval and ranking with Gemini fallback |
| meal plans | AI-centric generation | catalog-first planning with Gemini fallback |
| recipe photos | older generation / looser matching | tiered pipeline: Replicate generation for premium, cache + Unsplash + Pexels + allow-listed Wikimedia for free, with strict identity matching |

## Remaining Cleanup Work
These are still relevant mapping/cleanup tasks:
- consolidate overlapping legacy routes such as `scan` vs `analyze-image`
- consolidate overlapping recipe routes such as `recipes` vs `generate-recipes`
- review any remaining legacy code paths not used by the live dashboard
- continue reducing old prototype terminology in code and docs

## Recommended Reading Order for the Current App
If someone needs to understand the actual product today, the best order is:
1. `docs/PRODUCT.md`
2. `docs/SRS.md`
3. `docs/OFFLINE-ENGINE-SPEC.md`
4. `src/services/authService.ts`
5. `src/app/api/generate-recipes/route.ts`
6. `src/app/api/mealplan/route.ts`
7. `src/app/api/recipe-photo/route.ts`
