/* eslint-disable @typescript-eslint/no-explicit-any */
import './style.css';
import { applyWorkbookContract } from './workbook-script';

const params = new URLSearchParams(location.search);
const side = params.get('side');
const embed = params.get('embed') === '1';

async function bootSide(host: HTMLElement) {
  const result = side === 'official' ? await (await import('./official')).bootOfficial(host) : await (await import('./ours')).bootOurs(host);
  const spread = result.designer.getWorkbook();
  applyWorkbookContract(spread);
  (window as any).__designerCompare = { ...result, spread, ready: true };
  document.body.dataset.ready = 'true';
}

function layout() {
  const root = document.getElementById('root')!;
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;width:100%;height:100%';
  const lang = params.get('lang') === 'it' ? '&lang=it' : '';
  const left = document.createElement('iframe');
  left.name = 'official';
  left.title = 'official';
  left.src = location.pathname + `?side=official&embed=1${lang}`;
  left.style.cssText = 'flex:1;border:0;border-right:1px solid #888;height:100%';
  const right = document.createElement('iframe');
  right.name = 'ours';
  right.title = 'ours';
  right.src = location.pathname + `?side=ours&embed=1${lang}`;
  right.style.cssText = 'flex:1;border:0;height:100%';
  d.append(left, right);
  root.append(d);
}

if (!side) {
  layout();
} else if (embed) {
  document.body.style.width = '100%';
  document.body.style.height = '100%';
  const host = document.createElement('div');
  host.id = 'designer-host';
  host.style.cssText = 'width:100%;height:100%;position:relative';
  document.getElementById('root')!.append(host);
  bootSide(host).catch((error) => {
    console.error(error);
    document.body.dataset.error = String(error?.stack ?? error);
    const pre = document.createElement('pre');
    pre.textContent = String(error?.stack ?? error);
    document.getElementById('root')!.append(pre);
  });
} else {
  const host = document.createElement('div');
  host.id = 'designer-host';
  host.style.cssText = 'width:100%;height:100%';
  document.getElementById('root')!.append(host);
  bootSide(host).catch((error) => {
    console.error(error);
    document.body.dataset.error = String(error?.stack ?? error);
  });
}
