/* eslint-disable @typescript-eslint/no-explicit-any */
/* TASK 90 A/B — the ribbon font commands and Ctrl+B/I/U chords, ours vs the trial on the real
 * Designer page (the user's symptoms: "when I zoom in the font falls back to a default" and
 * "even when you make it bold there are several bugs").
 *
 * Before this round's fixes these flows produced family-less / size-less shorthands (`12pt`,
 * `bold`) that canvas silently ignored — the cell then drew in whatever font the context last
 * used. Trial reference values measured black-box in `.probe/t90/fonts-r1.json`,
 * `ctrl3-r1.json`; the unit mirrors are `packages/spread-sheets(-designer)/test/task90-*.test.ts`.
 * This spec drives the SAME clicks/chords on both sides and requires identical resolved style,
 * identical cell-shorthand writes and identical ribbon checked state after every step. */
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { boot } from './helpers';

async function setupTarget(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = (window as any).__designerCompare.spread.getActiveSheet();
    s.setStyle(1, 1, null);
    s.setFormatter?.(1, 1, null);
    s.setValue(1, 1, 'Hello World Bold');
    s.setActiveCell(1, 1);
    s.setSelection(1, 1, 1, 1);
  });
  await page.waitForTimeout(150);
}

interface FontState { font: string | null; weight: unknown; style: unknown; size: unknown; family: unknown; deco: unknown; cellFont: string | null; bold: boolean | null; italic: boolean | null; underline: boolean | null }

async function fontState(page: Page): Promise<FontState> {
  return page.evaluate(() => {
    const s = (window as any).__designerCompare.spread.getActiveSheet();
    const a = s.getActualStyle(1, 1);
    const cell = s.getStyle(1, 1);
    const json = cell && typeof cell.toJSON === 'function' ? cell.toJSON() : {};
    const cls = (name: string) => {
      const el = document.querySelector(`[data-command="ribbon.${name}"]`);
      return el ? /check-box-checked|selected/.test(String(el.className)) : null;
    };
    return {
      font: a.font ?? null, weight: a.fontWeight ?? null, style: a.fontStyle ?? null, size: a.fontSize ?? null, family: a.fontFamily ?? null, deco: a.textDecoration ?? null,
      cellFont: json?.font ?? null,
      bold: cls('fontWeight'), italic: cls('fontItalic'), underline: cls('fontUnderline'),
    };
  });
}

/** Drive both pages through the same action, then require the same resolved state. */
async function drive(official: Page, ours: Page, action: (page: Page) => Promise<void>, label: string, expectState?: Partial<FontState>): Promise<FontState> {
  for (const page of [official, ours]) await action(page);
  const a = await fontState(official);
  const b = await fontState(ours);
  expect(b, `${label}: ours must equal the trial (${JSON.stringify(a)})`).toEqual(a);
  if (expectState) expect(a, label).toMatchObject(expectState);
  return a;
}

const click = (name: string) => async (page: Page) => {
  await page.locator(`[data-command="ribbon.${name}"]`).click();
  await page.waitForTimeout(160);
};
const chord = (key: string) => async (page: Page) => {
  await page.keyboard.press(`Control+${key}`);
  await page.waitForTimeout(220);
};

test.describe('TASK 90 A/B paired font commands (Designer page)', () => {
  test('Increase/Decrease Font Size and Bold keep the full shorthand (the user repro) and match the trial', async ({ browser }) => {
    const official = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const ours = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    try {
      await boot(official, 'official'); await boot(ours, 'ours');
      for (const page of [official, ours]) await setupTarget(page);
      // the user's exact sequence: A3 (14.6667px Calibri) > Increase Font Size > Bold
      await drive(official, ours, click('increaseFontsize'), 'Increase Font Size', { font: '12pt Calibri', family: 'Calibri', cellFont: '12pt' });
      await drive(official, ours, click('fontWeight'), 'Bold on', { font: 'bold 12pt Calibri', weight: 'bold', cellFont: 'bold 12pt', bold: true });
      await drive(official, ours, click('decreaseFontsize'), 'Decrease Font Size', { font: 'bold 11pt Calibri', size: '11pt' });
      await drive(official, ours, click('fontItalic'), 'Italic', { font: 'italic bold 11pt Calibri', style: 'italic' });
      await drive(official, ours, click('fontUnderline'), 'Underline on', { deco: 1, underline: true });
      await drive(official, ours, click('fontUnderline'), 'Underline off', { deco: 0, underline: false });
      // the ribbon Bold checkbox toggles off, exactly like the trial writes (weight `normal`)
      await drive(official, ours, click('fontItalic'), 'Italic off', { style: 'normal' });
      await drive(official, ours, click('fontWeight'), 'Bold off', { weight: 'normal', bold: false });
    } finally { await official.close(); await ours.close(); }
  });

  test('Ctrl+B / Ctrl+I / Ctrl+U chords drive the same commands as the ribbon and toggle like the trial', async ({ browser }) => {
    const official = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const ours = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    try {
      await boot(official, 'official'); await boot(ours, 'ours');
      // focus the sheet with a physical click inside B2 (like the user) and select it
      for (const page of [official, ours]) {
        const p = await page.evaluate(() => {
          const s = (window as any).__designerCompare.spread.getActiveSheet();
          const c = [...document.querySelectorAll('canvas')].map((n) => n.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
          const r = s.getCellRect(1, 1);
          return { x: c.x + r.x + r.width / 2, y: c.y + r.y + r.height / 2 };
        });
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(150);
      }
      await setupTarget(official); await setupTarget(ours);
      await drive(official, ours, chord('b'), 'Ctrl+B on', { font: 'bold 14.6667px Calibri', weight: 'bold', bold: true });
      await drive(official, ours, chord('b'), 'Ctrl+B off (trial writes normal)', { weight: 'normal', bold: false });
      await drive(official, ours, chord('i'), 'Ctrl+I on', { style: 'italic', font: 'italic normal 14.6667px Calibri' });
      await drive(official, ours, chord('i'), 'Ctrl+I off', { style: 'normal' });
      await drive(official, ours, chord('u'), 'Ctrl+U on', { deco: 1, underline: true });
      await drive(official, ours, chord('u'), 'Ctrl+U off', { deco: 0, underline: false });
      // the chord works while the cell editor is open (`.probe/t90/ctrl3-r1.json`: the trial
      // applies bold during editing and it survives the commit)
      for (const page of [official, ours]) {
        const p = await page.evaluate(() => {
          const s = (window as any).__designerCompare.spread.getActiveSheet();
          const c = [...document.querySelectorAll('canvas')].map((n) => n.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
          const r = s.getCellRect(1, 1);
          return { x: c.x + r.x + r.width / 2, y: c.y + r.y + r.height / 2 };
        });
        await page.mouse.click(p.x, p.y, { clickCount: 2 });
        await page.waitForTimeout(250);
      }
      await drive(official, ours, chord('b'), 'Ctrl+B during editing', { font: 'normal bold 14.6667px Calibri', weight: 'bold' });
      await drive(official, ours, async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }, 'Escape leaves the bold applied', { font: 'normal bold 14.6667px Calibri', weight: 'bold' });
    } finally { await official.close(); await ours.close(); }
  });

  test('the font-name and font-size combos update the shorthand like the trial', async ({ browser }) => {
    const official = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const ours = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    try {
      await boot(official, 'official'); await boot(ours, 'ours');
      for (const page of [official, ours]) await setupTarget(page);
      const typeCombo = async (page: Page, command: string, value: string) => {
        const input = page.locator(`[data-command="ribbon.${command}"] input.spinner-input`);
        await input.click({ clickCount: 3 });
        await input.fill(value);
        await input.press('Enter');
        await page.waitForTimeout(200);
      };
      await drive(official, ours, (page) => typeCombo(page, 'fontSize', '20'), 'Font size combo 20', { size: '20pt', font: '20pt Calibri', cellFont: '20pt' });
      await drive(official, ours, click('fontWeight'), 'Bold', { font: 'bold 20pt Calibri', cellFont: 'bold 20pt' });
      await drive(official, ours, (page) => typeCombo(page, 'fontFamily', 'Georgia'), 'Font family combo Georgia', { font: "bold 20pt Georgia", family: 'Georgia', cellFont: "bold 20pt Georgia" });
      await drive(official, ours, (page) => typeCombo(page, 'fontSize', '11'), 'Font size combo back to 11', { font: "bold 11pt Georgia", size: '11pt' });
    } finally { await official.close(); await ours.close(); }
  });

  test('a size walk over a mixed-font range keeps each cell\u0027s own family/weight, ours == trial', async ({ browser }) => {
    const official = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const ours = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    try {
      await boot(official, 'official'); await boot(ours, 'ours');
      for (const page of [official, ours]) {
        await page.evaluate(() => {
          const G = (window as any).GC;
          const s = (window as any).__designerCompare.spread.getActiveSheet();
          s.setStyle(1, 1, new G.Spread.Sheets.Style({ font: '18pt Arial' }));
          s.setStyle(1, 2, new G.Spread.Sheets.Style({ font: 'bold 9pt Georgia' }));
          s.setStyle(1, 3, null);
          s.setValue(1, 1, 'mixed a'); s.setValue(1, 2, 'mixed b'); s.setValue(1, 3, 'mixed c');
          s.setActiveCell(1, 1);
          s.setSelection(1, 1, 1, 3); // the trial collapses reverse-ordered calls like this
        });
        await page.waitForTimeout(150);
      }
      const readRange = (page: Page) => page.evaluate(() => [1, 2, 3].map((col) => (window as any).__designerCompare.spread.getActiveSheet().getActualStyle(1, col).font));
      await drive(official, ours, click('increaseFontsize'), 'Increase over mixed range');
      const a = await readRange(official), b = await readRange(ours);
      expect(b, `mixed range walk (trial ${JSON.stringify(a)})`).toEqual(a);
      expect(a).toEqual(['20pt Arial', 'bold 20pt Georgia', '20pt Calibri']);
      await drive(official, ours, click('fontWeight'), 'Bold over mixed range');
      const a2 = await readRange(official), b2 = await readRange(ours);
      expect(b2, `bold over mixed range (trial ${JSON.stringify(a2)})`).toEqual(a2);
      expect(a2).toEqual(['bold 20pt Arial', 'bold 20pt Georgia', 'bold 20pt Calibri']);
    } finally { await official.close(); await ours.close(); }
  });

  test('commands rebuild the shorthand when only a named/row/column style carries the font', async ({ browser }) => {
    const official = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const ours = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    try {
      await boot(official, 'official'); await boot(ours, 'ours');
      const cases: { name: string; label: string }[] = [
        { name: 'named', label: 'named style italic 14pt Segoe UI -> Bold -> Increase' },
        { name: 'row', label: 'row style 16pt Verdana -> Bold' },
        { name: 'col', label: 'col style bold 10pt Tahoma -> Increase' },
        { name: 'default', label: 'sheet default 13pt Trebuchet MS -> Bold' },
      ];
      for (const c of cases) {
        for (const page of [official, ours]) {
          await page.evaluate((kind) => {
            const G = (window as any).GC;
            const s = (window as any).__designerCompare.spread.getActiveSheet();
            s.setStyle(1, 1, null);
            s.setStyleName(1, 1, null);
            s.setStyle(-1, 1, null);
            s.setStyle(1, -1, null);
            for (const st of s.getNamedStyles()) s.removeNamedStyle(st.name);
            if (kind === 'named') {
              s.addNamedStyle(new G.Spread.Sheets.Style({ name: 't90e2e', font: 'italic 14pt "Segoe UI"' }));
              s.setStyleName(1, 1, 't90e2e');
            } else if (kind === 'row') s.setStyle(-1, 1, new G.Spread.Sheets.Style({ font: '16pt Verdana' }));
            else if (kind === 'col') s.setStyle(1, -1, new G.Spread.Sheets.Style({ font: 'bold 10pt Tahoma' }));
            else { const d = s.getDefaultStyle(); d.font = '13pt Trebuchet MS'; s.setDefaultStyle(d); }
            s.setValue(1, 1, 'cascade');
            s.setActiveCell(1, 1);
            s.setSelection(1, 1, 1, 1);
          }, c.name);
          await page.waitForTimeout(150);
        }
        if (c.name === 'named') {
          await drive(official, ours, click('fontWeight'), c.label, { font: "italic bold 14pt 'Segoe UI'" });
          await drive(official, ours, click('increaseFontsize'), `${c.label} (size walk)`, { font: "italic bold 16pt 'Segoe UI'" });
        } else if (c.name === 'row') {
          await drive(official, ours, click('fontWeight'), c.label, { font: 'bold 16pt Verdana' });
        } else if (c.name === 'col') {
          await drive(official, ours, click('increaseFontsize'), c.label, { font: 'bold 11pt Tahoma' });
        } else {
          // Trial `.probe/t90/themefont.mjs`: the built-in default style carries `themeFont:'Body'`,
          // so its family member is resolved THROUGH the theme (Calibri) - size 13pt applies, the
          // named family does not survive the theme resolution.
          await drive(official, ours, click('fontWeight'), c.label, { font: 'bold 13pt Calibri', family: 'Calibri', size: '13pt' });
        }
      }
    } finally { await official.close(); await ours.close(); }
  });

  test('zoom + installed webfont: bold text draws at the zoomed size in BOTH zoom and DPR (no default-font fallback)', async ({ browser }, testInfo) => {
    const official = await browser.newPage({ viewport: { width: 1440, height: 800 }, deviceScaleFactor: 1.25 });
    const ours = await browser.newPage({ viewport: { width: 1440, height: 800 }, deviceScaleFactor: 1.25 });
    try {
      await boot(official, 'official'); await boot(ours, 'ours');
      // "Liberation Sans" is installed on this machine (fc-list) and metrically close to Calibri,
      // so a fallback to the canvas default font is VISIBLE in the pixels (the Linux Calibri
      // fallback hid the bug on both sides before).
      for (const page of [official, ours]) {
        await page.evaluate(() => {
          const G = (window as any).GC;
          const s = (window as any).__designerCompare.spread.getActiveSheet();
          s.setStyle(1, 1, new G.Spread.Sheets.Style({ font: 'bold 14pt "Liberation Sans"' }));
          s.setValue(1, 1, 'Bold AaBb check');
          // a roomy cell so the zoomed glyphs AND the underline stroke sit well inside it
          s.setRowHeight(1, 44);
          s.setColumnWidth(1, 170);
          s.setActiveCell(1, 1);
          s.setSelection(1, 1, 1, 1);
          s.zoom(1.5);
        });
        await page.waitForTimeout(300);
      }
      // Ctrl+B on top of the bold cell must keep the full shorthand (the reported bold glitch):
      await drive(official, ours, chord('b'), 'Ctrl+B toggles', { font: "normal 14pt 'Liberation Sans'", cellFont: "normal 14pt 'Liberation Sans'" });
      await drive(official, ours, chord('b'), 'Ctrl+B back to bold', { font: "bold 14pt 'Liberation Sans'" });
      const rect = await official.evaluate(() => {
        const s = (window as any).__designerCompare.spread.getActiveSheet();
        const c = [...document.querySelectorAll('canvas')].map((n) => n.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        const r = s.getCellRect(1, 1);
        return { x: Math.round(c.x + r.x), y: Math.round(c.y + r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
      });
      const oursRect = await ours.evaluate(() => {
        const s = (window as any).__designerCompare.spread.getActiveSheet();
        const c = [...document.querySelectorAll('canvas')].map((n) => n.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        const r = s.getCellRect(1, 1);
        return { x: Math.round(c.x + r.x), y: Math.round(c.y + r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
      });
      expect(oursRect, 'the zoomed cell must occupy the same page rect as the trial').toEqual(rect);
      const [a, b] = await Promise.all([official.screenshot({ clip: rect }), ours.screenshot({ clip: rect })]);
      const pa = PNG.sync.read(a), pb = PNG.sync.read(b);
      expect([pb.width, pb.height], 'capture dimensions must match at dpr 1.25').toEqual([pa.width, pa.height]);
      /* Pixel-diffing dense glyph text at dpr 1.25 sits on a 5-14 % subpixel-AA floor (both
       * renderers place the same 28px glyph on slightly different device-pixel grids), so the
       * HARD gates here are the glyph ink mass and ink bounding box measured inside the cell
       * (4 px border inset - the selection frame is excluded). Symptom A/B fallbacks - drawing
       * the text in the 10px default instead of the zoomed Liberation Sans - shrink the glyph
       * ink to a fraction and are caught with a wide margin.
       * `.probe/t90/clip.mjs` records the floor: ink 855 vs 844, glyph height 31 vs 30. */
      const inkStats = (png: PNG) => {
        const inset = Math.round(4 * (png.width / rect.width));
        let n = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
        for (let y = inset; y < png.height - inset; y++)
          for (let x = inset; x < png.width - inset; x++) {
            const j = (y * png.width + x) * 4;
            if (png.data[j] < 128 && png.data[j + 1] < 128 && png.data[j + 2] < 128) { n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
          }
        return { n, w: maxX - minX + 1, h: maxY - minY + 1 };
      };
      const ia = inkStats(pa), ib = inkStats(pb);
      expect(Math.abs(ia.n - ib.n) / ia.n, `glyph ink mass ours ${ib.n} vs trial ${ia.n}`).toBeLessThan(0.1);
      expect(Math.abs(ia.h - ib.h), `glyph ink height ours ${ib.h} vs trial ${ia.h}`).toBeLessThanOrEqual(3);
      expect(Math.abs(ia.w - ib.w), `glyph ink width ours ${ib.w} vs trial ${ia.w}`).toBeLessThanOrEqual(3);
      const aaFloor = pixelmatch(pa.data, pb.data, null, pa.width, pa.height, { threshold: 0.1, includeAA: true });
      await testInfo.attach('liberation-zoom150-dpr125.json', { body: JSON.stringify({ rect, inkOfficial: ia, inkOurs: ib, pixelmatchIncludeAA: aaFloor, total: pa.width * pa.height }), contentType: 'application/json' });
      // Underline on top of the bold zoomed text: the extra stroke must render at the same
      // zoom-scaled baseline on both sides (task 90: decorations at each zoom/DPR).
      await drive(official, ours, chord('u'), 'Underline on at zoom 1.5 / dpr 1.25', { deco: 1, underline: true });
      const [ua, ub] = await Promise.all([official.screenshot({ clip: rect }), ours.screenshot({ clip: rect })]);
      const uia = inkStats(PNG.sync.read(ua)), uib = inkStats(PNG.sync.read(ub));
      expect(Math.abs(uia.n - uib.n) / uia.n, `underline ink mass ours ${uib.n} vs trial ${uia.n}`).toBeLessThan(0.12);
      expect(Math.abs(uia.h - uib.h), `underline ink height ours ${uib.h} vs trial ${uia.h}`).toBeLessThanOrEqual(3);
      expect(uib.n, `underline must add ink on ours too (${uia.n} -> ${uib.n})`).toBeGreaterThan(ib.n);
      expect(uia.n, `underline must add ink on the trial too (${ib.n} -> ${uia.n})`).toBeGreaterThan(ia.n);
      await drive(official, ours, chord('u'), 'Underline off', { deco: 0, underline: false });
    } finally { await official.close(); await ours.close(); }
  });

  test('the cell editor overlay uses the zoomed cell font', async ({ browser }) => {
    const ours = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    try {
      await boot(ours, 'ours');
      await ours.evaluate(() => {
        const G = (window as any).GC;
        const s = (window as any).__designerCompare.spread.getActiveSheet();
        s.setStyle(1, 1, new G.Spread.Sheets.Style({ font: 'bold italic 14pt "Liberation Sans"' }));
        s.setValue(1, 1, 'editor font');
        s.zoom(1.5);
      });
      await ours.waitForTimeout(250);
      const p = await ours.evaluate(() => {
        const s = (window as any).__designerCompare.spread.getActiveSheet();
        const c = [...document.querySelectorAll('canvas')].map((n) => n.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        const r = s.getCellRect(1, 1);
        return { x: c.x + r.x + r.width / 2, y: c.y + r.y + r.height / 2 };
      });
      await ours.mouse.click(p.x, p.y, { clickCount: 2 });
      await ours.waitForTimeout(250);
      const editorFont = await ours.evaluate(() => {
        const el = document.querySelector('.gc-cell-editor') as HTMLElement | null;
        return el ? getComputedStyle(el).font : null;
      });
      expect(editorFont, 'editor overlay must carry the zoomed shorthand').toContain('Liberation Sans');
      // Chromium normalizes the bold keyword to the numeric weight in the computed shorthand
      expect(editorFont, `editor overlay (${editorFont})`).toMatch(/(italic (bold|700)|bold italic|700 italic)/);
      expect(editorFont, `editor overlay (${editorFont})`).toMatch(/28(?:\.3333)?px/); // 14pt * 1.5 = 28px
      await ours.keyboard.press('Escape');
    } finally { await ours.close(); }
  });

  test('Ctrl+wheel zoom steps match the trial', async ({ browser }) => {
    const official = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const ours = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    try {
      await boot(official, 'official'); await boot(ours, 'ours');
      const zooms: number[] = [];
      for (const page of [official, ours]) {
        const p = await page.evaluate(() => {
          const c = [...document.querySelectorAll('canvas')].map((n) => n.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
          return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
        });
        await page.mouse.move(p.x, p.y);
        for (let i = 0; i < 3; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -120); await page.keyboard.up('Control'); await page.waitForTimeout(120); }
        for (let i = 0; i < 2; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, 120); await page.keyboard.up('Control'); await page.waitForTimeout(120); }
        zooms.push(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().zoom()));
      }
      const [o, u] = zooms;
      expect(Math.abs(o - u), `ctrl+wheel zoom: ours ${u} vs trial ${o}`).toBeLessThan(0.001);
    } finally { await official.close(); await ours.close(); }
  });
});
