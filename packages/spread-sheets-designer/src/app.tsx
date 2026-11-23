/* The designer shell: mounts the ribbon, formula bar, sheet host, the dock
 * panels, the status bar and the floating hosts (menus, dialogs, overlays).
 * Every control lives in its own module (ribbon/, context-menu, panels); this
 * file only wires them together and keeps the historical re-exports. */
import React, { useEffect } from 'react';
import { DesignerContext, useDesignerVersion } from './store.js';
import type { DesignerApi as Designer } from './designer-api.js';
import { DialogHost } from './dialogs/DialogHost.js';
import { MessageBoxHost } from './dialogs/MessageBoxHost.js';
import { DrawOverlay, ShapeFormatPanel } from './insert-ui.js';
import { Ribbon } from './ribbon/ribbon.js';
import { RibbonMenu } from './ribbon/menus.js';
import { DesignerContextMenu } from './context-menu.js';
import { DockStack } from './dock-stack.js';
import { FormulaBar } from './formula-bar.js';
import { SheetArea } from './sheet-area.js';
import { StatusBar } from './status-bar.js';
import { Backstage } from './backstage.js';
import { PivotItemMenu } from './pivot-panel.js';
import { CommandPalette } from './command-palette.js';
import { FormulaEditorPanel } from './formula-editor-panel.js';

export function DesignerApp({ designer }: { designer: Designer }): React.ReactElement {
  return (
    <DesignerContext.Provider value={designer}>
      <DesignerShell designer={designer} />
    </DesignerContext.Provider>
  );
}

function DesignerShell({ designer }: { designer: Designer }): React.ReactElement {
  useDesignerVersion();
  // Trial parity: F9 recalculates the workbook, Shift+F9 the active sheet;
  // Ctrl+F / Ctrl+H open the Find and Replace dialog (the trial handles the
  // chord even while the cell editor has focus, so only our own dialog
  // inputs keep the keystroke).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('.gc-designer-dialog, .gc-designer-message-box, .gc-command-palette')) return;
      const control = event.ctrlKey || event.metaKey;
      if (control && !event.shiftKey && !event.altKey && (event.key === 'f' || event.key === 'F')) {
        event.preventDefault();
        designer.openFind('find');
        return;
      }
      if (control && !event.shiftKey && !event.altKey && (event.key === 'h' || event.key === 'H')) {
        event.preventDefault();
        designer.openFind('replace');
        return;
      }
      // TASK 90 A/B (trial probe `.probe/t90/ctrl-keys2-r1.json`): Ctrl+B / Ctrl+I / Ctrl+U toggle
      // the ribbon Bold / Italic / Underline checkbox — the trial resolved `14.6667px Calibri` to
      // `bold 14.6667px Calibri`, then `italic bold ...`, then textDecoration 1, keeping the
      // checked state in sync (the ribbon box gained `...-checked` after each chord). We dispatch
      // through the same command path as the checkbox click (`executeCommand(name, name, !checked)`)
      // so the chord and the button are one and the same command.
      if (control && !event.shiftKey && !event.altKey) {
        const chordMap: Record<string, string | undefined> = { b: 'fontWeight', i: 'fontItalic', u: 'fontUnderline' };
        const chord = chordMap[event.key.toLowerCase()];
        if (chord) {
          event.preventDefault();
          designer.executeCommand(chord, chord, !designer.getCommandState(chord).checked);
          designer.invalidate();
          return;
        }
      }
      if (event.key !== 'F9') return;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      designer.calculate(!event.shiftKey);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [designer]);
  return (
    <div className="gc-designer-panel-container-vertical gc-designer-host" role="main">
      <Ribbon />
      {!designer.collapsed && <FormulaBar />}
      <div className="gc-designer-dock-row">
        <SheetArea />
        <DockStack />
      </div>
      {designer.formulaEditorOpen && <FormulaEditorPanel />}
      <StatusBar />
      {designer.fileMenuOpen && <Backstage />}
      {designer.openMenu && <RibbonMenu />}
      {designer.contextMenu && <DesignerContextMenu />}
      <PivotItemMenu />
      {designer.dialog && <DialogHost key={`${designer.dialog.name}:${designer.dialog.nonce}`} designer={designer} />}
      {designer.messageBox && <MessageBoxHost designer={designer} />}
      {designer.commandPaletteOpen && <CommandPalette />}
      <DrawOverlay />
      <ShapeFormatPanel />
    </div>
  );
}

/* Historical public surface of app.tsx, kept for existing imports. */
export { Ribbon, FormulaBar, StatusBar };
export { columnName } from './app-helpers.js';
