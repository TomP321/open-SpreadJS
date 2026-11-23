/* Custom bodies for the Data tab dialogs (Sort, Remove Duplicates, Text to
 * Columns wizard, Subtotal, Data Validation highlight). The visual structure
 * follows the trial's runtime DOM observed as black box; all artwork is our
 * own inline SVG. */
import React, { useMemo, useState } from 'react';
import type { DesignerApi as Designer, DialogData } from '../designer-api.js';
import type { Worksheet } from '../core-internals.js';
import {
  columnLabels, currentRegion, lineLooksLikeHeader, splitRows,
  type Bounds, type SortLevel, type TextColumnFormat, type TextToColumnsData,
} from '../data-engine.js';
import { CustomCheckbox, CustomSelect } from './custom-widgets.js';
import { T } from './t.js';

export interface BodyProps {
  designer: Designer;
  data: DialogData;
  update: (path: string | undefined, value: unknown) => void;
}

/* ------------------------------------------------------------- artwork -- */

const svg = (path: React.ReactNode, size = 14): React.ReactElement =>
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">{path}</svg>;

const addIcon = svg(<path d="M8 2.5v11M2.5 8h11" fill="none" stroke="currentColor" strokeWidth="1.8" />, 13);
const removeIcon = svg(<path d="M3.5 3.5l9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="1.8" />, 13);
const copyIcon = svg(<><rect x="5.5" y="2.5" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M10.5 13.5h-8v-8" fill="none" stroke="currentColor" strokeWidth="1.4" /></>);
const upIcon = svg(<path d="M8 3l5 6H3z" fill="currentColor" />, 14);
const downIcon = svg(<path d="M8 13L3 7h10z" fill="currentColor" />, 14);
const selectAllIcon = svg(<><rect x="2" y="2" width="5" height="5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M9.5 5l2 2 4-4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="2" y="9" width="5" height="5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M9.5 12l2 2 4-4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></>);
const unselectAllIcon = svg(<><rect x="2" y="2" width="5" height="5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M9.5 3.5l5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.3" /><rect x="2" y="9" width="5" height="5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M9.5 10.5l5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.3" /></>);

/* helpers shared by bodies */

function boundsFromSelection(designer: Designer): Bounds {
  const sheet = designer.getWorkbook().getActiveSheet();
  const range = sheet.getSelections()[0] ?? { row: sheet.getActiveRowIndex(), col: sheet.getActiveColumnIndex(), rowCount: 1, colCount: 1 };
  return { row: Math.max(0, range.row), col: Math.max(0, range.col), rowCount: range.rowCount < 0 ? sheet.getRowCount() - range.row : Math.max(1, range.rowCount), colCount: range.colCount < 0 ? sheet.getColumnCount() - range.col : Math.max(1, range.colCount) };
}

/** The trial expands a lone cell to its current region; larger selections stay as they are. */
export function effectiveDataRange(sheet: Worksheet, selection: Bounds): Bounds {
  return selection.rowCount === 1 && selection.colCount === 1 ? currentRegion(sheet, selection) : selection;
}

function Combo({ value, options, onChange, className, ariaLabel }: {
  value: unknown; options: { text: string; value: unknown }[]; onChange: (value: unknown) => void; className?: string; ariaLabel?: string;
}): React.ReactElement {
  return <CustomSelect className={`gc-dialog-select${className ? ` ${className}` : ''}`} ariaLabel={ariaLabel} value={value} options={options} onChange={onChange} />;
}

/* ------------------------------------------------------------- sort ---- */

export function SortDialogBody({ designer, data, update }: BodyProps): React.ReactElement {
  const sheet = designer.getWorkbook().getActiveSheet();
  const region = data.region as Bounds;
  const hasHeaders = data.hasHeaders !== false;
  const levels = (data.levels ?? []) as SortLevel[];
  const selected = Number(data.selected ?? 0);
  const labels = useMemo(() => columnLabels(sheet, region, hasHeaders), [sheet, region, hasHeaders]);
  const columnIndex = (level: SortLevel): number => level.column;
  const setLevel = (index: number, patch: Partial<SortLevel>): void => {
    const next = levels.map((level, position) => (position === index ? { ...level, ...patch } : level));
    update('levels', next);
  };
  const colorOptions = (level: SortLevel): { text: string; value: unknown }[] => {
    const skip = hasHeaders ? 1 : 0;
    const colors = new Map<string, string>();
    for (let r = region.row + skip; r < region.row + region.rowCount; r++) {
      const style = sheet.getActualStyle?.(r, region.col + columnIndex(level));
      const value = level.sortOn === 'Font Color' ? style?.foreColor : style?.backColor;
      if (typeof value === 'string' && value && value !== 'transparent') colors.set(value.toLowerCase(), value);
    }
    return [{ text: level.sortOn === 'Font Color' ? 'No Font Color' : 'No Cell Color', value: '' }, ...[...colors.values()].map((color) => ({ text: color, value: color }))];
  };
  const columnOptions = [{ text: '', value: -1 }, ...labels.map((label, index) => ({ text: label, value: index }))];
  const addLevel = (): void => {
    update('levels', [...levels, { column: -1, sortOn: 'Values', order: 'A to Z', color: '' }]);
    update('selected', levels.length);
  };
  const deleteLevel = (): void => {
    const next = levels.filter((_, index) => index !== selected);
    update('levels', next);
    update('selected', Math.max(0, selected - (selected >= next.length ? 1 : 0)));
  };
  const copyLevel = (): void => {
    const source = levels[selected];
    if (!source) return;
    update('levels', [...levels.slice(0, selected + 1), { ...source }, ...levels.slice(selected + 1)]);
    update('selected', selected + 1);
  };
  const move = (delta: number): void => {
    const target = selected + delta;
    if (!levels[selected] || !levels[target]) return;
    const next = [...levels];
    [next[selected], next[target]] = [next[target]!, next[selected]!];
    update('levels', next);
    update('selected', target);
  };
  return (
    <div className="gc-custom-sort-dialog" data-testid="custom-sort-dialog">
      <div className="gc-custom-sort-toolbar gc-column-set">
        <div className="gc-image-button" role="button" onClick={addLevel}>{addIcon}<span>{T('addLevel', 'Add Level')}</span></div>
        <div className={`gc-image-button${levels.length ? '' : ' disable'}`} role="button" onClick={deleteLevel}>{removeIcon}<span>{T('deleteLevel', 'Delete Level')}</span></div>
        <div className={`gc-image-button${levels.length ? '' : ' disable'}`} role="button" onClick={copyLevel}>{copyIcon}<span>{T('copyLevel', 'Copy Level')}</span></div>
        <div className={`gc-image-button icon-only${selected > 0 ? '' : ' disable'}`} role="button" onClick={() => move(-1)}>{upIcon}</div>
        <div className={`gc-image-button icon-only${selected >= 0 && selected < levels.length - 1 ? '' : ' disable'}`} role="button" onClick={() => move(1)}>{downIcon}</div>
        <div className="gc-image-button" role="button" onClick={() => update('optionsOpen', true)}>{T('options', 'Options...')}</div>
        <span className="gc-custom-sort-header-spacer" />
        <CustomCheckbox label={T('myDataHasHeaders', 'My data has headers')} checked={hasHeaders} onChange={(value) => update('hasHeaders', value)} />
      </div>
      <div className="gc-custom-sort-list">
        <div className="gc-custom-sort-row gc-custom-sort-head"><span>{T('sortBy', 'SortBy')}</span><span>{T('sortOn', 'SortOn')}</span><span>{T('sortOrder', 'SortOrder')}</span></div>
        {levels.map((level, index) => (
          <div key={index} className={`gc-custom-sort-row${index === selected ? ' selected' : ''}`} onClick={() => update('selected', index)}>
            <span className="gc-custom-sort-by">
              <span className="gc-custom-sort-label">{index === 0 ? T('sortByLabel', 'Sort by') : T('thenBy', 'Then by')}</span>
              <CustomSelect className="gc-sort-column" ariaLabel="SortBy" value={level.column} options={columnOptions} onChange={(value) => setLevel(index, { column: Number(value) })} />
            </span>
            <CustomSelect className="gc-sort-on" ariaLabel="SortOn" value={level.sortOn} options={['Values', 'Cell Color', 'Font Color'].map((text) => ({ text, value: text }))}
              onChange={(sortOn) => setLevel(index, { sortOn: sortOn as SortLevel['sortOn'], order: sortOn === 'Values' ? 'A to Z' : 'On Top', color: '' })} />
            {level.sortOn === 'Values'
              ? <CustomSelect className="gc-sort-order" ariaLabel="SortOrder" value={level.order} options={['A to Z', 'Z to A'].map((text) => ({ text, value: text }))} onChange={(order) => setLevel(index, { order: String(order) })} />
              : <span className="gc-sort-color-order">
                <CustomSelect className="gc-sort-color" ariaLabel="Color" value={level.color} options={colorOptions(level)} onChange={(color) => setLevel(index, { color: String(color) })} />
                <CustomSelect className="gc-sort-order" ariaLabel="SortOrder" value={level.order} options={['On Top', 'On Bottom'].map((text) => ({ text, value: text }))} onChange={(order) => setLevel(index, { order: String(order) })} />
              </span>}
          </div>
        ))}
      </div>
      {data.optionsOpen === true && (
        <div className="gc-sort-options-overlay" role="dialog" aria-label={T('sortOptions', 'Sort Options')}>
          <div className="gc-sort-options-dialog">
            <div className="gc-dialog-header"><div className="gc-dialog-title">{T('sortOptions', 'Sort Options')}</div>
              <button className="gc-dialog-close" aria-label="Close" onClick={() => update('optionsOpen', false)}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" /></svg></button></div>
            <fieldset className="gc-dialog-groupbox"><legend>{T('orientation', 'Orientation')}</legend>
              <label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-sort-orientation" checked={data.byRows !== false} onChange={() => update('byRows', true)} /><span>{T('sortTopToBottom', 'Sort top to bottom')}</span></label>
              <label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-sort-orientation" checked={data.byRows === false} onChange={() => update('byRows', false)} /><span>{T('sortLeftToRight', 'Sort left to right')}</span></label>
            </fieldset>
            <div className="gc-dialog-footer">
              <button className="gc-dialog-button gc-dialog-button-primary" onClick={() => update('optionsOpen', false)}>OK</button>
              <button className="gc-dialog-button" onClick={() => update('optionsOpen', false)}>{T('cancel', 'Cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function sortDataFromSelection(designer: Designer, previous?: { levels?: SortLevel[]; hasHeaders?: boolean; byRows?: boolean } | null): DialogData {
  const selection = boundsFromSelection(designer);
  const sheet = designer.getWorkbook().getActiveSheet();
  const region = effectiveDataRange(sheet, selection);
  const hasHeaders = region.rowCount > 1 && lineLooksLikeHeader(sheet, region.row, region.col, region.colCount);
  // The trial preselects the active cell's column ("Q1" with B2 active).
  const activeColumn = Math.min(Math.max(0, Math.max(0, sheet.getActiveColumnIndex()) - region.col), Math.max(0, region.colCount - 1));
  const levels: SortLevel[] = previous?.levels?.length ? previous.levels.map((level) => ({ ...level, column: level.column < region.colCount ? level.column : -1 }))
    : [{ column: activeColumn, sortOn: 'Values', order: 'A to Z', color: '' }];
  return { kind: 'sort', region, hasHeaders, byRows: previous?.byRows !== false, levels, selected: 0, optionsOpen: false };
}

/* ------------------------------------------------- remove duplicates -- */

export function RemoveDuplicatesBody({ designer, data, update }: BodyProps): React.ReactElement {
  const sheet = designer.getWorkbook().getActiveSheet();
  const region = data.region as Bounds;
  const hasHeaders = data.hasHeaders === true;
  const labels = useMemo(() => columnLabels(sheet, region, hasHeaders), [sheet, region, hasHeaders]);
  const checked = data.checked as boolean[];
  const setAll = (value: boolean): void => update('checked', labels.map(() => value));
  const toggle = (index: number): void => update('checked', checked.map((value, position) => (position === index ? !value : value)));
  return (
    <div className="gc-remove-duplicates" data-testid="remove-duplicates-dialog">
      <div className="gc-dialog-text gc-rd-note">{T('toDeleteDuplicateValuesSelectOneOrMoreColumnsThatContainDuplicates', 'To delete duplicate values, select one or more columns that contain duplicates.')}</div>
      <div className="gc-column-set gc-rd-buttons">
        <div className="gc-image-button" role="button" onClick={() => setAll(true)}>{selectAllIcon}<span>{T('selectAll', 'Select All')}</span></div>
        <div className="gc-image-button" role="button" onClick={() => setAll(false)}>{unselectAllIcon}<span>{T('unselectAll', 'Unselect All')}</span></div>
        <span className="gc-rd-header-spacer" />
        <label className="gc-dialog-checkbox"><input type="checkbox" checked={hasHeaders} onChange={(event) => update('hasHeaders', event.target.checked)} /><span>{T('myDataHasHeaders', 'My data has headers')}</span></label>
      </div>
      <div className="gc-dialog-text">{T('columns', 'Columns')}</div>
      <div className="gc-rd-list">
        {labels.map((label, index) => (
          <label key={index} className="gc-dialog-checkbox gc-rd-item"><input type="checkbox" checked={!!checked[index]} onChange={() => toggle(index)} /><span>{label}</span></label>
        ))}
      </div>
    </div>
  );
}

export function duplicateDataFromSelection(designer: Designer): DialogData {
  const sheet = designer.getWorkbook().getActiveSheet();
  const region = effectiveDataRange(sheet, boundsFromSelection(designer));
  return { kind: 'dups', region, hasHeaders: false, checked: Array.from({ length: region.colCount }, () => true) };
}

/* TASK 84 R1: the "bare execute de-duplicates immediately" helper from TASK 75 is gone —
 * a live re-probe of the trial showed every `removeDuplicates` execute opens the dialog. */

/* ---------------------------------------------------- text to columns -- */

const DATE_TYPES = ['MDY', 'DMY', 'YMD', 'MY', 'YM', 'MD', 'D', 'M', 'Y'];

export function TextToColumnsWizard({ designer, data, update }: BodyProps): React.ReactElement {
  const wizard = data as TextToColumnsData & { step: number; selectedColumn: number; advancedOpen?: boolean };
  const step = Number(data.step ?? 1);
  const texts = useMemo(() => readColumnTexts(designer, wizard.region), [data]);
  const fields = useMemo(() => {
    const split = splitRows(wizard, texts);
    const width = split.reduce((max, row) => Math.max(max, row.length), 1);
    return split.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''));
  }, [data, texts]);
  const formats = (wizard.formats ?? [{ format: 'General', dateType: 'MDY' }]) as TextColumnFormat[];
  const setFormat = (patch: Partial<TextColumnFormat>): void => {
    const next = formats.map((format, index) => (index === wizard.selectedColumn ? { ...format, ...patch } : format));
    update('formats', next);
  };
  const canFinish = step === 3;
  const goTo = (target: number): void => {
    update('step', target);
    update('dialogTitle', T('textToColumnsWizardStep', 'Convert Text to Columns Wizard - Step {0} of 3').replace('{0}', String(target)));
  };
  const back = (): void => goTo(Math.max(1, step - 1));
  const next = (): void => goTo(Math.min(3, step + 1));
  return (
    <div className="gc-text-to-columns" data-testid="text-to-columns-wizard" data-step={step}>
      <div className="gc-dialog-text gc-t2c-intro">{step === 1
        ? <>{T('theTextWizardHasDeterminedThatYourDataIs', 'The Text Wizard has determined that your data is')} {String(data.mode) === 'Delimited' ? T('delimited', 'Delimited') : T('fixedWidth', 'Fixed width')}.<br />{T('ifThisIsCorrectChooseNextOrChooseTheDataTypeThatBestDescribesYourData', 'If this is correct, choose Next, or choose the data type that best describes your data.')}</>
        : step === 2
          ? <>{T('thisScreenLetsYouSet', 'This screen lets you set')} {String(data.mode) === 'Delimited' ? T('theDelimitersYourDataContains', 'the delimiters your data contains') : T('fieldWidthsColumnBreaks', 'field widths (column breaks)')}.<br />{String(data.mode) === 'Delimited' ? T('youCanSeeHowYourTextIsAffectedInThePreviewBelow', 'You can see how your text is affected in the preview below.') : <>{T('linesSignifyAColumnBreak', 'Lines signify a column break.')}<br />{T('toCREATEABreakLineClickAtTheDesiredPosition', 'To CREATE a break line, click at the desired position.')}<br />{T('toDELETEABreakLineDoubleClickOnTheLine', 'To DELETE a break line, double click on the line.')}<br />{T('toMOVEABreakLineClickAndDragIt', 'To MOVE a break line, click and drag it.')}</>}</>
          : <>{T('thisScreenLetsYouSelectEachColumnAndSetTheDataFormat', 'This screen lets you select each column and set the Data Format.')}</>}</div>
      {step === 1 && <>
        <fieldset className="gc-dialog-groupbox gc-t2c-type"><legend>{T('originalDataType', 'Original data type')}</legend>
          <div className="gc-t2c-radio-row"><label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-t2c-mode" checked={data.mode === 'Delimited'} onChange={() => update('mode', 'Delimited')} /><span>{T('delimited', 'Delimited')}</span></label><span className="gc-t2c-hint">{T('charactersSuchAsCommasOrTabsSeparateEachField', '-Characters such as commas or tabs separate each field.')}</span></div>
          <div className="gc-t2c-radio-row"><label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-t2c-mode" checked={data.mode === 'Fixed width'} onChange={() => update('mode', 'Fixed width')} /><span>{T('fixedWidth', 'Fixed width')}</span></label><span className="gc-t2c-hint">{T('fieldsAreAlignedInColumnsWithSpacesBetweenEachField', '-Fields are aligned in columns with spaces between each field.')}</span></div>
        </fieldset>
        <div className="gc-dialog-text">{T('previewOfSelectedData', 'Preview of selected data:')}</div>
        <div className="gc-t2c-preview gc-t2c-step1-preview">
          {texts.slice(0, 30).map((text, index) => <div key={index} className="gc-t2c-line"><span className="gc-t2c-line-number">{index + 1}</span><span className="gc-t2c-line-text">{text}</span></div>)}
        </div>
      </>}
      {step === 2 && String(data.mode) === 'Delimited' && <>
        <div className="gc-t2c-columns">
          <fieldset className="gc-dialog-groupbox gc-t2c-delimiters"><legend>{T('delimiters', 'Delimiters')}</legend>
            <label className="gc-dialog-checkbox"><input type="checkbox" checked={!!wizard.delimiters.tab} onChange={(event) => update('delimiters', { ...wizard.delimiters, tab: event.target.checked })} /><span>{T('tab', 'Tab')}</span></label>
            <label className="gc-dialog-checkbox"><input type="checkbox" checked={!!wizard.delimiters.semicolon} onChange={(event) => update('delimiters', { ...wizard.delimiters, semicolon: event.target.checked })} /><span>{T('semicolon', 'Semicolon')}</span></label>
            <label className="gc-dialog-checkbox"><input type="checkbox" checked={!!wizard.delimiters.comma} onChange={(event) => update('delimiters', { ...wizard.delimiters, comma: event.target.checked })} /><span>{T('comma', 'Comma')}</span></label>
            <label className="gc-dialog-checkbox"><input type="checkbox" checked={!!wizard.delimiters.space} onChange={(event) => update('delimiters', { ...wizard.delimiters, space: event.target.checked })} /><span>{T('space', 'Space')}</span></label>
            <label className="gc-dialog-checkbox"><input type="checkbox" checked={!!wizard.delimiters.other} onChange={(event) => update('delimiters', { ...wizard.delimiters, other: event.target.checked ? ' ' : '' })} /><span>{T('other', 'Other')}</span></label>
            <input className="gc-dialog-input gc-t2c-other" type="text" maxLength={1} value={String(wizard.delimiters.other ?? '')} onChange={(event) => update('delimiters', { ...wizard.delimiters, other: event.target.value })} />
          </fieldset>
          <div className="gc-t2c-qualifier">
            <label className="gc-dialog-checkbox"><input type="checkbox" checked={!!wizard.consecutive} onChange={(event) => update('consecutive', event.target.checked)} /><span>{T('treatConsecutiveDelimitersAsOne', 'Treat consecutive delimiters as one')}</span></label>
            <div className="gc-t2c-qualifier-row"><span>{T('textQualifier', 'Text qualifier:')}</span>
              <Combo className="gc-t2c-qualifier-combo" ariaLabel="Text qualifier:" value={wizard.qualifier} options={[{ text: '"', value: '"' }, { text: "'", value: "'" }, { text: T('none2', '(none)'), value: '' }]} onChange={(value) => update('qualifier', String(value))} /></div>
          </div>
        </div>
        <fieldset className="gc-dialog-groupbox gc-t2c-preview-group"><legend>{T('dataPreview', 'Data preview')}</legend>
          <PreviewGrid fields={fields.slice(0, 10)} breaks={undefined} onBreakClick={undefined} /></fieldset>
      </>}
      {step === 2 && String(data.mode) === 'Fixed width' && <>
        <fieldset className="gc-dialog-groupbox gc-t2c-preview-group"><legend>{T('dataPreview', 'Data preview')}</legend>
          <PreviewGrid fields={null} lines={texts.slice(0, 10)} breaks={wizard.breaks ?? []} onBreakClick={(position, remove, replace) => {
            if (replace) { update('breaks', replace); return; }
            const current = [...(wizard.breaks ?? [])];
            if (remove) { update('breaks', current.filter((value) => value !== position)); return; }
            if (!current.includes(position)) current.push(position);
            update('breaks', current.sort((a, b) => a - b));
          }} /></fieldset>
      </>}
      {step === 3 && <>
        <fieldset className="gc-dialog-groupbox gc-t2c-format"><legend>{T('columnDataFormat', 'Column data format')}</legend>
          <label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-t2c-format" checked={(formats[wizard.selectedColumn] ?? formats[0])?.format === 'General'} onChange={() => setFormat({ format: 'General' })} /><span>{T('general', 'General')}</span></label>
          <label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-t2c-format" checked={formats[wizard.selectedColumn]?.format === 'Text'} onChange={() => setFormat({ format: 'Text' })} /><span>{T('text', 'Text')}</span></label>
          <span className="gc-t2c-date-row"><label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-t2c-format" checked={formats[wizard.selectedColumn]?.format === 'Date'} onChange={() => setFormat({ format: 'Date' })} /><span>{T('date', 'Date:')}</span></label>
          <Combo className="gc-t2c-date-type" ariaLabel="Date type" value={formats[wizard.selectedColumn]?.dateType ?? 'MDY'} options={DATE_TYPES.map((text) => ({ text, value: text }))} onChange={(value) => setFormat({ dateType: String(value) })} /></span>
          <label className="gc-dialog-radio gc-radio"><input type="radio" name="gc-t2c-format" checked={formats[wizard.selectedColumn]?.format === 'Skip'} onChange={() => setFormat({ format: 'Skip' })} /><span>{T('doNotImportColumnSkip', 'Do not import column (skip)')}</span></label>
          <div className="gc-t2c-format-help">&apos;General&apos; converts numeric values to numbers, date values to dates, and all remaining values to text</div>
          <button className="gc-dialog-secondary gc-t2c-advanced" onClick={() => update('advancedOpen', !data.advancedOpen)}>{T('advanced', 'Advanced...')}</button>
        </fieldset>
        {data.advancedOpen === true && <div className="gc-t2c-advanced-panel">
          <label className="gc-dialog-checkbox gc-t2c-advanced-field"><span>{T('thousandsSeparator', 'Thousands separator:')}</span><input className="gc-dialog-input" type="text" maxLength={1} value={String(formats[wizard.selectedColumn]?.thousandsSeparator ?? '')} onChange={(event) => setFormat({ thousandsSeparator: event.target.value })} /></label>
          <label className="gc-dialog-checkbox gc-t2c-advanced-field"><span>{T('decimalSymbol', 'Decimal symbol:')}</span><input className="gc-dialog-input" type="text" maxLength={1} value={String(formats[wizard.selectedColumn]?.decimalSeparator ?? '')} onChange={(event) => setFormat({ decimalSeparator: event.target.value })} /></label>
        </div>}
        <div className="gc-t2c-destination-row"><span>{T('destination', 'Destination')}</span><input className="gc-dialog-input gc-t2c-destination" value={String(wizard.destination)} onChange={(event) => update('destination', event.target.value)} /><span className="gc-t2c-destination-glyph" role="button" onClick={() => update('destination', selectionAddress(designer))} /></div>
        <fieldset className="gc-dialog-groupbox gc-t2c-preview-group"><legend>{T('dataPreview', 'Data preview')}</legend>
          <PreviewGrid fields={fields.slice(0, 10)} formats={formats} selectedColumn={wizard.selectedColumn} onColumnClick={(index) => update('selectedColumn', index)} /></fieldset>
      </>}
      <div className="gc-dialog-footer gc-t2c-footer">
        <button className="gc-dialog-button" onClick={() => designer.closeDialog(designer.dialog!.name, false)}>{T('cancel', 'Cancel')}</button>
        <button className={`gc-dialog-button${step === 1 ? ' disable' : ''}`} disabled={step === 1} onClick={back}>{T('backWizard', '< Back')}</button>
        <button className={`gc-dialog-button${step === 3 ? ' disable' : ' gc-dialog-button-primary'}`} disabled={step === 3} onClick={next}>{T('nextGt', 'Next >')}</button>
        <button className={`gc-dialog-button${step === 3 ? ' gc-dialog-button-primary' : ' disable'}`} disabled={!canFinish} onClick={() => designer.closeDialog(designer.dialog!.name, true)}>{T('finish', 'Finish')}</button>
      </div>
    </div>
  );
}

function readColumnTexts(designer: Designer, region: Bounds): string[] {
  const sheet = designer.getWorkbook().getActiveSheet();
  const texts: string[] = [];
  for (let r = 0; r < region.rowCount; r++) {
    const value = sheet.getText ? sheet.getText(region.row + r, region.col) : sheet.getValue(region.row + r, region.col);
    texts.push(String(value ?? ''));
  }
  return texts;
}

function selectionAddress(designer: Designer): string {
  const sheet = designer.getWorkbook().getActiveSheet();
  const range = sheet.getSelections()[0];
  return `=${String.fromCharCode(65 + (range?.col ?? 0))}${(range?.row ?? 0) + 1}`;
}

function PreviewGrid({ fields, lines, breaks, formats, selectedColumn, onColumnClick, onBreakClick }: {
  fields: string[][] | null; lines?: string[]; breaks?: number[]; formats?: TextColumnFormat[];
  selectedColumn?: number; onColumnClick?: (index: number) => void;
  onBreakClick?: (position: number, remove: boolean, replace?: number[]) => void;
}): React.ReactElement {
  const [drag, setDrag] = useState<number | null>(null);
  if (lines && breaks) {
    // Fixed-width ruler: click adds a break, double-click removes, drag moves.
    const charWidth = 7.2;
    const maxChars = Math.max(24, ...lines.map((line) => line.length));
    const positionAt = (clientX: number, host: DOMRect): number =>
      Math.max(1, Math.round((clientX - host.left - 8) / charWidth));
    const moveBreak = (from: number, to: number): void => {
      const unique = [...new Set(breaks.map((value) => (value === from ? to : value)).filter((value) => value > 0))].sort((a, b) => a - b);
      setDrag(to);
      onBreakClick?.(-1, false, unique);
    };
    return (
      <div className="gc-t2c-fixed" data-testid="fixed-width-preview"
        onMouseDown={(event) => {
          const host = event.currentTarget.getBoundingClientRect();
          const position = positionAt(event.clientX, host);
          if (breaks.includes(position)) setDrag(position);
          else onBreakClick?.(position, false);
        }}
        onMouseMove={(event) => {
          if (drag === null) return;
          moveBreak(drag, positionAt(event.clientX, event.currentTarget.getBoundingClientRect()));
        }}
        onMouseUp={() => setDrag(null)}>
        <div className="gc-t2c-ruler">{Array.from({ length: Math.ceil(maxChars / 2) }, (_, tick) => <span key={tick} className="gc-t2c-tick" style={{ left: 8 + tick * 2 * charWidth }} />)}</div>
        <div className="gc-t2c-breaks">{breaks.map((position) => (
          <span key={position} className="gc-t2c-break" style={{ left: 8 + position * charWidth }} onDoubleClick={(event) => { event.stopPropagation(); onBreakClick?.(position, true); }} />))}</div>
        {lines.map((line, index) => <pre key={index} className="gc-t2c-fixed-line">{line}</pre>)}
      </div>
    );
  }
  const grid = fields ?? [];
  const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
  return (
    <div className="gc-t2c-grid">
      {formats && <div className="gc-t2c-grid-row gc-t2c-grid-head">{Array.from({ length: width }, (_, index) => (
        <span key={index} className={`gc-t2c-grid-cell${selectedColumn === index ? ' selected' : ''}`} onMouseDown={() => onColumnClick?.(index)}>{formatName(formats[index] ?? { format: 'General', dateType: 'MDY' })}</span>))}</div>}
      {grid.map((row, index) => <div key={index} className="gc-t2c-grid-row">{Array.from({ length: width }, (_, column) => <span key={column} className="gc-t2c-grid-cell">{row[column] ?? ''}</span>)}</div>)}
    </div>
  );
}

function formatName(format: TextColumnFormat): string {
  if (format.format === 'Skip') return 'Do Not Import';
  return format.format;
}

export function textToColumnsDataFromSelection(designer: Designer): DialogData {
  const sheet = designer.getWorkbook().getActiveSheet();
  const selection = boundsFromSelection(designer);
  const first = String(sheet.getText ? sheet.getText(selection.row, selection.col) : sheet.getValue(selection.row, selection.col) ?? '');
  const delimited = /[,;\t ]/.test(first);
  const startAddress = `${String.fromCharCode(65 + selection.col)}${selection.row + 1}`;
  const endAddress = `${String.fromCharCode(65 + selection.col + selection.colCount - 1)}${selection.row + selection.rowCount - 1}`;
  return {
    kind: 't2c', step: 1, mode: delimited ? 'Delimited' : 'Fixed width', region: selection,
    dialogTitle: T('textToColumnsWizardStep', 'Convert Text to Columns Wizard - Step {0} of 3').replace('{0}', '1'),
    delimiters: { tab: true, semicolon: false, comma: false, space: false, other: '' },
    consecutive: false, qualifier: '"', breaks: [] as number[],
    formats: [{ format: 'General', dateType: 'MDY' }] as TextColumnFormat[],
    selectedColumn: 0, destination: selection.rowCount === 1 && selection.colCount === 1 ? `=${startAddress}` : `=${startAddress}:${endAddress}`, advancedOpen: false,
  };
}

/* -------------------------------------------------------- subtotal ---- */

export function SubtotalDialogBody({ designer, data, update }: BodyProps): React.ReactElement {
  const sheet = designer.getWorkbook().getActiveSheet();
  const region = data.region as Bounds;
  const labels = useMemo(() => columnLabels(sheet, region, true), [sheet, region]);
  const groupColumn = Number(data.groupColumn ?? 0);
  const checked = data.checked as boolean[];
  return (
    <div className="gc-subtotal-dialog" data-testid="subtotal-dialog">
      <div className="gc-dialog-text gc-dialog-label">{T('atEachChangeIn', 'At each change in:')}</div>
      <Combo className="gc-subtotal-group" ariaLabel="At each change in:" value={groupColumn} options={labels.map((label, index) => ({ text: label, value: index }))}
        onChange={(value) => {
          const index = Number(value);
          update('groupColumn', index);
          update('checked', labels.map((_, position) => position !== index));
        }} />
      <div className="gc-dialog-text gc-dialog-label">{T('useFunction', 'Use function:')}</div>
      <Combo className="gc-subtotal-function" ariaLabel="Use function:" value={data.fn ?? 'Sum'} options={['Sum', 'Count', 'Average', 'Max', 'Min', 'Product'].map((text) => ({ text, value: text }))} onChange={(value) => update('fn', String(value))} />
      <div className="gc-dialog-text gc-dialog-label">{T('addSubtotalTo', 'Add subtotal to:')}</div>
      <div className="gc-subtotal-columns">
        {labels.map((label, index) => (
          <label key={index} className="gc-dialog-checkbox"><input type="checkbox" checked={!!checked[index]} onChange={(event) => update('checked', checked.map((value, position) => (position === index ? event.target.checked : value)))} /><span>{label}</span></label>
        ))}
      </div>
      <label className="gc-dialog-checkbox"><input type="checkbox" checked={data.replace !== false} onChange={(event) => update('replace', event.target.checked)} /><span>{T('replaceCurrentSubtotals', 'Replace current subtotals')}</span></label>
      <label className="gc-dialog-checkbox"><input type="checkbox" checked={!!data.pageBreak} onChange={(event) => update('pageBreak', event.target.checked)} /><span>{T('pageBreakBetweenGroups', 'Page break between groups')}</span></label>
      <label className="gc-dialog-checkbox"><input type="checkbox" checked={data.summaryBelow !== false} onChange={(event) => update('summaryBelow', event.target.checked)} /><span>{T('summaryBelowData', 'Summary below data')}</span></label>
    </div>
  );
}

export function subtotalDataFromSelection(designer: Designer): DialogData {
  const sheet = designer.getWorkbook().getActiveSheet();
  const region = effectiveDataRange(sheet, boundsFromSelection(designer));
  return {
    kind: 'subtotal', region, groupColumn: 0, fn: 'Sum', replace: true, pageBreak: false, summaryBelow: true,
    checked: Array.from({ length: region.colCount }, (_, index) => index !== 0),
  };
}

/* --------------------------------------------- validation highlight -- */

export const HIGHLIGHT_POSITIONS = ['Top Left', 'Top Right', 'Bottom Right', 'Bottom Left', 'Outside Left', 'Outside Right'];

export function ValidationHighlightBody({ designer, data, update }: BodyProps): React.ReactElement {
  const type = Number(data.highlightType ?? 0);
  const position = Number(data.highlightPosition ?? 4);
  return (
    <div className="gc-dv-highlight">
      <div className="gc-column-set gc-dv-row"><span className="gc-dialog-text">{T('style2', 'Style:')}</span>
        <Combo className="gc-dv-highlight-type" ariaLabel="Style:" value={type} options={[{ text: T('circle', 'Circle'), value: 0 }, { text: T('dogear', 'Dogear'), value: 1 }, { text: T('icon', 'Icon'), value: 2 }]} onChange={(value) => update('highlightType', Number(value))} /></div>
      <div className="gc-column-set gc-dv-row"><span className="gc-dialog-text">{T('color2', 'Color:')}</span>
        <span className="gc-dialog-color"><input type="color" aria-label={T('color', 'Color')} value={normalizeHex(String(data.highlightColor ?? 'red'))} onChange={(event) => update('highlightColor', event.target.value)} /></span></div>
      {type === 2 && <>
        <div className="gc-column-set gc-dv-row"><span className="gc-dialog-text">{T('position', 'Position:')}</span>
          <Combo className="gc-dv-highlight-position" ariaLabel="Position:" value={position} options={HIGHLIGHT_POSITIONS.map((text, value) => ({ text, value }))} onChange={(value) => update('highlightPosition', Number(value))} /></div>
        <div className="gc-column-set gc-dv-row"><span className="gc-dialog-text">{T('icon', 'Icon')}</span>
          <span className="gc-dv-icon-row"><button className="gc-dialog-secondary gc-dv-select-icon" onClick={() => update('iconPickerOpen', true)}>{T('selectIcon', 'Select Icon')}</button></span></div>
      </>}
      {data.iconPickerOpen === true && <IconPicker designer={designer} data={data} update={update} />}
    </div>
  );
}

/** Built-in invalid-data flags; every glyph is drawn by this file. */
export const DV_ICONS: { name: string; path: string }[] = [
  { name: 'cross', path: 'M2 2l20 20M22 2L2 22' },
  { name: 'check', path: 'M4 13l5 6L20 5' },
  { name: 'warning', path: 'M12 2l10 20H2zM12 10v5m0 3v1' },
  { name: 'info', path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5v1m0 3v6' },
  { name: 'stop', path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM6 12h12' },
  { name: 'arrow', path: 'M4 12h14m-5-6 6 6-6 6' },
  { name: 'dot', path: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { name: 'star', path: 'm12 3 2.6 5.6 6 .7-4.4 4.1 1.2 5.9L12 16.3 6.6 19.4l1.2-5.9L3.4 9.3l6-.7z' },
];

function IconPicker({ data, update }: BodyProps): React.ReactElement {
  const color = String(data.highlightColor ?? 'red');
  return (
    <div className="gc-dv-icon-overlay">
      <div className="gc-dv-icon-dialog">
        <div className="gc-dialog-header"><div className="gc-dialog-title">{T('selectIcon', 'Select Icon')}</div>
          <button className="gc-dialog-close" aria-label="Close" onClick={() => update('iconPickerOpen', false)}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" /></svg></button></div>
        <div className="gc-dv-icon-grid">
          <span className="gc-dv-icon-item" role="button" onClick={() => { update('highlightImage', ''); update('iconPickerOpen', false); }} title={T('default', 'Default')} />
          {DV_ICONS.map((icon) => (
            <span key={icon.name} role="button" className="gc-dv-icon-item" title={icon.name} onClick={() => { update('highlightImage', iconDataUrl(icon.path, color)); update('iconPickerOpen', false); }}>
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d={icon.path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          ))}
        </div>
        <div className="gc-dialog-footer"><button className="gc-dialog-button" onClick={() => update('iconPickerOpen', false)}>{T('cancel', 'Cancel')}</button></div>
      </div>
    </div>
  );
}

export function iconDataUrl(path: string, color: string): string {
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="${path}" fill="none" stroke="${encodeURIComponent(color)}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;utf8,${svgText.replace(/#/g, '%23')}`;
}

function normalizeHex(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const named: Record<string, string> = { red: '#ff0000', blue: '#0000ff', green: '#008000', yellow: '#ffff00', black: '#000000', white: '#ffffff' };
  return named[value.toLowerCase()] ?? '#ff0000';
}
