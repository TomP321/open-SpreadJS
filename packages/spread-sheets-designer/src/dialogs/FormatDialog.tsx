/* Custom Format Cells body. The shell geometry follows the running v19 trial:
 * 678 x 576.7 dialog, 34 px header, 30 px tab strip and 45.7 px footer. */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DesignerApi as Designer } from '../designer-api.js';
import type { GCRoot } from '../core-internals.js';
import { getResources, resolveText, uiKey } from '../resolve.js';
import { CUSTOM_CODES, DATE_TYPES, FRACTION_TYPES, LOCALE_ITEMS, NUMBER_CATEGORIES, SPECIAL_TYPES, SYMBOL_ITEMS, TIME_TYPES, numberFormatterFor } from './number-format.js';
import { CustomSelect } from './custom-widgets.js';
import { T } from './t.js';

interface Props { designer: Designer; data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void }

const CATEGORIES = NUMBER_CATEGORIES;

/** TASK 87: labels that exist in the resource tree (`formatDialog.*`) follow the
 * loaded language package; the English defaults keep the current rendering. */
const fmt = (designer: Designer, key: string, fallback: string): string =>
  resolveText(`\${res.formatDialog.${key}}`, designer.resources) || fallback;

/** TASK 87: localized display text for a data-bearing English name (the raw value stays
 * in state/data; only the rendering follows the loaded language package). */
const displayName = (designer: Designer, name: string, tree = 'dialogs'): string =>
  resolveText(`\${res.${tree}.${uiKey(name)}}`, designer.resources) || name;
/** Fill palette: 'Accent 1 80' = theme name + tint; translate the name, keep the tint. */
const paletteName = (designer: Designer, token: string): string => {
  const m = /^(.*) (-?\d+)$/.exec(token);
  return m ? `${displayName(designer, m[1], 'themeColorNames')} ${m[2]}` : displayName(designer, token, 'themeColorNames');
};

/** Resource key for each internal (English, value-bearing) category name. */
const CATEGORY_KEYS: Record<string, string> = {
  General: 'general', Number: 'number', Currency: 'currency', Accounting: 'accounting', Date: 'date', Time: 'time',
  Percentage: 'percentage', Fraction: 'fraction', Scientific: 'scientific', Text: 'text', Special: 'special', Custom: 'custom',
};

const TABS = [
  { key: 'number', text: '${res.formatDialog.number}' },
  { key: 'alignment', text: '${res.formatDialog.alignment}' },
  { key: 'font', text: '${res.formatDialog.font}' },
  { key: 'border', text: '${res.formatDialog.border}' },
  { key: 'fill', text: '${res.formatDialog.fill}' },
  { key: 'cellButton', text: '${res.dialogs.cellButton}' },
  { key: 'padding', text: '${res.dialogs.padding}' },
  { key: 'decoration', text: '${res.dialogs.decoration}' },
  { key: 'protection', text: '${res.formatDialog.protection}' },
  { key: 'mask', text: '${res.dialogs.mask}' },
];

const DESCRIPTIONS: Record<string, string> = {
  General: 'General format cells have no specific number format.',
  Number: 'Number is used for general display of numbers. Currency and Accounting offer specialized formatting for monetary values.',
  Currency: 'Currency formats are used for general monetary values. Use Accounting formats to align decimal points in a column.',
  Accounting: 'Accounting formats line up the currency symbols and decimal points in a column.',
  Date: 'Date formats display date and time serial numbers as date values.',
  Time: 'Time formats display date and time serial numbers as date values.',
  Percentage: 'Percentage formats multiply the cell value by 100 and display the result with a percent symbol.',
  Fraction: 'Fraction formats display a number as a fraction.',
  Scientific: 'Scientific formats display a number in exponential notation.',
  Text: 'Text format cells are treated as text even when a number is in the cell. The cell is displayed exactly as entered.',
  Special: 'Special formats are useful for tracking list and database values.',
  Custom: 'Type the number format code, using one of the existing codes as a starting point.',
};

function Label({ text, className }: { text: string; className?: string }): React.ReactElement {
  return <div className={`gc-dialog-label${className ? ` ${className}` : ''}`}>{text}</div>;
}
function Input({ value, onChange, className, type, 'aria-label': ariaLabel }: { value: unknown; onChange: (v: string) => void; className?: string; type?: string; 'aria-label'?: string }): React.ReactElement {
  return <input className={`gc-dialog-input${className ? ` ${className}` : ''}`} type={type} aria-label={ariaLabel} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />;
}
function Select({ value, onChange, items, className, 'aria-label': ariaLabel }: { value: unknown; onChange: (v: string) => void; items: { text: string; value: string }[]; className?: string; 'aria-label'?: string }): React.ReactElement {
  return <CustomSelect className={`gc-dialog-select${className ? ` ${className}` : ''}`} ariaLabel={ariaLabel ?? ''} value={value} options={items} onChange={(next) => onChange(String(next))} />;
}
function Check({ text, checked, onChange, className }: { text: string; checked: boolean; onChange: (v: boolean) => void; className?: string }): React.ReactElement {
  return <label className={`gc-dialog-checkbox${className ? ` ${className}` : ''}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{text}</span></label>;
}

/* Number tab, positioned like the trial (dialog-px minus the (12,85) tab-content origin):
 * Category list left; Sample fieldset + a per-category editor on the right; the category
 * description under the list. Options: Decimal places spinner + "Use 1000 Separator(,)" +
 * a Negative numbers list (Number/Currency), Symbol combo (Currency/Accounting), Type list
 * + locale (location) combo (Date/Time/Special), Type list (Fraction) and the Custom
 * "Type:" list-editor with a Delete button. The Sample box formats the active cell's value
 * with the formatter the state stands for — the same codes numberFormatterFor() writes. */
const TYPE_LISTS: Record<string, string[]> = { Date: DATE_TYPES, Time: TIME_TYPES, Fraction: FRACTION_TYPES, Special: SPECIAL_TYPES };

function NumberTab({ designer, data, update }: Props): React.ReactElement {
  const category = String(data.category ?? 'General');
  const decimals = Math.round(Number(data.decimals ?? 2));
  const separator = !!data.separator;
  const negative = Number(data.negative ?? 0);
  const symbol = Number(data.symbol ?? 1);
  const type = Number(data.type ?? 0);
  const locale = Number(data.locale ?? 0);
  const code = String(data.formatCode ?? '');
  const options = { decimals, separator, negative, symbol, type, locale };
  const formatter = category === 'Custom' ? code : numberFormatterFor(category, options);

  const formatPreview = (pattern: string | undefined, value: unknown): string => {
    if (pattern === undefined || pattern === '' || pattern === 'General') return String(value ?? '');
    try { return String(new designer.gc.Spread.Formatter.GeneralFormatter(pattern).format(value as never)); } catch { return String(value ?? ''); }
  };
  const sampleValue = data.sampleValue ?? '';
  const sampleText = category === 'General' ? String(sampleValue ?? '') : formatPreview(formatter, sampleValue);

  const choose = (value: string): void => {
    // Entering Custom keeps the code currently displayed; every other category resets
    // its option widgets to the trial defaults (decimals 2, first list item, $ symbol).
    if (value === 'Custom') update('formatCode', formatter ?? '');
    update('category', value);
    update('decimals', 2); update('separator', false); update('negative', 0); update('symbol', 1); update('type', 0); update('locale', 0);
  };

  const hasSpinner = category === 'Number' || category === 'Currency' || category === 'Accounting' || category === 'Percentage' || category === 'Scientific';
  const negativeList = (category === 'Number' || category === 'Currency') ? formatter : undefined;
  const negativeLabels = negativeList === undefined ? [] : [0, 1, 2, 3].map((i) => formatPreview(numberFormatterFor(category, { ...options, negative: i }), -1234.1));
  const typeItems = TYPE_LISTS[category];
  const showDesc = category !== 'General' && category !== 'Text' && category !== 'Fraction' && category !== 'Scientific';

  return (
    <div className="gc-format-number-layout">
      <div className="gc-num-cat-label">{fmt(designer, 'category', 'Category:')}</div>
      {/* The trial frames the category list in its own bordered box (150x382, bottom edge
          46px below the last item); the role=listbox list is the inner 336px column. */}
      <div className="gc-num-cat-frame">
        <div className="gc-num-cat-list" role="listbox" aria-label={fmt(designer, 'category', 'Category:')}>
          {CATEGORIES.map((name) => <div key={name} role="option" aria-selected={category === name} title={CATEGORY_KEYS[name] ? fmt(designer, CATEGORY_KEYS[name]!, name) : name} className={`gc-num-cat-item${category === name ? ' selected' : ''}`} onClick={() => choose(name)}>{CATEGORY_KEYS[name] ? fmt(designer, CATEGORY_KEYS[name]!, name) : name}</div>)}
        </div>
      </div>
      <fieldset className="gc-num-sample"><legend>{fmt(designer, 'sample', 'Sample')}</legend><div className="gc-num-sample-text">{sampleText}</div></fieldset>
      {(category === 'General' || category === 'Text') && <div className="gc-num-comment">{T(uiKey(DESCRIPTIONS[category]), DESCRIPTIONS[category])}</div>}
      {hasSpinner && <>
        <div className="gc-num-label gc-num-dec-label">{fmt(designer, 'decimalPlaces', 'Decimal places:')}</div>
        <Spinner className="gc-num-dec-spinner" ariaLabel={fmt(designer, 'decimalPlaces', 'Decimal places:')} min={0} max={30} value={decimals} onChange={(v) => update('decimals', v)} />
      </>}
      {category === 'Number' && <BoxCheck className="gc-num-sep" text={T('use1000Separator', 'Use 1000 Separator(,)')} checked={separator} onChange={(v) => update('separator', v)} />}
      {(category === 'Currency' || category === 'Accounting') && <>
        <div className="gc-num-label gc-num-sym-label">{fmt(designer, 'symbol', 'Symbol:')}</div>
        <Select className="gc-format-align-combo gc-num-sym-combo" value={symbol} onChange={(v) => update('symbol', Number(v))} items={SYMBOL_ITEMS.map((text, i) => ({ text, value: String(i) }))} />
      </>}
      {negativeList !== undefined && <>
        <div className="gc-num-label gc-num-neg-label">{fmt(designer, 'negativeNumbers', 'Negative numbers:')}</div>
        <div className="gc-num-list gc-num-neg-list">
          {negativeLabels.map((label, i) => <div key={i} role="option" aria-selected={negative === i} className={`gc-num-list-row${negative === i ? ' selected' : ''}${i % 2 === 1 ? ' negative-item' : ''}`} onClick={() => update('negative', i)}>{label}</div>)}
        </div>
      </>}
      {typeItems && <>
        <div className="gc-num-label gc-num-type-label">{fmt(designer, 'type', 'Type:')}</div>
        <div className="gc-num-list gc-num-type-list">
          {typeItems.map((label, i) => <div key={i} role="option" aria-selected={type === i} title={T(uiKey(label), label)} className={`gc-num-list-row${type === i ? ' selected' : ''}`} onClick={() => update('type', i)}>{T(uiKey(label), label)}</div>)}
        </div>
      </>}
      {(category === 'Date' || category === 'Time' || category === 'Special') && <>
        <div className="gc-num-label gc-num-locale-label">{T('localeLocation', 'locale (location):')}</div>
        <Select className="gc-format-align-combo gc-num-locale-combo" value={locale} onChange={(v) => update('locale', Number(v))} items={LOCALE_ITEMS.map((text, i) => ({ text, value: String(i) }))} />
      </>}
      {category === 'Custom' && <>
        <div className="gc-num-label gc-num-type-label">{fmt(designer, 'type', 'Type:')}</div>
        <div className="gc-num-custom">
          <input className="gc-num-custom-input" aria-label={fmt(designer, 'type', 'Type:')} value={code} onChange={(event) => update('formatCode', event.target.value)} />
          <div className="gc-num-custom-list" role="listbox">
            {CUSTOM_CODES.map((item) => <div key={item} role="option" aria-selected={code === item} title={item} className={`gc-num-list-row${code === item ? ' selected' : ''}`} onClick={() => update('formatCode', item)}>{item}</div>)}
          </div>
          <button type="button" className="gc-num-delete" disabled={!code || CUSTOM_CODES.includes(code)} onClick={() => update('formatCode', '')}>{resolveText('${res.delete}', designer.resources) || 'Delete'}</button>
        </div>
      </>}
      {showDesc && <div className="gc-num-desc">{T(uiKey(DESCRIPTIONS[category]), DESCRIPTIONS[category])}</div>}
    </div>
  );
}

/* Spinner like the trial's: 80x24 box, plain input plus a 19px column with stacked up/down
 * arrow buttons (own SVG triangles). Text commits on Enter/blur; values are integers clamped
 * to [min, max]. */
function Spinner({ value, onChange, className, min = -90, max = 999, ariaLabel }: { value: number; onChange: (v: number) => void; className?: string; min?: number; max?: number; ariaLabel?: string }): React.ReactElement {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const clamp = (v: number): number => Math.min(max, Math.max(min, Math.round(v)));
  const commit = (): void => {
    const n = Math.round(Number(text));
    if (text.trim() === '' || !Number.isFinite(n)) setText(String(value));
    else { const next = clamp(n); setText(String(next)); if (next !== Number(value)) onChange(next); }
  };
  const step = (delta: number): void => onChange(clamp(Number(value) + delta));
  return (
    <span className={`gc-format-spinner${className ? ` ${className}` : ''}`}>
      <input className="gc-format-spinner-input" aria-label={ariaLabel} value={text}
        onChange={(event) => setText(event.target.value)} onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }} />
      <span className="gc-format-spinner-buttons">
        <button type="button" aria-label={T('increase', 'Increase')} onClick={() => step(1)}><svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true"><path d="M4.5 0.5 8.5 5.5H0.5z" /></svg></button>
        <button type="button" aria-label={T('decrease', 'Decrease')} onClick={() => step(-1)}><svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true"><path d="M4.5 5.5 0.5 0.5h8z" /></svg></button>
      </span>
    </span>
  );
}

/* Half-dial of the trial Orientation widget, drawn with our own SVG: 13 marks every 15° from
 * +90 to -90 (larger diamonds at 90/45/0/-45/-90, small diamonds in between), a "Text" word and
 * a line rotating around the arc centre, and a red diamond marker at the current angle.
 * Clicking or dragging along the arc sets an integer angle clamped to [-90, 90]. */
function OrientationDial({ angle, onChange }: { angle: number; onChange: (a: number) => void }): React.ReactElement {
  const CX = 11.5, CY = 74.5, R = 67;
  const dragging = useRef(false);
  const setFrom = (event: React.PointerEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - rect.left - (CX + 1), dy = event.clientY - rect.top - (CY + 1);
    let deg = Math.round((Math.atan2(-dy, dx) * 180) / Math.PI);
    if (deg > 90) deg = 90;
    if (deg < -90) deg = -90;
    onChange(deg);
  };
  const marks: React.ReactElement[] = [];
  for (let a = 90; a >= -90; a -= 15) {
    const rad = (a * Math.PI) / 180;
    const x = CX + R * Math.cos(rad), y = CY - R * Math.sin(rad);
    const side = a % 45 === 0 ? 5.02 : 2.12;
    marks.push(<rect key={a} x={x - side / 2} y={y - side / 2} width={side} height={side} transform={`rotate(45 ${x} ${y})`} fill="#242424" />);
  }
  const markerX = CX + R;
  return (
    <svg className="gc-format-orientation-dial" width="92" height="152" viewBox="0 0 92 152" aria-label={T('textOrientationDial', 'Text orientation dial')}
      onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); setFrom(event); }}
      onPointerMove={(event) => { if (dragging.current) setFrom(event); }}
      onPointerUp={() => { dragging.current = false; }}
    >
      {marks}
      <g transform={`rotate(${-angle} ${CX} ${CY})`}>
        <text x={CX - 2.5} y={CY + 3} fontSize="12" fill="#242424">{T('text', 'Text')}</text>
        <line x1={CX + 30} y1={CY - 1} x2={markerX - 5} y2={CY - 1} stroke="#3f3f3f" />
        <rect x={markerX - 2.51} y={CY + 1 - 2.51} width="5.02" height="5.02" transform={`rotate(45 ${markerX} ${CY + 1})`} fill="#ff0000" />
      </g>
    </svg>
  );
}

/* Checkbox of the Alignment tab as the trial draws it: a 16px box with our own check path. */
function BoxCheck({ text, checked, onChange, className }: { text: string; checked: boolean; onChange: (v: boolean) => void; className?: string }): React.ReactElement {
  return (
    <div className={`gc-align-check${checked ? ' checked' : ''}${className ? ` ${className}` : ''}`} role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="gc-align-check-box">{checked && <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 8.4 6.5 11.5 12.6 4.7" fill="none" stroke="#444444" strokeWidth="1.4" /></svg>}</span>
      <span className="gc-align-check-label">{text}</span>
    </div>
  );
}

const H_ALIGN_ITEMS = [
  { text: '${res.formatDialog.generalAlign}', value: '3' }, { text: '${res.formatDialog.left}', value: '0' }, { text: '${res.formatDialog.center}', value: '1' }, { text: '${res.formatDialog.right}', value: '2' },
  { text: '${res.formatDialog.centerContinuous}', value: '4' }, { text: '${res.formatDialog.distributed}', value: '5' }, { text: '${res.formatDialog.justify}', value: '6' },
];
const V_ALIGN_ITEMS = [
  { text: '${res.formatDialog.top}', value: '0' }, { text: '${res.formatDialog.center}', value: '1' }, { text: '${res.formatDialog.bottom}', value: '2' }, { text: '${res.formatDialog.justify}', value: '3' },
];
const TEXT_DIRECTION_ITEMS = [
  { text: '', value: '' }, { text: '${res.formatDialog.context}', value: '0' }, { text: '${res.formatDialog.leftToRight}', value: '1' }, { text: '${res.dialogs.rightToLeft}', value: '2' },
];

/* Alignment tab, positioned like the trial: titled groups with rules and combo rows on the left
 * (Horizontal/Vertical + Indent, the four control checkboxes, Text direction), and on the right
 * an Orientation box: vertical-text toggle, half-dial and Degrees spinner, all two-way synced.
 * Vertical text and a rotation angle are mutually exclusive, exactly like the trial: picking one
 * resets the other (vertical text clears the angle to 0, any angle edit clears the toggle). */
function AlignmentTab({ data, update, designer }: Props): React.ReactElement {
  const bool = (key: string): boolean => !!data[key];
  const loc = (items: { text: string; value: string }[]): { text: string; value: string }[] => items.map((item) => ({ ...item, text: resolveText(item.text, designer.resources) }));
  const angle = Number(data.orientation ?? 0);
  const setAngle = (deg: number): void => { update('orientation', deg); if (bool('verticalText')) update('verticalText', false); };
  const toggleVertical = (): void => {
    const next = !bool('verticalText');
    update('verticalText', next);
    if (next) update('orientation', 0);
  };
  const direction = data.textDirection;
  return (
    <div className="gc-format-alignment-layout">
      <div className="gc-align-head gc-align-head-ta"><span>{T('textAlignment', 'Text alignment')}</span></div>
      <div className="gc-align-lbl gc-align-lbl-h">{fmt(designer, 'horizontalAlignment', 'Horizontal:')}</div>
      <Select className="gc-format-align-combo gc-format-halign" value={data.hAlign ?? 3} onChange={(v) => update('hAlign', Number(v))} items={loc(H_ALIGN_ITEMS)} />
      <div className="gc-align-lbl gc-align-lbl-v">{fmt(designer, 'verticalAlignment', 'Vertical:')}</div>
      <Select className="gc-format-align-combo gc-format-valign" value={data.vAlign ?? 0} onChange={(v) => update('vAlign', Number(v))} items={loc(V_ALIGN_ITEMS)} />
      <div className="gc-align-lbl gc-align-lbl-i">{fmt(designer, 'indent', 'Indent:')}</div>
      <Spinner className="gc-format-indent-spinner" ariaLabel={fmt(designer, 'indent', 'Indent:')} value={Number(data.indent ?? 0)} min={0} max={255} onChange={(v) => update('indent', v)} />
      <div className="gc-align-head gc-align-head-tc"><span>{T('textControl', 'Text control')}</span></div>
      <BoxCheck className="gc-align-check-wrap" text={fmt(designer, 'wrapText', 'Wrap text')} checked={bool('wrapText')} onChange={(v) => update('wrapText', v)} />
      <BoxCheck className="gc-align-check-shrink" text={fmt(designer, 'shrink', 'Shrink to fit')} checked={bool('shrinkToFit')} onChange={(v) => update('shrinkToFit', v)} />
      <BoxCheck className="gc-align-check-merge" text={fmt(designer, 'merge', 'Merge cells')} checked={bool('mergeCells')} onChange={(v) => update('mergeCells', v)} />
      <BoxCheck className="gc-align-check-ellipsis" text={T('showEllipsis', 'Show Ellipsis')} checked={bool('showEllipsis')} onChange={(v) => update('showEllipsis', v)} />
      <div className="gc-align-head gc-align-head-rtl"><span>{T('rightToLeft', 'Right-to-left')}</span></div>
      <div className="gc-align-lbl gc-align-lbl-d">{fmt(designer, 'textDirection', 'Text direction:')}</div>
      <Select className="gc-format-align-combo gc-format-direction" value={direction === undefined || direction === null ? '' : String(direction)} onChange={(v) => update('textDirection', v === '' ? undefined : Number(v))} items={loc(TEXT_DIRECTION_ITEMS)} />
      <div className="gc-format-orientation-group">
        <div className="gc-format-orientation-title">{fmt(designer, 'orientation', 'Orientation')}</div>
        <div className={`gc-format-vertical-text${bool('verticalText') ? ' selected' : ''}`} role="checkbox" aria-checked={bool('verticalText')} aria-label={T('verticalText', 'Vertical text')} onClick={toggleVertical}>
          {['T', 'e', 'x', 't'].map((ch, i) => <span key={i}>{ch}</span>)}
        </div>
        <OrientationDial angle={angle} onChange={setAngle} />
        <Spinner className="gc-format-degrees-spinner" ariaLabel={fmt(designer, 'degrees', 'Degrees')} value={angle} min={-90} max={90} onChange={setAngle} />
        <div className="gc-format-degrees-label">{fmt(designer, 'degrees', 'Degrees')}</div>
      </div>
    </div>
  );
}

/* ---------------- shared colour picker widgets (task 43) ----------------
 * The trial's Color dropdowns (Font/Border/Pattern Color) and the Fill tab's inline palette
 * show the same grid: a theme row (Background 1, Text 1, Background 2, Text 2, Accent 1..6),
 * five tint rows (+/- percent), and the ten standard colours. Selecting a swatch writes its
 * display name ('Accent 1', 'Background 2 -50') or the hex string for the standard row —
 * the exact tokens the trial stores in backColor/foreColor, which the core themes resolve. */
const STANDARD_COLORS = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];
const TINT_ROWS = [[-5, 50, -10, 80], [-15, 35, -25, 60], [-25, 25, -50, 40], [-35, 15, -75, -25], [-50, 5, -90, -50]];
/** Row 0 theme names, tint rows repeat them with ' <percent>' suffix, then the standard row. */
const PALETTE_BASE = ['Background 1', 'Text 1', 'Background 2', 'Text 2', 'Accent 1', 'Accent 2', 'Accent 3', 'Accent 4', 'Accent 5', 'Accent 6'];
const PALETTE_ROWS: string[][] = [
  PALETTE_BASE,
  ...TINT_ROWS.map((tints) => PALETTE_BASE.map((name, i) => `${name} ${tints[Math.min(i, 3)]}`)),
  STANDARD_COLORS,
];

/** Any CSS color for a palette display name: the core resolves 'Accent 1 80'-style theme
 * tokens through ThemeColors.Office; hex strings pass through. */
function paletteColor(gc: GCRoot, name: string): string {
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(name)) return name;
  try {
    const schemes = gc.Spread.Sheets.ThemeColors;
    const resolved = schemes.Office?.getColor(name);
    if (resolved) return resolved;
  } catch { /* fall through */ }
  return /^#/.test(name) ? name : '#000000';
}

function PaletteGrid({ gc, onPick }: { gc: GCRoot; onPick: (name: string) => void }): React.ReactElement {
  return (
    <div className="gc-num-palette" role="listbox" aria-label={T('color2', 'Color:')}>
      {PALETTE_ROWS.map((row, rowIndex) => (
        <React.Fragment key={rowIndex}>
          {rowIndex === 1 || rowIndex === PALETTE_ROWS.length - 1 ? <div className="gc-num-palette-space" /> : null}
          <div className="gc-num-palette-row">
            {row.map((name) => <div key={name} role="option" aria-label={name} title={name} className="gc-num-palette-swatch" style={{ background: paletteColor(gc, name) }} onClick={() => onPick(name)} />)}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Dropdown color button like the trial's: full-width swatch + 19px arrow column; the popup
 * shows the palette grid. `value` is the display name/hex the style stores; `''` renders black. */
function ColorDropdown({ gc, value, onChange, className, ariaLabel }: { gc: GCRoot; value: string; onChange: (v: string) => void; className?: string; ariaLabel: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className={`gc-num-colordd${className ? ` ${className}` : ''}`}>
      <div className="gc-num-colordd-button" role="combobox" aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="gc-num-colordd-swatch" style={{ background: paletteColor(gc, value === '' ? '#000000' : value) }} />
        <span className="gc-num-colordd-arrow" aria-hidden="true"><svg width="9" height="6" viewBox="0 0 9 6"><path d="M0.5 0.5h8L4.5 5.5z" /></svg></span>
      </div>
      {open && <>
        <div className="gc-num-dd-mask" onClick={() => setOpen(false)} />
        <div className="gc-num-colordd-popup"><PaletteGrid gc={gc} onPick={(name) => { onChange(name); setOpen(false); }} /></div>
      </>}
    </div>
  );
}

/* ---------------- Font tab (task 43) ----------------
 * Trial layout (tab-content px): Font / Font style / Size list-editors (input + 28px-item list)
 * across the top; Underline combo + Effects fieldset bottom-left; Color dropdown + Preview
 * fieldset bottom-right. The trial's Font style list starts with "Normal" and its Effects group
 * only has Strikethrough. Every widget edit sends the whole `font` state so OK writes exactly
 * the trial's combination: fontFamily / fontStyle+fontWeight / fontSize / foreColor and
 * textDecoration = underline bits | lineThrough. */
const FONT_LISTS = [
  'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Candara', 'Century', 'Courier New', 'Comic Sans MS', 'Garamond', 'Georgia',
  'Malgun Gothic', 'Mangal', 'Meiryo', 'MS Gothic', 'MS Mincho', 'MS PGothic', 'MS PMincho', 'Tahoma', 'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings',
];
const FONT_STYLES = ['Normal', 'Italic', 'Bold', 'Bold Italic'];
const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '26', '28', '36', '48', '72'];
const UNDERLINE_ITEMS = ['None', 'Single', 'Double', 'Single Accounting', 'Double Accounting'];

interface FontState { family: string; style: string; size: string; underline: number; strike: boolean; color: string; touched?: string[] }
function readFontState(data: Record<string, unknown>): FontState {
  const given = data.font as FontState | undefined;
  if (given) return given;
  return { family: String(data.fontFamily ?? 'Calibri'), style: String(data.fontStyle ?? 'Normal'), size: String(data.fontSize ?? '11'), underline: Number(data.underlineIndex ?? 0), strike: !!data.strikethrough, color: String(data.color ?? '#000000'), touched: [] };
}

function FontTab({ data, update, designer }: Props): React.ReactElement {
  const state = readFontState(data);
  const gc = designer.gc;
  // Like the trial, OK writes only the font members the user actually touched on this tab.
  const edit = (patch: Partial<FontState>): void => {
    const touched = [...new Set([...(state.touched ?? []), ...Object.keys(patch)])];
    update('font', { ...state, ...patch, touched });
  };
  const previewFont = `${state.style.includes('Italic') ? 'italic' : 'normal'} ${state.style.startsWith('Bold') ? 'bold' : 'normal'} ${state.size || '11'}pt ${state.family || 'Calibri'}`;
  return (
    <div className="gc-format-font-layout">
      <div className="gc-font-lbl gc-font-lbl-family">{fmt(designer, 'font', 'Font')}:</div>
      <input className="gc-dialog-input gc-font-input gc-font-family-input" aria-label={`${fmt(designer, 'font', 'Font')}:`} value={state.family} onChange={(event) => edit({ family: event.target.value })} onBlur={() => undefined} />
      <div className="gc-font-list gc-font-family-list" role="listbox" aria-label={`${fmt(designer, 'font', 'Font')}:`}>
        {FONT_LISTS.map((name) => <div key={name} role="option" aria-selected={state.family === name} title={name} className={`gc-font-list-item${state.family === name ? ' selected' : ''}`} style={{ fontFamily: name }} onClick={() => edit({ family: name })}>{name}</div>)}
      </div>
      <div className="gc-font-lbl gc-font-lbl-style">{fmt(designer, 'fontStyle', 'Font style:')}</div>
      <input className="gc-dialog-input gc-font-input gc-font-style-input" aria-label={fmt(designer, 'fontStyle', 'Font style:')} value={state.style} readOnly />
      <div className="gc-font-list gc-font-style-list" role="listbox" aria-label={fmt(designer, 'fontStyle', 'Font style:')}>
        {FONT_STYLES.map((name) => <div key={name} role="option" aria-selected={state.style === name} title={displayName(designer, name)} className={`gc-font-list-item${state.style === name ? ' selected' : ''}`} onClick={() => edit({ style: name })}>{displayName(designer, name)}</div>)}
      </div>
      <div className="gc-font-lbl gc-font-lbl-size">{fmt(designer, 'size', 'Size:')}</div>
      <input className="gc-dialog-input gc-font-input gc-font-size-input" aria-label={fmt(designer, 'size', 'Size:')} value={state.size} onChange={(event) => edit({ size: event.target.value.trim() })} />
      <div className="gc-font-list gc-font-size-list" role="listbox" aria-label={fmt(designer, 'size', 'Size:')}>
        {FONT_SIZES.map((name) => <div key={name} role="option" aria-selected={state.size === name} title={name} className={`gc-font-list-item${state.size === name ? ' selected' : ''}`} onClick={() => edit({ size: name })}>{name}</div>)}
      </div>
      <div className="gc-font-lbl gc-font-lbl-underline">{fmt(designer, 'underline', 'Underline:')}</div>
      <Select className="gc-format-align-combo gc-font-underline" aria-label={fmt(designer, 'underline', 'Underline:')} value={state.underline} onChange={(v) => edit({ underline: Number(v) })} items={UNDERLINE_ITEMS.map((text, i) => ({ text: i === 0 ? fmt(designer, 'none', text) : text, value: String(i) }))} />
      <fieldset className="gc-font-effects"><legend>{fmt(designer, 'effects', 'Effects')}</legend>
        <BoxCheck className="gc-font-strike" text={fmt(designer, 'strikethrough', 'Strikethrough')} checked={state.strike} onChange={(v) => edit({ strike: v })} />
      </fieldset>
      <div className="gc-font-lbl gc-font-lbl-color">{fmt(designer, 'color', 'Color:')}</div>
      <ColorDropdown className="gc-font-color-dd" gc={gc} value={state.color} ariaLabel={fmt(designer, 'color', 'Color:')} onChange={(v) => edit({ color: v })} />
      <fieldset className="gc-font-preview-group"><legend>{fmt(designer, 'preview', 'Preview')}</legend>
        <div className="gc-font-preview" style={{ font: previewFont, color: paletteColor(gc, state.color === '' ? '#000000' : state.color), textDecoration: state.strike ? 'line-through' : 'none' }}>{T('aaBbCcYyZz', 'AaBbCcYyZz')}</div>
      </fieldset>
    </div>
  );
}

/* ---------------- Border tab (task 43) ----------------
 * Left "Border" group: line-style grid (2x7, trial names + own line previews) and the color
 * dropdown. Middle: Presets (None/Outline/Inside big buttons; Inside disabled for a 1-cell
 * selection, like the trial) and a Line group: Top/Horizontal-inner/Bottom buttons in a column,
 * the clickable preview, Diagonal-up/Left/Vertical-inner/Right/Diagonal-down below. Right: the
 * trial's Radius group. All clicks mutate one `border` state object; OK writes the edges per
 * cell exactly like the trial (outer edges on the range rim, inner edges between cells). */
const LINE_STYLES: { name: string; value: number }[] = [
  { name: 'None', value: 0 }, { name: 'Hair', value: 7 }, { name: 'Dotted', value: 4 }, { name: 'Dash Dot Dot', value: 11 }, { name: 'Dash Dot', value: 9 }, { name: 'Dashed', value: 3 }, { name: 'Thin', value: 1 },
  { name: 'Medium Dash Dot Dot', value: 12 }, { name: 'Slanted Dash Dot', value: 13 }, { name: 'Medium Dash Dot', value: 10 }, { name: 'Medium Dashed', value: 8 }, { name: 'Medium', value: 2 }, { name: 'Thick', value: 5 }, { name: 'Double', value: 6 },
];
type BorderEdge = 'top' | 'bottom' | 'left' | 'right' | 'hInside' | 'vInside' | 'diagonalUp' | 'diagonalDown';
interface BorderState { edges: Partial<Record<BorderEdge, { style: number; color: string } | null>>; style: number; color: string; radiusMode: string; corners: number[]; linked: boolean; preset?: string }
function readBorderState(data: Record<string, unknown>): BorderState {
  const given = data.border as BorderState | undefined;
  if (given) return given;
  return { edges: {}, style: 1, color: '#000', radiusMode: 'outer', corners: [0, 0, 0, 0], linked: true, preset: 'outline' };
}
/** The trial's fresh dialog shows the outer outline applied (thin black) until the user clicks;
 * those ghost edges are visual only — OK writes just the slots the user touched (probed). */
const GHOST_OUTER: BorderEdge[] = ['top', 'bottom', 'left', 'right'];
const EDGE_NAMES: Record<string, string> = { top: 'Top Line', hInside: 'Horizontal Inner Line', bottom: 'Bottom Line', left: 'Left Line', vInside: 'Vertical Inner Line', right: 'Right Line', diagonalUp: 'Diagonal Up Line', diagonalDown: 'Diagonal Down Line' };

/** Grid line samples as measured from the trial dialog (on/off run lengths in CSS px). */
const GRID_SAMPLE: Record<number, { w: number; dash?: string; color?: string; double?: boolean }> = {
  7: { w: 1, dash: '1 1', color: '#767676' }, 4: { w: 1, dash: '2 3' }, 11: { w: 1, dash: '4 3 1 3 1 3' },
  9: { w: 1, dash: '9 3 1 3' }, 3: { w: 1, dash: '3 4' }, 1: { w: 1 }, 2: { w: 2 }, 5: { w: 3 },
  6: { w: 1, double: true }, 12: { w: 2, dash: '9 4 1 4 1 4' }, 13: { w: 2, dash: '11 6' },
  10: { w: 2, dash: '11 4' }, 8: { w: 2, dash: '9 6' },
};

/** SVG stroke attributes for a LineStyle value (own rendering, 160x70 preview scale). */
function lineStroke(style: number): { w: number; dash?: string } {
  switch (style) {
    case 2: return { w: 2 }; case 5: return { w: 3 };
    case 6: return { w: 3 }; case 7: return { w: 1 };
    case 4: return { w: 1, dash: '1 2' }; case 3: return { w: 1, dash: '4 2' };
    case 9: return { w: 1, dash: '4 2 1 2' }; case 11: return { w: 1, dash: '4 2 1 2 1 2' };
    case 8: return { w: 2, dash: '6 3' }; case 10: return { w: 2, dash: '6 2 1 2' };
    case 12: return { w: 2, dash: '6 2 1 2 1 2' }; case 13: return { w: 1, dash: '3 2 1 2' };
    default: return { w: 1 };
  }
}

function BorderPreviewSvg({ gc, state, onToggle }: { gc: GCRoot; state: BorderState; onToggle: (edge: BorderEdge) => void }): React.ReactElement {
  const W = 160, H = 70;
  const shown = (edge: BorderEdge): { style: number; color: string } | null => state.edges[edge] ?? null;
  const resolve = (color: string): string => paletteColor(gc, color === '' ? '#000000' : color);
  const line = (edge: BorderEdge, x1: number, y1: number, x2: number, y2: number): React.ReactElement | null => {
    const value = shown(edge);
    if (!value) return null;
    const s = lineStroke(value.style);
    const color = resolve(value.color);
    return <line key={edge} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={s.w} strokeDasharray={s.dash} />;
  };
  const doubleFix = (edge: BorderEdge, x1: number, y1: number, x2: number, y2: number): React.ReactElement | null => {
    const value = shown(edge);
    if (!value || value.style !== 6) return null;
    const color = resolve(value.color);
    const vertical = x1 === x2;
    const offset = vertical ? [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }] : [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }];
    return <g key={`${edge}-double`}>{offset.map((o) => <line key={`${edge}-${o.dx}-${o.dy}`} x1={x1 + o.dx} y1={y1 + o.dy} x2={x2 + o.dx} y2={y2 + o.dy} stroke={color} strokeWidth={1} />)}</g>;
  };
  const hotspot = (edge: BorderEdge, x1: number, y1: number, x2: number, y2: number): React.ReactElement =>
    <line key={`h-${edge}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0000" strokeWidth={7} className="gc-bd-hotspot" onClick={() => onToggle(edge)} />;
  const lines = [
    line('top', 1, 1, W - 1, 1), line('bottom', 1, H - 1, W - 1, H - 1),
    line('left', 1, 1, 1, H - 1), line('right', W - 1, 1, W - 1, H - 1),
    line('hInside', 1, H / 2, W - 1, H / 2), line('vInside', W / 2, 1, W / 2, H - 1),
    line('diagonalUp', 1, H - 1, W - 1, 1), line('diagonalDown', 1, 1, W - 1, H - 1),
    doubleFix('top', 1, 1, W - 1, 1), doubleFix('bottom', 1, H - 1, W - 1, H - 1),
    doubleFix('left', 1, 1, 1, H - 1), doubleFix('right', W - 1, 1, W - 1, H - 1),
    doubleFix('hInside', 1, H / 2, W - 1, H / 2), doubleFix('vInside', W / 2, 1, W / 2, H - 1),
  ];
  const hotspots = [
    hotspot('top', 4, 1, W - 4, 1), hotspot('bottom', 4, H - 1, W - 4, H - 1),
    hotspot('left', 1, 4, 1, H - 4), hotspot('right', W - 1, 4, W - 1, H - 4),
    hotspot('hInside', 4, H / 2, W - 4, H / 2), hotspot('vInside', W / 2, 4, W / 2, H - 4),
    hotspot('diagonalUp', 10, H - 10, W - 10, 10), hotspot('diagonalDown', 10, 10, W - 10, H - 10),
  ];
  return (
    <svg className="gc-bd-preview" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label={T('borderPreview', 'Border preview')}>
      <rect x={0} y={0} width={W} height={H} fill="#f5f5f5" stroke="none" />
      {lines}
      {hotspots}
    </svg>
  );
}

/**
 * The trial draws the preview's "Text" sample on a <canvas>, so Chromium rasterizes it with
 * grayscale AA; SVG/HTML text would use LCD subpixel AA and diff against it everywhere. This
 * overlay canvas (own code, pointer-events none) reproduces the trial's ink at the same position
 * (15px Times, baseline centered in the 160x70 preview).
 */
function PreviewTextCanvas(): React.ReactElement {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 70);
    ctx.font = '15px "Times New Roman", serif';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Text', 77, 39);
  }, []);
  return <canvas ref={ref} className="gc-bd-preview-text" width={160} height={70} aria-hidden="true" />;
}

function RadiusApplyIcon({ mode }: { mode: string }): React.ReactElement {
  // Trial icons (measured): None = pale grey dashed 3x3 grid; All = four blue outlined rounded
  // cells (no fill); Outer = blue rounded square with a pale dashed grey cross (drawn from scratch).
  if (mode === 'all')
    return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">{[[0.5, 0.5], [7.5, 0.5], [0.5, 7.5], [7.5, 7.5]].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" rx="2" fill="none" stroke="#8fb6e2" strokeWidth="1" />)}</svg>;
  if (mode === 'outer')
    return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="0.5" y="0.5" width="13" height="13" rx="4" fill="none" stroke="#85b0dc" strokeWidth="1" /><line x1="7.5" y1="2.5" x2="7.5" y2="11.5" stroke="#c8d0d8" strokeWidth="1" strokeDasharray="3 1" /><line x1="2.5" y1="7.5" x2="11.5" y2="7.5" stroke="#c8d0d8" strokeWidth="1" strokeDasharray="3 1" /></svg>;
  return gridIcon(14, [1.5, 7.5, 13.5], { outer: { stroke: '#d0d0d0', dash: '3 1' }, cross: { stroke: '#d0d0d0', dash: '3 1' } });
}

/* Preset/line-button glyphs re-measured from the trial dialog pixels (2026-11-17): the preset
 * glyph is a 27px 3x3 grid (crisp 1px lines at centers 0.5/13.5/26.5, dash "3 1", #a8a8a8;
 * solid #367fc9 where the preset applies; disabled states use #e5e5e5 grid + #c2d8ef blue).
 * The small line-button glyph is the same grid at 15px extent (centers 1.5/8.5/15.5 in a 16px
 * box so the 45/26px buttons center it on integer device pixels) with a solid 1px blue line at
 * the button's edge. */
function gridIcon(width: number, at: number[], lines: { outer: { stroke: string; dash?: string }; cross: { stroke: string; dash?: string } }, extra?: React.ReactNode): React.ReactElement {
  const [a0, a1, a2] = at;
  const line = (x1: number, y1: number, x2: number, y2: number, style: { stroke: string; dash?: string }, key: string): React.ReactElement =>
    <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={style.stroke} strokeWidth={1} strokeDasharray={style.dash} />;
  return (
    <svg width={width} height={width} viewBox={`0 0 ${width} ${width}`} aria-hidden="true">
      {line(a0, a0, a2, a0, lines.outer, 't')}{line(a0, a1, a2, a1, lines.cross, 'm')}{line(a0, a2, a2, a2, lines.outer, 'b')}
      {line(a0, a0, a0, a2, lines.outer, 'l')}{line(a1, a0, a1, a2, lines.cross, 'c')}{line(a2, a0, a2, a2, lines.outer, 'r')}
      {extra}
    </svg>
  );
}

function PresetIcon({ kind, disabled }: { kind: 'none' | 'outline' | 'inside'; disabled?: boolean }): React.ReactElement {
  const gray = disabled ? '#e5e5e5' : '#a8a8a8';
  const blue = disabled ? '#c2d8ef' : '#367fc9';
  const dashed = { stroke: gray, dash: '3 1' };
  const outer = kind === 'outline' ? { stroke: blue } : dashed;
  const cross = kind === 'inside' ? { stroke: blue } : dashed;
  return gridIcon(27, [0.5, 13.5, 26.5], { outer, cross });
}

function EdgeButtonIcon({ edge, disabled }: { edge: string; active: boolean; disabled?: boolean }): React.ReactElement {
  // 15px dashed grid + solid 1px blue accent on the edge the button applies (trial-measured).
  const gray = disabled ? '#e5e5e5' : '#a8a8a8';
  const blue = disabled ? '#c2d8ef' : '#367fc9';
  const grid = { outer: { stroke: gray, dash: '3 1' }, cross: { stroke: gray, dash: '3 1' } };
  const accent = (x1: number, y1: number, x2: number, y2: number): React.ReactElement =>
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={blue} strokeWidth={1} />;
  let extra: React.ReactNode = null;
  switch (edge) {
    case 'top': extra = accent(1.5, 1.5, 15.5, 1.5); break;
    case 'hInside': extra = accent(1.5, 8.5, 15.5, 8.5); break;
    case 'bottom': extra = accent(1.5, 15.5, 15.5, 15.5); break;
    case 'left': extra = accent(1.5, 1.5, 1.5, 15.5); break;
    case 'vInside': extra = accent(8.5, 1.5, 8.5, 15.5); break;
    case 'right': extra = accent(15.5, 1.5, 15.5, 15.5); break;
    case 'diagonalUp': extra = accent(3.5, 13.5, 13.5, 3.5); break;
    default: extra = accent(3.5, 3.5, 13.5, 13.5); break;
  }
  return gridIcon(16, [1.5, 8.5, 15.5], grid, extra);
}

function BorderTab({ data, update, designer }: Props): React.ReactElement {
  const state = readBorderState(data);
  const gc = designer.gc;
  const multi = !!data.selectionMulti;
  const edit = (patch: Partial<BorderState>): void => update('border', { ...state, ...patch });
  const toggle = (edge: BorderEdge): void => {
    // Toggle like the trial: turning an edge OFF keeps a slot marked cleared (null) so OK
    // writes an empty (style 0) border, exactly like the trial's None behavior (probed).
    const next = { ...state.edges };
    if (next[edge]) next[edge] = null;
    else next[edge] = { style: state.style || 1, color: state.color };
    edit({ edges: next });
  };
  const applyPreset = (preset: 'none' | 'outline' | 'inside'): void => {
    const next = { ...state.edges };
    if (preset === 'none') {
      const cleared: BorderState['edges'] = { top: null, bottom: null, left: null, right: null, diagonalUp: null, diagonalDown: null };
      if (multi) Object.assign(cleared, { hInside: null, vInside: null });
      edit({ edges: { ...next, ...cleared }, preset });
      return;
    }
    const border = { style: state.style || 1, color: state.color };
    if (preset === 'outline') Object.assign(next, { top: border, bottom: border, left: border, right: border });
    else Object.assign(next, { hInside: border, vInside: border });
    edit({ edges: next, preset });
  };
  // Slot state drives the writer; the ghost outline (state.preset) drives the widgets only.
  const GHOST = { style: 1, color: '#000' };
  const shown = (edge: BorderEdge): { style: number; color: string } | null => {
    const value = state.edges[edge];
    if (value !== undefined) return value;
    return GHOST_OUTER.includes(edge) && state.preset !== 'none' ? GHOST : null;
  };
  return (
    <div className="gc-format-border-layout">
      <fieldset className="gc-bd-group"><legend>{fmt(designer, 'border', 'Border')}</legend>
        <div className="gc-bd-line-label">{fmt(designer, 'line', 'Line')}</div>
        <div className="gc-bd-style-grid" role="radiogroup" aria-label={T('lineStyle', 'Line style')}>
          {[0, 1].map((column) => (
            <div key={column} className="gc-bd-style-col">
              {LINE_STYLES.slice(column * 7, column * 7 + 7).map((item) => (
                <div key={item.name} role="radio" aria-checked={state.style === item.value} aria-label={displayName(designer, item.name)} title={displayName(designer, item.name)} className={`gc-bd-style${state.style === item.value ? ' selected' : ''}`} onClick={() => edit({ style: item.value })}>
                  {item.value === 0 ? <span className="gc-bd-style-none">{fmt(designer, 'none', 'None')}</span> : <svg width="54" height="6" viewBox="0 0 54 6" aria-hidden="true">{(() => { const g = GRID_SAMPLE[item.value] ?? { w: 1 }; return g.double ? <><line x1="0" y1="1.5" x2="54" y2="1.5" stroke="#000000" strokeWidth={1} /><line x1="0" y1="4.5" x2="54" y2="4.5" stroke="#000000" strokeWidth={1} /></> : <line x1="0" y1="3" x2="54" y2="3" stroke={g.color ?? '#000000'} strokeWidth={g.w} strokeDasharray={g.dash} />; })()}</svg>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="gc-bd-color-label">{fmt(designer, 'borderColor', 'Color:')}</div>
        <ColorDropdown className="gc-bd-color-dd" gc={gc} value={state.color} ariaLabel={fmt(designer, 'borderColor', 'Color:')} onChange={(v) => edit({ color: v })} />
      </fieldset>
      <div className="gc-bd-presets-area">
        <fieldset className="gc-bd-line-group gc-bd-presets-group"><legend>{fmt(designer, 'presets', 'Presets')}</legend></fieldset>
        <div className="gc-bd-presets">
          {(['none', 'outline', 'inside'] as const).map((preset) => (
            <div key={preset} className="gc-bd-preset-item">
              <div role="button" aria-label={fmt(designer, preset, preset === 'none' ? 'None' : preset === 'outline' ? 'Outline' : 'Inside')} className={`gc-bd-preset${preset === 'inside' && !multi ? ' disabled' : ''}`} onClick={() => { if (preset !== 'inside' || multi) applyPreset(preset); }}><PresetIcon kind={preset} disabled={preset === 'inside' && !multi} /></div>
              <div className="gc-bd-preset-label">{fmt(designer, preset, preset === 'none' ? 'None' : preset === 'outline' ? 'Outline' : 'Inside')}</div>
            </div>
          ))}
        </div>
        <fieldset className="gc-bd-line-group gc-bd-line-fieldset"><legend>{fmt(designer, 'line', 'Line')}</legend></fieldset>
        <div className="gc-bd-small-buttons">
          {([['top', 'Top Line'], ['hInside', 'Horizontal Inner Line'], ['bottom', 'Bottom Line']] as [BorderEdge, string][]).map(([edge, label], i) => (
            <div key={edge} role="button" aria-label={label} className={`gc-bd-small${shown(edge) ? ' selected' : ''}${(edge === 'hInside' && !multi) ? ' disabled' : ''}`} style={{ top: i * 42 }} onClick={() => { if (edge !== 'hInside' || multi) toggle(edge); }}><EdgeButtonIcon edge={edge} active={!!shown(edge)} disabled={edge === 'hInside' && !multi} /></div>
          ))}
        </div>
        <div className="gc-bd-preview-wrap"><BorderPreviewSvg gc={gc} state={state} onToggle={toggle} /><PreviewTextCanvas /></div>
        <div className="gc-bd-bottom-buttons">
          {([['diagonalUp', 6], ['left', 56], ['vInside', 136], ['right', 206], ['diagonalDown', 236]] as [BorderEdge, number][]).map(([edge, left]) => (
            <div key={edge} role="button" aria-label={displayName(designer, EDGE_NAMES[edge])} className={`gc-bd-small${shown(edge) ? ' selected' : ''}${(edge === 'vInside' && !multi) ? ' disabled' : ''}`} style={{ left }} onClick={() => { if (edge !== 'vInside' || multi) toggle(edge); }}><EdgeButtonIcon edge={edge} active={!!shown(edge)} disabled={edge === 'vInside' && !multi} /></div>
          ))}
        </div>
      </div>
      <fieldset className="gc-bd-radius-group"><legend>{T('radius', 'Radius')}</legend>
        <div className="gc-bd-radius-apply-label">{T('applyTo', 'Apply to')}</div>
        <div className="gc-bd-radius-apply">
          {(['none', 'all', 'outer'] as const).map((mode, i) => (
            <div key={mode} className="gc-bd-radius-item" style={{ left: 7 + i * 44 }}>
              <div role="button" aria-label={T(mode === 'none' ? 'none' : mode === 'all' ? 'all' : 'outer', mode === 'none' ? 'None' : mode === 'all' ? 'All' : 'Outer')} className={`gc-bd-radius-button${state.radiusMode === mode ? ' checked' : ''}`} onClick={() => edit({ radiusMode: mode })}>
                <RadiusApplyIcon mode={mode} />
              </div>
              <div className="gc-bd-radius-text">{T(mode === 'none' ? 'none' : mode === 'all' ? 'all' : 'outer', mode === 'none' ? 'None' : mode === 'all' ? 'All' : 'Outer')}</div>
            </div>
          ))}
        </div>
        <div className="gc-bd-radius-corner-label">{T('corner', 'Corner')}</div>
        {([0, 1, 2, 3] as const).map((index) => (
          <div key={index} className={`gc-bd-corner gc-bd-corner-${index}`}>
            <span className={`gc-bd-corner-icon gc-bd-corner-icon-${index}`} />
            <span className="gc-bd-corner-editor">
              <input className="gc-dialog-input gc-bd-corner-input" aria-label={`${['Top left', 'Top right', 'Bottom left', 'Bottom right'][index]} radius`} value={state.corners[index]} onChange={(event) => {
                const value = Math.max(0, Math.round(Number(event.target.value) || 0));
                const corners = state.linked ? state.corners.map(() => value) : state.corners.map((c, i) => (i === index ? value : c));
                edit({ corners });
              }} />
              <span className="gc-bd-corner-spin">
                <button type="button" aria-label={T('increase', 'Increase')} onClick={() => { const step = (v: number) => { const corners = state.linked ? state.corners.map(() => v + 1) : state.corners.map((c, i) => (i === index ? c + 1 : c)); edit({ corners }); }; step(state.corners[index]); }}><svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true"><path d="M4.5 0.5 8.5 5.5H0.5z" /></svg></button>
                <button type="button" aria-label={T('decrease', 'Decrease')} onClick={() => { const corners = state.linked ? state.corners.map((c) => Math.max(0, c - 1)) : state.corners.map((c, i) => (i === index ? Math.max(0, c - 1) : c)); edit({ corners }); }}><svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true"><path d="M4.5 5.5 0.5 0.5h8z" /></svg></button>
              </span>
            </span>
          </div>
        ))}
        <div role="button" aria-label={state.linked ? fmt(designer, 'unlinkRadius', 'Unlink corner radius values') : fmt(designer, 'linkRadius', 'Link corner radius values')} className={`gc-bd-radius-link${state.linked ? ' checked' : ''}`} onClick={() => edit({ linked: !state.linked })}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M4.5 3.5H3a2 2 0 0 0 0 5h1.5M7.5 3.5H9a2 2 0 0 1 0 5H7.5" fill="none" stroke="#242424" strokeWidth="1.1" /></svg>
        </div>
      </fieldset>
      <div className="gc-bd-note">{fmt(designer, 'borderNote', 'The selected border style can be applied by clicking the presets, preview diagram, or the buttons above.')}</div>
    </div>
  );
}

/* ---------------- Fill tab (task 43) ----------------
 * Trial layout: Background Color label + inline palette column (No Color button, theme/tint/
 * standard swatch grid, Fill Effect... / More Colors... buttons) on the left; Pattern Color
 * dropdown and Pattern Style combo on the right; the wide Sample fieldset below drawing the
 * current fill. Selecting a swatch stores the display name (like the trial's backColor
 * "Accent 1"); a pattern makes the writer emit the IPatternFill {type, patternColor,
 * backgroundColor} the trial writes in that case. */
const PATTERN_STYLES = [
  { type: 1, name: 'Solid' }, { type: 2, name: 'Dark Gray' }, { type: 3, name: 'Medium Gray' }, { type: 4, name: 'Light Gray' },
  { type: 5, name: 'Gray 12.5%' }, { type: 6, name: 'Gray 6.25%' }, { type: 7, name: 'Dark Horizontal' }, { type: 8, name: 'Dark Vertical' },
  { type: 9, name: 'Dark Down' }, { type: 10, name: 'Dark Up' }, { type: 11, name: 'Dark Grid' }, { type: 12, name: 'Dark Trellis' },
  { type: 13, name: 'Light Horizontal' }, { type: 14, name: 'Light Vertical' }, { type: 15, name: 'Light Down' }, { type: 16, name: 'Light Up' },
  { type: 17, name: 'Light Grid' }, { type: 18, name: 'Light Trellis' },
];
interface FillState { bg: string | null | undefined; patternColor: string; patternType: number | undefined }
function readFillState(data: Record<string, unknown>): FillState {
  const given = data.fill as FillState | undefined;
  if (given) return given;
  const backColor = data.backColor;
  if (backColor && typeof backColor === 'object') {
    const pattern = backColor as { type?: number; patternColor?: string; backgroundColor?: string };
    return { bg: pattern.backgroundColor || undefined, patternColor: pattern.patternColor ?? '', patternType: Number(pattern.type) };
  }
  return { bg: typeof backColor === 'string' ? backColor : undefined, patternColor: '', patternType: undefined };
}

/** Own SVG pattern preview for an IPatternFill type (drawn, never copied). */
function PatternPreview({ type, fg, bg, width, height }: { type: number | undefined; fg: string; bg: string; width: number; height: number }): React.ReactElement {
  const id = `gcpat${type}-${width}x${height}`;
  const patternDef = (): React.ReactElement | null => {
    if (!type) return null;
    const common = { patternUnits: 'userSpaceOnUse' as const };
    switch (type) {
      case 1: return <pattern id={id} width="3" height="3" {...common}><rect width="3" height="3" fill={fg} /></pattern>;
      case 2: return <pattern id={id} width="2" height="2" {...common}><rect width="2" height="2" fill={bg} /><rect width="1" height="1" fill={fg} /><rect x="1" y="1" width="1" height="1" fill={fg} /></pattern>;
      case 3: return <pattern id={id} width="4" height="4" {...common}><rect width="4" height="4" fill={bg} /><rect x="0" y="0" width="1" height="1" fill={fg} /><rect x="2" y="2" width="1" height="1" fill={fg} /></pattern>;
      case 4: return <pattern id={id} width="4" height="4" {...common}><rect width="4" height="4" fill={bg} /><rect width="1" height="1" fill={fg} /></pattern>;
      case 5: return <pattern id={id} width="8" height="8" {...common}><rect width="8" height="8" fill={bg} /><rect width="1" height="1" fill={fg} /><rect x="4" y="4" width="1" height="1" fill={fg} /></pattern>;
      case 6: return <pattern id={id} width="16" height="16" {...common}><rect width="16" height="16" fill={bg} /><rect width="1" height="1" fill={fg} /></pattern>;
      case 7: case 13: return <pattern id={id} width="4" height={type === 7 ? 2 : 4} {...common}><rect width="4" height={type === 7 ? 2 : 4} fill={bg} /><rect width="4" height="1" fill={fg} /></pattern>;
      case 8: case 14: return <pattern id={id} width={type === 8 ? 2 : 4} height="4" {...common}><rect width={type === 8 ? 2 : 4} height="4" fill={bg} /><rect width="1" height="4" fill={fg} /></pattern>;
      case 9: case 15: return <pattern id={id} width="4" height="4" {...common}><rect width="4" height="4" fill={bg} /><path d="M-1 1 1 -1M0 4 4 0M3 5 5 3" stroke={fg} strokeWidth="1" /></pattern>;
      case 10: case 16: return <pattern id={id} width="4" height="4" {...common}><rect width="4" height="4" fill={bg} /><path d="M-1 3 1 5M0 0 4 4M3 -1 5 1" stroke={fg} strokeWidth="1" /></pattern>;
      case 11: case 17: return <pattern id={id} width="4" height="4" {...common}><rect width="4" height="4" fill={bg} /><path d="M0 0h4M0 0v4" stroke={fg} strokeWidth="1" /></pattern>;
      case 12: case 18: return <pattern id={id} width="4" height="4" {...common}><rect width="4" height="4" fill={bg} /><path d="M-1 1 1 -1M0 4 4 0M3 5 5 3M-1 3 1 5M0 0 4 4M3 -1 5 1" stroke={fg} strokeWidth="1" /></pattern>;
      default: return null;
    }
  };
  return (
    <svg width={width} height={height} aria-hidden="true">
      <defs>{patternDef()}</defs>
      <rect width={width} height={height} fill={bg} />
      {type ? <rect width={width} height={height} fill={`url(#${id})`} /> : null}
    </svg>
  );
}

function FillTab({ data, update, designer }: Props): React.ReactElement {
  const state = readFillState(data);
  const gc = designer.gc;
  const edit = (patch: Partial<FillState>): void => update('fill', { ...state, ...patch });
  const bgValue = state.bg === null || state.bg === undefined ? '' : state.bg;
  const background = bgValue === '' ? 'transparent' : paletteColor(gc, bgValue);
  const patternForeground = state.patternColor === '' ? '#000000' : paletteColor(gc, state.patternColor);
  const [effectOpen, setEffectOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <div className="gc-format-fill-layout">
      <div className="gc-fill-lbl gc-fill-lbl-bg">{fmt(designer, 'backColor', 'Background Color:')}</div>
      <div role="button" aria-label={T('noColor', 'No Color')} className="gc-fill-nocolor" onClick={() => edit({ bg: null })}>{T('noColor', 'No Color')}</div>
      <div className="gc-fill-palette">
        {PALETTE_ROWS.map((row, rowIndex) => (
          <React.Fragment key={rowIndex}>
            {rowIndex === 1 || rowIndex === PALETTE_ROWS.length - 1 ? <div className="gc-num-palette-space" /> : null}
            <div className="gc-num-palette-row">
              {row.map((name) => <div key={name} role="option" aria-label={paletteName(designer, name)} title={paletteName(designer, name)} className="gc-num-palette-swatch" style={{ background: paletteColor(gc, name) }} onClick={() => edit({ bg: name })} />)}
            </div>
          </React.Fragment>
        ))}
      </div>
      <div role="button" aria-label={T('fillEffect', 'Fill Effect...')} className="gc-fill-effect-button" onClick={() => setEffectOpen(true)}>{T('fillEffect', 'Fill Effect...')}</div>
      <div role="button" aria-label={T('moreColors', 'More Colors...')} className="gc-fill-morecolors-button" onClick={() => setMoreOpen(true)}>{T('moreColors', 'More Colors...')}</div>
      <div className="gc-fill-lbl gc-fill-lbl-patcol">{fmt(designer, 'patternColor', 'Pattern Color:')}</div>
      <ColorDropdown className="gc-fill-patcol-dd" gc={gc} value={state.patternColor} ariaLabel={fmt(designer, 'patternColor', 'Pattern Color:')} onChange={(v) => edit({ patternColor: v })} />
      <div className="gc-fill-lbl gc-fill-lbl-patstyle">{fmt(designer, 'patternStyle', 'Pattern Style:')}</div>
      <FillPatternCombo value={state.patternType} patternColor={patternForeground} backgroundColor={bgValue === '' ? 'transparent' : background} onChange={(v) => edit({ patternType: v })} />
      <fieldset className="gc-fill-sample"><legend>{fmt(designer, 'sample', 'Sample')}</legend>
        <div className="gc-fill-sample-box">
          <PatternPreview type={state.patternType} fg={patternForeground} bg={background} width={600} height={60} />
        </div>
      </fieldset>
      {moreOpen && <MoreColorsPopup gc={gc} designer={designer} initial={bgValue} onPick={(name) => { edit({ bg: name }); setMoreOpen(false); }} onClose={() => setMoreOpen(false)} />}
      {effectOpen && <FillEffectPopup gc={gc} designer={designer} initial={bgValue} onPick={(value) => { edit({ bg: value }); setEffectOpen(false); }} onClose={() => setEffectOpen(false)} />}
    </div>
  );
}

/** Pattern Style combo like the trial's: a drawn pattern preview fills the box; the popup is a
 * one-per-row list of every PatternType preview. Empty value = no pattern (blank box). */
function FillPatternCombo({ value, patternColor, backgroundColor, onChange }: { value: number | undefined; patternColor: string; backgroundColor: string; onChange: (v: number | undefined) => void }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const current = PATTERN_STYLES.find((item) => item.type === value);
  return (
    <div className="gc-fill-patstyle">
      <div role="combobox" aria-label={T('patternStyle', 'Pattern Style:')} aria-expanded={open} className="gc-fill-patstyle-button" onClick={() => setOpen(!open)}>
        {current ? <PatternPreview type={current.type} fg={patternColor} bg={backgroundColor === 'transparent' ? '#ffffff' : backgroundColor} width={160} height={16} /> : null}
        <span className="gc-num-colordd-arrow" aria-hidden="true"><svg width="9" height="6" viewBox="0 0 9 6"><path d="M0.5 0.5h8L4.5 5.5z" /></svg></span>
      </div>
      {open && <>
        <div className="gc-num-dd-mask" onClick={() => setOpen(false)} />
        <div className="gc-fill-patstyle-popup" role="listbox" aria-label={T('patternStyle', 'Pattern Style:')}>
          {PATTERN_STYLES.map((item) => (
            <div key={item.type} role="option" aria-selected={value === item.type} title={T(uiKey(item.name), item.name)} className={`gc-fill-patstyle-item${value === item.type ? ' selected' : ''}`} onClick={() => { onChange(item.type); setOpen(false); }}>
              <PatternPreview type={item.type} fg={patternColor} bg={backgroundColor === 'transparent' ? '#ffffff' : backgroundColor} width={160} height={16} />
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}

/* More Colors... sub-dialog (our own, the trial's content could not be captured): a hex field
 * plus the palette; picks a background colour name/hex. Fill Effects... offers a two-colour
 * gradient; the trial writes a gradient fill there — we record a named gradient instead. */
function MoreColorsPopup({ gc, designer, initial, onPick, onClose }: { gc: GCRoot; designer: Designer; initial: string; onPick: (v: string) => void; onClose: () => void }): React.ReactElement {
  const okText = resolveText('${res.ok}', designer.resources) || 'OK';
  const cancelText = resolveText('${res.cancel}', designer.resources) || 'Cancel';
  const [hex, setHex] = useState(/^#[0-9a-f]{6}$/i.test(initial) ? initial : '#000000');
  return (
    <div className="gc-num-dd-mask gc-fill-subdialog-mask" onClick={onClose}>
      <div role="dialog" aria-label={T('colors', 'Colors')} className="gc-fill-subdialog" onClick={(event) => event.stopPropagation()}>
        <div className="gc-fill-subdialog-title">{T('colors', 'Colors')}</div>
        <div className="gc-num-palette-row" style={{ marginBottom: 8 }}>{STANDARD_COLORS.map((name) => <div key={name} role="option" aria-label={name} title={name} className="gc-num-palette-swatch" style={{ background: paletteColor(gc, name) }} onClick={() => onPick(name)} />)}</div>
        <div className="gc-num-label" style={{ position: 'static', width: 90, display: 'inline-block' }}>{T('hex', 'Hex:')}</div>
        <input className="gc-dialog-input" aria-label={T('hexColor', 'Hex color')} value={hex} style={{ width: 90 }} onChange={(event) => setHex(event.target.value)} />
        <span className="gc-num-colordd-swatch" style={{ background: paletteColor(gc, hex), width: 24, height: 24, display: 'inline-block', marginLeft: 6, verticalAlign: 'middle', border: '1px solid #d1d1d1' }} />
        <div className="gc-fill-subdialog-buttons">
          <button type="button" className="gc-dialog-primary gc-fill-subdialog-ok" onClick={() => onPick(hex)}>{okText}</button>
          <button type="button" className="gc-dialog-secondary" onClick={onClose}>{cancelText}</button>
        </div>
      </div>
    </div>
  );
}

function FillEffectPopup({ gc, designer, initial, onPick, onClose }: { gc: GCRoot; designer: Designer; initial: string; onPick: (v: string) => void; onClose: () => void }): React.ReactElement {
  const okText = resolveText('${res.ok}', designer.resources) || 'OK';
  const cancelText = resolveText('${res.cancel}', designer.resources) || 'Cancel';
  const [from, setFrom] = useState(initial || '#FFFFFF');
  const [to, setTo] = useState('#B7CFE8');
  return (
    <div className="gc-num-dd-mask gc-fill-subdialog-mask" onClick={onClose}>
      <div role="dialog" aria-label={T('fillEffect2', 'Fill Effect')} className="gc-fill-subdialog" onClick={(event) => event.stopPropagation()}>
        <div className="gc-fill-subdialog-title">{T('fillEffect2', 'Fill Effect')}</div>
        <div className="gc-num-label" style={{ position: 'static', width: 70, display: 'inline-block' }}>{T('from', 'From:')}</div>
        <input className="gc-dialog-input" aria-label={T('gradientFrom', 'Gradient from')} value={from} style={{ width: 100 }} onChange={(event) => setFrom(event.target.value)} />
        <span style={{ background: `linear-gradient(90deg, ${paletteColor(gc, from)}, ${paletteColor(gc, to)})`, width: 120, height: 24, display: 'inline-block', marginLeft: 8, border: '1px solid #d1d1d1' }} />
        <div className="gc-num-label" style={{ position: 'static', width: 70, display: 'inline-block', marginTop: 8 }}>{T('to', 'To:')}</div>
        <input className="gc-dialog-input" aria-label={T('gradientTo', 'Gradient to')} value={to} style={{ width: 100 }} onChange={(event) => setTo(event.target.value)} />
        <div className="gc-fill-subdialog-buttons">
          <button type="button" className="gc-dialog-primary gc-fill-subdialog-ok" onClick={() => onPick(`gradient:${paletteColor(gc, from)} ${paletteColor(gc, to)}`)}>{okText}</button>
          <button type="button" className="gc-dialog-secondary" onClick={onClose}>{cancelText}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Protection tab (task 43) ----------------
 * Trial layout: three checkboxes (Locked checked, Hidden unchecked, Allow Edit in Cell
 * checked) at 20px pitch and the two note paragraphs. Allow Edit in Cell writes no style
 * member in the trial (probed), so it stays a dialog-only flag. */
function ProtectionTab({ data, update, designer }: Props): React.ReactElement {
  return (
    <div className="gc-format-protection-layout">
      <BoxCheck className="gc-prot-locked" text={fmt(designer, 'locked', 'Locked')} checked={data.locked !== false} onChange={(v) => update('locked', v)} />
      <BoxCheck className="gc-prot-hidden" text={fmt(designer, 'hidden', 'Hidden')} checked={!!data.hidden} onChange={(v) => update('hidden', v)} />
      <BoxCheck className="gc-prot-allowedit" text={T('allowEditInCell', 'Allow Edit in Cell')} checked={data.allowEdit !== false} onChange={(v) => update('allowEdit', v)} />
      <div className="gc-prot-note gc-prot-note1">{fmt(designer, 'protectionText', "Locking cells or hiding formulas has no effect until you protect the worksheet(Home tab, Cells group, 'Protect Sheet' button).")}</div>
      <div className="gc-prot-note gc-prot-note2">{T('allowEditInCellIndicatesWhetherTheCellCanEnterEditModeForEditing', 'Allow Edit in Cell indicates whether the cell can enter edit mode for editing.')}</div>
    </div>
  );
}

/* Cell Button tab — mirrors the official tab: toolbar (Add/Delete/Move Up/Move Down), the
 * button list, and every field of fc-ButtonAdded.png (enable, useButtonStyle, position, width,
 * caption, back/hover colors, image type, visibility, command, image src + select, caption
 * align, image width/height) plus a live preview. Values use the official numeric enums. */
const IMAGE_TYPES = ['None', 'Custom', 'Clear', 'Cancel', 'OK', 'Dropdown', 'Ellipsis', 'Left', 'Right', 'Plus', 'Minus', 'Undo', 'Redo', 'Search', 'Separator', 'Spin Left', 'Spin Right', 'Collapse', 'Expand'];
const BUTTON_DEFAULTS: Record<string, unknown> = { enabled: true, useButtonStyle: false, position: 1, width: 20, caption: '', buttonBackColor: '', hoverBackColor: '', imageType: 5, visibility: 0, command: 'none', imageSrc: '', captionAlign: 1, imageWidth: 16, imageHeight: 16 };

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return <div className="gc-format-field gc-format-button-field"><Label text={label} />{children}</div>;
}

function CellButtonTab({ data, designer, update }: Props): React.ReactElement {
  const buttons = (data.cellButtons ?? []) as Record<string, unknown>[];
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, Math.max(0, buttons.length - 1));
  const raw = buttons[index];
  const button: Record<string, unknown> | undefined = raw ? { ...BUTTON_DEFAULTS, ...raw, imageWidth: (raw.imageSize as Record<string, unknown> | undefined)?.width ?? BUTTON_DEFAULTS.imageWidth, imageHeight: (raw.imageSize as Record<string, unknown> | undefined)?.height ?? BUTTON_DEFAULTS.imageHeight } : undefined;
  const edit = (key: string, value: unknown): void => {
    const next = buttons.map((item, i) => {
      if (i !== index) return item;
      const merged: Record<string, unknown> = { ...BUTTON_DEFAULTS, ...item, [key]: value };
      if (key === 'imageWidth' || key === 'imageHeight') {
        merged.imageSize = { width: key === 'imageWidth' ? Number(value) : Number(merged.imageWidth), height: key === 'imageHeight' ? Number(value) : Number(merged.imageHeight) };
        delete merged.imageWidth; delete merged.imageHeight;
      }
      return merged;
    });
    update('cellButtons', next);
  };
  const move = (offset: number): void => {
    const target = index + offset;
    if (target < 0 || target >= buttons.length) return;
    const next = [...buttons]; [next[index], next[target]] = [next[target], next[index]];
    update('cellButtons', next); setSelected(target);
  };
  const commands = ['none', ...Object.keys(designer.getCommand() as Record<string, unknown> ?? {}).sort()];
  return (
    <div className="gc-format-buttons-layout">
      <div className="gc-format-buttons-toolbar">
        <button className="gc-format-button-add" onClick={() => { update('cellButtons', [...buttons, { ...BUTTON_DEFAULTS }]); setSelected(buttons.length); }}>{T('add', 'Add')}</button>
        <button className="gc-format-button-delete" disabled={!button} onClick={() => { update('cellButtons', buttons.filter((_, i) => i !== index)); setSelected(Math.max(0, index - 1)); }}>{T('delete', 'Delete')}</button>
        <button aria-label={T('moveUp', 'Move Up')} disabled={!button || index === 0} onClick={() => move(-1)}>▲</button>
        <button aria-label={T('moveDown', 'Move Down')} disabled={!button || index === buttons.length - 1} onClick={() => move(1)}>▼</button>
      </div>
      <div className="gc-dialog-list gc-format-buttons-list" role="listbox">
        {buttons.map((_, i) => <div key={i} role="option" aria-selected={i === index} className={`gc-dialog-list-item${i === index ? ' selected' : ''}`} onClick={() => setSelected(i)}>Cell Button {i}</div>)}
      </div>
      <div className="gc-format-buttons-detail">
        {button && <>
          <div className="gc-format-buttons-column">
            <Check text={T('enable', 'Enable')} checked={button.enabled !== false} onChange={(value) => edit('enabled', value)} />
            <Check text={T('useButtonStyle', 'UseButtonStyle')} checked={!!button.useButtonStyle} onChange={(value) => edit('useButtonStyle', value)} />
            <Field label={T('position2', 'Position')}><Select className="gc-format-button-position" value={Number(button.position)} onChange={(v) => edit('position', Number(v))} items={[{ text: T('left', 'Left'), value: '0' }, { text: T('right', 'Right'), value: '1' }]} /></Field>
            <Field label={T('width', 'Width')}><Input className="gc-format-button-width" type="number" value={button.width} onChange={(v) => edit('width', v === '' ? undefined : Number(v))} /></Field>
            <Field label={T('caption', 'Caption')}><Input className="gc-format-button-caption-text" value={button.caption} onChange={(v) => edit('caption', v)} /></Field>
            <Field label={T('backColor', 'BackColor')}><Input className="gc-format-button-backcolor" value={button.buttonBackColor} onChange={(v) => edit('buttonBackColor', v)} /></Field>
            <Field label={T('hoverBackColor', 'Hover BackColor')}><Input className="gc-format-button-hovercolor" value={button.hoverBackColor} onChange={(v) => edit('hoverBackColor', v)} /></Field>
            <Field label={T('imageType', 'Image Type')}><Select className="gc-format-button-imagetype" value={Number(button.imageType)} onChange={(v) => edit('imageType', Number(v))} items={IMAGE_TYPES.map((text, i) => ({ text, value: String(i) }))} /></Field>
            <Field label={T('visibility', 'Visibility')}><Select className="gc-format-button-visibility" value={Number(button.visibility)} onChange={(v) => edit('visibility', Number(v))} items={[{ text: T('always', 'Always'), value: '0' }, { text: T('onSelected', 'On Selected'), value: '1' }, { text: T('onEditing', 'On Editing'), value: '2' }]} /></Field>
            <Field label={T('command', 'Command')}><Select className="gc-format-button-command" value={String(button.command ?? 'none')} onChange={(v) => edit('command', v)} items={commands.map((name) => ({ text: name, value: name }))} /></Field>
          </div>
          <div className="gc-format-buttons-column">
            <Field label={T('imageSrc', 'Image Src')}><span className="gc-format-button-src-row"><Input className="gc-format-button-imagesrc" value={button.imageSrc} onChange={(v) => edit('imageSrc', v)} /><label className="gc-format-button-select-file">{T('selectFile', 'Select File')}<input type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => edit('imageSrc', String(reader.result ?? '')); reader.readAsDataURL(file); }} /></label></span></Field>
            <Field label={T('captionAlign', 'CaptionAlign')}><Select className="gc-format-button-captionalign" value={Number(button.captionAlign)} onChange={(v) => edit('captionAlign', Number(v))} items={[{ text: T('left', 'Left'), value: '0' }, { text: T('right', 'Right'), value: '1' }]} /></Field>
            <Field label={T('imageWidth', 'ImageWidth')}><Input className="gc-format-button-imagewidth" type="number" value={button.imageWidth} onChange={(v) => edit('imageWidth', Number(v))} /></Field>
            <Field label={T('imageHeight', 'ImageHeight')}><Input className="gc-format-button-imageheight" type="number" value={button.imageHeight} onChange={(v) => edit('imageHeight', Number(v))} /></Field>
            <Label text={T('preview2', 'Preview')} />
            <div className="gc-format-button-preview" aria-label={T('preview2', 'Preview')}><span className={`gc-format-button-draw${button.useButtonStyle ? ' gc-format-button-draw-style' : ''}`}>{String(button.imageSrc) && Number(button.imageType) === 1 ? '🖼' : ''}{String(button.caption ?? '')}</span></div>
          </div>
        </>}
      </div>
    </div>
  );
}

/* Padding tab — official structure: Label group (text, alignment icons, font family/size with
 * B/I/color, visibility, margin) on the left, Padding group (four sides) and Preview on the right.
 * Text maps to Style.watermark, the rest to Style.labelOptions (official numeric enums), and the
 * Padding group to the cellPadding CSS shorthand "top right bottom left". */
const LABEL_ALIGNMENTS = [
  { text: '${res.dialogs.topLeft}', value: '0' }, { text: '${res.dialogs.topCenter}', value: '1' }, { text: '${res.dialogs.topRight}', value: '2' },
  { text: '${res.dialogs.bottomLeft}', value: '3' }, { text: '${res.dialogs.bottomCenter}', value: '4' }, { text: '${res.dialogs.bottomRight}', value: '5' },
];

function PaddingTab({ data, update }: Props): React.ReactElement {
  const marginKeys = ['labelMarginTop', 'labelMarginRight', 'labelMarginBottom', 'labelMarginLeft'] as const;
  const margin = marginKeys.map((key) => Number(data[key] ?? 0));
  const alignment = Number(data.labelAlignment ?? 0);
  const bold = !!data.labelBold, italic = !!data.labelItalic;
  const font = `${italic ? 'italic' : 'normal'} ${bold ? 'bold' : 'normal'} ${String(data.labelFontSize ?? '11')}pt ${String(data.labelFontFamily ?? 'Calibri')}`;
  return (
    <div className="gc-format-padding-layout">
      <fieldset className="gc-format-label-group"><legend>{T('label', 'Label')}</legend>
        <Label text={T('text', 'Text')} /><Input className="gc-format-label-text" value={data.labelText ?? ''} onChange={(v) => update('labelText', v)} />
        <Label text={T('alignment', 'Alignment')} />
        <div className="gc-format-label-alignment" role="radiogroup" aria-label={T('alignment', 'Alignment')}>
          {LABEL_ALIGNMENTS.map((item) => <button key={item.value} role="radio" aria-checked={alignment === Number(item.value)} aria-label={item.text} title={item.text} className={`gc-format-alignment-icon gc-format-alignment-${item.value}${alignment === Number(item.value) ? ' selected' : ''}`} onClick={() => update('labelAlignment', Number(item.value))}><i /></button>)}
        </div>
        <Label text={T('fonts', 'Fonts')} />
        <div className="gc-format-label-fonts">
          <Input className="gc-format-label-font-family" value={data.labelFontFamily ?? 'Calibri'} onChange={(v) => update('labelFontFamily', v)} />
          <Input className="gc-format-label-font-size" type="number" value={data.labelFontSize ?? '11'} onChange={(v) => update('labelFontSize', v)} />
          <button className={`gc-format-label-bold${bold ? ' selected' : ''}`} aria-label={T('bold', 'Bold')} onClick={() => update('labelBold', !bold)}><b>B</b></button>
          <button className={`gc-format-label-italic${italic ? ' selected' : ''}`} aria-label={T('italic', 'Italic')} onClick={() => update('labelItalic', !italic)}><i>I</i></button>
          <input className="gc-format-label-color" type="color" aria-label={T('labelColor', 'Label color')} value={normalizeHex(data.labelForeColor)} onChange={(event) => update('labelForeColor', event.target.value)} />
        </div>
        <Label text={T('visibility', 'Visibility')} />
        <Select className="gc-format-label-visibility" value={Number(data.labelVisibility ?? 2)} onChange={(v) => update('labelVisibility', Number(v))} items={[{ text: T('visible', 'Visible'), value: '0' }, { text: T('hidden', 'Hidden'), value: '1' }, { text: T('auto', 'Auto'), value: '2' }]} />
        <Label text={T('margin', 'Margin')} />
        <div className="gc-format-label-margin">
          <Label text={T('top', 'Top')} /><Input className="gc-format-margin-top" type="number" value={margin[0]} onChange={(v) => update('labelMarginTop', Number(v))} />
          <Label text={T('right', 'Right')} /><Input className="gc-format-margin-right" type="number" value={margin[1]} onChange={(v) => update('labelMarginRight', Number(v))} />
          <Label text={T('left', 'Left')} /><Input className="gc-format-margin-left" type="number" value={margin[3]} onChange={(v) => update('labelMarginLeft', Number(v))} />
          <Label text={T('bottom', 'Bottom')} /><Input className="gc-format-margin-bottom" type="number" value={margin[2]} onChange={(v) => update('labelMarginBottom', Number(v))} />
        </div>
      </fieldset>
      <div className="gc-format-padding-right">
        <fieldset className="gc-format-padding-group"><legend>{T('padding', 'Padding')}</legend>
          <Label text={T('top', 'Top')} /><Input className="gc-format-padding-top" type="number" value={data.paddingTop ?? 0} onChange={(v) => update('paddingTop', Number(v))} />
          <Label text={T('right', 'Right')} /><Input className="gc-format-padding-right-input" type="number" value={data.paddingRight ?? 0} onChange={(v) => update('paddingRight', Number(v))} />
          <Label text={T('left', 'Left')} /><Input className="gc-format-padding-left" type="number" value={data.paddingLeft ?? 0} onChange={(v) => update('paddingLeft', Number(v))} />
          <Label text={T('bottom', 'Bottom')} /><Input className="gc-format-padding-bottom" type="number" value={data.paddingBottom ?? 0} onChange={(v) => update('paddingBottom', Number(v))} />
        </fieldset>
        <Label text={T('preview2', 'Preview')} />
        <div className="gc-format-padding-preview">
          <span className="gc-format-padding-preview-content">{T('content', 'Content')}</span>
          {data.labelVisibility !== 1 && String(data.labelText ?? '') !== '' && <span className="gc-format-padding-preview-label" data-alignment={String(alignment)} style={{ font, color: String(data.labelForeColor ?? '#808080') }}>{String(data.labelText)}</span>}
        </div>
      </div>
    </div>
  );
}

function normalizeHex(value: unknown): string {
  const text = String(value ?? '#808080');
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^#[0-9a-f]{3}$/i.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  return '#808080';
}

/* Decoration tab — official structure: Corner Fold (position checkboxes bitmask 1/2/4/8,
 * size, color) and Icons (Add/Delete plus a Src/Position/Width/Height grid). */
const ICON_POSITIONS = [
  { text: '${res.dialogs.left}', value: '0' }, { text: '${res.dialogs.right}', value: '1' }, { text: '${res.dialogs.leftOfText}', value: '2' },
  { text: '${res.dialogs.rightOfText}', value: '3' }, { text: '${res.dialogs.outsideLeft}', value: '4' }, { text: '${res.dialogs.outsideRight}', value: '5' },
];

function DecorationTab({ data, update }: Props): React.ReactElement {
  const decoration = (data.decoration ?? {}) as { cornerFold?: { position?: number; size?: number; color?: string }; icons?: { src?: string; position?: number; width?: number; height?: number }[] };
  const fold = decoration.cornerFold ?? {};
  const position = Number(fold.position ?? 0);
  const icons = decoration.icons ?? [];
  const setFold = (next: Partial<Required<typeof fold>>): void => update('decoration', { ...decoration, cornerFold: { position, size: Number(fold.size ?? 0), color: String(fold.color ?? ''), ...next } });
  const setIcons = (next: typeof icons): void => update('decoration', { ...decoration, icons: next });
  return (
    <div className="gc-format-decoration-layout">
      <fieldset className="gc-format-fold-group"><legend>{T('cornerFold', 'Corner Fold')}</legend>
        <div className="gc-format-fold-positions">
          <Label text={T('position', 'Position:')} />
          {['Left Top', 'Right Top', 'Left Bottom', 'Right Bottom'].map((text, i) => <Check key={text} text={text} className={`gc-format-fold-${i}`} checked={!!(position & (1 << i))} onChange={(checked) => setFold({ position: checked ? position | (1 << i) : position & ~(1 << i) })} />)}
        </div>
        <div className="gc-format-fold-side">
          <Label text={T('size', 'Size:')} /><Input className="gc-format-fold-size" type="number" value={Number(fold.size ?? 0)} onChange={(v) => setFold({ size: Number(v) })} />
          <Label text={T('color2', 'Color:')} /><Input className="gc-format-fold-color" value={fold.color ?? ''} onChange={(v) => setFold({ color: v })} />
        </div>
      </fieldset>
      <fieldset className="gc-format-icons-group"><legend>{T('icons', 'Icons')}</legend>
        <div className="gc-format-icons-toolbar">
          <button className="gc-format-icon-add" onClick={() => setIcons([...icons, { src: '', position: 1, width: 16, height: 16 }])}>{T('add', 'Add')}</button>
          <button className="gc-format-icon-delete" disabled={!icons.length} onClick={() => setIcons(icons.slice(0, -1))}>{T('delete', 'Delete')}</button>
        </div>
        <div className="gc-format-icons-grid" role="table" aria-label={T('icons', 'Icons')}>
          <div role="row" className="gc-format-icons-head"><span role="columnheader">{T('src', 'Src')}</span><span role="columnheader">{T('position2', 'Position')}</span><span role="columnheader">{T('width', 'Width')}</span><span role="columnheader">{T('height', 'Height')}</span></div>
          {icons.map((icon, i) => (
            <div key={i} role="row" className="gc-format-icons-row">
              <span role="cell"><Input value={icon.src} onChange={(value) => setIcons(icons.map((item, j) => j === i ? { ...item, src: value } : item))} /></span>
              <span role="cell"><Select value={Number(icon.position ?? 1)} onChange={(v) => setIcons(icons.map((item, j) => j === i ? { ...item, position: Number(v) } : item))} items={ICON_POSITIONS} /></span>
              <span role="cell"><Input type="number" value={icon.width ?? 16} onChange={(v) => setIcons(icons.map((item, j) => j === i ? { ...item, width: Number(v) } : item))} /></span>
              <span role="cell"><Input type="number" value={icon.height ?? 16} onChange={(v) => setIcons(icons.map((item, j) => j === i ? { ...item, height: Number(v) } : item))} /></span>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/* Mask tab — official structure: Settings (Pattern textarea + Pattern Example table) and
 * Optional (placeholder, exclusions), with the recognized-keyword reference table.
 * Labels transcribed from the running trial UI. */
const MASK_KEYWORDS = [
  ['a', 'Represents an alphabet'], ['A', 'Represents an uppercase alphabet'], ['0', 'Represents a number'],
  ['()', 'Indicates that any of the strings in () will match'], ['[', 'Used within () and acts as a delimiter between strings'],
  [']', 'For combining the keywords and literals as a whole'], ['\\', 'Represents the escape character'],
  ['*', 'Represents any character'], ['{a}', 'Represents a repeats'], ['{a,m}', 'Represents from a to m repeats'],
  ['{,m}', 'Represents up to m repeats'], ['{a,}', 'Represents at least a repeats'],
  ['y', 'Represents the year'], ['M', 'Represents the month'], ['d', 'Represents the day'],
  ['H', 'Represents the 24-hour'], ['h', 'Represents the hour'], ['m', 'Represents the minute'], ['s', 'Represents the second'],
];
const MASK_EXAMPLES = [
  ['Email', '[a-z0-9_\\.-]+@[a-z0-9_\\.]+\\.[a-z]{2,4}'], ['Decimal', '[+|-]?(([0-9]{1,})\\.([0-9]{1,}))|([0-9]{1,})'],
  ['Id-Card', '000-99-9999'], ['Date', 'yyyy-MM-dd'], ['Time', 'hh:mm:ss tt'], ['Phone', '0(1\\-)?(3[4-5])?0(31\\-0)(4)'],
];

function MaskTab({ data, update }: Props): React.ReactElement {
  const pattern = String(data.maskPattern ?? '');
  const placeholder = String(data.maskPlaceholder ?? '');
  return (
    <div className="gc-format-mask-layout">
      <div className="gc-format-mask-left">
        <fieldset><legend>{T('settings', 'Settings')}</legend>
          <Label text={T('pattern', 'Pattern')} /><textarea className="gc-dialog-input gc-format-mask-pattern" aria-label={T('pattern', 'Pattern')} value={pattern} onChange={(event) => update('maskPattern', event.target.value)} />
          <Label text={T('patternExample', 'Pattern Example')} />
          <div className="gc-format-mask-examples" role="table" aria-label={T('patternExample', 'Pattern Example')}>
            <div role="row" className="gc-format-mask-keyword-head"><span role="columnheader">{T('name', 'Name')}</span><span role="columnheader">{T('pattern', 'Pattern')}</span></div>
            {MASK_EXAMPLES.map(([name, example]) => <div key={name} role="row"><span role="cell">{resolveText(`\${res.maskExamples.${uiKey(name)}}`, getResources()) || name}</span><span role="cell">{example}</span></div>)}
          </div>
        </fieldset>
        <fieldset><legend>{T('optional', 'Optional')}</legend>
          <Label text={T('placeholder', 'Placeholder')} /><Input className="gc-format-mask-placeholder" aria-label={T('placeholder', 'Placeholder')} value={placeholder} onChange={(v) => update('maskPlaceholder', v)} />
          <Check text={T('excludeLiteral', 'Exclude Literal')} checked={!!data.maskExcludeLiteral} onChange={(v) => update('maskExcludeLiteral', v)} />
          <Check text={T('excludePlaceholder', 'Exclude Placeholder')} checked={!!data.maskExcludePlaceholder} onChange={(v) => update('maskExcludePlaceholder', v)} />
        </fieldset>
      </div>
      <fieldset className="gc-format-mask-keywords"><legend>{T('keywordList', 'Keyword List')}</legend>
        <div role="table">
          <div role="row" className="gc-format-mask-keyword-head"><span role="columnheader">{T('keyword', 'Keyword')}</span><span role="columnheader">{T('explanation', 'Explanation')}</span></div>
          {MASK_KEYWORDS.map(([keyword, description]) => <div key={keyword} role="row"><span role="cell">{keyword}</span><span role="cell">{description}</span></div>)}
        </div>
      </fieldset>
    </div>
  );
}

export function FormatDialogContent({ designer, data, update }: Props): React.ReactElement {
  // TASK 65: the trial's table-element format dialog offers only Font/Border/Fill;
  // `formatTabs` in the dialog data restricts the strip the same way.
  const allowed = Array.isArray(data.formatTabs) ? (data.formatTabs as string[]) : undefined;
  const tabs = allowed ? TABS.filter((tab) => allowed.includes(tab.key)) : TABS;
  const initial = designer.dialog?.initialTab;
  const initialIndex = Math.max(0, tabs.findIndex((tab) => tab.key === initial));
  const [active, setActive] = useState(initialIndex);
  const tab = tabs[active] ?? tabs[0];
  // TASK 86: the trial's tab slots are fixed widths (its own measured layout); a caption
  // only slightly wider than its content window still stays inside the box. A label wider
  // than the whole slot (longer-language captions, TASK 87) must expand instead of
  // overlapping its neighbours, so probe each caption once against the fixed slot and mark
  // the tabs that need the expansion (the CSS min-width: max-content applies to those only).
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return undefined;
    const items = [...bar.querySelectorAll<HTMLElement>('.gc-dialog-tab')];
    for (const el of items) el.classList.remove('gc-dialog-tab-wide');
    for (const el of items) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const textWidth = Array.from(range.getClientRects()).reduce((sum, rect) => sum + rect.width, 0);
      if (textWidth > el.getBoundingClientRect().width + 0.5) el.classList.add('gc-dialog-tab-wide');
    }
    return undefined;
  }, [tabs]);
  return (
    <div className={`gc-format-dialog-content gc-format-tab-${tab.key}`}>
      <div className="gc-dialog-tab-bar gc-format-tab-bar" role="tablist" ref={tabBarRef}>
        {tabs.map((item, index) => <button key={item.key} role="tab" aria-selected={index === active} className={`gc-dialog-tab${index === active ? ' selected' : ''}`} onClick={() => setActive(index)}>{resolveText(item.text, designer.resources) || item.text}</button>)}
      </div>
      <div className={`gc-format-tab-content${tab.key === 'mask' ? ' gc-format-mask-content' : ''}`} role="tabpanel">
        {tab.key === 'number' && <NumberTab designer={designer} data={data} update={update} />}
        {tab.key === 'alignment' && <AlignmentTab designer={designer} data={data} update={update} />}
        {tab.key === 'font' && <FontTab designer={designer} data={data} update={update} />}
        {tab.key === 'border' && <BorderTab designer={designer} data={data} update={update} />}
        {tab.key === 'fill' && <FillTab designer={designer} data={data} update={update} />}
        {tab.key === 'protection' && <ProtectionTab designer={designer} data={data} update={update} />}
        {tab.key === 'cellButton' && <CellButtonTab designer={designer} data={data} update={update} />}
        {tab.key === 'padding' && <PaddingTab designer={designer} data={data} update={update} />}
        {tab.key === 'decoration' && <DecorationTab designer={designer} data={data} update={update} />}
        {tab.key === 'mask' && <MaskTab designer={designer} data={data} update={update} />}
      </div>
    </div>
  );
}
