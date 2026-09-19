# Isolated Arabic generation

`ARABIC_GENERATION_ENABLED` defaults to false. Enable it only on a staging server until acceptance checks pass. English recipe and weekly-plan routes, pool names and publication receipts are unchanged.

## Routes and storage

- `/api/ar/generate-recipes` and `/api/ar/mealplan` authenticate, load the saved profile, normalize input, validate cached/transformed/generated recipes, and publish through the Arabic repository.
- `/api/ar/normalize-ingredients` supports Arabic or mixed input in the English UI even when Arabic output is disabled. It uses a local dictionary, makes no AI requests and writes no content. Ordinary English input keeps its existing route.
- `/api/ar/history` merges into the history UI through a display adapter. Saved content remains readable after disabling generation.
- `/api/ar/recipe-photo` accepts an Arabic recipe ID, revalidates the recipe and English source, reuses compatible images, and otherwise uses the existing image provider and billing permissions. Image requests are explicit; Arabic cards cannot call the English image endpoint.

| Data | Destination |
| --- | --- |
| Shared recipes | `sharedRecipesArabicV1/{id}` |
| User recipe cache | `users/{uid}/offlineRecipeCacheArabicV1/{id}` |
| History | `users/{uid}/historyArabicV1/{id}` |
| Weekly plan | `users/{uid}/plans/currentWeeklyArabic` |
| Image cache/link | `recipePhotoCacheArabicV1/{recipeId}` |
| Image objects | `arabic-recipe-photos-v1/{recipeId}` |

The server repository allowlists content write paths. English sources are accessed through a read-only repository. Publication transactions recheck their current eligibility and independent content fingerprints, including quantities, units, nutrition and cooking times. Source changes invalidate reuse of the derivative; they never trigger English repairs or writes. There is no migration or bulk translation.

Authentication, action grants and usage counters remain shared. One successful generation consumes at most one parent action credit. Translation and the single bounded repair pass do not consume separate credits. Failed/incomplete requests release reservations. Without AI access, scanner requests serve only validated Arabic cache entries. New weekly plans require the same entitlement as English: free users need a remaining credit, even when all meals are cached, and a completed week consumes one credit. Zero-credit weekly requests return 402 without reading the pool or publishing a plan; saved weeks remain readable. Images use the existing parent-action image grant or premium access.

## Cuisine preference and shortages

Arabic recipe and weekly-plan generation prefer the selected cuisine and fill remaining places with validated recipes from other cuisines. Saved diets, allergens, health restrictions and source eligibility remain mandatory. Scanner recipes also require pantry overlap and obey the missing-ingredient limit. Each returned alternative retains its actual cuisine and `cuisine_match_origin: "ingredient_fallback"`. The response includes preferred/alternative counts and an Arabic explanation shown in the existing yellow notice.

Without AI access, recipe alternatives come only from the Arabic cache. Entitled requests can read compatible English/reference/semantic sources through the Arabic read-only adapters and use bounded alternative-discovery batches alongside preferred-cuisine generation within the existing deadline and single action reservation. Only selected results are published to Arabic destinations. No English workflow, cache, or record is changed.

Weekly selection first maximizes distinct dishes, then maximizes the preferred cuisine while preserving breakfast/lunch/dinner eligibility. Other cuisines fill missing meal slots before the existing at-most-two-repeat fallback. An incomplete week is never saved, and free users with zero credits still cannot generate a new weekly plan.

Weekly groceries now follow the English policy: compatible pantry ingredients are preferred, but individual meals may use entirely new groceries. Cache/reference/semantic discovery and Gemini manifests all allow this, including when the pantry is nonempty. The server ignores the scanner's `maxMissingIngredients` value for weekly requests and uses an unlimited grocery allowance; the Arabic weekly UI no longer sends that scanner setting. Every selected meal still has complete quantified ingredients, and the shopping list aggregates the whole week and subtracts measured pantry stock. Pantry ownership is never invented. Recipe-scanner limits, shared billing, source publication rules and English code/storage remain unchanged.

The subsequent live retry reached shopping-list assembly but failed with `Invalid Arabic shopping ingredient`: normalizing a complete legacy ingredient replaced the unit substring `علبة` inside `معلبة`, introducing Latin text into an otherwise valid label. The shopping adapter now parses the leading quantity/unit separately and preserves the ingredient label. It retains quantity, supported-unit and Arabic-language checks; no cached recipe needs rewriting. A read-only diagnostic examined 111 current Arabic entries, revalidated 52 against pescatarian restrictions, and reproduced two converter failures before the fix and none afterward. After source-eligibility and dish-deduplication checks, the same cache produced 21 distinct meals and 42 shopping items for Egyptian preference with a shrimp pantry, passing the final safety/language checks. This diagnostic made no AI calls, account/credit changes or database writes; it did not exercise authenticated publication or image generation. Separately, the local server recorded a successful weekly-plan retry after the fix at `2026-09-19T01:36:15.312Z`, returning 21 meals in 4,582 ms; the agent did not trigger that generation.

Local verification: 350 regression tests passed across 36 suites, including empty/nonmatching weekly pantries, six missing ingredients with a scanner limit of five, cached canned-bean shopping labels and complete publication, shopping quantities, pantry ranking, scanner limits, zero-credit weekly rejection, saved-profile safety and Arabic-only writes. Arabic service coverage: 92.72% statements, 86.21% branches, 95.06% functions and 97.41% lines. Scoped lint, TypeScript and the production build passed; the existing English artifact-loader tracing warning remains. The agent's verification did not trigger live account generation or modify account data.

## Validation and rollout

The Arabic adapter retains the pure English safety checks and adds ingredient aliases, Arabic digits/units, quantified ingredient correspondence, nutrition equality, language checks, and instruction action/number/protein checks. The English source-backed publication requirement is not applied to fresh Arabic generation. Arabic validation versions are independent. These deterministic translation checks are conservative and do not constitute a general-purpose semantic translation proof; review natural Arabic output in staging.

Run local acceptance tests:

```powershell
$arabicTestFiles = @(rg --files src/__tests__ -g 'arabic*.test.ts')
npm.cmd exec -- vitest run $arabicTestFiles src/__tests__/profileGenerationSafety.test.ts src/__tests__/sandyDietSafety.test.ts
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

Before production activation, use a dedicated staging account and Firebase project:

1. Capture English record hashes with the read-only audit script below.
2. Set the staging server flag to true and restart/redeploy that server. Test English, Arabic and mixed ingredient input; zero missing ingredients; blocked chicken and ambiguous shawarma; accepted fish/mushrooms; profile and Gemini failures; complete weekly plans and shopping lists; cached and newly generated images; credit totals; and concurrent requests.
3. Change UI language after generating. The original results must remain in their generated language. When both saved plan languages exist, use the explicit plan selector.
4. Disable the staging flag. Arabic generation must show availability guidance without silently calling English. Existing results and English generation must remain usable.
5. Compare English snapshots. Review any difference; unrelated staging activity can also change sampled records. The local write-recorder tests cover all writes made by the Arabic orchestration; snapshots cover only sampled live records.

```powershell
npm.cmd exec -- tsx scripts/audit-arabic-isolation.ts capture <snapshot-file> <staging-project-id> <staging-user-uid>
# Run staging acceptance actions, then:
npm.cmd exec -- tsx scripts/audit-arabic-isolation.ts compare <snapshot-file> <staging-project-id> <staging-user-uid>
```

No production activation is performed by these scripts or tests. Rollback is setting `ARABIC_GENERATION_ENABLED=false` and restarting/redeploying the server. Existing Arabic content remains stored separately; no English restoration is needed.

## Local verification, 2026-09-12

- 103 acceptance/regression tests passed across 12 files. Arabic services: 95.7% line, 89.68% statement, 80.63% branch and 92.59% function coverage.
- TypeScript and production build passed. Build retains an existing file-tracing warning in the English recipe artifact import chain.
- Lint passed with `.generated/**` excluded. The default lint command also scans pre-existing local audit artifacts and reports three `any` errors there.
- The broader regression run passed 673 tests and failed two existing kofta photo expectations in `recipePhotoDietCompatibility.test.ts`. Both failures were reproduced using committed source and dependencies in an isolated temporary folder; English photo policy was not changed.
- Local `/api/healthz` returned 200. Arabic recipe, plan and image endpoints returned 503 with `ARABIC_GENERATION_DISABLED` while the flag was off.
- Model/database acceptance tests use controlled fixtures and write recorders. Live Gemini/Replicate quality, staging generation, and before/after staging record hashes still require the staging URL, project and test account. Production remains disabled.

## Arabic Premium no-results fix, 2026-09-12

An explicitly authorized, one-call Gemini diagnostic reproduced a rejected response for rice, tomato and fava beans with vegan/Egyptian preferences. Premium authorization and Gemini transport succeeded. The response omitted salt/water quantities, converted instruction measurements, and omitted some instruction numerals. The Arabic input adapter also inherited a legacy mapping of `فول` to generic canned beans. The diagnostic wrote only a local ignored artifact; it did not publish recipes or run account billing operations.

- Arabic-only normalization now preserves fava-bean identity and understands half/quarter fraction glyphs. The validator accepts the undiacritized Arabic drain command while retaining ingredient, quantity, dietary and instruction checks. Its independent receipt version is `arabic-v2`.
- Fresh Arabic Gemini calls use structured ingredient objects with required numeric quantities and enumerated units, rendered into existing recipe strings before validation. Translation and repair calls have separate response schemas, immutable canonical recipes and explicit repair indexes. These schemas use the documented [Gemini JSON-schema subset](https://ai.google.dev/gemini-api/docs/structured-output#json-schema-support); semantic correctness still requires application validation.
- Responses distinguish `ARABIC_AI_UNAVAILABLE` and `ARABIC_VALIDATION_FAILED` from pantry/cache shortages. Logs contain rejection-code counts rather than ingredient/profile text. Invalid canonical recipes are not sent through a translation-only repair.
- 117 acceptance/regression tests passed across 12 files, including a controlled API reproduction of the screenshot settings and zero English content writes. Arabic-service coverage: 98.01% lines, 92.4% statements, 83.68% branches and 96.7% functions. TypeScript, Arabic-service lint and the production build passed (the existing English artifact tracing warning remains).
- The post-fix live Gemini response has not been replayed. The diagnostic authorization covered one call, which was used to reproduce the original failure. A new UI generation attempt is the remaining live quality check.

The local feature flag is enabled with the user's approval. This localhost environment uses the production Firebase project; no deployed production feature flag was changed. English endpoints, normalization, validators, transport and content storage were not modified by this fix.

## Follow-up from live retries

The first fix did not restore live generation. Actual server logs showed Gemini rejecting both generation and repair schemas with HTTP 400: nested array and numeric bounds produced too many serving-constraint states. Removed those provider-side bounds while preserving required fields/types, unit enums, and all local quantity/count/safety limits. Provider failures now take precedence over unrelated rejected English-source candidates in the error response.

Two live, empty-output protocol requests confirmed that Gemini accepts the revised generation and repair schemas. These checks supplied no account data, ingredients or dietary preferences and executed no Firebase or billing operations.

A subsequent user-triggered generation reached Gemini successfully but still rejected its recipes. The exact returned tomato-rice recipe revealed missing `vegetable broth` / `مرق خضار` aliases and a false rejection of the Arabic chop command `فرّم`. Both are corrected in the Arabic adapter. Unknown Arabic text can no longer qualify as recognized merely by round-tripping unchanged through the localization fallback. The independent Arabic validator version is now `arabic-v3`.

The actual returned recipes are stored as regression fixtures with no account identifiers or source-image links. The captured request now returns HTTP 200 in the integration test with only Arabic content writes. Temporary logging of complete rejected recipes was removed.

Verification: 122 tests across 12 files passed, plus the additional negative-quantity regression passed separately (123 total). Arabic-service coverage: 98.6% lines, 93.5% statements, 84.35% branches, 96.7% functions. TypeScript and Arabic-service lint passed. A fresh full live generation after the adapter corrections remains unverified; the request for additional diagnostic authorization is pending.

Later server logs confirmed two user-triggered Arabic requests completed successfully, returning one validated recipe each (request IDs `70d2f493-cac9-4f24-aa29-d69f0cc9fc83` and `7c55a015-1164-4d95-97d6-fda4f8c0a2e6`). This verifies recovery from the zero-result failure; it also exposed insufficient cuisine variety.

## Recognizable cuisine and shortage suggestions

Arabic fresh generation now reads the existing static cuisine dish catalog as prompt guidance, filtered through the saved dietary/health restrictions and ranked using pantry overlap and iconic-dish scores. Egyptian vegan guidance includes Ful Medames, Taameya and Koshary with their essential ingredient descriptions. The prompt prioritizes distinct recognizable dishes, avoids already-returned names, and forbids dropping defining ingredients to fit the allowance. Catalog hints are not recipes or publication receipts; generated recipes still pass the complete Arabic validator.

The same model request may include up to three additional complete alternatives, within the existing 21-candidate response cap. Validated Arabic recipes that exceed the user's missing-ingredient allowance are shown separately with their names, exact missing ingredients and configured limit. They are not saved or counted as matching results. This adds no separate model call or user charge. English-source derivatives are excluded from these suggestions so they retain their existing publication/source recheck rules.

128 tests across 14 files, TypeScript and the production build passed. Arabic-service coverage: 98.68% lines, 93.46% statements and 84.96% branches. The existing English file-tracing build warning remains. The guide and suggestion UI are verified locally; live output variety after this latest prompt change still needs a fresh generation attempt. English pool and generation endpoints remain unchanged.
