import { describe, expect, it } from 'vitest';
import { DefaultConfig, ToolBarModeConfig, resolveRibbon } from '../src/config.js';
import { mergeConfig, deepClone } from '../src/config-merge.js';

describe('designer config', () => {
  it('exposes the documented main tabs in order', () => {
    const { panels, contextualPanels } = resolveRibbon(DefaultConfig);
    expect(panels.map((p) => p.id)).toEqual(['home', 'insert', 'pageLayout', 'formulas', 'data', 'review', 'view', 'settings']);
    expect(panels[0].buttonGroups.map((g) => g.label)).toEqual([
      'Undo', 'Clipboard', 'Font', 'Alignment', 'Number', 'Styles', 'Cells', 'Editing',
    ]);
    // Contextual tabs are kept out of the main list and marked as such.
    // TASK 74: the trial's contextual ribbon (its DefaultConfig order): Table Design,
    // Shape Format (id `shapeDesign`), Chart Design, the two Sparkline tabs, then the
    // PivotTable pair (TASK 47).
    expect(contextualPanels.map((p) => p.id)).toEqual([
      'tableDesign', 'shapeDesign', 'chartDesign', 'formulaSparkLineDesign', 'sparkLineDesign',
      'pivotTableAnalyze', 'pivotTableDesign',
    ]);
    expect(contextualPanels.map((p) => p.text)).toEqual([
      'Table Design', 'Shape Format', 'Chart Design', 'Sparkline', 'Sparkline',
      'PivotTable Analyze', 'Design', // the pivot pair keeps the texts measured in TASK 47
    ]);
    expect(contextualPanels.every((p) => p.contextual)).toBe(true);
    expect(contextualPanels[0].buttonGroups.map((g) => g.label)).toEqual([
      'Properties', 'Tools', 'Table Style Options', 'Table Styles', 'Table Binding',
    ]);
    expect(contextualPanels[1].buttonGroups.map((g) => g.label)).toEqual([
      'Insert Shapes', 'Shape Styles', 'Accessibility', 'Rotate', 'Group', 'Align', 'Arrange', 'Size', 'Selection Pane', 'Format Pane',
    ]);
    expect(contextualPanels[2].buttonGroups.map((g) => g.label)).toEqual([
      'Chart Layouts', 'Chart Styles', 'Data', 'Type', 'Location', 'Accessibility', 'Format Pane',
    ]);
    expect(contextualPanels[3].buttonGroups.map((g) => g.label)).toEqual(['Argument']);
    expect(contextualPanels[4].buttonGroups.map((g) => g.label)).toEqual(['Type', 'Show', 'Style', 'Group']);
  });

  it('keeps the Home command structure the same shape as the trial', () => {
    const home = resolveRibbon(DefaultConfig).panels[0];
    const names: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') { names.push(node); return; }
      if (!node || typeof node !== 'object') return;
      const group = node as { command?: unknown; children?: unknown[]; commands?: unknown[] };
      if (typeof group.command === 'string') names.push(group.command);
      for (const child of group.children ?? []) walk(child);
      for (const child of group.commands ?? []) walk(child);
    };
    for (const group of home.buttonGroups) walk(group.commandGroup);
    for (const name of ['pasteAll', 'fontFamily', 'fontWeight', 'leftAlign', 'ribbonNumberFormat', 'formatPercentage', 'conditionFormat', 'formatTable2', 'cellStyles', 'cellsInsert', 'editingAutoSum', 'editingFind']) {
      expect(names).toContain(name);
    }
  });

  it('merges partial configs into defaults without sharing mutable objects', () => {
    const base = deepClone(DefaultConfig);
    const customCommand = { commandName: 'custom', title: 'Custom', execute: () => undefined };
    const merged = mergeConfig(base, {
      commandMap: { custom: customCommand },
      ribbon: [{ id: 'home', text: 'Home', buttonGroups: [] }],
    });
    expect(merged.commandMap?.custom).toBeTruthy();
    expect(merged.commandMap?.fontFamily).toBeTruthy();
    expect(resolveRibbon(merged).panels.map((p) => p.id)).toEqual(['home']);
    expect(merged.commandMap?.custom).not.toBe(customCommand);
    expect(base.commandMap?.custom).toBeUndefined();
  });

  it('provides a toolbar config with a 50px ribbon and five Home groups', () => {
    const ribbon = ToolBarModeConfig.ribbon as { panels: unknown[]; ribbonHeight: number };
    expect(ribbon.ribbonHeight).toBe(50);
    expect((ribbon.panels[0] as { buttonGroups: unknown[] }).buttonGroups).toHaveLength(5);
  });
});
