# Status

M0 — Foundations is implemented. No files have been committed.

## Delivered

- Strict TypeScript pnpm workspace; tsup/Vite builds, ESLint, Vitest, and Playwright.
- Core 0.1.0 with ESM default/named exports, direct CommonJS GC exports, an independent browser IIFE, dual declaration formats, and original placeholder CSS.
- Workbook: optional element/ID host, default sheet, sheetCount, sheets, getSheet, getActiveSheet, and idempotent destroy. No DOM is required when the host is omitted.
- Worksheet: name and sparse value storage, separate sheet areas, null/undefined deletion, and cells at row 999,999 / column 16,383 without a dense allocation.
- LicenseKey storage and OpenSheets productInfo metadata; no license validation.
- All 252 enums generated from public declaration facts, with exhaustive value tests.
- React SpreadSheets host with worksheet names, workbookInitialized, cleanup, and host class/style support. Equivalent parent renders preserve the workbook. Worksheet and Column expose the official prop contracts as declarative components.
- TypeScript compiler API inventory: 1,369 public declarations, including merged namespaces, overload signatures, class/interface member kinds, and enum values. No JSDoc is emitted.
- Public signature declarations and explicit runtime fallbacks for APIs beyond M0. API coverage reflects our built runtime and declarations, excluding throwing fallbacks from implemented counts.
- React playground, plus trial/ours comparison panes using the same three registered scenarios. Browser tests check model observations and capture both panes.
- Node ESM/CommonJS npm-alias smoke tests, browser-global tests, type conformance checks, and NodeNext consumer declaration checks.

## Partial and pending

- Only Workbook and Worksheet constructors and the six requested model methods are implemented. The wider public type surface does not imply runtime compatibility. Unsupported constructors, methods, properties, functions, options, and React configuration report NotImplemented; details are generated in [API_COVERAGE.md](API_COVERAGE.md).
- The OpenSheets comparison pane is blank: canvas drawing, viewport structures, dirty regions, interaction, tabs, and themes belong to M2. Screenshot capture does not assert visual parity.
- Workbook options other than sheetCount, broader worksheet state, events, and serialization remain M1 work. Invalid input edge cases are not claimed to match the reference.
- React event binding, column configuration, worksheet options, and changes to declarative worksheet configuration are pending. Supported host styling updates and equivalent children are accepted.
- Formula parsing, dependency tracking, calculation, and batching APIs are pending. Advanced modules are explicit fallbacks.
- The comparison production bundle contains the opaque official trial runtime and theme, so Vite reports a large-chunk warning. Those assets are confined to the comparison app and ignored build outputs.

## Validation

Verified successfully on 2026-11-06:

- `pnpm install && pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm coverage:api` — all passed; 271 unit tests.
- `pnpm lint` — passed.
- Playground browser smoke — passed: initialized data, equivalent parent rerender, and host lifecycle.
- `pnpm setup:compare && pnpm test:compare` — browser installed; all three scenario tests passed, producing six pane screenshots and three model observations. Cell values, worksheet names, and name setter behavior match the trial for these scenarios.
- API coverage: 2/207 constructors, 6/1,796 methods/functions, 252/252 enums, and 1,369/1,369 declarations. Unsupported runtime surfaces are present and tested to throw explicitly.

Browser captures and JSON observations are generated under `test-results/compare/`; they are ignored by Git. Official code and styles were never inspected or copied into implementation source. Only public declaration signatures and enum facts drive generation. The browser loads vendor assets solely for black-box comparison.
