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
