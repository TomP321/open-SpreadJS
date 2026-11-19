# SpreadJS-compatible Designer (M6a; M6b incomplete)

## TASK 18 — the 5 pre-existing failing designer paired specs (2026-11-12)

Spec 5 (`precision.spec.ts:104`, ours-only) now **passes**. Two real gaps:
`showNewName` compared the open dialog against `'nameManagerDialog'` while the dialog
is registered as `nameManagerDialogTemplate`, so the Name Manager was never restored
after the New/Edit dialog committed or cancelled; and the `Filter with:` options used
the trial's label text as their DOM value, so no short value existed. The options now
carry stable values (`Clear`, `Workbook`, `Worksheet`, `Errors`, `NoErrors`, `Defined`,
`Tables`) with the trial's labels, and `matchNameFilter` accepts either form (the trial
shows exactly those seven labels, read from its open combo).
Files: `packages/spread-sheets-designer/src/designer-data-dialogs.ts`,
`defined-names.ts`, `dialogs/DialogHost.tsx`, plus `test/defined-names.test.ts`.

Also fixed while verifying the palette (real divergences, still spec-blocked):
the Command Palette now renders the trial's structure (`gc-command-palette-search-container`,
`gc-command-palette-list-container`, `gc-command-palette-list`, `gc-command-palette-list-group-item`
with `role=group`, `-title`, `-commands`, `gc-command-palette-list-item` with
`role=option` plus `-content`/`-icon`/`-text` and `gc-command-palette-list-item-highlight`)
instead of our own `gc-command-palette-group-label`, so both sides now report the same
group-label list (empty) and the same item texts; search results gained the trial's third
group `Find In Worksheet` with a `Find With "<query>"` entry that opens Find and Replace
with the text prefilled (`openFind(mode, searchText?)`); and our Command Palette ribbon
button now carries the trial's `gc-command-palette-trigger-button` class, so a step that
clicks that class works on both sides. New unit test `test/command-palette-groups.test.ts`.
A paired scratch harness (`.probe/t18/palette-spec-mirror.mjs`) confirms that with these
changes every palette comparison in specs 1 and 2 agrees on both sides: placeholder
`Search for actions, text, and more`, width 420, group-label list `[]`, top item
`Protect Sheet...`, Enter runs it, closes the palette and opens the Protect Sheet dialog,
Escape leaves count 0 on both sides.
Files: `src/command-palette.tsx`, `src/styles.css` (and the generated `styles/*.min.css`),
`src/find.ts`, `src/designer.ts`, `src/designer-api.ts`, `src/ribbon/controls.tsx`.

Specs 1, 2, 3 and 4 stay failing and are reported to the supervisor instead of being
edited; all four fail inside the *official* iteration of their own loop:
* `panels.spec.ts:60/:92/:210` — `clickByText(page, 'Command Palette')` sorts the
  identical-text candidates by area and picks the ribbon **group caption**
  (`gc-designer-ribbon-group-title` 90x11 at 868,126) instead of the button
  (`gc-designer-ribbon-text` 66x32 at 880,75). That caption exists in the trial with the
  same geometry, so the click is a no-op on **both** sides and
  `.gc-designer-command-palette` is never created (evidence: `.probe/t18/click-repro.mjs`,
  `click-official.png`, `click-ours.png`). One authorised-style step fix would be to click
  the trigger button (`.gc-command-palette-trigger-button`).
* `panels.spec.ts:210` additionally asserts trial behaviour the trial does not show:
  the wrong-password message is `...be sure to use the correct capitalization.` with no
  "of the keys", and `sheet.setFormula` on a protected sheet does **not** throw there
  (`formulaBlocked` false on both sides), while line 270 requires true
  (evidence: `.probe/t18/spec4-wrong-official.png`, `spec4-wrong-ours.png`,
  `protect-parity.mjs`). Our implementation currently keeps the "of the keys" wording
  that this spec expects, so the message text is an open item, not silently changed.
* `panels.spec.ts:110` — the trial 19.2.5 never docks a formula editor panel: after
  clicking *Show Formula Editor* the checkbox is checked, no
  `.gc-designer-formula-editor-panel` element is ever created (also not at 900/1200px
  viewports, and not in a production `vite build` + `vite preview`), and the official
  bundle throws `TypeError: Cannot read properties of undefined (reading 'unobserve')`
  while disposing the panel. `GC.Spread.Sheets.Designer.getCommand('formulaEditorPanel')`
  exposes only `commandName/iconClass/getState/visibleContext` — unlike the working
  `selectionPane` panel command it has no `execute`/`init`, i.e. the panel is a stub in
  the trial bundle (evidence: `.probe/t18/formula-heights.mjs`,
  `formula-official-720/900/1200.png`, `formula-ours.png`). Ours docks the panel at
  0,614 1280x84 and edits the formula, so there is no reference to compare against.
Only the supervisor-authorised line in spec 2 was touched
(`expect(results[0]).toEqual([0])` -> `toBe(0)`). No threshold, mask or gate was changed.

Validation: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` (designer 22 files /
170 tests) and `pnpm lint` pass. The full Designer Playwright suite on a fresh build
finished **147 passed / 27 failed** (174 tests): the 21 existing DPR 2 ribbon pixel
gates, 2 existing context-menu gates (both re-confirmed failing with these changes
stashed away, so unchanged) and the 4 reported specs above. `precision.spec.ts:104`
passes in that run.

## M6e continuation — color selection (incomplete)

More Colors now starts with empty RGB fields and accepting them clears the tab
color, as observed in the trial. An authored lightness control and HSL spectrum
selection update the RGB fields; a paired mouse test confirms that midpoint
lightness followed by the red spectrum corner yields `#ff0000` on both sides.
Typing RGB values still yields uppercase hex. Initial preview swatches are
transparent as observed. Unit coverage exercises the two controls. The picker
still needs drag and keyboard support, indicator and layout fidelity, and
broader color comparisons. Theme swatches still use fixed defaults; the core
tab strip still does not move for its position option. M6e remains incomplete.

The unchanged unmasked tab-menu pixel gate passed in the fresh-server run;
the same 190×262 capture and pixelmatch settings measured **241 / 49,780 pixels
= 0.484130%** (limit <0.5%). Workspace build, typecheck, tests (46 Designer
unit tests), and lint passed. The complete Designer Playwright suite finished
**99 passed / 21 failed** (120 tests); all 21 failures were DPR 2 ribbon pixel
gates. Both new paired color tests passed. No gate was changed.

## M6e continuation — dialog work (incomplete)

The Move or Copy list and footer dimensions were adjusted against the trial;
the paired move/copy tests and the existing dialog geometry check pass on a
fresh comparison server. More Colors now opens an authored Color dialog with
RGB inputs, an authored spectrum and New/Current previews. A paired mouse test
sets RGB 18/52/86 and checks Cancel preserves `#123456`. This is partial: the
spectrum and luminance interaction, initial colour, dialog geometry and theme
colours are not yet trial-compatible. The tab strip still does not move when
its position option changes, and icon fidelity remains open.

The existing unmasked 190×262 tab-menu gate passed in this environment; a
separate measurement using its same screenshot and pixelmatch settings reported
**241 / 49,780 pixels = 0.484130%** (limit <0.5%). No gate was changed. This
narrow result does not establish submenu or icon parity. A previously running
server on port 5175 served stale Designer CSS, so final browser checks used a
fresh Vite server on port 43789. Workspace build, typecheck, unit tests and
lint passed. The full Designer Playwright suite finished **97 passed / 21 failed** (118 tests); all failures were the existing DPR 2 ribbon pixel gates.

## M6e continuation — sheet-tab menu (incomplete)

Move or Copy now opens a before-sheet list and supports moving or cloning the
active sheet, including unique copy names and preserved cell data. Paired mouse
checks compare move and copy to the end, including sheet order and active sheet;
a unit test covers insertion before another sheet and name collisions. The
menu also has Tab Color, with theme tokens, standard colours, No Color and a
native colour input for More Colors. Paired checks cover #C00000, No Color and
Accent 1 80. The palette still uses fixed default-theme preview colours and the
native colour input does not reproduce the trial's More Colors dialog. The
Move or Copy dialog's complete layout and other selection cases remain open.

Authored icons and text styling were added. The entry and geometry comparison
passes, but the unchanged unmasked menu pixel gate is **3.2724%** (limit <0.5%):
icons, disabled-state rendering and other visual details remain different. The
focused run finished **7 passed / 1 failed**. Official visual inspection confirms
that Top moves the horizontal strip to the top and Left/Right use an 80px
vertical strip; the core renderer still places it at the bottom. M6e is not
complete, and no gate was changed.

Workspace build passed before the final palette changes. After those changes,
Designer build, workspace typecheck and tests (including 45 Designer tests),
and workspace lint passed.
The full Designer browser run finished **91 passed / 22 failed** (one tab-menu
pixel gate and 21 DPR 2 ribbon pixel gates). It overlapped subsequent Designer
builds, so those counts cannot establish final-build parity.


## M6d priority test correction — 2026-11-08 (incomplete)

The single-menu browser test now uses a 1280×720 viewport and verifies that
the tab menu contains Rename. At its former 800px height, the tab coordinate
fell in the sheet viewport, so that check did not establish tab coverage.
With the corrected coordinates all 14 single-menu and `allowContextMenu`
checks pass on both sides. The existing implementation and outstanding menu
behavior are unchanged.

The focused tab comparison still fails: Move or Copy and Tab Color are
missing, the menu is 52px too short, and the unmasked pixel difference is
6.4544% against the unchanged 0.5% gate. Workspace build, typecheck, unit
tests, and lint pass. M6d remains incomplete.
The full Designer Playwright run finished 87 passed / 23 failed: the two tab
parity checks and 21 DPR 2 ribbon pixel checks. The corrected ownership
checks passed in that run as well.

## M6d priority verification — 2026-11-08 (incomplete)

A fresh focused run of `context-single.spec.ts` and `context-placement.spec.ts`
finished **17 passed / 2 failed**. Both sides showed one menu for cell, row,
column, corner, tab and table; the `allowContextMenu` checks, bottom-edge
anchoring and synthetic pointer guard passed. The tab entry/geometry gate
failed: Move or Copy and Tab Color remain absent, making the menu 52px shorter.
The unmasked pixel difference was **6.4544%**, above the unchanged 0.5% gate.
The official Move or Copy dialog shows a before-sheet list and a Create a copy
checkbox. No implementation or gate was changed in this verification.

Workspace build, typecheck, unit tests and lint passed. The full Designer
Playwright suite was not rerun in this verification; the focused run above
retained the existing parity failures.

## M6d priority recheck — 2026-11-08 (incomplete)

The tab menu parity gate is still unmet. A fresh real-mouse comparison found
that Move or Copy and Tab Color are absent, leaving the menu 52px shorter than
the trial; the unmasked pixel difference is 6.454% against the unchanged 0.5%
limit. The trial's Tab Color submenu offers theme and standard colours, No
Color, and More Colors. Selecting standard #C00000 sets
`sheet.options.sheetTabColor` to `#C00000`; No Color resets it to an empty
string. These observations do not implement the missing menu or establish its
visual or functional parity. The prior ownership fix and remaining gaps are
described below.

Validation: workspace typecheck, unit tests and lint passed. The workspace
build was interrupted after the Designer comparison Vite build remained in
its transform stage. A subsequent full Designer Playwright run completed with
87 passed and 23 failed: the two tab parity checks above and 21 existing DPR 2
ribbon pixel checks. The real-mouse single-menu and `allowContextMenu` checks
passed on both sides. No implementation or test gate was changed in this pass.

## M6d continuation — sheet-tab position (incomplete)

The SheetTab Position menu now exposes Left, Right, Bottom and Top and sets
the corresponding workbook `tabStripPosition` option. Paired real-mouse tests
compare all four option values with the trial. The core renderer does not yet
move the tab strip when this option changes, and submenu layout and keyboard
behavior have not been established as compatible.

The tab parity gate remains unmet: Move or Copy and Tab Color are still missing,
as are the tab menu icons. In the focused run the menu was 52px too short and
the unmasked pixel difference was **6.446%** (limit <0.5%). No threshold or
mask was changed. The single-menu checks for all six tested areas passed on
both sides, as did the four position-option comparisons. M6d remains incomplete.

Validation: workspace build, typecheck, unit tests and lint passed. After the
final arrow styling adjustment, the Designer package was rebuilt and the full
Designer Playwright suite finished **87 passed / 23 failed**. The failures were
the two tab parity gates and the 21 previously documented DPR 2 ribbon gates.
The final tab pixel difference was **6.454%**; the menu remained 52px too short.

## M6d continuation — tab menu layout (incomplete)

The implemented tab-menu entries now use the observed 190px width and compact
26px row spacing, with Protect Sheet in its observed order and no separators.
The three unimplemented entries (Move or Copy, SheetTab Position and Tab Color),
their actions and submenu behavior, and tab menu icons remain open. No blank
rows were added to simulate the missing entries.

The unchanged paired real-mouse tab gate still fails: ours is 78px shorter
and starts 78px lower than the trial, although width and bottom anchor match.
The unmasked menu pixel difference is **6.587%** (limit <0.5%). The focused
context suite finished **17 passed / 2 failed**; both failures are the tab
entry/geometry and pixel gates. All 14 ownership and option checks passed.
No threshold or mask was changed. M6d remains incomplete.

Workspace typecheck, unit tests and lint passed. The workspace build was
interrupted after the Designer compare Vite transform stalled; the Designer
package build completed successfully. The full Designer browser suite finished **83 passed / 23 failed**: the two
tab parity checks and the 21 previously documented DPR 2 ribbon checks.

## M6d continuation — sheet tag (incomplete)

The sheet-tab menu now offers Tag. Its dialog saves the entered text using the
worksheet `tag()` API, preserves the old value on Cancel, and clears it to null
immediately on Clear. A paired real-mouse browser test exercises all three
paths; a unit test covers Clear. Dialog layout and non-string tags have not
been compared. The rest of the tab menu is still incomplete: Move or Copy,
SheetTab Position and Tab Color are missing, Protect Sheet is out of order,
and icon and submenu fidelity remain open.

The unchanged tab parity checks still fail: the menu is 50px too wide and 32px
too short, and the unmasked 190×262 menu rectangle differs by **6.553%**
(limit <0.5%). The real-mouse single-menu checks pass for cells, row and column
headers, corner, sheet tabs and table cells on both sides. No gate or threshold
was changed. Other menu areas and the remaining M6d tab functions remain open.

Validation: workspace build, typecheck and unit tests passed; lint passed after
correcting a test lint error. The Designer unit suite was rerun after adding its
Clear test (44 passed). The full Designer Playwright suite finished **83 passed /
23 failed** (106 total): the two tab parity gates and the 21 previously recorded
DPR 2 ribbon gates failed. Both new Tag tests and all 14 ownership/option checks
passed. Earlier overlapping or interrupted browser runs are excluded.

## M6d continuation — tab menu placement (incomplete)

The Designer positions its context menu using the rendered dimensions, flipping
above or to the left of the click when it would overflow the viewport. The paired
real-mouse tab checks pass for the bottom-edge case. Tab pointer capture is now
limited to primary-button drags and tolerates synthetic events without an active
pointer; a browser check covers the reported exception. The existing single-menu
ownership fix remains in place.

The requested tab parity gate remains **unmet**: at 1280×720 and click (125, 683),
the trial menu is 190×262 and ours is 240×200, with both bottom edges at y=683.
Our menu lacks Move or Copy, SheetTab Position, Tab Color and Tag, and places
Protect Sheet after Unhide. The direct unmasked comparison of the trial menu
rectangle differs by 7.280% (limit <0.5%); the entry and ±1px geometry check
also fails. The new tests retain those limits. Icons, submenus, actions, other
edge placements and the rest of M6d remain incomplete. No visual gate was
changed or masked.

Validation: workspace build, typecheck, unit tests and lint passed. The focused
new Playwright file reports 3 passed / 2 failed (the entry/geometry and pixel
gates above). The full Designer Playwright suite (four workers) finished 81 passed / 23 failed (104 total): the two new tab parity checks and 21 previously documented DPR 2 adaptive checks. All 14 existing single-menu and allowContextMenu checks passed. An earlier full run was interrupted before restarting with four workers.

## M6d continuation — context-menu ownership

The Designer now suppresses the workbook's own menu using its public
`contextMenu.onOpenMenu` hook, while retaining its own menu. The prior hook is
restored when the Designer releases a workbook, unless the application has
replaced it in the meantime. `allowContextMenu=false` suppresses the Designer
menu as it does in the trial. Real-mouse tests assert exactly one visible menu
on each side for cells, row and column headers, the corner, sheet tabs and
cells in a table. Unit tests cover hook restoration. Chart and shape menus,
entry-list and action parity, and the remaining tab functions are still open;
this change does not complete M6d.

Validation: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` and
`pnpm lint` passed. The full Designer Playwright suite finished **78 passed /
21 failed** (99 total); all 14 new browser checks passed. The 21 failures are
the previously recorded DPR 2 ribbon pixel gates, with thresholds unchanged.
An earlier browser run overlapping the build was interrupted and excluded.


## M6d continuation — sheet Unhide

The sheet-tab Unhide command now opens a list of hidden sheets instead of
immediately revealing the first one. The first item is initially selected;
clicking another item or Control-clicking multiple items chooses what OK will
reveal, and Cancel leaves the workbook unchanged. Paired trial/browser checks
cover these cases, and a unit test covers the submitted selection. Keyboard
navigation, dialog geometry, undo and the rest of context-menu parity remain
unverified. The other M6d tab functions and entry-list comparisons remain open;
this continuation does not complete M6d.

Validation: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test`, and
`pnpm lint` passed. The Designer Playwright suite finished **64 passed / 21
failed** (85 total); the failures are the same DPR 2 ribbon pixel gates, at
the unchanged 0.5% threshold and the values in the table below. Both new
Unhide tests passed. An earlier run overlapped with the restarted run and was
excluded from these counts.

## M6d partial investigation — 2026-11-07

M6d is **not complete**. Black-box inspection of the default trial menus found,
for example, that the cell menu has a six-item Paste Options group and a Sort
submenu, while row and column menus include clipboard actions, Transform Cells,
Tag and Headers. The sheet-tab menu includes Move or Copy, SheetTab Position,
Tab Color and Tag. Our menus still differ in entries, order, submenus, actions
and configuration handling; table, chart and shape menus have not been brought
to parity. The remaining tab functions in the coverage table below are still
open. No entry-list parity or full M6d completion is claimed.

Row Height and Column Width now open editable dialogs from the header context
menu and the corresponding ribbon commands. Accepted values apply to selected
rows or columns through the undo bridge. A unit test covers multi-dimension
application, and paired browser tests compare a single header change and its
neighbors against the trial. Sheet-tab Unhide enablement now tracks whether a
sheet is hidden; a paired browser test covers both states. The unhide action
itself still unhides the first hidden sheet instead of showing the trial dialog.
Dimension validation, dialog fidelity and broader selection behavior are not yet
established as trial-compatible.

Validation: `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` (845 tests,
including 40 Designer tests), and `pnpm lint` passed. The Designer package was
rebuilt separately after the Unhide enablement change. The full Designer
Playwright suite finished **62 passed / 21 failed** (83 total); all three new
paired checks passed. The 21 failures are the previously recorded DPR 2 ribbon
pixel gates, with their existing thresholds unchanged. A preliminary run made
while the package was rebuilding was interrupted and is not included in these
results. No full entry-list comparisons or functional specifications for the
remaining tab gaps have been added.

## M6c investigation — 2026-11-07

M6c remains incomplete. The formula-colour unit tests cover tokenisation,
reference colour reuse and cycling, qualified and absolute ranges, offsets,
and invalid references. No Designer rendering change has been accepted: DPR 2
caption positioning and line-height differ in the observed View ribbon, but a
change that passes the existing gates without regressing DPR 1 has not been
established. Context menus and the remaining tab and dialog functions retain the
gaps recorded below. A fresh Designer Playwright run reproduced **59 passed / 21 failed**: the
unchanged DPR 2 gates remain at the values in the table below. The workspace
build, typecheck and unit tests pass; lint fails on five unused variables in
pre-existing ignored root `.probe` scripts.



## M6b continuation — 2026-11-07

The fourteen failures retained by review `fe7e1bf` are resolved at DPR 1, with the
original 0.5% pixel limit and 1px DOM tolerance unchanged. Narrow ribbons now have a
scrolling tab rail; collapsed captions preserve their content-box dimensions;
Page Layout uses the observed checkbox targets, print-size wrappers and percentage
spinner; Data restores Group/Ungroup captions and disables Reapply without a filter.
Fractional command widths are retained rather than rounded before positioning later
controls. Format Cells has rounded chrome, a separately painted shadow, an authored
close glyph and corrected footer geometry. These are implementation changes, not
changes to scenarios, thresholds, or exclusions.

Icons use stronger blue/green accents and heavier outlines. Clipboard and compact
Font/Alignment/Number/Editing artwork was redrawn, and open action paths now have
strokes: checks, plus signs and links no longer disappear as unfilled open paths.
The artwork remains independently authored SVG, with no vendor pixels or paths.
Perceptual equivalence of the full icon set is still not established.

Data Validation now has the four tabs observed in this trial: Settings, Input
Message, Error Alert and Highlight Style. Criteria-dependent editors, Clear All,
alert style, messages and basic highlight type/colour are functional; opening the
dialog restores the active cell's validator. Highlight icon/position controls and
complete dialog layout parity remain gaps. Name Manager now lists workbook and
worksheet names, values, references, scopes and comments, filters by scope, and
supports creation, editing, deletion and read-only names. New Name includes sheet
scopes and validates duplicate/invalid names. Cancelling a nested name editor returns
to Name Manager. Its table filters, edit-dialog fidelity and undo coverage remain
partial.

DPR 2 is now exercised by the same eight-tab, three-width DOM/pixel comparisons.
Screenshot masks scale the existing CSS icon rectangles to device pixels; their
CSS areas and the 0.5% gate are unchanged. The first complete DPR 2 sweep failed
**21/24** pixel comparisons, ranging from **0.603% to 1.924%** among failures.
Reference and implementation text boxes/baselines can agree while caption pixels
still differ. Those text pixels remain measured. This does not establish a root
cause, and no DPR-specific font shifts or broader masks have been added to make
these checks pass.

The group/control/launcher DOM gate passes **48/48** cases (24 at each DPR).

Current ribbon measurements (percent exact RGB difference after the retained icon
exclusions; each column names host width in CSS pixels):

| Tab | DPR 1, 1280 | 1024 | 640 | DPR 2, 1280 | 1024 | 640 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 0.069 | 0.090 | 0.044 | **0.603** | **0.784** | **0.752** |
| Insert | 0.152 | 0.196 | 0.144 | **0.772** | **0.996** | **1.029** |
| Page Layout | 0.193 | 0.232 | 0.125 | **1.469** | **1.597** | **1.159** |
| Formulas | 0.007 | 0.009 | 0.054 | **1.547** | **1.578** | **1.051** |
| Data | 0.257 | 0.331 | 0.055 | **1.187** | **1.525** | **1.092** |
| Review | 0.006 | 0.008 | 0.353 | 0.265 | 0.337 | **0.711** |
| View | 0.146 | 0.188 | 0.055 | **1.502** | **1.924** | **0.913** |
| Settings | 0.006 | 0.008 | 0.056 | 0.481 | **0.612** | **0.980** |

The default Format Cells Number dialog is **0.452%** at DPR 1; conditional formatting
remains **0.040%**. The number-format menu's existing DOM/pixel test also passes.

Final validation: workspace build, typecheck, lint and **647 unit tests** pass
(39 in Designer). The expanded browser suite is **59 passed / 21 failed** over
80 tests: **52/52 original comparisons** and four new functional regressions pass;
the 21 failures are DPR 2 ribbon pixel gates.

**M6b remains incomplete.** The functional gaps in the coverage table below —
including context menus, printing/themes, threaded comments, plugin entry points,
extra Format Cells controls and Cell Styles previews — are still open. The current
DPR 2 evidence must not be described as a passing HiDPI verification. No core source
was changed and no commits were made. Fresh final counts and all per-case values
are retained in `test-results/designer/m6b-summary.json` and the comparison artifacts.

## Earlier M6b review — incomplete

Reviewed commit `a1624a2` on 2026-11-07. M6b is **not complete**. The sections below
describe the earlier baseline; the continuation above and this coverage table record current boundaries.
Shell presence, stored metadata and passing core type declarations do not establish
full command or dialog compatibility.

| Area | Working / retained | Remaining gaps |
| --- | --- | --- |
| Adaptive ribbon | All eight tabs have observed collapse rules; a descending 1920–500 sweep compares every group against the trial. Collapsed groups expose their controls. | Custom-config adaptation, full popup layout coverage and DPR 2 pixel parity. The continuation implements narrow tab scrolling and corrects DPR 1 collapsed captions. |
| Icons | Hand-authored SVGs for every configured icon class, including chart previews, sparklines, page layout and viewport commands. Unit coverage renders 16px/32px variants; ribbon large boxes follow the trial's 24px size. See `packages/spread-sheets-designer/ICONS.md`. | No claim of complete perceptual icon fidelity or DPR 2 browser verification. Some commands share artwork; cell-type gallery previews remain simplified. |
| Shell / launchers | Formula panel is 37px; sheet origin matches y=179 at 1280×720. Font, Alignment and Number launchers open the corresponding Format Cells tab. Launcher arrow is independently drawn. | Page/sheet launchers open the four-tab Page Setup dialog (task 7). |
| Home | Existing clipboard, font, alignment, formats, tables, CF and editing actions retained. Cell Styles crash fixed. Undo uses before/after snapshots with a stable originating-sheet key. | M6a editor/template/advanced CF dialog gaps remain. Sheet insertion/deletion and workbook-level changes are not covered by the sheet snapshot bridge. |
| Insert | Table and hyperlink dialogs, checkbox insertion; all visible main groups and chart/sparkline entry menus retained. Chart launchers are disabled without a usable chart module. Picture (in/over cells), shape gallery + drag placement + selection/resize/rotate/text/hyperlink/grouping, camera shape, form controls, text boxes, sparkline gallery + Create Sparklines dialog and the barcode dialog are implemented against the trial (see "Insert tab (task 3)" below). The contextual **Shape Format** ribbon tab and the real barcode encoders are delivered by task 8 (see its section). | Pivot/slicer modules are absent from this trial configuration. Sparkline types outside the formula set report `NotImplemented`. Table range/header editing is functional (drag handle + dialog) but not yet conformance-tested. |
| Formulas | Category lists, formula-bar insertion, Insert Function dialog, Name Manager listing/editing/deletion, workbook/sheet scopes and New Name, calculation mode selection and calculate actions, Show Formulas option. | Function lists/search/category filtering are incomplete; More Functions does not expose all functions. Name Manager table filters and undo coverage remain incomplete. Formula editor panel is explicitly unsupported. Calculation options need differential tests. |
| Data | Selection sort/filter, validation creation/removal, duplicate compaction, explicit grouping/ungrouping, show/hide detail, text splitting and a subtotal entry dialog. | Sort has a simplified header heuristic and one sort level. Validation now has the trial's four tabs; highlight icon/position controls and full dialog layout parity remain incomplete. Duplicate column selection is not implemented. Text-to-columns is a single-step delimiter split, without quoted fields or fixed-width mode. Subtotal handling is incomplete; Auto Outline reports `NotImplemented`. Data Binding / What-If modules are absent. |
| Page Layout | Groups and menus; view gridline/header toggles; every print setup command writes through `sheet.printInfo()` / `isPrintLineVisible()` / page-break setters / `backgroundImage()` and the ribbon state reads it back (task 7). Themes/Colors/Fonts galleries apply through `sheet.currentTheme()`; Print Area (with the `Print_Area` defined name), Breaks with drawn print lines, Print Titles via the Page Setup "Sheet" tab and `Workbook.print()` are wired. | The trial's Margins/Size dropdowns are canvas-drawn galleries (no DOM rows) while ours use DOM rows with the same items. Watermarks, full header/footer design and a print-preview pane remain unimplemented. |
| Review | Legacy comment editing/deletion/navigation; protection dialogs callable from Home/context menu; basic unpassworded protection stores public option names. | The trial ribbon uses threaded comments, while ours uses legacy notes. Show Panel, password-based sheet protection and workbook-structure enforcement explicitly report `NotImplemented`; passwords are not stored in sheet options. No extra Protect ribbon group was invented: it is absent in the observed trial configuration. |
| View | Header/gridline/tab/new-tab toggles, zoom dialog/default zoom, leading/trailing freeze and unfreeze actions. | Zoom-to-selection needs conformance work. Focus Cell, Selection Pane, Command Palette and the formula editor panel report `NotImplemented`; no new-window command was observed. No formula-bar visibility toggle was observed in this trial's View tab. |
| Settings | Spread/sheet dialog entry points and a small subset of live options. | Dialog layouts and option coverage differ substantially; scrollbar controls do not reproduce the trial. |
| Context menus | Entry lists, order, separators, submenu contents and enablement now match the trial in every observed context (plain cell, cell in table, row header, column header, corner, cell after copy/cut, cell in table after copy, sheet tab, chart, shape) — `apps/designer-compare/test/context-entries.spec.ts`. Placement (task 9): menus open at the pointer, flip above/left on overflow, clamp to the grid-host top and are never scroll-clipped — see "Context-menu placement and height (task 9)" below; `test/context-menu-placement.spec.ts` compares the menu rectangle at four grid corners on both sides within 4px. The Paste Options icon row has the trial's six buttons and each one pastes with its own mode; the Paste Special dialog has the trial's 11 paste options, 5 operations, skip blanks/transpose. Submenu entries act on the model with the trial's semantics (Table ▸ Totals Row / Convert to Range with the confirm dialog, Insert ▸ Table Rows Above, Delete ▸ Table Rows — band-scoped row shifts that keep the sheet row count — Insert Copied Cells ▸ Shift Cells, Sort ▸ A→Z / Z→A, chart/shape Bring/Send z-order). Every dialog entry opens a working dialog (task 61, see "Context menus (task 61)" below). | The trial's `Format Plot Area...` variant and full per-run rich-text editing remain simplified; the trial's Create Cell Template / Paste Link behaviour has no equivalent in this build, and the trial merges charts into `shapes.all()` while our core keeps the collections separate (z-order compared per collection). |
| Format Cells | All ten tabs editable. No-change OK preserves styles; only edited fields apply. Numeric validation operators, font styles, border clearing and padding string shape corrected. Cell Button supports add/delete/reorder; Decoration uses corner-fold/icon structures; Mask uses public pattern/placeholder/exclusion fields. | The four extra tabs remain partial UI implementations. Label options, full button/image controls, mask examples/keyword list and rendering of padding/buttons/decoration/masks in core are not implemented. Number options and mixed-selection semantics need broader tests. Template introspection still differs from the custom rendered body. |
| Cell Styles | All built-in style sections, tile labels and order now match the trial (paired spec `cell-styles-tiles.spec.ts`). The ten cell-type tiles register the trial's workbook named styles (`colorPicker-cellbutton` … `clear-cellbutton`, identical `cellButtons`/`dropDowns`/`formatter` JSON) and point the selection at them through `parentName`; the cell type is left untouched like the trial. `New Cell Style...` opens the "Style" dialog with the same auto name and creates a workbook named style that appears as a Custom tile and applies through `parentName` (verified paired, task 63). | Custom-tile previews are plain label chips; the applied gallery buttons' dropdown editors (calendar/color/slider popups) are not implemented yet. |

### Collapse measurements

Widths are **host CSS pixels**, at DPR 1, the default config and English labels.
Each entry is the last width at which the named group is collapsed. Prior research
in `.probe/adaptive-thresholds.mjs` measured adjacent 1px boundaries; the retained
Playwright sweep verifies both implementations in descending 50px steps plus 500px.
Review and Settings do not collapse between 1920 and 500.

| Tab | Collapse order / width at or below |
| --- | --- |
| Home | Editing 1566 → Cells 1408 → Styles 1296 → Number 982 → Alignment 913 → Font 693 → Clipboard 531 → Undo 504 |
| Insert | Controls 829 → Illustrations 757 → Charts 606 |
| Page Layout | Sheet Options 1178 → Scale to Fit 988 → Background 894 → Page Setup 782 |
| Formulas | Calculation 1088 → Formula Auditing 954 → Functions Library 872 |
| Data | Outline 897 → Data Tools 821 → Sort & Filter 671 → Queries & Connections 520 |
| View | Viewport 998 → Zoom 908 → Show/Hide 788 |

### Review findings and validation

The interrupted WIP added no corresponding unit tests and regressed the existing
Cell Styles browser test. Review fixed a null style dereference; an unbounded
duplicate-removal loop (the trial compacts only the selected rectangle and keeps
row count/unrelated cells); mismatched validation operator values; failure to clear
validators for Any Value; Clear Filter toggling the filter off; unreachable
protection handlers; stale dialog state and batched field updates; formatting
defaults overwriting untouched tabs; invalid padding/mask/decoration shapes; and
silent command fallthrough. Unsupported dispatcher actions now throw explicit
`NotImplemented: Designer command …` errors. Known partial actions in the table
above are not counted as complete implementations.

Clean-room review found independently authored vectors and handwritten config/
templates. Probe screenshots and DOM/public-API measurements remain ignored research
artifacts. No official implementation JavaScript, stylesheet contents, resources,
sprites or raster pixels were copied into source. No core package source was changed.
Default trial loading is unchanged; `?side=official&plugins=none` separately omits
optional imports to observe absent-module behavior. It disables chart launchers;
barcode, sparkline, picture, shape and camera entry points remain enabled, so a generic
missing-plugin message is **not** claimed as trial-compatible behavior for those commands.

New regression coverage includes selection-bounded duplicate compaction, validation,
filter clearing, outline expansion/collapse, pane freezing, live visibility options,
public style metadata, unsupported actions, password rejection, icon coverage, dialog no-change/cancel,
launcher selection, Name Manager state and undo/redo after switching sheets.

The visual gates retain the 1px DOM tolerance and 0.5% pixel threshold. New
multi-width tests exclude icon artwork and the trial-only license tab; they do not
mask differing text, backgrounds or controls. The older Home gate remains intact.
The number-format menu now has a pixel assertion as well as its existing DOM gate.
Fresh measurements and remaining failures are recorded below after validation.


Earlier review validation on 2026-11-07 (before this continuation): `pnpm -r build`, `pnpm -r typecheck`,
`pnpm -r test` (**641 tests**, including 33 Designer tests), and `pnpm lint` pass.
The final compare app rebuild also passes; Vite retains its bundle-size warnings.
`pnpm --filter @opensheets/designer-compare test:visual`: **38 passed, 14 failed**
over 52 tests. All 19 original browser tests pass, including the newly asserted
number-menu pixel gate. The new resize sweep and paired duplicate/add-on regressions pass.

**23/24** group/control/launcher DOM comparisons pass; Page Layout at 1280 differs
in five Sheet Options control boxes. **11/24** tab pixel comparisons pass.
Values below are exact RGB difference after icon exclusions, at DPR 1. Bold values
fail the unchanged 0.5% limit. The 640px tab rail, collapsed captions/arrows, Page Layout
controls and Data enablement/text remain visible differences.

| Tab | 1280 | 1024 | 640 |
| --- | ---: | ---: | ---: |
| Home | 0.069% | 0.090% | **1.088%** |
| Insert | 0.461% | **0.595%** | **2.106%** |
| Page Layout | **1.356%** | **2.177%** | **3.440%** |
| Formulas | 0.007% | 0.009% | **1.490%** |
| Data | **0.748%** | **0.963%** | **1.133%** |
| Review | 0.216% | 0.275% | **1.876%** |
| View | 0.146% | 0.188% | **1.640%** |
| Settings | 0.307% | 0.391% | **1.604%** |

- Format Cells: **0.572%**; fails the 0.5% gate.

- conditional-formatting: **0.040%**; passes.

The conditional-formatting result is measured at 1280 after opening the collapsed
Styles group. Format Cells covers the entire 678×577 default Number dialog, with
no exclusions for ribbon icons occluded behind the modal. Remaining dialog differences
include border coverage, close glyph, tab text and footer rasterization. Other Format
Cells tabs are functionally partial and are not claimed to pass a pixel gate.

A separate menu-scoped probe measured the number-format menu at **0.017%**; its
retained browser DOM/pixel test passes. The full Cell Styles preview and other tab
dialogs are not pixel-gated. Browser verification of icons at DPR 2 remains pending.

Artifacts: `test-results/designer/m6b-summary.json`, and each case under
`test-results/designer/artifacts/` contains JSON measurements plus official/ours PNGs.
These are ignored outputs, not source assets. No thresholds were loosened, scenario
content added to dilute ratios, or differing non-icon regions masked. The new precision
test scopes exclusions to its captured surface, so occluded ribbon icons cannot hide
dialog pixels. Lint ignores the inherited gitignored `.probe` research directory;
production source remains linted.

**Definition of done: not met.** The remaining visual failures and functional gaps
above must be resolved before calling this milestone complete. No core source changes
and no commits were made in this review.


## Scope delivered

The milestone adds a framework-agnostic Designer that is consumed through npm aliases and exposes
the public `GC.Spread.Sheets.Designer` namespace:

- `packages/spread-sheets-designer` — React 18 implementation, bundled internally, published as
  `@opensheets/spread-sheets-designer`. The vanilla `new GC.Spread.Sheets.Designer.Designer(host)`
  API works without the host application importing React.
- `packages/spread-sheets-designer-react` — `<Designer config styleInfo spreadOptions
  designerInitialized className />` wrapper.
- `packages/spread-sheets-designer-resources-en` — English labels consumed by `setResources`
  (and registered on import just like the official resource package).
- `apps/designer-compare` — the official 19.2.5 trial and this implementation in one Vite app,
  selectable with `?side=official` / `?side=ours`, plus the black-box Playwright gates.

### Architecture

- `designer.ts` owns the public `Designer` class, the workbook, command registry, undo bridge,
  config/resources/theme state, dialog registry and the React root.
- The workbook lives in a stable host DOM node (`sheetHost`) that is appended under the React sheet
  area. Workbook events only bump a version counter; React re-renders ribbon/formula/status UI on
  the next animation frame. Canvas rendering remains entirely in the core package.
- `config.ts` authors the default config and toolbar config. `config-merge.ts` merges user
  configurations; arrays (the ribbon) are replaced and objects (the command map) are merged.
- `app.tsx` renders the config-driven ribbon, groups, large/small buttons, split buttons,
  dropdown menus, galleries, name box/formula bar, status bar and File backstage.
- `commands/actions.ts` contains the workbook mutations. Mutating ribbon actions are routed through
  the workbook command manager with a full-sheet JSON snapshot for undo/redo; the snapshot is
  created before the action and stored in the command options, so the workbook's own undo stack is
  the single source of truth.
- `dialogs/` implements the template renderer (`Container`, `ColumnSet`, `Column`, `TextBlock`,
  `TextEditor`, `NumberEditor`, `ComboBox`, `CheckBox`, `Button`, `List`, `TabControl`, `GroupBox`,
  `ColorPicker`, `LineStylePicker`, `BorderPreview`, `FindResults`, and the custom
  `NumberOptions` component). `registerTemplate`, `getTemplate`, `showDialog` and `closeDialog`
  operate on a process-wide registry; validation runs before success callbacks.
- Formula bar: the core package does not yet contain the public `FormulaTextBox`/`NameBox` widgets,
  so minimal name box and formula box controls are built inside the designer package. They use the
  workbook events, support A1 reference navigation and commit values/formulas through an undoable
  command. This gap is recorded in `STATUS.md`.

### Ribbon/config coverage

The default config reproduces the trial's main tab ids and order (`home`, `insert`, `pageLayout`,
`formulas`, `data`, `review`, `view`, `settings`), and the Home group ids/labels/order/command names:
Undo, Clipboard, Font, Alignment, Number, Styles, Cells, Editing. Users can remove a tab by id,
append commands to a group, add commands to `commandMap`, and override `execute`/`getState`; the
renderer resolves every control through the active command map. The Editing group collapses into the
trial's popup button at the tested width.

`ToolBarModeConfig` contains a 50px ribbon with five compact Home groups. `setConfig` switches modes
and the tab bar stays visible as in the trial.

### Home tab

| Area | Implemented |
| --- | --- |
| Clipboard | Paste gallery (all/formulas/values/formatting/transpose/link options), cut, copy, format painter with armed state |
| Font | family, size, grow/shrink, bold, italic, single/double underline, borders menu, fill and font colour palettes |
| Alignment | top/middle/bottom, left/centre/right, orientation, wrap, indent, merge/unmerge |
| Number | format combo (General/Number/Currency/Accounting/date/time/percentage/fraction/scientific/text), percent, comma, decimal increase/decrease, more formats |
| Styles | conditional-formatting menus wired to the M4 CF model (highlight, top/bottom, data bars, colour scales, icon sets, clear rules), Format as Table gallery, Cell Styles gallery |
| Cells | insert/delete rows, columns and sheets; row/column auto-fit, hide/unhide, lock/unlock; `Insert Cells...`/`Delete Cells...` shift selected cells |
| Editing | AutoSum and functions, fill directions, clear variants, sort, filter, find/replace |

All commands operate on the selection and reflect state through workbook subscriptions (bold,
alignment, wrap, merge, number format, colours, undo/redo, format painter, etc.). Everything that
mutates a sheet is undoable through `workbook.commandManager()` / `workbook.undoManager()`.

### File tab

The backstage reproduces the trial layout (left category rail, back button, selected category,
generated Blank preview, title and footer). Implemented now:

- New (Blank template) resets the workbook.
- Open accepts `.ssjson`, `.sjs` and JSON and calls `workbook.fromJSON`.
- Save / Save As download the workbook JSON.
- Import, Export and Print show the documented plugin/placeholder message because the IO, PDF and
  print plugins are outside M6a.

### Dialogs

- Format Cells: Number, Alignment, Font, Border, Fill and Protection are editable and applied to the
  selection with undo. Cell Button/Padding/Decoration/Mask have partial editors; the coverage table above records their remaining controls and rendering gaps.
- Find and Replace: Find Next/Find All/Replace/Replace All over values or formulas, sheet or
  workbook, rows/columns, case/exact/wildcard options, results list and selection navigation.

### Themes/resources

`getTheme`/`setTheme` accept the public `ITheme` token set and write the `--sjs-*` custom properties
on the host. Light/dark styles use the same token names; `setTheme(null)` restores the trial defaults.
`getResources`/`setResources` merge nested English labels; the resources package imports and
registers the visible labels. `ThemeTokens`, `MessageBox*`, `FileType`, `CommandNames` and
`TemplateNames` are exposed from the public namespace (the full name tables are generated from the
observed public runtime API, not source).

## Tests and gates

Unit tests:

- `packages/spread-sheets-designer/test`: config merge/ids, command mutations (font, alignment,
  formats, merge, insert/delete, tables, conditional formatting, undo flags), dialog templates,
  resources.
- `packages/spread-sheets-designer-resources-en/test`: exported labels and registration.

Black-box Playwright gates in `apps/designer-compare/test` (run with
`pnpm --filter @opensheets/designer-compare test:visual`). Both sides use the same Vite page,
1440x800 viewport and the same workbook script (values, formulas, widths, selection).

- Ribbon DOM: every main tab (excluding the trial-only license tab), tab boxes and font weights,
  file button, group boxes/labels, and every Home control's label, enabled state and box are compared
  within 1px.
- Ribbon pixels: content gate **0.075%** masked (gate 0.5%), excluding icon boxes by the icon rule and
  the trial-only "SpreadJS Designer License" tab. Recorded icon boxes are also compared for size and
  position.
- File backstage: category/rail layout, title start, back button and pixel gate **0.365%** (gate
  0.5%). Excluded masks: icons and the generated blank-workbook preview.
- Font family and number format combo menus: menu box, every item label/box within 1px, font menu
  pixel gate 0% (icons masked).
- Format as Table gallery: section labels/heights and the 60 theme tile boxes match the trial within
  1px; the Cell Styles gallery sections are exercised and applied.
- Home commands, File New/Open/Save, Format Cells application, Find/Replace, toolbar mode and theme
  switching are functional Playwright tests.

Current remaining gates and functional gaps are recorded in the coverage table and
continuation above. The default Format Cells Number dialog, number-format menu and
conditional-formatting menu have DPR 1 pixel assertions. The full Cell Styles
preview set and other Format Cells tabs are not pixel-gated. DPR 2 tab comparisons
are retained as failing tests where the unchanged 0.5% limit is exceeded.

## Insert tab (task 3) — what was verified against the trial (black box)

Facts below were read from the trial's runtime DOM / public API (`?side=official`,
127.0.0.1:5211) and are encoded in unit tests so they do not have to be re-measured:

- **Shape gallery**: 8 groups with exactly 9 / 9 / 71 / 27 / 6 / 28 / 20 / 16 items = **186**
  `insert-shape-item-<preset>` entries in that order (`shapeGalleryGroups`). Panel is 350px wide
  (340 content), group title 22px (700 12px/15.6px), cells 28x28 with 20px icons, except the
  Lines group: 24x24 cells with 16px icons; `gc-list-control-group` / `-group-text` /
  `-item-wrap.gc-list-alignment-horizontal` / `gc-list-control-item` / `gc-list-control-item-icon`
  DOM nesting.
- **Sparkline gallery**: 490px panel, `gc-designer-group` + `-title` (20px) + `-content`, cells
  56x52 with 50x50 `ribbon-button-sparkline-<kind>` icons; groups 2 / 8 / 1 / 2 / 2 / 8.
  Kind suffixes follow the trial (`gaugeKPI`, `lollipop-variance`, `spread`, …).
- **Form Controls gallery**: 200px panel, single "Form Controls" group, 31x24 cells with 20px
  `insert-form-control-item-<id>` icons, order button, combobox, checkbox, spinbutton, listbox,
  optionbutton, groupbox, label, scrollbar.
- **Camera shape**: dialog 244x159 ("Create camera shape" / "Where is the data for your camera
  shape?"), pre-filled with the current selection. The created shape is named `Picture N`,
  **placed on the current selection** and **sized to the referenced range**, and stores the
  reference as `=Sheet!<as typed>` (no forced `$`).
- **Barcode dialog**: 660x393; QR column order matches the trial; the submitted formula is
  byte-identical to the trial's, e.g.
  `BC_QRCODE("Hello Barcode","#000","#FFF","L",2,"auto","auto",FALSE,0,,"UTF-8",,,,)` (15 args).
- **Create Sparklines dialog**: 349x248 with the two group boxes; LINE/COLUMN/WINLOSS write one
  formula per row (`=LINESPARKLINE(B2:E2,1)`), formula kinds write a single cell.
- **Shape context menu** (single AutoShape): Cut, Copy, Group▸(Group, Ungroup),
  Bring Forward▸(Bring Forward, Bring To Front), Send Backward▸(Send Backward, Send To Back),
  Format Shape..., Link..., Save as Picture — 190px, 26px rows, **no separators**, and with one
  shape both ordering submenus are disabled. Pictures add Place in Cell / Reset Picture & Size /
  Change Picture.
- **Core shape API** now follows the public `GC.Spread.Sheets.Shapes` surface: `new Shape(sheet,
  name, autoShapeTypeOrModel, left, top, width, height)`, `shapes.add(name, type, …)`,
  `addCameraShape`/`addPictureShape`/`addFormControl(name, FormControlType, …)`/`addConnector`,
  `group(Shape[]) -> GroupShape`, `ungroup(GroupShape)`, `zIndex(name, index)`, and on the shape
  `type/rotate/isTextBox/adjustments/style/canPrint/showHandle/getFormula/setFormula/toImageSrc(Async)`;
  `CameraShape`, `PictureShape`, `FormControlShape`, `ConnectorShape`, `GroupShape` and
  `ShapeStyle` are real classes (no `NotImplemented` fallbacks left in this namespace).
  Gallery/format painting lives in `@opensheets/spread-sheets/dist/gc.spread.sheets.internals.js`
  so the designer bundles do not inline the GC runtime.

Still open for this tab: the contextual Shape Format ribbon tab and the real barcode encoders
were delivered by task 8 (see its section); still open are trial-faithful caption/name defaults
for form controls ("Check Box" shape, "CheckBox 1" caption),
text-box naming (`rectangle N` today), and paired Playwright specs per insert feature. During
manual poking a stray cell value ("460") was seen painted over the sheet area near inserted text
boxes; it was not reproducible from the model and is not covered by any spec — worth a look when
the shape/picture repaint paths get their paired specs.

## Context menus (task 61) — what was verified against the trial (black box)

Round 1 collected the entry lists (`.probe/t6/OFFICIAL-MENUS.md`, `menus*.json`); round 2
measured the dialogs the entries open (`.probe/t6/titles*.json`, `dialogs-pair.json`,
`paste-row*.json`, `t2-*.png`, `t3-*.png`) and made our menus match; round 3 measured the
model semantics of the Table/clipboard submenu entries (`.probe/t6/t3-truth*.json/.ts`) and
reimplemented them, fixed the submenu anchoring and paired-tested the z-order actions.
All of the following is runtime observation through the public API / rendered DOM — nothing was
read from the official bundles.

**Dialogs opened by context-menu entries (trial title, measured size, contents):**

| Entry | Trial dialog | Size |
| --- | --- | --- |
| `Insert...` (cell) | `Insert`: radios Shift cells right / Shift cells down / Entire row / Entire column | 228×257 |
| `Delete...` (cell) | `Delete`: radios Shift cells left / Shift cells up / Entire row / Entire column | 228×257 |
| `Paste Special...` | `Paste Special`: Paste = All, Formulas, Values, Formats, Comments, Validation, All using Source theme, All except borders, Column widths, Formulas and number formats, Value and number formats; Operation = None, Add, Subtract, Multiply, Divide, Transform; Skip blanks, Transpose; buttons Paste Link / OK / Cancel | 401×328 |
| `Rich text...` | `Rich Text Dialog`: font family + size editors over the edit surface | 668×432 |
| `Default Value...` | `Default Value Dialog`: `The default value:` editor | 313×129 |
| `Tag...` (cell, corner) | `Cell Tag Dialog`: Tag textarea + OK / Cancel / **Clear** | 334×191 |
| `Tag...` (row / column header) | `Row Tag Dialog` / `Column Tag Dialog` (same body, different title) | 334×191 |
| `Define Name...` | `New Name`: Name, Scope, Refer to, Comment | 388×291 |
| `Link...` | `Hyperlink`: Text to display, ScreenTip, Target, Link Color/Reset, Visited Link Color/Reset, tabs Web Page / This Document / Email Address, Address, buttons Remove / OK / Cancel | 438×529 |
| `Transform Cells...` | `Transform Cells`: `Formula:` `= LAMBDA( x, … )`, `Scope: By Cell` | 414×168 |
| `Create Cell Template...` | **the trial opens no dialog in this build** (only the menu stays up) | — |
| `Row Height...` / `Column Width...` | `Row Height` / `Column Width`: current size prefilled | 231×122 / 244×122 |
| `Headers...` | `Header Cells`: tabs Row Header / Column Header over ForeColor, BackColor, BorderLeft/Right/Top/Bottom, DiagonalUp/Down, BorderRadius (`0 0 0 0`), Font, Formatter, HAlign, VAlign, TextIndent, Locked, WordWrap, ShrinkToFit, Vertical Text, Value | 738×717 |
| `Table ▸ Convert to Range` | Confirm box: title `SpreadJS Designer`, `Do you want to convert the table to a normal range ?`, OK / Cancel (only OK converts; values and styles are kept) | — |
| `Outline Column...` | `Outline Column`: Show Indicator, Show Image, Custom Indicator Image, Show CheckBox, Max Level | 377×189 |

**Paste Options icon row** (`{group}` in every clipboard context): six buttons with 24×24 icons and
the tooltips `Paste All`, `Paste Formula`, `Paste Value`, `Paste Formatting`,
`Values & Formatting`, `Formula & Formatting` (trial classes `gc-spread-pasteAll`,
`-pasteFormula`, `-pasteValues`, `-pasteFormatting`, `-pasteValuesFormatting`,
`-pasteFormulaFormatting`). Our row uses the same ids/order and our own hand-drawn SVGs.

**Measured paste semantics** (paired spec, both sides, values + formula + formatting fixture):

- `Paste All` → value/formula **and** formatting.
- `Paste Formula` / `Formula & Formatting` → cells **without** a formula are left untouched (the
  trial does not fall back to the value); `Formula & Formatting` additionally writes the format.
- `Paste Value` → computed value, no formula; `Values & Formatting` → value **and** format.
- `Paste Formatting` → style only, the target value stays as it is.
- Row/column header menus: `Insert`/`Delete`/`Hide`/`Unhide` operate on the clicked header
  (`Row Height…` prefills the current height, `Column Width…` the current width).
- `Insert Copied Cells… ▸ Shift Cells Right|Down` shifts the target cells and pastes the copy.

**Our implementation** (`packages/spread-sheets-designer`):

- `src/context-menu-items.ts` builds the per-context entries (data only, order = the trial's);
  `src/app.tsx` renders the menu, the submenu flyouts, the tab menu and the paste icon row.
- Dialogs live in `src/dialogs/templates.ts` and are rendered by `src/dialogs/DialogHost.tsx`;
  radios that belong to one group share a `bindingPath` + `value`, so only one can be selected.
- The paste modes are implemented in `src/commands/actions.ts:pasteClipboard(d, mode, options)`
  (`all`, `formulas`, `values`, `formatting`, `values-format`, `formulas-format`,
  `values-numberformat`, `formulas-numberformat`, `source-theme`, `no-borders`, `column-widths`,
  `comments`, `validation`, `transpose`) plus the `operation` (add/subtract/multiply/divide) and
  `skipBlanks` options; the six buttons and the Paste Special dialog both go through it.
- `Headers…` writes through the undoable `applyHeaderStyle` action (value + the header cell style);
  `Tag…` on a header/corner writes the tag of that header cell; `Clear` removes the tag property
  (the trial leaves no tag behind).

**Specs:** `apps/designer-compare/test/context-entries.spec.ts` (entry/submenu parity in ten
contexts including "cell in table after copy", the six paste buttons, twelve model-parity cases
and the chart/shape z-order submenu actions),
`apps/designer-compare/test/context-dialogs.spec.ts` (dialog title/size/labels vs the trial and
"OK reaches the model" for every dialog), plus the earlier `context-tag`, `context-dimensions`,
`context-tab-*` and `context-placement` specs. Unit tests:
`packages/spread-sheets-designer/test/context-menu-items.test.ts`, `test/paste-modes.test.ts` and
`test/table-actions.test.ts` (the trial's Table-row band-shift, Totals Row defaults, Convert to
Range keep-all and Insert-Copied-Cells semantics).

**Trial table/clipboard semantics measured this round** (`.probe/t6/t3-truth*.json`):
- `Insert ▸ Table Rows Above`, `Delete ▸ Table Rows` and `Table ▸ Totals Row` shift rows only
  within the **table's own column band**: cells in other columns keep their addresses (their
  formula references still adjust, references into a removed band become `#REF!`) and the sheet
  row count does **not** change. Implemented as `Worksheet._shiftRowsInColumns` /
  `_shiftColumnsInRows` (a `SparseGrid`/`CellStore`/`ValueGrid` shift with a cross-range filter
  plus a `cross`-gated `adjustRefsForStructure`).
- `Table ▸ Totals Row` writes `"Total"` under the first column and a live
  `SUBTOTAL(109,[<LastColumnHeader>])` under the last; the inner columns are empty. Requires the
  unqualified `[Column]` structured reference, now parsed and resolved to the table that contains
  the formula cell.
- `Table ▸ Convert to Range` first asks `Do you want to convert the table to a normal range ?`
  (title `SpreadJS Designer`, OK/Cancel) and only on OK removes the table, keeping values and
  styles (`tables.remove(name, keepAll)`).
- `Insert Copied Cells ▸ Shift Cells Down/Right` shifts only the copied rectangle's column/row
  band and pastes content + formatting; the target cell must be outside a table (the trial
  suppresses the entry inside one, and our menu matches).
- The grid context submenus are anchored to their parent item (`.gc-designer-context-item` is now
  `position: relative`), fixing the round-2 bug where a flyout opened at the menu top and a real
  click missed it.

### Known gaps

- The trial's charts plugin also registers charts in `sheet.shapes.all()` (one merged z-order
  list) while our core keeps `charts` and `shapes` separate; the z-order paired spec therefore
  compares chart order via `charts.all()` and shape order via the non-chart entries of
  `shapes.all()` (documented normalization, not a threshold change).
- The trial's chart menu shows `Format Plot Area…` in one selection state (`menus:chartGroup`);
  we always show `Format Chart Area…`.
- `Paste Link` pastes the copied range once and tells the user a live link is not supported;
  the trial keeps a live link.
- `Create Cell Template…` has no counterpart in the trial build, so its dialog (and the
  workbook-level `_cellTemplates` record it writes) is our own design, not a match.
- `Rich text…` edits the text and the cell font as a whole; per-run rich text is not modelled.
- `Header Cells` reproduces the trial's property list and size; the live header preview is missing.
- `Outline Column…` stores its options on the worksheet; the core does not draw the outline
  indicator column yet.

## Page Layout: finish wiring to the core (task 7) — what was verified against the trial (black box)

- The Designer-local `pageSetup(d)` store is gone: Scale-to-Fit combos, Orientation,
  Margins presets, paper sizes, print gridlines/headings, Print Area Set/Clear,
  Breaks (Insert/Remove/Reset All), PrintLineVisible and the background
  Repeat/Over-Content commands all write through `sheet.printInfo()`,
  `sheet.isPrintLineVisible()`, `sheet.setRowPageBreak/setColumnPageBreak` and
  `sheet.backgroundImage()`; the ribbon state reads them back
  (`Designer.getCommandState` / `commandEnabled`). Unit tests:
  `packages/spread-sheets-designer/test/page-layout-commands.test.ts` (13).
- Trial `printInfo()` model semantics (probed live on the official page) are now
  reproduced in `packages/spread-sheets/src/print.ts`:
  - `printInfo().toJSON()` is public and serialises only explicitly assigned
    fields plus the always-present `paperSize`.
  - `margin()` stores the assigned object **verbatim** — a partial assignment
    replaces the previous one and the getter returns it un-merged; `toJSON`
    emits it as-is and omits it when it deep-equals the default margins;
    deserialisation (`_fromJSON`) merges partials into the defaults, so the
    getter then returns the full record (observed both ways in the trial).
  - Plain scalar setters **un-dirty** a field when the value equals its default
    (`showGridLine(false)` / `orientation(1)` disappear from `toJSON`), except
    `firstPageNumber`, where assigning the default 1 persists (its serialisation
    baseline is "auto" — verified live).
- Print area: Set writes `rowStart/columnStart/rowEnd/columnEnd` of the
  selection through `printInfo()` and both sides persist it as the sheet-scoped
  `Print_Area` defined name (range fields never inside the `printInfo` object);
  Clear resets all four to -1 and removes the name.
- Breaks: Insert sets the row **and** column break at the active cell (disabled
  at the origin on both sides), Remove clears both, Reset All enumerates
  `pageBreak: true` row/column metadata and clears it (new
  `Worksheet._manualPageBreaks()` helper). The trial does **not** auto-enable
  PrintLineVisible on insert; break lines are drawn by `Painter._paintPrintLines`
  when the checkbox is on (screenshot-verified dashed lines, same colour/position
  family as the trial).
- Print Titles opens the Page Setup dialog on its "Sheet" tab;
  `repeatRowStart/End` and `repeatColumnStart/End` round-trip through the draft
  (unit test) and the dialog tab structure matches both sides (paired spec).
- Themes gallery: picking a built-in applies the **whole named theme** through
  `sheet.currentTheme(name)` — the trial stores the plain name (sheet JSON
  `theme: "Civic"`), the colour scheme is Civic and the font scheme is the
  theme's own (Civic → Georgia); it is *not* a custom-theme record (measured
  live; corrected the earlier colours-only assumption). Colors/Fonts galleries
  patch only that part into a `custom-theme` record.
- `ThemeFonts.<name>.toJSON()` per-scheme script fallback tables: built-ins and
  their clones serialise `bodyEastAsianFont: null` / `headingEastAsianFont: null`
  plus both `*FontScriptTypefaces` arrays; Office carries 30 entries (incl.
  `Geor`), the other 20 schemes carry their own 29-entry tables. All 21 tables
  were captured from the public `ThemeFonts.X.toJSON()` statics and are stored
  compactly in `FONT_DATA`/`FONT_SCRIPTS` (`packages/spread-sheets/src/themes.ts`);
  the paired spec compares them byte-identical.
- Print: the designer Print command delegates to `Workbook.print()` →
  `print-doc.ts` renders one page canvas per printed page into a hidden iframe
  and calls `window.print()` (unit-tested; no `NotImplemented` left on this path).
- Paired Playwright spec `apps/designer-compare/test/page-layout-model.spec.ts`
  (4 specs, real mouse both sides, canonicalised model JSON compared after each
  step): margins/orientation/paper/print gridlines/print headings/print lines,
  print area + `Print_Area` name, break insert/reset, Page Setup "Sheet" tab,
  Themes, Colors + Fonts galleries.

### Known gaps (task 7)

- `apps/designer-compare/test/precision.spec.ts` "Name Manager edits worksheet names" fails
  at a `selectOption` wait on the untouched HEAD tree too (verified by stash + rebuild) —
  pre-existing, outside task 7.

- The trial's Margins and Size dropdowns draw every preset row (labels included)
  into one canvas — there are no DOM rows — so the paired spec clicks those rows
  positionally (fractions measured live); ours renders the same items as DOM rows.
- Watermark settings, the full header/footer design editor (the dialog carries the
  basic strings) and a real print-preview pane are not implemented.
- Undo of Themes-gallery actions relies on the workbook JSON snapshot; the trial's
  theme undo keeps the built-in name exactly as ours does, but no dedicated paired
  undo spec exists yet.

## Cell Styles gallery: cell-type tiles (task 63) — what was verified against the trial (black box)

Reference dumps: `.probe/t6/styles-gallery.png`, `.probe/t6/t63-official-model.json`.

- Official gallery sections and tile labels (top→bottom, DOM order): *Color, DateTime and Other
  Cell Type Style* (Color, DateTime, DateRange, Time, Calculator / Month, Slider, NumberRange,
  OKCancel, Clear — 5 columns), *Good, Bad and Neutral* (Normal, Bad, Good, Neutral),
  *Data And Model* (9 tiles), *Titles and Headings* (6), *Themed Cell Style* (24 = 4×6),
  *Number Format* (5), then footers *New Cell Style...* and *Manage Cell States*. Our gallery now
  exposes the identical titles, labels and order (spec assertion 1).
- Official tile DOM: `.gc-list-control-item[data-command="ribbon.cellStylesListContent"]` with
  `data-value="<template name>"` (e.g. `colorPicker-cellbutton`); ours uses the same `data-value`
  payloads on `.gc-designer-cell-style-tile`. At the 1440px viewport both ribbons expose
  `ribbon.cellStyles .dropdown-btn` directly (at ≤1280 both collapse the Styles group into
  `ribbon.ribbonGroupId.ribbon-thumbnail-styles` with a flyout — same ids both sides).
- Applying a tile in the trial: `getStyle(r,c).parentName` = the template name, the cell type is
  untouched (`getCellType().toJSON()` stays `{typeName:'1', allowOverflow:true, editorType:1}`),
  and a workbook named style appears with `toJSON()` = `{name, formatter?, cellButtons[], dropDowns[]}`.
  All ten template JSONs match ours field-for-field, incl. the DateRange/NumberRange formatters
  and the monthpicker rule `stopYear = currentYear, startYear = stopYear - 10`. Resolved
  `getActualStyle` buttons/dropdowns/formatter are identical both sides (spec assertion 2,
  10 tiles × 2 sides, real mouse clicks in the ribbon gallery, cells H2..H11).
- `New Cell Style...`: the trial shows a "Style" dialog with a "Style name:" input prefilled
  `Style 1` and Format.../OK/Cancel; OK registers the active cell's resolved style as a workbook
  named style and the gallery gains a *Custom* section above the built-ins with a tile per named
  style; applying it sets `parentName` (spec assertion 3: auto name, Custom section position,
  tile label, `parentName` and resolved formatter all equal both sides).
- Core: `Style.toJSON()` (own defined fields, nested `toJSON` forwarded, deep copies) added in
  `packages/spread-sheets/src/primitives.ts` — needed for named-style comparison and export;
  unit-tested in `packages/spread-sheets/test/cell-extras.test.ts`.

### Known gaps (task 63)

- The trial materialises the previously *resolved* defaults (`hAlign`, `vAlign`, `themeFont`,
  `imeMode`) into the cell's local style JSON when a tile is applied (and old gallery buttons
  accumulate in the local style when a second tile replaces the first); ours keeps the local
  style to its previous *own* fields plus the new `parentName` — resolved model state
  (`getActualStyle`) is what matches the trial.
- Clicking a gallery-applied cell button in the trial opens the dropdown editor (calendar,
  colour picker, slider…); our dispatcher routes the button `command` to the designer but the
  picker UIs are not implemented yet (`openColorPicker` etc. are inert).
- Custom-section tiles render as label chips with the style's fore/back colour; the trial draws
  a live preview of the named style's borders/number format too.

## Insert tab gaps: barcode encoders + Shape Format tab (task 8) — what was verified against the trial (black box)

### Barcode encoders (`packages/spread-sheets/src/features/barcode*.ts`)
- CODE39, CODE93, CODE128 (automatic A/B/C subsets), GS1-128 (Start C + FNC1 + AI separator)
  and CODABAR are now real encoders written from the public symbology specifications, each with
  unit tests carrying reference module strings derived by hand from the spec tables
  (`packages/spread-sheets/test/barcode.test.ts`).
- DATAMATRIX implements ECC 200: smallest square symbol selection, the L finder pattern
  (solid left/bottom, alternating top/right), ASCII data codewords, Reed-Solomon over GF(256)
  and the spec's diagonal module-placement walk; a unit test round-trips codewords back through
  the placement.
- PDF417 implements numeric/text/byte compaction, the GF(929) error-correction generator
  (level-dependent 2^(level+1) codewords, checked against the ISO g2(x) = x^2 - 12x + 27
  example), start/stop guards and cluster-mod-3 row encoding.
- The cell renderer picks the real encoder per symbology; the fake `fallbackLinearModules` /
  `fallbackMatrix` paths now only serve CODE49.

### Shape Format contextual tab
- Trial observation (official designer, shape selected): the tab sits right of Settings and
  shows the groups **Insert Shapes** (direct mini-gallery of ~27 preset icons + dropdown),
  **Shape Styles** (six "Abc" quick-style buttons + scrollbar), **Accessibility** (Alt Text),
  **Rotate** (dropdown: "Rotate Right 90°", "Rotate Left 90°"), **Group** (Group / Ungroup),
  **Align** (dropdown), **Arrange** (direct split buttons "Bring Forward" and "Send Backward",
  **Size** button opening an inline dropdown panel with Height + Width text inputs, a
  "Lock aspect ratio" checkbox and a "Size" caption — the model updates on Enter), and
  **Format Pane** (tooltip "Display the Format Pane"; the Selection Pane button's tooltip is
  "Display the Selection Pane").
  The tab disappears (and focus returns to the previously active tab) when the selection ends.
- Implementation: `IRibbonPanel.contextual` marks the tab; `resolveRibbon` splits main vs
  contextual tabs (the documented main-tab list stays pure), and the ribbon appends the tab
  while `designer.hasSelectedShapes()`, auto-switching to it on selection and back to Home on
  deselect. Commands reuse the existing shape API surface (rotate/shapeType/fill/line/zIndex/
  group + align/size dialogs); the Size dropdown renders the same inline Height/Width panel.
- Paired spec `apps/designer-compare/test/shape-format.spec.ts`: real-mouse shape selection on
  both sides, compares the 8 group captions + 10 titled controls, and the model after
  Rotate Right 90° (rotation 90), Bring Forward (z-order list change) and Size→Width=200
  (width 200, height unchanged).

### Known gaps (task 8)
- CODE49 still renders the deterministic fallback grid (not scannable); a real encoder was left
  out to keep the change scope bounded.
- The trial's Barcode Dialog has **no** live preview panel (verified black-box: entering a
  value shows no canvas/img); the older "no barcode preview panel" gap note was wrong and has
  been removed.
- Our Insert Shapes control opens the full Insert-tab shape gallery instead of the trial's
  ~27-icon inline mini-gallery.
- Quick styles are six fixed Office-style fills; the trial's Style Gallery scroll behaviour and
  full style set are not reproduced.
- Bring to Front / Send to Back are reachable through the shape context menu (as in the trial's
  splits); the ribbon Arrange group only exposes the trial's two direct buttons.

## Context-menu placement and height (task 9) — what was verified against the trial (black box)

Bug fixed (supervisor, 2026-11-11, 1280×720): right-clicking a lower grid cell opened our
cell menu at y=0 with the `.gc-designer-ribbon-dropdown` 500px max-height clipping the last
entry (`Create Cell Template...`). The trial menu is never clipped.

**Trial placement rule** (measured live with synthetic `contextmenu` events + rect reads, and
recorded earlier in `.probe/t6/menus*.json`):

- The menu opens at the pointer (`x = pointerX`, `y = pointerY`).
- Vertical: when `pointerY + menuHeight > viewportHeight`, the menu flips up so its **bottom
  edge sits on the pointer**; if that would put its top above the spread host's top (measured
  y=179 at 1280×720 in the compare app), the top is **clamped to the host top** — tall menus
  therefore show at y=179 for any pointer in the lower half (pointers y=232/240/300/362/440/500
  all produced y=179 with h=522).
- Horizontal: when `pointerX + menuWidth > viewportWidth`, the menu flips left so its **right
  edge ends 51px past the pointer** (delta `pointerX − menuX = 197` measured at pointers
  x=1100/1120/1150/1160/1200 — independent of the menu's own width), and is additionally
  clamped to stay inside the window. Pointers ≤ x=1032 (1032+248=1280) do not flip.
- The trial cell-menu container has **no inner padding** (items start at x=1, y=1 — border
  only; 18 rows: 26px items + a 78px Paste Options block → 522px total at 1280×720).
  Our menu was 4px padded with a 62px paste block → 514px, outside the 4px gate.

**Implementation** (`packages/spread-sheets-designer`):

- `src/menu-placement.ts` — pure `placeMenu` / `placeSubmenu` helpers with the rules above
  (FLIP_RIGHT_OFFSET = 51); `src/app.tsx` positions the grid (cell/row/col/corner), tab,
  shape and chart menus and all open submenus from them in a layout effect, measuring real
  element sizes (the old hard-coded 380/418/438 heuristics are gone; the tuned Tab Color
  popup keeps its own measured shift-up effect).
- `src/styles.css` — context menus/submenus get `max-height: none; overflow: visible`
  (they share `.gc-designer-ribbon-dropdown`, which keeps its 500px clip for ribbon menus
  only), the grid context menu loses its 4px padding, and the Paste Options block is laid
  out 2 + 28 + 46 + 2 = 78px like the trial. The placement and clip are also applied as
  inline styles on the menu divs so the behaviour cannot regress to clipped when a page
  caches the stylesheet.
- Result at the supervisor's case (pointer 640,428): ours now renders 248×522 at (640,179)
  with `Create Cell Template...` fully visible — identical to the trial within 0px at all
  four grid corners measured so far (60/240, 60/640, 1150/240, 1150/640 → 60/179, 60/179,
  953/179, 953/179, all 248×522 both sides).

**Ribbon-state fix (same task):** Page Layout ▸ Sheet Options ▸ Headings ▸ Print is CHECKED
on a fresh workbook in the trial (`showRowHeader/showColumnHeader` = 0 = inherit ⇒ printed;
the trial's own `printHeadings` page-setup field reads `!== hide`). `Designer.getCommandState`
now uses the same `!== 1` rule, and `pageLayoutPrintHeadings` toggles with the matching
predicate, so the first click on a fresh sheet writes hide (1) and the checkbox unchecks —
the previously passing paired `page-layout-model` clicks sequence (gridlines before headings)
is unchanged.

**Tests:** paired Playwright `apps/designer-compare/test/context-menu-placement.spec.ts`
(real right-mouse at four grid corners, both sides, menu rectangle compared within 4px +
last-item-inside-viewport; plus the supervisor's (640,428) case on ours), a fresh-load
Headings ▸ Print `aria-checked` pair assertion in `test/page-layout-model.spec.ts`, and
unit tests `packages/spread-sheets-designer/test/menu-placement.test.ts` (flip, clamp,
no-flip boundaries, submenu flip/shift).

**Known gaps (task 9):** the trial's 51px right-flip overshoot is reproduced as measured;
its origin (likely an internal gutter constant) is not otherwise interpreted. The core
(non-designer) `gc-ui-contextmenu-container` in `packages/spread-sheets/src/interaction.ts`
keeps its previous viewport-clamp placement; only the Designer menus are in task scope.

## Barcode fit, shape anchoring and the name box (task 10) — what was verified against the trial (black box)

Defects fixed (supervisor, 2026-11-11): CODE128/CODE39 painted with a ~10 px module and
overflowed the cell across columns; no label under the bars; PDF417/DataMatrix not inset like
the trial; a shape did not follow `setRowHeight` (stayed 90 px); the name box kept showing the
cell reference while a shape was selected.

**Trial layout, measured live by scanning dark canvas pixels of the official 5185 page**
(124x100 merged cells, script = the supervisor's repro; measured relative to the cell):

- CODE128 `=BC_CODE128("ABC-1234")`: bars x=10..112 (fractional module ≈ 0.84 = (124−2·10)/123
  modules — the module size comes from the CELL width, guards included), y=1..84; the label
  "ABC-1234" (≈10 px) is centred on the cell under the bars, occupying y≈85..93. Nothing
  outside the cell.
- CODE39 `=BC_CODE39("ABC123")`: same scheme — bars x=9..113 y=1..83, label centred below.
- PDF417 `=BC_PDF417("Hello 42")`: fills the cell with a 3 px inset (x=3..119, y=3..95);
  its rows are stretched vertically to the cell height (2 symbol rows of 46 px with a 1 px gap).
- DATAMATRIX `=BC_DataMatrix("Hello 42")`: a square ≈75x75 sitting 12 px in from the cell's
  left edge, vertically centred; modules are near-square, the symbol is never stretched.
- The trial's PDF417 for this payload is 4 data columns x 2 rows (EC level ~0/1); we keep our
  EC-2 default (7x2) — the dark bounding box matches, the codeword layout differs.
- Linear codes show their label by default (`showLabel` default true); matrix codes do not.
- Shape `S1` added at (620,120,160,90) reports `height() = 170` after `setRowHeight(7,100)`:
  the public accessors return the anchored (resized) geometry, not the creation size.
- With the shape selected the name box input (class `gc-name-box-selector` on both sides)
  shows "S1".

**Implementation:**

- `packages/spread-sheets/src/features/barcode.ts`: new pure `barcodeLayout(spec, x, y, w, h)`
  (+ `barcodeShowsLabel`) computing the fit-to-cell geometry with fractional modules per the
  measurements above; `drawBarcode` paints through it and clips every cell to its own
  (merged) rectangle. `rendering.ts::paintBarcodes` no longer overflows into the viewport.
  `calc/functions/barcodes.ts`: linear `showLabel` defaults to true, label default position is
  below. `barcode-pdf417.ts::pickDimensions`: least-padding dimension choice (no forced
  3-row minimum), so short payloads get the trial's tall-row shape.
- `packages/spread-sheets/src/features/floating-objects.ts`: anchors are captured when an
  object is added to a sheet (`_captureAnchors`, called by `ShapeCollection.add` /
  `FloatingObjectCollection.add` — previously the lazy capture happened on the first paint,
  *after* the resize, freezing the shape at its creation size); `_render` writes the anchored
  left/top/width/height back into the model so `x()/y()/width()/height()` report the resized
  geometry like the trial; `fromJSON` restores the serialized anchors. `Shape._paint` then
  paints the canvas at the true (stretched) size.
- `packages/spread-sheets-designer/src/app.tsx` (FormulaBar): the name box syncs on shape
  selection changes (its memo key now includes the selected shape's display name; Escape
  reverts to it as well).

**Tests:** unit — `packages/spread-sheets/test/barcode.test.ts` (module width from the cell
width, centring, label strip, narrow-cell fit, matrix insets, drawBarcode clips to the cell
rect and never fills outside it, BC_ label defaults), `test/shape-anchors.test.ts` (anchor
capture at add time, height 170/220 on row resize, move on column resize, dynamicSize(false),
pictures), `packages/spread-sheets-designer/test/name-box.test.ts` (A1 → S1 → back, "N Shapes").
Paired Playwright — `apps/designer-compare/test/barcode-shape-namespec.spec.ts`: runs the
supervisor's exact script on both sides, compares each barcode cell's dark-pixel bounding box
within 6 px (all four match within 2 px), asserts ours paints 0 dark pixels outside the merged
cells, that both `shape.height()` equal 170 and that a real mouse click on the shape puts "S1"
in both name boxes.

**Known gaps (task 10):** PDF417's codeword matrix (columns/EC level) still differs from the
trial's choice for short payloads (bbox-compatible); the label font metrics are our own 10 px
Arial approximation; CODE49 remains the deterministic fallback grid (now also fit-to-cell).

## Barcode correctness (task 11, 2026-11-11) — EAN-13 / EAN-8 / Data Matrix made scanner-readable

The supervisor decoded our module output with a local reader (zxing-cpp); EAN-13, EAN-8 and the
non-ASCII Data Matrix samples did not decode. Fixed, all in `packages/spread-sheets`:

- **EAN check digit** (`barcode.ts::eanCheck`): weights now alternate 3,1,3,... from the
  rightmost body digit (GS1 rule). Verified: 400638133393→1, 978030640615→7, 590123412345→7,
  7351353→7, 9638507→4. The shown label prints the recomputed check digit.
- **EAN-13**: the parity table for first digits 5..9 was wrong (now LGGLLG / LGGGLL / LGLGLG /
  LGLGGL / LGGLGL); the six right digits (incl. the check digit) now use set **R** = the L
  pattern complement instead of L. Structure 101 + L/G×6 + 01010 + R×6 + 101 (95 modules).
- **EAN-8**: was a made-up 101+L×8+01010101 layout; now the standard 101 + L×4 + 01010 + R×4 +
  101 (67 modules).
- **Data Matrix** (`barcode-datamatrix.ts`): characters 128..255 now encode through the ASCII
  **Upper Shift** route (235 then charCode−127) so 'é'/'ÿ' decode directly; Base 256 (kept only
  for code points above 255, UTF-8 bytes) randomizes the length field and every data byte with
  the Annex P 255-state rule `stored = (value + ((149*P)%255 + 1)) % 256` (P = 1-based stream
  position; latch not randomized), supports the two-codeword length form `floor(d/250)+249,
  d%250` for 250..1555, and pad codewords follow ISO/IEC 16022 (first pad 129, later pads
  129 + 253-state position value, −254 when > 254) instead of the previous
  previous-codeword derivation.
- **Tests**: exact reference module strings for four EAN-13 and two EAN-8 codes (also
  `.probe/tools/ean-reference.json`), parity/set assertions, check-digit label recomputation,
  255-state randomization values (P=2→44, P=3→193), the pad rule, Upper-Shift and Base-256
  codeword round-trips through `dmReadCodewords`.
- **Verified with the local reader** (`.probe/tools/gen-task11.ts` → `.probe/tools/decode.py`):
  all EAN-13/EAN-8 samples decode (wrong input check digits recomputed, e.g. 1234567890123 →
  1234567890128), and 'é', 'Città è già', 'abcÿ', '€uro', '日本', a 300-char ASCII string,
  '€€abc123' and a 390-UTF-8-byte payload (two-codeword length) all decode to the input text.
  ASCII/numeric Data Matrix samples still decode (pads changed but readers ignore padding).
  Code 39/93/128, GS1-128, Codabar, PDF417 and QR were untouched.
- Public behaviour unchanged: same BC_* formula arguments, same Designer dialog, same layout
  code paths; only the encoded modules changed.
