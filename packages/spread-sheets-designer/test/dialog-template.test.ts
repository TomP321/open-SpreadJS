/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { registerBuiltinTemplates, FORMAT_CELLS_TEMPLATE, FIND_REPLACE_TEMPLATE } from '../src/dialogs/templates.js';
import { getTemplate } from '../src/designer.js';

describe('dialog templates', () => {
  it('registers Format Cells with the required tabs', () => {
    registerBuiltinTemplates({} as never);
    const template = getTemplate(FORMAT_CELLS_TEMPLATE);
    expect(template).toBeTruthy();
    expect(template?.title).toBe('Format Cells');
    const tabs = (template?.content[0] as any).items as { text: string }[];
    expect(tabs.map((t) => t.text)).toEqual([
      'Number', 'Alignment', 'Font', 'Border', 'Fill', 'Protection', 'Cell Button', 'Padding', 'Decoration', 'Mask',
    ]);
  });

  it('registers Find and Replace with bindings and action buttons', () => {
    registerBuiltinTemplates({} as never);
    const template = getTemplate(FIND_REPLACE_TEMPLATE);
    expect(template?.title).toBe('Find and Replace');
    expect(template?.buttons?.map((b) => b.text)).toEqual(['Replace All', 'Replace', 'Find All', 'Find Next', 'Close']);
    // Tab-aware footer (trial-measured): Replace/Replace All appear only on the Replace tab
    // (leftmost, in that order); Find Next stays the primary button on both tabs.
    expect(template?.buttons?.[0]).toMatchObject({ text: 'Replace All', visibleWhen: 'replace' });
    expect(template?.buttons?.[1]).toMatchObject({ text: 'Replace', visibleWhen: 'replace' });
    expect(template?.buttons?.[3]).toMatchObject({ text: 'Find Next', primaryWhenTab: ['find', 'replace'] });
    const serialized = JSON.stringify(template);
    expect(serialized).toContain('searchText');
    expect(serialized).toContain('replaceText');
  });

  it('returns null for an unknown template', () => {
    expect(getTemplate('does-not-exist')).toBeNull();
  });

  it('clears a sheet tag and closes its dialog', () => {
    registerBuiltinTemplates({} as never);
    const tag = vi.fn();
    const closeDialog = vi.fn();
    const clear = getTemplate('sheetTagDialog')?.buttons?.find((button) => button.text === 'Clear');
    clear?.click?.({ designer: { getWorkbook: () => ({ getActiveSheet: () => ({ tag }) }), closeDialog } } as any);
    expect(tag).toHaveBeenCalledWith(null);
    expect(closeDialog).toHaveBeenCalledWith('sheetTagDialog', false);
  });
});
