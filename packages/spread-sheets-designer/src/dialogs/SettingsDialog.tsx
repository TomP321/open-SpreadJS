/*
 * Spread Settings and Sheet Settings dialogs of the Settings tab.
 *
 * Both dialogs are one tabbed window: every ribbon button of the group opens it
 * on its own tab (observed in the trial). The tabs, groups, labels, controls and
 * combo items come from `settings-model.ts`. Like the trial, edits stay in the
 * dialog until OK writes them through the public workbook/worksheet API, so
 * Cancel leaves the sheet untouched.
 */
import React, { useMemo } from 'react';
import { CustomSelect } from './custom-widgets.js';
import type { DesignerApi as Designer } from '../designer-api.js';
import {
  BUILT_IN_CUSTOM_LISTS, customListCaption, customListEntries,
  parseCustomListEntries, userCustomLists,
  type SettingField, type SettingGroup, type SettingLayout, type SettingTab, type SettingValue,
} from '../settings-model.js';
import { ColorCombo } from './ColorCombo.js';
import { resolveText } from '../resolve.js';

/** TASK 87: every caption from `settings-model.ts` is a `${'${res.settings.<key>}'}` placeholder;
 *  resolve it against the loaded language package (English values are byte-identical). */
const rt = (designer: Designer, value: string): string => resolveText(value, designer.resources);
/** Placeholder builder for literals first introduced by this file. */
const st = (key: string): string => `\${res.settings.${key}}`;

export interface SettingsDialogData {
  tabOption?: string;
  subTabOption?: string;
  values?: Record<string, SettingValue>;
  /** Custom Lists tab: the list currently highlighted in the left gallery. */
  customListIndex?: number;
  customListText?: string;
  /** Custom Lists tab: the user lists edited in the dialog (built-ins aside). */
  customLists?: string[][];
  /** Named Patterns tab. */
  patternName?: string;
  patternValue?: string;
  /** Named Patterns tab: the patterns edited in the dialog. */
  patterns?: { name: string; pattern: string }[];
}

const isOn = (value: SettingValue | undefined): boolean => value === true || value === 'true';

function FieldControl({ field, value, layout, designer, onChange }: {
  field: SettingField;
  value: SettingValue | undefined;
  layout: SettingLayout;
  designer: Designer;
  onChange: (value: SettingValue) => void;
}): React.ReactElement {
  switch (field.kind) {
    case 'checkbox':
      return (
        <label className={`gc-dialog-checkbox gc-setting-checkbox${field.indent ? ' gc-setting-indent' : ''}`}>
          <input type="checkbox" checked={isOn(value)} onChange={(event) => onChange(event.target.checked)} />
          <span>{rt(designer, field.label)}</span>
        </label>
      );
    case 'combo': {
      const index = (field.options ?? []).findIndex((option) => String(option.value) === String(value ?? ''));
      return (
        <label className={`gc-setting-line${field.indent ? ' gc-setting-indent' : ''}`} style={{ '--gc-setting-label': `${layout.label ?? 130}px` } as React.CSSProperties}>
          <span className="gc-setting-label">{rt(designer, field.label)}</span>
          <CustomSelect className="gc-dialog-select gc-setting-combo" ariaLabel={rt(designer, field.label)}
            style={{ width: `${field.width ?? layout.combo ?? layout.editor ?? 100}px` }}
            value={index >= 0 ? index : 0}
            options={(field.options ?? []).map((option, at) => ({ text: rt(designer, option.text), value: at }))}
            onChange={(next) => onChange(field.options?.[Number(next)]?.value ?? '')} />
        </label>
      );
    }
    case 'number':
      return (
        <label className={`gc-setting-line${field.indent ? ' gc-setting-indent' : ''}`} style={{ '--gc-setting-label': `${layout.label ?? 130}px` } as React.CSSProperties}>
          <span className="gc-setting-label">{rt(designer, field.label)}</span>
          <span className="gc-setting-editor">
            <input className="gc-dialog-input gc-setting-number" type="number" aria-label={rt(designer, field.label)}
              style={{ width: `${field.width ?? layout.editor ?? 100}px` }}
              min={field.min} max={field.max} value={Number(value ?? 0)}
              onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))} />
            {field.suffix ? <span className="gc-setting-suffix">{rt(designer, field.suffix)}</span> : null}
          </span>
        </label>
      );
    case 'color':
      return (
        <label className="gc-setting-line" style={{ '--gc-setting-label': `${layout.label ?? 130}px` } as React.CSSProperties}>
          <span className="gc-setting-label">{rt(designer, field.label)}</span>
          <ColorCombo value={String(value ?? '')} width={field.width ?? layout.editor ?? 150} ariaLabel={rt(designer, field.label)} designer={designer} onChange={onChange} />
        </label>
      );
    default:
      return <div />;
  }
}

function FieldRow({ field, value, layout, designer, onAction, onChange }: {
  field: SettingField;
  value: SettingValue | undefined;
  layout: SettingLayout;
  designer: Designer;
  onAction: (field: SettingField) => void;
  onChange: (value: SettingValue) => void;
}): React.ReactElement {
  if (field.kind === 'button') {
    return (
      <div className={`gc-setting-line gc-setting-line-button${field.indent ? ' gc-setting-indent' : ''}`} style={{ '--gc-setting-label': `${layout.label ?? 130}px` } as React.CSSProperties}>
        <span className="gc-setting-label">{rt(designer, field.label)}</span>
        <button type="button" className="gc-dialog-secondary gc-setting-button" onClick={() => onAction(field)}>{rt(designer, field.text ?? '')}</button>
      </div>
    );
  }
  if (field.kind === 'radio') {
    // `Reference Style` and `Selection Policy` stack their choices; the Clipboard
    // header options form two columns; the header `Auto Text` groups sit on the
    // label's own row (all as the trial lays them out).
    const columns = field.inline ? (field.options?.length ?? 1) : (field.columns ?? 1);
    const radios = (
      <div className={`gc-setting-radios${field.inline ? ' gc-setting-radios-inline' : ''}`} role="radiogroup" aria-label={rt(designer, field.label)}
        style={{ gridTemplateColumns: `repeat(${columns}, max-content)` }}>
        {(field.options ?? []).map((option) => (
          <label key={String(option.value)} className="gc-dialog-radio gc-setting-radio">
            <input type="radio" name={`gc-setting-${field.key}`} checked={String(value ?? '') === String(option.value)} onChange={() => onChange(option.value)} />
            <span>{rt(designer, option.text)}</span>
          </label>
        ))}
      </div>
    );
    if (!field.label) return radios;
    if (field.inline) {
      return (
        <div className="gc-setting-line" style={{ '--gc-setting-label': `${layout.label ?? 130}px` } as React.CSSProperties}>
          <span className="gc-setting-label">{rt(designer, field.label)}</span>
          {radios}
        </div>
      );
    }
    return (
      <div className="gc-setting-block">
        <div className="gc-setting-label gc-setting-block-label">{rt(designer, field.label)}</div>
        {radios}
      </div>
    );
  }
  return <FieldControl field={field} value={value} layout={layout} designer={designer} onChange={onChange} />;
}

function GroupBlock({ group, data, layout, designer, onAction, setValue }: {
  group: SettingGroup;
  data: SettingsDialogData;
  layout: SettingLayout;
  designer: Designer;
  onAction: (field: SettingField) => void;
  setValue: (key: string, value: SettingValue) => void;
}): React.ReactElement {
  const body = group.fields.map((field) => (
    <FieldRow key={field.key} field={field} value={data.values?.[field.key]} layout={layout} designer={designer} onAction={onAction} onChange={(value) => setValue(field.key, value)} />
  ));
  if (!group.title) return <div className="gc-setting-group gc-setting-plain">{body}</div>;
  return (
    <fieldset className={`gc-setting-group${group.bordered ? ' gc-setting-group-bordered' : ''}`}>
      <legend>{rt(designer, group.title ?? '')}</legend>
      {body}
    </fieldset>
  );
}

/** Custom Lists tab, laid out like the trial's: lists, entries and two buttons. */
function CustomListTab({ designer, data, update }: {
  designer: Designer;
  data: SettingsDialogData;
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const workbook = designer.getWorkbook();
  const user = useMemo(() => data.customLists ?? userCustomLists(workbook), [data.customLists]);
  // TASK 87: the gallery name is display-only (`rt`), the caption of a real list stays the user's data.
  const lists = useMemo(
    () => [{ name: 'NEW LIST', items: [] as string[] }, ...BUILT_IN_CUSTOM_LISTS.map((items) => ({ name: customListCaption(items), items })), ...user.map((items) => ({ name: customListCaption(items), items }))],
    [user],
  );
  const index = Math.min(Math.max(0, Number(data.customListIndex ?? 0)), lists.length - 1);
  const current = lists[index];
  const text = data.customListText !== undefined ? String(data.customListText) : customListEntries(current.items);
  const builtIn = index > 0 && index <= BUILT_IN_CUSTOM_LISTS.length;
  const selectAt = (at: number): void => {
    update('customListIndex', at);
    update('customListText', customListEntries(lists[at].items));
  };
  return (
    <div className="gc-setting-custom-list">
      <div className="gc-setting-col">
        <div className="gc-setting-label">{rt(designer, st('customLists'))}</div>
        <div className="gc-dialog-list gc-custom-list-gallery" role="listbox" aria-label={rt(designer, st('customLists'))}>
          {lists.map((entry, at) => (
            <div key={`${entry.name}-${at}`} role="option" aria-selected={at === index} className={`gc-dialog-list-item${at === index ? ' selected' : ''}`}
              onClick={() => selectAt(at)}>{entry.name === 'NEW LIST' ? rt(designer, st('newList')) : entry.name}</div>
          ))}
        </div>
      </div>
      <div className="gc-setting-col">
        <div className="gc-setting-label">{rt(designer, st('listEntries'))}</div>
        <textarea className="gc-dialog-input gc-dialog-textarea gc-custom-list-entries" aria-label={rt(designer, st('listEntries'))} value={text} onChange={(event) => update('customListText', event.target.value)} />
      </div>
      <div className="gc-custom-list-buttons">
        <button type="button" className="gc-dialog-secondary" onClick={() => {
          const items = parseCustomListEntries(text);
          if (!items.length) return;
          update('customLists', [...user, items]);
          update('customListIndex', 0);
          update('customListText', '');
        }}>{rt(designer, '${res.add}') || 'Add'}</button>
        <button type="button" className="gc-dialog-secondary" disabled={index === 0 || builtIn} onClick={() => {
          if (index === 0 || builtIn) return;
          const next = [...user];
          next.splice(index - BUILT_IN_CUSTOM_LISTS.length - 1, 1);
          update('customLists', next);
          update('customListIndex', 0);
          update('customListText', '');
        }}>{rt(designer, '${res.delete}') || 'Delete'}</button>
      </div>
    </div>
  );
}

/** Named Patterns tab over the public `InputMask.namedPattern()` API. */
function NamedPatternTab({ designer, data, update }: {
  designer: Designer;
  data: SettingsDialogData;
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const inputMask = designer.gc.Spread.Sheets.InputMask;
  const patterns = useMemo(() => data.patterns ?? (inputMask?.getNamedPatterns?.() as { name: string; pattern: string }[] ?? []), [data.patterns, inputMask]);
  const write = (next: { name: string; pattern: string }[]): void => update('patterns', next);
  const name = String(data.patternName ?? '');
  const pattern = String(data.patternValue ?? '');
  return (
    <div className="gc-setting-named-patterns">
      <div className="gc-setting-col gc-setting-pattern-form">
        <div className="gc-setting-label">{rt(designer, st('name'))}</div>
        <input className="gc-dialog-input" aria-label={rt(designer, st('name'))} value={name} onChange={(event) => update('patternName', event.target.value)} />
        <div className="gc-setting-label gc-setting-pattern-label">{rt(designer, st('pattern'))}</div>
        <textarea className="gc-dialog-input gc-dialog-textarea gc-setting-pattern-text" aria-label={rt(designer, st('pattern'))} value={pattern} onChange={(event) => update('patternValue', event.target.value)} />
        <div className="gc-setting-pattern-buttons">
          <button type="button" className="gc-dialog-secondary" onClick={() => {
            const trimmed = name.trim();
            if (!trimmed) return;
            const rest = patterns.filter((entry) => entry.name !== trimmed);
            write([...rest, { name: trimmed, pattern }]);
          }}>{rt(designer, '${res.add}') || 'Add'}</button>
          <button type="button" className="gc-dialog-secondary" onClick={() => {
            const trimmed = name.trim();
            if (!trimmed) return;
            write(patterns.filter((entry) => entry.name !== trimmed));
            update('patternName', '');
            update('patternValue', '');
          }}>{rt(designer, '${res.delete}') || 'Delete'}</button>
        </div>
      </div>
      <div className="gc-setting-col">
        <div className="gc-setting-label">{rt(designer, st('namedPatternsList'))}</div>
        <div className="gc-dialog-list gc-pattern-list" role="listbox" aria-label={rt(designer, st('namedPatternsList'))}>
          <table>
            <thead><tr><th>{rt(designer, st('name'))}</th><th>{rt(designer, st('pattern'))}</th></tr></thead>
            <tbody>
              {patterns.map((entry) => (
                <tr key={entry.name} role="option" aria-selected={entry.name === name} className={entry.name === name ? ' selected' : ''}
                  onClick={() => { update('patternName', entry.name); update('patternValue', entry.pattern); }}>
                  <td>{entry.name}</td><td>{entry.pattern}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TabBody({ tab, subTab, designer, data, update, onAction, setValue }: {
  tab: SettingTab;
  subTab: string;
  designer: Designer;
  data: SettingsDialogData;
  update: (path: string | undefined, value: unknown) => void;
  onAction: (field: SettingField) => void;
  setValue: (key: string, value: SettingValue) => void;
}): React.ReactElement {
  if (tab.key === 'customList') return <CustomListTab designer={designer} data={data} update={update} />;
  if (tab.key === 'namedPattern') return <NamedPatternTab designer={designer} data={data} update={update} />;
  const layout = tab.layout ?? { column: 350, label: 130, editor: 100 };
  const rows = tab.subTabs?.length ? (tab.subTabs.find((entry) => entry.key === subTab)?.rows ?? []) : tab.rows;
  return (
    <div className="gc-setting-tab" style={{ '--gc-setting-column': `${layout.column}px`, '--gc-setting-label': `${layout.label ?? 130}px`, '--gc-setting-row': `${layout.row ?? 25}px` } as React.CSSProperties}>
      {tab.subTabs?.length ? (
        <div className="gc-setting-subtabs" role="tablist">
          {tab.subTabs.map((entry) => (
            <button key={entry.key} type="button" role="tab" aria-selected={entry.key === subTab} className={`gc-dialog-tab${entry.key === subTab ? ' selected' : ''}`}
              onClick={() => update('subTabOption', entry.key)}>{rt(designer, entry.text)}</button>
          ))}
        </div>
      ) : null}
      {rows.map((row, index) => (
        <div key={index} className="gc-setting-row">
          {row.groups.map((group, at) => <GroupBlock key={at} group={group} data={data} layout={layout} designer={designer} onAction={onAction} setValue={setValue} />)}
          {row.right?.length ? <div className="gc-setting-row-right">{row.right.map((group, at) => <GroupBlock key={at} group={group} data={data} layout={layout} designer={designer} onAction={onAction} setValue={setValue} />)}</div> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Shared body of both Settings dialogs.
 * `onApply` receives the changed values so the designer can push them through
 * the workbook/worksheet adapters and repaint.
 */
export function SettingsBody({ designer, data, update, tabs, kind }: {
  designer: Designer;
  data: SettingsDialogData;
  update: (path: string | undefined, value: unknown) => void;
  tabs: SettingTab[];
  kind: 'spread' | 'sheet';
}): React.ReactElement {
  const active = tabs.find((tab) => tab.key === data.tabOption) ?? tabs[0];
  const subTab = String(data.subTabOption ?? active.subTabs?.[0]?.key ?? '');
  const setValue = (key: string, value: SettingValue): void => {
    update('values', { ...(data.values ?? {}), [key]: value });
  };
  const onAction = (field: SettingField): void => {
    if (field.key === 'builtInFileIcons') designer.showBuiltInFileIcons();
    else designer.showTabStyleSettings();
  };
  return (
    <div className={`gc-settings-dialog gc-${kind}-settings`}>
      <div className="gc-settings-tabs" role="tablist" aria-label={rt(designer, kind === 'spread' ? st('spreadSettings') : st('sheetSettings'))}>
        {tabs.map((tab) => (
          <button key={tab.key} type="button" role="tab" aria-selected={tab.key === active.key} className={`gc-dialog-tab${tab.key === active.key ? ' selected' : ''}`}
            onClick={() => update('tabOption', tab.key)}>{rt(designer, tab.text)}</button>
        ))}
      </div>
      <TabBody tab={active} subTab={subTab} designer={designer} data={data} update={update} onAction={onAction} setValue={setValue} />
    </div>
  );
}
