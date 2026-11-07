/** Independently drawn menu icons. No reference image data is used. */
export function menuIcon(kind: string, size = 16): HTMLCanvasElement {
  const canvas = document.createElement('canvas'), dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr * size / 16, dpr * size / 16);
  ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.strokeStyle = '#739cc9'; ctx.fillStyle = 'white';
  const line = (...xy: number[]) => { ctx.beginPath(); ctx.moveTo(xy[0], xy[1]); for (let i = 2; i < xy.length; i += 2) ctx.lineTo(xy[i], xy[i + 1]); ctx.stroke(); };
  const page = (x: number, y: number, w = 8, h = 11, stroke = '#739cc9', fill = 'white') => {
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.fillRect(x, y, w, h); ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x + w - 3, y + .5); ctx.lineTo(x + w - .5, y + 3.5); ctx.lineTo(x + w - 3, y + 3.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = stroke; line(x + w - 3, y + .5, x + w - .5, y + 3.5, x + w - 3, y + 3.5);
  };
  if (/sort|asc|desc/i.test(kind)) {
    ctx.font = '9px Arial'; ctx.fillStyle = '#30bed5'; ctx.fillText(/desc/i.test(kind) ? 'Z' : 'A', 0, 7);
    ctx.fillStyle = '#e89c25'; ctx.fillText(/desc/i.test(kind) ? 'A' : 'Z', 0, 15);
    ctx.strokeStyle = '#929998'; line(11, 1, 11, 13, 8, 10); line(11, 13, 14, 10);
  } else if (/cut/i.test(kind)) {
    ctx.strokeStyle = '#2c5fa0'; ctx.beginPath(); ctx.ellipse(3, 11, 2, 2, 0, 0, Math.PI * 2); ctx.ellipse(11, 11, 2, 2, 0, 0, Math.PI * 2); ctx.stroke(); line(4, 9, 10, 1); line(10, 9, 4, 1);
  } else if (/copy/i.test(kind)) {
    page(0, 0, 8, 11, '#b0c0e0', '#e4ebf9');
    page(6, 2, 9, 12, '#4776c3', 'white');
  } else if (/paste/i.test(kind)) {
    if (size === 24) {
      ctx.scale(2 / 3, 2 / 3);
      const badge = /pasteAll/i.test(kind);
      if (badge) {
        // Paste All: solid clipboard behind a separate document.
        ctx.fillStyle = '#8cbdef'; ctx.fillRect(0, 5, 10, 16);
        ctx.beginPath(); ctx.moveTo(0, 19); ctx.lineTo(0, 21); ctx.lineTo(4, 21); ctx.lineTo(10, 18); ctx.closePath(); ctx.fill();
        ctx.fillRect(16, 3, 2, 5);
      } else {
        const rightBottom = /Formula/i.test(kind) && !/Formatting/i.test(kind) ? 15 : 15;
        ctx.fillStyle = '#8cbdef'; ctx.fillRect(0, 5, 3, 18);
        ctx.beginPath(); ctx.moveTo(0, 21); ctx.lineTo(0, 23); ctx.lineTo(4, 23); ctx.lineTo(10, 20); ctx.closePath(); ctx.fill();
        ctx.fillRect(16, 3, 2, rightBottom - 3);
        ctx.fillStyle = 'white'; ctx.fillRect(3, 5, 13, 18);
      }
      ctx.fillStyle = '#717171'; ctx.fillRect(6, 0, 6, 2); ctx.fillRect(3, 2, 13, 1); ctx.fillRect(2, 3, 14, 1); ctx.fillRect(2, 4, 14, 1);
      ctx.fillStyle = 'white'; ctx.fillRect(8, 1, 2, 1);
      if (badge) {
        ctx.fillStyle = 'white'; ctx.strokeStyle = '#717171'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(10.5, 9.5); ctx.lineTo(17.5, 9.5); ctx.lineTo(20.5, 12.5); ctx.lineTo(20.5, 22.5); ctx.lineTo(10.5, 22.5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(17.5, 9.5); ctx.lineTo(17.5, 12.5); ctx.lineTo(20.5, 12.5); ctx.stroke();
      } else if (/pasteFormulaFormatting/i.test(kind) || /pasteValuesFormatting/i.test(kind) || /pasteFormatting/i.test(kind)) {
        ctx.fillStyle = '#555'; ctx.strokeStyle = '#555';
        ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(5.5, 9, 1.5, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(9.5, 13, 1.5, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(11, 7.5); ctx.lineTo(4, 14.5); ctx.stroke();
        if (/Values/i.test(kind)) { ctx.font = 'bold 9px Arial'; ctx.fillText('123', 8, 23); }
        else if (/Formula/i.test(kind)) { ctx.font = 'italic 14px Georgia'; ctx.fillText('ƒ', 12, 23); ctx.font = 'italic 10px Georgia'; ctx.fillText('x', 19, 23); }
        else {
          ctx.fillStyle = '#777'; ctx.beginPath(); ctx.moveTo(17, 7); ctx.lineTo(21, 9); ctx.lineTo(19, 14); ctx.lineTo(15, 12); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#4e9bcf'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(17, 13); ctx.quadraticCurveTo(13, 15, 5, 22); ctx.stroke();
        }
      } else if (/pasteFormula/i.test(kind)) {
        ctx.fillStyle = '#555'; ctx.font = 'italic 18px Georgia'; ctx.fillText('ƒ', 9, 23); ctx.font = 'italic 13px Georgia'; ctx.fillText('x', 18, 23);
      } else if (/pasteValues/i.test(kind)) {
        ctx.fillStyle = '#555'; ctx.font = 'bold 10px Arial'; ctx.fillText('123', 4, 24);
      }
      return canvas;
    }
    // Paste Options label: amber clipboard behind a blue-edged document.
    ctx.fillStyle = '#f4a227'; ctx.fillRect(0, 1, 9, 13);
    ctx.fillStyle = '#fbcd00'; ctx.fillRect(1, 2, 7, 11);
    ctx.fillStyle = '#ffe197'; ctx.fillRect(1, 2, 1, 11);
    ctx.fillStyle = '#7c8083'; ctx.fillRect(4, 0, 2, 2); ctx.fillRect(3, 1, 4, 3);
    ctx.fillStyle = '#e7e7e7'; ctx.fillRect(4, 1, 2, 2);
    ctx.fillStyle = '#f4f5fb'; ctx.fillRect(7, 5, 8, 10);
    ctx.fillStyle = '#516d9d'; ctx.fillRect(7, 5, 8, 1); ctx.fillRect(7, 5, 1, 10); ctx.fillRect(14, 5, 1, 10); ctx.fillRect(7, 14, 8, 1);
    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.moveTo(12, 5); ctx.lineTo(15, 8); ctx.lineTo(12, 8); ctx.closePath(); ctx.fill();
  } else if (/comment/i.test(kind)) {
    if (/threaded/i.test(kind)) {
      ctx.strokeStyle = '#777'; ctx.fillStyle = 'white'; ctx.fillRect(2, 3, 12, 8); ctx.strokeRect(2.5, 3.5, 12, 8); line(5, 11, 3, 14, 3, 11);
      ctx.strokeStyle = '#48ae72'; ctx.lineWidth = 1.5; line(2, 0, 2, 7); line(0, 3, 6, 3);
    } else {
      ctx.fillStyle = '#fff8ad'; ctx.strokeStyle = '#9d8a45'; ctx.fillRect(0, 2, 12, 11); ctx.strokeRect(.5, 2.5, 11, 10);
      ctx.fillStyle = '#e4d99a'; ctx.beginPath(); ctx.moveTo(9, 13); ctx.lineTo(12, 13); ctx.lineTo(12, 16); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f0a30a'; ctx.lineWidth = 1.5; line(3, 2, 3, -2); line(.5, 0, 5.5, 0); line(1, -1, 5, 3); line(5, -1, 1, 3);
    }
  } else if (/clear|filter/i.test(kind)) {
    ctx.fillStyle = '#8a9094'; ctx.beginPath(); ctx.moveTo(1, 2); ctx.lineTo(14, 2); ctx.lineTo(9, 8); ctx.lineTo(9, 14); ctx.lineTo(6, 12); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill();
    if (/clear/i.test(kind)) { ctx.strokeStyle = '#e34b3c'; ctx.lineWidth = 2; line(7, 7, 14, 14); line(14, 7, 7, 14); }
  } else if (/check/i.test(kind)) { ctx.strokeStyle = '#73785c'; ctx.lineWidth = 2; if (/uncheck/i.test(kind)) { line(4, 4, 11, 11); line(11, 4, 4, 11); } else line(2, 8, 6, 11, 12, 4); }
  return canvas;
}
