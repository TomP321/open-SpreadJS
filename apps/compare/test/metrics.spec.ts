import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
test('records public runtime geometry, styling and exposed DOM classes', async ({ page }) => {
  await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
  const metrics = await page.evaluate(() => {
    const s = window.__compare!.official.getActiveSheet();
    const host = document.querySelector('#official-pane')!;
    const nodes = [...host.querySelectorAll<HTMLElement>('[class]')].filter(node => node.getBoundingClientRect().width > 0).map(node => {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect(), root = host.getBoundingClientRect();
      return { className: node.className, x: rect.x - root.x, y: rect.y - root.y, width: rect.width, height: rect.height, backgroundColor: style.backgroundColor, borderColor: style.borderColor, font: style.font };
    });
    return { measuredAt: new Date().toISOString(), devicePixelRatio, firstCell: s.getCellRect(0, 0), secondCell: s.getCellRect(1, 1), style: { font: s.getActualStyle(0, 0).font, hAlign: s.getActualStyle(0, 0).hAlign, vAlign: s.getActualStyle(0, 0).vAlign }, gridline: s.options.gridline, nodes };
  });
  expect(metrics.firstCell).toMatchObject({ x: 40, y: 20, width: 62, height: 20 });
  await fs.mkdir(path.resolve('../../test-results/compare'), { recursive: true });
  await fs.writeFile(path.resolve('../../test-results/compare/runtime-metrics.json'), JSON.stringify(metrics, null, 2));
});
