/* Dismissal rule shared by every ribbon dropdown (TASK 60 item 1).

   Measured against the trial (1280x720, official LEFT):
   - a press on the sheet grid while a group popup is open closes the popup AND still selects
     the cell (the press is not swallowed);
   - a press on another ribbon control closes the current popup and lets that control open its own;
   - a press on the control that owns the open popup toggles it CLOSED (the trial does not re-open it);
   - presses inside the open popup (including its flyouts) keep it open.

   The rule must run on `pointerdown` in the CAPTURE phase: our grid cancels its pointerdown, which
   suppresses the compatibility `mousedown`, so a mousedown listener never sees presses on cells
   (the same reason the context menu uses a capture-phase pointerdown). */
import type { RibbonMenuState } from '../designer-api.js';

/** The part of the designer state the dismissal rule needs. */
export interface MenuDismissalHost {
  openMenu: RibbonMenuState | null;
  /** Control whose press opened `openMenu` (null when the menu was opened programmatically). */
  _menuOwner: HTMLElement | null;
  /** Left behind for the open path so the click that follows a toggle press does not re-open. */
  _menuToggleClosedByPress: boolean;
  invalidate(): void;
}

export function dismissRibbonMenu(d: MenuDismissalHost, menu: RibbonMenuState | null, target: HTMLElement | null): void {
  if (!menu || d.openMenu !== menu) return;
  if (target?.closest('.gc-designer-ribbon-dropdown')) {
    d._menuToggleClosedByPress = false;
    return;
  }
  const owner = d._menuOwner;
  d._menuToggleClosedByPress = !!(owner && target && owner.contains(target));
  d.openMenu = null;
  d.invalidate();
}
