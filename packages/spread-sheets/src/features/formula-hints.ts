import { builtinNames } from '../calc/evaluate.js';
import type { Workbook } from '../model.js';

export function filterFormulaNames(names: string[], prefix: string): string[] {
  const upper = prefix.toUpperCase();
  return [...new Set(names.map(name => name.toUpperCase()))].filter(name => name.startsWith(upper)).sort();
}

// Names observed in the v19 autocomplete UI that are not calculation-engine registrations.
const additionalHintNames = `BOXPLOTSPARKLINE BULLETSPARKLINE CALCULATE CASCADESPARKLINE CHILDREN CUMEDIST DATEPART DBCS DENSERANK EURO FILTERJSON FIRSTVALUE FRAMEGROUPS FRAMERANGE FRAMEROWS GAUGEKPISPARKLINE HISTOGRAMSPARKLINE IMAGE LAG LASTVALUE LEAD LEVEL LEVELROWNUMBER LOLLIPOPVARISPARKLINE MONTHSPARKLINE NTHVALUE NTILE OBJECT ONLYCHILDREN ORDERASC ORDERBY ORDERDESC PARENT PARETOSPARKLINE PARTITIONBY PERCENTOF PHI PROGRESSSPARKLINE PROPERTY QUERY R.A R.CUMULATIVE R.CURRENTPAGE R.INDEX R.MOM R.PAGECOUNT R.PROPORTION R.R R.RANK R.V R.YOY RANGEBLOCKSPARKLINE REFRESH REGEXEXTRACT REGEXREPLACE REGEXTEST REMOVEFILTERS ROWNUMBER SCATTERSPARKLINE SJS.ENDWITH SJS.FISCALYEAR SJS.STARTWITH SJS.TABLE SJS.UUID SPREADSPARKLINE STACKEDSPARKLINE TRIMRANGE VARISPARKLINE WINDOW WINDOWDEF W_PERCENTRANK W_RANK YEARSPARKLINE`.split(' ');
const hiddenBuiltinHintNames = new Set(['DATESTRING', 'FORECAST.LINEAR', 'INFO', 'JIS', 'PHONETIC']);
export function builtinHintNames(): string[] {
  return [...builtinNames().filter(name => !hiddenBuiltinHintNames.has(name)), ...additionalHintNames];
}

const dynamicNames = new Set(['BYCOL', 'BYROW', 'CHOOSECOLS', 'CHOOSEROWS', 'DROP', 'EXPAND', 'FILTER', 'GROUPBY', 'HSTACK', 'MAKEARRAY', 'MAP', 'PIVOTBY', 'RANDARRAY', 'REDUCE', 'SCAN', 'SEQUENCE', 'SORT', 'SORTBY', 'TAKE', 'TEXTSPLIT', 'TOCOL', 'TOROW', 'UNIQUE', 'VSTACK', 'WRAPCOLS', 'WRAPROWS']);

const parameters: Record<string, string[]> = { SCATTERSPARKLINE: ['points1', '[points2]', '[minX]', '[maxX]', '[minY]', '[maxY]', '[hLine]', '[vLine]', '[xMinZone]', '[xMaxZone]', '[yMinZone]', '[yMaxZone]', '[tags]', '[drawSymbol]', '[drawLines]', '[color1]', '[color2]', '[dash]'], BOXPLOTSPARKLINE: ['points', 'boxPlotClass', '[showAverage]', '[scaleStart]', '[scaleEnd]', '[acceptableStart]', '[acceptableEnd]', '[colorScheme]', '[style]', '[vertical]'], SPREADSPARKLINE: ['points', '[showAverage]', '[scaleStart]', '[scaleEnd]', '[style]', '[colorScheme]', '[vertical]'], SUM: ['number1', '[number2]'], SUBSTITUTE: ['text', 'old_text', 'new_text', '[instance_num]'], SUBTOTAL: ['function_num', 'ref1', '[ref2]'], SUMIF: ['range', 'criteria', '[sum_range]'], SUMIFS: ['sum_range', 'criteria_range1', 'criteria1'], AVERAGE: ['number1', '[number2]'], IF: ['logical_test', 'value_if_true', '[value_if_false]'], VLOOKUP: ['lookup_value', 'table_array', 'col_index_num', '[range_lookup]'], COUNTIF: ['range', 'criteria'] };
const descriptions: Record<string, string> = { SCATTERSPARKLINE: 'Plots pairs of values as a compact scatter chart.', BOXPLOTSPARKLINE: 'Shows the distribution of values as a compact box plot.', SPREADSPARKLINE: 'Displays the distribution of values in a compact chart.', SUBSTITUTE: 'Replaces matching text with new text.', SUBTOTAL: 'Calculates a subtotal for a range.', SUM: 'Adds numbers together.', SUMIF: 'Adds values that meet a condition.', SUMIFS: 'Adds values that meet multiple conditions.' };

export interface HintDescription { name?: string; description?: string; parameters?: { name: string; optional?: boolean; repeatable?: boolean }[] }
export class FormulaHints {
  private panel?: HTMLElement;
  private names: string[] = [];
  private selected = 0;
  private start = 0;
  private end = 0;
  constructor(private wb: Workbook, private anchor: HTMLElement, private insert: (start: number, end: number, value: string) => void, private extra: () => HintDescription[] = () => []) {}
  close(): void { this.panel?.remove(); this.panel = undefined; this.names = []; }
  update(text: string, caret: number, autocomplete = true, help = true): void {
    this.close(); if (!text.startsWith('=')) return;
    const before = text.slice(0, caret), partial = /([A-Za-z_][A-Za-z0-9_.]*)$/.exec(before);
    const panel = document.createElement('div'); panel.className = 'opensheets-formula-hints';
    const rect = this.anchor.getBoundingClientRect(); Object.assign(panel.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.bottom}px`, zIndex: '1000', background: 'white', color: '#333', border: '1px solid rgba(0,0,0,.2)', font: '12px/22px Arial, sans-serif', boxShadow: '0 2px 4px #0003' });
    if (partial && autocomplete && !/^\$?[A-Za-z]{1,3}\$?\d+$/.test(partial[1])) {
      const sheet = this.wb.getActiveSheet();
      this.names = filterFormulaNames([...builtinHintNames().filter(name => this.wb.options.allowDynamicArray || !dynamicNames.has(name)), ...this.extra().flatMap(d => d.name ? [d.name] : []), ...this.wb._formulaFunctionNames(sheet), ...this.wb.getCustomNames().map(n => n.getName()), ...sheet.getCustomNames().map(n => n.getName())], partial[1]);
      if (!this.names.length) return;
      this.start = caret - partial[1].length; this.end = caret; this.selected = 0;
      panel.setAttribute('role', 'listbox'); Object.assign(panel.style, { width: '300px', maxHeight: '204px', overflowY: 'auto' });
      this.panel = panel; this.renderRows();
    } else {
      if (!help) return;
      const call = /([A-Za-z_][A-Za-z0-9_.]*)\(([^()]*)$/.exec(before); if (!call) return;
      const name = call[1].toUpperCase(); const custom = this.wb.getCustomFunction(name) as { description?: () => { parameters?: { name: string }[] } } | undefined;
      const params = this.extra().find(d => d.name?.toUpperCase() === name)?.parameters?.map(p => p.name) ?? custom?.description?.().parameters?.map(p => p.name) ?? parameters[name]; if (!params?.length) return;
      panel.setAttribute('role', 'tooltip'); panel.style.padding = '5px'; const index = call[2].split(',').length - 1;
      panel.append(name + '('); params.forEach((p, i) => { if (i) panel.append(', '); const part = document.createElement(i === Math.min(index, params.length - 1) ? 'b' : 'span'); part.textContent = p; panel.append(part); }); panel.append(')'); this.panel = panel;
    }
    document.body.append(panel);
  }
  private renderRows(): void {
    const panel = this.panel!; panel.replaceChildren();
    this.names.forEach((name, index) => { const description = this.extra().find(d => d.name?.toUpperCase() === name)?.description ?? descriptions[name]; const row = document.createElement('div'); row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(index === this.selected)); row.style.cssText = `box-sizing:border-box;height:${index === this.selected && description ? 42 : 22}px;padding:0 10px;cursor:default;${index === this.selected ? 'background:#f5f5f5;' : ''}`; const label = document.createElement('div'); label.style.cssText = 'font:13px/22px inconsolata, monospace, Arial, sans-serif;color:#222'; label.textContent = name; row.append(label); if (index === this.selected && description) { const desc = document.createElement('div'); desc.style.cssText = 'font:11px/18px Arial;color:#666;white-space:nowrap;overflow:hidden'; desc.textContent = description; row.append(desc); } row.addEventListener('mousedown', e => e.preventDefault()); row.addEventListener('dblclick', () => this.accept()); panel.append(row); });
  }
  private accept(): void { const name = this.names[this.selected]; if (!name) return; const isName = [...this.wb.getCustomNames(), ...this.wb.getActiveSheet().getCustomNames()].some(n => n.getName().toUpperCase() === name); this.insert(this.start, this.end, name + (isName ? '' : '(')); }
  key(event: KeyboardEvent): boolean {
    if (!this.panel) return false;
    if (event.key === 'Escape') { event.preventDefault(); this.close(); return true; }
    if (!this.names.length) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); this.selected = (this.selected + (event.key === 'ArrowDown' ? 1 : -1) + this.names.length) % this.names.length; this.renderRows(); this.panel?.children[this.selected]?.scrollIntoView({ block: 'nearest' }); return true; }
    if (event.key === 'Tab' || event.key === 'Enter') { event.preventDefault(); this.accept(); return true; }
    return false;
  }
}
