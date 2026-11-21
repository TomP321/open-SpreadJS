import { describe, expect, it } from 'vitest';
import { buildPaletteGroups, PALETTE_GROUPS, type PaletteItem } from '../src/command-palette.js';
import { builtinCommandSpecs } from '../src/commands/index.js';
import { englishResources } from '../src/resources.js';
import { searchDesignerCommands } from '../src/designer-state.js';

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

/* TASK 77 (paired probe `panels.spec` + `.probe/t77/run/t77-official-labels.json` on the running
 * trial): the Command Palette lists the protection commands with the RESOLVED resource text
 * ('Protect Sheet...', 'Unprotect Sheet...'). This runs the real registry through the real
 * resource table, exactly as the Designer does at runtime. */
describe('Command Palette titles resolve through the real resources (TASK 77)', () => {
  const designer = {
    getCommand: () => builtinCommandSpecs,
    resources: englishResources,
  } as never;
  it('resolves protectSheet/unprotectSheet to the trial palette texts', () => {
    const hits = searchDesignerCommands(designer, 'protect', 30);
    const byName = new Map(hits.map((h) => [h.name, h.title]));
    expect(byName.get('protectSheet')).toBe('Protect Sheet...');
    expect(byName.get('unprotectSheet')).toBe('Unprotect Sheet...');
    // Best-match order: the trial palette lists `Protect Sheet...` first for this query.
    expect(hits[0]?.title).toBe('Protect Sheet...');
    expect(hits.map((h) => h.title)).not.toContain('Protect Sheet');
  });
});
