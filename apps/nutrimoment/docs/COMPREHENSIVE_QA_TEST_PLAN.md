# NutriMoment Comprehensive QA Test Plan

Last updated: 2026-05-29

## Purpose

This plan verifies that NutriMoment consistently honors user settings across recipe generation, weekly meal plans, scanner flows, pantry-aware planning, shopping lists, language localization, images, access tiers, and fallback behavior.

The core rule for the whole system:

1. Diets, allergens, and medical safety must be hard constraints.
2. Selected cuisine must shape real named dishes, not generic bowls with a cuisine label.
3. Pantry can help generation, but pantry must never override diet, allergen, health, or cuisine settings.
4. Premium must use premium generation paths; free must use free paths.
5. Arabic UI output must be readable Arabic, with image-internal fields staying English.

## Current Supported Surface

Cuisine settings:

- Any
- Egyptian
- Italian
- Middle Eastern
- Mediterranean
- Indian
- Mexican
- American
- Asian
- Thai
- Turkish

Diet settings:

- vegetarian
- pescatarian
- vegan
- keto
- paleo
- glutenFree
- dairyFree

Health condition settings:

- diabetes
- highBloodPressure
- lowBloodPressure
- weightGain
- weightLoss
- cholesterol

Other settings and dimensions:

- Free-form allergens
- UI/recipe language: English and Arabic
- Access tier: free and premium
- Recipe count, calorie target, max missing ingredients
- Pantry source: empty, manual pantry, scanned fridge/pantry
- Image source: free public lookup, premium Replicate generation, cache, fallback/unavailable

## High-Risk Bugs And Gaps To Track

### Gap 1: Health enforcement still needs clinical-depth validation

Current deterministic health enforcement blocks risky terms and now includes first-pass numeric gates for:

- cholesterol
- highBloodPressure
- weightLoss
- diabetes
- lowBloodPressure
- weightGain

Fix direction:

- Extend numeric nutrition validation in `healthEnforcement.ts` with meal-slot-aware thresholds and dietitian-reviewed ranges.
- Add tests that feed intentionally bad meals into `validateMealPlan` and recipe generation guard paths.
- Add Arabic risky-term matching where user-facing Arabic meals can contain health-risk words.

### Gap 2: Legacy `/api/recipes` needs full retirement or shared-pool compatibility

The active UI uses `/api/generate-recipes`, where free users are served from the shared pool. The legacy compatibility route `/api/recipes` now blocks free AI generation, but it returns an empty shared-pool compatibility payload rather than running the full shared-pool search pipeline.

Fix direction:

- Either remove/deprecate the route from production, or make it proxy/follow the same shared-pool behavior as `/api/generate-recipes`.
- Add route-level tests for free vs premium recipe generation behavior.

### Gap 3: Full cross-product testing is too large for every PR

All cuisines x diets x health conditions x allergens x languages x access tiers x pantry modes is thousands of cases.

Fix direction:

- Run a small smoke matrix on every PR.
- Run a deterministic guard matrix on every PR.
- Run the full generative QA matrix nightly or before release.

### Gap 4: Catalog coverage is uneven

Approximate cuisine dish-reference coverage currently observed:

- Egyptian: 156
- Asian: 37
- Middle Eastern: 35
- Thai: 32
- Indian: 30
- Mediterranean: 27
- American: 24
- Turkish: 21
- Italian: 19
- Mexican: 19
- Any: rotation mode, no single dish list

Risk:

- Italian, Mexican, and Turkish can regress into generic/simple meals faster than Egyptian unless prompt and catalog tests keep pressure on variety.

Fix direction:

- Add minimum reference-count tests per cuisine.
- Add golden dish-family expectations per cuisine.
- Expand Italian, Mexican, Turkish, American, and Mediterranean catalogs first.

### Gap 5: Image correctness requires both deterministic and visual review

Replicate can misread Arabic or ambiguous dish names. The image prompt/identity layer helps, but tests need to cover dish identity, negative prompts, and rendered UI fallback states.

Fix direction:

- Add prompt tests for known bad visual cases.
- Add Playwright screenshot tests for card image loading, retry, empty-image card flip, and mobile layout.
- Track generated image source and dish identity in telemetry for audit.

## Test Pyramid

### Layer 1: Deterministic Unit Tests

Run on every PR.

Targets:

- `dietEnforcement.ts`
- `healthEnforcement.ts`
- `mealPlanGuardService.ts`
- `shoppingListNormalizer.ts`
- `aiPrompts.ts`
- `replicateRecipeImage.ts`
- `recipePhotoIdentity.ts`
- `photoIdentityBuilders.ts`
- `authService.ts`
- `cuisines.ts`
- `cuisineDishCatalog.ts`

Required assertions:

- Forbidden ingredients are rejected by diet/allergen rules.
- Plant alternatives are allowed where appropriate.
- Meal plans repair unsafe slots to safe meals.
- Repaired plans preserve at least 15 unique meals.
- Shopping list collapses prep words and sums quantities.
- Arabic shopping list contains Arabic-readable names and units.
- Photo identity is stable across Arabic/English title changes.
- Premium/free access resolves correctly.
- Fallback caches cannot poison premium generated-photo matching.

### Layer 2: API Contract Tests

Run on every PR with mocked AI/image providers.

Routes:

- `POST /api/generate-recipes`
- `POST /api/mealplan`
- `POST /api/scan`
- `POST /api/analyze-image`
- `GET /api/recipe-photo`
- `POST /api/recipe-photo/batch`
- `POST /api/mealplan/cache`
- `POST /api/mealplan/images`
- `POST /api/admin/access`

Required assertions:

- Free recipe generation returns shared-pool results and no premium AI call.
- Premium recipe generation attempts AI first and falls back only on AI failure.
- Free weekly meal plans respect the free weekly count.
- Premium weekly meal plans do not consume free weekly counts.
- Premium image requests use generated image mode when cap allows.
- Free image requests use public lookup/search, never generated Replicate mode.
- If Replicate is capped or disabled, premium UI receives retryable/unavailable state without broken cards.
- API responses include updated `access` payload when credits are consumed.
- Unauthorized requests fail with 401.
- Exhausted free weekly plans fail with 402.
- Premium-only cache endpoints fail with 403 for free users.

### Layer 3: Generative Quality Tests

Run nightly and before release. Use real Gemini/Replicate only in a controlled environment.

For every generated recipe or meal-plan slot, validate:

- No diet violation.
- No allergen violation.
- No health violation where deterministic health enforcement exists.
- Cuisine label matches selected cuisine when not `Any`.
- Named dish is real or directly adapted.
- Ingredients support the dish name.
- Steps are detailed and cookable.
- `image_search_index`, `image_search_indices`, `dish_intent`, and `photo_identity` agree.
- Arabic user-facing fields contain Arabic, not English leftovers.
- Shopping list is buyable grocery items, not prep instructions.
- Meal/recipe repetition is under threshold.

### Layer 4: E2E/UI Tests

Run smoke on every PR; run full suite before release.

Use Playwright for:

- Desktop and mobile.
- English and Arabic UI.
- Free and premium accounts.
- Empty pantry and populated pantry.
- Image success, image retry, image unavailable, and duplicate-image replacement.
- Recipe card flip on mobile, including no-photo cards.
- Weekly plan generation, save/reload history, and shopping list rendering.

## Core Test Matrices

### Matrix A: Cuisine Authenticity

Run recipe generation and weekly meal plans for every cuisine:

- Any
- Egyptian
- Italian
- Middle Eastern
- Mediterranean
- Indian
- Mexican
- American
- Asian
- Thai
- Turkish

Inputs:

- Empty pantry
- Single protein: chicken
- Single seafood: shrimp
- Vegetarian pantry: eggplant, zucchini, mushroom, potato, broccoli, tomato
- Sparse pantry: rice only, lentils only, pasta only, potato only
- Mixed pantry with forbidden items for active diet

Expected:

- Selected cuisine is respected when not `Any`.
- `Any` rotates cuisines intentionally.
- At least half the output uses recognizable named dish families when a cuisine is selected.
- No selected cuisine collapses into Egyptian/Middle Eastern defaults.
- Italian includes pizza/pasta/risotto/soup/baked dishes when appropriate.
- Mexican includes tacos, enchiladas, fajitas, calabacitas, rajas, tostadas, bowls when appropriate.
- Turkish includes menemen, kofte/doner/shawarma, sarma, imam bayildi, mercimek, pilaf, mucver when appropriate.
- Asian uses substyles like Chinese, Japanese, Korean, Thai, Vietnamese and does not become generic Western stir-fry.

Fail examples:

- Italian chicken input returns only grilled chicken salad.
- Mexican vegetarian input returns chickpea rice bowls only.
- Turkish output labels Egyptian dishes as Turkish.
- `Any` returns mostly Egyptian, Turkish, and Mediterranean only.

### Matrix B: Diet Hard Constraints

Run each diet alone and selected combinations:

- vegetarian
- pescatarian
- vegan
- keto
- paleo
- glutenFree
- dairyFree
- vegetarian + dairyFree
- vegan + dairyFree
- pescatarian + dairyFree
- vegetarian + glutenFree
- vegan + glutenFree
- pescatarian + glutenFree
- keto + dairyFree
- paleo + dairyFree
- pescatarian + keto
- pescatarian + paleo

Forbidden expectations:

- Vegetarian: no meat, poultry, fish, seafood, gelatin, lard/tallow, fish sauce, oyster sauce, shrimp paste.
- Vegan: no meat, poultry, fish, seafood, eggs, dairy, honey, gelatin, animal fats.
- Pescatarian: fish/seafood allowed; poultry and land meat forbidden.
- Dairy-free: no dairy and no eggs, based on current product rule.
- Gluten-free: no wheat, bread, flour, pasta, noodles, soy sauce, couscous, bulgur, barley, rye.
- Keto: no sugar, bread, pasta, rice, potato, legumes, high-carb fruits.
- Paleo: no grains, legumes, dairy, sugar, processed ingredients.

Allowed expectations:

- Almond milk, oat milk, coconut milk, soy milk, cashew milk allowed for vegan/dairy-free unless another selected diet forbids them.
- Fish allowed for pescatarian and dairy-free.
- Vegetable shawarma/kofta/kebab variants allowed when ingredients are actually vegetarian/vegan.

### Matrix C: Health Conditions

Run every health condition alone and in combinations:

- diabetes
- highBloodPressure
- lowBloodPressure
- weightGain
- weightLoss
- cholesterol
- diabetes + weightLoss
- cholesterol + highBloodPressure
- weightGain + lowBloodPressure
- diabetes + cholesterol

Expected:

- Diabetes: lower sugar, controlled carbs, adequate protein.
- High blood pressure: low sodium, avoids cured/salted/processed foods and salty cheeses.
- Low blood pressure: avoids overly tiny meals; includes enough calories and sodium guidance.
- Weight gain: avoids very low-calorie output; includes sufficient calories/protein.
- Weight loss: avoids fried/cream/butter/cheese-heavy meals; controlled calories.
- Cholesterol: avoids butter, cream, cheese, fried foods, beef-heavy, egg-heavy patterns; enough fiber.

Known gap:

- Diabetes, lowBloodPressure, and weightGain need deterministic numeric enforcement, not prompt-only validation.

### Matrix D: Allergen Coverage

Use free-form allergens:

- egg
- milk
- peanut
- tree nut
- sesame
- soy
- wheat
- gluten
- fish
- shellfish
- shrimp
- tomato
- garlic
- onion

Expected:

- Allergen term is rejected from name, ingredients, missing ingredients, steps, visual keywords, and photo identity.
- Arabic terms are caught for common allergens.
- User-entered allergen with capitalization/plurals still works.
- Plant alternatives do not false-positive as dairy when they are explicit plant milks.

### Matrix E: Pantry Authority

Scenarios:

- Empty pantry.
- Manual pantry with compatible items.
- Scanned pantry with compatible items.
- Pantry has forbidden items for selected diet.
- Pantry has only forbidden items.
- Pantry has vague items like "sauce", "leftovers", "meat".
- Pantry has prep-form items like "chopped onion", "diced tomato".

Expected:

- Compatible pantry items influence generation.
- Forbidden pantry items are logged and ignored.
- If pantry is empty or incompatible, system creates complete plan from selected diet/cuisine/health and adds needed shopping items.
- Pantry does not force vegetarian user to use chicken/meat/fish.
- Shopping list reconciles against compatible pantry only.

### Matrix F: Shopping List Quality

Inputs:

- Multiple recipes using onion, tomato, herbs, rice, shrimp, pasta.
- Arabic output.
- Mixed units: kg, g, cup, bunch, item, whole.
- Prep-form variants: chopped onion, diced onion, sliced onion.

Expected:

- Buyable item names only: onion, tomato, parsley, rice.
- No cooking prep in shopping list: no chopped/diced/minced unless buyable form.
- Quantities are summed.
- Arabic list is translated and readable.
- Lines like `جمبري - 1 كج` and `جمبري - 2 عنصر` are reconciled or flagged for unit conflict instead of duplicated silently.
- Unknown transliterations like "nori" and "edamame" become accepted Arabic food names.

### Matrix G: Language And Localization

Run English and Arabic for:

- Recipe generation
- Weekly meal plans
- Scanner exact-match recipe
- Shopping list
- History reload
- Recipe card details

Expected:

- User-facing fields are fully in selected language.
- Arabic fallback at minimum transliterates/Arabic-letter converts when translation fails.
- Image/internal fields remain English:
  - `image_search_index`
  - `image_search_indices`
  - `dish_intent`
  - `photo_identity`
- Arabic cards do not show mojibake.
- Arabic shopping list does not contain English units like item, bunch, cup.

### Matrix H: Image Correctness

Known image-risk prompts:

- vegan shakshuka, should not show eggs
- lentil yakhna, should be lentil soup/stew not rice with chicken tenders
- soup recipes should show soup/bowl/liquid
- hawawshi, should show opened baladi bread stuffed with ground meat, not flatbread toppings
- ful medames, should show mashed/pureed fava bean texture, not generic beans
- potato fries/smashed/kompir, should show correct potato form
- shrimp: fried, honey garlic, butterfly, sweet chili, bowl, soup should be visually distinct

Expected:

- Premium generated images use `photo_identity` and strong prompt descriptions.
- Free images use public lookup and do not reuse incorrect generated cache.
- Duplicate image detection replaces repeated cards where possible.
- Failed premium image cards show retry/loading fallback, not broken UI.
- Mobile no-photo cards flip without mirrored/flipped text.

### Matrix I: Free vs Premium

Free expected:

- Recipe generation uses curated shared pool, not Gemini fresh generation.
- Public/free recipe photo lookup only.
- No Replicate generated images.
- Weekly meal plans follow the configured free weekly-plan allowance.
- Free credits decrease only for allowed free-credit features.
- Exhaustion returns clear 402/fallback notice.

Premium expected:

- Recipe generation uses Gemini first.
- Weekly meal plans use Gemini first.
- Replicate generated images are attempted when configured and cap allows.
- No free-credit decrement for premium.
- If Gemini fails, shared-pool fallback is clearly labeled.
- If Replicate fails, UI shows retry/unavailable state, not broken image cards.

Regression checks:

- `tier: "free", status: "active"` must remain free.
- `tier: "premium", status: "active"` must be premium.
- expired/canceled premium must become free.
- Admin bypasses per-user limits where intended.

### Matrix J: History, Cache, And Shared Pool

Expected:

- Saved recipe history preserves localized fields.
- Weekly meal plan history reloads identical meal names, ingredients, shopping list, and images.
- Shared pool cache never stores diet-violating recipes for later users.
- Generated image cache aliases are scoped by strict cache version and identity.
- Poisoned cache invalidation works when strict version changes.
- History entries move from pending to completed or failed without infinite loading.

## Smoke Suite For Every PR

Run these automatically:

1. `npm test -- --run src/__tests__/dietEnforcement.test.ts`
2. `npm test -- --run src/__tests__/healthEnforcement.test.ts`
3. `npm test -- --run src/__tests__/mealPlanGuardService.test.ts`
4. `npm test -- --run src/__tests__/shoppingListNormalizer.test.ts`
5. `npm test -- --run src/__tests__/cuisinePromptDepth.test.ts`
6. `npm test -- --run src/__tests__/replicateRecipeImagePrompt.test.ts`
7. `npm test -- --run src/__tests__/photoIdentityRouting.test.ts`
8. `npm test -- --run src/__tests__/authServiceAccess.test.ts`
9. `npx tsc --noEmit`
10. `npm run lint`

Applied automation:

- `npm run qa:matrix` runs the first deterministic version of this plan. It checks cuisine catalog depth, diet-safe pantry prompt lines in English and Arabic, strict diet repair across common diet combinations, numeric health enforcement probes, and free/premium access resolution.
- Reports are written to `.generated/qa-matrix-report.md` and `.generated/qa-matrix-report.json`.
- The matrix exits non-zero on failures and leaves coverage concerns as warnings.

Minimum smoke scenarios:

- vegetarian + Italian + pantry contains chicken
- vegan + dairyFree + Any + pantry contains eggs/milk
- pescatarian + dairyFree + Mexican + pantry contains shrimp
- glutenFree + Italian + pantry contains pasta/bread
- keto + Any + pantry contains rice/potato/chickpeas
- cholesterol + highBloodPressure + Egyptian
- Arabic vegan weekly plan with mixed pantry
- Premium image generation route with mocked Replicate success
- Premium image generation route with mocked Replicate timeout
- Free image lookup route with mocked public photo

## Nightly Generative Suite

Run with real providers, low concurrency, deterministic logging, and a fixed test seed.

For each cuisine:

- Generate 10 recipes from:
  - chicken
  - shrimp
  - vegetarian vegetable basket
  - sparse pantry
- Generate one weekly meal plan with:
  - empty pantry
  - compatible pantry
  - pantry with forbidden items

For each diet combination in Matrix B:

- Generate recipe set with `Any`.
- Generate weekly plan with `Any`.
- Validate all meals/recipes with diet, health, cuisine, language, photo identity, duplicate, and shopping-list validators.

For each health condition combination in Matrix C:

- Generate weekly plan with empty pantry.
- Check numeric nutrition where available.
- Check deterministic risky-term validator.

Output report:

- Pass/fail count by cuisine.
- Pass/fail count by diet.
- Pass/fail count by health condition.
- Top 20 repeated recipe families.
- Top 20 fallback reasons.
- Image failures by source.
- Arabic language leakage count.
- Shopping-list duplicate/unit-conflict count.

## Manual Exploratory Checklist

Use real accounts:

- One free test account.
- One premium test account.
- One admin account.
- One Arabic-language account.

Manual flows:

1. Set health profile, save, refresh, verify settings persist.
2. Scan fridge with mixed forbidden items; generate weekly plan.
3. Empty pantry; generate weekly plan and inspect shopping list.
4. Generate recipes from one ingredient across all cuisines.
5. Generate vegetarian recipes with vegetable basket.
6. Generate pescatarian dairy-free seafood recipes.
7. Open recipe details, flip cards on mobile, reload history.
8. Trigger image retry and verify no broken/mirrored text.
9. Use premium until Replicate cap edge and verify fallback message.
10. Use free account until weekly plan and AI credits are exhausted.

## Release Gate

Do not release if any of these fail:

- Any diet/allergen hard violation reaches the UI.
- Free account receives premium Replicate-generated images.
- Premium account is resolved as free when entitlement is active and unexpired.
- Free account is resolved as premium when `tier` is free.
- Weekly plan has fewer than 21 meals.
- Weekly plan has fewer than 15 unique meals after repair.
- Arabic mode shows mostly English user-facing meal names or shopping list.
- Shopping list contains obvious prep instructions instead of grocery items.
- Image route returns broken/undurable URLs as successful.
- Meal plan generation remains pending forever after API failure.

## Recommended Next Implementation Work

1. Make numeric health enforcement meal-slot-aware and dietitian-reviewed.
2. Fully retire legacy `/api/recipes` or make it proxy the shared-pool pipeline.
3. Add API-level tests with mocked access and provider calls.
4. Add a nightly generative QA script that emits JSON and Markdown reports.
5. Add Playwright mobile tests for no-photo card flip and image retry states.
6. Add cuisine catalog minimum coverage tests.
7. Add structured telemetry for fallback reason, provider source, cache source, diet repair count, and image identity.
