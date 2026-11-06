import fs from 'node:fs/promises';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
export const directory = path.resolve('../../test-results/compare');
export async function comparePanes(name: string, reference: Buffer, implementation: Buffer) {
  const original = PNG.sync.read(reference), actual = PNG.sync.read(implementation);
  if (original.width !== actual.width || original.height !== actual.height) throw new Error('Pane dimensions must match');
  const { width, height } = original;
  const mask = { x: width - 370, y: height - 115, width: 350, height: 80 };
  for (let y = mask.y; y < mask.y + mask.height; y++) for (let x = mask.x; x < mask.x + mask.width; x++) {
    const index = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) original.data[index + c] = actual.data[index + c] = 255;
  }
  const diff = new PNG({ width, height });
  const pixels = pixelmatch(original.data, actual.data, diff.data, width, height, { threshold: 0.1 });
  const ratio = pixels / (width * height - mask.width * mask.height);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${name}-diff.png`), PNG.sync.write(diff));
  await fs.writeFile(path.join(directory, `${name}-diff.json`), JSON.stringify({ scenario: name, width, height, pixels, ratio, threshold: 0.01, mask }, null, 2));
  return ratio;
}
export default async function report() {
  await fs.mkdir(directory, { recursive: true });
  const entries = await Promise.all((await fs.readdir(directory)).filter(file => file.endsWith('-diff.json')).map(async file => JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) as { scenario: string; ratio: number; pixels: number }));
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>OpenSheets black-box comparison</title><style>body{font:14px system-ui;margin:24px;color:#243148}article{border-top:1px solid #ccc;padding:16px 0}.panes{display:flex;gap:12px}.panes figure{margin:0;min-width:0;flex:1}img{width:100%;border:1px solid #ccc}figcaption{margin:8px 0}.pass{color:#217346}.fail{color:#b42318}</style><h1>Rendering comparison</h1><p>Pixelmatch threshold 0.1, antialias pixels excluded. Target &lt;1% of compared pixels per scenario. Only the fixed trial watermark rectangle is masked. Original captures are shown unmodified.</p>${entries.map(entry => `<article><h2 class="${entry.ratio < 0.01 ? 'pass' : 'fail'}">${entry.scenario}: ${(entry.ratio * 100).toFixed(3)}% (${entry.pixels} pixels)</h2><div class="panes">${['official', 'ours', 'diff'].map(pane => `<figure><figcaption>${pane}</figcaption><a href="${entry.scenario}-${pane}.png"><img src="${entry.scenario}-${pane}.png"></a></figure>`).join('')}</div></article>`).join('')}</html>`;
  await fs.writeFile(path.join(directory, 'report.html'), html);
}
