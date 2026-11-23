/* TASK 68 dialog bodies: the small custom controls the trial uses in the
 * Create/camera/sparkline/barcode dialogs (range-picker button), the Barcode
 * dialog (common fields + per-type options), Move Chart and Insert Slicer.
 * All artwork here is drawn by us (plain SVG paths). */
import React from 'react';
import { CustomRadio, CustomSelect } from './custom-widgets.js';
import type { DesignerApi as Designer, DialogData } from '../designer-api.js';
import { PAPER_ITEMS } from '../page-setup.js';
import { T } from './t.js';

/** The trial's range-picker button: captures the current sheet selection into the field. */
export function RangePickButton({ component, data, ctx, update }: {
  component: { bindingPath?: string };
  data: DialogData;
  ctx: { designer: Designer };
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const pick = (): void => {
    const sheet = ctx.designer.getWorkbook().getActiveSheet();
    const range = sheet.getSelections?.()?.find(Boolean);
    if (!range) return;
    const name = (col: number): string => {
      let label = '';
      for (let n = col; n >= 0; n = Math.floor(n / 26) - 1) label = String.fromCharCode(65 + (n % 26)) + label;
      return label;
    };
    const endCol = range.col + Math.max(0, range.colCount) - 1;
    const endRow = range.row + Math.max(0, range.rowCount) - 1;
    const reference = range.row === endRow && range.col === endCol
      ? `${name(range.col)}${range.row + 1}`
      : `${name(range.col)}${range.row + 1}:${name(endCol)}${endRow + 1}`;
    update(component.bindingPath, reference);
    void data;
  };
  return (
    <button type="button" className="gc-range-pick-button" title={T('cellRange', 'Cell range')} aria-label={T('cellRange', 'Cell range')} onClick={pick}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <rect x="1" y="2" width="14" height="12" rx="1" fill="#dfeaf7" stroke="#4f81bd" />
        <path d="M1 6h14M6 6v8M1 10h5M11 2v12" stroke="#4f81bd" strokeWidth="0.8" />
        <path d="M8 7l5 2-2 .6.9 1.8-.9.5-.9-1.8L8 11z" fill="#202020" stroke="#fff" strokeWidth="0.5" />
      </svg>
    </button>
  );
}

type BarcodeField = [label: string, path: string, editor: 'text' | 'number' | 'color' | 'combo', options?: string[]];
const barcodeTypeItems = ['QRCODE', 'EAN13', 'EAN8', 'CODABAR', 'CODE39', 'CODE93', 'CODE128', 'GS1_128', 'CODE49', 'PDF417', 'DATAMATRIX'];
const barcodeQrOptions: BarcodeField[] = [
  ['Error Correction Level', 'errorLevel', 'combo', ['L', 'M', 'Q', 'H']],
  ['Model', 'model', 'combo', ['1', '2']],
  ['Version', 'version', 'combo', ['auto', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']],
  ['Mask', 'mask', 'combo', ['auto', '0', '1', '2', '3', '4', '5', '6', '7']],
];
const barcodeLineOptions: BarcodeField[] = [
  ['Connection', 'connection', 'combo', ['false', 'true']],
  ['Connection No', 'connectionNo', 'number'],
  ['CharCode', 'charCode', 'text'],
  ['Charset', 'charset', 'combo', ['UTF-8', 'ISO-8859-1', 'ASCII', 'Shift-JIS', 'GB2312']],
  ['Show Label', 'showLabel', 'combo', ['false', 'true']],
  ['Label Position', 'labelPosition', 'combo', ['Top', 'Bottom', 'Left', 'Right']],
  ['Add On', 'addOn', 'text'],
  ['Add On Label Position', 'addOnLabelPosition', 'combo', ['Top', 'Bottom']],
  ['Text Align', 'textAlign', 'combo', ['Left', 'Center', 'Right']],
];

const field = (data: DialogData, update: (path: string, value: unknown) => void) => ([label, path, kind, options]: BarcodeField): React.ReactElement => (
  <div className="gc-dialog-column-set gc-barcode-row" key={path}>
    <span className="gc-dialog-label">{label}</span>
    {kind === 'combo'
      ? <CustomSelect className="gc-dialog-select" ariaLabel={label} value={String(data[path] ?? '')} options={(options ?? []).map((option) => ({ text: option, value: option }))} onChange={(next) => update(path, String(next))} />
      : kind === 'number'
        ? <input className="gc-dialog-input" type="number" aria-label={label} value={String(data[path] ?? '')} onChange={(event) => update(path, event.target.value)} />
        : kind === 'color'
          ? <span className="gc-dialog-color gc-barcode-color"><input className="gc-dialog-input" aria-label={label} value={String(data[path] ?? '')} onChange={(event) => update(path, event.target.value)} /><span className="gc-barcode-color-swatch" style={{ background: String(data[path] || 'transparent') }} /></span>
          : <input className="gc-dialog-input" aria-label={label} value={String(data[path] ?? '')} onChange={(event) => update(path, event.target.value)} />}
  </div>
);

/** Barcode dialog: the trial's nine common fields; the type-specific options
 *  only appear once a Barcode Type is selected (like the trial, which keeps
 *  the option groups hidden in its template until the combo has a value). */
export function BarcodeBody({ data, update }: { data: DialogData; update: (path: string, value: unknown) => void }): React.ReactElement {
  const render = field(data, update);
  const type = String(data.barcodeType ?? '');
  const isQr = type === 'QRCODE' || type === 'DATAMATRIX';
  return <div className="gc-barcode-body">
    {render(['Location Reference', 'location', 'text'])}
    <div className="gc-barcode-columns">
      <div className="gc-barcode-column">
        {render(['Value', 'value', 'text'])}
        {render(['Color', 'color', 'color'])}
        {render(['Quiet Zone Left', 'quietLeft', 'number'])}
        {render(['Quiet Zone Top', 'quietTop', 'number'])}
      </div>
      <div className="gc-barcode-column">
        <div className="gc-dialog-column-set gc-barcode-row">
          <span className="gc-dialog-label">{T('barcodeType', 'Barcode Type')}</span>
          <CustomSelect className="gc-dialog-select gc-barcode-type" ariaLabel="Barcode Type" value={type} options={[{ text: '', value: '' }, ...barcodeTypeItems.map((item) => ({ text: item, value: item }))]} onChange={(next) => update('barcodeType', String(next))} />
        </div>
        {render(['Background Color', 'backColor', 'color'])}
        {render(['Quiet Zone Right', 'quietRight', 'number'])}
        {render(['Quiet Zone Bottom', 'quietBottom', 'number'])}
      </div>
    </div>
    {type && <fieldset className="gc-dialog-groupbox gc-barcode-options"><legend>{T('barcodeOptions', 'Barcode Options')}</legend>
      <div className="gc-barcode-columns">
        <div className="gc-barcode-column">{(isQr ? barcodeQrOptions.slice(0, 2) : barcodeLineOptions.slice(0, 2)).map(render)}</div>
        <div className="gc-barcode-column">{(isQr ? barcodeQrOptions.slice(2) : barcodeLineOptions.slice(2, 4)).map(render)}</div>
      </div>
      {!isQr && <div className="gc-barcode-columns">
        <div className="gc-barcode-column">{barcodeLineOptions.slice(4, 7).map(render)}</div>
        <div className="gc-barcode-column">{barcodeLineOptions.slice(7).map(render)}</div>
      </div>}
    </fieldset>}
  </div>;
}

/**
 * Move Chart dialog body (TASK 68): the trial offers "New sheet:" with a name
 * editor and "Object in:" with the sheet dropdown; the thumbnails are our own
 * SVGs. Data: { mode, newSheetName, sheetName, sheets, chartSheet }.
 */
export function MoveChartBody({ data, update }: { data: DialogData; update: (path: string, value: unknown) => void }): React.ReactElement {
  const mode = String(data.mode ?? 'object');
  return <div className="gc-move-chart-body">
    <div className="gc-move-chart-option">
      <svg className="gc-move-chart-thumb" viewBox="0 0 36 30" aria-hidden="true">
        <rect x="4" y="1" width="28" height="20" fill="#fff" stroke="#9a9a9a" />
        <rect x="8" y="12" width="4" height="6" fill="#5b9bd5" />
        <rect x="15" y="8" width="4" height="10" fill="#70ad47" />
        <rect x="22" y="10" width="4" height="8" fill="#5b9bd5" />
        <path d="M1 22h34v7H1z" fill="#fff" stroke="#9a9a9a" />
      </svg>
      <label className="gc-dialog-radio gc-radio">
        <input type="radio" name="gc-move-chart-mode" checked={mode === 'new'} onChange={() => update('mode', 'new')} />
        <span>{T('newSheet', 'New sheet:')}</span>
      </label>
      <input className="gc-dialog-input gc-move-chart-name" type="text" aria-label={T('newSheetName', 'New sheet name')} disabled={mode !== 'new'} value={String(data.newSheetName ?? '')} onChange={(event) => update('newSheetName', event.target.value)} />
    </div>
    <div className="gc-move-chart-option">
      <svg className="gc-move-chart-thumb" viewBox="0 0 36 30" aria-hidden="true">
        <rect x="2" y="2" width="32" height="26" fill="#fff" stroke="#9a9a9a" />
        <path d="M2 9h32M2 16h32M2 23h32M12 2v26M22 2v26" stroke="#d0d0d0" />
        <rect x="8" y="6" width="18" height="13" fill="#fff" stroke="#9a9a9a" />
        <rect x="11" y="12" width="3" height="5" fill="#5b9bd5" />
        <rect x="16" y="9" width="3" height="8" fill="#70ad47" />
        <rect x="21" y="11" width="3" height="6" fill="#5b9bd5" />
      </svg>
      <CustomRadio className="gc-radio" checked={mode !== 'new'} onChange={() => update('mode', 'object')} label={T('objectIn', 'Object in:')} />
      <CustomSelect className="gc-dialog-select gc-move-chart-sheet" ariaLabel="Object in" disabled={mode === 'new'} value={String(data.sheetName ?? '')} options={((data.sheets as string[]) ?? []).map((name) => ({ text: name, value: name }))} onChange={(next) => update('sheetName', String(next))} />
    </div>
  </div>;
}

/**
 * Insert Slicer dialog body (TASK 68): the trial lists the pivot-table fields
 * that can get a slicer; the list stays empty (like the trial) when the sheet
 * has none. Data: { fields: [{ id, pivot, field, checked }] }.
 */
export function SlicerFieldList({ data, update }: { data: DialogData; update: (path: string, value: unknown) => void }): React.ReactElement {
  const fields = (data.fields as { id: string; pivot: string; field: string; checked?: boolean }[]) ?? [];
  return <div className="gc-slicer-field-list" role="listbox" aria-label={T('slicerFields', 'Slicer fields')}>
    {fields.map((item, index) => (
      <label key={item.id} className="gc-dialog-checkbox gc-slicer-field">
        <input type="checkbox" checked={!!item.checked} onChange={(event) => {
          const next = fields.map((row, i) => (i === index ? { ...row, checked: event.target.checked } : row));
          update('fields', next);
        }} />
        <span>{item.field}</span>
      </label>
    ))}
  </div>;
}

/**
 * Page Setup ▸ Page tab (TASK 68), matching the trial: "Orientation" group with
 * the two icon+radio rows, the "Scaling" group (Adjust to / Fit to radios),
 * the plain Paper size / Print quality / First page number rows and the right-
 * aligned Print Preview button. Draft fields follow `page-setup.ts`.
 */
export function PageSetupPage({ data, ctx, update }: {
  data: DialogData;
  ctx: { designer: Designer };
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const draft = (data.draft ?? {}) as Record<string, unknown>;
  const scaling = String(draft.scaling ?? 'adjust');
  return <div className="gc-page-setup-page">
    <fieldset className="gc-dialog-groupbox gc-page-orientation-group"><legend>{T('orientation', 'Orientation')}</legend>
      <div className="gc-page-orientation-row">
        <label className="gc-dialog-radio gc-radio"><svg className="gc-page-orientation-icon" viewBox="0 0 15 17" aria-hidden="true"><rect x="2" y="1" width="11" height="15" fill="#fff" stroke="#7a7a7a" /></svg>
          <input type="radio" name="gc-page-orientation" checked={Number(draft.orientation) !== 2} onChange={() => update('draft.orientation', 1)} />
          <span>{T('portrait', 'Portrait')}</span></label>
        <label className="gc-dialog-radio gc-radio"><svg className="gc-page-orientation-icon" viewBox="0 0 17 15" aria-hidden="true"><rect x="1" y="2" width="15" height="11" fill="#fff" stroke="#7a7a7a" /></svg>
          <input type="radio" name="gc-page-orientation" checked={Number(draft.orientation) === 2} onChange={() => update('draft.orientation', 2)} />
          <span>{T('landscape', 'Landscape')}</span></label>
      </div>
    </fieldset>
    <fieldset className="gc-dialog-groupbox gc-page-scaling-group"><legend>{T('scaling', 'Scaling')}</legend>
      <div className="gc-page-scaling-row">
        <label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-page-scaling" checked={scaling === 'adjust'} onChange={() => update('draft.scaling', 'adjust')} /></label>
        <span>{T('adjustTo', 'Adjust to:')}</span>
        <input className="gc-dialog-input gc-page-adjust" type="number" aria-label={T('adjustTo2', 'Adjust to')} value={String(draft.adjust ?? 100)} onChange={(event) => { update('draft.adjust', event.target.value === '' ? 0 : Number(event.target.value)); update('draft.scaling', 'adjust'); }} />
        <span>{T('normalSize', '% normal size')}</span>
      </div>
      <div className="gc-page-scaling-row">
        <label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-page-scaling" checked={scaling === 'fit'} onChange={() => update('draft.scaling', 'fit')} /></label>
        <span>{T('fitTo', 'Fit to:')}</span>
        <input className="gc-dialog-input gc-page-fit-wide" type="number" aria-label={T('pagesWide', 'pages wide')} value={String(draft.fitWide ?? '')} onChange={(event) => { update('draft.fitWide', event.target.value); update('draft.scaling', 'fit'); }} />
        <span>{T('pagesWideBy', 'page(s) wide by')}</span>
        <input className="gc-dialog-input gc-page-fit-tall" type="number" aria-label={T('tall', 'tall')} value={String(draft.fitTall ?? '')} onChange={(event) => { update('draft.fitTall', event.target.value); update('draft.scaling', 'fit'); }} />
        <span>{T('tall', 'tall')}</span>
      </div>
    </fieldset>
    <div className="gc-dialog-label-line gc-page-separator" />
    <div className="gc-dialog-column-set gc-page-field-row"><span className="gc-dialog-label">{T('paperSize', 'Paper size:')}</span>
      <CustomSelect className="gc-dialog-select gc-page-size" ariaLabel={T('paperSize2', 'Paper size')} value={String(draft.paperName ?? 'Letter')} options={PAPER_ITEMS.map((item) => ({ text: item.text, value: item.text }))} onChange={(next) => update('draft.paperName', String(next))} />
    </div>
    <div className="gc-dialog-column-set gc-page-field-row"><span className="gc-dialog-label">{T('printQuality', 'Print quality:')}</span>
      <input className="gc-dialog-input gc-page-quality" type="number" aria-label={T('printQuality2', 'Print quality')} value={String(draft.quality ?? 2)} onChange={(event) => update('draft.quality', event.target.value === '' ? 0 : Number(event.target.value))} />
    </div>
    <div className="gc-dialog-column-set gc-page-field-row"><span className="gc-dialog-label">{T('firstPageNumber', 'First page number:')}</span>
      <input className="gc-dialog-input gc-page-first-number" aria-label={T('firstPageNumber2', 'First page number')} value={String(draft.firstPage ?? 'Auto')} onChange={(event) => update('draft.firstPage', event.target.value)} />
    </div>
    <div className="gc-page-preview-row"><button type="button" className="gc-dialog-secondary gc-page-preview" onClick={() => ctx.designer.print()}>{T('printPreview', 'Print Preview')}</button></div>
  </div>;
}

/** Margins tab (TASK 68): the trial shows the six inch inputs around a page
 *  diagram (our own SVG) and the "Center on page" checkboxes. */
export function PageMargins({ data, ctx, update }: {
  data: DialogData;
  ctx: { designer: Designer };
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const draft = (data.draft ?? {}) as Record<string, Record<string, number>>;
  const margin = (key: string): number => Number(draft.margins?.[key] ?? 0);
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement>): void => update(`draft.margins.${key}`, Number(event.target.value) || 0);
  const input = (key: string, label: string): React.ReactElement => (
    <div className="gc-margin-field" key={key}><span className="gc-dialog-label">{label}</span>
      <input className="gc-dialog-input gc-margin-input" type="number" step="0.01" aria-label={label} value={margin(key)} onChange={set(key)} />
    </div>
  );
  return <div className="gc-page-margins">
    <div className="gc-margin-toprow">{input('top', 'Top:')}{input('header', 'Header:')}</div>
    <div className="gc-margin-midrow">
      <div className="gc-margin-side">{input('left', 'Left:')}</div>
      <svg className="gc-margin-preview" viewBox="0 0 96 122" aria-hidden="true">
        <rect x="10" y="4" width="76" height="114" fill="#fff" stroke="#1f1f1f" strokeWidth="1.6" />
        <rect x="18" y="12" width="60" height="12" fill="none" stroke="#9a9a9a" />
        <rect x="18" y="92" width="60" height="12" fill="none" stroke="#9a9a9a" />
        <path d="M18 30h60M18 38h60M18 46h60M18 54h60M18 62h60M18 70h60M18 78h60M34 30v48M50 30v48M66 30v48" stroke="#b5b5b5" />
      </svg>
      <div className="gc-margin-side">{input('right', 'Right:')}</div>
    </div>
    <div className="gc-margin-toprow">{input('bottom', 'Bottom:')}{input('footer', 'Footer:')}</div>
    <fieldset className="gc-dialog-groupbox gc-page-center-group"><legend>{T('centerOnPage', 'Center on page')}</legend>
      {check('draft.centerH', 'Horizontally', update, draft)}
      {check('draft.centerV', 'Vertically', update, draft)}
    </fieldset>
    <div className="gc-page-preview-row"><button type="button" className="gc-dialog-secondary gc-page-preview" onClick={() => ctx.designer.print()}>{T('printPreview', 'Print Preview')}</button></div>
  </div>;
}

function check(path: string, label: string, update: (path: string | undefined, value: unknown) => void, root: Record<string, unknown>): React.ReactElement {
  const value = path.includes('.') ? path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], root) : root[path];
  return <label className="gc-dialog-checkbox" key={path}><input type="checkbox" checked={!!value} onChange={(event) => update(path, event.target.checked)} /><span>{label}</span></label>;
}

/** Header/Footer tab (TASK 68): the trial previews the header and footer in two
 *  boxes around the "(none)" combos and the Custom Header/Footer buttons. */
export function PageHeaderFooter({ data, ctx, update }: {
  data: DialogData;
  ctx: { designer: Designer };
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const draft = (data.draft ?? {}) as Record<string, Record<string, string>> & Record<string, unknown>;
  const hfText = (side: 'header' | 'footer'): string => [draft[side]?.left, draft[side]?.center, draft[side]?.right].filter(Boolean).join('  ');
  const box = (side: 'header' | 'footer'): React.ReactElement => (
    <div className="gc-hf-preview" key={side}>
      <span className="gc-hf-preview-left">{draft[side]?.left}</span>
      <span className="gc-hf-preview-center">{draft[side]?.center}</span>
      <span className="gc-hf-preview-right">{draft[side]?.right}</span>
    </div>
  );
  const combo = (side: 'header' | 'footer'): React.ReactElement => {
    const text = hfText(side);
    return <CustomSelect className="gc-dialog-select gc-hf-select" ariaLabel={`${side[0].toUpperCase()}${side.slice(1)}:`} value={text ? 'custom' : 'none'}
      options={text ? [{ text: T('none2', '(none)'), value: 'none' }, { text: T('custom2', 'custom'), value: 'custom' }] : [{ text: T('none2', '(none)'), value: 'none' }]}
      onChange={(next) => { if (String(next) === 'none') update(`draft.${side}`, { left: '', center: '', right: '' }); }} />;
  };
  const custom = (side: 'header' | 'footer') => (): void => {
    ctx.designer.showCustomHeaderFooter(side, { ...(draft[side] ?? {}) }, (values) => update(`draft.${side}`, values));
  };
  return <div className="gc-page-hf">
    {box('header')}
    <div className="gc-hf-label-row"><span className="gc-dialog-label">{T('header', 'Header:')}</span></div>
    {combo('header')}
    <div className="gc-hf-button-row">
      <button type="button" className="gc-dialog-secondary" onClick={custom('header')}>{T('customHeader', 'Custom Header...')}</button>
      <button type="button" className="gc-dialog-secondary" onClick={custom('footer')}>{T('customFooter', 'Custom Footer...')}</button>
    </div>
    <div className="gc-hf-label-row"><span className="gc-dialog-label">{T('footer', 'Footer:')}</span></div>
    {combo('footer')}
    {box('footer')}
    <div className="gc-hf-checks">
      {check('draft.differentOddAndEvenPages', 'Different odd and even pages', update, draft as Record<string, unknown>)}
      {check('draft.differentFirstPage', 'Different first page', update, draft as Record<string, unknown>)}
    </div>
    <div className="gc-page-preview-row"><button type="button" className="gc-dialog-secondary gc-page-preview" onClick={() => ctx.designer.print()}>{T('printPreview', 'Print Preview')}</button></div>
  </div>;
}

/** Sheet tab (TASK 68): print area + titles with pickers, the Print checkbox
 *  list and the Page order radios with the trial's grid icons. */
export function PageSheetTab({ data, ctx, update }: {
  data: DialogData;
  ctx: { designer: Designer };
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const draft = (data.draft ?? {}) as Record<string, unknown>;
  const pickRow = (path: string, label: string): React.ReactElement => (
    <div className="gc-dialog-column-set gc-sheet-field-row" key={path}>
      <span className="gc-dialog-label">{label}</span>
      <input className="gc-dialog-input gc-sheet-area" aria-label={label} value={String(draft[path.split('.')[1]] ?? '')} onChange={(event) => update(path, event.target.value)} />
      <button type="button" className="gc-range-pick-button" title={T('cellRange', 'Cell range')} aria-label={T('cellRange', 'Cell range')} onClick={() => {
        const range = ctx.designer.getWorkbook().getActiveSheet().getSelections?.()?.find(Boolean);
        if (range) update(path, `${String.fromCharCode(65 + Math.max(0, range.col))}${Math.max(0, range.row) + 1}:${String.fromCharCode(65 + Math.max(0, range.col + Math.max(1, range.colCount) - 1))}${Math.max(0, range.row + Math.max(1, range.rowCount) - 1)}`);
      }}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1" y="2" width="14" height="12" rx="1" fill="#dfeaf7" stroke="#4f81bd" /><path d="M1 6h14M6 6v8M1 10h5M11 2v12" stroke="#4f81bd" strokeWidth="0.8" /></svg>
      </button>
    </div>
  );
  const orderIcon = (horizontal: boolean): React.ReactElement => (
    <svg className="gc-page-order-icon" viewBox="0 0 44 24" aria-hidden="true">
      {[2, 17, 32].map((x) => <g key={x}><rect x={x} y="2" width="10" height="20" fill="#fff" stroke="#9a9a9a" />{[6, 10, 14, 18].map((y) => <path key={y} d={`M${x} ${y}h10`} stroke="#d5d5d5" />)}</g>)}
      {horizontal
        ? <path d="M8 8v8h24" fill="none" stroke="#2e8b87" strokeWidth="2" markerEnd="url(#t68-arrow)" />
        : <path d="M7 6v12M7 6h0" fill="none" stroke="#2e8b87" strokeWidth="2" />}
      <path d={horizontal ? 'M28 14l4 2-4 2z' : 'M7 4l3 4H4z'} fill="#2e8b87" />
    </svg>
  );
  return <div className="gc-page-sheet">
    {pickRow('draft.printArea', 'Print area:')}
    <div className="gc-sheet-subtitle">{T('printTitles', 'Print titles')}</div>
    {pickRow('draft.repeatRows', 'Rows to repeat at top:')}
    {pickRow('draft.repeatColumns', 'Columns to repeat at left:')}
    <div className="gc-sheet-subtitle">{T('print', 'Print')}</div>
    <div className="gc-sheet-checks">
      {check('draft.printGridlines', 'Gridlines', update, draft)}
      {check('draft.showBorder', 'Show borders', update, draft)}
      {check('draft.blackAndWhite', 'Black and white', update, draft)}
      {check('draft.headings', 'Row and column headings', update, draft)}
    </div>
    <div className="gc-sheet-order-row">
      <span className="gc-dialog-label">{T('pageOrder', 'Page order:')}</span>
      <div className="gc-sheet-order-radios">
        <label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-page-order" checked={Number(draft.pageOrder) !== 2} onChange={() => update('draft.pageOrder', 1)} /><span>{T('downThenOver', 'Down, then over')}</span></label>
        <label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-page-order" checked={Number(draft.pageOrder) === 2} onChange={() => update('draft.pageOrder', 2)} /><span>{T('overThenDown', 'Over, then down')}</span></label>
      </div>
      {orderIcon(Number(draft.pageOrder) === 2)}
    </div>
    <div className="gc-page-preview-row"><button type="button" className="gc-dialog-secondary gc-page-preview" onClick={() => ctx.designer.print()}>{T('printPreview', 'Print Preview')}</button></div>
  </div>;
}
