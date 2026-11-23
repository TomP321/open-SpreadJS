/* TASK 90 A/B — the ribbon font commands. The user selected A3 (font `14.6667px Calibri`), clicked
 * Home ▸ Increase Font Size and got `12pt` (family lost, so the canvas fell back to its previous
 * font), then Bold gave `bold` (size and family lost). Every value asserted below is the trial's
 * own state after the same clicks, recorded black-box in `.probe/t90/fonts-r1.json` (cell shorthand
 * from `getStyle().toJSON()`, resolved state from `getActualStyle()`). */
import { describe, expect, it, beforeEach } from 'vitest';
import GC from '@mescius/spread-sheets';
import { applyBuiltin } from '../src/commands/actions.js';
import { applyFormatCells } from '../src/commands/style-actions.js';

function makeDesigner(): { gc: typeof GC; getWorkbook: () => GC.Spread.Sheets.Workbook; spreadsheet: GC.Spread.Sheets.Workbook; invalidate: () => void } {
  const workbook = new GC.Spread.Sheets.Workbook();
  return { gc: GC, spreadsheet: workbook, getWorkbook: () => workbook, invalidate: () => undefined };
}

const DEFAULT_FONT = '14.6667px Calibri';

/* The public `Style` constructor takes positional members (like the contract d.ts); config-object
 * construction is done by assigning onto an empty Style, the documented TS pattern. */
function styleOf(props: Record<string, unknown>): GC.Spread.Sheets.Style {
  const { Style } = GC.Spread.Sheets;
  return Object.assign(new Style(), props) as GC.Spread.Sheets.Style;
}

describe('TASK 90 ribbon font commands (trial shorthand semantics)', () => {
  let d: ReturnType<typeof makeDesigner>;
  let sheet: GC.Spread.Sheets.Worksheet;

  const snapshot = (row = 1, col = 1) => {
    const actual = sheet.getActualStyle(row, col);
    const cell = sheet.getStyle(row, col);
    const json = cell ? (cell as unknown as { toJSON?: () => Record<string, unknown> }).toJSON?.() ?? null : null;
    return {
      actualFont: actual.font ?? null,
      cellFont: json?.font ?? null,
      weight: actual.fontWeight ?? null,
      style: actual.fontStyle ?? null,
      size: actual.fontSize ?? null,
      family: actual.fontFamily ?? null,
      decoration: actual.textDecoration ?? null,
    };
  };

  beforeEach(() => {
    d = makeDesigner();
    sheet = d.getWorkbook().getActiveSheet();
    sheet.setValue(1, 1, 'Hello World Bold');
    sheet.setActiveCell(1, 1);
    sheet.setSelection(1, 1, 1, 1);
  });

  it('walks the size ladder and keeps family and weight in the shorthand (the user repro)', () => {
    expect(snapshot().actualFont).toBe(DEFAULT_FONT);

    applyBuiltin(d as never, 'increaseFontsize'); // Home ▸ Increase Font Size
    expect(snapshot()).toMatchObject({ actualFont: '12pt Calibri', cellFont: '12pt', size: '12pt', family: 'Calibri' });

    applyBuiltin(d as never, 'fontWeight', { value: true }); // Home ▸ Bold
    expect(snapshot()).toMatchObject({ actualFont: 'bold 12pt Calibri', cellFont: 'bold 12pt', weight: 'bold', size: '12pt', family: 'Calibri' });

    // the ladder the trial uses (the ribbon list 8,9,10,11,12,14,16,18,20,...), both directions
    applyBuiltin(d as never, 'increaseFontsize');
    expect(snapshot().actualFont).toBe('bold 14pt Calibri');
    applyBuiltin(d as never, 'decreaseFontsize');
    expect(snapshot().actualFont).toBe('bold 12pt Calibri');

    applyBuiltin(d as never, 'fontItalic', { value: true });
    expect(snapshot()).toMatchObject({ actualFont: 'italic bold 12pt Calibri', cellFont: 'italic bold 12pt' });

    applyBuiltin(d as never, 'fontSize', { value: 20 });
    expect(snapshot()).toMatchObject({ actualFont: 'italic bold 20pt Calibri', cellFont: 'italic bold 20pt' });

    applyBuiltin(d as never, 'fontFamily', { value: 'Georgia' });
    expect(snapshot()).toMatchObject({ actualFont: 'italic bold 20pt Georgia', cellFont: 'italic bold 20pt Georgia', family: 'Georgia' });

    applyBuiltin(d as never, 'fontWeight', { value: false }); // Ctrl+B / Bold off
    expect(snapshot()).toMatchObject({ actualFont: 'italic normal 20pt Georgia', cellFont: 'italic normal 20pt Georgia', weight: 'normal' });
  });

  it('rebuilds the shorthand for a cell that only has a size, only a family, or a two-word family', () => {
    const cases: { name: string; style: { font: string }; before: string; on: boolean; after: string }[] = [
      { name: 'size only', style: { font: '18pt' }, before: '18pt Calibri', on: true, after: 'bold 18pt Calibri' },
      { name: 'family only', style: { font: 'Georgia' }, before: '14.6667px Georgia', on: true, after: 'bold 14.6667px Georgia' },
      { name: 'two-word family', style: { font: '12pt Arial Black' }, before: "12pt 'Arial Black'", on: true, after: "bold 12pt 'Arial Black'" },
      // Bold off on a cell that is already italic+bold: the trial keeps the italic and writes the
      // weight explicitly (`italic normal 20pt Georgia`, .probe/t90/fonts-r1.json)
      { name: 'weight + italic', style: { font: 'italic bold 11pt Calibri' }, before: 'italic bold 11pt Calibri', on: false, after: 'italic normal 11pt Calibri' },
    ];
    for (const item of cases) {
      sheet.setStyle(1, 1, styleOf(item.style));
      expect(snapshot().actualFont, item.name).toBe(item.before);
      applyBuiltin(d as never, 'fontWeight', { value: item.on });
      expect(snapshot().actualFont, item.name).toBe(item.after);
      applyBuiltin(d as never, 'increaseFontsize');
      // the size a command walks is the resolved one, never a fragment
      expect(String(snapshot().size), item.name).toMatch(/^\d+(?:\.\d+)?(?:pt|px)$/);
      expect(snapshot().actualFont, item.name).toMatch(/^(?:italic |normal |bold )*[\d.]+(?:pt|px) /);
    }
  });

  it('applies a size walk over a multi-cell selection from the top-left cell like the trial', () => {
    // trial (.probe/t90/fonts-r1.json `mixedRange`): 18pt Arial + bold 9pt Georgia + default,
    // Increase Font Size -> 20pt for all three, keeping each cell's own family and weight.
    sheet.setStyle(1, 1, styleOf({ font: '18pt Arial' }));
    sheet.setStyle(1, 2, styleOf({ font: 'bold 9pt Georgia' }));
    sheet.setStyle(1, 3, new GC.Spread.Sheets.Style());
    sheet.setSelection(1, 1, 1, 3);
    applyBuiltin(d as never, 'increaseFontsize');
    expect([1, 2, 3].map((col) => sheet.getActualStyle(1, col).font)).toEqual(['20pt Arial', 'bold 20pt Georgia', '20pt Calibri']);
    applyBuiltin(d as never, 'fontWeight', { value: true });
    expect([1, 2, 3].map((col) => sheet.getActualStyle(1, col).font)).toEqual(['bold 20pt Arial', 'bold 20pt Georgia', 'bold 20pt Calibri']);
  });

  it('walks the ladder from a size that only a named, row, column or area style carries', () => {
    const named = styleOf({ name: 't90ribbon', font: 'italic 14pt "Segoe UI"' });
    d.getWorkbook().addNamedStyle(named);
    sheet.setStyleName(1, 1, 't90ribbon');
    expect(snapshot().actualFont).toBe("italic 14pt 'Segoe UI'");
    applyBuiltin(d as never, 'fontWeight', { value: true });
    expect(snapshot().actualFont).toBe("italic bold 14pt 'Segoe UI'");
    applyBuiltin(d as never, 'increaseFontsize');
    expect(snapshot().actualFont).toBe("italic bold 16pt 'Segoe UI'"); // 14 -> 16 in the ribbon list
    sheet.setStyleName(1, 1, '');
    sheet.setStyle(1, 1, new GC.Spread.Sheets.Style());

    sheet.setStyle(-1, 1, styleOf({ font: '16pt Verdana' }));
    expect(snapshot().actualFont).toBe('16pt Verdana');
    applyBuiltin(d as never, 'fontWeight', { value: true });
    expect(snapshot().actualFont).toBe('bold 16pt Verdana');
    sheet.setStyle(-1, 1, new GC.Spread.Sheets.Style());

    sheet.setStyle(1, -1, styleOf({ font: 'bold 10pt Tahoma' }));
    expect(snapshot().actualFont).toBe('bold 10pt Tahoma');
    applyBuiltin(d as never, 'increaseFontsize');
    expect(snapshot().actualFont).toBe('bold 11pt Tahoma');
    sheet.setStyle(1, -1, new GC.Spread.Sheets.Style());

    const areaDefault = sheet.getDefaultStyle();
    areaDefault.font = '13pt Calibri';
    sheet.setDefaultStyle(areaDefault);
    sheet.setStyle(1, 1, new GC.Spread.Sheets.Style()); // the commands above left an own style on the cell; start from the area default
    expect(snapshot().actualFont).toBe('13pt Calibri');
    applyBuiltin(d as never, 'fontWeight', { value: true });
    expect(snapshot().actualFont).toBe('bold 13pt Calibri');
  });

  it('Format Cells > Font writes long-hands and recomposes the shorthand (dialog path)', () => {
    // Same rule as the ribbon (supervisor repro list): the dialog's Font tab must never leave a
    // size-only or weight-only shorthand in the cell. Trial: only the touched members are written.
    sheet.setStyle(1, 1, styleOf({ font: "italic 14pt 'Segoe UI'" }));
    applyFormatCells(d as never, { font: { family: 'Segoe UI', style: 'Italic', size: '18', underline: 0, strike: false, color: '', touched: ['size'] } });
    expect(snapshot()).toMatchObject({ actualFont: "italic 18pt 'Segoe UI'", weight: null, style: 'italic', size: '18pt' });
    applyFormatCells(d as never, { font: { family: 'Segoe UI', style: 'Bold Italic', size: '18', underline: 0, strike: false, color: '', touched: ['style'] } });
    expect(snapshot()).toMatchObject({ actualFont: "italic bold 18pt 'Segoe UI'", cellFont: "italic bold 18pt 'Segoe UI'", weight: 'bold' });
    applyFormatCells(d as never, { font: { family: 'Verdana', style: 'Bold Italic', size: '18', underline: 1, strike: false, color: '#FF0000', touched: ['family', 'underline', 'color'] } });
    expect(snapshot()).toMatchObject({ actualFont: "italic bold 18pt Verdana", cellFont: "italic bold 18pt Verdana", decoration: 1 });
    // the untouched size/weight members carried over from the cell's own style, not re-parsed
    // from the dialog's widget state (the dialog echoes what it showed; only `touched` writes)
    expect(sheet.getActualStyle(1, 1).fontSize).toBe('18pt');
    // a cell whose font comes from a NAMED style: the dialog writes the cell's own long-hands and
    // the resolved shorthand keeps the named style's other parts
    sheet.setStyle(1, 1, new GC.Spread.Sheets.Style());
    const named = styleOf({ name: 't90dlg', font: 'bold 12pt Georgia' });
    d.getWorkbook().addNamedStyle(named);
    sheet.setStyleName(1, 1, 't90dlg');
    applyFormatCells(d as never, { font: { family: 'Georgia', style: 'Bold', size: '20', underline: 0, strike: false, color: '', touched: ['size'] } });
    expect(sheet.getActualStyle(1, 1).font).toBe('bold 20pt Georgia');
    sheet.setStyleName(1, 1, '');
    sheet.setStyle(1, 1, new GC.Spread.Sheets.Style());
  });

  it('toggles the underline bits the way the trial does (measured sequence 8, 0, 1, 0, 8)', () => {
    // .probe/t90/decoration2-r1.json: clicking the same checkbox toggles its own bit and leaves the
    // other decoration bits alone — a strikethrough cell goes 2 -> 10 (double underline added) ->
    // 3 (single underline, double cleared) -> 10.
    sheet.setStyle(1, 1, new GC.Spread.Sheets.Style());
    const steps: { command: string; value: boolean; expected: number }[] = [
      { command: 'fontDoubleUnderline', value: true, expected: 8 },
      { command: 'fontDoubleUnderline', value: false, expected: 0 },
      { command: 'fontUnderline', value: true, expected: 1 },
      { command: 'fontUnderline', value: false, expected: 0 },
      { command: 'fontDoubleUnderline', value: true, expected: 8 },
    ];
    for (const step of steps) {
      applyBuiltin(d as never, step.command, { value: step.value });
      expect(sheet.getActualStyle(1, 1).textDecoration, `${step.command} ${step.value}`).toBe(step.expected);
    }
    sheet.setStyle(1, 1, new GC.Spread.Sheets.Style());
    applyBuiltin(d as never, 'fontUnderline', { value: true });
    expect(sheet.getActualStyle(1, 1).textDecoration).toBe(1);
    sheet.setStyle(1, 1, styleOf({ textDecoration: 2 })); // lineThrough
    applyBuiltin(d as never, 'fontDoubleUnderline', { value: true });
    expect(sheet.getActualStyle(1, 1).textDecoration).toBe(10);
    applyBuiltin(d as never, 'fontUnderline', { value: true });
    expect(sheet.getActualStyle(1, 1).textDecoration).toBe(3);
    applyBuiltin(d as never, 'fontDoubleUnderline', { value: true });
    expect(sheet.getActualStyle(1, 1).textDecoration).toBe(10);
    // a font command never touches the decoration and an underline command never touches the font
    expect(sheet.getActualStyle(1, 1).font).toBe(DEFAULT_FONT);
  });
});
