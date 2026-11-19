These ssjson fixtures are public `Workbook.toJSON()` results from SpreadJS 19.2.5 executed as an opaque reference in Chromium. No vendor JavaScript or CSS was inspected.

Regenerate from the repository root after building the core:

```sh
UPDATE_REFERENCE=1 pnpm --filter @opensheets/compare test:visual m1-fixtures
```

The scenario is our code in `apps/compare/src/scenarios/m1.ts`. `official-blank.json` is the seed, `official-model.json` adds the M1 scenario, and `official-formulas.json` additionally contains an evaluated formula and a note. Generated Guest user IDs vary on regeneration; all three files must be regenerated together. Independent replay loads the same blank seed into ours to retain that metadata, then executes the scenario separately.

Node tests list every differing JSON path and require zero differences for each round-trip and for independent replay. Formula evaluation is not part of M1: imported cached results survive serialization. The separate Excel formatting table is also checked against the trial by Playwright.

## f17-sample-regular.ttf / f17-sample-bold.ttf

Two tiny TrueType fonts we generated ourselves with fontTools (no third-party
font file is committed) for the task-17 embedded-PDF-font tests. Each has 15
simple rectangle glyphs: letters, digits, `?`, `.`, `-`, the accented Latin
`é ö`, the Greek `Σ Ω` and the astral `U+1F600` (so the cmap format 4 *and*
format 12 tables exist). Advance widths are deliberately distinct — the bold
face adds 60/1000 em to every glyph — so tests can assert face selection and
exact metrics. unitsPerEm 1000, hhea 800/-200, OS/2 capHeight 700, PostScript
names `OpenSheetsF17` / `OpenSheetsF17-Bold`, family `OpenSheets F17`.

Regenerate (script kept under `.probe/`, only the bytes are committed):

```sh
.probe/pdfvenv/bin/python .probe/f17/make-font.py   # pip install fonttools
```

## f17-sample-composite.ttf

A third tiny self-generated TrueType font (task 22) for the PDF font
**subsetting** tests. Glyph ids: `.notdef` 0, `A` 1, `grave` 2, `acute` 3,
`bar` 4 (no code point — reachable only as a component), `Agrave` 5 =
composite(A, acute) and `Acaron` 6 = composite(Agrave, bar). Drawing only
`Ȁ`/U+1E00 therefore exercises the transitive composite closure, a component
without any unicode mapping, and the empty slot left for the unreferenced
`grave`. Advances 600/300/300/250/600/600 per 1000 em, unitsPerEm 1000, hhea
800/-200, OS/2 capHeight 700, PostScript name `OpenSheetsF17-Composite`,
family `OpenSheets F17 C`.

Regenerate (script kept under `.probe/`, only the bytes are committed):

```sh
.probe/pdfvenv/bin/python .probe/f22/make-composite-font.py   # pip install fonttools
```
