/**
 * Context-menu placement rules (TASK 9), derived from black-box observation of the
 * official designer: the menu opens at the pointer; when it does not fit on the right
 * it flips to the left so that its right edge ends a fixed offset past the pointer
 * (and is then kept inside the window); when it does not fit below it flips above the
 * pointer, and the flipped top is clamped to the grid-host top so tall menus are
 * never clipped (they always stay fully visible). Submenus follow the same rules
 * relative to their anchor item.
 */

export interface PlacementBounds {
  /** Viewport width. */
  innerWidth: number;
  /** Viewport height. */
  innerHeight: number;
  /** Smallest allowed top (top of the grid host). */
  minTop: number;
}

/** In the official menu the flipped menu's right edge sits this many px right of the pointer. */
export const FLIP_RIGHT_OFFSET = 51;

/** The official keeps this many px of the window bottom free when clamping a tall menu up. */
export const BOTTOM_RESERVE = 22;

/** Top-left corner for a menu opened at (pointerX, pointerY) with size (width, height). */
export function placeMenu(pointerX: number, pointerY: number, width: number, height: number, bounds: PlacementBounds): { left: number; top: number } {
  let left = pointerX;
  if (pointerX + width > bounds.innerWidth) {
    // Flip left: right edge = pointerX + FLIP_RIGHT_OFFSET, but never outside the window.
    left = Math.min(pointerX - width + FLIP_RIGHT_OFFSET, bounds.innerWidth - width);
  }
  left = Math.max(0, left);
  // Bottom overflow (measured live, TASK 51): the official flips the menu above the pointer
  // (bottom edge at the pointer, e.g. the sheet-tab menu at pointer y=770 -> top 508); when even
  // the flipped top would rise above the grid host it pins the bottom edge to
  // (viewport height - 22) instead, so the menu is never clipped and never covers the ribbon.
  let top = pointerY;
  if (pointerY + height > bounds.innerHeight - BOTTOM_RESERVE) top = pointerY - height;
  if (top < bounds.minTop) top = bounds.innerHeight - BOTTOM_RESERVE - height;
  if (top < bounds.minTop) top = bounds.minTop;
  return { left, top };
}

/**
 * Placement for a submenu anchored to an item: `itemRight`/`itemTop` are the anchor
 * item's bounding-box right and top. The submenu opens to the right of the item,
 * aligned with its top, flipping left / shifting up exactly like a main menu.
 */
export function placeSubmenu(itemRight: number, itemTop: number, width: number, height: number, bounds: PlacementBounds): { flipLeft: boolean; top: number } {
  const flipLeft = itemRight + width > bounds.innerWidth;
  let top = itemTop;
  if (itemTop + height > bounds.innerHeight) top = bounds.innerHeight - height;
  if (top < bounds.minTop) top = bounds.minTop;
  return { flipLeft, top };
}
