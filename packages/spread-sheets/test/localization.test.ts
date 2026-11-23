// @vitest-environment jsdom
/**
 * TASK 88 item 2: the culture-switched core UI string table.
 * English is the built-in default (every call site carries its English text);
 * a registered language object switches the strings the core paints. Here the
 * built-in `it-it` table drives the checks, plus a hand-made culture to show
 * that the mechanism is the public `CultureManager.addCultureInfo(name,
 * culture, language)` model.
 */
import { afterEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { ltext } from '../src/localization.js';
import { filterMenu } from '../src/features/filter-menu.js';
import { menuText } from '../src/features/context-menu.js';
import { SLICER_BLANK_TEXT, slicerBlankLabel } from '../src/features/slicers/types.js';
import { timelineBuckets } from '../src/features/slicers/timeline-view.js';
import { ThreadedCommentPanel } from '../src/features/threaded-comment-panel.js';

const { Workbook, Range } = GC.Spread.Sheets;
const SS = GC.Spread.Sheets;
const { CultureInfo, CultureManager } = GC.Spread.Common;

(globalThis as Record<string, unknown>).CanvasRenderingContext2D ??= class {};
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value() {
    return new Proxy({}, {
      get: (t, k: string) => {
        if (k in t) return (t as Record<string, unknown>)[k];
        if (k === 'measureText') return (s: unknown) => ({ width: String(s).length * 6 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
        return (...a: unknown[]) => void a;
      },
      set: (t, k: string, v) => { (t as Record<string, unknown>)[k] = v; return true; },
    });
  },
  configurable: true,
});

afterEach(() => {
  CultureManager.culture('en-us');
});

describe('resource lookup', () => {
  it('falls back to the English text the call site carries', () => {
    expect(CultureManager.culture().toLowerCase()).toBe('en-us');
    expect(CultureManager.getResources('en-US')).toEqual({});
    expect(ltext('contextMenu.gc.spread.copy', 'Copy')).toBe('Copy');
    expect(ltext('filter.clearFilterFrom', 'Clear Filter From "{0}"', 'Name')).toBe('Clear Filter From "Name"');
    expect(ltext('unknown.path', 'Fallback')).toBe('Fallback');
  });

  it('walks the registered language object (dotted keys and nesting)', () => {
    const culture = new CultureInfo();
    culture._setName('xx-XX');
    CultureManager.addCultureInfo('xx-xx', culture, {
      contextMenu: { 'gc.spread.copy': 'Zopy' },
      filter: { custom: { and: 'E' } },
    });
    CultureManager.culture('xx-xx');
    expect(ltext('contextMenu.gc.spread.copy', 'Copy')).toBe('Zopy');
    expect(ltext('CONTEXTMENU.GC.SPREAD.COPY', 'Copy')).toBe('Zopy');
    expect(ltext('filter.custom.and', 'And')).toBe('E');
    // Uncovered keys keep their English text, so a partial table is usable.
    expect(ltext('filter.custom.or', 'Or')).toBe('Or');
    expect(ltext('contextMenu.gc.spread.cut', 'Cut')).toBe('Cut');
  });

  it('switches at runtime when the culture changes', () => {
    expect(ltext('contextMenu.gc.spread.copy', 'Copy')).toBe('Copy');
    CultureManager.culture('it-it');
    expect(ltext('contextMenu.gc.spread.copy', 'Copy')).toBe('Copia');
    CultureManager.culture('en-us');
    expect(ltext('contextMenu.gc.spread.copy', 'Copy')).toBe('Copy');
  });

  it('picks up a language object registered after its culture is already current', () => {
    // The load order a page can really have: workbook first, resources package later.
    const culture = new CultureInfo();
    culture._setName('xx-YY');
    CultureManager.addCultureInfo('xx-yy', culture);
    CultureManager.culture('xx-yy');
    expect(ltext('filter.search', 'Search')).toBe('Search');
    CultureManager.addCultureInfo('xx-yy', culture, { filter: { search: 'Suche' } });
    expect(ltext('filter.search', 'Search')).toBe('Suche');
  });
});

describe('it-it core resource table', () => {
  it('is registered as the it-it language object with the core namespaces', () => {
    const resources = CultureManager.getResources('it-it') as Record<string, Record<string, unknown>>;
    expect(Object.keys(resources)).toEqual(expect.arrayContaining([
      'contextMenu', 'filter', 'comments', 'pivotPanel', 'pivotMenu', 'tablePanel', 'scenarios', 'controls', 'status', 'sheets', 'slicer', 'dataChart',
    ]));
    expect(resources.contextMenu![Object.keys(resources.contextMenu!).find(k => k.toLowerCase() === 'gc.spread.copy')!]).toBe('Copia');
  });

  it('localizes the cell/row/column/tab context menus', () => {
    const wb = new Workbook();
    const findByKey = (items: { name?: string; subMenu?: unknown[] }[], wanted: string): { name?: string } | undefined => {
      for (const entry of items) {
        if (entry.name === wanted) return entry;
        const nested = entry.subMenu ? findByKey(entry.subMenu as { name?: string; subMenu?: unknown[] }[], wanted) : undefined;
        if (nested) return nested;
      }
      return undefined;
    };
    const item = (wanted: string): string => menuText(findByKey(wb.contextMenu.menuData as { name?: string; subMenu?: unknown[] }[], wanted)!);
    expect(item('gc.spread.copy')).toBe('Copy');
    expect(item('gc.spread.deleteRows')).toBe('Delete');
    CultureManager.culture('it-it');
    expect(item('gc.spread.copy')).toBe('Copia');
    expect(item('gc.spread.cut')).toBe('Taglia');
    expect(item('gc.spread.pasteOptions')).toBe('Opzioni di incollaggio:');
    expect(item('gc.spread.hideRows')).toBe('Nascondi');
    expect(item('gc.spread.startEditSheetName')).toBe('Rinomina');
    expect(item('gc.spread.insertThreadedComment')).toBe('Nuovo commento con thread');
    expect(item('gc.spread.sortAscend')).toBe('Ordina dalla A alla Z');
    expect(item('gc.spread.pivotremoveField')).toBe('Rimuovi {0}');
    expect(item('gc.spread.pivotpivotShowSubtotal')).toBe('Totale parziale {0}');
    // The data itself stays English: menus are localized when they are built,
    // so the same workbook serves both cultures and custom text survives.
    expect(wb.contextMenu.menuData.find(data => data.name === 'gc.spread.copy')!.text).toBe('Copy');
  });

  it('renders localized menu items and keeps author-customized captions', () => {
    const wb = new Workbook();
    wb.contextMenu.menuData.push({ name: 'demo.custom', text: 'Author caption' });
    const view = wb.contextMenu.menuView;
    expect(view.createMenuItemElement({ name: 'gc.spread.copy', text: 'Copy' }).textContent).toContain('Copy');
    CultureManager.culture('it-it');
    expect(view.createMenuItemElement({ name: 'gc.spread.copy', text: 'Copy' }).textContent).toContain('Copia');
    expect(view.createMenuItemElement({ name: 'demo.custom', text: 'Author caption' }).textContent).toContain('Author caption');
    // A built-in item whose text was replaced keeps the replacement (the trial
    // language pack never overrides a menu customization either).
    expect(view.createMenuItemElement({ name: 'gc.spread.copy', text: 'My copy' }).textContent).toContain('My copy');
  });

  it('localizes the filter popup (sort rows, clear row, value filters, checklist, dialog)', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [['Name'], ['Gamma'], ['alpha'], ['Beta']]);
    const filter = new SS.Filter.HideRowFilter(new Range(1, 0, 3, 1));
    sheet.rowFilter(filter);
    const build = (label: string): { root: HTMLElement; mounted: HTMLElement[] } => {
      const mounted: HTMLElement[] = [];
      const root = filterMenu(sheet, filter, 0, label, () => undefined, element => mounted.push(element));
      document.body.append(root);
      return { root, mounted };
    };
    const english = build('Name');
    expect(english.root.getAttribute('aria-label')).toBe('Filter Name');
    expect([...english.root.querySelectorAll<HTMLButtonElement>('button.opensheets-filter-command')].map(b => b.textContent)).toContain('Sort Ascending');

    CultureManager.culture('it-it');
    const { root, mounted } = build('Nome');
    const captions = [...root.querySelectorAll<HTMLButtonElement>('button.opensheets-filter-command')].map(b => b.textContent);
    expect(captions).toContain('Ordina in modo crescente');
    expect(captions).toContain('Ordina in modo decrescente');
    expect(captions).toContain('Cancella filtro da "Nome"');
    expect(captions).toContain('Filtri testo');
    expect(captions).toContain('Ordina per colore');
    expect(captions).toContain('Filtra per colore');
    expect(root.getAttribute('aria-label')).toBe('Filtro Nome');
    expect(root.querySelector<HTMLInputElement>('input.opensheets-filter-search')!.placeholder).toBe('Cerca');
    expect([...root.querySelectorAll('button')].map(b => b.textContent)).toEqual(expect.arrayContaining(['Seleziona tutto', 'Deseleziona tutto', 'OK', 'Annulla']));
    const valueMenu = [...root.querySelectorAll<HTMLElement>('.opensheets-filter-submenu')]
      .map(menu => [...menu.querySelectorAll<HTMLElement>('[role=menuitem]')].map(e => e.textContent))
      .find(labels => labels.includes('Uguale a...'));
    expect(valueMenu).toBeTruthy();
    expect(valueMenu).toContain('Non contiene...');
    expect(valueMenu).toContain('Filtro personalizzato...');
    // Choosing a value filter opens the custom dialog in Italian too.
    const entry = [...root.querySelectorAll<HTMLElement>('.opensheets-filter-submenu [role=menuitem]')].find(e => e.textContent === 'Uguale a...')!;
    entry.click();
    expect(mounted.length).toBe(1);
    expect(mounted[0].textContent).toContain('Filtro automatico personalizzato');
    expect(mounted[0].textContent).toContain('Mostra righe in cui:');
    expect(mounted[0].querySelector<HTMLSelectElement>('select')!.selectedOptions[0]!.textContent).toBe('uguale a');
    expect(mounted[0].textContent).toContain('Usa ? per rappresentare un singolo carattere');
    root.remove();
    english.root.remove();
  });

  it('localizes the status bar captions and keeps the item values', () => {
    const host = document.createElement('div');
    const wb = new Workbook(host, { sheetCount: 1 });
    const bar = new SS.StatusBar.StatusBar(host);
    bar.bind(wb);
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[2], [4], ['x']]);
    sheet.setSelection(0, 0, 3, 1);
    bar.update();
    expect(host.textContent).toContain('Sum: 6');
    expect(bar.get('cellMode')!.value).toBe('Ready');
    CultureManager.culture('it-it');
    bar.update();
    expect(host.textContent).toContain('Somma: 6');
    expect(host.textContent).toContain('Conteggio: 3');
    expect(host.textContent).toContain('Pronto');
    expect(bar.get('cellMode')!.value).toBe('Ready');
    bar.dispose();
    wb.destroy();
  });

  it('localizes the threaded comment panel (chrome follows the culture it was built under)', () => {
    const wb = new Workbook();
    const build = (): { host: HTMLElement; panel: ThreadedCommentPanel } => {
      const host = document.createElement('div');
      return { host, panel: new ThreadedCommentPanel(host, wb) };
    };
    const english = build();
    expect(english.host.textContent).toContain('Threaded Comments');
    expect(english.host.textContent).toContain('See more comments');
    // TASK 95 probe (.probe/t95/out/panel.json): the trial region root carries
    // the panel TITLE as its aria-label ("Threaded Comments").
    expect(english.host.querySelector<HTMLElement>('[role=region]')!.getAttribute('aria-label')).toBe('Threaded Comments');
    CultureManager.culture('it-it');
    const italian = build();
    expect(italian.host.textContent).toContain('Commenti con thread');
    expect(italian.host.textContent).toContain('Vedi altri commenti');
    expect(italian.host.querySelector<HTMLElement>('.opensheets-tc-new')!.textContent).toContain('Nuovo');
    expect(italian.host.querySelector<HTMLElement>('[role=region]')!.getAttribute('aria-label')).toBe('Commenti con thread');
    // The dynamic parts re-render in the current culture.
    italian.panel.refresh();
    expect(italian.host.textContent).toContain('0 commenti');
    italian.panel.destroy();
    english.panel.destroy();
    wb.destroy();
  });

  it('localizes the slicer blank item label and the timeline level names', () => {
    expect(SLICER_BLANK_TEXT).toBe('(blank)');
    expect(slicerBlankLabel()).toBe('(blank)');
    const months = (times: number[]) => timelineBuckets(times, GC.Spread.Sheets.Slicers.TimelineLevel.months).map(b => b.label);
    const times = [new Date(2026, 0, 5).getTime(), new Date(2026, 10, 22).getTime()];
    // The month row follows the culture's abbreviated month names (en-US keeps JAN..DEC).
    expect(months(times)).toContain('JAN');
    expect(months(times)).not.toContain('GEN');
    CultureManager.culture('it-it');
    expect(slicerBlankLabel()).toBe('(Vuote)');
    expect(months(times)).toContain('GEN');
    expect(months(times)).toContain('NOV');
    expect(months(times)).not.toContain('JAN');
    expect(ltext('slicer.timeline.months', 'MONTHS')).toBe('MESI');
    expect(ltext('slicer.timeline.allPeriods', 'All Periods')).toBe('Tutti i periodi');
  });

  it('localizes the pivot panel, the TableSheet panel and the scenario panel strings', () => {
    expect(ltext('pivotPanel.title', 'PivotTable Fields')).toBe('PivotTable Fields');
    CultureManager.culture('it-it');
    expect(ltext('pivotPanel.title', 'PivotTable Fields')).toBe('Campi PivotTable');
    expect(ltext('pivotPanel.area.Rows', 'Rows')).toBe('Righe');
    expect(ltext('pivotMenu.selectField', 'Select field')).toBe('Seleziona campo');
    expect(ltext('pivotMenu.operator.greaterThanOrEqual', 'Greater Than Or Equal To')).toBe('Maggiore o uguale a');
    expect(ltext('tablePanel.dragGroups', 'Drag here to set row groups')).toBe('Trascinare qui per impostare i gruppi di riga');
    expect(ltext('tablePanel.addCalc', 'Add Calculated Column')).toBe('Aggiungi colonna calcolata');
    expect(ltext('scenarios.empty', 'No Scenarios defined.\nChoose Add to add scenarios')).toBe('Nessuno scenario definito.\nScegli Aggiungi per creare scenari');
    expect(ltext('comments.mentionReply', '@mention or reply')).toBe('@menzione o risposta');
    expect(ltext('controls.formulaBar', 'Formula bar')).toBe('Barra della formula');
    expect(ltext('sheets.activeSheet', 'Active Sheet:')).toBe('Foglio attivo:');
    expect(ltext('dataChart.chartType', 'Chart Type')).toBe('Tipo di grafico');
    expect(ltext('status.heightTip', 'Height: {0} pixels', 24)).toBe('Altezza: 24 pixel');
  });
});
