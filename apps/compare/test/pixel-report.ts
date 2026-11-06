import fs from 'node:fs/promises';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
export const directory = path.resolve('../../test-results/compare');
export interface Rect { x: number; y: number; width: number; height: number }
export interface Regions { content: Rect[]; headers: Rect[]; tabs: Rect[] }
export const limits = { content: 0.005, headers: 0.005, tabs: 0.01 };
export function measurePanes(reference: Buffer, implementation: Buffer, regions: Regions, scale = 1) {
  const original = PNG.sync.read(reference), actual = PNG.sync.read(implementation);
  if (original.width !== actual.width || original.height !== actual.height) throw new Error('Pane dimensions must match');
  const { width, height } = original;
  const mask = { x: width - 370 * scale, y: height - 115 * scale, width: 350 * scale, height: 80 * scale };
  for (let y = mask.y; y < mask.y + mask.height; y++) for (let x = mask.x; x < mask.x + mask.width; x++) {
    const index = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) original.data[index + c] = actual.data[index + c] = 255;
  }
  const diff = new PNG({ width, height });
  pixelmatch(original.data, actual.data, diff.data, width, height, { threshold: 0.1 });
  for (const rects of Object.values(regions)) for (const rect of rects) if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width < 0 || rect.height < 0) throw new Error('Invalid comparison region');
  const metrics = Object.fromEntries(Object.entries(regions).map(([name, rects]) => {
    let pixels = 0, area = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (!rects.some((r: Rect) => x >= Math.floor(r.x * scale) && x < Math.ceil((r.x + r.width) * scale) && y >= Math.floor(r.y * scale) && y < Math.ceil((r.y + r.height) * scale))) continue;
      if (x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height) continue;
      area++;
      const i = (y * width + x) * 4;
      if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) pixels++;
    }
    return [name, { pixels, area, ratio: area ? pixels / area : 0, threshold: limits[name as keyof Regions] }];
  })) as Record<keyof Regions, { pixels: number; area: number; ratio: number; threshold: number }>;
  return { width, height, mask, regions, metrics, diff };
}
export async function comparePanes(name: string, reference: Buffer, implementation: Buffer, regions: Regions, scale = 1) {
  const { diff, ...result } = measurePanes(reference, implementation, regions, scale);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${name}-diff.png`), PNG.sync.write(diff));
  await fs.writeFile(path.join(directory, `${name}-diff.json`), JSON.stringify({ scenario: name, ...result }, null, 2));
  return result.metrics;
}
export default async function report() {
  await fs.mkdir(directory, { recursive: true });
  const entries = await Promise.all((await fs.readdir(directory)).filter(file => file.endsWith('-diff.json')).map(async file => JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) as { scenario: string; metrics?: ReturnType<typeof measurePanes>['metrics'] }));
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>OpenSheets black-box comparison</title><style>body{font:14px system-ui;margin:24px;color:#243148}article{border-top:1px solid #ccc;padding:16px 0}.panes{display:flex;gap:12px}.panes figure{margin:0;min-width:0;flex:1}img{width:100%;border:1px solid #ccc}figcaption{margin:8px 0}.pass{color:#217346}.fail{color:#b42318}</style><h1>Rendering comparison</h1><p>Pixelmatch threshold 0.1, antialias pixels excluded. Content union bounding box &lt;0.5%, headers &lt;0.5%, tab strip &lt;1%. The fixed trial watermark is excluded from numerator and denominator. Original captures are unmodified.</p>${entries.filter(entry => entry.metrics).map(entry => `<article><h2>${entry.scenario}</h2><p>${Object.entries(entry.metrics!).map(([name, m]) => `<span class="${m.ratio < m.threshold ? 'pass' : 'fail'}">${name}: ${(m.ratio * 100).toFixed(3)}% (${m.pixels}/${m.area})</span>`).join(' · ')}</p><div class="panes">${['official', 'ours', 'diff'].map(pane => `<figure><figcaption>${pane}</figcaption><a href="${entry.scenario}-${pane}.png"><img src="${entry.scenario}-${pane}.png"></a></figure>`).join('')}</div></article>`).join('')}</html>`;
  await fs.writeFile(path.join(directory, 'report.html'), html);
}
