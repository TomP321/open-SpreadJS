/*
 * TASK 9: context menu placement rules (main menus and submenus). The rules mirror the
 * official designer observed black-box: open at the pointer; flip left/up when the menu
 * would overflow; clamp the flipped top to the grid-host top so tall menus stay visible.
 */
import { describe, expect, it } from 'vitest';
import { FLIP_RIGHT_OFFSET, placeMenu, placeSubmenu } from '../src/menu-placement.js';

const bounds = { innerWidth: 1280, innerHeight: 720, minTop: 179 };

describe('placeMenu', () => {
  it('opens at the pointer when the menu fits below and right', () => {
    expect(placeMenu(300, 200, 248, 300, bounds)).toEqual({ left: 300, top: 200 });
  });

  it('flips above the pointer when the menu does not fit below', () => {
    // Tab menu at (125, 683) with h=262: bottom lands on the pointer (matches the trial).
    expect(placeMenu(125, 683, 190, 262, bounds)).toEqual({ left: 125, top: 421 });
  });

  it('clamps the flipped top to minTop so tall menus are never clipped (supervisor case)', () => {
    // Right-click I12 at (640, 428): the 522px cell menu does not fit above the pointer
    // either, so it clamps to the grid-host top (179) and the last item stays visible.
    const { top } = placeMenu(640, 428, 248, 522, bounds);
    expect(top).toBe(bounds.minTop);
    expect(top + 522).toBeLessThanOrEqual(bounds.innerHeight);
  });

  it('flips the menu left of the pointer when it does not fit on the right', () => {
    // Official: flipped menus keep their right edge FLIP_RIGHT_OFFSET past the pointer.
    expect(placeMenu(1100, 300, 248, 522, bounds).left).toBe(1100 - 248 + FLIP_RIGHT_OFFSET);
    expect(placeMenu(1032, 300, 248, 522, bounds).left).toBe(1032); // exactly fits: no flip
  });

  it('keeps a flipped menu inside the window', () => {
    expect(placeMenu(1260, 300, 248, 300, bounds).left).toBe(bounds.innerWidth - 248);
  });

  it('never returns a negative left', () => {
    expect(placeMenu(10, 300, 2000, 300, bounds).left).toBe(0);
  });
});

describe('placeSubmenu', () => {
  it('opens right of the item, aligned to its top, when it fits', () => {
    expect(placeSubmenu(381, 309, 199, 54, bounds)).toEqual({ flipLeft: false, top: 309 });
  });

  it('flips to the left of the item when the submenu does not fit on the right', () => {
    expect(placeSubmenu(1151, 413, 190, 80, bounds).flipLeft).toBe(true);
    expect(placeSubmenu(1000, 413, 190, 80, bounds).flipLeft).toBe(false);
  });

  it('shifts a submenu up so it fits, and clamps to minTop', () => {
    expect(placeSubmenu(381, 650, 190, 80, bounds).top).toBe(bounds.innerHeight - 80);
    // A submenu taller than the host (720-179=541) cannot be fully shifted up: clamp to the host top.
    expect(placeSubmenu(381, 690, 190, 600, bounds).top).toBe(bounds.minTop);
  });
});
