# NutriMoment - Maturity Plan
**Version:** 1.3  
**Date:** 2026-04-24  
**Current State:** v0.6.x style application with a working offline-first core  
**Target State:** production-ready, observable, and test-backed SaaS

## Current State Assessment

### What Works Today
| Feature | Status | Notes |
|---|---|---|
| Google sign-in | Working | Firebase Auth with Firestore user bootstrap |
| Server-enforced access control | Working | free / premium / admin enforced in backend |
| Ingredient scanning | Working | protected `/api/scan` route with normalization |
| Offline-first recipe retrieval | Working | catalog-first, ranked results |
| Gemini text fallback | Working | used only when catalog output is weak or unavailable |
| Pantry CRUD | Working | Firestore-backed |
| Pantry scan review | Working | editable quantities before save |
| Weekly meal plans | Working | premium-only, persisted current plan |
| Shopping-list pantry subtraction | Working | quantity-aware reconciliation |
| History persistence | Working | recipes and images persist in history |
| Recipe photo lookup | Working | cache -> Unsplash -> Pexels -> unavailable |
| Unsplash attribution | Working | preserved and shown in UI |
| Arabic UI and RTL shell | Working | translated UI available |
| Legal / safety layer | Working | disclaimer, terms, privacy, result notices |
| Lint and production build | Working | both pass |

### What Is Still Incomplete
| Feature | Current Gap |
|---|---|
| automated tests | ranking, pantry math, and photo matching need coverage |
| route consolidation | legacy overlaps still exist |
| rate limiting | no formal protection layer yet |
| pantry freshness | no expiry / freshness model yet |
| advanced unit conversion | still limited for packaged goods |
| favorites / saved recipe library | history exists, separate library does not |
| nutrition tracking | not implemented |
| observability | metrics exist in places, but no full monitoring stack |

## Current Maturity Level
NutriMoment is currently between **Level 2: Core Product** and **Level 3: Full Feature**.

Why:
- the main user loops are real, not mocked
- the app has working persistence and access control
- the product has meaningful offline-first behavior
- but operational hardening and automated verification are still behind

## Maturity Levels
```text
Level 0: Prototype
Level 1: Foundation
Level 2: Core Product
Level 3: Full Feature
Level 4: Production Ready
Level 5: Growth
```

## Roadmap

### Phase 1 - Hardening the Current Core
Goal: make the current implementation safer and easier to operate.

Tasks:
- add route-level rate limiting
- review Firestore security rules against live collections
- audit access-controlled routes for consistency
- remove or consolidate overlapping legacy endpoints
- add structured logging around ranking, fallbacks, and photo resolution

Definition of done:
- expensive routes are protected from abuse
- route ownership is clearer
- production troubleshooting gets easier

### Phase 2 - Data Quality and Inventory Fidelity
Goal: improve the app’s kitchen realism.

Tasks:
- add pantry category metadata
- add expiry/freshness model
- expand unit conversion
- improve ingredient alias coverage
- improve shopping-list precision

Definition of done:
- pantry behaves more like a real inventory system
- shopping lists become more trustworthy across diverse inputs

### Phase 3 - Retrieval and Planning Quality
Goal: raise the quality ceiling of the catalog-first engine.

Tasks:
- expand the offline catalog
- improve ranking heuristics and test them
- add weak-match review tooling
- continue reducing reliance on fallback AI
- improve meal-plan slot quality and variety

Definition of done:
- most recipe and meal-plan responses are strong without AI fallback
- ranking becomes predictable and tunable

### Phase 4 - Personal Library and Workflow Depth
Goal: make the product feel like a durable meal workflow, not only a generator.

Tasks:
- add favorites
- add saved recipe library separate from history
- add meal-slot swap / regenerate controls
- add shopping-list export

Definition of done:
- users can curate and revisit meals deliberately

### Phase 5 - Nutrition Tracking
Goal: extend from planning into follow-through.

Tasks:
- add meal logging
- add daily calorie and macro totals
- add weekly summaries
- add progress views

Definition of done:
- NutriMoment can support planning plus lightweight adherence tracking

## Milestone Summary
| Milestone | Outcome |
|---|---|
| Stabilized dashboard | real tabs, clean lint/build baseline |
| Offline-first engine | catalog-backed recipes and plans |
| Access control | free/premium/admin server enforcement |
| Public photo stack | shared cache + Unsplash + Pexels |
| Next major milestone | hardening, tests, and rate limiting |

## Production-Ready Checklist

### Security
- [x] Active protected routes verify Firebase ID tokens
- [ ] Route-level rate limiting
- [ ] Full Firestore rule audit against current collections
- [x] Debug route removed

### Quality
- [x] ESLint clean
- [x] Production build clean
- [ ] Automated tests for retrieval, ranking, and pantry math
- [ ] Route ownership cleanup

### Reliability
- [x] Catalog-first fallback behavior exists
- [x] Weekly plan remains usable when persistence has issues
- [x] Recipe photos avoid wrong-image fallback behavior
- [ ] Structured monitoring and alerting

### UX
- [x] Real dashboard tabs
- [x] Pantry-aware weekly plan flow
- [x] History persistence
- [x] Arabic UI / RTL support
- [ ] Favorites and saved recipes
- [ ] Nutrition tracking
- [ ] Pantry freshness indicators
