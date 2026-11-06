These ssjson fixtures are public `Workbook.toJSON()` results from SpreadJS 19.2.5 executed as an opaque reference in Chromium. No vendor JavaScript or CSS was inspected.

Regenerate from the repository root after building the core:

```sh
UPDATE_REFERENCE=1 pnpm --filter @opensheets/compare test:visual m1-fixtures
```

The scenario is our code in `apps/compare/src/scenarios/m1.ts`. `official-blank.json` is the seed, `official-model.json` adds the M1 scenario, and `official-formulas.json` additionally contains an evaluated formula and a note. Generated Guest user IDs vary on regeneration; all three files must be regenerated together. Independent replay loads the same blank seed into ours to retain that metadata, then executes the scenario separately.

Node tests list every differing JSON path and require zero differences for each round-trip and for independent replay. Formula evaluation is not part of M1: imported cached results survive serialization. The separate Excel formatting table is also checked against the trial by Playwright.
