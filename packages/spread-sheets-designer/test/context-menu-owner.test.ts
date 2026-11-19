import { describe, expect, it } from 'vitest';
import { takeContextMenu } from '../src/context-menu-owner.js';

describe('Designer context menu ownership', () => {
  it('suppresses the workbook menu and restores its handler on release', () => {
    const original = (): boolean => false;
    const menu = { onOpenMenu: original };
    const release = takeContextMenu(menu);
    expect(menu.onOpenMenu()).toBe(true);
    release();
    expect(menu.onOpenMenu).toBe(original);
  });
  it('does not overwrite a handler installed after ownership was taken', () => {
    const menu = { onOpenMenu: (): boolean => false };
    const release = takeContextMenu(menu);
    const replacement = (): boolean => false;
    menu.onOpenMenu = replacement;
    release();
    expect(menu.onOpenMenu).toBe(replacement);
  });
});
