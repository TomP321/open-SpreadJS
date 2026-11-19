/**
 * Vector glyphs for data features. Every shape is authored here with canvas
 * paths, arcs and gradients; nothing in this module is sampled raster data.
 */

export interface FilterGlyphState {
  filtered?: boolean;
  sort?: number;
}

interface Palette { fill: string; light: string; dark: string }

const RED: Palette = { fill: '#d86344', light: '#ea9a82', dark: '#9e381c' };
const YELLOW: Palette = { fill: '#eac282', light: '#f3dcb2', dark: '#a4802b' };
const GREEN: Palette = { fill: '#76a797', light: '#a6c7bc', dark: '#326f5b' };
const GRAY: Palette = { fill: '#808080', light: '#a0a0a0', dark: '#4d4d4d' };
const BLUE = '#4d82b8';
const LIGHT_BLUE = '#8ea6df';
const DARK_BLUE = '#3d4f9f';

function paintArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  rotation: number,
  palette: Palette,
): void {
  const half = size / 2;
  const top = -half * 0.85;
  const headHeight = size * 0.38;
  const headWidth = size * (palette === GRAY ? 0.85 : 0.75);
  const shaftWidth = size * 0.26;
  const bottom = half * 0.85;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(headWidth / 2, top + headHeight);
  ctx.lineTo(shaftWidth / 2, top + headHeight);
  ctx.lineTo(shaftWidth / 2, bottom);
  ctx.lineTo(-shaftWidth / 2, bottom);
  ctx.lineTo(-shaftWidth / 2, top + headHeight);
  ctx.lineTo(-headWidth / 2, top + headHeight);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(-half * 0.5, -half * 0.5, half * 0.55, half * 0.55);
  gradient.addColorStop(0, palette.light);
  gradient.addColorStop(0.52, palette.fill);
  gradient.addColorStop(1, palette.fill);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = Math.max(0.75, size / 24);
  ctx.stroke();
  // A thin highlight along the leading edge gives the block arrow its bevel.
  ctx.beginPath();
  ctx.moveTo(-shaftWidth * 0.28, top + headHeight + 1);
  ctx.lineTo(-shaftWidth * 0.28, bottom - 1);
  ctx.strokeStyle = palette.light;
  ctx.lineWidth = Math.max(0.5, size / 36);
  ctx.stroke();
  ctx.restore();
}

function paintTriangle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  direction: 'up' | 'down' | 'flat',
  palette: Palette,
): void {
  const half = size / 2;
  ctx.save();
  ctx.beginPath();
  if (direction === 'flat') {
    ctx.roundRect(cx - half * 0.82, cy - half * 0.18, size * 0.82, size * 0.36, size * 0.05);
  } else if (direction === 'down') {
    ctx.moveTo(cx - half * 0.82, cy - half * 0.55);
    ctx.lineTo(cx + half * 0.82, cy - half * 0.55);
    ctx.lineTo(cx, cy + half * 0.72);
  } else {
    ctx.moveTo(cx, cy - half * 0.72);
    ctx.lineTo(cx + half * 0.82, cy + half * 0.55);
    ctx.lineTo(cx - half * 0.82, cy + half * 0.55);
  }
  ctx.closePath();
  const gradient = ctx.createLinearGradient(cx, cy - half, cx, cy + half);
  gradient.addColorStop(0, palette.light);
  gradient.addColorStop(1, palette.fill);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = Math.max(0.75, size / 24);
  ctx.stroke();
  ctx.restore();
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number): void {
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function paintStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, index: number): void {
  const outer = size * 0.47;
  const inner = size * 0.21;
  ctx.save();
  ctx.beginPath();
  starPath(ctx, cx, cy, outer, inner);
  if (index === 2) {
    ctx.fillStyle = YELLOW.fill;
    ctx.fill();
    ctx.strokeStyle = YELLOW.dark;
  } else if (index === 1) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = YELLOW.fill;
    ctx.fillRect(cx - outer, cy - outer, outer, outer * 2);
    ctx.restore();
    ctx.strokeStyle = '#666666';
  } else {
    ctx.strokeStyle = '#666666';
  }
  ctx.lineWidth = Math.max(1.1, size / 22);
  ctx.stroke();
  ctx.restore();
}

function paintFlag(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, palette: Palette): void {
  const half = size / 2;
  const poleX = cx - half * 0.55;
  const top = cy - half * 0.68;
  ctx.save();
  ctx.strokeStyle = '#7f7f7f';
  ctx.lineWidth = Math.max(1, size / 14);
  ctx.beginPath();
  ctx.moveTo(poleX, top);
  ctx.lineTo(poleX, cy + half * 0.72);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(poleX, top);
  ctx.lineTo(cx + half * 0.68, top + size * 0.22);
  ctx.lineTo(poleX, top + size * 0.46);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(poleX, top, cx + half * 0.68, top + size * 0.46);
  gradient.addColorStop(0, palette.light);
  gradient.addColorStop(1, palette.fill);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = Math.max(0.7, size / 26);
  ctx.stroke();
  ctx.restore();
}

function paintCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  palette: Palette,
  stroke = palette.dark,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = palette.fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(0.8, radius / 6.5);
  ctx.stroke();
  ctx.restore();
}

function paintRimmedLight(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, palette: Palette): void {
  const half = size / 2;
  const side = size * 0.88;
  ctx.save();
  ctx.fillStyle = '#444444';
  ctx.fillRect(cx - side / 2, cy - side / 2, side, side);
  paintCircle(ctx, cx, cy, half * 0.61, palette);
  ctx.restore();
}

function paintDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, palette: Palette): void {
  const half = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - half * 0.9);
  ctx.lineTo(cx + half * 0.9, cy);
  ctx.lineTo(cx, cy + half * 0.9);
  ctx.lineTo(cx - half * 0.9, cy);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(cx - half, cy - half, cx + half, cy + half);
  gradient.addColorStop(0, palette.light);
  gradient.addColorStop(1, palette.fill);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = Math.max(0.75, size / 24);
  ctx.stroke();
  ctx.restore();
}

function symbolPath(ctx: CanvasRenderingContext2D, kind: 'cross' | 'bang' | 'check', cx: number, cy: number, size: number): void {
  ctx.beginPath();
  if (kind === 'cross') {
    ctx.moveTo(cx - size * 0.2, cy - size * 0.2);
    ctx.lineTo(cx + size * 0.2, cy + size * 0.2);
    ctx.moveTo(cx + size * 0.2, cy - size * 0.2);
    ctx.lineTo(cx - size * 0.2, cy + size * 0.2);
  } else if (kind === 'bang') {
    ctx.moveTo(cx, cy - size * 0.24);
    ctx.lineTo(cx, cy + size * 0.06);
  } else {
    ctx.moveTo(cx - size * 0.22, cy);
    ctx.lineTo(cx - size * 0.02, cy + size * 0.18);
    ctx.lineTo(cx + size * 0.24, cy - size * 0.18);
  }
}

function paintSymbol(
  ctx: CanvasRenderingContext2D,
  kind: 'cross' | 'bang' | 'check',
  cx: number,
  cy: number,
  size: number,
  color: string,
  shadow: string,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = shadow;
  ctx.lineWidth = Math.max(1.2, size * 0.21);
  symbolPath(ctx, kind, cx, cy, size);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.8, size * 0.13);
  symbolPath(ctx, kind, cx, cy, size);
  ctx.stroke();
  if (kind === 'bang') {
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.21, size * 0.062, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.21, size * 0.042, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintSymbolCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  kind: 'cross' | 'bang' | 'check',
  palette: Palette,
): void {
  paintCircle(ctx, cx, cy, size * 0.43, palette);
  paintSymbol(ctx, kind, cx, cy, size, '#ffffff', 'rgba(0,0,0,0.28)');
}

function paintRatings(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ratings: number, index: number): void {
  // Four connected bars; the four-rating set skips the single-filled state.
  const unit = size / 18;
  const filled = ratings === 4 ? index === 0 ? 0 : index + 1 : index;
  for (let i = 0; i < 4; i++) {
    const height = (7 + 3 * i) * unit;
    const bx = x + (2 + 3 * i) * unit, by = y + 17 * unit - height;
    ctx.fillStyle = i < filled ? BLUE : '#bfbfbf';
    ctx.fillRect(bx, by, 4 * unit, height);
    ctx.strokeStyle = '#7f7f7f'; ctx.lineWidth = unit;
    ctx.strokeRect(bx + unit / 2, by + unit / 2, 3 * unit, height - unit);
  }
}

function paintQuarters(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, index: number, count: number): void {
  const radius = size * 0.42;
  const fraction = count <= 1 ? 1 : Math.max(0, Math.min(1, index / (count - 1)));
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#595959';
  ctx.lineWidth = Math.max(0.8, size / 22);
  ctx.stroke();
  if (fraction > 0) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    if (fraction >= 1) ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    else ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
    ctx.closePath();
    ctx.fillStyle = '#595959';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#4d4d4d';
  ctx.lineWidth = Math.max(0.8, size / 22);
  ctx.stroke();
  ctx.restore();
}

function paintBoxes(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, index: number): void {
  const gap = size / 18;
  const total = size * 15 / 18;
  const box = (total - gap) / 2;
  const left = x + size * 2 / 18;
  const top = y + size * 2 / 18;
  for (let i = 0; i < 4; i++) {
    const bx = left + (i % 2) * (box + gap);
    const by = top + Math.floor(i / 2) * (box + gap);
    ctx.fillStyle = i < index ? BLUE : '#b5b5b5';
    ctx.fillRect(bx, by, box, box);
    ctx.strokeStyle = '#595959';
    ctx.lineWidth = Math.max(0.65, size / 26);
    ctx.strokeRect(bx + 0.35, by + 0.35, Math.max(0.5, box - 0.7), Math.max(0.5, box - 0.7));
  }
}

/** TASK 56 (probe `.probe/t56/icon-gallery-trial.txt` + `t56-cf-icon-sets` captures): the trial draws
 * every icon-set arrow with ONE fletched arrow glyph in a 18x16 frame, rotated per direction:
 * threeArrows = [down, right, up], fourArrows = [down, down-right, up-right, up],
 * fiveArrows = [down, down-right, right, up-right, up]. Coordinates are frame-local CSS pixels
 * (zoom 1), measured from the trial ink runs (shaft 13x5, head tip at the frame right edge,
 * 45° feather bands 5px wide merging into the shaft edges). */
const FLETCHED_ARROW: readonly [number, number][] = [
  [1, 5], [8, 5], [5, 1], [10, 1], [13, 5], [16, 7.5], [13, 10], [10, 14], [5, 14], [8, 10], [1, 10],
];

function paintFletchedArrow(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  z: number,
  angle: number,
  palette: Palette,
): void {
  ctx.save();
  ctx.translate(fx + 8 * z, fy + 7 * z);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.beginPath();
  FLETCHED_ARROW.forEach(([x, y], i) => {
    const px = (x - 8) * z, py = (y - 7) * z;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = palette.fill;
  ctx.fill();
  // The trial outlines the glyph with a solid 1px stroke exactly INSIDE the ink boundary.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = 2 * z;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** Trial `threeTrafficLightsUnrimmed` (probe `.probe/t61` masks on `t56-cf-icon-sets`/`m4-icon-sets-gallery`
 * captures): the disc nearly fills the 18x16 frame — ellipse centered at frame-local (8.5, 7.5)
 * with rx 8.4 ry 7.6; core `#d86344`, a single dark-red AA pixel ring, no hard border. */
function paintTrialUnrimmedLight(ctx: CanvasRenderingContext2D, fx: number, fy: number, z: number, palette: Palette): void {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(fx + 8.5 * z, fy + 7.5 * z, 8.4 * z, 7.6 * z, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.fill;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = 2 * z;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** Trial `threeFlags` (probe mask of the first frame): a 2px solid `#808080` pole at frame-local
 * (5.2, 0) and a right-pointing pennant triangle (7,1) -> (16.8,4.5) -> (7,9) in flat palette.fill
 * with a 1px dark rim. */
function paintTrialFlag(ctx: CanvasRenderingContext2D, fx: number, fy: number, z: number, palette: Palette): void {
  ctx.save();
  ctx.fillStyle = '#808080';
  ctx.fillRect(fx + 5.2 * z, fy, 1.8 * z, 15 * z);
  ctx.beginPath();
  ctx.moveTo(fx + 7 * z, fy + 1 * z);
  ctx.lineTo(fx + 16.8 * z, fy + 4.5 * z);
  ctx.lineTo(fx + 7 * z, fy + 9 * z);
  ctx.closePath();
  ctx.fillStyle = palette.fill;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = 2 * z;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** Trial triangles (probe masks on `m4-icon-sets-gallery`): flat `palette.fill` bodies with a 1px
 * dark rim inside the ink. `threeTriangles`: down-triangle top y2 x2..16 apex (10,12.8); flat bar
 * y4..10.7; up-triangle base y12.5 apex (9.5,2). `threeSigns` up-triangle is taller: base y14.5. */
function paintTrialTriangle(ctx: CanvasRenderingContext2D, fx: number, fy: number, z: number, shape: 'down' | 'bar' | 'up' | 'upTall', palette: Palette): void {
  ctx.save();
  ctx.beginPath();
  if (shape === 'bar') ctx.rect(fx + 2 * z, fy + 4 * z, 14 * z, 6.7 * z);
  else {
    const tri: [number, number][] =
      shape === 'down' ? [[2, 2], [16, 2], [10, 12.8]]
        : shape === 'up' ? [[2, 12.5], [16, 12.5], [9.5, 2]]
          : [[2, 14.5], [17.5, 14.5], [10.5, 2]];
    tri.forEach(([x, y], i) => (i ? ctx.lineTo(fx + x * z, fy + y * z) : ctx.moveTo(fx + x * z, fy + y * z)));
    ctx.closePath();
  }
  ctx.fillStyle = palette.fill;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = 2 * z;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** Trial `threeSymbolsCircled`: solid coloured disc (ellipse centre (8.3, 7.6), rx 8.3 ry 7.7)
 * with a white symbol (stroke ≈ 2.5px) and a dark rim blended into the edge. */
function paintTrialSymbolCircle(ctx: CanvasRenderingContext2D, fx: number, fy: number, z: number, kind: 'cross' | 'bang' | 'check', palette: Palette): void {
  const cx = fx + 8.3 * z, cy = fy + 7.6 * z;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, 8.3 * z, 7.7 * z, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.fill;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = palette.dark;
  ctx.lineWidth = 2 * z;
  ctx.stroke();
  ctx.restore();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5 * z;
  symbolPath(ctx, kind, cx, cy, 16.5 * z);
  ctx.stroke();
  if (kind === 'bang') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy + 16.5 * 0.21 * z, 1.3 * z, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Trial `fourRatings` (probe `t56-cf-icon-sets` col 5 raw dumps): a staircase of four 4-column bars
 * at frame columns 4,7,10,13 with tops at rows 9,6,3,0 on a shared baseline row 15. Each bar has a
 * 1px `#727272` left/right/top stroke and a 2px core; icon k fills k+1 bars from the left
 * (`#4d82b8` filled, `#b3b3b3` unfilled). */
function paintTrialRatingBars(ctx: CanvasRenderingContext2D, fx: number, fy: number, z: number, filled: number): void {
  for (let i = 0; i < 4; i++) {
    const x0 = fx + (4 + 3 * i) * z, top = fy + (9 - 3 * i) * z;
    ctx.fillStyle = i < filled ? BLUE : '#b3b3b3';
    ctx.fillRect(x0 + z, top + z, 2 * z, (5 + 3 * i) * z);
    ctx.fillStyle = '#727272';
    ctx.fillRect(x0, top, z, (7 + 3 * i) * z);
    ctx.fillRect(x0 + 3 * z, top, z, (7 + 3 * i) * z);
    ctx.fillRect(x0, top, 4 * z, z);
  }
  ctx.fillRect(fx + 4 * z, fy + 15 * z, 13 * z, z);
}

/** Trial `fiveBoxes` (probe `t56-cf-icon-sets` col 7 raw dumps): a 15x15 grid (frame columns 1..15,
 * rows 0..14) with `#727272` borders and a mid cross at column 8/row 7; four 6x6 quadrants are
 * `#b3b3b3` when empty and `#4d82b8` when filled, in the order bottom-left, bottom-right, top-left,
 * top-right; icon k fills k quadrants. */
function paintTrialQuarterBoxes(ctx: CanvasRenderingContext2D, fx: number, fy: number, z: number, filled: number): void {
  const quads: readonly [number, number][] = [[2, 8], [9, 8], [2, 1], [9, 1]];
  quads.forEach(([x, y], i) => {
    ctx.fillStyle = i < filled ? BLUE : '#b3b3b3';
    ctx.fillRect(fx + x * z, fy + y * z, 6 * z, 6 * z);
  });
  ctx.fillStyle = '#727272';
  ctx.fillRect(fx + z, fy, 15 * z, z);
  ctx.fillRect(fx + z, fy + 7 * z, 15 * z, z);
  ctx.fillRect(fx + z, fy + 14 * z, 15 * z, z);
  ctx.fillRect(fx + z, fy, z, 15 * z);
  ctx.fillRect(fx + 8 * z, fy, z, 15 * z);
  ctx.fillRect(fx + 15 * z, fy, z, 15 * z);
}

/** Legacy sets are painted by the existing size-based painters; these offsets map the 18x16 frame
 * onto their previous anchors, reproducing the old (gallery-verified) positions in 20px rows. */
const LEGACY_ICON_OFFSETS: Record<number, [number, number, number]> = {
  2: [-1, -2, 18], 3: [0, -1, 18], 4: [1, -2, 18], 6: [0, -1, 18], 7: [0, -1, 16],
  8: [-1, -2, 18], 9: [-1, -2, 18], 12: [-1, -2, 18], 14: [-1, -2, 18], 17: [2, -1, 18], 18: [-1, -2, 18],
};

/** Paints one icon-set glyph into the 18x16 frame whose top-left is (fx, fy) at zoom z.
 * The trial anchors the frame at cell + (1, 2) CSS pixels, independent of the row height
 * (measured in 20px and 26px rows, `m4-icon-sets-gallery` and `t56-cf-icon-sets`). */
export function drawIconGlyph(
  ctx: CanvasRenderingContext2D,
  iconSet: number,
  index: number,
  fx: number,
  fy: number,
  z: number,
): void {
  const count = iconSet <= 9 ? 3 : iconSet <= 14 ? 4 : 5;
  const position = Math.max(0, Math.min(count - 1, index));
  if (iconSet === 0 || iconSet === 1 || iconSet === 10 || iconSet === 11 || iconSet === 15 || iconSet === 16) {
    const angles = count === 3 ? [90, 0, -90] : count === 4 ? [90, 45, -45, -90] : [90, 45, 0, -45, -90];
    const colored = iconSet === 0 || iconSet === 10 || iconSet === 15;
    const palette = colored ? (position === 0 ? RED : position === count - 1 ? GREEN : YELLOW) : GRAY;
    paintFletchedArrow(ctx, fx, fy, z, angles[position], palette);
    return;
  }
  if (iconSet === 5) {
    paintTrialUnrimmedLight(ctx, fx, fy, z, position === 0 ? RED : position === 1 ? YELLOW : GREEN);
    return;
  }
  const trialPalette = position === 0 ? RED : position === count - 1 ? GREEN : YELLOW;
  if (iconSet === 4) {
    paintTrialFlag(ctx, fx, fy, z, trialPalette);
    return;
  }
  if (iconSet === 2) {
    paintTrialTriangle(ctx, fx, fy, z, position === 0 ? 'down' : position === 1 ? 'bar' : 'up', trialPalette);
    return;
  }
  if (iconSet === 7) {
    if (position === 0) paintDiamond(ctx, fx + 9 * z, fy + 8 * z, 17 * z, RED);
    else if (position === 1) paintTrialTriangle(ctx, fx, fy, z, 'upTall', YELLOW);
    else paintTrialUnrimmedLight(ctx, fx, fy, z, GREEN);
    return;
  }
  if (iconSet === 8) {
    paintTrialSymbolCircle(ctx, fx, fy, z, position === 0 ? 'cross' : position === 1 ? 'bang' : 'check', trialPalette);
    return;
  }
  if (iconSet === 13) {
    paintTrialRatingBars(ctx, fx, fy, z, position + 1);
    return;
  }
  if (iconSet === 19) {
    paintTrialQuarterBoxes(ctx, fx, fy, z, position);
    return;
  }
  const [dx, dy, size] = LEGACY_ICON_OFFSETS[iconSet] ?? [0, 0, 18];
  drawIconSet(ctx, iconSet, index, fx + dx * z, fy + dy * z, size * z);
}

/** Draws one conditional-formatting icon-set glyph in an 18 CSS-pixel box. */
export function drawIconSet(ctx: CanvasRenderingContext2D, iconSet: number, index: number, x: number, y: number, size: number): void {
  const count = iconSet <= 9 ? 3 : iconSet <= 14 ? 4 : 5;
  const last = count - 1;
  const position = Math.max(0, Math.min(last, Math.round(index)));
  const cx = x + size / 2;
  const cy = y + size / 2;
  const half = size / 2;
  const direction = (): 'down' | 'downRight' | 'right' | 'upRight' | 'up' => {
    if (count === 3) return position === 0 ? 'down' : position === 1 ? 'right' : 'up';
    if (count === 4) return position === 0 ? 'down' : position === 1 ? 'downRight' : position === 2 ? 'upRight' : 'up';
    return position === 0 ? 'down' : position === 1 ? 'downRight' : position === 2 ? 'right' : position === 3 ? 'upRight' : 'up';
  };
  const rotations: Record<string, number> = {
    up: 0,
    upRight: Math.PI / 4,
    right: Math.PI / 2,
    downRight: (Math.PI * 3) / 4,
    down: Math.PI,
  };
  const coloredArrow = (): Palette => {
    if (iconSet === 0) return position === 0 ? RED : position === 1 ? YELLOW : GREEN;
    if (iconSet === 10) return position <= 1 ? (position === 0 ? RED : YELLOW) : position === 2 ? YELLOW : GREEN;
    return position === 0 ? RED : position === 4 ? GREEN : YELLOW;
  };
  switch (iconSet) {
    case 0:
    case 10:
    case 15:
      paintArrow(ctx, cx, cy, size, rotations[direction()]!, coloredArrow());
      break;
    case 1:
    case 11:
    case 16:
      paintArrow(ctx, cx, cy, size, rotations[direction()]!, GRAY);
      break;
    case 2:
      paintTriangle(ctx, cx, cy, size, position === 0 ? 'down' : position === 1 ? 'flat' : 'up', position === 0 ? RED : position === 1 ? YELLOW : GREEN);
      break;
    case 3:
      paintStar(ctx, cx, cy, size, position);
      break;
    case 4:
      paintFlag(ctx, cx, cy, size, position === 0 ? RED : position === 1 ? YELLOW : GREEN);
      break;
    case 5:
      paintCircle(ctx, cx, cy, half * 0.9, position === 0 ? RED : position === 1 ? YELLOW : GREEN);
      break;
    case 6:
      paintRimmedLight(ctx, cx, cy, size, position === 0 ? RED : position === 1 ? YELLOW : GREEN);
      break;
    case 7:
      if (position === 0) paintDiamond(ctx, cx, cy, size, RED);
      else if (position === 1) paintTriangle(ctx, cx, cy, size, 'up', YELLOW);
      else paintCircle(ctx, cx, cy, half * 0.88, GREEN);
      break;
    case 8:
      paintSymbolCircle(ctx, cx, cy, size, position === 0 ? 'cross' : position === 1 ? 'bang' : 'check', position === 0 ? RED : position === 1 ? YELLOW : GREEN);
      break;
    case 9:
      paintSymbol(
        ctx,
        position === 0 ? 'cross' : position === 1 ? 'bang' : 'check',
        cx,
        cy,
        size,
        (position === 0 ? RED : position === 1 ? YELLOW : GREEN).fill,
        (position === 0 ? RED : position === 1 ? YELLOW : GREEN).dark,
      );
      break;
    case 12:
      paintCircle(
        ctx,
        cx,
        cy,
        half * 0.84,
        position === 0 ? { fill: '#404040', light: '#6a6a6a', dark: '#262626' }
          : position === 1 ? { fill: '#a6a6a6', light: '#c7c7c7', dark: '#7f7f7f' }
            : position === 2 ? { fill: '#edb9ab', light: '#f7d7ce', dark: '#b98274' } : RED,
      );
      break;
    case 13:
      paintRatings(ctx, x, y, size, 4, position);
      break;
    case 14:
      paintCircle(
        ctx,
        cx,
        cy,
        half * 0.84,
        position === 0 ? { fill: '#404040', light: '#6a6a6a', dark: '#262626' }
          : position === 1 ? RED : position === 2 ? YELLOW : GREEN,
      );
      break;
    case 17:
      paintRatings(ctx, x, y, size, 5, position);
      break;
    case 18:
      paintQuarters(ctx, cx, cy, size, position, count);
      break;
    case 19:
      paintBoxes(ctx, x, y, size, position);
      break;
    default:
      paintArrow(ctx, cx, cy, size, 0, GRAY);
      break;
  }
}

function paintSortArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, up: boolean): void {
  ctx.save();
  ctx.beginPath();
  if (up) {
    ctx.moveTo(cx, cy - size * 0.28);
    ctx.lineTo(cx + size * 0.26, cy + size * 0.14);
    ctx.lineTo(cx - size * 0.26, cy + size * 0.14);
  } else {
    ctx.moveTo(cx - size * 0.26, cy - size * 0.14);
    ctx.lineTo(cx + size * 0.26, cy - size * 0.14);
    ctx.lineTo(cx, cy + size * 0.28);
  }
  ctx.closePath();
  const gradient = ctx.createLinearGradient(cx, cy - size * 0.3, cx, cy + size * 0.3);
  gradient.addColorStop(0, LIGHT_BLUE);
  gradient.addColorStop(1, DARK_BLUE);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = '#5868a8';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.restore();
}

function paintFunnel(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.44, cy - size * 0.4);
  ctx.lineTo(cx + size * 0.44, cy - size * 0.4);
  ctx.lineTo(cx + size * 0.14, cy + size * 0.02);
  ctx.lineTo(cx + size * 0.14, cy + size * 0.45);
  ctx.lineTo(cx - size * 0.14, cy + size * 0.45);
  ctx.lineTo(cx - size * 0.14, cy + size * 0.02);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(cx, cy - size * 0.45, cx, cy + size * 0.45);
  gradient.addColorStop(0, '#b5b5b5');
  gradient.addColorStop(1, '#565656');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = '#4d4d4d';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.restore();
}

/** Draws the filter-button glyph: normal dropdown, active funnel, or a sort arrow. */
export function drawFilterGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, state: FilterGlyphState = {}): void {
  const sort = Number(state.sort) || 0;
  if (state.filtered) {
    paintFunnel(ctx, cx + 1.2, cy - 0.2, 8);
    paintSortArrow(ctx, cx - 4.2, cy + 2.6, 5.4, sort === 1);
    return;
  }
  if (sort) {
    paintSortArrow(ctx, cx, cy, 7, sort === 1);
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 2);
  ctx.lineTo(cx + 4, cy - 2);
  ctx.lineTo(cx, cy + 2);
  ctx.closePath();
  ctx.fillStyle = '#354b75';
  ctx.fill();
  ctx.restore();
}
