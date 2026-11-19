import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { boot, captureWithMask, comparePngs, expectBoxClose, expectMaskedBelow } from './helpers';

const tabs = ['Home', 'Insert', 'Page Layout', 'Formulas', 'Data', 'Review', 'View', 'Settings'];
const iconSelectors = '.gc-designer-ribbon-icon, .gc-designer-ribbon-button-icon, .gc-designer-ribbon-list-triangle, .gc-designer-color-preview, .gc-designer-ribbon-group-indicator-icon, .gc-designer-ribbon-tab-collapsed-button, .ribbon-button-thumbnail-group-icon, .gc-designer-fontsize-arrow, .gc-theme-setting-icon-border, .gc-theme-sub-icon';

async function selectTab(page: Page, label: string): Promise<void> {
  // Narrow ribbons scroll the tab rail; activation through the observed DOM
  // avoids scrolling the whole page and changing the comparison origin.
  await page.evaluate((label) => {
    const tab = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-tab-nav-text')].find((e) => e.getAttribute('aria-label') === label);
    tab?.click();
  }, label);
  await page.waitForTimeout(150);
}

async function layout(page: Page) {
  return page.evaluate(() => {
    const box = (e: Element) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const groups = [...document.querySelectorAll('.gc-designer-ribbon-group, .gcd-ribbon-group')].map((e) => ({
      collapsed: e.classList.contains('gcd-ribbon-group'),
      label: (e.querySelector('.gc-designer-ribbon-group-title')?.textContent ?? e.querySelector('.gc-designer-ribbon-text')?.textContent ?? '').trim(),
      box: box(e),
    }));
    const controls: Record<string, ReturnType<typeof box>> = {};
    for (const e of document.querySelectorAll<HTMLElement>('[data-command^="ribbon."]')) {
      const b = box(e), name = e.dataset.command!;
      if (b.width && b.height && (!controls[name] || controls[name].width * controls[name].height < b.width * b.height)) controls[name] = b;
    }
    const launchers = [...document.querySelectorAll('.gc-designer-ribbon-group-indicator')].map(box);
    return { groups, controls, launchers };
  });
}

for (const dpr of [1, 2]) {
  for (const width of [1280, 1024, 640]) {
    for (const tab of tabs) {
      test(`${tab} at ${width}: adaptive DOM and ribbon pixel gates${dpr === 2 ? ' DPR 2' : ''}`, async ({ browser }, testInfo) => {
        const official = await browser.newPage({ viewport: { width, height: 720 }, deviceScaleFactor: dpr });
        const ours = await browser.newPage({ viewport: { width, height: 720 }, deviceScaleFactor: dpr });
        try {
          await boot(official, 'official');
          await boot(ours, 'ours');
          await selectTab(official, tab);
          await selectTab(ours, tab);
          const [reference, actual] = await Promise.all([layout(official), layout(ours)]);
          const license = await official.evaluate(() => {
            const e = document.querySelector('[aria-label="SpreadJS Designer License"]');
            if (!e) return [];
            const r = e.getBoundingClientRect();
            return [{ x: r.x, y: r.y, width: r.width, height: r.height }];
          });
          const clip = { x: 0, y: 0, width, height: 142 };
          const [a, b] = await Promise.all([
            captureWithMask(official, clip, iconSelectors.split(', '), license),
            captureWithMask(ours, clip, iconSelectors.split(', ')),
          ]);
          const pixels = comparePngs(a.png, b.png, a.mask, b.mask);
          const reportPath = testInfo.outputPath('layout-and-pixels.json');
          await writeFile(reportPath, JSON.stringify({ width, tab, dpr, reference, actual, pixels, percentage: pixels.masked / pixels.denom * 100 }, null, 2));
          await testInfo.attach('layout-and-pixels.json', { path: reportPath, contentType: 'application/json' });
          for (const [side, page] of [['official', official], ['ours', ours]] as const) {
            const path = testInfo.outputPath(`${side}.png`);
            await page.screenshot({ clip, path });
            await testInfo.attach(`${side}.png`, { path, contentType: 'image/png' });
          }
          console.log(`${tab} ${width}: ${(pixels.masked / pixels.denom * 100).toFixed(3)}%`);
          expect.soft(actual.groups.map(({ label, collapsed }) => ({ label, collapsed }))).toEqual(reference.groups.map(({ label, collapsed }) => ({ label, collapsed })));
          // The trial does not annotate its colour/theme widgets with data-command;
          // compare every annotated reference control and the complete group layout.
          expect.soft(Object.keys(reference.controls).filter((name) => !actual.controls[name])).toEqual([]);
          expect.soft(actual.launchers.length).toBe(reference.launchers.length);
          for (let i = 0; i < reference.groups.length; i++) if (actual.groups[i]) expectBoxClose(actual.groups[i].box, reference.groups[i].box, 1, `${tab} ${reference.groups[i].label}`);
          for (const [command, expected] of Object.entries(reference.controls)) if (actual.controls[command]) expectBoxClose(actual.controls[command], expected, 1, command);
          for (let i = 0; i < reference.launchers.length; i++) if (actual.launchers[i]) expectBoxClose(actual.launchers[i], reference.launchers[i], 1, 'dialog launcher');
          expectMaskedBelow(pixels, 0.5);
        } finally {
          await official.close();
          await ours.close();
        }
      });
    }
  }

}

test('descending 1920–500 resize sweep reproduces collapse order on every tab', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const official = await browser.newPage({ viewport: { width: 1920, height: 720 } });
  const ours = await browser.newPage({ viewport: { width: 1920, height: 720 } });
  const measurements: unknown[] = [];
  try {
    await boot(official, 'official'); await boot(ours, 'ours');
    for (const tab of tabs) {
      await selectTab(official, tab); await selectTab(ours, tab);
      for (const width of [...Array.from({ length: 29 }, (_, i) => 1920 - 50 * i), 500]) {
        await official.setViewportSize({ width, height: 720 });
        await ours.setViewportSize({ width, height: 720 });
        await official.waitForTimeout(50);
        const [reference, actual] = await Promise.all([layout(official), layout(ours)]);
        const states = (groups: typeof reference.groups) => groups.map(({ label, collapsed }) => ({ label, collapsed }));
        measurements.push({ tab, width, groups: reference.groups });
        expect.soft(states(actual.groups), `${tab} ${width}`).toEqual(states(reference.groups));
      }
    }
  } finally {
    const path = testInfo.outputPath('resize-sweep.json');
    await writeFile(path, JSON.stringify(measurements, null, 2));
    await testInfo.attach('resize-sweep.json', { path, contentType: 'application/json' });
    await official.close(); await ours.close();
  }
});
