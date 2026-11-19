/* Openers for the conditional-formatting dialogs (TASK 65 item 4). One "New
 * Formatting Rule" dialog serves every gallery footer; the command picks the
 * pre-selected rule type like the trial does:
 *   Highlight Cells Rules > More Rules...      -> "Format only cells that contain"
 *   Top/Bottom Rules    > More Rules...        -> "Format only top or bottom..."
 *   More Data Bar / Color Scale / Icon Set     -> "Format all cells based on their values"
 *                                                with that Format kind pre-selected
 *   New Rule...                                -> the first kind
 *   Manage Rules...                            -> the rules manager
 * Rules are created through the public `sheet.conditionalFormats.add*` API with a
 * `GC.Spread.Sheets.Style` built from the Format Cells dialog's record. Like the
 * trial's dialog the changes commit immediately (each dialog closes on OK). */
import type { DesignerApi as Designer, DialogData } from './designer-api.js';
import { TemplateNames } from './names-generated.js';
import { activeSheet, selectionBounds } from './commands/base.js';
import { buildFormatData } from './designer-dialogs.js';
import { conditionFormatsOf } from './core-internals.js';
import { beginFormatStylePick, styleFromFormatData, takeFormatStyleTarget } from './dialogs/style-bridge.js';

const RULE_TEMPLATE = TemplateNames.NewFormattingRuleDialogTemplate ?? 'newFormattingRuleDialogTemplate';
const MANAGER_TEMPLATE = 'ruleManagerDialogTemplate';
const FORMAT_TEMPLATE = TemplateNames.FormatDialogTemplate ?? 'formatDialogTemplate';

/** The kind the editor and the manager speak about a rule with. */
export type ConditionalRuleKind = 'style' | 'dataBar' | 'colorScale' | 'iconSet' | 'cellValue' | 'top10' | 'average' | 'unique' | 'formula' | 'state';

/** The dialog draft, kept on the designer across the Format... round-trip. */
export interface ConditionalRuleDraft {
  data: DialogData;
  /** The manager row being edited (undefined for a brand-new rule). */
  editing: number | undefined;
  /** Back to the manager after the rule dialog closes (Edit/Duplicate flow). */
  returnToManager: boolean;
}

const presets: Record<string, Record<string, unknown>> = {
  style: { type: 0, valueFormat: '2-Color Scale' },
  contain: { type: 1, valueFormat: 'Style', operator: 6 },
  topBottom: { type: 2, isTop: true, rank: 10 },
  dataBar: { type: 0, valueFormat: 'Data Bar' },
  colorScale: { type: 0, valueFormat: '2-Color Scale' },
  iconSet: { type: 0, valueFormat: 'Icon Sets' },
};

/** Opens the New Formatting Rule dialog for one of the gallery entry points. */
export function showNewFormattingRule(designer: Designer, preset?: string, options?: { editing?: number; data?: DialogData; returnToManager?: boolean }): void {
  const draft: ConditionalRuleDraft = {
    data: options?.data ?? { ...presets[preset ?? 'style'] },
    editing: options?.editing,
    returnToManager: options?.returnToManager ?? false,
  };
  designer._conditionalRuleDraft = draft;
  designer.showDialog(RULE_TEMPLATE, draft.data,
    (submitted) => {
      const current = designer._conditionalRuleDraft;
      designer._conditionalRuleDraft = undefined;
      applyConditionalRule(designer, submitted as DialogData, current?.editing);
      if (current?.returnToManager) showRuleManagerDialog(designer);
    },
    () => {
      const current = designer._conditionalRuleDraft;
      designer._conditionalRuleDraft = undefined;
      if (current?.returnToManager) showRuleManagerDialog(designer);
    });
}

/** Opens the Conditional Formatting Rules Manager. TASK 68: the trial defaults
 *  the filter to "Current Selection" and works on the live rules (Apply just
 *  re-reads them). */
export function showRuleManagerDialog(designer: Designer, scope?: string): void {
  const sc = scope ?? 'selection';
  designer.showDialog(MANAGER_TEMPLATE, { rules: conditionalRuleRows(designer, sc), selected: -1, scope: sc },
    () => { designer.invalidate(); }, () => undefined);
}

/** `Apply` / the scope dropdown: re-read the rules into the open manager. */
export function refreshConditionalRuleManager(designer: Designer, scope?: string): void {
  const dialog = designer.dialog;
  if (!dialog || dialog.name !== MANAGER_TEMPLATE) return;
  const next = scope ?? String(dialog.data.scope ?? 'selection');
  dialog.data = { ...dialog.data, scope: next, rules: conditionalRuleRows(designer, next), selected: -1 };
  designer.invalidate();
}

/* ------------------------------------------------------------------ apply --- */

const cast = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

/** The `ConditionalFormatting` enum table of the running core. */
export function cfEnums(designer: Designer): Record<string, unknown> {
  return cast(cast(cast(cast(designer.gc).Spread).Sheets).ConditionalFormatting);
}

/** The `Style` the rule carries (empty object = the core's default CF style). */
function ruleStyle(designer: Designer, style: Record<string, unknown> | undefined): unknown {
  const sheets = cast(cast(cast(designer.gc).Spread).Sheets);
  const instance = new (sheets.Style as new () => Record<string, unknown>)();
  for (const [key, value] of Object.entries(style ?? {})) instance[key] = value;
  return instance;
}

/** Adds the rule the dialog describes to the selection, through the public API. */
export function applyConditionalRule(designer: Designer, data: DialogData, editing?: number): void {
  const sheet = activeSheet(designer);
  const bounds = selectionBounds(sheet);
  const sheets = cast(cast(cast(designer.gc).Spread).Sheets);
  const enums = cfEnums(designer);
  const RangeCtor = sheets.Range as new (row: number, col: number, rowCount: number, colCount: number) => unknown;
  const ranges = [new RangeCtor(Math.max(0, bounds.row), Math.max(0, bounds.col), Math.max(1, bounds.rowCount), Math.max(1, bounds.colCount))];
  const formats = conditionFormatsOf(sheet);
  const style = ruleStyle(designer, (data.style ?? undefined) as Record<string, unknown> | undefined);
  const num = (key: string, fallback: number): number => Number(data[key] ?? fallback);
  const value = (text: unknown): unknown => {
    const raw = String(text ?? '').trim();
    if (!raw) return undefined;
    const asNumber = Number(raw);
    return Number.isFinite(asNumber) ? asNumber : raw;
  };
  if (editing !== undefined) deleteConditionalRule(designer, editing, false);
  const type = num('type', 0);
  if (type === 0) {
    const kind = String(data.valueFormat ?? '2-Color Scale');
    if (kind === 'Data Bar') {
      formats.addDataBarRule?.(num('minType', 1), value(data.minValue), num('maxType', 2), value(data.maxValue), String(data.barColor ?? '#638ec6'), ranges);
    } else if (kind === '3-Color Scale') {
      formats.add3ScaleRule?.(num('minType', 1), undefined, String(data.minColor ?? '#f8696b'), num('midType', 3), value(data.midValue), String(data.midColor ?? '#ffeb84'), num('maxType', 2), undefined, String(data.maxColor ?? '#63be7b'), ranges);
    } else if (kind === '2-Color Scale' || kind === 'Color Scale') {
      formats.add2ScaleRule?.(num('minType', 1), undefined, String(data.minColor ?? '#f8696b'), num('maxType', 2), undefined, String(data.maxColor ?? '#63be7b'), ranges);
    } else if (kind === 'Icon Sets' || kind === 'Icon Set') {
      formats.addIconSetRule?.(num('iconSetType', 0), ranges);
    } else if (kind === 'Sparkline') {
      throw new Error('Sparkline formatting rules need the extended sparkline add-on.');
    } else {
      // "Format all cells based on their values" + Style formats every cell:
      // the always-true formula rule is the public way to express that.
      formats.addFormulaRule?.('TRUE', style, ranges);
    }
  } else if (type === 1) {
    const operator = num('operator', 6);
    const between = operator === 6 || operator === 7; // ComparisonOperators.between / notBetween
    if (between) formats.addCellValueRule?.(operator, value(data.value1), value(data.value2), style, ranges);
    else formats.addCellValueRule?.(operator, value(data.value1), undefined, style, ranges);
  } else if (type === 2) {
    const direction = Number((enums.Top10RuleDirection as Record<string, unknown> | undefined)?.top ?? 0);
    const rankType = Number((enums.RuleDirection as Record<string, unknown> | undefined)?.top ?? 0);
    void direction; void rankType;
    formats.addTop10Rule?.(data.isTop === false ? 1 : 0, Number(value(data.rank) ?? 10), style, ranges, !!data.isPercent);
  } else if (type === 3) {
    // public AverageConditionType: aboveAverage 0 / belowAverage 1 (trial's default: above)
    formats.addAverageRule?.(data.average === 'below' ? 1 : 0, style, ranges);
  } else if (type === 4) {
    if (data.uniqueOrDuplicate === 'unique') formats.addUniqueRule?.(style, ranges);
    else formats.addDuplicateRule?.(style, ranges);
  } else if (type === 5) {
    formats.addFormulaRule?.(String(data.formula ?? 'TRUE') || 'TRUE', style, ranges);
  } else if (type === 6) {
    const state = num('state', 1);
    if (data.stateScope === 'column') formats.addColumnStateRule?.(state, style, ranges);
    else formats.addRowStateRule?.(state, style, ranges);
  }
  designer.invalidate();
}

/* ---------------------------------------------------------------- manager --- */

/** The core `RuleType` numbers (public `ConditionalFormatting.RuleType`). */
export function cfRuleTypes(designer: Designer): Record<string, number> {
  return cast(cfEnums(designer).RuleType ?? {}) as Record<string, number>;
}

/** The manager's "Applies to" text, in the trial's form: `=$A$1:$A$5` (absolute refs). */
const rangeTextOf = (range: { row: number; col: number; rowCount: number; colCount: number }): string => {
  const letters = (col: number): string => { let s = ''; for (let i = col; ; ) { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; if (i < 0) return s; } };
  const right = letters(range.col + Math.max(1, range.colCount) - 1);
  const bottom = range.row + Math.max(1, range.rowCount);
  return range.rowCount <= 1 && range.colCount <= 1 ? `=$${letters(range.col)}$${range.row + 1}` : `=$${letters(range.col)}$${range.row + 1}:$${right}$${bottom}`;
};

/** Access one rule's members through its public methods (the rule classes are opaque here). */
const obj = (value: unknown): Record<string, unknown> => (value ?? {}) as Record<string, unknown>;
const call = (target: Record<string, unknown>, name: string): unknown => {
  const fn = target[name];
  return typeof fn === 'function' ? (fn as () => unknown).call(target) : undefined;
};
const numCall = (target: Record<string, unknown>, name: string, fallback: number): number => {
  const value = call(target, name);
  return Number(value ?? fallback);
};

/** The rule descriptions of the manager's Type column, like the trial's phrasing
 *  (measured on the official Rules Manager: "Cell value between 5 and 10", "Top 2",
 *  "Above Average", "Duplicate Values", "Unique Values", "Formula: =A1>1"). */
export function conditionalRuleDescription(rule: unknown, ruleTypes: Record<string, number>): { description: string; kind: string; style?: Record<string, unknown> } {
  const view = obj(rule);
  const type = numCall(view, 'ruleType', -1);
  const styleRecord = (): Record<string, unknown> | undefined => {
    const style = call(view, 'style');
    return style && typeof style === 'object' ? { ...(style as Record<string, unknown>) } : undefined;
  };
  const is = (name: string): boolean => type === Number(ruleTypes[name]);
  if (is('cellValueRule')) {
    const op = numCall(view, 'operator', 6);
    // ComparisonOperators: equalsTo 0, notEqualsTo 1, greaterThan 2, greaterThanOrEqualsTo 3,
    // lessThan 4, lessThanOrEqualsTo 5, between 6, notBetween 7.
    const symbols: Record<number, string> = { 0: '=', 1: '<>', 2: '>', 3: '>=', 4: '<', 5: '<=' };
    const v1 = call(view, 'value1'); const v2 = call(view, 'value2');
    const phrase = op === 6 ? `between ${String(v1 ?? '')} and ${String(v2 ?? '')}`
      : op === 7 ? `not between ${String(v1 ?? '')} and ${String(v2 ?? '')}`
        : `${symbols[op] ?? ''} ${String(v1 ?? '')}`;
    return { description: `Cell value ${phrase}`.trim(), kind: 'cellValue', style: styleRecord() };
  }
  if (is('top10Rule')) return { description: `${Number(call(view, 'type') ?? 0) === 1 ? 'Bottom' : 'Top'} ${String(call(view, 'rank') ?? 10)}`, kind: 'top10', style: styleRecord() };
  if (is('averageRule')) {
    const types = ['Above Average', 'Below Average', 'Above or Equal Average', 'Below or Equal Average', '1 Std Deviation Above Average', '1 Std Deviation Below Average', '2 Std Deviations Above Average', '2 Std Deviations Below Average', '3 Std Deviations Above Average', '3 Std Deviations Below Average'];
    return { description: types[Number(call(view, 'type') ?? 0)] ?? 'Above Average', kind: 'average', style: styleRecord() };
  }
  if (is('duplicateRule')) return { description: 'Duplicate Values', kind: 'unique', style: styleRecord() };
  if (is('uniqueRule')) return { description: 'Unique Values', kind: 'unique', style: styleRecord() };
  if (is('formulaRule')) {
    // The trial shows the formula with its leading '=' ("Formula: =A1>1"); cores may or may not keep it.
    const f = String(call(view, 'value1') ?? call(view, 'formula') ?? '');
    return { description: `Formula: ${f.startsWith('=') ? f : f ? `=${f}` : ''}`, kind: 'formula', style: styleRecord() };
  }
  if (is('dataBarRule')) return { description: 'Data Bar', kind: 'dataBar' };
  if (is('twoColorScale') || is('threeColorScale')) return { description: 'Color Scale', kind: 'colorScale' };
  if (is('iconSetRule')) return { description: 'Icon Set', kind: 'iconSet' };
  if (is('rowStateRule') || is('columnStateRule')) return { description: `State (${String(call(view, 'state') ?? '')})`, kind: 'state', style: styleRecord() };
  return { description: `Rule ${type}`, kind: 'rule' };
}

/** The manager's rows, read through the public `getRules()`/rule accessors. */
export function conditionalRuleRows(designer: Designer, scope?: string): unknown[] {
  const sheet = activeSheet(designer);
  const formats = conditionFormatsOf(sheet);
  const ruleTypes = cfRuleTypes(designer);
  let rows = formats.getRules().map((rule, index) => {
    const view = obj(rule);
    const ranges = (call(view, 'ranges') ?? []) as { row: number; col: number; rowCount: number; colCount: number }[];
    const info = conditionalRuleDescription(rule, ruleTypes);
    return {
      index, ruleType: numCall(view, 'ruleType', -1), description: info.description,
      appliesTo: ranges.map(rangeTextOf).join(', '), stopIfTrue: !!call(view, 'stopIfTrue'), kind: info.kind, style: info.style,
      bounds: ranges,
    };
  });
  if (scope === 'selection') {
    const selection = selectionBounds(sheet);
    const intersects = rows.filter((row) => ((row as { bounds?: { row: number; col: number; rowCount: number; colCount: number }[] }).bounds ?? [])
      .some((range) => range.row < selection.row + Math.max(1, selection.rowCount) && selection.row < range.row + Math.max(1, range.rowCount)
        && range.col < selection.col + Math.max(1, selection.colCount) && selection.col < range.col + Math.max(1, range.colCount)));
    // Like the trial, an unfiltered view falls back to the whole sheet when the selection has no rules.
    rows = intersects.length || !rows.length ? intersects : rows;
  }
  return rows;
}

/** TASK 68: the manager's ▲/▼ buttons reorder the rule through the public
 *  remove + add API (rule evaluation order is the collection order). */
export function moveConditionalRule(designer: Designer, index: number, delta: number): void {
  const sheet = activeSheet(designer);
  const formats = conditionFormatsOf(sheet);
  const rules = [...formats.getRules()];
  const target = index + delta;
  if (index < 0 || index >= rules.length || target < 0 || target >= rules.length) return;
  const moved = rules[index]!;
  const reordered = [...rules];
  reordered.splice(index, 1);
  reordered.splice(target, 0, moved);
  for (const rule of rules) formats.removeRule(rule);
  for (const rule of reordered) formats.addRule(rule);
  refreshManager(designer, true);
}

/** Deletes the manager row `index` (the rules are re-read after every change). */
export function deleteConditionalRule(designer: Designer, index: number, reopen = true): void {
  const sheet = activeSheet(designer);
  const formats = conditionFormatsOf(sheet);
  const rule = formats.getRule(index);
  if (rule) formats.removeRule(rule);
  refreshManager(designer, reopen);
}

/** Toggles Stop If True of one rule. */
export function toggleConditionalRuleStop(designer: Designer, index: number, stop: boolean): void {
  const formats = conditionFormatsOf(activeSheet(designer));
  formats.getRule(index)?.stopIfTrue(stop);
  designer.invalidate();
  refreshManager(designer, true);
}

/** Duplicates the rule `index` onto the same ranges through the add* API. */
export function duplicateConditionalRule(designer: Designer, index: number): void {
  const sheet = activeSheet(designer);
  const formats = conditionFormatsOf(sheet);
  const rule = formats.getRule(index);
  if (!rule) return;
  const view = obj(rule);
  const ranges = (call(view, 'ranges') ?? []) as unknown[];
  const type = numCall(view, 'ruleType', -1);
  const ruleTypes = cfRuleTypes(designer);
  const style = call(view, 'style');
  const at = (name: string): boolean => Number(ruleTypes[name]) === type;
  if (at('cellValueRule')) formats.addCellValueRule?.(numCall(view, 'operator', 6), call(view, 'value1'), call(view, 'value2'), style, ranges);
  else if (at('formulaRule')) formats.addFormulaRule?.(String(call(view, 'formula') ?? 'TRUE'), style, ranges);
  else if (at('duplicateRule')) formats.addDuplicateRule?.(style, ranges);
  else if (at('uniqueRule')) formats.addUniqueRule?.(style, ranges);
  else if (at('averageRule')) formats.addAverageRule?.(numCall(view, 'type', 0), style, ranges);
  else if (at('top10Rule')) formats.addTop10Rule?.(numCall(view, 'type', 0), Number(call(view, 'rank') ?? 10), style, ranges, !!call(view, 'isPercent'));
  else if (at('dataBarRule')) formats.addDataBarRule?.(numCall(view, 'minType', 1), call(view, 'minValue'), numCall(view, 'maxType', 2), call(view, 'maxValue'), String(call(view, 'color') ?? '#638ec6'), ranges);
  else if (at('iconSetRule')) formats.addIconSetRule?.(numCall(view, 'iconSetType', 0), ranges);
  else formats.addFormulaRule?.('TRUE', style, ranges);
  refreshManager(designer, true);
}

/** Re-opens the manager with the fresh rows (the host shows one dialog at a time). */
function refreshManager(designer: Designer, reopen: boolean): void {
  if (!reopen) { designer.invalidate(); return; }
  const dialog = designer.dialog;
  if (dialog && dialog.name === MANAGER_TEMPLATE) {
    dialog.data = { ...dialog.data, rules: conditionalRuleRows(designer, String(dialog.data.scope ?? 'selection')), selected: -1 };
    designer.invalidate();
    return;
  }
  designer.invalidate();
}

/* ------------------------------------------------------------- rule editing --- */

/** Edit Rule...: loads the manager row into the rule dialog. */
export function editConditionalRule(designer: Designer, index: number): void {
  const formats = conditionFormatsOf(activeSheet(designer));
  const rule = formats.getRule(index);
  if (!rule) return;
  const view = obj(rule);
  const ruleTypes = cfRuleTypes(designer);
  const type = numCall(view, 'ruleType', -1);
  const is = (name: string): boolean => type === Number(ruleTypes[name]);
  const style = call(view, 'style');
  const data: Record<string, unknown> = { style: style && typeof style === 'object' ? { ...(style as Record<string, unknown>) } : undefined };
  if (is('cellValueRule')) Object.assign(data, { type: 1, operator: numCall(view, 'operator', 6), value1: call(view, 'value1'), value2: call(view, 'value2') });
  else if (is('formulaRule')) Object.assign(data, { type: 5, formula: String(call(view, 'formula') ?? '') });
  else if (is('duplicateRule') || is('uniqueRule')) Object.assign(data, { type: 4, uniqueOrDuplicate: is('uniqueRule') ? 'unique' : 'duplicate' });
  else if (is('averageRule')) Object.assign(data, { type: 3, average: numCall(view, 'type', 0) === 1 ? 'below' : 'above' });
  else if (is('top10Rule')) Object.assign(data, { type: 2, isTop: numCall(view, 'type', 0) === 0, rank: call(view, 'rank'), isPercent: !!call(view, 'isPercent') });
  else if (is('dataBarRule')) Object.assign(data, { type: 0, valueFormat: 'Data Bar', barColor: String(call(view, 'color') ?? '#638ec6') });
  else if (is('iconSetRule')) Object.assign(data, { type: 0, valueFormat: 'Icon Sets', iconSetType: numCall(view, 'iconSetType', 0) });
  else if (is('colorScaleRule')) {
    const scales = (call(view, 'colorScaleTypes') ?? call(view, 'scales') ?? []) as unknown[];
    Object.assign(data, { type: 0, valueFormat: scales.length >= 3 ? '3-Color Scale' : '2-Color Scale' });
  }
  else Object.assign(data, { type: 0, valueFormat: 'Style' });
  showNewFormattingRule(designer, undefined, { data, editing: index, returnToManager: true });
}

/** The manager's rule-dialog opener with the default preset. */
export function newConditionalRule(designer: Designer): void {
  showNewFormattingRule(designer, 'style', { returnToManager: true });
}

/* ------------------------------------------------------- Format... round-trip --- */

/** Format... inside the rule dialog: the Format Cells pick owned by the draft. */
export function editConditionalRuleStyle(designer: Designer): void {
  const draft = designer._conditionalRuleDraft;
  if (!draft) return;
  const data = beginFormatStylePick(
    { onOk: (style) => finishRuleStylePick(designer, style), onCancel: () => finishRuleStylePick(designer, undefined) },
    buildFormatData(designer), draft.data.style as Record<string, unknown> | undefined);
  designer.showDialog(FORMAT_TEMPLATE, data,
    (submitted) => { const target = takeFormatStyleTarget(); target?.onOk(styleFromFormatData(submitted as DialogData)); },
    () => { takeFormatStyleTarget()?.onCancel?.(); });
}

/** Puts the picked style into the draft and re-opens the rule dialog. */
function finishRuleStylePick(designer: Designer, style: Record<string, unknown> | undefined): void {
  const draft = designer._conditionalRuleDraft;
  if (!draft) return;
  if (style) draft.data = { ...draft.data, style };
  designer.showDialog(RULE_TEMPLATE, draft.data,
    (submitted) => {
      const current = designer._conditionalRuleDraft;
      designer._conditionalRuleDraft = undefined;
      applyConditionalRule(designer, submitted as DialogData, current?.editing);
      if (current?.returnToManager) showRuleManagerDialog(designer);
    },
    () => {
      const current = designer._conditionalRuleDraft;
      designer._conditionalRuleDraft = undefined;
      if (current?.returnToManager) showRuleManagerDialog(designer);
    });
}
