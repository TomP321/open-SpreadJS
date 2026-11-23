/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { registerBuiltinTemplates, FORMAT_CELLS_TEMPLATE, FIND_REPLACE_TEMPLATE } from '../src/dialogs/templates.js';
import { getTemplate } from '../src/designer.js';
import { resolveText } from '../src/resolve.js';
import { englishResources } from '../src/resources.js';

// TASK 87: titles/buttons are `${res.*}` placeholders resolved against the designer
// resources at render time; the English rendering (the default resources) must stay
// exactly the trial's strings, so assertions run the resolver before comparing.
const r = (value: unknown): string => resolveText(value, englishResources);

describe('dialog templates', () => {
  it('registers Format Cells with the required tabs', () => {
    registerBuiltinTemplates({} as never);
    const template = getTemplate(FORMAT_CELLS_TEMPLATE);
    expect(template).toBeTruthy();
    expect(r(template?.title)).toBe('Format Cells');
    const tabs = (template?.content[0] as any).items as { text: string }[];
    expect(tabs.map((t) => r(t.text))).toEqual([
      'Number', 'Alignment', 'Font', 'Border', 'Fill', 'Protection', 'Cell Button', 'Padding', 'Decoration', 'Mask',
    ]);
  });

  it('registers Find and Replace with bindings and action buttons', () => {
    registerBuiltinTemplates({} as never);
    const template = getTemplate(FIND_REPLACE_TEMPLATE);
    expect(r(template?.title)).toBe('Find and Replace');
    expect(template?.buttons?.map((b) => r(b.text))).toEqual(['Replace All', 'Replace', 'Find All', 'Find Next', 'Close']);
    // Tab-aware footer (trial-measured): Replace/Replace All appear only on the Replace tab
    // (leftmost, in that order); Find Next stays the primary button on both tabs.
    expect(template?.buttons?.[0]).toMatchObject({ visibleWhen: 'replace' });
    expect(r(template?.buttons?.[0]?.text)).toBe('Replace All');
    expect(template?.buttons?.[1]).toMatchObject({ visibleWhen: 'replace' });
    expect(r(template?.buttons?.[1]?.text)).toBe('Replace');
    expect(template?.buttons?.[3]).toMatchObject({ primaryWhenTab: ['find', 'replace'] });
    expect(r(template?.buttons?.[3]?.text)).toBe('Find Next');
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
    const clear = getTemplate('sheetTagDialog')?.buttons?.find((button) => r(button.text) === 'Clear');
    clear?.click?.({ designer: { getWorkbook: () => ({ getActiveSheet: () => ({ tag }) }), closeDialog } } as any);
    expect(tag).toHaveBeenCalledWith(null);
    expect(closeDialog).toHaveBeenCalledWith('sheetTagDialog', false);
  });
});
