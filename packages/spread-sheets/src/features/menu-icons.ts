/** Independently drawn menu icons. No reference image data is used. */
export function menuIcon(kind: string, size = 16): HTMLCanvasElement {
  const canvas = document.createElement('canvas'), dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr * size / 16, dpr * size / 16);
  ctx.lineWidth = 1; ctx.strokeStyle = '#739cc9'; ctx.fillStyle = 'white';
  const line = (...xy: number[]) => { ctx.beginPath(); ctx.moveTo(xy[0], xy[1]); for (let i = 2; i < xy.length; i += 2) ctx.lineTo(xy[i], xy[i + 1]); ctx.stroke(); };
  const page = (x: number, y: number) => { ctx.fillRect(x, y, 8, 11); ctx.strokeRect(x + .5, y + .5, 8, 11); line(x + 5, y, x + 5, y + 3, x + 8, y + 3); };
  if (/sort|asc|desc/i.test(kind)) {
    ctx.font = '9px Arial'; ctx.fillStyle = '#30bed5'; ctx.fillText(/desc/i.test(kind) ? 'Z' : 'A', 0, 7);
    ctx.fillStyle = '#e89c25'; ctx.fillText(/desc/i.test(kind) ? 'A' : 'Z', 0, 15);
    ctx.strokeStyle = '#929998'; line(11, 1, 11, 13, 8, 10); line(11, 13, 14, 10);
  } else if (/cut/i.test(kind)) {
    ctx.strokeStyle = '#2c5fa0'; ctx.beginPath(); ctx.ellipse(3, 11, 2, 2, 0, 0, Math.PI * 2); ctx.ellipse(11, 11, 2, 2, 0, 0, Math.PI * 2); ctx.stroke(); line(4, 9, 10, 1); line(10, 9, 4, 1);
  } else if (/copy/i.test(kind)) { page(1, 1); page(6, 4); }
  else if (/paste/i.test(kind)) {
    ctx.fillStyle = '#ffd769'; ctx.strokeStyle = '#ae9247'; ctx.fillRect(1, 3, 10, 12); ctx.strokeRect(1.5, 3.5, 10, 12);
    ctx.fillStyle = '#c6cbcb'; ctx.strokeStyle = '#717776'; ctx.fillRect(4, 1, 5, 4); ctx.strokeRect(4.5, 1.5, 5, 3);
    page(7, 6);
    ctx.font = '7px Arial'; ctx.fillStyle = '#385c86';
    if (/formula/i.test(kind)) ctx.fillText('ƒx', 6, 15);
    else if (/value/i.test(kind)) ctx.fillText('123', 5, 15);
    if (/format/i.test(kind)) { ctx.strokeStyle = '#4778b2'; ctx.lineWidth = 2; line(12, 9, 8, 14); }
  } else if (/comment/i.test(kind)) {
    ctx.strokeStyle = '#9d9d9d'; ctx.fillStyle = '#fffbc6'; ctx.fillRect(2, 3, 12, 8); ctx.strokeRect(2.5, 3.5, 12, 8); line(5, 11, 3, 14, 3, 11);
    ctx.strokeStyle = '#268f48'; line(1, 1, 1, 7); line(0, 4, 5, 4);
  } else if (/clear|filter/i.test(kind)) {
    ctx.fillStyle = '#8a9094'; ctx.beginPath(); ctx.moveTo(1, 2); ctx.lineTo(14, 2); ctx.lineTo(9, 8); ctx.lineTo(9, 14); ctx.lineTo(6, 12); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill();
    if (/clear/i.test(kind)) { ctx.strokeStyle = '#737373'; line(7, 7, 14, 14); line(14, 7, 7, 14); }
  } else if (/check/i.test(kind)) { ctx.strokeStyle = '#73785c'; ctx.lineWidth = 2; if (/uncheck/i.test(kind)) { line(4, 4, 11, 11); line(11, 4, 4, 11); } else line(2, 8, 6, 11, 12, 4); }
  return canvas;
}
