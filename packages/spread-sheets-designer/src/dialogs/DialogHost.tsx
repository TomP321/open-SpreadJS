import React, { useEffect, useRef, useState } from 'react';
import type { DesignerApi as Designer, DialogData } from '../designer-api.js';
import type { IComponentRenderType } from '../types.js';
import { resolveText } from '../resolve.js';
import { FORMAT_CELLS_TEMPLATE } from './templates.js';
import { FormatDialogContent } from './FormatDialog.js';
import { FunctionArgumentsBody, InsertFunctionBody } from './FunctionDialogs.js';
import { GoToBody, GoToSpecialBody, SeriesBody } from './GoToDialogs.js';
import { CellStatesManagerBody, CreateCellStateBody } from './CellStatesDialogs.js';
import { NewFormattingRuleBody, RuleManagerBody } from './ConditionalFormattingDialogs.js';
import { ChangeChartTypeBody } from './ChartTypeDialogs.js';
import { NewTableStyleBody } from './TableStyleDialogs.js';
import { BarcodeBody, MoveChartBody, PageHeaderFooter, PageMargins, PageSheetTab, PageSetupPage, RangePickButton, SlicerFieldList } from './InsertDialogs.js';
import { FindOptions, FindOptionsToggle, FindResultsSection } from './FindDialog.js';
import { SettingsBody } from './SettingsDialog.js';
import { BuiltInFileIconsEditor, TabStyleEditor } from './IconStyleEditors.js';
import { RemoveDuplicatesBody, SortDialogBody, SubtotalDialogBody, TextToColumnsWizard, ValidationHighlightBody } from './DataDialogs.js';
import { FieldSettingsBody, InsertPivotTableBody, MovePivotTableBody, PivotTableOptionsBody, ValueFieldSettingsBody, CalculatedFieldBody, CalculatedItemBody, ReportFilterPagesBody, SolveOrderBody } from '../pivot-dialogs.js';
import { sheetSettingTabs, spreadSettingTabs } from '../settings-model.js';
import { definedNameValue, matchNameFilter, nameFilterLabel, nameFilters, type DefinedNameEntry } from '../defined-names.js';
import { CustomCheckbox, CustomRadio, CustomSelect } from './custom-widgets.js';

function getPath(object: Record<string, unknown>, path?: string): unknown {
  if (!path) return undefined;
  let current: unknown = object;
  for (const part of path.split('.')) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
function setPath(object: Record<string, unknown>, path: string | undefined, value: unknown): void {
  if (!path) return;
  const parts = path.split('.');
  let current: Record<string, unknown> = object;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (next == null || typeof next !== 'object') current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function interpolate(value: unknown, data: Record<string, unknown>, resources: unknown): string {
  if (value == null) return '';
  let out = resolveText(value, resources);
  out = out.replace(/\{([^}]+)\}/g, (_m, key: string) => {
    const found = getPath(data, key);
    return found == null ? '' : String(found);
  });
  return out;
}

export function DialogHost({ designer }: { designer: Designer }): React.ReactElement {
  const dialog = designer.dialog!;
  const template = dialog.template;
  const [data, setData] = useState<DialogData>(() => dialog.data);
  const [, setNonce] = useState(0);
  // Adopt data replaced from OUTSIDE the host (the Rules Manager's scope dropdown and `Apply`
  // re-read the live rules via designer.refreshConditionalRuleManager, which assigns a fresh
  // dialog.data object): without this sync the dialog body would keep showing the old snapshot.
  // `hostData` tracks the object WE published, so the write-back below never bounces back.
  const hostData = useRef<DialogData | null>(dialog.data);
  useEffect(() => { if (dialog.data !== hostData.current) setData(dialog.data); }, [dialog.data]);
  useEffect(() => { if (designer.dialog) { designer.dialog.data = data; hostData.current = data; } }, [data, designer]);
  useEffect(() => {
    // Ignore Enter/Escape keydowns that began before this dialog existed: the command
    // palette (and other ribbon triggers) open dialogs synchronously from a keydown, so
    // the same physical key press must not immediately submit the freshly opened dialog.
    const openedAt = performance.now();
    const key = (event: KeyboardEvent): void => {
      if (event.type === 'keydown' && event.timeStamp < openedAt - 1) return;
      if (event.key === 'Escape') designer.closeDialog(dialog.name, false);
      if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) designer.closeDialog(dialog.name, true);
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); };
  }, [designer, dialog.name]);
  const update = (path: string | undefined, value: unknown): void => {
    if (!path) return;
    setData((previous) => {
      const next = { ...previous };
      setPath(next, path, value);
      return next;
    });
  };
  const ctx = { designer, data, update, rerender: () => setNonce((n) => n + 1) };
  const allButtons = template.buttons ?? [
    { text: 'OK', buttonType: 'Ok', closeAfterClick: true },
    { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true },
  ];
  // `visibleWhen`/`primaryWhenTab` make the footer follow the dialog's active tab (Find and Replace).
  const activeTab = data.activeTab == null ? undefined : String(data.activeTab);
  const buttons = allButtons.filter((button) => !button.visibleWhen || button.visibleWhen === activeTab);
  return (
    <div className="gc-designer-dialog-overlay" data-template={dialog.name} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) designer.closeDialog(dialog.name, false); }}>
      {/* TASK 70: the aria-label follows the same dynamic title as the header, so dialogs whose
        * title changes at runtime (Text to Columns: "... Wizard - Step 2 of 3") expose it too. */}
      <div className="gc-designer-dialog gc-dialog" role="dialog" aria-modal={template.modal !== false} aria-label={String(data.dialogTitle ?? resolveText(template.title ?? dialog.name, designer.resources) ?? dialog.name)} data-template={dialog.name}>
        <div className="gc-dialog-header">
          <div className="gc-dialog-title">{String(data.dialogTitle ?? resolveText(template.title ?? dialog.name, designer.resources))}</div>
          <button className="gc-dialog-close" aria-label="Close" onClick={() => designer.closeDialog(dialog.name, false)}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" /></svg></button>
        </div>
        <div className="gc-dialog-content">
          {dialog.name === FORMAT_CELLS_TEMPLATE
            ? <FormatDialogContent designer={designer} data={data} update={update} />
            : template.content.map((component, index) => (
              <ComponentRenderer key={index} component={component} data={data} ctx={ctx} update={update} />
            ))}
        </div>
        {!template.hideFooter && <div className="gc-dialog-footer">
          {buttons.map((button, index) => (
            <button
              key={index}
              className={`gc-dialog-button${button.buttonType === 'Ok' || (button.primaryWhenTab !== undefined && (Array.isArray(button.primaryWhenTab) ? button.primaryWhenTab.includes(activeTab ?? '') : button.primaryWhenTab === activeTab)) ? ' gc-dialog-button-primary' : ''}${button.className ? ` ${button.className}` : ''}`}
              disabled={button.disabled}
              onClick={() => {
                let close = button.closeAfterClick !== false;
                try {
                  const result = button.click?.({ ...ctx, button });
                  if (result === false) close = false;
                } catch (error) { console.error(error); }
                if (button.buttonType === 'Ok') designer.closeDialog(dialog.name, true);
                else if (button.buttonType === 'Cancel') designer.closeDialog(dialog.name, false);
                else if (close) designer.invalidate();
              }}
            >
              {resolveText(button.text, designer.resources)}
            </button>
          ))}
        </div>}
      </div>
    </div>
  );
}

function ComponentRenderer({ component, data, ctx, update }: {
  component: IComponentRenderType;
  data: DialogData;
  ctx: DialogContext;
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement | null {
  const resources = ctx.designer.resources;
  const value = getPath(data, component.bindingPath);
  const set = (next: unknown): void => update(component.bindingPath, next);
  const cls = component.className ? ` ${component.className}` : '';
  switch (component.type) {
    case 'TextBlock':
      return <div className={`gc-dialog-text${cls}`}>{interpolate(component.text, data, resources)}</div>;
    case 'LabelLine':
      return <div className={`gc-dialog-label-line${cls}`}><span /></div>;
    case 'ColumnSet':
      return <div className={`gc-dialog-column-set${cls}`}>{component.children?.map((child, index) => <ComponentRenderer key={index} component={child} data={data} ctx={ctx} update={update} />)}</div>;
    case 'FlexContainer':
    case 'Container':
      return <div className={`gc-dialog-container${cls}`}>{component.children?.length ? component.children.map((child, index) => <ComponentRenderer key={index} component={child} data={data} ctx={ctx} update={update} />) : interpolate(component.text, data, resources)}</div>;
    case 'GroupBox':
      return <fieldset className={`gc-dialog-groupbox${cls}`}><legend>{interpolate(component.text, data, resources)}</legend>{component.children?.map((child, index) => <ComponentRenderer key={index} component={child} data={data} ctx={ctx} update={update} />)}</fieldset>;
    case 'Column':
      return <div className={`gc-dialog-column${cls}`} style={component.width ? { width: String(component.width) } : undefined}>{component.children?.map((child, index) => <ComponentRenderer key={index} component={child} data={data} ctx={ctx} update={update} />)}</div>;
    case 'TextEditor':
      return <input className={`gc-dialog-input${cls}`} type={component.bindingPath === 'password' ? 'password' : 'text'} value={String(value ?? '')} onChange={(event) => set(event.target.value)} aria-label={String(component.placeholder ?? component.bindingPath ?? '')} />;
    case 'TextArea':
      return <textarea className={`gc-dialog-input gc-dialog-textarea${cls}`} aria-label={component.placeholder ? String(component.placeholder) : undefined} value={String(value ?? '')} onChange={(event) => set(event.target.value)} />;
    case 'NumberEditor':
      return <input className={`gc-dialog-input gc-dialog-number${cls}`} type="number" value={Number(value ?? 0)} onChange={(event) => set(event.target.value === '' ? 0 : Number(event.target.value))} />;
    case 'ComboBox': {
      const items = ((component.itemsPath ? getPath(data, String(component.itemsPath)) : component.items) as ListItem[] ?? []);
      const options = items.map((item) => ({ text: String(item.text ?? item.value ?? ''), value: item.value }));
      return <CustomSelect className={`gc-dialog-select${cls}`} ariaLabel={String(component.bindingPath ?? '')} value={value} options={options} onChange={(next) => set(convertOption(items, String(next)))} />;
    }
    case 'CheckBox':
      return <CustomCheckbox className={cls.trim()} checked={!!value} onChange={(next) => set(next)} label={interpolate(component.text, data, resources)} />;
    case 'Radio':
      // With `value` the whole group shares one bindingPath, so the options are mutually exclusive.
      return <CustomRadio className={cls.trim()} checked={component.value === undefined ? !!value : String(value) === String(component.value)} onChange={() => set(component.value === undefined ? true : component.value)} label={interpolate(component.text, data, resources)} />;
    case 'ColorPicker':
      return (
        <span className={`gc-dialog-color${cls}`}>
          <input type="color" value={normalizeColor(String(value ?? '#ffffff'))} onChange={(event) => set(event.target.value)} />
          <input className="gc-dialog-input" value={String(value ?? '')} onChange={(event) => set(event.target.value)} />
        </span>
      );
    case 'Button':
      return <button className={`gc-dialog-secondary${cls}`} onClick={() => { if (component.command) update(component.bindingPath, String(component.command)); }}>{interpolate(component.text, data, resources)}</button>;
    case 'List':
      return (
        <div className={`gc-dialog-list${cls}`}>
          {((component.itemsPath ? getPath(data, String(component.itemsPath)) : component.items) as ListItem[] ?? []).map((item, index) => (
            <div key={index} className={`gc-dialog-list-item${String(value) === String(item.value) ? ' selected' : ''}`} onClick={() => set(item.value)}>{item.text}</div>
          ))}
        </div>
      );
    case 'TabControl':
      return <TabControl component={component} data={data} ctx={ctx} update={update} />;
    case 'LineStylePicker':
      return <CustomSelect className={`gc-dialog-select${cls}`} ariaLabel="Line style" value={String(value ?? 'thin')} options={['thin', 'medium', 'thick', 'double', 'dotted', 'dashed'].map((style) => ({ text: style[0].toUpperCase() + style.slice(1), value: style }))} onChange={(next) => set(String(next))} />;
    case 'BorderPreview':
      return <div className={`gc-dialog-border-preview${cls}`} data-preset={String(value ?? 'none')}><span /></div>;
    case 'NumberOptions':
      return <NumberOptions data={data} update={update} />;
    case 'ZoomMagnification':
      return <ZoomMagnification data={data} update={update} />;
    case 'RangePickButton':
      return <RangePickButton component={component} data={data} ctx={ctx} update={update} />;
    case 'BarcodeBody':
      return <BarcodeBody data={data} update={update} />;
    case 'MoveChartBody':
      return <MoveChartBody data={data} update={update} />;
    case 'SlicerFieldList':
      return <SlicerFieldList data={data} update={update} />;
    case 'PageSetupPage':
      return <PageSetupPage data={data} ctx={ctx} update={update} />;
    case 'PageMargins':
      return <PageMargins data={data} ctx={ctx} update={update} />;
    case 'PageHeaderFooter':
      return <PageHeaderFooter data={data} ctx={ctx} update={update} />;
    case 'PageSheetTab':
      return <PageSheetTab data={data} ctx={ctx} update={update} />;
    case 'FindOptionsToggle':
      return <FindOptionsToggle data={data} update={update} />;
    case 'FindOptions':
      return <FindOptions data={data} update={update} />;
    case 'FindResultsSection':
      return <FindResultsSection data={data} />;
    case 'ValidationCriteria':
      return <ValidationCriteria data={data} update={update} />;
    case 'NameManager':
      return <NameManager designer={ctx.designer} data={data} update={update} />;
    case 'InsertFunctionEditor':
      return <InsertFunctionBody designer={ctx.designer} data={data} update={update} />;
    case 'GoToEditor':
      return <GoToBody designer={ctx.designer} data={data} update={update} />;
    case 'GoToSpecialEditor':
      return <GoToSpecialBody designer={ctx.designer} data={data} update={update} />;
    case 'SeriesEditor':
      return <SeriesBody designer={ctx.designer} data={data} update={update} />;
    case 'NewTableStyleEditor':
      return <NewTableStyleBody designer={ctx.designer} data={data} update={update} />;
    case 'CellStatesManagerEditor':
      return <CellStatesManagerBody designer={ctx.designer} data={data} update={update} />;
    case 'CreateCellStateEditor':
      return <CreateCellStateBody designer={ctx.designer} data={data} update={update} />;
    case 'NewFormattingRuleEditor':
      return <NewFormattingRuleBody designer={ctx.designer} data={data} update={update} />;
    case 'RuleManagerEditor':
      return <RuleManagerBody designer={ctx.designer} data={data} update={update} />;
    case 'ChangeChartTypeEditor':
      return <ChangeChartTypeBody designer={ctx.designer} data={data} update={update} />;
    case 'FunctionArgumentsEditor':
      return <FunctionArgumentsBody designer={ctx.designer} data={data} update={update} />;
    case 'SpreadSettingsEditor':
      return <SettingsBody designer={ctx.designer} data={data} update={update} tabs={spreadSettingTabs} kind="spread" />;
    case 'SheetSettingsEditor':
      return <SettingsBody designer={ctx.designer} data={data} update={update} tabs={sheetSettingTabs} kind="sheet" />;
    case 'BuiltInFileIconsEditor':
      return <BuiltInFileIconsEditor data={data} update={update} />;
    case 'TabStyleEditor':
      return <TabStyleEditor data={data} update={update} />;
    case 'MoveOrCopySheetList':
      return <div className="gc-dialog-list gc-move-copy-list" role="listbox" aria-label="Before sheet:">
        {[...(data.names as string[]), '(move to end)'].map((name) => <div key={name} role="option" aria-selected={data.before === name} className={`gc-dialog-list-item${data.before === name ? ' selected' : ''}`} onClick={() => update('before', name)}>{name}</div>)}
      </div>;
    case 'TabColorEditor':
      return <TabColorEditor data={data} update={update} />;
    case 'UnhideSheetList':
      return <UnhideSheetList data={data} update={update} />;
    case 'CustomSortBody':
      return <SortDialogBody designer={ctx.designer} data={data} update={update} />;
    case 'PivotCreateBody':
      return <InsertPivotTableBody designer={ctx.designer} data={data} update={update} />;
    case 'PivotMoveBody':
      return <MovePivotTableBody data={data} update={update} />;
    case 'PivotValueFieldBody':
      return <ValueFieldSettingsBody designer={ctx.designer} data={data} update={update} />;
    case 'PivotFieldSettingsBody':
      return <FieldSettingsBody designer={ctx.designer} data={data} update={update} />;
    case 'PivotOptionsBody':
      return <PivotTableOptionsBody data={data} update={update} />;
    /* TASK 77: Fields, Items & Sets dialogs + the report-filter confirmation. */
    case 'PivotCalcFieldBody':
      return <CalculatedFieldBody designer={ctx.designer} data={data} update={update} />;
    case 'PivotCalcItemBody':
      return <CalculatedItemBody designer={ctx.designer} data={data} update={update} />;
    case 'PivotSolveOrderBody':
      return <SolveOrderBody designer={ctx.designer} data={data} update={update} />;
    case 'PivotReportFilterBody':
      return <ReportFilterPagesBody data={data} />;
    case 'RemoveDuplicatesBody':
      return <RemoveDuplicatesBody designer={ctx.designer} data={data} update={update} />;
    case 'TextToColumnsWizard':
      return <TextToColumnsWizard designer={ctx.designer} data={data} update={update} />;
    case 'SubtotalBody':
      return <SubtotalDialogBody designer={ctx.designer} data={data} update={update} />;
    case 'ValidationHighlight':
      return <ValidationHighlightBody designer={ctx.designer} data={data} update={update} />;
    case 'FindResults':
      return <FindResults data={data} />;
    default:
      return <div className={`gc-dialog-unknown${cls}`}>{component.type}</div>;
  }
}

export function TabColorEditor({ data, update }: { data: Record<string, unknown>; update: (path: string, value: unknown) => void }): React.ReactElement {
  const [hsl, setHsl] = useState({ h: 0, s: 0, l: 1 });
  const rgb = ['red', 'green', 'blue'].map((key) => Math.max(0, Math.min(255, Number(data[key]) || 0)));
  const color = ['red', 'green', 'blue'].every((key) => data[key] === '') ? 'transparent' : `rgb(${rgb.join(',')})`;
  const select = (next: typeof hsl): void => {
    setHsl(next);
    update('pickerSelected', true);
    const chroma = (1 - Math.abs(2 * next.l - 1)) * next.s;
    const sector = next.h * 6;
    const x = chroma * (1 - Math.abs(sector % 2 - 1));
    const channels = sector < 1 ? [chroma, x, 0] : sector < 2 ? [x, chroma, 0] : sector < 3 ? [0, chroma, x] : sector < 4 ? [0, x, chroma] : sector < 5 ? [x, 0, chroma] : [chroma, 0, x];
    channels.forEach((channel, index) => update(['red', 'green', 'blue'][index], Math.round((channel + next.l - chroma / 2) * 255)));
  };
  return <div className="gc-tab-color-editor">
    <div className="gc-tab-color-palette"><div className="gc-tab-color-spectrum" aria-label="Color spectrum" onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={(event) => {
      if (!(event.buttons & 1)) return;
      const rect = event.currentTarget.getBoundingClientRect();
      select({ ...hsl, h: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), s: Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)) });
    }} onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      select({ ...hsl, h: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), s: Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)) });
    }} /><div className="gc-tab-color-lightness" role="slider" aria-label="Lightness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsl.l * 100)} style={{ background: `linear-gradient(to bottom, white, hsl(${hsl.h * 360} ${hsl.s * 100}% 50%), black)` }} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={(event) => {
      if (!(event.buttons & 1)) return;
      const rect = event.currentTarget.getBoundingClientRect();
      select({ ...hsl, l: Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)) });
    }} onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      select({ ...hsl, l: Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)) });
    }} /></div>
    <div className="gc-tab-color-fields">
      <div>{['red', 'green', 'blue'].map((key, index) => <label key={key}>{key[0].toUpperCase() + key.slice(1)}: <input type="number" min="0" max="255" aria-label={`${key[0].toUpperCase() + key.slice(1)}:`} value={data[key] === '' ? '' : rgb[index]} onChange={(event) => { update('pickerSelected', false); update(key, event.target.value); }} /></label>)}</div>
      <div className="gc-tab-color-preview">New<div style={{ background: color }} /><div />Current</div>
    </div>
  </div>;
}

function UnhideSheetList({ data, update }: { data: Record<string, unknown>; update: (path: string, value: unknown) => void }): React.ReactElement {
  const names = data.names as string[];
  const selected = data.selected as string[];
  const [anchor, setAnchor] = useState(0);
  return <div className="gc-dialog-list gc-unhide-sheet-list" role="listbox" aria-label="Unhide one or more sheets:" aria-multiselectable="true" tabIndex={0}>
    {names.map((name, index) => <div key={name} role="option" aria-selected={selected.includes(name)} className={`gc-dialog-list-item${selected.includes(name) ? ' selected' : ''}`}
      onClick={(event) => {
        if (event.shiftKey) update('selected', names.slice(Math.min(anchor, index), Math.max(anchor, index) + 1));
        else if (event.ctrlKey || event.metaKey) { update('selected', selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name]); setAnchor(index); }
        else { update('selected', [name]); setAnchor(index); }
      }}>{name}</div>)}
  </div>;
}

function NameManager({ designer, data, update }: { designer: Designer; data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const entries = (data.names ?? []) as DefinedNameEntry[];
  const filter = String(data.filter ?? '');
  const sort = data.sort as { key: string; direction: number } | undefined;
  const valueOf = (entry: DefinedNameEntry): string => definedNameValue(designer.gc, designer.getWorkbook(), entry);
  const columns: { key: keyof DefinedNameEntry & string; label: string; text: (entry: DefinedNameEntry) => string }[] = [
    { key: 'name', label: 'Name', text: (entry) => entry.name },
    { key: 'value', label: 'Value', text: valueOf },
    { key: 'refersTo', label: 'Refers To', text: (entry) => entry.refersTo },
    { key: 'scope', label: 'Scope', text: (entry) => entry.scope },
    { key: 'comment', label: 'Comment', text: (entry) => entry.comment },
  ];
  let visible = entries.filter((entry) => matchNameFilter(entry, filter, valueOf(entry)));
  if (sort) {
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (column) visible = [...visible].sort((a, b) => column.text(a).localeCompare(column.text(b)) * (sort.direction || 1));
  }
  const selected = visible.find((entry) => entry.id === data.selected) ?? visible[0];
  const [filterOpen, setFilterOpen] = useState(false);
  const filterLabel = nameFilterLabel(filter);
  return <div className="gc-name-manager">
    <div className="gc-name-toolbar">
      <button className="gc-dialog-secondary" onClick={() => designer.showNewName()}>New...</button>
      <button className="gc-dialog-secondary" disabled={!selected || selected.readOnly} onClick={() => designer.showNewName(selected?.id)}>Edit...</button>
      <button className="gc-dialog-secondary" disabled={!selected || selected.readOnly} onClick={() => selected && designer.confirmDeleteName(selected.id)}>Delete</button>
      <label>Filter with:
        <div className={`gc-name-filter-select${filterOpen ? ' open' : ''}`}>
          <div className="gc-name-filter-field" role="combobox" aria-expanded={filterOpen} aria-haspopup="listbox" aria-label="Filter with:" tabIndex={0}
            onClick={() => setFilterOpen((open) => !open)}
            onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowDown') { event.preventDefault(); setFilterOpen(true); } }}>
            <span className="gc-name-filter-text">{filter ? filterLabel : 'Filter'}</span>
            <span className="gc-name-filter-arrow" aria-hidden="true"><i /></span>
          </div>
          {filterOpen && <div className="gc-name-filter-list" role="listbox" aria-label="Filter with:">
            {[['', 'Filter'] as [string, string], ...nameFilters].map(([value, label]) => (
              <div key={label} role="option" aria-selected={filter === value} className={`gc-dialog-list-item${filter === value ? ' selected' : ''}`}
                onClick={() => { setFilterOpen(false); update('filter', value); }}>{label}</div>
            ))}
          </div>}
        </div>
      </label>
    </div>
    <div className="gc-name-list" role="listbox" aria-label="Name Manager">
      <table><thead><tr>{columns.map((column) => {
        const active = sort?.key === column.key;
        return <th key={column.key} aria-label={`${column.label} sort`} onClick={() => update('sort', { key: column.key, direction: active && sort?.direction === 1 ? -1 : 1 })}>
          <span>{column.label}</span><i className={`gc-name-sort${active ? (sort?.direction === -1 ? ' desc' : ' asc') : ''}`} aria-hidden="true" />
        </th>;
      })}</tr></thead><tbody>{visible.map((entry) => <tr key={entry.id} role="option" aria-selected={entry.id === selected?.id} tabIndex={0}
        onClick={() => update('selected', entry.id)} onDoubleClick={() => designer.showNewName(entry.id)}
        onKeyDown={(event) => { if (event.key === 'Enter') designer.showNewName(entry.id); }}>
        <td>{entry.name}</td><td>{valueOf(entry)}</td><td>{entry.refersTo}</td><td>{entry.scope}</td><td>{entry.comment}</td></tr>)}</tbody></table>
    </div>
  </div>;
}

function ValidationCriteria({ data, update }: { data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const kind = String(data.validationType ?? 'Any value');
  const any = kind === 'Any value', list = kind === 'List', custom = kind === 'Custom';
  const between = [6, 7].includes(Number(data.operator));
  const field = (label: string, path: string): React.ReactElement => <label className="gc-dv-field">{label}<input className="gc-dialog-input" aria-label={label} value={String(data[path] ?? '')} onChange={(event) => update(path, event.target.value)} /></label>;
  return <div className="gc-validation-criteria">
    <fieldset><legend>Validation Criteria</legend></fieldset>
    <div className="gc-dv-allow-row"><label className="gc-dv-field">Allow:<CustomSelect className="gc-dialog-select gc-dv-type" ariaLabel="Allow:" value={kind} options={['Any value', 'Whole number', 'Decimal', 'List', 'Date', 'Time', 'Text length', 'Custom'].map((kind) => ({ text: kind, value: kind }))} onChange={(next) => update('validationType', String(next))} /></label>
      <div><CustomCheckbox disabled={any} checked={data.ignoreBlank !== false} onChange={(next) => update('ignoreBlank', next)} label="Ignore Blank" />
      {list && <CustomCheckbox checked={data.inCellDropdown !== false} onChange={(next) => update('inCellDropdown', next)} label="In-cell dropdown" />}</div>
    </div>
    {!list && !custom && <label className="gc-dv-field">Data:<CustomSelect className="gc-dialog-select gc-dv-operator" ariaLabel="Data:" disabled={any} value={String(data.operator ?? 6)} options={[{ text: 'between', value: 6 }, { text: 'not between', value: 7 }, { text: 'equal to', value: 0 }, { text: 'not equal to', value: 1 }, { text: 'greater than', value: 2 }, { text: 'less than', value: 4 }, { text: 'greater than or equal to', value: 3 }, { text: 'less than or equal to', value: 5 }]} onChange={(next) => update('operator', Number(next))} /></label>}
    {!any && <>{field(list ? 'Source:' : custom ? 'Formula:' : between ? (kind === 'Date' ? 'Start date:' : kind === 'Time' ? 'Start time:' : 'Minimum:') : 'Value:', 'source')}{between && !list && !custom && field(kind === 'Date' ? 'End date:' : kind === 'Time' ? 'End time:' : 'Maximum:', 'formula2')}</>}
  </div>;
}

/** Official Zoom dialog body: magnification radio group with a Custom row. */
function ZoomMagnification({ data, update }: { data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const choice = String(data.choice ?? '100');
  const options: [string, string][] = [['200', '200%'], ['100', '100%'], ['75', '75%'], ['50', '50%'], ['25', '25%'], ['fit', 'Fit selection']];
  return (
    <div className="gc-zoom-radio-group-inner">
      {options.map(([value, label]) => (
        <CustomRadio key={value} className="gc-zoom-radio gc-radio" checked={choice === value} onChange={() => update('choice', value)} label={label} />
      ))}
      <span className="gc-zoom-custom-row">
        <CustomRadio className="gc-zoom-radio gc-zoom-custom-radio gc-radio" checked={choice === 'custom'} onChange={() => update('choice', 'custom')} label="Custom:" />
        <input
          className="gc-dialog-input gc-zoom-custom-input"
          type="number"
          disabled={choice !== 'custom'}
          value={Number(data.custom ?? 100)}
          onChange={(event) => { update('custom', event.target.value === '' ? 0 : Number(event.target.value)); if (choice !== 'custom') update('choice', 'custom'); }}
        />
        <span className="gc-dialog-text gc-zoom-percent-sign">%</span>
      </span>
    </div>
  );
}

function NumberOptions({ data, update }: { data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void }): React.ReactElement | null {
  const category = String(data.category ?? 'General');
  if (category === 'General') return null;
  return (
    <div className="gc-format-number-options-content">
      <div className="gc-dialog-label">Type:</div>
      <input className="gc-dialog-input gc-format-code-input" value={String(data.formatCode ?? '')} onChange={(event) => update('formatCode', event.target.value)} />
      {['Number', 'Currency', 'Accounting', 'Percentage', 'Scientific', 'Fraction'].includes(category) && <>
        <div className="gc-dialog-label">Decimal places:</div>
        <input className="gc-dialog-input gc-format-decimal-input" type="number" value={Number(data.decimalPlaces ?? 2)} onChange={(event) => update('decimalPlaces', Number(event.target.value))} />
      </>}
    </div>
  );
}

/** One row of the `FindResults` list (produced by find.ts's SearchOptions.results). */
interface FindResultRow { book: string; sheet: string; cell: string; value: string }

/** A `ComboBox`/`List` item as templates and dialog data carry them. */
interface ListItem { value?: unknown; text?: string }

/** The tab items of a `TabControl` component. */
interface TabItem { key?: string; text?: string; children?: IComponentRenderType[] }

/** The render context `DialogHost` builds and threads through the component tree. */
interface DialogContext {
  designer: Designer;
  data: DialogData;
  update: (path: string | undefined, value: unknown) => void;
  rerender: () => void;
}

function convertOption(items: unknown, raw: string): unknown {
  if (!Array.isArray(items)) return raw;
  const found = (items as ListItem[]).find((item) => String(item.value) === raw);
  return found ? found.value : raw;
}

function normalizeColor(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  return '#ffffff';
}

function TabControl({ component, data, ctx, update }: { component: IComponentRenderType; data: DialogData; ctx: DialogContext; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const items = (component.items as TabItem[]) ?? [];
  const [active, setActive] = useState(() => {
    const initial = ctx.designer.dialog?.initialTab;
    const found = items.findIndex((item) => item.key === initial);
    return found >= 0 ? found : 0;
  });
  // Publish the active tab key so the dialog footer can follow it (`visibleWhen` buttons).
  // The guard keeps this stable even though `update` is recreated on every parent render.
  useEffect(() => {
    const key = items[active]?.key ?? active;
    if (data.activeTab !== key) update('activeTab', key);
  }, [active, update, data, items]);
  useEffect(() => {
    const initial = ctx.designer.dialog?.initialTab;
    if (initial) {
      const index = items.findIndex((item) => item.key === initial);
      if (index >= 0) setActive(index);
    }
  }, [items, ctx.designer.dialog]);
  const current = items[active];
  return (
    <div className={`gc-dialog-tabs${component.className ? ` ${component.className}` : ''}`}>
      <div className="gc-dialog-tab-bar" role="tablist">
        {items.map((item, index) => (
          <button key={item.key ?? index} role="tab" aria-selected={index === active} className={`gc-dialog-tab${index === active ? ' selected' : ''}`} onClick={() => setActive(index)}>{item.text}</button>
        ))}
      </div>
      <div className="gc-dialog-tab-panel" role="tabpanel">
        {(current?.children ?? []).map((child: IComponentRenderType, index: number) => <ComponentRenderer key={index} component={child} data={data} ctx={ctx} update={update} />)}
      </div>
    </div>
  );
}

function FindResults({ data }: { data: Record<string, unknown> }): React.ReactElement {
  const results = Array.isArray(data.results) ? data.results as FindResultRow[] : [];
  if (!results.length) return <div className="gc-find-results-empty" />;
  return (
    <div className="gc-find-results-list">
      {results.map((result, index) => (
        <div key={index} className="gc-find-result-row">
          <span>{result.book}</span><span>{result.sheet}</span><span>{result.cell}</span><span>{result.value}</span>
        </div>
      ))}
    </div>
  );
}
