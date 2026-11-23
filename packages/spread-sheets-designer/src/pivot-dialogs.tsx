/**
 * Dialog bodies for the PivotTable UI (TASK 47 items 1 and 4), mounted through
 * `DialogHost` by template name. The layouts mirror the trial: Create
 * PivotTable (source range + placement), Move PivotTable, Value Field
 * Settings (Summarize Values By / Show Value As + Number Format) and Field
 * Settings (Subtotals / Layout & Print).
 */
import React, { useState } from 'react';
import type { DesignerApi as Designer, DialogData } from './designer-api.js';
import { SUBTOTAL_ITEMS, SHOW_DATA_AS_ITEMS, applyCalcFieldAdd, applyCalcFieldDelete, applyCalcFieldModify, applyCalcItemAdd, applyCalcItemDelete, calcFieldEntries, moveCalcItem, pivotItemNames, solveOrderEntries } from './pivot-designer.js';
import type { PivotTable } from './pivot-designer.js';
import { FormatDialogContent } from './dialogs/FormatDialog.js';
import { numberFormatterFor } from './dialogs/number-format.js';
import { T } from './dialogs/t.js';
import { resolveText } from './resolve.js';

/** One label + input row of the trial's dialog grid. */
function FieldRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <div className={`gc-pivot-dialog-row${className ? ` ${className}` : ''}`}>
      <span className="gc-pivot-dialog-label">{label}</span>
      {children}
    </div>
  );
}

/* ------------------------------------------------- Create PivotTable ----- */

export function InsertPivotTableBody({ designer: _designer, data, update }: { designer: Designer; data: DialogData; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const existing = data.placement === 'existing';
  return <div className="gc-insert-pivot-dialog">
    <div className="gc-insert-pivot-title">{T('chooseTheDataThatYouWantToAnalyze', 'Choose the data that you want to analyze')}</div>
    <div className="gc-range-select">
      <input className="gc-dialog-input gc-insert-pivot-range" value={String(data.range ?? '')} onChange={(event) => update('range', event.target.value)} aria-label={T('tableRange', 'Table/Range')} />
      <span className="gc-range-select-button" aria-hidden="true" />
    </div>
    <div className="gc-insert-pivot-title gc-insert-pivot-title-2">{T('chooseWhereYouWantThePivotTableReportToBePlaced', 'Choose where you want the PivotTable report to be placed')}</div>
    <div className="gc-radio-group">
      <label className={`gc-radio-item${!existing ? ' gc-radio-item-selected' : ''}`}>
        <input type="radio" className="gc-radio-button" checked={!existing} onChange={() => update('placement', 'new')} />
        <span className="gc-radio-text">{T('newWorksheet', 'New Worksheet')}</span>
      </label>
      <label className={`gc-radio-item${existing ? ' gc-radio-item-selected' : ''}`}>
        <input type="radio" className="gc-radio-button" checked={existing} onChange={() => update('placement', 'existing')} />
        <span className="gc-radio-text">{T('existingWorksheet', 'Existing Worksheet')}</span>
      </label>
    </div>
    <div className={`gc-range-select gc-insert-pivot-location${!existing ? ' gc-component-disabled' : ''}`}>
      <input className="gc-dialog-input" value={String(data.location ?? '')} disabled={!existing} onChange={(event) => update('location', event.target.value)} placeholder="A1" aria-label={T('location', 'Location')} />
      <span className="gc-range-select-button" aria-hidden="true" />
    </div>
  </div>;
}

/* ---------------------------------------------------- Move PivotTable ---- */

export function MovePivotTableBody({ data, update }: { data: DialogData; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const existing = data.placement === 'existing';
  return <div className="gc-insert-pivot-dialog">
    <div className="gc-insert-pivot-title">{T('chooseWhereYouWantThePivotTableReportToBePlaced', 'Choose where you want the PivotTable report to be placed')}</div>
    <div className="gc-radio-group">
      <label className={`gc-radio-item${!existing ? ' gc-radio-item-selected' : ''}`}>
        <input type="radio" className="gc-radio-button" checked={!existing} onChange={() => update('placement', 'new')} />
        <span className="gc-radio-text">{T('newWorksheet', 'New Worksheet')}</span>
      </label>
      <label className={`gc-radio-item${existing ? ' gc-radio-item-selected' : ''}`}>
        <input type="radio" className="gc-radio-button" checked={existing} onChange={() => update('placement', 'existing')} />
        <span className="gc-radio-text">{T('existingWorksheet', 'Existing Worksheet')}</span>
      </label>
    </div>
    <div className={`gc-range-select gc-insert-pivot-location${!existing ? ' gc-component-disabled' : ''}`}>
      <input className="gc-dialog-input" value={String(data.location ?? '')} disabled={!existing} onChange={(event) => update('location', event.target.value)} aria-label={T('location', 'Location')} />
      <span className="gc-range-select-button" aria-hidden="true" />
    </div>
  </div>;
}

/* ------------------------------------------------ Grouping (TASK 93) ------ */

/* Geometry measured from the trial's Grouping dialog (315x360; dialog-relative):
   "Auto" 17,50; Starting/Ending rows at y72/y94 (checkbox 13x13 at x17, label
   x33, input 183x19 at x111); "By:" 17,117; the Seconds..Years list x30..293
   rows 16px; "Number of days:" label right-aligned at x233 + 60x20 input;
   the number variant shows only the three inputs. */

const GROUP_UNITS = ['groupSeconds', 'groupMinutes', 'groupHours', 'groupDays', 'groupMonths', 'groupQuarters', 'groupYears'];

/** One Grouping dialog row: checkbox (date dialog only) + label + input. */
function GroupingRow({ checked, onChecked, label, value, onChange, inputId }: { checked: boolean; onChecked: (v: boolean) => void; label: string; value: string; onChange: (v: string) => void; inputId: string }): React.ReactElement {
  return (
    <div className="gc-pivot-grouping-row">
      <input type="checkbox" className="gc-pivot-grouping-check" checked={checked} onChange={(event) => onChecked(event.target.checked)} aria-label={label} />
      <label className="gc-pivot-grouping-label" htmlFor={inputId}>{label}</label>
      <input className="gc-dialog-input gc-pivot-grouping-input" id={inputId} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function PivotGroupingBody({ data, update }: { designer?: Designer; data: DialogData; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const isDate = data.kind !== 'number';
  const bys = Array.isArray(data.bys) ? data.bys as boolean[] : [];
  const daysSelected = !!bys[3];
  return <div className="gc-pivot-grouping-dialog">
    <div className="gc-pivot-grouping-auto">{T('auto', 'Auto')}</div>
    <GroupingRow inputId="gc-grouping-start" checked={data.startEnabled !== false} onChecked={(v) => update('startEnabled', v)} label={T('startingAt', 'Starting at:')} value={String(data.start ?? '')} onChange={(v) => update('start', v)} />
    <GroupingRow inputId="gc-grouping-end" checked={data.endEnabled !== false} onChecked={(v) => update('endEnabled', v)} label={T('endingAt', 'Ending at:')} value={String(data.end ?? '')} onChange={(v) => update('end', v)} />
    {isDate ? <>
      <div className="gc-pivot-grouping-by-label">{T('byLabel', 'By:')}</div>
      <div className="gc-pivot-grouping-list" role="listbox" aria-multiselectable="true">
        {GROUP_UNITS.map((key, unit) => <div key={key} role="option" aria-selected={!!bys[unit]}
          className={`gc-pivot-grouping-item${bys[unit] ? ' gc-pivot-grouping-item-selected' : ''}`}
          onClick={() => { const next = [...bys]; next[unit] = !next[unit]; update('bys', next); }}>{T(key, key)}</div>)}
      </div>
      <div className="gc-pivot-grouping-interval">
        <label className="gc-pivot-grouping-interval-label" htmlFor="gc-grouping-interval">{T('numberOfDays', 'Number of days:')}</label>
        <input className="gc-dialog-input gc-pivot-grouping-interval-input" id="gc-grouping-interval" type="number" min="1" step="1" disabled={!daysSelected}
          value={String(data.interval ?? '1')} onChange={(event) => update('interval', event.target.value)} />
      </div>
    </> : <div className="gc-pivot-grouping-row gc-pivot-grouping-by-row">
      <span className="gc-pivot-grouping-label gc-pivot-grouping-by-indent">{T('byLabel', 'By:')}</span>
      <input className="gc-dialog-input gc-pivot-grouping-input" value={String(data.by ?? '')} onChange={(event) => update('by', event.target.value)} aria-label={T('byLabel', 'By:')} />
    </div>}
  </div>;
}

/* ------------------------------------------ Value Field Settings --------- */

/* Geometry from the trial's dialogs (`.probe/f47-item4-official*.json`, positions
   measured from the dialog's top-left; this body renders inside the 34px header
   so every `top` below is the trial y minus 34). */

/** Resolve the Format Cells data into the formatter it stands for (trial defaults: 2 decimals, $ symbol). */
function numberFormatFromData(data: DialogData): string {
  const category = String(data.category ?? 'General');
  if (category === 'Custom') return String(data.formatCode ?? '');
  try {
    return numberFormatterFor(category, {
      decimals: Math.round(Number(data.decimals ?? 2)), separator: !!data.separator,
      negative: Number(data.negative ?? 0), symbol: Number(data.symbol ?? 1),
      type: Number(data.type ?? 0), locale: Number(data.locale ?? 0),
    }) ?? 'General';
  } catch { return 'General'; }
}

/**
 * The trial's Format Cells dialog opened by the dialogs' Number Format /
 * Label Format buttons: a second dialog surface inside this body (the trial
 * stacks it over the pivot dialog, so the pivot dialog keeps its state).
 */
function FormatCellsOverlay({ designer, initial, onOk, onCancel }: { designer: Designer; initial: DialogData; onOk: (formatter: string) => void; onCancel: () => void }): React.ReactElement {
  const [nfData, setNfData] = useState<DialogData>(initial);
  const update = (path: string | undefined, value: unknown): void => setNfData((prev) => (path ? { ...prev, [path]: value } : prev));
  return (
    <div className="gc-designer-dialog-overlay gc-pivot-nf-overlay">
      <div className="gc-designer-dialog gc-pivot-numberformat-dialog" data-template="pivotNumberFormatDialog">
        <div className="gc-dialog-header"><div className="gc-dialog-title">{T('formatCells', 'Format Cells')}</div><button className="gc-dialog-close" aria-label="Close" onClick={onCancel}>×</button></div>
        <div className="gc-dialog-content gc-pivot-nf-content"><FormatDialogContent designer={designer} data={nfData} update={update} /></div>
        <div className="gc-dialog-footer">
          <button className="gc-dialog-button" onClick={onCancel}>{resolveText('${res.cancel}', designer.resources) || 'Cancel'}</button>
          <button className="gc-dialog-button gc-dialog-button-primary" onClick={() => onOk(numberFormatFromData(nfData))}>OK</button>
        </div>
      </div>
    </div>
  );
}

/** The common first rows of the trial's Field Settings / Value Field Settings dialogs. */
function PivotDialogHeader({ data, update, dialogName }: { data: DialogData; update: (path: string | undefined, value: unknown) => void; dialogName: string }): React.ReactElement {
  return <>
    <div className="gc-pd-label gc-pd-src-label">{T('sourceName', 'Source Name:')}</div>
    <div className="gc-pd-src">{String(data.sourceName ?? '')}</div>
    <div className="gc-pd-label gc-pd-custom-label">{T('customName', 'Custom Name:')}</div>
    <input className="gc-pd-custom" value={String(data.customName ?? '')} onChange={(event) => update('customName', event.target.value)} aria-label={T('customName2', 'Custom Name')} />
    {dialogName === 'pivotValueFieldSettingsDialogTemplate' ? <div className="gc-pd-tabs">
      <button role="tab" className={`gc-pd-tab gc-pd-tab1${data.__tab === 'values' ? '' : ' selected'}`} onClick={() => update('__tab', 'summarize')}>{T('summarizeValuesBy', 'Summarize Values By')}</button>
      <button role="tab" className={`gc-pd-tab gc-pd-tab2${data.__tab === 'values' ? ' selected' : ''}`} onClick={() => update('__tab', 'values')}>{T('showValueAs', 'Show Value As')}</button>
    </div> : <div className="gc-pd-tabs">
      <button role="tab" className={`gc-pd-tab gc-pd-tab1${data.__tab === 'layout' ? '' : ' selected'}`} onClick={() => update('__tab', 'subtotals')}>{T('subtotals', 'Subtotals')}</button>
      <button role="tab" className={`gc-pd-tab gc-pd-tab2 gc-pd-tab-lp${data.__tab === 'layout' ? ' selected' : ''}`} onClick={() => update('__tab', 'layout')}>{T('layoutAmpPrint', 'Layout & Print')}</button>
    </div>}
  </>;
}

export function ValueFieldSettingsBody({ designer, data, update }: { designer: Designer; data: DialogData; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const [formatOpen, setFormatOpen] = useState(false);
  const tab = String(data.__tab ?? 'summarize');
  const pivot = activePivotOf(designer);
  const showDataAs = Number(data.showDataAs ?? 0);
  const needsBase = showDataAs >= 4 && showDataAs <= 13;
  const baseFields = pivot
    ? pivot.getFieldsByArea().filter((field) => field.pivotArea !== 3).map((field) => field.sourceName).filter((name, i, all) => all.indexOf(name) === i)
    : [];
  const baseField = String(data.baseField ?? baseFields[0] ?? '');
  const baseItems = needsBase && pivot ? ['(all)', ...pivot.getItemsByField(baseField)] : [];
  const format = String(data.format ?? '');
  return <div className="gc-value-field-dialog gc-vfs-dialog">
    <PivotDialogHeader data={data} update={update} dialogName="pivotValueFieldSettingsDialogTemplate" />
    <div className="gc-pd-panel">
      {tab === 'summarize' ? <>
        <div className="gc-pd-panel-head">{T('summarizeValuesFieldBy', 'Summarize values field by')}</div>
        <div className="gc-vfs-note">{T('chooseTheTypeOfCalculationThatYouWantToUseToSummarizeDataFromTheSelectedField', 'Choose the type of calculation that you want to use to summarize data from the selected field')}</div>
        <div className="gc-vfs-list" role="listbox" aria-label={T('summarizeValuesFieldBy', 'Summarize values field by')}>
          {SUBTOTAL_ITEMS.map((item) => (
            <div key={item.text} role="option" aria-selected={Number(data.subtotal ?? 8) === item.value} className={`gc-vfs-item${Number(data.subtotal ?? 8) === item.value ? ' selected' : ''}`} onClick={() => update('subtotal', item.value)}>{T(item.labelKey, item.text)}</div>
          ))}
        </div>
      </> : <>
        <div className="gc-pd-panel-head">{T('showValueAs2', 'Show value as')}</div>
        <select className="gc-vfs-sva" value={String(showDataAs)} onChange={(event) => update('showDataAs', Number(event.target.value))} aria-label={T('showValueAs2', 'Show value as')}>
          {SHOW_DATA_AS_ITEMS.map((item) => <option key={item.text} value={item.value}>{T(item.labelKey, item.text)}</option>)}
        </select>
        <div className="gc-pd-label gc-vfs-bf-label">{T('baseField', 'Base field:')}</div>
        <div className="gc-pd-label gc-vfs-bi-label">{T('baseItem', 'Base item:')}</div>
        <div className={`gc-vfs-base-list${needsBase ? '' : ' gc-component-disabled'}`}>
          {baseFields.map((name) => (
            <div key={name} className={`gc-vfs-base-item${baseField === name ? ' selected' : ''}`} onClick={() => needsBase && update('baseField', name)}>{name}</div>
          ))}
        </div>
        <div className={`gc-vfs-base-list gc-vfs-base-list2${needsBase ? '' : ' gc-component-disabled'}`}>
          {baseItems.map((name) => (
            <div key={name} className={`gc-vfs-base-item${String(data.baseItem ?? '(all)') === name ? ' selected' : ''}`} onClick={() => needsBase && update('baseItem', name)}>{name}</div>
          ))}
        </div>
      </>}
    </div>
    <input type="button" className="gc-pd-foot-btn gc-vfs-nf" value={T('numberFormat', 'Number Format')} onClick={() => setFormatOpen(true)} />
    <input type="button" className="gc-pd-foot-btn gc-pd-ok" value="OK" onClick={() => designer.closeDialog(String(designer.dialog?.name ?? 'pivotValueFieldSettingsDialogTemplate'), true)} />
    <input type="button" className="gc-pd-foot-btn gc-pd-cancel" value="Cancel" onClick={() => designer.closeDialog(String(designer.dialog?.name ?? 'pivotValueFieldSettingsDialogTemplate'), false)} />
    {formatOpen && <FormatCellsOverlay
      designer={designer}
      initial={format ? { category: 'Custom', formatCode: format } : { category: 'General' }}
      onOk={(formatter) => { update('format', formatter === 'General' ? '' : formatter); setFormatOpen(false); }}
      onCancel={() => setFormatOpen(false)}
    />}
  </div>;
}

/* --------------------------------------------------- Field Settings ------ */

export function FieldSettingsBody({ designer, data, update }: { designer: Designer; data: DialogData; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const [formatOpen, setFormatOpen] = useState(false);
  const tab = String(data.__tab ?? 'subtotals');
  const subtotals = String(data.subtotals ?? 'automatic');
  const format = String(data.format ?? '');
  return <div className={`gc-value-field-dialog gc-field-settings-dialog${tab === 'layout' ? ' gc-fs-lp' : ''}`}>
    <PivotDialogHeader data={data} update={update} dialogName="pivotFieldSettingsDialogTemplate" />
    <div className="gc-pd-panel gc-fs-panel">
      {tab === 'subtotals' ? <>
        <div className="gc-pd-panel-head gc-fs-head">{T('subtotals', 'Subtotals')}</div>
        <label className="gc-pd-radio gc-pd-radio1"><input type="radio" checked={subtotals === 'automatic'} onChange={() => update('subtotals', 'automatic')} /></label>
        <div className="gc-pd-radio-label gc-pd-radio1" onClick={() => update('subtotals', 'automatic')}>{T('automatic', 'Automatic')}</div>
        <label className="gc-pd-radio gc-pd-radio2"><input type="radio" checked={subtotals === 'none'} onChange={() => update('subtotals', 'none')} /></label>
        <div className="gc-pd-radio-label gc-pd-radio2" onClick={() => update('subtotals', 'none')}>{T('none', 'None')}</div>
        <label className="gc-pd-radio gc-pd-radio3"><input type="radio" checked={subtotals === 'custom'} onChange={() => update('subtotals', 'custom')} /></label>
        <div className="gc-pd-radio-label gc-pd-radio3" onClick={() => update('subtotals', 'custom')}>{T('custom', 'Custom')}</div>
        <div className={`gc-fs-hint${subtotals === 'custom' ? '' : ' gc-component-disabled'}`}>{T('selectOneOrMoreFunctions', 'Select one or more functions:')}</div>
        <div className={`gc-vfs-list gc-fs-list${subtotals === 'custom' ? '' : ' gc-component-disabled'}`} role="listbox" aria-label={T('subtotalFunctions', 'Subtotal functions')}>
          {SUBTOTAL_ITEMS.map((item) => {
            const chosen = Array.isArray(data.customFunctions) ? (data.customFunctions as string[]) : [];
            const selected = chosen.includes(item.text);
            return <div key={item.text} role="option" aria-selected={selected} className={`gc-vfs-item${selected ? ' selected' : ''}`} onClick={() => {
              if (subtotals !== 'custom') return;
              const next = selected ? chosen.filter((name) => name !== item.text) : [...chosen, item.text];
              update('customFunctions', next);
            }}>{T(item.labelKey, item.text)}</div>;
          })}
        </div>
      </> : <>
        <div className="gc-pd-panel-head gc-fs-head">{T('layout', 'Layout')}</div>
        <label className="gc-fs-check gc-fs-check1"><input type="checkbox" checked={!!data.showNoData} onChange={(event) => update('showNoData', event.target.checked)} /></label>
        <div className="gc-fs-check-label gc-fs-check1" onClick={() => update('showNoData', !data.showNoData)}>{T('showItemsWithNoData', 'Show items with no data')}</div>
        <label className="gc-fs-check gc-fs-check2"><input type="checkbox" checked={subtotals === 'top'} onChange={() => update('subtotals', subtotals === 'top' ? 'automatic' : 'top')} /></label>
        <div className="gc-fs-check-label gc-fs-check2" onClick={() => update('subtotals', subtotals === 'top' ? 'automatic' : 'top')}>{T('displaySubtotalsAtTheTopOfEachGroup', 'Display subtotals at the top of each group')}</div>
      </>}
    </div>
    <input type="button" className="gc-pd-foot-btn gc-fs-label" value={T('labelFormat', 'Label Format')} onClick={() => setFormatOpen(true)} />
    <input type="button" className="gc-pd-foot-btn gc-pd-ok" value="OK" onClick={() => designer.closeDialog(String(designer.dialog?.name ?? 'pivotFieldSettingsDialogTemplate'), true)} />
    <input type="button" className="gc-pd-foot-btn gc-pd-cancel" value="Cancel" onClick={() => designer.closeDialog(String(designer.dialog?.name ?? 'pivotFieldSettingsDialogTemplate'), false)} />
    {formatOpen && <FormatCellsOverlay
      designer={designer}
      initial={format ? { category: 'Custom', formatCode: format } : { category: 'General' }}
      onOk={(formatter) => { update('format', formatter === 'General' ? '' : formatter); setFormatOpen(false); }}
      onCancel={() => setFormatOpen(false)}
    />}
  </div>;
}

/* -------------------------------------------------- PivotTable Options --- */

export function PivotTableOptionsBody({ data, update }: { data: DialogData; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const [tab, setTab] = useState('printing');
  const tabs = ['Printing', 'Layout & Format', 'Data', 'Totals & Filters', 'Display', 'Calculation'];
  return <div className="gc-value-field-dialog gc-pivot-options-dialog">
    <FieldRow label={T('pivotTableName', 'PivotTable Name:')}><input className="gc-dialog-input gc-value-field-custom" value={String(data.pivotName ?? '')} onChange={(event) => update('pivotName', event.target.value)} aria-label={T('pivotTableName2', 'PivotTable Name')} /></FieldRow>
    <div className="gc-dialog-tab-bar gc-pivot-dialog-tabs" role="tablist">
      {tabs.map((label) => (
        <button key={label} role="tab" aria-selected={tab === label.toLowerCase()} className={`gc-dialog-tab${tab === label.toLowerCase() ? ' gc-dialog-tab-active' : ''}`} onClick={() => setTab(label.toLowerCase())}>{label}</button>
      ))}
    </div>
    {tab === 'printing' && <div className="gc-pivot-options-body">
      <div className="gc-pivot-dialog-label">{T('print', 'Print')}</div>
      <label className="gc-dialog-checkbox"><input type="checkbox" checked={!!data.printExpandCollapse} onChange={(event) => update('printExpandCollapse', event.target.checked)} /><span>{T('printExpandCollapseButtonsWhenDisplayedOnPivotTable', 'Print expand/collapse buttons when displayed on PivotTable')}</span></label>
      <label className="gc-dialog-checkbox"><input type="checkbox" checked={!!data.repeatRowLabels} onChange={(event) => update('repeatRowLabels', event.target.checked)} /><span>{T('repeatRowLabelsOnEachPrintedPage', 'Repeat row labels on each printed page')}</span></label>
      <label className="gc-dialog-checkbox"><input type="checkbox" checked={!!data.setPrintTitles} onChange={(event) => update('setPrintTitles', event.target.checked)} /><span>{T('setPrintTitles', 'Set print titles')}</span></label>
    </div>}
    {tab !== 'printing' && <div className="gc-pivot-options-body gc-pivot-options-empty"><span /></div>}
  </div>;
}

/* ----------------------------------------------------------- shared ------ */

function activePivotOf(designer: Designer): PivotTable | null {
  return designer.activePivot();
}

/* ============ TASK 77: Insert Calculated Field / Item, Solve Order, Report Filter Pages ============
 * Reproduced from the trial's dialogs measured on apps/designer-compare (`.probe/t77/run/
 * t77-pivot-dialogs.json`, `t77-calc-open.json`, probes 9-14): the Name/Formula rows with the
 * Add(Modify)/Delete buttons, the Fields list with Insert Field, the Items list with Insert Item,
 * the solve-order list with Move Up/Move Down/Delete/Close and the report-filter confirmation.
 * The trial applies the model change on the inner button (OK/Cancel only close — measured), so
 * these bodies call the pivot API directly through the helpers of `pivot-designer.ts`. */

/** A field name as the trial writes it into a formula (quoted when it contains a space). */
function formulaReference(name: string): string {
  return /\s/.test(name) ? `'${name}'` : name;
}

function CalcFieldList({ items, selected, onSelect, label }: { items: string[]; selected: number; onSelect: (index: number) => void; label: string }): React.ReactElement {
  return <div className="gc-calc-list" role="listbox" aria-label={label}>
    {items.map((name, index) => (
      <div key={`${name}-${index}`} role="option" aria-selected={index === selected} className={`gc-calc-list-item${index === selected ? ' selected' : ''}`} onClick={() => onSelect(index)}>{name}</div>
    ))}
  </div>;
}

export function CalculatedFieldBody({ designer, data, update }: { designer: Designer; data: DialogData; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const [name, setName] = useState(String(data.name ?? 'Field1'));
  const [formula, setFormula] = useState(String(data.formula ?? '= 0'));
  const [created, setCreated] = useState<string[]>(() => Array.isArray(data.calcFields) ? [...(data.calcFields as string[])] : []);
  const [selected, setSelected] = useState(0);
  const fields = [...(Array.isArray(data.sourceFields) ? (data.sourceFields as string[]) : []), ...created];
  const exists = created.includes(name) || created.includes(`Sum of ${name}`);
  const refresh = (): void => {
    const pivot = designer.activePivot();
    setCreated(pivot ? calcFieldEntries(pivot).map((field) => field.name) : []);
  };
  return <div className="gc-calc-dialog gc-calc-field-dialog">
    <FieldRow label={T('name2', 'Name:')}>
      <input className="gc-dialog-input gc-calc-name" value={name} onChange={(event) => setName(event.target.value)} aria-label={T('name', 'Name')} />
      <input type="button" className="gc-calc-btn gc-calc-add" value={exists ? 'Modify' : 'Add'} onClick={() => {
        if (exists) applyCalcFieldModify(designer, name, formula);
        else applyCalcFieldAdd(designer, name, formula);
        refresh();
      }} />
    </FieldRow>
    <FieldRow label={T('formula', 'Formula:')}>
      <input className="gc-dialog-input gc-calc-formula" value={formula} onChange={(event) => setFormula(event.target.value)} aria-label={T('formula2', 'Formula')} />
      <input type="button" className="gc-calc-btn gc-calc-delete" value={T('delete', 'Delete')} onClick={() => { applyCalcFieldDelete(designer, name); refresh(); }} />
    </FieldRow>
    <div className="gc-calc-label gc-calc-fields-label">{T('fields', 'Fields:')}</div>
    <CalcFieldList items={fields} selected={selected} onSelect={setSelected} label={T('fields2', 'Fields')} />
    <input type="button" className="gc-calc-btn gc-calc-insert-field" value={T('insertField', 'Insert Field')} onClick={() => {
      const field = fields[selected];
      if (!field) return;
      update('formula', formula ? `${formula} ${formulaReference(field)}` : `=${formulaReference(field)}`);
      setFormula(formula ? `${formula} ${formulaReference(field)}` : `=${formulaReference(field)}`);
    }} />
  </div>;
}

export function CalculatedItemBody({ designer, data, update }: { designer: Designer; data: DialogData; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const [name, setName] = useState(String(data.name ?? 'Formula1'));
  const [formula, setFormula] = useState(String(data.formula ?? '= 0'));
  const [fieldIndex, setFieldIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [added, setAdded] = useState<string[]>([]);
  const pivot = designer.activePivot();
  const sourceName = String(data.sourceName ?? '');
  const fields = Array.isArray(data.pivotFields) ? (data.pivotFields as string[]) : [];
  const items = [...(Array.isArray(data.items) ? (data.items as string[]) : []), ...added.filter((item) => !((Array.isArray(data.items) ? (data.items as string[]) : []).includes(item)))];
  const created = pivot ? pivot.getCalcItems(sourceName).map((item) => String(item.calcItemName)) : [];
  const exists = created.includes(name);
  const refresh = (): void => setAdded(pivot ? pivotItemNames(pivot, sourceName) : []);
  return <div className="gc-calc-dialog gc-calc-item-dialog">
    <FieldRow label={T('name2', 'Name:')}>
      <input className="gc-dialog-input gc-calc-name" value={name} onChange={(event) => setName(event.target.value)} aria-label={T('name', 'Name')} />
      <input type="button" className="gc-calc-btn gc-calc-add" value={exists ? 'Modify' : 'Add'} onClick={() => { applyCalcItemAdd(designer, sourceName, name, formula); refresh(); }} />
    </FieldRow>
    <FieldRow label={T('formula', 'Formula:')}>
      <input className="gc-dialog-input gc-calc-formula" value={formula} onChange={(event) => setFormula(event.target.value)} aria-label={T('formula2', 'Formula')} />
      <input type="button" className="gc-calc-btn gc-calc-delete" value={T('delete', 'Delete')} onClick={() => { applyCalcItemDelete(designer, sourceName, name); refresh(); }} />
    </FieldRow>
    <div className="gc-calc-columns">
      <div className="gc-calc-column">
        <div className="gc-calc-label gc-calc-fields-label">{T('fields', 'Fields:')}</div>
        <CalcFieldList items={fields} selected={fieldIndex} onSelect={(index) => { setFieldIndex(index); setItemIndex(0); update('sourceName', fields[index] ?? ''); }} label={T('fields2', 'Fields')} />
        <input type="button" className="gc-calc-btn gc-calc-insert-field" value={T('insertField', 'Insert Field')} onClick={() => {
          const field = fields[fieldIndex];
          if (!field) return;
          const next = formula ? `${formula} ${formulaReference(field)}` : `=${formulaReference(field)}`;
          update('formula', next); setFormula(next);
        }} />
      </div>
      <div className="gc-calc-column">
        <div className="gc-calc-label gc-calc-items-label">{T('items', 'Items:')}</div>
        <CalcFieldList items={items} selected={itemIndex} onSelect={setItemIndex} label={T('items2', 'Items')} />
        <input type="button" className="gc-calc-btn gc-calc-insert-item" value={T('insertItem', 'Insert Item')} onClick={() => {
          const item = items[itemIndex];
          if (!item) return;
          const label = `${sourceName}[${item}]`;
          const next = formula ? `${formula} ${formulaReference(label)}` : `=${formulaReference(label)}`;
          update('formula', next); setFormula(next);
        }} />
      </div>
    </div>
  </div>;
}

export function SolveOrderBody({ designer, data, update: _update }: { designer: Designer; data: DialogData; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const [selected, setSelected] = useState(0);
  const [, bumped] = useState(0);
  const pivot = designer.activePivot();
  const entries = pivot ? solveOrderEntries(pivot) : (Array.isArray(data.entries) ? (data.entries as { sourceName: string; calcItemName: string; formula: string }[]) : []);
  const name = designer.dialog?.name ?? 'calculatedItemSolveOrderDialogTemplate';
  const clamp = (): number => Math.min(selected, Math.max(0, entries.length - 1));
  const move = (direction: 'up' | 'down'): void => {
    const index = clamp();
    const entry = entries[index];
    if (!entry) return;
    moveCalcItem(designer, entry, direction);
    setSelected(direction === 'up' ? index - 1 : index + 1);
    bumped((value) => value + 1);
  };
  return <div className="gc-calc-dialog gc-solve-order-dialog">
    <div className="gc-calc-label gc-solve-head">{T('solveOrder', 'Solve order:')}</div>
    <div className="gc-calc-list gc-solve-list" role="listbox" aria-label={T('solveOrder2', 'Solve order')}>
      {entries.map((entry, index) => (
        <div key={`${entry.sourceName}-${entry.calcItemName}`} role="option" aria-selected={index === clamp()} className={`gc-calc-list-item${index === clamp() ? ' selected' : ''}`} onClick={() => setSelected(index)}>{`${entry.sourceName}[${entry.calcItemName}] = ${entry.formula}`}</div>
      ))}
    </div>
    <div className="gc-solve-note">if the value in a PivotTable cell is affected by two or more calculated items, the value is determined by the last formula in the solve order.</div>
    <div className="gc-solve-buttons">
      <input type="button" className="gc-calc-btn gc-solve-up" value={T('moveUp', 'Move Up')} onClick={() => move('up')} />
      <input type="button" className="gc-calc-btn gc-solve-down" value={T('moveDown', 'Move Down')} onClick={() => move('down')} />
      <input type="button" className="gc-calc-btn gc-solve-delete" value={T('delete', 'Delete')} onClick={() => {
        const entry = entries[clamp()];
        if (!entry) return;
        applyCalcItemDelete(designer, entry.sourceName, entry.calcItemName);
        setSelected(0);
        bumped((value) => value + 1);
      }} />
      <input type="button" className="gc-calc-btn gc-solve-close" value="Close" onClick={() => designer.closeDialog(name, false)} />
    </div>
  </div>;
}

export function ReportFilterPagesBody({ data }: { data: DialogData }): React.ReactElement {
  const fields = Array.isArray(data.filterFields) ? (data.filterFields as string[]) : [];
  return <div className="gc-calc-dialog gc-report-filter-dialog">
    <div className="gc-calc-label gc-report-filter-label">{T('showAllReportFilterPagesOf', 'Show all report filter pages of:')}</div>
    <div className="gc-report-filter-list">
      {fields.map((name) => <span key={name} className="gc-report-filter-field">{name}</span>)}
    </div>
  </div>;
}
