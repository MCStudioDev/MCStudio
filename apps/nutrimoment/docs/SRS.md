# Software Requirements Specification
## NutriMoment - Current Application Baseline
**Version:** 1.2  
**Date:** 2026-05-11  
**Status:** Updated to match the current app, not the original broad vision draft

## 1. Purpose
This SRS captures the current working requirements for NutriMoment as implemented in `apps/nutrimoment`.

It intentionally distinguishes between:
- what the app does today
- what is still a planned extension

## 2. Scope
NutriMoment is a Next.js 16 web application that helps authenticated users:
- scan ingredients or pantry images
- manage pantry inventory
- generate ranked recipe suggestions
- create weekly meal plans (3 lifetime trial plans for free users; unmetered for premium/admin)
- persist recipe history
- resolve public recipe photos

Core infrastructure:
- Firebase Auth
- Firestore
- Firebase Storage
- Gemini SDK for text and vision fallback flows
- offline catalog retrieval and ranking

## 3. System Context
```text
Browser
  -> Next.js UI
  -> Firebase Auth session
  -> protected Next.js route handlers
  -> Firestore / Storage
  -> offline recipe catalog + ranking services
  -> Gemini fallback for text and image-to-text flows
  -> Unsplash / Pexels for recipe photos
```

## 4. Functional Requirements

### FR-01 Authentication and Access
| ID | Requirement | Status |
|---|---|---|
| FR-01.1 | Users shall sign in with Google OAuth through Firebase Auth. | Implemented |
| FR-01.2 | Protected backend routes shall require a Firebase ID token. | Implemented |
| FR-01.3 | Backend access state shall distinguish `free`, `premium`, and `admin`. | Implemented |
| FR-01.4 | Free users shall be limited by server-enforced lifetime AI credit (10) and weekly-plan (3) quotas. | Implemented |
| FR-01.5 | Premium/admin status shall bypass free-tier quotas server-side. | Implemented |

### FR-02 Scanning
| ID | Requirement | Status |
|---|---|---|
| FR-02.1 | Users shall upload an image for ingredient or pantry scanning. | Implemented |
| FR-02.2 | `POST /api/scan` shall validate input and authenticate the caller. | Implemented |
| FR-02.3 | Ingredient scans shall return normalized ingredient names and a `scanId`. | Implemented |
| FR-02.4 | Pantry scans shall return editable pantry items with quantities. | Implemented |
| FR-02.5 | The app shall support manual ingredient entry without scanning. | Implemented |
| FR-02.6 | Scanner actions shall respect free/premium access rules. | Implemented |
| FR-02.7 | Live camera capture via `getUserMedia` shall be supported. | Planned |

### FR-03 Pantry
| ID | Requirement | Status |
|---|---|---|
| FR-03.1 | Users shall add, edit, remove, and clear pantry items. | Implemented |
| FR-03.2 | Pantry items shall persist under `users/{uid}/pantry`. | Implemented |
| FR-03.3 | Pantry quantities shall influence meal-plan shopping subtraction. | Implemented |
| FR-03.4 | Pantry image scan review shall be editable before save. | Implemented |
| FR-03.5 | Expiry / freshness status shall be supported. | Planned |
| FR-03.6 | Advanced package-size conversions shall be supported. | Planned |

### FR-04 Recipe Suggestions
| ID | Requirement | Status |
|---|---|---|
| FR-04.1 | `POST /api/generate-recipes` shall be the active recipe route used by the UI. | Implemented |
| FR-04.2 | Recipe generation shall be offline-catalog-first. | Implemented |
| FR-04.3 | Gemini text generation shall be used only as fallback when catalog output is weak or unavailable. | Implemented |
| FR-04.4 | Recipe results shall include owned ingredients, missing ingredients, steps, and macros. | Implemented |
| FR-04.5 | Recipe ranking shall consider pantry fit, calorie target, cuisine, diets, conditions, allergens, and missing ingredient count. | Implemented |
| FR-04.6 | The scanner shall show 5 ranked recipe results. | Implemented |
| FR-04.7 | Favorites and a saved recipe library separate from history shall be supported. | Planned |

### FR-05 Weekly Meal Planning
| ID | Requirement | Status |
|---|---|---|
| FR-05.1 | `POST /api/mealplan` shall require a signed-in user. Premium/admin is unmetered; free users get 3 lifetime plans. | Implemented |
| FR-05.2 | The route shall build a 7-day plan with breakfast, lunch, and dinner. | Implemented |
| FR-05.3 | The route shall use offline catalog recipes first. | Implemented |
| FR-05.4 | Gemini text fallback may be used when catalog-backed planning is weak or unavailable. | Implemented |
| FR-05.5 | The current weekly plan shall persist under `users/{uid}/plans/currentWeekly`. | Implemented |
| FR-05.6 | The shopping list shall be reconciled against pantry stock. | Implemented |
| FR-05.7 | Meal-slot swapping and export shall be supported. | Planned |

### FR-06 Recipe Photos
| ID | Requirement | Status |
|---|---|---|
| FR-06.1 | `GET /api/recipe-photo` shall authenticate the caller. | Implemented |
| FR-06.2 | The route shall reuse in-memory and shared cache entries (`recipePhotoCache` + exact aliases) before any provider call. | Implemented |
| FR-06.3 | For premium/admin callers, Replicate (`flux-schnell` by default) shall be the primary image source. | Implemented |
| FR-06.4 | For free callers, the route shall try Unsplash → Pexels → allow-listed Wikimedia, in that order. | Implemented |
| FR-06.5 | If no acceptable match is found, the route shall return an unavailable state rather than a wrong fallback image. | Implemented |
| FR-06.6 | Unsplash attribution shall be preserved and rendered in the UI when Unsplash served the image. | Implemented |
| FR-06.7 | Wikimedia matches shall be restricted to the canonical dish allow-list (`getAllDishes()` + curated extras). | Implemented |
| FR-06.8 | Gemini image generation shall be the default photo path. | Not current (replaced by Replicate) |

### FR-09a History API
| ID | Requirement | Status |
|---|---|---|
| FR-09a.1 | `GET /api/history` shall return the caller's history (max 50 entries) sorted by `createdAt`/`completedAt`/`timestamp`. | Implemented |
| FR-09a.2 | The route shall require a Firebase ID token. | Implemented |

### FR-07 History
| ID | Requirement | Status |
|---|---|---|
| FR-07.1 | Generated recipe sessions shall be stored under `users/{uid}/history`. | Implemented |
| FR-07.2 | Saved image URLs and image source metadata shall persist on recipes. | Implemented |
| FR-07.3 | Users shall remove single history entries or clear all history. | Implemented |

### FR-08 Health and Settings
| ID | Requirement | Status |
|---|---|---|
| FR-08.1 | Users shall persist calorie target, cuisine preference, missing-ingredient tolerance, UI language, and recipe language. | Implemented |
| FR-08.2 | Users shall persist diets, conditions, and allergens. | Implemented |
| FR-08.3 | These settings shall influence recipe ranking and meal-plan generation. | Implemented |
| FR-08.4 | Macro target management shall be supported. | Planned |

### FR-09 Nutrition Tracking
| ID | Requirement | Status |
|---|---|---|
| FR-09.1 | Users shall log meals and see nutrition progress. | Planned |
| FR-09.2 | Daily and weekly macro summaries shall be available. | Planned |

## 5. Non-Functional Requirements

### NFR-01 Security
| Requirement | Status |
|---|---|
| Protected backend routes must verify Firebase ID tokens. | Implemented on active access-gated routes |
| Secrets must remain server-side. | Required / operational assumption |
| Firestore rules must match the real data model. | Needs continued review |
| Rate limiting should protect expensive or abuse-prone routes. | In-memory limiter implemented; not safe across Vercel instances — see PRODUCTION_READINESS weak points |

### NFR-02 Reliability
| Requirement | Status |
|---|---|
| Catalog-first flows should continue working when Gemini is unavailable. | Implemented |
| Meal-plan UI should remain usable even if persistence fails after generation. | Implemented |
| Public photo lookup should prefer no image over a wrong image. | Implemented |

### NFR-03 Maintainability
| Requirement | Status |
|---|---|
| Route responsibilities should be unambiguous. | Still some overlap remains |
| Shared business logic should live in services/repositories. | Implemented in part |
| Types should reflect current data persisted to Firestore. | Implemented, still evolving |

### NFR-04 Quality
| Requirement | Status |
|---|---|
| Lint should pass. | Implemented |
| Production build should pass. | Implemented |
| Retrieval, ranking, and shopping-list math should have automated tests. | Not yet implemented |

## 6. Current Data Model (Practical View)
```text
users/{uid}
users/{uid}/pantry/{itemId}
users/{uid}/history/{historyId}
users/{uid}/usage/aiCredits
users/{uid}/plans/currentWeekly
users/{uid}/profile/*
entitlements/{uid}
recipePhotoCache/{signature}
metrics/imageAi
metrics/imageAiDays/days/{yyyy-mm-dd}
scans/{scanId}
```

Notes:
- `recipePhotoCache` is shared cache, not user history.
- recipe and meal-plan records may also store resolved image URLs directly.

## 7. Gaps Between Current App and Planned Product
| Area | Current App | Planned Direction |
|---|---|---|
| Recipe saving | history-backed sessions | dedicated saved-recipe library + favorites |
| Nutrition tracking | not implemented | daily logs and summaries |
| Pantry fidelity | quantity-aware, no freshness model | expiry, freshness, richer conversion |
| Observability | structured JSON logger (`src/lib/logger.ts`) only; no error tracker | Sentry/equivalent + source maps + alerting |
| Abuse protection | per-instance in-memory limiter | distributed limiter (Upstash Redis / Vercel WAF) |
| Premium photo provider | single-vendor Replicate dependency | provider redundancy or graceful provider downgrade |

## 8. Acceptance Baseline for the Current App
The current app should be considered functionally healthy when:
1. authenticated users can scan or type ingredients
2. recipe results return from catalog-first ranking
3. premium users can generate and persist a weekly plan
4. pantry quantities reconcile shopping-list output
5. recipe photos resolve from cache, Unsplash, or Pexels without wrong fallback imagery
6. lint and production build remain green
