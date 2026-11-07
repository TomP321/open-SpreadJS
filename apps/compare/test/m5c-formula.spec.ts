import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

async function edit(page: Page, side: 'official' | 'ours', text: string) {
  const pane = (await page.locator(`#${side}-pane`).boundingBox())!;
  await page.mouse.click(pane.x + 55, pane.y + 30);
  await page.keyboard.type(text);
}

for (const dpr of [1, 2]) {
  test.describe(`formula editing DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test('autocomplete order, navigation, insertion and argument help', async ({ page }) => {
      await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
      await edit(page, 'official', '=SU');
      const official = page.locator('.gcsj-func-ac-popup');
      await expect(official).toBeVisible();
      const expected = await official.locator('.gcsj-func-ac-row-name').allTextContents();
      await page.reload(); await page.waitForFunction(() => window.__compare?.ready);
      await edit(page, 'ours', '=SU');
      const ours = page.locator('.opensheets-formula-hints[role=listbox]');
      await expect(ours).toBeVisible();
      expect(await ours.locator('[role=option] > div:first-child').allTextContents()).toEqual(expected);
      await page.keyboard.press('ArrowDown');
      await expect(ours.locator('[aria-selected=true] > div:first-child')).toHaveText(expected[1]);
      await page.keyboard.press('Tab');
      await expect(page.locator('#ours-pane .gc-cell-editor')).toHaveValue(`=${expected[1]}(`);
      await expect(page.locator('.opensheets-formula-hints[role=tooltip]')).toBeVisible();
    });
    test('function lists agree for additional prefixes', async ({ page }) => {
      test.setTimeout(120_000);
      for (const prefix of [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'AV', 'COUNT', 'SUM']) {
        const lists: string[][] = [];
        for (const side of ['official', 'ours'] as const) {
          await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
          await edit(page, side, `=${prefix}`);
          const selector = side === 'official' ? '.gcsj-func-ac-row-name' : '.opensheets-formula-hints [role=option] > div:first-child';
          lists.push(await page.locator(selector).allTextContents());
        }
        expect.soft(lists[1], prefix).toEqual(lists[0]);
      }
    });
    test('sparkline suggestion includes its description and argument help', async ({ page }) => {
      await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
      await edit(page, 'ours', '=SCATTER');
      const selected = page.locator('.opensheets-formula-hints[role=listbox] [aria-selected=true]');
      await expect(selected).toContainText('SCATTERSPARKLINE');
      await expect(selected).toContainText('Plots pairs of values as a compact scatter chart.');
      await page.keyboard.press('Tab');
      await expect(page.locator('.opensheets-formula-hints[role=tooltip]')).toContainText('points1');
    });
    test('dynamic array option filters the SE function list', async ({ page }) => {
      for (const enabled of [false, true]) {
        const lists: string[][] = [];
        for (const side of ['official', 'ours'] as const) {
          await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
          await page.evaluate(({ side, enabled }) => { window.__compare![side].options.allowDynamicArray = enabled; }, { side, enabled });
          await edit(page, side, '=SE');
          const selector = side === 'official' ? '.gcsj-func-ac-row-name' : '.opensheets-formula-hints [role=option] > div:first-child';
          lists.push(await page.locator(selector).allTextContents());
        }
        expect(lists[1]).toEqual(lists[0]);
      }
    });
    test('cell formula reference overlay follows editing and clears on cancel', async ({ page }) => {
      await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
      await edit(page, 'ours', '=SUM(A1:B2');
      await expect(page.locator('.opensheets-formula-color')).toContainText('SUM(A1:B2');
      await expect(page.locator('.opensheets-formula-color span')).toHaveCount(2);
      await expect(page.locator('.opensheets-formula-hints[role=tooltip]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.opensheets-formula-hints[role=tooltip]')).toHaveCount(0);
      await expect(page.locator('.opensheets-formula-color')).toHaveCount(0);
    });
    test('formula bar and status bar mirror cell editing', async ({ page }) => {
      const observed: { text: string; mode: unknown }[] = [];
      for (const side of ['official', 'ours'] as const) {
        await page.goto('/?scenario=m5-controls'); await page.waitForFunction(() => window.__compare?.ready);
        await edit(page, side, '=SU');
        observed.push(await page.evaluate(side => {
          const lib = side === 'official' ? window.__referenceGC : window.__implementationGC;
          const hosts = document.querySelectorAll<HTMLElement>(`#${side}-pane [data-m5-control]`);
          const box = lib.Spread.Sheets.FormulaTextBox.findControl(hosts[1]);
          return { text: box.text(), mode: hosts[2].textContent?.match(/Enter|Edit|Ready/)?.[0] ?? null };
        }, side));
      }
      expect(observed[1]).toEqual(observed[0]);
      expect(observed[1].text).toBe('=SU');
    });
    test('autocomplete popup pixels', async ({ page }) => {
      await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
      await edit(page, 'official', '=SU');
      const official = page.locator('.gcsj-func-ac-popup'); await expect(official).toBeVisible();
      const reference = PNG.sync.read(await official.screenshot());
      await page.reload(); await page.waitForFunction(() => window.__compare?.ready);
      await edit(page, 'ours', '=SU');
      const ours = page.locator('.opensheets-formula-hints[role=listbox]'); await expect(ours).toBeVisible();
      const actual = PNG.sync.read(await ours.screenshot());
      expect({ width: actual.width, height: actual.height }).toEqual({ width: reference.width, height: reference.height });
      const diff = new PNG({ width: reference.width, height: reference.height });
      const pixels = pixelmatch(reference.data, actual.data, diff.data, reference.width, reference.height, { threshold: 0.1 });
      let contentPixels = 0, contentArea = 0, textPixels = 0, textArea = 0;
      for (let y = 0; y < reference.height; y++) for (let x = 0; x < reference.width; x++) {
        // Our independently written description is measured separately, in its own text line.
        const description = x >= 10 * dpr && x < 290 * dpr && y >= 23 * dpr && y < 41 * dpr;
        const offset = (y * reference.width + x) * 4;
        const different = diff.data[offset] === 255 && diff.data[offset + 1] === 0 && diff.data[offset + 2] === 0;
        if (description) { textArea++; if (different) textPixels++; }
        else { contentArea++; if (different) contentPixels++; }
      }
      console.log(`popup DPR ${dpr}: all ${pixels}/${reference.width * reference.height}, content ${contentPixels}/${contentArea}, description ${textPixels}/${textArea}`);
      expect(contentPixels / contentArea).toBeLessThan(0.005);
    });
  });
}
