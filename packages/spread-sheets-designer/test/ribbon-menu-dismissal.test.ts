/*
 * TASK 60 item 1: the outside-pointerdown dismissal rule every ribbon popup shares
 * (collapsed-group popups, Paste, Borders, Merge, the number-format combo, the galleries).
 * Measured against the trial at 1280x720:
 *   open Cells group popup -> press the grid -> popup gone (and the cell still gets selected);
 *   open Cells group popup -> press another ribbon control -> only that control's popup is open;
 *   press the control that owns the open popup twice -> popup toggles closed.
 * The rule needs a DOM (closest/contains), so this runs in jsdom.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { dismissRibbonMenu, type MenuDismissalHost } from '../src/ribbon/menu-dismissal.js';
import { openRibbonMenu } from '../src/app-helpers.js';

function host(): MenuDismissalHost & { invalidations: number } {
  const menu = { command: 'group:home:Cells', anchor: new DOMRect(0, 0, 0, 0), level: 0, nonce: 1 };
  return {
    openMenu: menu,
    _menuOwner: null,
    _menuToggleClosedByPress: false,
    invalidations: 0,
    invalidate() { this.invalidations += 1; },
  };
}

const OPEN = { command: 'group:home:Cells', anchor: new DOMRect(0, 0, 0, 0), level: 0, nonce: 1 };

function layout() {
  document.body.innerHTML = `
    <div class="ribbon">
      <div class="gc-designer-ribbon-list gc-designer-ribbon-list-large" data-command="ribbon.ribbonGroupId.cells">
        <div class="dropdown-btn"></div>
      </div>
      <div class="gc-designer-ribbon-comboBox" data-command="ribbon.ribbonNumberFormat"><div class="arrow"></div></div>
      <canvas class="grid"></canvas>
    </div>
    <div class="gc-designer-root gc-designer-ribbon-dropdown">
      <div class="gc-designer-group-dropdown"><div class="menu-item"></div>
        <div class="gc-designer-ribbon-dropdown gc-designer-submenu"><div class="sub-item"></div></div>
      </div>
    </div>`;
  const owner = document.querySelector<HTMLElement>('[data-command="ribbon.ribbonGroupId.cells"]')!;
  const arrow = document.querySelector<HTMLElement>('[data-command="ribbon.ribbonGroupId.cells"] .dropdown-btn')!;
  const comboArrow = document.querySelector<HTMLElement>('[data-command="ribbon.ribbonNumberFormat"] .arrow')!;
  const grid = document.querySelector<HTMLElement>('.grid')!;
  const item = document.querySelector<HTMLElement>('.menu-item')!;
  const subItem = document.querySelector<HTMLElement>('.sub-item')!;
  return { owner, arrow, comboArrow, grid, item, subItem };
}

describe('ribbon popup dismissal (trial parity)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('closes the popup when the press lands on the sheet grid', () => {
    const { grid, owner } = layout();
    const d = host();
    d._menuOwner = owner;
    dismissRibbonMenu(d, d.openMenu, grid);
    expect(d.openMenu).toBeNull();
    expect(d.invalidations).toBe(1);
    // The press is not swallowed: nothing sets the toggle marker, so the grid keeps the click.
    expect(d._menuToggleClosedByPress).toBe(false);
  });

  it('closes the popup without a toggle marker when another control is pressed', () => {
    const { comboArrow, owner } = layout();
    const d = host();
    d._menuOwner = owner;
    dismissRibbonMenu(d, d.openMenu, comboArrow);
    expect(d.openMenu).toBeNull();
    expect(d._menuToggleClosedByPress).toBe(false);
    // The pressed control's own open path runs (its click follows) and its menu is the only one open.
    openRibbonMenu(d as never, 'ribbonNumberFormat', new DOMRect(0, 0, 0, 0), comboArrow);
    expect(d.openMenu?.command).toBe('ribbonNumberFormat');
  });

  it('pressing the control that owns the open popup toggles it closed instead of re-opening', () => {
    const { arrow, owner } = layout();
    const d = host();
    d._menuOwner = owner;
    dismissRibbonMenu(d, d.openMenu, arrow);
    expect(d.openMenu).toBeNull();
    expect(d._menuToggleClosedByPress).toBe(true);
    openRibbonMenu(d as never, 'group:home:Cells', new DOMRect(0, 0, 0, 0), owner);
    expect(d.openMenu).toBeNull();
    expect(d._menuToggleClosedByPress).toBe(false);
  });

  it('keeps the popup open for presses inside it, including its submenu flyouts', () => {
    const { item, subItem, owner } = layout();
    const d = host();
    d._menuOwner = owner;
    dismissRibbonMenu(d, d.openMenu, item);
    expect(d.openMenu).not.toBeNull();
    dismissRibbonMenu(d, d.openMenu, subItem);
    expect(d.openMenu).not.toBeNull();
    expect(d.invalidations).toBe(0);
  });

  it('ignores presses that belong to a popup another render already replaced', () => {
    const { grid, owner } = layout();
    const d = host();
    d._menuOwner = owner;
    const stale = d.openMenu;
    d.openMenu = { ...OPEN, command: 'pasteAll' };
    dismissRibbonMenu(d, stale, grid);
    expect(d.openMenu?.command).toBe('pasteAll');
    expect(d.invalidations).toBe(0);
  });

  it('does nothing when no popup is open', () => {
    const { grid } = layout();
    const d = host();
    d.openMenu = null;
    dismissRibbonMenu(d, null, grid);
    expect(d.openMenu).toBeNull();
    expect(d.invalidations).toBe(0);
  });
});
