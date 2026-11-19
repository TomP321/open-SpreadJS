import { describe, expect, it } from 'vitest';
import { buildPaletteGroups, PALETTE_GROUPS, type PaletteItem } from '../src/command-palette.js';

const item = (name: string, title = name): PaletteItem => ({ name, title });

describe('Command Palette grouping', () => {
  it('shows the recent and the suggested group while the box is empty', () => {
    const groups = buildPaletteGroups('', [], [item('copy')], [item('pasteAll'), item('insertChart')]);
    expect(groups.map((group) => group.label)).toEqual([PALETTE_GROUPS.recent, PALETTE_GROUPS.suggested]);
    expect(groups[1].items.map((entry) => entry.name)).toEqual(['pasteAll', 'insertChart']);
    expect(buildPaletteGroups('', [], [], [])).toHaveLength(0);
    expect(buildPaletteGroups('   ', [], [item('copy')], []).map((group) => group.label)).toEqual([PALETTE_GROUPS.recent]);
  });
  it('splits matches into best action and actions, then offers to find the typed text', () => {
    const groups = buildPaletteGroups('protect', [item('protectSheet', 'Protect Sheet...'), item('unprotectSheet', 'Unprotect Sheet...')], [], []);
    expect(groups.map((group) => group.label)).toEqual([PALETTE_GROUPS.best, PALETTE_GROUPS.rest, PALETTE_GROUPS.find]);
    expect(groups[0].items[0]?.title).toBe('Protect Sheet...');
    expect(groups[1].items[0]?.title).toBe('Unprotect Sheet...');
    expect(groups[2].items[0]).toEqual({ name: 'find', title: 'Find With "protect"', findText: 'protect' });
  });
  it('keeps the find entry when nothing matches and the actions group with a single match', () => {
    expect(buildPaletteGroups('zzz', [], [], []).map((group) => group.label)).toEqual([PALETTE_GROUPS.find]);
    expect(buildPaletteGroups('copy', [item('copy', 'Copy')], [], []).map((group) => group.label)).toEqual([PALETTE_GROUPS.best, PALETTE_GROUPS.find]);
  });
});
