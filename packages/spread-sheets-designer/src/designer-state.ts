/* Command state of the Designer: reads the active sheet/style/printInfo back
 * into the `CommandState` the ribbon controls render (checked/value/color/
 * text/enabled/visible), plus the format-category and margin/paper helpers
 * shared with the Format Cells dialog opener. */
import type { DesignerApi as Designer } from './designer-api.js';
import type { CommandState, ICommand } from './types.js';
import type { Worksheet } from './core-internals.js';
import { internals, printInfoInternals, printInfoOf } from './core-internals.js';
import { activeSheet, commandEnabled, currentStyle, topCell } from './commands/actions.js';
import { pivotCommandState } from './pivot-designer.js';
import { selectedShapes as insertSelectedShapes } from './commands/insert.js';
import { fitPagesLabel, MARGIN_PRESETS, PAPER_ITEMS } from './page-setup.js';
import { resolveText } from './resolve.js';

/** The margin preset matching the sheet's print margins ('Custom' if none). */
export function currentMarginPreset(sheet: Worksheet): string {
  const margin = printInfoInternals(printInfoOf(sheet))._marginEffective();
  for (const [name, preset] of Object.entries(MARGIN_PRESETS))
    if (Object.entries(preset).every(([key, value]) => Math.abs(Number(margin[key]) - Number(value)) < 0.5)) return name;
  return 'Custom';
}
/** The paper display name from the sheet's printInfo ('Custom' if unknown). */
export function currentPaperName(sheet: Worksheet): string {
  return PAPER_ITEMS.find((item) => Number(printInfoOf(sheet).paperSize().kind()) === item.kind)?.text ?? 'Custom';
}

export function categoryForFormat(format: string): string {
  const f = format.toLowerCase();
  if (f.includes('%')) return 'Percentage';
  if (f.includes('$')) return f.includes('_') ? 'Accounting' : 'Currency';
  if (/[ymdhs]/.test(f)) return f.includes('h') || f.includes('s') ? 'Time' : 'Date';
  if (f.includes('e+') || f.includes('e-')) return 'Scientific';
  if (f.includes('/')) return 'Fraction';
  if (f === '@') return 'Text';
  return 'Number';
}

/** Split a CSS `padding` shorthand into the four dialog fields. */
export function paddingFields(value: string): Record<string, number> {
  const [top = 0, right = top, bottom = top, left = right] = value.split(/\s+/).map(Number);
  return { paddingTop: top, paddingRight: right, paddingBottom: bottom, paddingLeft: left };
}

export function computeCommandState(d: Designer, commandName: string): CommandState {
  const command = d.getCommand(commandName) as ICommand | undefined;
  const state: CommandState = { enabled: commandEnabled(d, commandName), visible: true };
  // PivotTable commands keep their state with the pivot module (TASK 47).
  const pivotState = pivotCommandState(d, commandName);
  if (pivotState) Object.assign(state, pivotState);
  if (command?.getState) {
    try {
      const custom = command.getState(d) ?? {};
      Object.assign(state, custom);
    } catch { /* user state should not break the ribbon */ }
  }
  const sheet = activeSheet(d);
  const style = currentStyle(d);
  const format = String(style.formatter ?? 'General');
  const span = internals(sheet).getSpan(topCell(sheet).row, topCell(sheet).col);
  switch (commandName) {
    case 'fontFamily': state.value = style.fontFamily ?? 'Calibri'; break;
    case 'fontSize': {
      const raw = String(style.fontSize ?? '');
      const numeric = Number.parseFloat(raw) || 11;
      state.value = raw.endsWith('px') ? Math.round(numeric * 0.75 * 100) / 100 : numeric;
      break;
    }
    case 'fontWeight': state.checked = /bold|[6-9]00/.test(String(style.fontWeight ?? '')); break;
    case 'fontItalic': state.checked = /italic|oblique/.test(String(style.fontStyle ?? '')); break;
    case 'fontUnderline': state.checked = /underline/.test(String(style.textDecoration ?? '')) && !/double/.test(String(style.textDecoration ?? '')); break;
    case 'fontDoubleUnderline': state.checked = /double/.test(String(style.textDecoration ?? '')); break;
    case 'wrapText': state.checked = !!style.wordWrap; break;
    case 'topAlign': state.checked = Number(style.vAlign ?? 0) === 0; break;
    case 'middleAlign': state.checked = Number(style.vAlign) === 1; break;
    case 'bottomAlign': state.checked = Number(style.vAlign) === 2; break;
    case 'leftAlign': state.checked = Number(style.hAlign) === 0; break;
    case 'centerAlign': state.checked = Number(style.hAlign) === 1; break;
    case 'rightAlign': state.checked = Number(style.hAlign) === 2; break;
    case 'ribbonNumberFormat': state.value = format === 'General' || !format ? 'General' : format; state.text = format === 'General' || !format ? 'General' : categoryForFormat(format); break;
    case 'backColor': state.color = (style.backColor as string | undefined) ?? 'transparent'; break;
    case 'foreColor': state.color = (style.foreColor as string | undefined) ?? '#000000'; break;
    case 'formatPainter': state.checked = !!d._formatPainterStyle; break;
    case 'mergeCenterButton': case 'mergeCenter': state.checked = !!span; break;
    case 'undo': state.enabled = d.getWorkbook().undoManager().canUndo(); break;
    case 'redo': state.enabled = d.getWorkbook().undoManager().canRedo(); break;
    case 'undoList': state.enabled = d.getWorkbook().undoManager().canUndo(); break;
    case 'redoList': state.enabled = d.getWorkbook().undoManager().canRedo(); break;
    case 'showHideRowHeader': state.checked = sheet.options.rowHeaderVisible !== false; break;
    case 'showHideColumnHeader': state.checked = sheet.options.colHeaderVisible !== false; break;
    case 'showHideVGridLine': state.checked = !!sheet.options.gridline.showVerticalGridline; break;
    case 'showHideHGridLine': state.checked = !!sheet.options.gridline.showHorizontalGridline; break;
    case 'showHideTabStrip': state.checked = d.getWorkbook().options.tabStripVisible !== false; break;
    case 'showHideNewTab': state.checked = d.getWorkbook().options.newTabVisible !== false; break;
    case 'showFormulas': state.checked = !!sheet.options.showFormulas; break;
    case 'pageLayoutViewGridlines': state.checked = !!sheet.options.gridline.showVerticalGridline; break;
    case 'pageLayoutPrintGridlines': state.checked = !!sheet.printInfo().showGridLine(); break;
    case 'pageLayoutViewHeadings': state.checked = sheet.options.rowHeaderVisible !== false && sheet.options.colHeaderVisible !== false; break;
    // Official: with inherit (0) the headings print, so the checkbox starts checked; only an explicit hide (1) unchecks it.
    case 'pageLayoutPrintHeadings': state.checked = Number(sheet.printInfo().showRowHeader()) !== 1 && Number(sheet.printInfo().showColumnHeader()) !== 1; break;
    case 'printLineVisible': state.checked = sheet.isPrintLineVisible(); break;
    case 'orientationPortrait': state.checked = Number(sheet.printInfo().orientation()) !== 2; break;
    case 'orientationLandscape': state.checked = Number(sheet.printInfo().orientation()) === 2; break;
    case 'marginSelector': state.text = currentMarginPreset(sheet); break;
    case 'marginNormal': case 'marginWide': case 'marginNarrow':
      state.checked = currentMarginPreset(sheet) === commandName.slice('margin'.length); break;
    case 'paperKindSelector': state.text = currentPaperName(sheet); break;
    case 'paperLetter': case 'paperLegal': case 'paperA4': case 'paperA3': {
      const kind = PAPER_ITEMS.find((item) => item.text === commandName.slice('paper'.length))?.kind;
      state.checked = kind !== undefined && Number(sheet.printInfo().paperSize().kind()) === kind;
      break;
    }
    case 'worksheetBackgroundRepeat': state.checked = internals(sheet).getBackgroundImageInfo().option.layout === 'repeat'; break;
    case 'worksheetBackgroundOverContent': state.checked = internals(sheet).getBackgroundImageInfo().option.paintOrder === 'over-content'; break;
    case 'fitPageWidth': state.value = fitPagesLabel(sheet.printInfo().fitPagesWide()); break;
    case 'fitPageTall': state.value = fitPagesLabel(sheet.printInfo().fitPagesTall()); break;
    case 'fitPageScale': state.value = Math.round(sheet.printInfo().zoomFactor() * 100); break;
    case 'calculationOptionAutomatic': state.checked = d.calculationMode === 'automatic'; break;
    case 'calculationOptionPartial': state.checked = d.calculationMode === 'partial'; break;
    case 'calculationOptionManual': state.checked = d.calculationMode === 'manual'; break;
    case 'setFilterData': state.checked = !!sheet.rowFilter(); break;
    case 'reapplyFilter': case 'reapplyFilterData': state.enabled = !!sheet.rowFilter(); break;
    case 'selectionPaneButton': state.checked = d._selectionPaneOpen; state.enabled = !sheet.options.isProtected; break;
    case 'shapeGroup': state.enabled = d.selectedShapeCount() >= 2; break;
    case 'shapeUnGroup': state.enabled = insertSelectedShapes(d).some((shape) => String(shape.shapeType?.()) === '3' || !!shape.groupId?.()); break;
    case 'changeShape': case 'shapeRotate': case 'shapeAlign': case 'shapeSize': case 'shapeAltText': case 'shapeFormatPane':
    case 'shapeStyle1': case 'shapeStyle2': case 'shapeStyle3': case 'shapeStyle4': case 'shapeStyle5': case 'shapeStyle6': case 'shapeStyle7':
      state.enabled = d.hasSelectedShapes(); break;
    case 'showThreadedComments': case 'ShowThreadedComments': state.checked = d._showComments; break;
    case 'focusCell': case 'focusCellMenuItem': state.checked = !!(d.getWorkbook().options.focusCell as { enabled?: boolean } | undefined)?.enabled; break;
    case 'focusCellShowAutoHighlight': state.checked = d._focusAutoHighlight; break;
    case 'showFormulaEditorPanel': state.checked = d._formulaEditorOpen; break;
    case 'zoomDefault': state.value = Math.round((sheet.zoom?.() ?? 1) * 100); break;
    case 'cellFormatProtectSheet': state.visible = !sheet.options.isProtected; break;
    case 'unProtectSheet': state.visible = !!sheet.options.isProtected; state.enabled = true; break;
    // The trial shows exactly one of Lock/Unlock Cells depending on the current cell's locked
    // state (locked is inherited-true unless explicitly unlocked) — TASK 51, cellsFormat dropdown.
    case 'lockCells': state.visible = style.locked === false; break;
    case 'unLockCells': state.visible = style.locked !== false; break;
    case 'unfreezePanes': state.enabled = true; break;
    // The trial keeps Unmerge Cells enabled even without a merged selection (TASK 51 crop
    // .probe/t51/out/official/menu-Home__ribbon.mergeCenter.png).
    default: break;
  }
  if (commandName === 'worksheetBackgroundRepeat' || commandName === 'worksheetBackgroundOverContent') state.enabled = !!sheet.backgroundImage();
  if (['DeleteThreadedComment'].includes(commandName)) { const p = topCell(sheet); state.enabled = !!sheet.threadedComments.get(p.row, p.col); }
  if (['PreviousThreadedComment', 'NextThreadedComment'].includes(commandName)) state.enabled = sheet.threadedComments.size() > 0;
  if (state.text === undefined) {
    const text = command?.text;
    if (text) state.text = text;
  }
  return state;
}

/**
 * Command Palette candidates: every command with a human-readable title, optionally
 * fuzzy-filtered by `query` (substring matches rank before subsequence matches).
 */
export function searchDesignerCommands(d: Designer, query: string, limit = 8): { name: string; title: string; iconClass?: string }[] {
  const map = d.getCommand() as Record<string, ICommand> | undefined;
  const q = query.trim().toLowerCase();
  const matches: { name: string; title: string; iconClass?: string; score: number }[] = [];
  for (const [name, spec] of Object.entries(map ?? {})) {
    if (!spec || name.startsWith('__') || /Group$/.test(name)) continue;
    const raw = spec.title ?? spec.text;
    if (!raw) continue;
    const title = resolveText(raw, d.resources);
    if (!title || title.length > 60 || /[$]{/.test(title) || /^(ribbon|gc)\./i.test(title)) continue;
    const lower = title.toLowerCase();
    let score = -1;
    if (!q) score = 0;
    else if (lower.includes(q)) score = 2;
    else if (bestFuzzyRun(lower, q) >= Math.min(3, q.length)) score = 1;
    if (score < 0) continue;
    matches.push({ name, title, iconClass: spec.iconClass, score });
  }
  matches.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return matches.slice(0, limit).map(({ score: _score, ...item }) => item);
}

/**
 * Length of the longest contiguous run of query characters inside title during a
 * greedy subsequence match; 0 when query is not a subsequence at all. Filters obvious
 * noise out of Command Palette fuzzy search.
 */
function bestFuzzyRun(title: string, query: string): number {
  let qi = 0; let best = 0; let run = 0; let previous = -2;
  for (let i = 0; i < title.length && qi < query.length; i++) {
    if (title[i] !== query[qi]) continue;
    run = i === previous + 1 ? run + 1 : 1;
    previous = i;
    if (run > best) best = run;
    qi++;
  }
  return qi === query.length ? best : 0;
}

/** Formula-bar / status-bar snapshot of the active cell (reference, formula, value, undo state). */
export function getDesignerSelectionInfo(d: Designer): { reference: string; formula: string; value: unknown; canUndo: boolean; canRedo: boolean } {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  const ref = `${columnName(col)}${row + 1}`;
  return {
    reference: ref,
    formula: sheet.getFormula(row, col) ?? '',
    value: sheet.getValue(row, col),
    canUndo: d.getWorkbook().undoManager().canUndo(),
    canRedo: d.getWorkbook().undoManager().canRedo(),
  };
}

/** Commits a name-box reference (e.g. "B2:D7") as the new selection; false when malformed. */
export function commitDesignerReference(d: Designer, reference: string): boolean {
  const sheet = activeSheet(d);
  const match = reference.replace(/\$/g, '').match(/^([A-Za-z]{1,3})(\d+)(?::([A-Za-z]{1,3})(\d+))?$/);
  if (!match) return false;
  const col = columnIndex(match[1]);
  const row = Number(match[2]) - 1;
  const col2 = match[3] ? columnIndex(match[3]) : col;
  const row2 = match[4] ? Number(match[4]) - 1 : row;
  if (row < 0 || col < 0) return false;
  // TASK 70: the name box is a designer control — the trial moves the selection through its USER
  // path (SelectionChanged fires, so ribbon caches recompute), not through the silent API setter.
  const view = internals(sheet);
  const top = Math.min(row, row2), left = Math.min(col, col2);
  if (view._userSetSelection) view._userSetSelection(top, left, Math.abs(row2 - row) + 1, Math.abs(col2 - col) + 1);
  else sheet.setSelection(top, left, Math.abs(row2 - row) + 1, Math.abs(col2 - col) + 1);
  d.invalidate();
  return true;
}

function columnIndex(label: string): number {
  let col = 0;
  for (const ch of label.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
  return col - 1;
}

function columnName(col: number): string {
  let out = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}
