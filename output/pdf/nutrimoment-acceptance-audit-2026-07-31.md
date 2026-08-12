# NutriMoment Production Acceptance Audit

Date: July 31, 2026

## Verdict

NOT READY. Premium passed 2/8 live scenarios; free passed 1/8 with one warning. Arabic focused requests found 426 candidates but returned zero cards in both tiers. The repeated chicken test returned 50 cards but only 13 unique titles.

## Key measurements

- Static matrix: 90/90 pass.
- Unit/integration: 210 pass; Firestore rules not run because emulator port 8080 was unavailable.
- Premium matrix: 314.3 seconds, 2 pass and 6 fail.
- Free matrix: 227.5 seconds, 1 pass, 1 warn, and 6 fail.
- Arabic premium: 67.8 seconds, 426 candidates, 10 Gemini successes, 0 cards.
- Arabic free: 45.3 seconds, 426 candidates, 6 Gemini successes, 0 cards.
- English premium sample: 44.3 seconds, 10 cards, culinary average 32.5/100.
- Rotation: 13 unique of 50; p95 11.07 seconds.

## Critical findings

1. The quality gate converts valid search and successful Gemini output into zero Arabic cards.
2. Live diet violations reach users in premium and free flows.
3. Premium editing appends repetitive and corrupted health text.
4. Selected cuisine frequently leaks into unrelated cuisines.
5. The ten-scan rotation does not prevent repeats.
6. Chrome usability testing was blocked by an unstable ChatGPT Chrome Extension connection and remains outstanding.

See the PDF for full tables, culinary review, defect priorities, and evidence paths.
