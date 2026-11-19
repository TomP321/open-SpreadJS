# @opensheets/compat

Development-only conformance tooling (not published, no runtime code).

- **Type-level conformance**: compile-time tests comparing our public declarations against the
  official `@mescius/spread-sheets@19.2.5` declarations installed as a devDependency
  (`node_modules/@mescius/spread-sheets/dist/gc.spread.sheets.d.ts`).
- **API coverage report**: `pnpm coverage:api` (from the repo root) reflects our built runtime and
  declarations against the official inventory and regenerates `docs/API_COVERAGE.md`.
- **Generators**: `pnpm generate:enums` regenerates the enum facts used by the core from the public
  declarations.

Clean-room rule: only the public `.d.ts` files are read here — never the official `*.min.js`
implementations or `styles/*.css` contents. See the repository `AGENTS.md`.
