# OpenSheets

A clean-room TypeScript spreadsheet component targeting the public SpreadJS 19.2.5 API. M0 provides the workspace, package formats, API tooling, sparse data model, React host, and comparison harness. Canvas rendering and spreadsheet interaction are later milestones.

Requires Node.js 20.19+ and pnpm 10.

```sh
pnpm install
pnpm -r build
pnpm -r typecheck
pnpm -r test
pnpm coverage:api
pnpm lint
```

Run the playground with `pnpm --filter @opensheets/playground dev` (port 5173), or the comparison page with `pnpm compare` (port 5174). Scenarios are registered in `apps/compare/src/scenarios/index.ts`; select one with `?scenario=empty`, `?scenario=values`, or `?scenario=multiple-sheets`.

```sh
pnpm setup:compare
pnpm test:compare
```

Browser tests write two screenshots and model observations per scenario to `test-results/compare/`. They check data behavior; screenshots are captures for visual review, not assertions of rendering parity. The official trial watermark is expected.

The official packages are development references. Tooling reads only public declarations. The comparison app executes the trial package and loads its theme as opaque browser assets. No implementation or vendor styles are used by our library. Generated signatures contain no vendor documentation comments. See [AGENTS.md](AGENTS.md) for the mandatory clean-room rules, [docs/STATUS.md](docs/STATUS.md) for scope, and [docs/API_COVERAGE.md](docs/API_COVERAGE.md) for implementation coverage.

Our published core offers ESM default/named exports, CommonJS `module.exports = GC`, and an IIFE that installs `window.GC`. Conditional type exports provide ESM namespaces and CommonJS `export = GC`. Applications can use npm aliases:

```json
{
  "dependencies": {
    "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0",
    "@mescius/spread-sheets-react": "npm:@opensheets/spread-sheets-react@^0.1.0"
  }
}
```

Unsupported declared APIs throw `NotImplemented`. The alias example describes the intended install contract; M0 is not yet a full spreadsheet replacement.
