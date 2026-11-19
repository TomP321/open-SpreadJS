/**
 * Context-menu / filter-popup pictograms: hand-authored vector art (rects, paths,
 * strokes, a few gradient stops and font glyphs) drawn entirely by us.
 * Geometry is re-measured by eye from black-box comparison captures
 * (.probe/t66 masks); no reference raster data is embedded.
 *
 * The trial ships these pictograms as 1x bitmaps that Chromium upscales
 * smoothly at devicePixelRatio 2. We mirror that mechanism: the art is painted
 * once into an offscreen 1x canvas and blitted with image smoothing, so our
 * vector strokes get the same anti-aliased upscale the trial's sprites get.
 */
const artCache = new Map<string, HTMLCanvasElement>();

export function menuIcon(kind: string, size = 16, dim = false): HTMLCanvasElement {
  const dpr = window.devicePixelRatio || 1;
  const key = `${kind}|${size}|${dim ? 1 : 0}`;
  let art = artCache.get(key);
  if (!art) {
    art = document.createElement('canvas');
    art.width = size; art.height = size;
    const c = art.getContext('2d');
    if (c) drawMenuArt(c, kind, size, dim);
    artCache.set(key, art);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
  // Note: Chromium snaps <canvas> raster to the device grid exactly like the
  // trial's <img> bitmaps (verified black-box: explicit transforms only shift
  // our glyphs away from the trial's), so no manual snap is applied.
  return canvas;
}

type C2D = CanvasRenderingContext2D;

/** fill rect at exact device-pixel bounds */
function fr(c: C2D, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color; c.fillRect(x, y, w, h);
}
/** polyline stroke */
function ln(c: C2D, color: string | CanvasGradient, width: number, ...xy: number[]) {
  c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); c.moveTo(xy[0], xy[1]);
  for (let i = 2; i < xy.length; i += 2) c.lineTo(xy[i], xy[i + 1]);
  c.stroke();
}
function ring(c: C2D, color: string, width: number, x: number, y: number, r: number) {
  c.strokeStyle = color; c.lineWidth = width;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
}
function grad(c: C2D, y0: number, y1: number, top: string, bottom: string) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  return g;
}
/** closed polygon fill */
function path(c: C2D, pts: number[], fill: string) {
  c.fillStyle = fill; c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath(); c.fill();
}

const BLUE = '#8cbdef'; // trial clipboard blue
const CLIP_GREY = '#717171';

/** Grey clip head shared by the 24px clipboard family (measured runs). */
function clipHead24(c: C2D) {
  fr(c, 7, 0, 3, 1, CLIP_GREY);
  fr(c, 6, 1, 2, 1, CLIP_GREY); fr(c, 10, 1, 2, 1, CLIP_GREY);
  fr(c, 4, 2, 4, 1, CLIP_GREY); fr(c, 10, 2, 4, 1, CLIP_GREY);
  fr(c, 3, 3, 12, 2, CLIP_GREY);
}
/** Narrower clip head of the two "%"-combining variants (+2px layout). */
function clipHead24Wide(c: C2D) {
  fr(c, 8, 0, 3, 1, CLIP_GREY);
  fr(c, 8, 1, 1, 1, CLIP_GREY); fr(c, 12, 1, 1, 1, CLIP_GREY);
  fr(c, 7, 2, 2, 1, CLIP_GREY); fr(c, 12, 2, 2, 1, CLIP_GREY);
  fr(c, 5, 3, 10, 2, CLIP_GREY);
}

/**
 * Clip head of the plain clipboard variants, row by row as the trial's bitmap
 * measures: dark knob, a lighter inner window, a white hole through the middle at
 * the second row, then the wide dark bar and a light grey lower edge.
 */
function clipHead24Lite(c: C2D) {
  fr(c, 7.5, 0, 3, 1, CLIP_GREY);
  fr(c, 6, 1, 2, 1, CLIP_GREY); fr(c, 8, 1, 2, 1, '#dadada'); fr(c, 10, 1, 2, 1, CLIP_GREY);
  fr(c, 4.5, 2, 2.5, 1, '#8c8c8c'); fr(c, 6.5, 2, 1.5, 1, CLIP_GREY);
  fr(c, 10, 2, 1.5, 1, CLIP_GREY); fr(c, 11.5, 2, 2.5, 1, '#8c8c8c');
  fr(c, 3.5, 3, 11, 1, CLIP_GREY);
  fr(c, 3, 4, 11.5, 1, CLIP_GREY);
  fr(c, 3.5, 5, 11, 1, '#dbdbdb');
}

/**
 * Clipboard frame of the plain variants: a round-capped left bar that turns into
 * the bottom bar, plus the right bar segments the trial leaves visible.
 */
function clipboardFrame(c: C2D, leftX: number, bottomEnd: number, rightX: number, rightSegs: number[][]) {
  c.strokeStyle = BLUE; c.lineWidth = 2.5; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(leftX, 4.5); c.lineTo(leftX, 20.25); c.lineTo(bottomEnd, 20.25); c.stroke();
  for (const [y0, y1] of rightSegs) { c.beginPath(); c.moveTo(rightX, y0); c.lineTo(rightX, y1); c.stroke(); }
}

/** '123' badge: dark grey digits sitting low enough to touch the icon's bottom edge. */
function digits123(c: C2D, x: number) {
  c.fillStyle = '#6c6c6c'; c.font = '9.5px Arial, sans-serif'; c.fillText('123', x, 23.2);
}

/** Paint brush: thin grey handle to the upper right, a ferrule, blue bristles down left. */
function paintBrush(c: C2D) {
  path(c, [10, 15.6, 14, 17.4, 12.8, 22.4, 6.4, 23.4, 4.2, 21, 6.2, 17.6], '#4a7cb0');
  ln(c, '#b6b6b6', 2.4, 11.6, 17.2, 13.6, 15.4);
  const handle = c.createLinearGradient(13, 0, 20.2, 0);
  handle.addColorStop(0, '#6f6f6f'); handle.addColorStop(1, '#a3a3a3');
  ln(c, handle, 1.7, 13, 16.6, 20.2, 7.8);
}

/** Percent badge of the wide variants: two small outline circles + diagonal slash. */
function percentBadge(c: C2D) {
  ring(c, '#a3a3a3', 1, 7.5, 8.5, 1.8);
  ring(c, '#a3a3a3', 1, 12.5, 12.5, 1.8);
  ln(c, '#a3a3a3', 1, 6.8, 14.3, 13.2, 7.3);
}

/** Percent badge of the "Formatting" variant, placed as the measured runs sit. */
function percentBadgeLite(c: C2D) {
  ring(c, '#a5a5a5', 1.2, 5.6, 9.3, 1.9);
  ring(c, '#a5a5a5', 1.2, 11, 13.6, 1.9);
  ln(c, '#a5a5a5', 1.3, 4.4, 15, 12.2, 7.4);
}

function cursiveFx(c: C2D, fontSize: number, x: number, baseline: number, subSize: number, subX: number, color: string) {
  c.fillStyle = color;
  c.font = `italic ${fontSize}px Georgia, serif`;
  c.fillText('\u0192', x, baseline);
  c.font = `italic ${subSize}px Georgia, serif`;
  c.fillText('x', subX, baseline - 0.5);
}

/** Draw the art for one icon in native 1x pixel space. `dim` is the disabled variant. */
function drawMenuArt(c: C2D, kind: string, size: number, dim = false) {
  c.lineWidth = 1; c.lineJoin = 'round'; c.lineCap = 'butt';
  c.textBaseline = 'alphabetic';

  if (/sort|asc|desc/i.test(kind)) {
    const desc = /desc/i.test(kind);
    // Trial: stacked serif letters (vertical gradients) with a light-to-dark grey
    // shaft and a small solid down head. The colour belongs to the LETTER, not to
    // the row: 'A' is always the blue gradient, 'Z' the amber one, and 'A' is
    // drawn a size larger than 'Z'.
    const blue = (y0: number, y1: number) => grad(c, y0, y1, '#c9e6f5', '#74aede');
    const amber = (y0: number, y1: number) => grad(c, y0, y1, '#f9c95f', '#e8923b');
    c.textBaseline = 'alphabetic';
    const draw = (letter: string, size: number, baseline: number) => {
      c.font = `700 ${size}px Georgia, serif`;
      c.fillStyle = (letter === 'A' ? blue : amber)(baseline - (size === 11 ? 7.6 : 6.2), baseline);
      c.fillText(letter, 0.5, baseline);
    };
    if (desc) { draw('Z', 9, 7.5); draw('A', 11, 15.5); } else { draw('A', 11, 8.5); draw('Z', 9, 15.5); }
    // Shaft and head: the trial paints the shaft as one light-to-dark grey column
    // pair and finishes it with a solid down head that fades toward the tip.
    fr(c, 11, 1, 2, 4, '#c6c6c6');
    fr(c, 11, 5, 2, 3, '#bcbcbc');
    fr(c, 11, 8, 2, 4, '#a8a8a8');
    path(c, [9, 11.75, 15, 11.75, 12, 15.6], '#9c9c9c');
    return;
  }

  if (/cut/i.test(kind)) {
    // Two steel blades crossing near (5.5,7): one from the upper-left tip to the
    // lower-right ring, one from the upper-centre tip down to the lower-left ring.
    ln(c, '#7e99c5', 1.3, 0.4, 2.2, 5.2, 6.6, 9.3, 9.8);
    ln(c, '#7e99c5', 1.3, 5.7, 0.3, 5.6, 5.6, 4.5, 11);
    ring(c, '#4b70b7', 1.3, 3.7, 13, 1.9);
    ring(c, '#4b70b7', 1.3, 10.5, 10.4, 1.9);
    return;
  }

  if (/copy/i.test(kind)) {
    // Back sheet (pale, dark bottom edge) and front sheet with a folded
    // top-right corner; front border is lighter on top, dark navy at the bottom.
    fr(c, 0, 0, 7, 12, '#eef3fb');
    fr(c, 0, 0, 6, 1, '#b9c8e3');
    fr(c, 0, 4, 1, 8, '#8fa3c6');
    fr(c, 0, 6, 7, 1, '#8fa3c6'); // shared mid line (back sheet right side stays visible at x6)
    fr(c, 0, 11, 7, 1, '#2f435c');
    fr(c, 6, 0, 1, 12, '#5d7394');
    // front sheet body, leaving the fold corner out
    c.fillStyle = '#f5f8fd';
    c.beginPath(); c.moveTo(6, 2); c.lineTo(12, 2); c.lineTo(15, 5); c.lineTo(15, 14); c.lineTo(6, 14); c.closePath(); c.fill();
    fr(c, 6, 2, 6, 1, '#93b0ea'); // top border up to the fold
    c.fillStyle = '#c9d6ec';
    c.beginPath(); c.moveTo(12, 2.5); c.lineTo(12, 5.5); c.lineTo(15, 5.5); c.closePath(); c.fill();
    c.strokeStyle = '#5f7ba8'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(12, 2.5); c.lineTo(14.5, 5); c.stroke(); // fold diagonal
    fr(c, 11, 5, 4, 1, '#7f9fdc'); // fold flap bottom
    fr(c, 11, 2, 1, 3, '#7f9fdc'); // fold flap left
    fr(c, 6, 2, 1, 12, '#6b92d3'); // left border
    fr(c, 14, 5, 1, 9, '#8593bd'); // right border
    fr(c, 6, 13, 9, 1, '#2f4f95'); // bottom border
    return;
  }

  if (/paste/i.test(kind)) {
    if (size === 24) drawPasteGallery24(c, kind);
    else drawPasteBadge16(c);
    return;
  }

  if (/comment/i.test(kind)) {
    if (/threaded/i.test(kind)) {
      // Thin grey speech outline open at its top-left, small tail at the bottom,
      // and a 1px green plus crossing the gap.
      ln(c, '#676767', 1, 5.5, 2.5, 13.5, 2.5, 13.5, 11.5, 1.5, 11.5, 1.5, 6);
      ln(c, '#676767', 1, 3, 12, 3, 14.8);
      fr(c, 4, 11.5, 1, 2, '#8b8b8b');
      fr(c, 3, 1, 1, 7, '#45ba6f');
      fr(c, 0, 4, 7, 1, '#45ba6f');
      return;
    }
    // Sticky note: pale body, olive borders (light top/left, dark right/bottom),
    // darker folded corner at the bottom-right and an 8-ray starburst
    // (orange cardinal rays, yellow diagonals, bright core).
    fr(c, 1, 2, 14, 12, '#faf4b5');
    fr(c, 6, 2, 9, 1, '#b2a872');
    fr(c, 1, 5, 1, 8, '#cfc583');
    fr(c, 14, 3, 2, 10, '#5f5633');
    fr(c, 6, 13, 10, 1, '#5f5633');
    fr(c, 1, 11, 1, 2, '#b2a872');
    fr(c, 1, 12, 6, 1, '#b2a872');
    c.fillStyle = '#e9d155';
    c.beginPath(); c.moveTo(7.5, 13); c.lineTo(14, 10); c.lineTo(14, 13); c.closePath(); c.fill();
    c.fillStyle = '#f3e791';
    c.beginPath(); c.moveTo(8.4, 12.4); c.lineTo(13.2, 10.2); c.lineTo(13.2, 12.4); c.closePath(); c.fill();
    ln(c, '#5f5633', 1, 7.9, 13, 14, 10.2);
    // starburst: 1px rays in 8 directions with a bright cross core
    c.fillStyle = '#ffd81e';
    for (const [x, y] of [[0, 0], [1, 1], [2, 2], [6, 0], [5, 1], [4, 2], [0, 6], [1, 5], [2, 4], [6, 6], [5, 5], [4, 4]] as const) c.fillRect(x, y, 1, 1);
    c.fillStyle = '#f7941d';
    fr(c, 3, 0, 1, 2, '#f7941d'); fr(c, 3, 5, 1, 2, '#f7941d');
    fr(c, 0, 3, 2, 1, '#f7941d'); fr(c, 5, 3, 2, 1, '#f7941d');
    c.fillStyle = '#ffdd33';
    c.fillRect(3, 2, 1, 1); c.fillRect(2, 3, 3, 1); c.fillRect(3, 4, 1, 1);
    return;
  }

  if (/listcheck/i.test(kind)) {
    const s = size / 18; c.scale(s, s);
    // 18x18 ring (#999, 1px at the outermost device rows/columns), fill #e5e6e6,
    // thin light-grey check.
    fr(c, 0, 0, 18, 18, '#e5e6e6');
    fr(c, 0, 0, 18, 1, '#999999'); fr(c, 0, 17, 18, 1, '#999999');
    fr(c, 0, 0, 1, 18, '#999999'); fr(c, 17, 0, 1, 18, '#999999');
    ln(c, '#b1b1b1', 1.5, 4.2, 6.8, 7.5, 11.2, 13, 5.3);
    return;
  }

  if (/clear|filter/i.test(kind)) {
    const s = size / 18; c.scale(s, s);
    // Light grey funnel: full-width top band tapering to a narrow stem, slightly
    // darker core in the cone, crossed by a large X.
    c.fillStyle = dim ? '#c3c3c3' : '#c4c4c4';
    c.beginPath();
    c.moveTo(1, 1); c.lineTo(13.5, 1); c.lineTo(13.5, 2.5); c.lineTo(11, 4);
    c.lineTo(9.5, 6); c.lineTo(9.5, 15.5); c.lineTo(6.5, 15.5); c.lineTo(6.5, 6);
    c.lineTo(5, 4); c.lineTo(1, 2.5); c.closePath(); c.fill();
    c.fillStyle = '#b9b9b9';
    c.beginPath();
    c.moveTo(4.5, 4); c.lineTo(10, 4); c.lineTo(8.6, 6); c.lineTo(6.4, 6); c.closePath(); c.fill();
    // The X is always present as a bright #f5f6f6 halo stroke with a darker core arm on
    // top. Active columns paint the core red #dd5b44 (the halo then reads as notches cut
    // through the grey body where the arms cross it); an unfiltered column washes the core
    // out to the neutral light grey #d0d1d1 measured from the trial's dim ghost (visible
    // as faint edges on the white row background, near-invisible on the #c3c3c3 body,
    // while the halo keeps cutting the same bright notches). Measured at 2x (table popup
    // funnel box): no X 243 -> halo only 143 -> halo + grey core 69 px. A wider
    // #d2d3d3 3px outline under a bright core was tried and is worse (126).
    // Re-anchoring the arms to the trial's measured rotated core positions
    // ((8.4,8.1)->(14.9,15.9) and (14.7,9.7)->(8.2,16.9) in 1x) also measured worse
    // (active sheet funnel 178 -> 191): the trial's crisp 2x sprite AA never agrees with
    // our upscaled 1x strokes at those offsets, so the committed centred arms stay.
    ln(c, '#f5f6f6', 3.2, 8.4, 8.4, 15, 15);
    ln(c, '#f5f6f6', 3.2, 14.6, 8.4, 8.4, 16);
    if (dim) {
      ln(c, '#d0d1d1', 1.8, 8.4, 8.4, 15, 15);
      ln(c, '#d0d1d1', 1.8, 14.6, 8.4, 8.4, 16);
    } else {
      ln(c, '#dd5b44', 1.8, 8.4, 8.4, 15, 15);
      ln(c, '#dd5b44', 1.8, 14.6, 8.4, 8.4, 16);
    }
    return;
  }

  if (/check/i.test(kind)) {
    if (/uncheck/i.test(kind)) {
      ln(c, '#72745c', 2.4, 4.1, 5.9, 10.4, 12.2);
      ln(c, '#72745c', 2.4, 10.4, 5.9, 4.1, 12.2);
    } else {
      ln(c, '#72745c', 2, 4, 7, 6.9, 11.6, 12.7, 5);
    }
    return;
  }
}

/** 24px paste gallery: clipboard frame + per-command badge (all measured runs). */
function drawPasteGallery24(c: C2D, kind: string) {
  const all = /pasteAll/i.test(kind);
  const wide = /pasteValuesFormatting|pasteFormulaFormatting/i.test(kind); // trial lays these out 2px right
  if (all) {
    clipHead24(c);
    fr(c, 0, 5, 3, 1, BLUE); fr(c, 14, 5, 3, 1, BLUE);
    fr(c, 0, 6, 18, 13, BLUE);
    fr(c, 1, 19, 8, 1, BLUE); fr(c, 2, 20, 7, 1, BLUE);
    // white document with 1px grey outline and folded top-right corner
    c.fillStyle = '#fdfdfd';
    c.beginPath();
    c.moveTo(10.5, 21.5); c.lineTo(10.5, 9.5); c.lineTo(17, 9.5); c.lineTo(20.5, 13); c.lineTo(20.5, 21.5); c.closePath(); c.fill();
    c.strokeStyle = '#717171'; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(17, 9.5); c.lineTo(17, 13); c.lineTo(20.5, 13); c.stroke();
    return;
  }
  if (/pasteValues$|pasteFormatting/i.test(kind) && !wide) {
    // The Values and Formatting variants: left+bottom bar as one round-capped
    // stroke, right bar as short strokes where the trial leaves them visible.
    clipHead24Lite(c);
    const values = /pasteValues$/i.test(kind);
    clipboardFrame(c, 1.25, 5.5, 16.25, values ? [[4.5, 14.25]] : [[4.5, 9.25], [17.25, 19.25]]);
    if (values) digits123(c, 5); else { percentBadgeLite(c); paintBrush(c); }
    return;
  }
  if (wide) clipHead24Wide(c); else clipHead24(c);
  const leftX = wide ? 2 : 0;
  fr(c, leftX, 5, 3, 15, BLUE);
  const rightX = wide ? 18 : 14;
  const rightH = /pasteValues$/i.test(kind) ? 10 : /pasteFormatting/i.test(kind) ? 4 : /pasteFormulaFormatting/i.test(kind) ? 6 : 1;
  fr(c, rightX, 5, 3, rightH, BLUE);
  if (/pasteValues$/i.test(kind)) { fr(c, 0, 19, 6, 1, BLUE); fr(c, 1, 20, 5, 1, BLUE); fr(c, 2, 21, 3, 1, BLUE); }
  else if (/pasteValuesFormatting/i.test(kind)) { fr(c, 2, 19, 5, 3, BLUE); }
  else if (wide) { fr(c, 2, 19, 8, 2, BLUE); fr(c, 3, 21, 6, 1, BLUE); }
  else { fr(c, 0, 19, 9, 1, BLUE); fr(c, 1, 20, 8, 1, BLUE); fr(c, 2, 21, 6, 1, BLUE); }

  if (/pasteFormulaFormatting/i.test(kind)) {
    percentBadge(c);
    cursiveFx(c, 13, 13.5, 21, 9, 18.5, '#6a6a6a');
  } else if (/pasteValuesFormatting/i.test(kind)) {
    percentBadge(c);
    c.fillStyle = '#8f8f8f'; c.font = '9px Arial, sans-serif'; c.fillText('123', 7.5, 22.5);
  } else if (/pasteFormula$/i.test(kind)) {
    cursiveFx(c, 19, 9.5, 22.5, 11, 14.5, '#6a6a6a');
  }
}

/** 16px "Paste Options:" header icon: amber clipboard + blue-edged white sheet. */
function drawPasteBadge16(c: C2D) {
  // clipboard body x0..6 y3..13 with lighter inner stripe and darker left edge
  fr(c, 0, 3, 6, 11, '#f6c30a');
  fr(c, 0, 3, 1, 11, '#ef9d28');
  fr(c, 1, 3, 1, 10, '#ffd94f');
  fr(c, 0, 13, 6, 1, '#f6c30a');
  // clip: dark bar + light handle
  fr(c, 3, 3, 6, 1, '#263447');
  fr(c, 4, 1, 4, 2, '#d0d5df');
  fr(c, 4, 0, 4, 1, '#525c6d');
  fr(c, 3, 1, 1, 2, '#4d586a'); fr(c, 8, 1, 1, 2, '#4d586a');
  // white sheet x6..15 y5..15 with folded top-right corner
  c.fillStyle = '#f7f9fd';
  c.beginPath();
  c.moveTo(6.5, 5.5); c.lineTo(6.5, 14.5); c.lineTo(14.5, 14.5); c.lineTo(14.5, 8); c.lineTo(12, 5.5); c.closePath(); c.fill();
  fr(c, 6, 5, 7, 1, '#5e83c4'); // top border to the fold
  fr(c, 6, 5, 1, 11, '#5e83c4');
  fr(c, 6, 15, 10, 1, '#5e83c4');
  fr(c, 14, 8, 1, 7, '#5e83c4');
  c.fillStyle = '#c9d7ee';
  c.beginPath(); c.moveTo(12, 5.5); c.lineTo(12, 8); c.lineTo(14.5, 8); c.closePath(); c.fill();
  c.strokeStyle = '#5e83c4'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(12, 5.5); c.lineTo(14.5, 8); c.stroke();
}
