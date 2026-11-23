/* Dialog openers for the Home/Editing cell commands: Insert/Delete Cells,
 * Paste Special, Tag / Default Value / Rich Text, Transform Cells, table and
 * cell-template helpers, the Style dialog of the Cell Styles gallery, the
 * Headers Cells dialog and the Format Cells dialog (with its data builder).
 * The class methods are thin wrappers around these functions. */
import type { DesignerApi as Designer, DialogData } from './designer-api.js';
import { internals, recordView, workbookInternals } from './core-internals.js';
import { TemplateNames } from './names-generated.js';
import { deepClone } from './config-merge.js';
import { activeSheet, pasteClipboard, topCell, currentStyle } from './commands/actions.js';
import { selectionBounds } from './commands/base.js';
import { paddingFields } from './designer-state.js';
import { numberCategoryForFormat, numberOptionsForFormat } from './dialogs/number-format.js';
import { messageText } from './resolve.js';

/** Cell Insert... dialog: radios like the trial, then the chosen shift on the model. */
export function showInsertCellsDialog(d: Designer): void {
  d.showDialog('insertCellsDialogTemplate', { shift: 'down' }, (data) => {
    d.runUndoable('insertCellsDialogApply', { direction: String(data.shift ?? 'down') });
  }, () => undefined);
}
/** Cell Delete... dialog: radios like the trial, then the chosen shift on the model. */
export function showDeleteCellsDialog(d: Designer): void {
  d.showDialog('deleteCellsDialogTemplate', { shift: 'left' }, (data) => {
    d.runUndoable('deleteCellsDialogApply', { direction: String(data.shift ?? 'left') });
  }, () => undefined);
}
/** Paste Special... dialog (the trial's eleven paste options, five operations, skip blanks/transpose). */
export function showPasteSpecial(d: Designer): void {
  d.showDialog('pasteSpecialDialogTemplate', { paste: 'all', operation: 'none', skipBlanks: false, transpose: false, pasteLink: false }, (data) => {
    const paste = String(data.paste ?? 'all');
    const mode: Record<string, string> = {
      all: 'all', formulas: 'formulas', values: 'values', formats: 'formatting', comments: 'comments', validation: 'validation',
      sourceTheme: 'source-theme', noBorders: 'no-borders', columnWidths: 'column-widths',
      formulasNumberFormat: 'formulas-numberformat', valuesNumberFormat: 'values-numberformat',
    };
    const operation = String(data.operation ?? 'none');
    const options = { operation: operation === 'transform' ? 'none' : operation as 'none' | 'add' | 'subtract' | 'multiply' | 'divide', skipBlanks: !!data.skipBlanks, transpose: !!data.transpose || !!data.pasteLink };
    if (data.pasteLink) d.showMessageBox(messageText(d, 'pasteLinkNote', 'Paste Link pastes the copied range; a live link to the source is not supported yet.'), messageText(d, 'pasteSpecial', 'Paste Special'), 1);
    pasteClipboard(d, mode[paste] ?? 'all', options);
  }, () => undefined);
}
export function showCellTagDialog(d: Designer, row: number, col: number): void {
  const sheet = activeSheet(d);
  const current = sheet.getRange(row, col, 1, 1).tag();
  d.showDialog('cellTagDialogTemplate', { tag: current == null ? '' : String(current) }, (data) => {
    sheet.getRange(row, col, 1, 1).tag(data.cleared ? undefined : String(data.tag ?? ''));
    d.invalidate();
  }, () => undefined);
}
/** Tag... on a row/column header cell: the trial titles these dialogs per header kind. */
export function showHeaderTag(d: Designer, axis: 'row' | 'col', index: number): void {
  const sheet = activeSheet(d);
  const area = axis === 'row' ? 2 : 1;
  const range = axis === 'row' ? sheet.getRange(Math.max(0, index), 0, 1, 1, area) : sheet.getRange(0, Math.max(0, index), 1, 1, area);
  const current = range.tag();
  d.showDialog('cellTagDialogTemplate', { dialogTitle: axis === 'row' ? messageText(d, 'rowTagDialog', 'Row Tag Dialog') : messageText(d, 'columnTagDialog', 'Column Tag Dialog'), tag: current == null ? '' : String(current) }, (data) => {
    range.tag(data.cleared ? undefined : String(data.tag ?? ''));
    d.invalidate();
  }, () => undefined);
}
/** Tag... on the sheet corner. */
export function showCornerTag(d: Designer): void {
  const sheet = activeSheet(d);
  const range = sheet.getRange(0, 0, 1, 1, 0);
  const current = range.tag();
  d.showDialog('cellTagDialogTemplate', { tag: current == null ? '' : String(current) }, (data) => {
    range.tag(data.cleared ? undefined : String(data.tag ?? ''));
    d.invalidate();
  }, () => undefined);
}
export function showDefaultValueDialog(d: Designer, row: number, col: number): void {
  const sheet = activeSheet(d);
  const current = sheet.getDefaultValue(row, col);
  d.showDialog('defaultValueDialogTemplate', { value: current == null ? '' : String(current) }, (data) => {
    const raw = data.value;
    // Like a cell editor, a numeric string becomes a number and a boolean stays a boolean.
    const parsed = raw === '' || raw == null ? null : typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    sheet.setDefaultValue(row, col, parsed);
    d.invalidate();
  }, () => undefined);
}
/** Rich text... editor for a cell (text + font; per-run styling is a known gap). */
export function showRichTextDialog(d: Designer, row: number, col: number): void {
  const sheet = activeSheet(d);
  const style = sheet.getStyle(row, col);
  d.showDialog('richTextDialogTemplate', {
    content: String(sheet.getValue(row, col) ?? ''),
    fontFamily: String(style?.fontFamily ?? sheet.getDefaultStyle()?.fontFamily ?? 'Calibri'),
    fontSize: Number(style?.fontSize ?? 11),
  }, (data) => {
    sheet.setValue(row, col, String(data.content ?? ''));
    const base = style?.clone?.() ?? new d.gc.Spread.Sheets.Style();
    const next = recordView(base);
    next.fontFamily = String(data.fontFamily ?? next.fontFamily ?? 'Calibri');
    // Our core keeps a raw number here (the contract types `fontSize` as string); write it through the bag view.
    (next as Record<string, unknown>).fontSize = Number(data.fontSize) || 11;
    sheet.setStyle(row, col, base);
    d.invalidate();
  }, () => undefined);
}
/** Transform Cells... dialog: apply a `LAMBDA(x, expr)`-style formula to each selected cell. */
export function showTransformCells(d: Designer): void {
  d.showDialog('transformCellsDialogTemplate', { formula: 'UPPER(x)', scope: 'cell' }, (data) => {
    const raw = String(data.formula ?? '').trim();
    if (!raw) return;
    d.runUndoable('transformCells', { expression: raw });
  }, () => undefined);
}
/** Trial: Convert to Range asks "Do you want to convert the table to a normal range ?" first. */
export function showConvertTableDialog(d: Designer, table: string): void {
  d.showMessageBox(messageText(d, 'convertTableConfirm', 'Do you want to convert the table to a normal range ?'), 'SpreadJS Designer', 1, (result: number) => {
    if (result === 1) d.runUndoable('convertTableToRange', { table });
  }, () => undefined, 1 /* MessageBoxButtons.okCancel */);
}
export function showCreateCellTemplateDialog(d: Designer): void {
  const sheet = activeSheet(d);
  const range = sheet.getSelections().at(-1);
  const rowCount = Math.max(1, range?.rowCount ?? 1), colCount = Math.max(1, range?.colCount ?? 1);
  d.showDialog('cellTemplateDialogTemplate', { name: '' }, (data) => {
    const name = String(data.name ?? '').trim();
    if (!name) return;
    const wb = workbookInternals(d.getWorkbook());
    (wb._cellTemplates ??= {})[name] = { row: Math.max(0, range?.row ?? 0), col: Math.max(0, range?.col ?? 0), rowCount, colCount };
    d.invalidate();
  }, () => undefined);
}
/** New Cell Style... dialog (Cell Styles gallery footer): the official shows a "Style" dialog with
 *  an auto-named "Style N" text field and Format... / OK / Cancel buttons; OK registers the active
 *  cell's resolved style as a workbook named style, which then gets a tile in the Custom section. */
export function showNewCellStyleDialog(d: Designer): void {
  const wb = d.getWorkbook();
  let index = 1;
  while (wb.getNamedStyle(`Style ${index}`)) index++;
  d.showDialog('newCellStyleDialogTemplate', { name: `Style ${index}` }, (data: DialogData) => {
    d.createCustomCellStyle(String(data.name ?? ''));
  }, () => undefined);
}
export function createCustomCellStyle(d: Designer, name: string): void {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return;
  const GC = d.gc;
  const sheet = activeSheet(d);
  const sel = sheet.getSelections()[0] ?? { row: sheet.getActiveRowIndex(), col: sheet.getActiveColumnIndex() };
  const actual = recordView(sheet.getActualStyle(Math.max(0, sel.row), Math.max(0, sel.col)));
  const style = new GC.Spread.Sheets.Style();
  const target = recordView(style);
  for (const [key, value] of Object.entries(actual)) {
    if (value === undefined || key === 'name' || typeof value === 'function') continue;
    target[key] = value;
  }
  style.name = trimmed;
  d.getWorkbook().addNamedStyle(style);
  d.invalidate();
}
/** Headers... dialog (row/column header cells), entry point for the row/col context menus. */
export function showHeadersDialog(d: Designer, axis?: 'row' | 'col', index?: number): void {
  const sheet = activeSheet(d);
  const sel = sheet.getSelections()[0];
  const resolvedAxis: 'row' | 'col' = axis ?? (sel && sel.row >= 0 && sel.col < 0 ? 'row' : sel && sel.col >= 0 && sel.row < 0 ? 'col' : 'col');
  const resolvedIndex = index ?? (resolvedAxis === 'row' ? (sel?.row >= 0 ? sel.row : sheet.getActiveRowIndex()) : (sel?.col >= 0 ? sel.col : sheet.getActiveColumnIndex()));
  const data: Record<string, unknown> = { index: Math.max(0, resolvedIndex) };
  for (const prefix of ['row', 'col'] as const) {
    const area = prefix === 'row' ? 2 : 1;
    const r = prefix === 'row' ? Math.max(0, resolvedIndex) : 0;
    const c = prefix === 'col' ? Math.max(0, resolvedIndex) : 0;
    const style = recordView(sheet.getStyle(r, c, area));
    const border = (key: string): string => {
      const line = style?.[key];
      return line ? String((line as { style?: unknown }).style ?? 'thin') : 'none';
    };
    const alignName: Record<number, string> = { 0: 'left', 1: 'center', 2: 'right', 3: 'general' };
    const vAlignName: Record<number, string> = { 0: 'top', 1: 'center', 2: 'bottom' };
    Object.assign(data, {
      [`${prefix}value`]: String(sheet.getValue(r, c, area) ?? ''),
      [`${prefix}backColor`]: String(style?.backColor ?? ''),
      [`${prefix}foreColor`]: String(style?.foreColor ?? ''),
      [`${prefix}font`]: String(style?.font ?? ''),
      [`${prefix}formatter`]: String(style?.formatter ?? ''),
      [`${prefix}hAlign`]: alignName[Number(style?.hAlign ?? 3)] ?? 'general',
      [`${prefix}vAlign`]: vAlignName[Number(style?.vAlign ?? 0)] ?? 'top',
      [`${prefix}textIndent`]: Number(style?.textIndent ?? 0),
      [`${prefix}borderLeft`]: border('borderLeft'),
      [`${prefix}borderRight`]: border('borderRight'),
      [`${prefix}borderTop`]: border('borderTop'),
      [`${prefix}borderBottom`]: border('borderBottom'),
      [`${prefix}diagonalUp`]: border('diagonalUp'),
      [`${prefix}diagonalDown`]: border('diagonalDown'),
      [`${prefix}borderRadius`]: String(style?.borderRadius ?? '0 0 0 0'),
      [`${prefix}locked`]: style?.locked === true,
      [`${prefix}wordWrap`]: style?.wordWrap === true,
      [`${prefix}shrinkToFit`]: style?.shrinkToFit === true,
      [`${prefix}verticalText`]: style?.isVerticalText === true,
    });
  }
  d.showDialog('headerCellsDialogTemplate', data, (submitted) => {
    const target = Math.max(0, Number(submitted.index) || 0);
    for (const prefix of ['row', 'col'] as const) {
      const area = prefix === 'row' ? 2 : 1;
      const r = prefix === 'row' ? target : 0;
      const c = prefix === 'col' ? target : 0;
      sheet.setValue(r, c, String(submitted[`${prefix}value`] ?? ''), area);
      d.runUndoable('applyHeaderStyle', { area, row: r, col: c, data: submitted, prefix });
    }
    d.invalidate();
  }, () => undefined);
}
/** Outline Column... dialog (indicator options stored on the worksheet). */
export function showOutlineColumnDialog(d: Designer, col?: number): void {
  const sheet = internals(activeSheet(d));
  const current = sheet.outlineColumnOptions ?? {};
  d.showDialog('outlineColumnDialogTemplate', {
    showIndicator: current.showIndicator !== false, showImage: !!current.showImage, customImage: !!current.customImage, showCheckBox: !!current.showCheckBox, maxLevel: Number(current.maxLevel ?? 3), column: col ?? 0,
  }, (data) => {
    sheet.outlineColumnOptions = { ...current, showIndicator: !!data.showIndicator, showImage: !!data.showImage, customImage: !!data.customImage, showCheckBox: !!data.showCheckBox, maxLevel: Number(data.maxLevel) || 1 };
    d.invalidate();
  }, () => undefined);
}

export function showFormatCells(d: Designer, tab?: string): void {
  const original = buildFormatData(d);
  d.showDialog(TemplateNames.FormatDialogTemplate ?? 'formatCellsDialog', original, (data: Record<string, unknown>) => {
    // Unvisited tabs must not overwrite a selection's existing styles or add
    // empty buttons/masks. Only edited properties participate in the command.
    const changes = Object.fromEntries(Object.entries(data).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(original[key])));
    // Tabs that own a group of fields apply them all-or-nothing, like the official dialog.
    const groups: Record<string, string[]> = {
      mask: ['maskPattern', 'maskPlaceholder', 'maskExcludeLiteral', 'maskExcludePlaceholder'],
      padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'labelText', 'labelAlignment', 'labelVisibility', 'labelFontFamily', 'labelFontSize', 'labelBold', 'labelItalic', 'labelForeColor', 'labelMarginTop', 'labelMarginRight', 'labelMarginBottom', 'labelMarginLeft'],
    };
    for (const keys of Object.values(groups)) {
      if (keys.some((key) => key in changes)) for (const key of keys) changes[key] = data[key];
    }
    if (Object.keys(changes).length) d.runUndoable('applyFormatCells', { data: changes });
  });
  // Bug revealed by typing: if the format dialog template is missing, `showDialog` leaves
  // `dialog` null and this line throws (same as before this refactor); see the task report.
  d.dialog!.initialTab = tab;
  d.invalidate();
}

export function buildFormatData(d: Designer): DialogData {
  const sheet = activeSheet(d);
  const style = currentStyle(d);
  const mask = style.mask as { pattern?: unknown; placeholder?: unknown; excludeLiteral?: unknown; excludePlaceholder?: unknown } | undefined;
  const { row } = topCell(sheet);
  const label = (style.labelOptions ?? {}) as Record<string, unknown>;
  const labelFont = String(label.font ?? 'normal normal 11pt Calibri');
  const labelMargins = String(label.margin ?? '0').trim().split(/\s+/).map(Number);
  const [marginT = 0, marginR = marginT, marginB = marginT, marginL = marginR] = labelMargins;
  const formatterCode = String(style.formatter ?? '');
  const numberOptions = numberOptionsForFormat(formatterCode);
  // Font tab initial state (trial labels: the style list starts with "Normal").
  const weight = String(style.fontWeight ?? '');
  const italic = /italic/i.test(String(style.fontStyle));
  const bold = /bold|[6-9]00/.test(weight);
  const decoration = Number(style.textDecoration ?? 0);
  const underlineIndex = decoration & 8 ? 2 : decoration & 32 ? 4 : decoration & 16 ? 3 : decoration & 1 ? 1 : 0;
  let fontSizeText = String(style.fontSize ?? '');
  if (/px$/i.test(fontSizeText)) fontSizeText = String(Math.round(parseFloat(fontSizeText) * 0.75 * 100) / 100); // 14.6667px -> 11
  fontSizeText = fontSizeText.replace(/pt$/i, '') || '11';
  // Border tab initial state: the trial's logical edges read back from the top-left cell.
  const edgeOf = (value: unknown): { style: number; color: string } | undefined => {
    if (!value) return undefined;
    const line = value as { style?: number; color?: string };
    return { style: Number(line.style ?? 1), color: String(line.color ?? '#000') };
  };
  const edges: Record<string, { style: number; color: string } | undefined> = {
    top: edgeOf(style.borderTop), bottom: edgeOf(style.borderBottom), left: edgeOf(style.borderLeft), right: edgeOf(style.borderRight),
    hInside: edgeOf(style.borderHorizontal), vInside: edgeOf(style.borderVertical), diagonalUp: edgeOf(style.diagonalUp), diagonalDown: edgeOf(style.diagonalDown),
  };
  const firstEdge = Object.values(edges).find((edge) => edge !== undefined);
  const radiusCorners = String(style.borderRadius ?? '').trim().split(/\s+/).map((v) => Math.max(0, Math.round(Number(v) || 0)));
  while (radiusCorners.length < 4) radiusCorners.push(radiusCorners[0] ?? 0);
  // Shorthand order is tl tr br bl; the dialog state order is TL TR BL BR.
  const dialogCorners = [radiusCorners[0], radiusCorners[1], radiusCorners[3], radiusCorners[2]];
  const selection = selectionBounds(sheet);
  return {
    category: numberCategoryForFormat(formatterCode), formatCode: formatterCode,
    decimals: numberOptions.decimals, separator: numberOptions.separator, negative: numberOptions.negative,
    symbol: numberOptions.symbol, type: numberOptions.type, locale: numberOptions.locale,
    sample: sheet.getText(row, topCell(sheet).col), sampleValue: sheet.getValue(row, topCell(sheet).col),
    hAlign: style.hAlign ?? 3, vAlign: style.vAlign ?? 0, indent: style.textIndent ?? 0,
    orientation: style.textOrientation ?? 0, wrapText: !!style.wordWrap, shrinkToFit: !!style.shrinkToFit,
    verticalText: !!style.isVerticalText, showEllipsis: !!style.showEllipsis,
    textDirection: style.textDirection ?? undefined,
    mergeCells: !!internals(sheet).getSpan(row, topCell(sheet).col), fontFamily: style.fontFamily ?? 'Calibri',
    fontStyle: bold && italic ? 'Bold Italic' : bold ? 'Bold' : italic ? 'Italic' : 'Normal', fontSize: fontSizeText, fontWeight: weight || 'normal',
    underlineIndex, strikethrough: !!(decoration & 2), color: style.foreColor ?? '#000000',
    border: { edges, style: firstEdge?.style ?? 1, color: firstEdge?.color ?? '#000', radiusMode: 'outer', corners: dialogCorners, linked: dialogCorners.every((v) => v === dialogCorners[0]) },
    selectionMulti: selection.rowCount > 1 || selection.colCount > 1,
    backColor: style.backColor,
    locked: style.locked !== false, hidden: !!style.hidden, allowEdit: true,
    cellButtons: deepClone(Array.isArray(style.cellButtons) ? style.cellButtons : []),
    ...paddingFields(String(style.cellPadding ?? '0')),
    labelText: String(style.watermark ?? ''),
    labelAlignment: Number(label.alignment ?? 0), labelVisibility: Number(label.visibility ?? 2),
    labelFontFamily: labelFont.split(' ').slice(-1)[0] || 'Calibri', labelFontSize: (labelFont.match(/([\d.]+)pt/) ?? [, '11'])[1],
    labelBold: /bold|[6-9]00/.test(labelFont), labelItalic: /italic|oblique/.test(labelFont), labelForeColor: String(label.foreColor ?? '#808080'),
    labelMarginTop: marginT, labelMarginRight: marginR, labelMarginBottom: marginB, labelMarginLeft: marginL,
    decoration: deepClone(style.decoration ?? {}),
    maskPattern: String(mask?.pattern ?? ''), maskPlaceholder: String(mask?.placeholder ?? ''),
    maskExcludeLiteral: !!mask?.excludeLiteral, maskExcludePlaceholder: !!mask?.excludePlaceholder,
  };
}
