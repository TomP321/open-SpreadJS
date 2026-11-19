/* Conditional formatting dialogs (the Format > Conditional Format gallery footers
 * and the New/Manage Rules ribbon buttons). Structure measured black-box on the
 * running v19 trial (docs/STATUS.md, TASK 65):
 *  - "New Formatting Rule" — 430 x 390 dialog: a "Select a Rule Type:" list with
 *    the seven rule kinds (24 px rows, same list control as the table-style
 *    dialog), an "Edit the Rule Description:" area that shows the editor of the
 *    selected kind, and the OK/Cancel footer. The Format... button inside the
 *    editors opens the Format Cells dialog through the style bridge, so the draft
 *    lives on the designer and the dialog re-opens with it (one dialog at a time).
 *  - "Conditional Formatting Rules Manager" — the rule list of the active sheet
 *    (`conditionalFormats.getRules()`), one row per rule with a Stop-If-True
 *    checkbox, the rule description, the `applies to` range and a preview swatch;
 *    New Rule.../Edit Rule.../Duplicate/Delete buttons and OK/Cancel.
 * Every widget is our own markup/CSS; only the functional labels of the product
 * contract are reproduced. */
import React from 'react';
import type { DesignerApi as Designer } from '../designer-api.js';
import { CustomSelect } from './custom-widgets.js';
import { cellStateTypeLabel, CELL_STATE_TYPES, cellStateSwatchCss } from './CellStatesDialogs.js';

/** The trial's "Select a Rule Type:" rows, in its order. */
export const CF_RULE_TYPES = [
  'Format all cells based on their values',
  'Format only cells that contain',
  'Format only top or bottom ranked values',
  'Format only values that are above or below average',
  'Format only unique or duplicate values',
  'Use a formula to determine which cells to format',
  'Use a state to determine which rows or columns to format',
];

/** What "Format all cells based on their values" can format with (the trial's combo). */
/* TASK 68: the trial's Format style list for "Format all cells based on their
 * values" (measured from the running v19 trial). */
export const CF_VALUE_FORMATS = ['2-Color Scale', '3-Color Scale', 'Data Bar', 'Icon Sets', 'Sparkline'];

/** The "cell value" comparison operators of the trial (its combo order). */
export const CF_OPERATORS: { label: string; value: number }[] = [
  { label: 'between', value: 6 }, { label: 'not between', value: 7 },
  { label: 'equal to', value: 0 }, { label: 'not equal to', value: 1 },
  { label: 'greater than', value: 2 }, { label: 'greater than or equal to', value: 3 },
  { label: 'less than', value: 4 }, { label: 'less than or equal to', value: 5 },
];

/** Scale/mini max value types, the trial's combo order (public `ScaleValueType`). */
export const CF_SCALE_TYPES: { label: string; value: number }[] = [
  { label: 'Lowest Value', value: 1 }, { label: 'Highest Value', value: 2 },
  { label: 'Number', value: 0 }, { label: 'Percent', value: 3 },
  { label: 'Percentile', value: 4 }, { label: 'Formula', value: 6 },
];

/** The `IconSetType` families the manager lists by name (public enum, first members). */
export const CF_ICON_SETS: { label: string; value: number }[] = [
  { label: '3 Arrows', value: 0 }, { label: '3 Traffic Lights (Unrimmed)', value: 5 },
  { label: '3 Traffic Lights (Rimmed)', value: 6 }, { label: '3 Signs', value: 7 },
  { label: '3 Symbols', value: 8 }, { label: '4 Arrows', value: 9 },
  { label: '4 Ratings', value: 12 }, { label: '5 Arrows', value: 17 },
  { label: '5 Ratings', value: 20 },
];

/** One rule row of the manager (`sheet.conditionalFormats.getRules()`). */
export interface RuleRow {
  index: number;
  /** The public `RuleType` number of the rule. */
  ruleType: number;
  /** One-line description like the trial's list column. */
  description: string;
  /** A1 text of the rule's ranges. */
  appliesTo: string;
  stopIfTrue: boolean;
  /** The rule's style record (undefined for data bar/scale/icon rules). */
  style?: Record<string, unknown>;
  /** The rule kind key the editors use (to re-open the editor on Edit). */
  kind: string;
}

interface Props { designer: Designer; data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void }

const L = (props: { children: React.ReactNode; className?: string }): React.ReactElement =>
  <span className={props.className ?? 'gc-dialog-label'}>{props.children}</span>;

/** A New Formatting Rule dropdown: the trial's CustomSelect, kept on the shared
 *  `gc-dialog-select` width classes so the CF grid sizes stay measured-accurate. */
const Sel = (props: { value: unknown; options: { text: string; value: unknown }[]; onChange: (value: unknown) => void; ariaLabel: string; className?: string }): React.ReactElement =>
  <CustomSelect className={`gc-dialog-select${props.className ? ` ${props.className}` : ''}`} ariaLabel={props.ariaLabel} value={props.value} options={props.options} onChange={props.onChange} />;

/** The Format Cells... launcher of every editor (round-trips through the draft). */
function FormatButton({ designer, style }: { designer: Designer; style?: Record<string, unknown> }): React.ReactElement {
  return (
    <span className="gc-cf-format-row">
      <L>Format:</L>
      <span className="gc-cell-states-swatch gc-cf-preview-swatch" style={style ? cellStateSwatchCss(style) : undefined}>AaBbCcYyZz</span>
      <button type="button" className="gc-dialog-secondary gc-cf-format" onClick={() => designer.editConditionalRuleStyle()}>Format...</button>
    </span>
  );
}

/** TASK 68: the trial's scale editor grid: Minimum/(Midpoint)/Maximum columns
 *  with Type/Value/Color rows and a full-width gradient Preview bar. */
function scaleGrid(columns: ('min' | 'mid' | 'max')[], data: Record<string, unknown>, update: (path: string | undefined, value: unknown) => void): React.ReactElement {
  const titles = { min: 'Minimum', mid: 'Midpoint', max: 'Maximum' } as const;
  const placeholders = { min: '(Lowest Value)', mid: '(Midpoint Value)', max: '(Highest Value)' } as const;
  const defaults = { min: '#f8696b', mid: '#ffeb84', max: '#63be7b' } as const;
  const type = (role: 'min' | 'mid' | 'max'): number => Number(data[`${role}Type`] ?? (role === 'min' ? 1 : role === 'max' ? 2 : 3));
  const editable = (role: 'min' | 'mid' | 'max'): boolean => [0, 3, 4, 6].includes(type(role));
  const cell = (role: 'min' | 'mid' | 'max', kind: 'type' | 'value' | 'color'): React.ReactElement => {
    if (kind === 'type') return (
      <Sel key={role} className="gc-cf-scale-select" ariaLabel={`${titles[role]} type`} value={type(role)} options={CF_SCALE_TYPES.map((item) => ({ text: item.label, value: item.value }))} onChange={(next) => update(`${role}Type`, Number(next))} />
    );
    if (kind === 'value') return (
      <input key={role} className="gc-dialog-input gc-cf-scale-value" aria-label={`${titles[role]} value`} disabled={!editable(role)}
        placeholder={placeholders[role]} value={String(data[`${role}Value`] ?? '')} onChange={(event) => update(`${role}Value`, event.target.value)} />
    );
    return (
      <span key={role} className="gc-cf-scale-color">
        <input type="color" className="gc-cf-color" aria-label={`${titles[role]} color`}
          value={/^#([0-9a-f]{6})$/i.test(String(data[`${role}Color`])) ? String(data[`${role}Color`]) : defaults[role]}
          onChange={(event) => update(`${role}Color`, event.target.value)} />
      </span>
    );
  };
  const colors = columns.map((role) => (/^#([0-9a-f]{6})$/i.test(String(data[`${role}Color`])) ? String(data[`${role}Color`]) : defaults[role]));
  return <div className="gc-cf-scale-grid" style={{ gridTemplateColumns: `10px 76px repeat(${columns.length}, 1fr)` }}>
    <div className="gc-cf-scale-grid-row gc-cf-scale-grid-head"><span /><span />{columns.map((role) => <span key={role}>{titles[role]}</span>)}</div>
    <div className="gc-cf-scale-grid-row"><span /><L>Type:</L>{columns.map((role) => cell(role, 'type'))}</div>
    <div className="gc-cf-scale-grid-row"><span /><L>Value:</L>{columns.map((role) => cell(role, 'value'))}</div>
    <div className="gc-cf-scale-grid-row"><span /><L>Color:</L>{columns.map((role) => cell(role, 'color'))}</div>
    <div className="gc-cf-scale-grid-row"><span /><L>Preview:</L><span className="gc-cf-scale-preview" style={{ gridColumn: `span ${columns.length}`, background: `linear-gradient(90deg, ${colors.join(', ')})` }} /></div>
  </div>;
}

/** The body of the "New Formatting Rule" dialog. */
export function NewFormattingRuleBody({ designer, data, update }: Props): React.ReactElement {
  const type = Math.max(0, Math.min(CF_RULE_TYPES.length - 1, Number(data.type ?? 0)));
  const style = (data.style ?? undefined) as Record<string, unknown> | undefined;
  const valueFormat = String(data.valueFormat ?? 'Style');
  const num = (key: string, fallback: number): number => Number(data[key] ?? fallback);
  const text = (key: string): string => String(data[key] ?? '');
  const scaleRow = (role: 'min' | 'mid' | 'max', showValue: boolean): React.ReactElement => (
    <div className="gc-cf-scale-row" key={role}>
      <L>{role === 'min' ? 'Min:' : role === 'max' ? 'Max:' : 'Midpoint:'}</L>
      <Sel ariaLabel={`${role} type`} value={String(data[`${role}Type`] ?? (role === 'min' ? 1 : role === 'max' ? 2 : 3))} options={CF_SCALE_TYPES.map((item) => ({ text: item.label, value: item.value }))} onChange={(next) => update(`${role}Type`, Number(next))} />
      {showValue && <input className="gc-dialog-input gc-cf-scale-value" aria-label={`${role} value`} value={text(`${role}Value`)} onChange={(event) => update(`${role}Value`, event.target.value)} />}
      <input type="color" className="gc-cf-color" aria-label={`${role} color`} value={/^#([0-9a-f]{6})$/i.test(String(data[`${role}Color`])) ? String(data[`${role}Color`]) : role === 'min' ? '#f8696b' : role === 'max' ? '#63be7b' : '#ffeb84'}
        onChange={(event) => update(`${role}Color`, event.target.value)} />
    </div>
  );
  return (
    <div className="gc-cf-rule-dialog">
      <fieldset className="gc-cf-rule-types">
        <legend>Select a Rule Type:</legend>
        <div className="gc-cf-rule-type-list" role="listbox" aria-label="Select a Rule Type:">
          {CF_RULE_TYPES.map((label, index) => (
            <div key={label} role="option" aria-selected={index === type} data-value={String(index)}
              className={`gc-cf-rule-type${index === type ? ' selected' : ''}`}
              onClick={() => update('type', index)}>►{label}</div>
          ))}
        </div>
      </fieldset>
      <fieldset className="gc-cf-rule-description">
        <legend>Edit the Rule Description:</legend>
        {type === 0 && (
          <fieldset className="gc-cf-rule-group"><legend>{CF_RULE_TYPES[0]}:</legend>
          <div className="gc-cf-editor gc-cf-editor-values">
            <div className="gc-cf-line">
              <L>Format style:</L>
              <Sel className="gc-cf-value-format" ariaLabel="Format style:" value={valueFormat} options={CF_VALUE_FORMATS.map((label) => ({ text: label, value: label }))} onChange={(next) => update('valueFormat', String(next))} />
            </div>
            {valueFormat === 'Style' && <FormatButton designer={designer} style={style} />}
            {valueFormat === 'Data Bar' && (
              <div className="gc-cf-bar">
                {scaleRow('min', false)}
                {scaleRow('max', false)}
                <div className="gc-cf-scale-row">
                  <L>Color:</L>
                  <input type="color" className="gc-cf-color" aria-label="Bar color" value={/^#([0-9a-f]{6})$/i.test(text('barColor')) ? text('barColor') : '#638ec6'}
                    onChange={(event) => update('barColor', event.target.value)} />
                </div>
                <label className="gc-cf-check"><input type="checkbox" checked={!!data.showBarOnly} onChange={(event) => update('showBarOnly', event.target.checked)} /> Show Bar Only</label>
              </div>
            )}
            {(valueFormat === '2-Color Scale' || valueFormat === '3-Color Scale') && scaleGrid(valueFormat === '3-Color Scale' ? ['min', 'mid', 'max'] : ['min', 'max'], data, update)}
            {(valueFormat === 'Icon Sets' || valueFormat === 'Icon Set') && (
              <div className="gc-cf-iconset">
                <div className="gc-cf-line">
                  <L>Icon Style:</L>
                  <Sel ariaLabel="Icon Style" value={String(num('iconSetType', 0))} options={CF_ICON_SETS.map((item) => ({ text: item.label, value: item.value }))} onChange={(next) => update('iconSetType', Number(next))} />
                </div>
                <label className="gc-cf-check"><input type="checkbox" checked={!!data.showIconOnly} onChange={(event) => update('showIconOnly', event.target.checked)} /> Show Icon Only</label>
              </div>
            )}
            {valueFormat === 'Sparkline' && (
              <div className="gc-cf-sparkline">
                <div className="gc-cf-line">
                  <L>Sparkline:</L>
                  <Sel ariaLabel="Sparkline" value={String(data.sparklineKind ?? 'Line')} options={['Line', 'Column', 'Win/Loss'].map((kind) => ({ text: kind, value: kind }))} onChange={(next) => update('sparklineKind', String(next))} />
                </div>
                <div className="gc-cf-line">
                  <L>Color:</L>
                  <input type="color" className="gc-cf-color" aria-label="Sparkline color" value={/^#([0-9a-f]{6})$/i.test(text('sparklineColor')) ? text('sparklineColor') : '#638ec6'}
                    onChange={(event) => update('sparklineColor', event.target.value)} />
                </div>
              </div>
            )}
          </div>
          </fieldset>
        )}
        {type === 1 && (
          <div className="gc-cf-editor gc-cf-editor-contain">
            <div className="gc-cf-line gc-cf-operator">
              <L>Cell Value</L>
              <Sel ariaLabel="operator" value={String(num('operator', 6))} options={CF_OPERATORS.map((item) => ({ text: item.label, value: item.value }))} onChange={(next) => update('operator', Number(next))} />
              <input className="gc-dialog-input gc-cf-value" aria-label="value" value={text('value1')} onChange={(event) => update('value1', event.target.value)} />
              {Number(data.operator ?? 6) <= 7 && <input className="gc-dialog-input gc-cf-value" aria-label="second value" value={text('value2')} onChange={(event) => update('value2', event.target.value)} />}
            </div>
            <FormatButton designer={designer} style={style} />
          </div>
        )}
        {type === 2 && (
          <div className="gc-cf-editor gc-cf-editor-rank">
            <div className="gc-cf-line">
              <Sel ariaLabel="top or bottom" value={data.isTop === false ? 'bottom' : 'top'} options={[{ text: 'top', value: 'top' }, { text: 'bottom', value: 'bottom' }]} onChange={(next) => update('isTop', String(next) === 'top')} />
              <input className="gc-dialog-input gc-cf-rank" aria-label="rank" value={text('rank') || '10'} onChange={(event) => update('rank', event.target.value)} />
              <label className="gc-cf-check"><input type="checkbox" checked={!!data.isPercent} onChange={(event) => update('isPercent', event.target.checked)} /> %</label>
            </div>
            <FormatButton designer={designer} style={style} />
          </div>
        )}
        {type === 3 && (
          <div className="gc-cf-editor gc-cf-editor-average">
            <div className="gc-cf-line">
              <L>For cells in the selected range that are</L>
              <Sel ariaLabel="average" value={String(data.average ?? 'above')} options={[{ text: 'above', value: 'above' }, { text: 'below', value: 'below' }]} onChange={(next) => update('average', String(next))} />
              <L>the average</L>
            </div>
            <FormatButton designer={designer} style={style} />
          </div>
        )}
        {type === 4 && (
          <div className="gc-cf-editor gc-cf-editor-unique">
            <div className="gc-cf-line">
              <L>All cells</L>
              <Sel ariaLabel="unique or duplicate" value={String(data.uniqueOrDuplicate ?? 'duplicate')} options={[{ text: 'duplicate', value: 'duplicate' }, { text: 'unique', value: 'unique' }]} onChange={(next) => update('uniqueOrDuplicate', String(next))} />
              <L>values</L>
            </div>
            <FormatButton designer={designer} style={style} />
          </div>
        )}
        {type === 5 && (
          <div className="gc-cf-editor gc-cf-editor-formula">
            <div className="gc-cf-line"><L>Format only values that result in</L></div>
            <input className="gc-dialog-input gc-cf-formula" aria-label="formula" value={text('formula')} onChange={(event) => update('formula', event.target.value)} />
            <FormatButton designer={designer} style={style} />
          </div>
        )}
        {type === 6 && (
          <div className="gc-cf-editor gc-cf-editor-state">
            <div className="gc-cf-line">
              <Sel ariaLabel="rows or columns" value={String(data.stateScope ?? 'row')} options={[{ text: 'rows', value: 'row' }, { text: 'columns', value: 'column' }]} onChange={(next) => update('stateScope', String(next))} />
              <L>having the state</L>
              <Sel ariaLabel="state" value={String(num('state', 1))} options={CELL_STATE_TYPES.map((item) => ({ text: item.label, value: item.value }))} onChange={(next) => update('state', Number(next))} />
            </div>
            <FormatButton designer={designer} style={style} />
          </div>
        )}
      </fieldset>
    </div>
  );
}

/** The label of a state rule's state, mirroring the trial's column. */
export const cfStateLabel = (state: number): string => cellStateTypeLabel(state);

/** A cell label of the rule grid. The trial draws the whole list (header and rule
 *  rows) on a canvas, so its text is visible but never part of the DOM text; we
 *  reproduce that with CSS generated content — same look, same text exposure. */
function CfLabel({ label }: { label: string }): React.ReactElement {
  return <span className="gc-cf-gen" data-label={label} />;
}

/** The body of the "Conditional Formatting Rules Manager" dialog. */
export function RuleManagerBody({ designer, data, update }: Props): React.ReactElement {
  const rows = (data.rules ?? []) as RuleRow[];
  // The trial lists rules with the highest priority first — newest added at the top.
  const shown = [...rows].reverse();
  const selected = Number(data.selected ?? -1);
  const selectedIndex = shown[selected]?.index ?? selected;
  const tool = (label: string, disabled: boolean, onClick: () => void, arrow?: 'up' | 'down'): React.ReactElement => (
    <button type="button" className={`gc-dialog-secondary gc-cf-tool${arrow ? ' gc-cf-move' : ''}`} disabled={disabled} onClick={onClick}>
      {arrow ? <span className={`gc-cf-arrow ${arrow}`} aria-hidden="true" /> : label}
    </button>
  );
  return (
    <div className="gc-cf-manager">
      <div className="gc-cf-manager-scope">
        <L>Show formatting rules for:</L>
        <Sel ariaLabel="Show formatting rules for:" value={String(data.scope ?? 'selection')} options={[{ text: 'Current Selection', value: 'selection' }, { text: 'This Sheet', value: 'sheet' }]} onChange={(next) => designer.refreshConditionalRuleManager(String(next))} />
      </div>
      <div className="gc-cf-manager-toolbar">
        <button type="button" className="gc-dialog-secondary gc-cf-tool" onClick={() => designer.newConditionalRule()}>New Rule...</button>
        {tool('Edit Rule...', selected < 0, () => designer.editConditionalRule(selectedIndex))}
        {tool('Delete Rule', selected < 0, () => designer.deleteConditionalRule(selectedIndex))}
        {tool('', selected < 0 || selected === 0, () => designer.moveConditionalRule(selectedIndex, 1), 'up')}
        {tool('', selected < 0 || selected >= shown.length - 1, () => designer.moveConditionalRule(selectedIndex, -1), 'down')}
      </div>
      <div className="gc-cf-manager-list" role="table" aria-label="Conditional Formatting Rules">
        <div className="gc-cf-manager-row gc-cf-manager-head" role="row">
          <span role="columnheader" className="gc-cf-manager-desc"><CfLabel label="Rule (applied in order shown)" /></span>
          <span role="columnheader" className="gc-cf-manager-format"><CfLabel label="Format" /></span>
          <span role="columnheader" className="gc-cf-manager-range"><CfLabel label="Applies to" /></span>
          <span role="columnheader" className="gc-cf-manager-stop"><CfLabel label="Stop If True" /></span>
        </div>
        <div className="gc-cf-manager-body">
          {shown.map((item, index) => (
            <div key={index} role="row" aria-selected={index === selected} tabIndex={0}
              className={`gc-cf-manager-row${index === selected ? ' selected' : ''}`}
              onClick={() => update('selected', index)}>
              <span role="cell" className="gc-cf-manager-desc">{item.description}</span>
              <span role="cell" className="gc-cf-manager-format">
                {item.style
                  ? <span className="gc-cell-states-swatch gc-cf-format-swatch" style={cellStateSwatchCss(item.style)}>AaBbCcYyZz</span>
                  : null}
              </span>
              <span role="cell" className="gc-cf-manager-range">{item.appliesTo}</span>
              <span role="cell" className="gc-cf-manager-stop">
                <span role="checkbox" aria-label="stop if true" aria-checked={item.stopIfTrue}
                  className={`gc-cf-stop-box${item.stopIfTrue ? ' checked' : ''}`}
                  onClick={(event) => { event.stopPropagation(); designer.toggleConditionalRuleStop(item.index, !item.stopIfTrue); }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
