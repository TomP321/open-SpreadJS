// GC.Spread.Sheets.FormulaPanel — FormulaEditor control (TASK 44 item 3).
// Contract: core d.ts `FormulaPanel` namespace (FormulaEditor class,
// IFormulaEditorOptions, findControl, the six Commands).
// NOTE (recorded in docs/STATUS.md): the official CORE runtime does not ship
// this namespace (probe `fp:shape`: `GC.Spread.Sheets.FormulaPanel` is undefined
// in the trial page — it is only provided by a formula-panel add-on, which is
// not installed in apps/compare). The behaviour below is therefore derived from
// the public d.ts contract and mirrors the sibling controls (FormulaTextBox,
// NameBox, StatusBar) that we have trial-verified; DOM classes are our own.

import type { Workbook } from '../workbook.js';
import { GeneralFormatter } from '../formatter.js';
import { Events, type EventInfo, type ModelEvent } from '../events.js';
import { CommandManager } from '../commands.js';
import { instanceProperties } from '../not-implemented.js';
import { builtinHintNames } from './formula-hints.js';
import { registerControl, unregisterControl, findControl as findRegistered } from './controls.js';

export interface FormulaEditorOptions {
  tabSize?: number;
  formatWidthLimit?: number | 'auto';
}

export type FormulaEditorCommand = { execute(context: FormulaEditor): unknown };

function hostElement(host: HTMLElement | string): HTMLElement {
  const element = typeof host === 'string' ? document.getElementById(host) : host;
  if (!element) throw new Error('Control host not found');
  return element;
}

/** Split a formula string into reference-ish and literal tokens for rewrites. */
function tokenize(text: string): { refs: string[]; rest: string }[] {
  const parts: { refs: string[]; rest: string }[] = [];
  const pattern = /(?:'[^']*'!|[A-Za-z_][\w.]*!)?\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}\$?\d+/g;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    if ((match.index ?? 0) > index) parts.push({ refs: [], rest: text.slice(index, match.index) });
    parts.push({ refs: [match[0]], rest: '' });
    index = (match.index ?? 0) + match[0].length;
  }
  if (index < text.length) parts.push({ refs: [], rest: text.slice(index) });
  return parts;
}

export class FormulaEditor {
  /**
   * Panel options (`tabSize`, `formatWidthLimit`). Declared through a prototype
   * accessor (instanceProperties, like `Range.row`): the constructor's own-field
   * assignment shadows it, while the coverage report reads the descriptor.
   */
  declare options: FormulaEditorOptions;
  private host: HTMLElement;
  private input: HTMLTextAreaElement;
  private panel: HTMLElement;
  private hints?: HTMLElement;
  private original: Node[];
  private wb?: Workbook;
  private bound = (_event: ModelEvent, info: EventInfo) => {
    // ActiveCell is only reassigned after SelectionChanged fires, so follow the
    // event's new selection top-left (falls back to the active cell).
    const selection = (info.newSelections as { row: number; column?: number; col?: number }[] | undefined)?.[0];
    const col = selection?.column ?? selection?.col;
    if (selection && col !== undefined) this.readCell(selection.row, col);
    else this.refresh();
  };
  private manager?: CommandManager;

  constructor(host: HTMLElement, options?: FormulaEditorOptions) {
    this.host = hostElement(host);
    this.original = [...this.host.childNodes];
    this.options = { ...options };
    registerControl(this.host, this);
    const panel = document.createElement('div');
    panel.className = 'opensheets-formula-panel';
    const input = document.createElement('textarea');
    input.className = 'opensheets-formula-panel-input';
    input.spellcheck = false;
    input.setAttribute('role', 'textbox');
    input.setAttribute('aria-label', 'Formula panel');
    input.addEventListener('input', () => this.showHintsLive());
    panel.appendChild(input);
    this.host.appendChild(panel);
    this.panel = panel;
    this.input = input;
  }

  /** Gets/sets the formula text shown by the panel. */
  text(value?: string): string {
    if (value !== undefined) this.input.value = value;
    return this.input.value;
  }

  /** Attaches the panel to a workbook: it follows the active cell until detached. */
  attach(workbook: Workbook): void {
    this.detachEvents();
    this.wb = workbook;
    for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged, Events.ValueChanged]) workbook.bind(event, this.bound);
    this.refresh();
  }

  detach(): void {
    this.detachEvents();
  }

  private detachEvents(): void {
    if (!this.wb) return;
    for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged, Events.ValueChanged]) this.wb.unbind(event, this.bound);
    this.wb = undefined;
  }

  /** Reloads the panel text from the active cell (formula when one exists). */
  refresh(): void {
    if (!this.wb) return;
    const sheet = this.wb.getActiveSheet();
    this.readCell(sheet.getActiveRowIndex(), sheet.getActiveColumnIndex());
  }

  private readCell(row: number, col: number): void {
    if (!this.wb) return;
    const sheet = this.wb.getActiveSheet();
    const formula = sheet.getFormula(row, col);
    this.text(formula ? '=' + formula : sheet.getText(row, col));
  }

  /** Normalizes whitespace around operators and arguments. */
  format(): void {
    const text = this.text();
    if (!text.startsWith('=')) return;
    let out = text.slice(1).replace(/\s+/g, ' ');
    out = out.replace(/\s*,\s*/g, ',').replace(/\s*\(\s*/g, '(').replace(/\s*\)\s*/g, ')');
    out = out.replace(/\s*([-+*/^&<>=])\s*/g, ' $1 ');
    out = out.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
    out = out.replace(/ {2,}/g, ' ');
    const limit = this.options.formatWidthLimit;
    if (typeof limit === 'number' && limit > 0) {
      const tabSize = typeof this.options.tabSize === 'number' ? this.options.tabSize : 4;
      const lines: string[] = [];
      let line = '';
      for (const chunk of out.split(/(?<=[-+*/^&])\s*/)) {
        if (line && (line + chunk).trimEnd().length > limit) { lines.push(line.trimEnd()); line = ' '.repeat(tabSize); }
        line += chunk;
      }
      lines.push(line.trimEnd());
      out = lines.join('\n');
    }
    this.text('=' + out.trim());
  }

  commandManager(): CommandManager {
    if (!this.manager) {
      this.manager = new CommandManager();
      for (const [name, command] of Object.entries(Commands)) {
        this.manager.register(name, { execute: () => command.execute(this) });
      }
    }
    return this.manager;
  }

  /** @internal Rewrites relative <-> absolute references in the panel text. */
  private toggleReferences(): void {
    const text = this.text();
    const absolute = /\$/.test(text);
    this.text(tokenize(text).map((part) => {
      if (!part.refs.length) return part.rest;
      return part.refs.map((ref) => absolute
        ? ref.replace(/\$/g, '')
        : ref.split(':').map((half) => {
            const m = /^((?:'[^']*'|[A-Za-z_][\w.]*)!)?([A-Za-z]{1,3})(\d+)$/.exec(half);
            return m ? `${m[1] ?? ''}$${m[2]}$${m[3]}` : half;
          }).join(':')).join('');
    }).join(''));
  }

  /** @internal Writes the panel content into the workbook's active cell. */
  private commitToActiveCell(): void {
    if (!this.wb) return;
    const sheet = this.wb.getActiveSheet();
    const row = sheet.getActiveRowIndex(), col = sheet.getActiveColumnIndex();
    const value = this.text();
    this.wb.commandManager().execute({
      cmd: 'editCell', row, col, sheetName: sheet.name(),
      newValue: value.startsWith('=') ? value : new GeneralFormatter().parse(value),
    });
  }

  /** @internal Opens a plain function-name hint list over the input (own DOM). */
  private openHints(): void {
    if (this.hints || !this.wb) return;
    const list = document.createElement('ul');
    list.className = 'opensheets-formula-panel-hints';
    const names = [...builtinHintNames(), ...this.wb._formulaFunctionNames(this.wb.getActiveSheet())];
    for (const name of names.slice(0, 40)) {
      const item = document.createElement('li');
      item.textContent = name;
      list.appendChild(item);
    }
    this.panel.appendChild(list);
    this.hints = list;
  }

  private closeHints(): void {
    this.hints?.remove();
    this.hints = undefined;
  }

  private showHintsLive(): void {
    if (this.input.value.startsWith('=')) this.openHints();
    else this.closeHints();
  }

  /** @internal Ends the edit gesture: commits the cell, blurs and re-syncs the text. */
  private exitEdit(): void {
    const sheet = this.wb?.getActiveSheet();
    if (sheet?.isEditing()) sheet.endEdit();
    this.input.blur();
    this.closeHints();
    this.refresh();
  }

  destroy(): void {
    this.detachEvents();
    this.closeHints();
    this.panel.remove();
    this.host.replaceChildren(...this.original);
    unregisterControl(this.host);
    this.manager = undefined;
  }
}

/**
 * The command methods live on `FormulaEditor` but are private to the class, so the
 * command objects reach them through this single, documented module seam.
 */
type FormulaEditorCommandTarget = {
  closeHints(): void;
  commitToActiveCell(): void;
  exitEdit(): void;
  openHints(): void;
  toggleReferences(): void;
};
const commandTarget = (editor: FormulaEditor): FormulaEditorCommandTarget =>
  editor as unknown as FormulaEditorCommandTarget;

/** Trial-declared command objects (`GC.Spread.Sheets.FormulaPanel.Commands`). */
export const Commands: Record<'closeHints' | 'commitContentToActiveCell' | 'exitEdit' | 'formatDocument' | 'showHints' | 'toggleAbsoluteRelativeReferences', FormulaEditorCommand> = {
  closeHints: { execute: (editor) => commandTarget(editor).closeHints() },
  commitContentToActiveCell: { execute: (editor) => commandTarget(editor).commitToActiveCell() },
  exitEdit: { execute: (editor) => commandTarget(editor).exitEdit() },
  formatDocument: { execute: (editor) => editor.format() },
  showHints: { execute: (editor) => commandTarget(editor).openHints() },
  toggleAbsoluteRelativeReferences: { execute: (editor) => commandTarget(editor).toggleReferences() },
};

/** `GC.Spread.Sheets.FormulaPanel.findControl`: look up the editor registered for a host. */
export function findControl(host: HTMLElement | string): FormulaEditor | undefined {
  const control = findRegistered(host);
  return control instanceof FormulaEditor ? control : undefined;
}
instanceProperties(FormulaEditor, 'options');
