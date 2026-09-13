# Arabic facts workflow

Implementation scope: Arabic ingredient resolution, structured recipe facts, read-only reference/editor-cache access, bounded generation, independent validation/cache versions, and automatic persistent Arabic pictures. English generation services, endpoints, prompts and content stores remain unchanged. Shared UI wiring selects an Arabic wrapper only for Arabic records.

Validation sequence: regression tests first; local checkpoint after the intended RED failure; focused GREEN tests; full relevant regression/type/build checks; browser checks where a signed-in local session is available. Production activation and staging validation require a separate configured environment; neither is implied by local validation.

Storage: existing Arabic recipe/history/weekly/image collections, plus Arabic-only ingredient-resolution and reference-variant indexes. Source eligibility and content fingerprints must be checked on read and in the publication transaction. No migrations or bulk translations.

Billing: caches remain available without credits. Unresolved ambiguous inputs fail before credit reservation. Entitled generation uses one existing action reservation across bounded internal requests. Image cache hits do not consume generation grants. New images use the Arabic storage prefix.
