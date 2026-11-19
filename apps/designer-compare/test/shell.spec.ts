/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import { boot, captureWithMask, comparePngs, expectBoxClose, expectMaskedBelow } from './helpers';

interface ControlLayout { label: string; box: { x: number; y: number; width: number; height: number }; enabled: boolean }
interface RibbonLayout {
  tabs: { label: string; box: any; selected: boolean; weight: string }[];
  groups: { label: string; box: any }[];
  titles: { text: string; box: any }[];
  controls: Record<string, ControlLayout>;
  icons: { x: number; y: number; width: number; height: number }[];
}

async function ribbonLayout(page: any): Promise<RibbonLayout> {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const r = element.getBoundingClientRect();
      return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2) };
    };
    const tabs = [...document.querySelectorAll('.gc-designer-ribbon-tab-nav-text')]
      .filter((element) => element.getAttribute('aria-label') !== 'SpreadJS Designer License')
      .map((element) => ({
        label: element.getAttribute('aria-label') || element.textContent || '',
        box: rect(element),
        selected: element.classList.contains('selected'),
        weight: getComputedStyle(element.querySelector('.sd-text-content') ?? element).fontWeight,
      }));
    const groups = [...document.querySelectorAll('.gc-designer-ribbon-group')].map((element) => ({
      label: element.querySelector('.gc-designer-ribbon-group-title')?.textContent ?? '',
      box: rect(element),
    }));
    const titles = [...document.querySelectorAll('.gc-designer-ribbon-group-title')].map((element) => ({ text: element.textContent ?? '', box: rect(element) }));
    const controls: Record<string, ControlLayout> = {};
    for (const element of document.querySelectorAll('[data-command^="ribbon."]')) {
      const command = (element as HTMLElement).dataset.command!;
      const box = rect(element);
      if (box.width <= 0 || box.height <= 0) continue;
      const area = box.width * box.height;
      const previous = controls[command];
      if (previous && previous.box.width * previous.box.height >= area) continue;
      const label = element.getAttribute('aria-label') || element.getAttribute('title') || (element.textContent ?? '').trim();
      controls[command] = {
        label,
        box,
        enabled: element.getAttribute('aria-disabled') !== 'true' && !element.classList.contains('gc-designer-ribbon-button-disable') && !element.classList.contains('gc-designer-ribbon-list-disabled'),
      };
    }
    const iconSelectors = '.gc-designer-ribbon-icon, .gc-designer-ribbon-list-triangle, .gc-designer-color-preview, .gc-designer-ribbon-group-indicator-icon, .ribbon-button-thumbnail-group-icon';
    const icons = [...document.querySelectorAll(iconSelectors)].map((element) => rect(element)).filter((box) => box.width > 0 && box.height > 0 && box.y < 142);
    return { tabs, groups, titles, controls, icons };
  });
}

function compareLayouts(official: RibbonLayout, ours: RibbonLayout): void {
  expect(ours.tabs.map((t) => t.label)).toEqual(official.tabs.map((t) => t.label));
  for (let i = 0; i < official.tabs.length; i++) {
    expectBoxClose(ours.tabs[i].box, official.tabs[i].box, 1, `tab ${official.tabs[i].label}`);
    expect(ours.tabs[i].selected).toBe(official.tabs[i].selected);
    expect(ours.tabs[i].weight).toBe(official.tabs[i].weight);
  }
  expect(ours.groups.map((g) => g.label)).toEqual(official.groups.map((g) => g.label));
  for (let i = 0; i < official.groups.length; i++) expectBoxClose(ours.groups[i].box, official.groups[i].box, 1, `group ${official.groups[i].label}`);
  expect(ours.titles.map((t) => t.text)).toEqual(official.titles.map((t) => t.text));
  for (let i = 0; i < official.titles.length; i++) expectBoxClose(ours.titles[i].box, official.titles[i].box, 1, `title ${official.titles[i].text}`);
  expect(Object.keys(official.controls).filter((name) => !ours.controls[name])).toEqual([]);
  for (const [name, control] of Object.entries(official.controls)) {
    const actual = ours.controls[name];
    expect(actual, name).toBeTruthy();
    expectBoxClose(actual.box, control.box, 1, name);
    expect(actual.enabled, `${name} enabled`).toBe(control.enabled);
    expect(actual.label, `${name} label`).toBe(control.label);
  }
}

test.describe('designer shell', () => {
  test('ribbon tabs, groups and Home controls match the trial layout', async ({ browser }) => {
    const officialPage = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const oursPage = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    await boot(officialPage, 'official');
    await boot(oursPage, 'ours');
    const [official, ours] = await Promise.all([ribbonLayout(officialPage), ribbonLayout(oursPage)]);
    compareLayouts(official, ours);
    // Icon boxes are ours by rule, but must occupy the same positions and sizes.
    expect(ours.icons.length).toBeGreaterThan(20);
    expect(official.icons.length).toBeGreaterThan(20);
    expect(ours.icons.length).toBe(official.icons.length);
    const used = new Set<number>();
    for (let i = 0; i < official.icons.length; i++) {
      const target = official.icons[i];
      const match = ours.icons.findIndex((box, index) => !used.has(index) && Math.abs(box.width - target.width) <= 1 && Math.abs(box.height - target.height) <= 1 && Math.abs(box.x - target.x) <= 1 && Math.abs(box.y - target.y) <= 1);
      expect(match, `icon box at ${target.x},${target.y} ${target.width}x${target.height}`).toBeGreaterThanOrEqual(0);
      used.add(match);
    }
    await officialPage.close();
    await oursPage.close();
  });

  test('ribbon pixels match excluding icons and the trial-only license tab', async ({ browser }) => {
    const officialPage = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const oursPage = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    await boot(officialPage, 'official');
    await boot(oursPage, 'ours');
    const clip = { x: 0, y: 0, width: 1440, height: 142 };
    const license = await officialPage.evaluate(() => {
      const element = [...document.querySelectorAll('.gc-designer-ribbon-tab-nav-text')]
        .find((candidate) => candidate.getAttribute('aria-label') === 'SpreadJS Designer License');
      if (!element) return [];
      const r = element.getBoundingClientRect();
      return [{ x: r.x, y: r.y, width: r.width, height: r.height }];
    });
    const masks = '.gc-designer-ribbon-icon, .gc-designer-ribbon-button-icon, .gc-designer-ribbon-list-triangle, .gc-designer-color-preview, .gc-designer-ribbon-group-indicator, .gc-designer-ribbon-tab-collapsed-button, .ribbon-button-thumbnail-group-icon, .gc-designer-fontsize-arrow, .sd-text-placeholer';
    const [official, ours] = await Promise.all([
      captureWithMask(officialPage, clip, masks.split(', '), license.map((box) => ({ ...box, y: box.y }))),
      captureWithMask(oursPage, clip, masks.split(', ')),
    ]);
    const result = comparePngs(official.png, ours.png, official.mask, ours.mask);
    expectMaskedBelow(result, 0.5);
    await officialPage.close();
    await oursPage.close();
  });
});
