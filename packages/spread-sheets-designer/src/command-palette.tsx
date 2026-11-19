import React, { useState } from 'react';
import { useDesigner, useDesignerVersion } from './store.js';
import { DesignerIcon } from './icons.js';

/* Command Palette ------------------------------------------------------------ */

function PaletteSearchIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <circle cx="7" cy="7" r="4.6" />
      <path d="M10.6 10.6 14 14" />
    </svg>
  );
}

const PALETTE_SUGGESTIONS = ['copy', 'pasteAll', 'formatPainter', 'insertPicture', 'insertChart'];

/** Group titles the trial shows in the palette. */
export const PALETTE_GROUPS = { recent: 'Recently Used Action', suggested: 'Suggested Actions', best: 'Best Action', rest: 'Actions', find: 'Find In Worksheet' } as const;

export interface PaletteItem { name: string; title: string; iconClass?: string }
export interface PaletteGroup { label: string; items: (PaletteItem & { findText?: string })[] }

/**
 * The trial's palette content: recent plus suggested actions while the box is
 * empty, otherwise the ranked matches split into a best match and the rest,
 * followed by a `Find With "<query>"` entry that hands the text to the Find dialog.
 */
export function buildPaletteGroups(query: string, matched: PaletteItem[], recent: PaletteItem[], suggested: PaletteItem[]): PaletteGroup[] {
  const trimmed = query.trim();
  if (!trimmed) {
    const groups: PaletteGroup[] = [];
    if (recent.length) groups.push({ label: PALETTE_GROUPS.recent, items: recent });
    if (suggested.length) groups.push({ label: PALETTE_GROUPS.suggested, items: suggested });
    return groups;
  }
  const groups: PaletteGroup[] = [];
  if (matched.length) {
    groups.push({ label: PALETTE_GROUPS.best, items: matched.slice(0, 1) });
    if (matched.length > 1) groups.push({ label: PALETTE_GROUPS.rest, items: matched.slice(1) });
  }
  groups.push({ label: PALETTE_GROUPS.find, items: [{ name: 'find', title: `Find With "${trimmed}"`, findText: trimmed }] });
  return groups;
}

export function CommandPalette(): React.ReactElement {
  const d = useDesigner();
  useDesignerVersion();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const close = (): void => { d.executeSpecial('commandPaletteButton', null); };
  const known = d.searchCommands('', Number.MAX_SAFE_INTEGER);
  const titleMap = new Map(known.map((item) => [item.name, item]));
  const run = (item: PaletteItem & { findText?: string }): void => {
    close();
    if (item.findText !== undefined) d.openFind('find', item.findText);
    else d.executeCommand(item.name, item.name);
    d.invalidate();
  };
  const groups = buildPaletteGroups(
    query,
    query.trim() ? d.searchCommands(query, 8) : [],
    d.recentCommands.map((name) => titleMap.get(name)).filter((item): item is PaletteItem => !!item).slice(0, 5),
    PALETTE_SUGGESTIONS.map((name) => titleMap.get(name)).filter((item): item is PaletteItem => !!item),
  );
  const flat = groups.flatMap((group) => group.items);
  const clampedIndex = Math.min(index, Math.max(0, flat.length - 1));
  const activate = (): void => { const item = flat[clampedIndex]; if (item) run(item); };
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    else if (event.key === 'Enter') { event.preventDefault(); activate(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(flat.length ? (clampedIndex + 1) % flat.length : 0); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(flat.length ? (clampedIndex - 1 + flat.length) % flat.length : 0); }
  };
  let cursor = -1;
  return (
    <div className="gc-designer-command-palette-mask" onMouseDown={close}>
      <div className="gc-designer-command-palette gc-designer-component-container" onMouseDown={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="gc-command-palette-search-container">
          <PaletteSearchIcon />
          <input
            className="gc-text-editor"
            autoFocus
            maxLength={50}
            aria-label="Search for actions, text, and more"
            placeholder="Search for actions, text, and more"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
          />
          {query && <button type="button" className="gc-designer-command-palette-clear" title="Clear" onClick={() => { setQuery(''); setIndex(0); }}>×</button>}
        </div>
        <div className="gc-command-palette-list-container">
          <div className="gc-command-palette-list" role="listbox" aria-label="Command Palette">
            {groups.map((group) => (
              <div key={group.label} className="gc-command-palette-list-group-item" role="group">
                <div className="gc-command-palette-list-group-item-title">{group.label}</div>
                <div className="gc-command-palette-list-group-item-commands">
                  {group.items.map((item) => {
                    cursor++;
                    const active = cursor === clampedIndex;
                    return (
                      <div
                        key={`${group.label}:${item.name}:${item.title}`}
                        className={`gc-command-palette-list-item${active ? ' gc-command-palette-list-item-highlight' : ''}`}
                        role="option"
                        aria-selected={active}
                        aria-label={item.title}
                        onMouseEnter={() => setIndex(flat.indexOf(item))}
                        onClick={() => run(item)}
                      >
                        <div className={`gc-designer-ribbon-toolbar-group-list-item gc-command-palette-list-item-content${active ? ' gc-designer-cmd-palette-item-focus' : ''}`}>
                          <span className="gc-command-palette-list-item-icon">{item.iconClass ? <DesignerIcon className={item.iconClass} size={16} /> : null}</span>
                          <span className="gc-command-palette-list-item-text">{item.title}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
