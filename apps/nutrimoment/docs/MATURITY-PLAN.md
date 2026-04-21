# NutriMoment - Maturity Plan
**Version:** 1.2
**Date:** 2026-04-20
**Current State:** v0.5.0 (offline-first MVP foundation)
**Target State:** v1.0.0 (production-ready SaaS)

## Current State Assessment

### What Works Today
| Feature | Status | Notes |
|---|---|---|
| Google Sign-In | Working | Firebase Auth plus user document creation |
| Image to ingredient detection | Working | Gemini route with mock fallback |
| Recipe generation | Working | Offline catalog-backed retrieval with Gemini fallback |
| Dashboard shell | Working | Top nav plus 6 rendered tab components |
| Pantry CRUD | Working | Firestore-backed via `usePantry` |
| Pantry image scan | Working | Scan, review, edit, and save approximate quantities |
| Pantry quantity hints | Working | Ingredient-specific unit guidance and normalization |
| Health/profile persistence | Working | Firestore-backed via `AppContext` |
| Cuisine preferences | Working | Includes Egyptian, Middle Eastern, Mediterranean, and more |
| History persistence | Working | Firestore-backed via `useHistory` |
| Meal-plan generation UI | Working | Catalog-backed generation and shopping-list rendering |
| Meal-plan persistence | Working | Current plan stored at `users/{uid}/plans/currentWeekly` |
| Shopping-list quantity math | Working | Sums meal ingredients and subtracts matching pantry quantities |
| Arabic UI | Working | Arabic translation override plus RTL shell |
| Legal/safety layer | Working | Banner, result disclaimers, and legal pages |
| Lint and typecheck baseline | Working | `eslint` and `tsc --noEmit` are clean |

### What Is Still Incomplete
| Feature | Current Gap |
|---|---|
| API route security | No Firebase token verification on the AI route handlers yet |
| Rate limiting | No quota protection on AI endpoints yet |
| Pantry freshness | Quantity hints exist, but expiry/freshness logic is not implemented |
| Unit conversion | Basic compatible-unit subtraction exists, but package-size conversion is limited |
| Recipe library | History exists, but favorites and separate saved-recipe collections do not |
| Nutrition tracking | Not implemented yet |
| Camera capture | Upload works, but live `getUserMedia` flow is not wired |
| Route consolidation | `scan` vs `analyze-image` and `recipes` vs `generate-recipes` still overlap |
| Automated tests | Ranking and shopping-list math need dedicated tests |

### Critical Issues Before Production Use
1. API keys and local secret handling need a formal cleanup review.
2. AI routes need authenticated access.
3. AI routes need rate limiting and abuse protection.
4. Firestore security rules need a deployment review against all current collections.
5. Health-related copy should be reviewed by counsel and, if necessary, a qualified nutrition professional.

## Completed Since Stabilized Prototype
- Replaced missing dashboard tab imports with real tab implementations.
- Removed `/api/debug`.
- Fixed React effect patterns that blocked lint.
- Restored a clean `eslint` and `tsc --noEmit` baseline.
- Added Gemini-backed AI routes and mock fallback behavior.
- Added offline recipe catalog, ingredient index, retrieval service, ranking service, and catalog seed script.
- Added Egyptian, Middle Eastern, and Mediterranean cuisine preference coverage.
- Added pantry scan review, editable quantities, and quantity guidance.
- Added persisted weekly meal plans under `users/{uid}/plans/currentWeekly`.
- Added missing-quantity shopping lists that subtract pantry stock from meal ingredients.
- Added Arabic translation override and RTL shell support.
- Added legal disclaimer, terms, privacy pages, and result-level safety notices.

## Maturity Levels

```text
Level 0: Prototype
Level 1: Foundation
Level 2: Core Product
Level 3: Full Feature
Level 4: Production Ready
Level 5: Growth
```

NutriMoment is currently between Level 2 and Level 3:
- offline catalog-backed recipe and meal-plan paths exist
- real Firestore-backed user data for key surfaces
- pantry-aware shopping lists are functional
- still missing production hardening, automated tests, and nutrition tracking

## Roadmap

### Phase 1 - Security and Consolidation
Goal: make the current app safe and coherent before adding many more features.

Tasks:
- Add Firebase ID token verification middleware to all AI routes.
- Add rate limiting to AI routes.
- Review Firestore security rules against the actual collections in use.
- Consolidate overlapping route handlers:
  - `scan` and `analyze-image`
  - `recipes` and `generate-recipes`
- Remove or merge legacy inventory paths.

Definition of done:
- unauthenticated users cannot hit protected AI endpoints
- duplicate route responsibilities are reduced to one route per concern

### Phase 2 - Product Data Depth
Goal: strengthen the current feature set instead of only adding new screens.

Tasks:
- Extend pantry items with category and expiry metadata.
- Add pantry freshness calculation and visual status.
- Improve unit conversion for packages, bags, boxes, cans, and mixed units.
- Add a saved recipe library separate from history.
- Add favorites.
- Expand the offline recipe catalog to thousands of structured recipes.

Definition of done:
- pantry becomes a real kitchen inventory model
- recipe data has a long-lived home beyond generation history
- shopping lists remain accurate across common pantry units

### Phase 3 - Offline Retrieval Engine Depth
Goal: reduce runtime AI cost and improve deterministic quality.

Tasks:
- Grow `recipes`, `ingredients`, `ingredientAliases`, and `ingredientRecipeIndex`.
- Improve ingredient normalization and synonym coverage.
- Add tests for retrieval and ranking services.
- Keep `/api/generate-recipes` catalog-first with AI fallback.
- Keep `/api/mealplan` catalog-backed with AI fallback only as backup.
- Add quality review tooling for weak matches.

Definition of done:
- most recipe and meal-plan responses are served from the offline catalog
- ranking quality is deterministic and tunable
- AI becomes augmentation rather than the primary runtime engine

### Phase 4 - Personalization and Tracking
Goal: deepen user value through richer preference behavior and outcome tracking.

Tasks:
- Add allergies to the health model.
- Add macro targets.
- Improve recipe ranking using richer health profile data.
- Build nutrition log collection.
- Add daily totals and weekly summaries.

Definition of done:
- NutriMoment moves from recipe generation toward an accountable meal workflow

### Phase 5 - UX and Reliability
Goal: polish first-run experience and operational stability.

Tasks:
- Add onboarding.
- Add richer empty states and skeletons.
- Add error tracking and structured logging.
- Add monitoring.
- Add accessibility pass.
- Add camera capture flow where supported.
- Add shopping-list export and meal-slot swap controls.

Definition of done:
- users can reach first value quickly
- issues can be observed and triaged in production

## Milestone Summary
| Milestone | Version | Target Outcome |
|---|---|---|
| Stabilized prototype | v0.2.0 | Split tabs, clean lint/typecheck, no debug route |
| Secured AI layer | v0.3.0 | Authenticated and rate-limited AI routes |
| Real pantry and saved recipes | v0.4.0 | Stronger persistence and inventory fidelity |
| Offline retrieval engine | v0.5.0 | Catalog-backed recipes, catalog-backed meal plans, deterministic ranking |
| Personalized meal workflows | v0.6.0 | Richer health profile, allergies, and meal-slot controls |
| Nutrition tracking | v0.7.0 | Logging and progress metrics |
| Production-ready baseline | v1.0.0 | Security, observability, UX, and deployment readiness |

## Production-Ready Checklist

### Security
- [ ] No exposed secrets in committed history
- [ ] AI routes verify Firebase ID tokens
- [ ] Rate limiting is active
- [ ] Firestore security rules match the real data model
- [x] Debug route removed

### Quality
- [x] ESLint clean
- [x] TypeScript clean
- [ ] Strong automated test coverage
- [ ] Duplicate route responsibilities removed
- [ ] No legacy unused state paths

### Reliability
- [ ] Structured logging
- [ ] Error monitoring
- [ ] Graceful handling of auth failures and quota failures
- [x] Meal-plan display remains available when plan persistence fails

### UX
- [x] Real dashboard tabs exist
- [x] Key flows render through the current app architecture
- [x] Arabic UI and RTL shell support
- [x] Legal/safety notices on high-risk outputs
- [ ] Onboarding
- [ ] Nutrition tracking
- [ ] Rich pantry freshness states
