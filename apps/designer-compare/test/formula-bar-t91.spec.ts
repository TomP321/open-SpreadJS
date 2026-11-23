/* eslint-disable @typescript-eslint/no-explicit-any */
/* TASK 91: the Designer formula bar of a SELECTED formula cell shows the formula with its
 * leading `=` (array formulas with the `{=...}` braces) and colours the references exactly
 * where the trial colours them; plain cells show their General text. Both sides are driven
 * through the same script and their bars compared. */
import { expect, test, type Page } from '@playwright/test';
import { boot, type Side } from './helpers';

interface BarState { text: string; colored: [string, string][] }

/** Set up identical cells and select each in turn, returning the bar text + coloured tokens. */
async function readBarForCases(page: Page, side: Side): Promise<Record<string, BarState>> {
  await boot(page, side);
  await page.evaluate(() => {
    const { spread } = (window as any).__designerCompare;
    const sheet = spread.getActiveSheet();
    sheet.clear(0, 0, sheet.getRowCount(), sheet.getColumnCount(), 2); // GC.Spread.Sheets.SheetArea.view
    sheet.setColumnWidth(1, 90, 1);
    sheet.setValue(1, 1, 4);
    sheet.setValue(2, 1, 250);
    sheet.setFormula(3, 1, 'B3/B2-1'); // =B3/B2-1
    sheet.setFormula(4, 1, 'SUM(B2:B3)+ABS(B2)+B3'); // functions plain, three coloured references
    sheet.setArrayFormula(5, 1, 1, 1, 'SUM(B2:B3)'); // {=...} — painted plain by the trial
    sheet.setValue(6, 1, 396.5); // plain number
    sheet.setValue(6, 2, 'hello'); // plain text
    sheet.setValue(6, 3, true); // boolean -> TRUE
  });
  const cases: Record<string, BarState> = {};
  const reads = [['formula', 3, 1], ['refs', 4, 1], ['array', 5, 1], ['number', 6, 1], ['text', 6, 2], ['bool', 6, 3]] as const;
  for (const [name, row, col] of reads) {
    await page.evaluate(([r, c]) => {
      const { spread } = (window as any).__designerCompare;
      spread.getActiveSheet().setActiveCell(r as number, c as number);
    }, [row, col]);
    await page.waitForTimeout(350);
    cases[name] = await page.evaluate(() => {
      const box = document.querySelector('.gc-designer-formula-bar-text-box')!;
      const plain = getComputedStyle(box).color; // the theme foreground both sides inherit
      const input = box.querySelector<HTMLInputElement>('input');
      if (input) {
        // Our bar: the <input> carries the text; the coloured layer mirrors the formula with
        // coloured spans and is hidden for plain (uncoloured) content.
        const layer = box.querySelector<HTMLElement>('.gc-designer-formula-color-layer')!;
        const visible = getComputedStyle(layer).visibility === 'visible';
        const colored = visible
          ? [...layer.querySelectorAll('span')].filter((s) => s.style.color).map((s) => [s.textContent ?? '', getComputedStyle(s).color] as [string, string])
          : [];
        return { text: input.value, colored };
      }
      // The trial bar: one contenteditable with per-token spans.
      const colored = [...box.querySelectorAll('span.gcsj-func-color-text')]
        .map((s) => [s.textContent ?? '', getComputedStyle(s).color] as [string, string])
        .filter(([, color]) => color !== plain);
      return { text: box.textContent ?? '', colored };
    });
  }
  return cases;
}

test('formula bar shows =, {=}, colours references and plain values like the trial', async ({ browser }) => {
  const official = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const ours = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    const a = await readBarForCases(official, 'official');
    const b = await readBarForCases(ours, 'ours');
    expect(b.formula.text, 'formula cell text').toBe('=B3/B2-1');
    expect(b.formula.text).toBe(a.formula.text);
    expect(b.array.text, 'array formula text').toBe(a.array.text);
    expect(b.array.text).toBe('{=SUM(B2:B3)}');
    expect(b.number.text, 'number cell shows the raw value').toBe(a.number.text);
    expect(b.text.text, 'text cell').toBe(a.text.text);
    expect(b.bool.text, 'boolean shows TRUE').toBe(a.bool.text);
    // Reference colours: the trial colours only references (functions stay foreground) and
    // gives the same reference the same colour, cycling blue/green/purple by first appearance.
    expect(a.formula.colored).toEqual([['B3', 'rgb(0, 0, 255)'], ['B2', 'rgb(0, 128, 0)']]);
    expect(b.formula.colored).toEqual(a.formula.colored);
    expect(b.refs.colored).toEqual(a.refs.colored);
    expect(a.refs.colored.length, 'the trial colours the three references').toBe(3);
    // Array formulas paint plain on both sides (no coloured runs).
    expect(a.array.colored, 'trial: array bar is plain').toEqual([]);
    expect(b.array.colored, 'ours: array bar is plain').toEqual([]);
  } finally {
    await official.close().catch(() => undefined);
    await ours.close().catch(() => undefined);
  }
});

test('the Italian language build shows the Italian formula in the bar (TASK 89 x 91)', async ({ page }) => {
  await page.goto('/?side=ours&embed=1&lang=it', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => (window as any).__designerCompare?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => {
    const { spread } = (window as any).__designerCompare;
    const sheet = spread.getActiveSheet();
    sheet.clear(0, 0, sheet.getRowCount(), sheet.getColumnCount(), 2);
    sheet.setValue(1, 1, 250); sheet.setValue(2, 1, 150); sheet.setValue(3, 1, 135); sheet.setValue(4, 1, 110);
    sheet.setFormula(5, 1, 'SOMMA(B2:B5;1)');
    sheet.setActiveCell(5, 1);
  });
  await page.waitForTimeout(400);
  const value = await page.locator('.gc-designer-formula-bar-text-box input').inputValue();
  expect(value).toBe('=SOMMA(B2:B5;1)');
});
