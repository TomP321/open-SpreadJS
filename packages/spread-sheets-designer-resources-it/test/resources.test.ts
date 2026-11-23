/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { englishResources, getResources } from '@mescius/spread-sheets-designer';
import { italianResources, resources } from '../src/index.js';

type Tree = Record<string, unknown>;

/** Every leaf path of a nested string tree (`a.b.c` for each string value). */
function leafPaths(tree: Tree, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) out.push(...leafPaths(value as Tree, path));
    else out.push(path);
  }
  return out;
}

function leafAt(tree: Tree, path: string): unknown {
  let current: unknown = tree;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Tree)[part];
  }
  return current;
}

/**
 * Leaf paths whose value may legitimately equal the English one: proper and
 * product names (File, Home, OpenSheets Designer, Calibri) and formula function
 * names kept by the Italian Excel (Max, Min, Radar, Sparkline, Zoom, OK).
 */
const allowedSameAsEnglish = new Set([
  // Product / app names and internal identifiers.
  'title', 'ok', 'backstage.infoText',
  // Commands whose IT Excel caption is the English word (File, Home, Max, Min, Zoom, ...).
  'ribbon.home.file', 'ribbon.home.home', 'ribbon.home.max', 'ribbon.home.min',
  'ribbon.commands.fileMenuPanel', 'ribbon.commands.formulaBarPanel',
  'ribbon.commands.zoom', 'ribbon.commands.zoomDefault', 'ribbon.commands.paperA3', 'ribbon.commands.paperA4',
  // Placeholder-only templates (`${res.…}` / `{slot}`) stay byte-identical by design.
  'dialogs.sample2', 'dialogs.buttonCaption', 'dialogs.formulaPrefix',
  // TASK 86 parity: the trial labels its ribbon group dialog-launchers with the RAW command
  // keys (aria-label 'indicatorFonts'…) in EVERY language — verified on the official IT page —
  // so these values are internal identifiers, not translatable captions.
  'ribbon.indicatorLabels.indicatorFonts', 'ribbon.indicatorLabels.indicatorAlignment',
  'ribbon.indicatorLabels.indicatorNumbers', 'ribbon.indicatorLabels.indicatorPage',
  'ribbon.indicatorLabels.indicatorSheet', 'ribbon.indicatorLabels.indicatorOutline',
  // Sparkline / chart words the Italian Excel keeps identical.
  'ribbon.sparkLineDesign.design', 'ribbon.formulaSparklineDesign.design', 'dialogs.sparkline',
  'ribbon.insert.chartGroups.radarChartGroup', 'ribbon.insert.chartTypes.radarChart', 'dialogs.radar',
  'ribbon.insert.chartTypes.areaChart', 'dialogs.area',
  // Function / formula names kept by the Italian Excel (SUM-style tokens).
  'dialogs.max', 'dialogs.min', 'dialogs.var', 'dialogs.formula', 'dialogs.formula2', 'dialogs.formula3',
  // Font samples and names, Tag/Rich text terms used as-is by the Italian UI.
  'dialogs.a', 'dialogs.aaBbCcYyZz', 'dialogs.calibri', 'dialogs.arial', 'dialogs.tahoma', 'dialogs.timesNewRoman', 'dialogs.verdana',
  'dialogs.tag', 'dialogs.hex', 'dialogs.oK', 'dialogs.zoom', 'dialogs.layout',
  'dialogs.password', // the Italian Excel keeps the loanword "Password" verbatim
  'contextMenu.tag', // 'Tag' is the loanword the Italian UI uses
  // Paper sizes and reference styles printed verbatim in Italy, function category names.
  'ribbon.papers.a3', 'ribbon.papers.a4', 'ribbon.papers.a5', 'ribbon.papers.tabloid',
  'settings.a1', 'settings.r1C1', 'ribbon.functionCategories.web', 'ribbon.functionCategories.database',
  'ribbon.cellStyles.input', 'ribbon.cellStyles.output', 'ribbon.shapes.chevron',
  'ribbon.groups.layout', 'ribbon.groups.zoom',
  'statusBar.zoom',
]);

const en: Tree = { ...englishResources };
const itTree: Tree = { ...italianResources };

describe('Italian resources package', () => {
  it('exports the same object as resources / italianResources', () => {
    expect(resources).toBe(italianResources);
  });
  it('has EXACTLY the same key tree as englishResources (no missing, no extra keys)', () => {
    const enPaths = leafPaths(en).sort();
    const itPaths = leafPaths(itTree).sort();
    expect(itPaths.filter((path) => !enPaths.includes(path))).toEqual([]);
    expect(enPaths.filter((path) => !itPaths.includes(path))).toEqual([]);
    expect(itPaths.length).toBeGreaterThan(400);
  });
  it('every English leaf is a non-empty string in Italian too', () => {
    for (const path of leafPaths(en)) {
      const value = leafAt(itTree, path);
      expect(typeof value, `ribbon path ${path}`).toBe('string');
      expect((value as string).trim(), `ribbon path ${path}`).not.toBe('');
    }
  });
  it('keeps every `${...}` placeholder of the English template strings', () => {
    for (const path of leafPaths(en)) {
      const english = String(leafAt(en, path));
      const italian = String(leafAt(itTree, path));
      const placeholders = (value: string): string[] => value.match(/\$\{[^}]*\}|\{[^}]*\}/g) ?? [];
      expect(placeholders(italian), `placeholders of ${path}`).toEqual(placeholders(english));
    }
  });
  it('translates every value (nothing left in English except proper/product/function names)', () => {
    const offenders: string[] = [];
    for (const path of leafPaths(en)) {
      const english = String(leafAt(en, path));
      const italian = String(leafAt(itTree, path));
      if (english === italian && !allowedSameAsEnglish.has(path)) offenders.push(`${path}: ${english}`);
    }
    expect(offenders).toEqual([]);
  });
  it('shows the expected Italian Excel terminology', () => {
    expect((itTree as any).ribbon).toBeTruthy();
    const ribbon = (itTree as any).ribbon.home;
    expect(ribbon.bold).toBe('Grassetto');
    expect(ribbon.paste).toBe('Incolla');
    expect(ribbon.conditionFormat).toBe('Formattazione condizionale');
    expect(ribbon.formatPainter).toBe('Copia formato');
    expect((itTree as any).ribbon.home.pageLayout).toBe('Layout di pagina');
    expect((itTree as any).formatDialog.title).toBe('Formato celle');
    expect((itTree as any).findDialog.title).toBe('Trova e sostituisci');
    expect((itTree as any).statusBar.ready).toBe('Pronto');
  });
  it('registers itself with the designer resource store', () => {
    expect((getResources() as any).ribbon.home.bold).toBe('Grassetto');
    expect((getResources() as any).statusBar.ready).toBe('Pronto');
  });
});
