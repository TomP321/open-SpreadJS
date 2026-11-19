/*
 * AutoShape geometry: draws the preset shapes used by worksheet.shapes.
 * Every builder adds the shape outline to the current path of `ctx` inside
 * the box [x, y, x+w, y+h]. Coordinates are our own; no vendor geometry.
 */

export type Box = [number, number, number, number];

export interface ShapeControl { objectType: string; value?: unknown; linkedCell?: string; disabled?: boolean; items?: string[]; options?: Record<string, unknown> }


interface GeomCtx {
  ctx: CanvasRenderingContext2D;
  x: number; y: number; w: number; h: number;
}

const point = (g: GeomCtx, fx: number, fy: number): [number, number] => [g.x + fx * g.w, g.y + fy * g.h];
const min = (a: number, b: number): number => Math.min(a, b);

function polygon(g: GeomCtx, pts: [number, number][], close = true): void {
  pts.forEach(([fx, fy], i) => {
    const [px, py] = point(g, fx, fy);
    if (i === 0) g.ctx.moveTo(px, py); else g.ctx.lineTo(px, py);
  });
  if (close) g.ctx.closePath();
}

function ellipse(g: GeomCtx, fx = 0.5, fy = 0.5, rfx = 0.5, rfy = 0.5): void {
  g.ctx.ellipse(g.x + fx * g.w, g.y + fy * g.h, Math.abs(rfx * g.w), Math.abs(rfy * g.h), 0, 0, Math.PI * 2);
}

function roundedRect(g: GeomCtx, r: number): void {
  const { ctx, x, y, w, h } = g;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Regular polygon with `sides` vertices, first vertex at `startAngle` radians.
 *  TASK 60 item 3: the trial's gallery icons always fill their geometry box, so the
 *  generated vertices are rescaled so the extreme x/y touch the box edges. */
function regularPolygon(g: GeomCtx, sides: number, startAngle = -Math.PI / 2, rx = 0.5, ry = 0.5): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i * 2 * Math.PI) / sides;
    pts.push([rx * Math.cos(a), ry * Math.sin(a)]);
  }
  polygon(g, normalize(pts));
}

/** Rescale a point list so its bounding box fills the [0,1] unit box (keeps aspect if the
 *  source is already square; the trial's preset geometry always spans its adv box). */
function normalize(pts: [number, number][]): [number, number][] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const dx = x1 - x0 || 1, dy = y1 - y0 || 1;
  return pts.map(([x, y]) => [(x - x0) / dx, (y - y0) / dy]);
}

/** Pointed star with `points` outer tips; inner radius fraction `deep`.
 *  High-tip-count stars/bursts (10+) are drawn with flat-topped trapezoid teeth - the
 *  stepped-sun silhouette the trial uses for those presets at icon size. */
function star(g: GeomCtx, points: number, deep: number, ryFactor = 1, sharp = false): void {
  const pts: [number, number][] = [];
  if (points >= 10 && !sharp) {
    const d = (Math.PI / points) * 0.5;
    for (let i = 0; i < points; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / points;
      const v = a + Math.PI / points;
      pts.push([0.5 + 0.5 * Math.cos(a - d), 0.5 + 0.5 * ryFactor * Math.sin(a - d)]);
      pts.push([0.5 + 0.5 * Math.cos(a + d), 0.5 + 0.5 * ryFactor * Math.sin(a + d)]);
      pts.push([0.5 + 0.5 * deep * Math.cos(v), 0.5 + 0.5 * ryFactor * deep * Math.sin(v)]);
    }
  } else {
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? 0.5 : 0.5 * deep;
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      pts.push([0.5 + r * Math.cos(a), 0.5 + r * ryFactor * Math.sin(a)]);
    }
  }
  polygon(g, normalize(pts));
}

/** 4-Point Star: the trial's sparkle has concave curved flanks, not straight ones. */
function fourPointStar(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const P = (fx: number, fy: number): [number, number] => [x + fx * w, y + fy * h];
  ctx.moveTo(x + w / 2, y);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const to = P(0.5 + 0.5 * Math.sin(a + Math.PI / 2), 0.5 - 0.5 * Math.cos(a + Math.PI / 2));
    const c = P(0.5 + 0.09 * Math.sin(a + Math.PI / 4), 0.5 - 0.09 * Math.cos(a + Math.PI / 4));
    ctx.quadraticCurveTo(c[0], c[1], to[0], to[1]);
  }
  ctx.closePath();
}

/**
 * Block-arrow outline for the right/left/up/down/quad combinations.
 * Walks the boundary clockwise; each requested tip contributes a triangular
 * head whose base spans the whole box on that side.
 */
function shaftArrow(g: GeomCtx, has: { up?: number; down?: number; left?: number; right?: number }): void {
  const hw = 0.16;   // half thickness of a shaft
  const hd = 0.3;    // depth of an arrow head
  const hh = 0.5;    // half width of an arrow head (the trial's barbs span the full adv box)
  const N = !!has.up, S = !!has.down, W = !!has.left, E = !!has.right;
  const arms = [N, S, W, E].filter(Boolean).length;
  if (arms === 1) {
    if (E) return polygon(g, [[0, 0.5 - hw], [1 - hd, 0.5 - hw], [1 - hd, 0.5 - hh], [1, 0.5], [1 - hd, 0.5 + hh], [1 - hd, 0.5 + hw], [0, 0.5 + hw]]);
    if (W) return polygon(g, [[1, 0.5 - hw], [hd, 0.5 - hw], [hd, 0.5 - hh], [0, 0.5], [hd, 0.5 + hh], [hd, 0.5 + hw], [1, 0.5 + hw]]);
    if (N) return polygon(g, [[0.5 - hw, 1], [0.5 - hw, hd], [0.5 - hh, hd], [0.5, 0], [0.5 + hh, hd], [0.5 + hw, hd], [0.5 + hw, 1]]);
    return polygon(g, [[0.5 - hw, 0], [0.5 - hw, 1 - hd], [0.5 - hh, 1 - hd], [0.5, 1], [0.5 + hh, 1 - hd], [0.5 + hw, 1 - hd], [0.5 + hw, 0]]);
  }
  if (arms === 2 && W && E) {
    return polygon(g, [[0, 0.5], [hd, 0.5 - hh], [hd, 0.5 - hw], [1 - hd, 0.5 - hw], [1 - hd, 0.5 - hh], [1, 0.5], [1 - hd, 0.5 + hh], [1 - hd, 0.5 + hw], [hd, 0.5 + hw], [hd, 0.5 + hh]]);
  }
  if (arms === 2 && N && S) {
    return polygon(g, [[0.5, 0], [0.5 + hh, hd], [0.5 + hw, hd], [0.5 + hw, 1 - hd], [0.5 + hh, 1 - hd], [0.5, 1], [0.5 - hh, 1 - hd], [0.5 - hw, 1 - hd], [0.5 - hw, hd], [0.5 - hh, hd]]);
  }
  if (arms === 4) {
    const q = 0.34; // quad heads are narrower than the single-arm heads
    return polygon(g, [
      [0.5, 0], [0.5 + q, hd], [0.5 + hw, hd], [0.5 + hw, 0.5 - hw], [1 - hd, 0.5 - hw], [1 - hd, 0.5 - q],
      [1, 0.5], [1 - hd, 0.5 + q], [1 - hd, 0.5 + hw], [0.5 + hw, 0.5 + hw], [0.5 + hw, 1 - hd], [0.5 + q, 1 - hd],
      [0.5, 1], [0.5 - q, 1 - hd], [0.5 - hw, 1 - hd], [0.5 - hw, 0.5 + hw], [hd, 0.5 + hw], [hd, 0.5 + q],
      [0, 0.5], [hd, 0.5 - q], [hd, 0.5 - hw], [0.5 - hw, 0.5 - hw], [0.5 - hw, hd], [0.5 - q, hd],
    ]);
  }
  // Three arms (Left-Right-Up Arrow): a horizontal double arrow with an upward arm
  // whose shaft runs to the bottom edge of the box. The trial keeps the three heads
  // clearly separated (TASK 60 item 3), so the heads and shafts are slimmer here.
  const hd3 = 0.24, hh3 = 0.36, hw3 = 0.12;
  polygon(g, [
    [0, 0.5], [hd3, 0.5 - hh3], [hd3, 0.5 - hw3], [0.5 - hw3, 0.5 - hw3], [0.5 - hw3, hd3], [0.5 - hh3, hd3],
    [0.5, 0], [0.5 + hh3, hd3], [0.5 + hw3, hd3], [0.5 + hw3, 0.5 - hw3], [1 - hd3, 0.5 - hw3], [1 - hd3, 0.5 - hh3],
    [1, 0.5], [1 - hd3, 0.5 + hh3], [1 - hd3, 0.5 + hw3], [0.5 + hw3, 0.5 + hw3], [0.5 + hw3, 1], [0.5 - hw3, 1],
    [0.5 - hw3, 0.5 + hw3], [hd3, 0.5 + hw3], [hd3, 0.5 + hh3],
  ]);
}

/**
 * Line callouts (`lineCalloutN…`): a text box in the upper-right area joined to a tail
 * point in the lower-left by a leader with 0-2 bends. TASK 60 item 3 (trial measures): the
 * box spans the right of the adv box and the tail reaches the lower-left corner; the
 * accent-bar and no-border variants paint the box with a DOTTED outline, the accent bar
 * standing on the tail end, and "border and accent bar" keeps both solid.
 */
function lineCallout(g: GeomCtx, kind: 'straight' | 'bent' | 'zigzag' | 'drop', bar: boolean, outlined: boolean): void {
  const { ctx } = g;
  const boxX = 0.36, boxY = 0.04, boxH = 0.62;
  const tailX = kind === 'drop' ? 0.06 : 0;
  const tailY = 0.96;
  if (outlined) {
    polygon(g, [[boxX, boxY], [1, boxY], [1, boxY + boxH], [boxX, boxY + boxH]]);
  } else {
    dashedRect(g, boxX, boxY, 1, boxY + boxH);
  }
  const leader: [number, number][] = kind === 'straight'
    ? [[tailX, tailY], [boxX + 0.02, boxY + boxH]]
    : kind === 'bent'
      ? [[tailX, tailY], [boxX + 0.1, tailY], [boxX + 0.1, boxY + boxH]]
      : kind === 'zigzag'
        ? [[tailX, tailY], [boxX + 0.26, tailY], [boxX + 0.26, boxY + boxH + 0.18], [boxX + 0.06, boxY + boxH + 0.18], [boxX + 0.06, boxY + boxH]]
        : [[tailX, tailY], [tailX + 0.16, tailY - 0.24], [boxX + 0.02, boxY + boxH]];
  const p0 = leader[0];
  ctx.moveTo(g.x + p0[0] * g.w, g.y + p0[1] * g.h);
  for (const [fx, fy] of leader.slice(1)) ctx.lineTo(g.x + fx * g.w, g.y + fy * g.h);
  if (bar) {
    const bx = g.x + tailX * g.w, by = g.y + tailY * g.h;
    ctx.moveTo(bx, by); ctx.lineTo(bx, by - g.h * 0.18);
  }
}

/** A rectangle emitted as short dash segments (used by the trial's dotted callout boxes). */
function dashedRect(g: GeomCtx, fx0: number, fy0: number, fx1: number, fy1: number): void {
  const { ctx, x, y, w, h } = g;
  const x0 = x + fx0 * w, y0 = y + fy0 * h, x1 = x + fx1 * w, y1 = y + fy1 * h;
  const dash = 2.6, gap = 2.4, seg = dash + gap;
  const side = (ax: number, ay: number, bx: number, by: number): void => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / seg));
    const ux = (bx - ax) / n, uy = (by - ay) / n;
    const k = Math.min(1, dash / seg);
    for (let i = 0; i < n; i++) {
      ctx.moveTo(ax + ux * i, ay + uy * i);
      ctx.lineTo(ax + ux * i + ux * k, ay + uy * i + uy * k);
    }
  };
  side(x0, y0, x1, y0); side(x1, y0, x1, y1); side(x1, y1, x0, y1); side(x0, y1, x0, y0);
}

function arrowCallout(g: GeomCtx, kind: 'rect' | 'round' | 'oval' | 'cloud'): void {
  // Leader at 45 degrees from the top-left corner plus the callout body.
  const ctx = g.ctx;
  polygon(g, [[0, 0], [0.36, 0.36]]);
  ctx.moveTo(g.x + 0.36 * g.w, g.y + 0.36 * g.h);
  const body: GeomCtx = { ctx, x: g.x + 0.36 * g.w, y: g.y + 0.36 * g.h, w: 0.64 * g.w, h: 0.64 * g.h };
  if (kind === 'rect') polygon(body, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  else if (kind === 'round') roundedRect(body, min(body.w, body.h) * 0.16);
  else if (kind === 'oval') ellipse(body);
  else cloud(body);
}

function cloud(g: GeomCtx): void {
  // Cloud: six quadratic lobes (left, two along the top, right, two along the bottom).
  // The control points sit slightly outside the adv box so the stroke reaches all edges,
  // matching the trial's icon (TASK 60 item 3).
  const { ctx, x, y, w, h } = g;
  const P = (fx: number, fy: number): [number, number] => [x + fx * w, y + fy * h];
  const lobe = (cx: number, cy: number, px: number, py: number): void => {
    const c = P(cx, cy), p = P(px, py);
    ctx.quadraticCurveTo(c[0], c[1], p[0], p[1]);
  };
  const start = P(0, 0.56);
  ctx.moveTo(start[0], start[1]);
  lobe(-0.16, 0.28, 0.22, 0.24);
  lobe(0.16, -0.3, 0.44, 0.2);
  lobe(0.62, -0.26, 0.74, 0.26);
  lobe(1.12, 0.24, 0.98, 0.58);
  lobe(0.96, 0.98, 0.66, 0.82);
  lobe(0.42, 1.1, 0.24, 0.8);
  lobe(0.02, 0.78, 0, 0.56);
  ctx.closePath();
}

/** Heart: two full elliptical lobes along the top edge joined by straight flanks to the
 *  bottom tip - the trial's heart fills its whole adv box (TASK 60 item 3 measurement). */
function heart(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const rx = w / 4, ry = Math.min(h / 4, w / 4);
  ctx.moveTo(x, y + ry);
  ctx.ellipse(x + w / 4, y + ry, rx, ry, 0, Math.PI, 0, false);
  ctx.ellipse(x + (3 * w) / 4, y + ry, rx, ry, 0, Math.PI, 0, false);
  ctx.lineTo(x + w / 2, y + h);
  ctx.closePath();
}

function chevronLike(g: GeomCtx, notch: number): void {
  polygon(g, [[0, 0], [1 - notch, 0], [1, 0.5], [1 - notch, 1], [0, 1], [notch, 0.5]]);
}

function gear(g: GeomCtx, teeth: number): void {
  // Gear: `teeth` rectangular cogs on a round body (square cogs with a constant tooth pitch,
  // which is how the trial's gear6/gear9 read at 20px). No centre hole: the trial's gears have
  // none in the gallery.
  const pts: [number, number][] = [];
  const outer = 0.5, inner = 0.42, step = (Math.PI * 2) / teeth, top = step * 0.42;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    pts.push([0.5 + inner * Math.cos(a), 0.5 + inner * Math.sin(a)]);
    pts.push([0.5 + outer * Math.cos(a), 0.5 + outer * Math.sin(a)]);
    pts.push([0.5 + outer * Math.cos(a + top), 0.5 + outer * Math.sin(a + top)]);
    pts.push([0.5 + inner * Math.cos(a + top), 0.5 + inner * Math.sin(a + top)]);
  }
  polygon(g, pts);
}

/** Flowchart/document style path helpers. */
function documentPath(g: GeomCtx): void {
  // Document: straight sides and top, the bottom edge sweeps down from the left, dips in the
  // middle and rises again to the right corner (trial measure 60x54 filling the box).
  const { ctx, x, y, w, h } = g;
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h * 0.72);
  ctx.bezierCurveTo(x + w * 0.72, y + h * 0.98, x + w * 0.28, y + h, x, y + h * 0.85);
  ctx.closePath();
}

function stadium(g: GeomCtx): void {
  roundedRect(g, min(g.w, g.h) / 2);
}

/** Extract/Merge: the trial paints these as a rounded (pill-cornered) triangle pointing
 *  up (Extract) or down (Merge), filling the adv box. */
function roundedTriangle(g: GeomCtx, dir: number): void {
  const { ctx, x, y, w, h } = g;
  const r = min(w, h) * 0.07;
  const Y = (f: number): number => y + (dir > 0 ? f : 1 - f) * h;
  ctx.moveTo(x + 0.09 * w, Y(1));
  ctx.lineTo(x + 0.91 * w, Y(1));
  ctx.arcTo(x + 1.04 * w, Y(1.04), x + 0.64 * w, Y(0.24), r);
  ctx.lineTo(x + 0.62 * w, Y(0.16));
  ctx.arcTo(x + 0.5 * w, Y(-0.04), x + 0.38 * w, Y(0.16), r);
  ctx.lineTo(x + 0.36 * w, Y(0.24));
  ctx.arcTo(x - 0.04 * w, Y(1.04), x + 0.09 * w, Y(1), r);
  ctx.closePath();
}

function hexagonHorizontal(g: GeomCtx): void {
  polygon(g, [[0.22, 0], [0.78, 0], [1, 0.5], [0.78, 1], [0.22, 1], [0, 0.5]]);
}

/**
 * Draws the outline of one preset shape. `prst` is the public AutoShapeType
 * *name* (stable across versions) so unknown presets can fall back to the
 * rectangle outline.
 */
export function addShapePath(ctx: CanvasRenderingContext2D, prst: string, x: number, y: number, w: number, h: number): void {
  const g: GeomCtx = { ctx, x, y, w, h };
  const a = min(w, h);
  switch (prst) {
    case 'line': case 'lineInverse': case 'noHeadStraight':
    case 'endArrowHeadStraight': case 'beginEndArrowHeadStraight':
      polygon(g, [[0, 0], [1, 1]], false); return;
    case 'Elbow': case 'bentConnector3':
    case 'endArrowHeadElbow': case 'beginEndArrowHeadElbow':
      ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); return;
    case 'Curved': case 'curvedConnector3':
    case 'endArrowHeadCurved': case 'beginEndArrowHeadCurved':
      ctx.moveTo(x, y); ctx.bezierCurveTo(x + w * 0.5, y, x + w, y + h * 0.5, x + w, y + h); return;
    case 'rectangle': case 'none':
      polygon(g, [[0, 0], [1, 0], [1, 1], [0, 1]]); return;
    case 'roundedRectangle':
      roundedRect(g, a * 0.16); return;
    case 'snip1Rectangle': {
      const c = min(w, h) * 0.25;
      polygon(g, [[0, c / h], [c / w, 0], [1, 0], [1, 1], [0, 1]]); return;
    }
    case 'snip2SameRectangle': {
      const cx = w * 0.2, cy = h * 0.2;
      polygon(g, [[0, cy / h], [cx / w, 0], [1 - cx / w, 0], [1, cy / h], [1, 1], [0, 1]]); return;
    }
    case 'snip2DiagRectangle': {
      const cx = w * 0.2, cy = h * 0.2;
      polygon(g, [[cx / w, 0], [1, 0], [1, 1 - cy / h], [1 - cx / w, 1], [0, 1], [0, cy / h]]); return;
    }
    case 'snipRoundRectangle': {
      const cx = w * 0.22, cy = h * 0.22;
      polygon(g, [[0, cy / h], [cx / w, 0], [1, 0], [1, 1], [0, 1]]); return;
    }
    case 'round1Rectangle':
      roundedRectTop(g, a * 0.18, 0); return;
    case 'round2SameRectangle':
      roundedCorners(g, 0); return;
    case 'round2DiagRectangle':
      roundedCorners(g, 1); return;
    case 'hor-text-box': case 'textBox':
      polygon(g, [[0, 0], [1, 0], [1, 1], [0, 1]]); return;
    case 'oval': ellipse(g); return;
    case 'circle': ellipse(g, 0.5, 0.5, 0.5, 0.5); return;
    case 'isoscelesTriangle': polygon(g, [[0.5, 0], [1, 1], [0, 1]]); return;
    case 'rightTriangle': polygon(g, [[0, 0], [0, 1], [1, 1]]); return;
    case 'parallelogram': polygon(g, [[0.25, 0], [1, 0], [0.75, 1], [0, 1]]); return;
    case 'trapezoid': polygon(g, [[0.25, 0], [0.75, 0], [1, 1], [0, 1]]); return;
    case 'nonIsoscelesTrapezoid': polygon(g, [[0.1, 0], [0.9, 0], [1, 1], [0, 1]]); return;
    case 'diamond': polygon(g, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]); return;
    case 'regularPentagon': regularPolygon(g, 5); return;
    case 'pentagon': polygon(g, [[0, 0], [0.62, 0], [1, 0.5], [0.62, 1], [0, 1]]); return;
    case 'hexagon': hexagonHorizontal(g); return;
    case 'heptagon': regularPolygon(g, 7); return;
    case 'octagon': regularPolygon(g, 8, -Math.PI / 8); return;
    case 'decagon': regularPolygon(g, 10); return;
    case 'dodecagon': regularPolygon(g, 12); return;
    case 'pie': wedge(g, 0, 1.5 * Math.PI); return;
    case 'pieWedge': cornerWedge(g); return;
    case 'chord': arcChord(g); return;
    case 'tear': tearDrop(g); return;
    case 'frame': frame(g, 0.18, 4); return;
    case 'halfFrame': frame(g, 0.18, 1); return;
    case 'corner': polygon(g, [[0, 0], [0.4, 0], [0.4, 0.6], [1, 0.6], [1, 1], [0, 1]]); return;
    case 'diagonalStripe': polygon(g, [[0.65, 0], [1, 0.35], [0.35, 1], [0, 0.65]]); return;
    case 'cross': plus(g, 0.33); return;
    case 'plaque': plaque(g); return;
    case 'can': cylinder(g); return;
    case 'cube': cube(g); return;
    case 'bevel': bevel(g); return;
    case 'donut': donut(g); return;
    case 'noSymbol': noSymbol(g); return;
    case 'blockArc': blockArc(g); return;
    case 'foldedCorner': foldedCorner(g); return;
    case 'smileyFace': smiley(g); return;
    case 'heart': heart(g); return;
    case 'lightningBolt': polygon(g, [[0.571, 0], [0, 0.55], [0.429, 0.55], [0.214, 1], [1, 0.4], [0.5, 0.4], [0.857, 0]]); return;
    case 'sun': sun(g); return;
    case 'moon': moon(g); return;
    case 'cloud': cloud(g); return;
    case 'arc': arcStroke(g); return;
    case 'doubleBracket': bracket(g, 2); return;
    case 'doubleBrace': brace(g, 2); return;
    case 'leftBracket': bracket(g, 1); return;
    case 'rightBracket': bracket(g, -1); return;
    case 'leftBrace': brace(g, 1); return;
    case 'rightBrace': brace(g, -1); return;
    case 'actionButtonHome': actionButton(g, 'home'); return;
    case 'actionButtonHelp': actionButton(g, '?'); return;
    case 'actionButtonInformation': actionButton(g, 'i'); return;
    case 'actionButtonBackorPrevious': actionButton(g, '<'); return;
    case 'actionButtonForwardorNext': actionButton(g, '>'); return;
    case 'actionButtonBeginning': actionButton(g, '|<'); return;
    case 'actionButtonEnd': actionButton(g, '>|'); return;
    case 'actionButtonReturn': actionButton(g, 'return'); return;
    case 'actionButtonDocument': actionButton(g, 'doc'); return;
    case 'actionButtonSound': actionButton(g, 'sound'); return;
    case 'actionButtonMovie': actionButton(g, 'film'); return;
    case 'actionButtonCustom': actionButton(g, ''); return;
    case 'balloon': stadium(g); return;
    case 'flowchartOfflineStorage': offlineStorage(g); return;
    case 'leftRightRibbon': ribbon(g, 0); return;
    case 'upRibbon': ribbon(g, 1); return;
    case 'downRibbon': ribbon(g, 2); return;
    case 'curvedUpRibbon': ribbon(g, 3); return;
    case 'curvedDownRibbon': ribbon(g, 4); return;
    case 'chartStar': chartSpokes(g, 3); return;
    case 'chartPlus': chartSpokes(g, 1); return;
    case 'leftCircularArrow': leftCircularArrow(g); return;
    case 'leftRightCircularArrow': curvedArrow(g, 'leftright'); return;
    case 'swooshArrow': swooshArrow(g); return;
    case 'chartX': chartSpokes(g, 2); return;
    case 'gear6': gear(g, 6); return;
    case 'gear9': gear(g, 9); return;
    case 'funnel': {
      // The trial's funnel reads as a "map pin": sides curving down to a point at the bottom,
      // a bulging elliptical rim on top, and an ellipse inside the rim opening.
      const { ctx, x, y, w, h } = g;
      ctx.moveTo(x, y + 0.3 * h);
      ctx.quadraticCurveTo(x - 0.06 * w, y + 0.72 * h, x + 0.5 * w, y + h);
      ctx.quadraticCurveTo(x + 1.06 * w, y + 0.72 * h, x + w, y + 0.3 * h);
      ctx.ellipse(x + 0.5 * w, y + 0.3 * h, 0.5 * w, 0.28 * h, 0, 0, Math.PI, true);
      ctx.closePath();
      ctx.moveTo(x + 0.78 * w, y + 0.34 * h);
      ctx.ellipse(x + 0.5 * w, y + 0.34 * h, 0.28 * w, 0.15 * h, 0, 0, 2 * Math.PI);
      return;
    }
    case 'cornerTabs': cornerTabs(g, 0); return;
    case 'squareTabs': cornerTabs(g, 1); return;
    case 'plaqueTabs': polygon(g, [[0.3, 0], [1, 0], [1, 0.7], [0.7, 0.7], [0.7, 1], [0, 1], [0, 0.3]]); return;
    case 'mathPlus': plus(g, 0.33); return;
    case 'mathMinus': polygon(g, [[0, 0], [1, 0], [1, 1], [0, 1]]); return;
    case 'mathMultiply': crossMark(g); return;
    case 'mathDivide': divide(g); return;
    case 'mathEqual': polygon(g, [[0, 0], [1, 0], [1, 0.3], [0, 0.3]]); polygon(g, [[0, 0.7], [1, 0.7], [1, 1], [0, 1]]); return;
    case 'mathNotEqual': polygon(g, [[0, 0], [1, 0], [1, 0.3], [0, 0.3]]); polygon(g, [[0, 0.7], [1, 0.7], [1, 1], [0, 1]]); polygon(g, [[0.68, 0], [0.82, 0], [0.32, 1], [0.18, 1]]); return;
    case 'flowchartProcess': polygon(g, [[0, 0], [1, 0], [1, 1], [0, 1]]); return;
    case 'flowchartAlternateProcess': roundedRect(g, a * 0.32); return;
    case 'flowchartDecision': polygon(g, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]); return;
    case 'flowchartData': polygon(g, [[0.2, 0], [1, 0], [0.8, 1], [0, 1]]); return;
    case 'flowchartPredefinedProcess': polygon(g, [[0, 0], [1, 0], [1, 1], [0, 1]]); polygon(g, [[0.1, 0], [0.16, 0], [0.16, 1], [0.1, 1]]); polygon(g, [[0.84, 0], [0.9, 0], [0.9, 1], [0.84, 1]]); return;
    case 'flowchartInternalStorage': polygon(g, [[0, 0], [1, 0], [1, 1], [0, 1]]); polygon(g, [[0.18, 0.18], [0.18, 0.82], [0.24, 0.82], [0.24, 0.18], [0.18, 0.18], [0.76, 0.18], [0.76, 0.24], [0.24, 0.24], [0.24, 0.76], [0.76, 0.76], [0.76, 0.18]]); return;
    case 'flowchartDocument': documentPath(g); return;
    case 'flowchartMultidocument': {
      const { ctx, x, y, w, h } = g;
      documentPath({ ctx, x: x + 0.16 * w, y, w: 0.84 * w, h: 0.76 * h });
      documentPath({ ctx, x: x + 0.08 * w, y, w: 0.88 * w, h: 0.8 * h });
      documentPath({ ctx, x, y: y + 0.2 * h, w: 0.9 * w, h: 0.8 * h });
      return;
    }
    case 'flowchartTerminator': stadium(g); return;
    case 'flowchartPreparation': hexagonHorizontal(g); return;
    case 'flowchartManualInput': polygon(g, [[0, 0.25], [1, 0], [1, 1], [0, 1]]); return;
    case 'flowchartManualOperation': polygon(g, [[0, 0], [1, 0], [0.8, 1], [0.2, 1]]); return;
    case 'flowchartConnector': ellipse(g); return;
    case 'flowchartOffpageConnector': polygon(g, [[0, 0], [1, 0], [1, 0.7], [0.5, 1], [0, 0.7]]); return;
    case 'flowchartCard': polygon(g, [[0, 0.3], [0.3, 0], [1, 0], [1, 1], [0, 1]]); return;
    case 'flowchartPunchedTape': {
      // Rectangle with a sagging wavy top edge and a straight bottom edge (trial measure).
      const { ctx: tctx, x: tx, y: ty, w: tw, h: th } = g;
      tctx.moveTo(tx, ty + 0.02 * th);
      tctx.quadraticCurveTo(tx + 0.25 * tw, ty + 0.32 * th, tx + 0.5 * tw, ty + 0.18 * th);
      tctx.quadraticCurveTo(tx + 0.75 * tw, ty + 0.02 * th, tx + tw, ty + 0.08 * th);
      tctx.lineTo(tx + tw, ty + th);
      tctx.lineTo(tx, ty + th);
      tctx.closePath();
      return;
    }
    case 'flowchartSummingJunction': {
      // Circle with an X across it (the plus-in-circle is flowchartOr).
      ellipse(g);
      polygon(g, [[0.13, 0.09], [0.2, 0.03], [0.87, 0.91], [0.8, 0.97]]);
      polygon(g, [[0.87, 0.09], [0.8, 0.03], [0.13, 0.91], [0.2, 0.97]]);
      return;
    }
    case 'flowchartOr':
      ellipse(g);
      polygon(g, [[0.06, 0.47], [0.94, 0.47], [0.94, 0.53], [0.06, 0.53]]);
      polygon(g, [[0.47, 0.06], [0.53, 0.06], [0.53, 0.94], [0.47, 0.94]]);
      return;
    case 'flowchartCollate': polygon(g, [[0, 0], [1, 0], [0.5, 0.5], [1, 1], [0, 1], [0.5, 0.5]]); return;
    case 'flowchartSort': {
      // Diamond with a horizontal chord: the trial's sort reads as a tall diamond crossed
      // by a line in its upper half.
      polygon(g, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]);
      const { ctx: sctx, x: sx, y: sy, w: sw, h: sh } = g;
      sctx.moveTo(sx + 0.12 * sw, sy + 0.4 * sh);
      sctx.lineTo(sx + 0.88 * sw, sy + 0.4 * sh);
      return;
    }
    case 'flowchartExtract': roundedTriangle(g, 1); return;
    case 'flowchartMerge': roundedTriangle(g, -1); return;
    case 'flowchartStoredData': {
      // Rectangle whose right edge bulges out and whose left edge is carved in (trial measure).
      const { ctx: dctx, x: dx, y: dy, w: dw, h: dh } = g;
      dctx.moveTo(dx, dy);
      dctx.lineTo(dx + dw, dy);
      dctx.quadraticCurveTo(dx + 1.1 * dw, dy + 0.5 * dh, dx + dw, dy + dh);
      dctx.lineTo(dx, dy + dh);
      dctx.quadraticCurveTo(dx + 0.3 * dw, dy + 0.5 * dh, dx, dy);
      dctx.closePath();
      return;
    }
    case 'flowchartDelay': polygon(g, [[0, 0], [0.7, 0], [1, 0.5], [0.7, 1], [0, 1]]); return;
    case 'flowchartSequentialAccessStorage': {
      // "Q": a full-height circle closed by a small rectangular tab at its lower right.
      ellipse(g, 0.42, 0.5, 0.42, 0.5);
      polygon(g, [[0.8, 0.7], [1, 0.7], [1, 1], [0.46, 1]]);
      return;
    }
    case 'flowchartMagneticDisk': cylinder(g); return;
    case 'flowchartDirectAccessStorage': {
      // Tall ellipse cut by a vertical chord near its left edge (trial measure 46x60).
      ellipse(g, 0.52, 0.5, 0.48, 0.5);
      const { ctx: cctx, x: cx0, y: cy0, w: cw, h: ch } = g;
      cctx.moveTo(cx0 + 0.32 * cw, cy0 + 0.05 * ch);
      cctx.lineTo(cx0 + 0.32 * cw, cy0 + 0.95 * ch);
      return;
    }
    case 'flowchartDisplay': polygon(g, [[0, 0.15], [0.12, 0], [0.85, 0], [1, 0.5], [0.85, 1], [0.12, 1], [0, 0.85]]); return;
    case 'explosion1': star(g, 12, 0.52, 1, true); return;
    case 'explosion2': star(g, 16, 0.6, 1, true); return;
    case 'shape4pointStar': fourPointStar(g); return;
    case 'shape5pointStar': star(g, 5, 0.4); return;
    case 'star6Point': star(g, 6, 0.45); return;
    case 'star7Point': star(g, 7, 0.45); return;
    case 'shape8pointStar': star(g, 8, 0.45); return;
    case 'star10Point': star(g, 10, 0.45); return;
    case 'star12Point': star(g, 12, 0.45); return;
    case 'shape16pointStar': star(g, 16, 0.5); return;
    case 'shape24pointStar': star(g, 24, 0.55); return;
    case 'shape32pointStar': star(g, 32, 0.6); return;
    case 'verticalScroll': scroll(g, false); return;
    case 'horizontalScroll': scroll(g, true); return;
    case 'wave': wave(g, 1); return;
    case 'doubleWave': wave(g, 2); return;
    case 'rectangularCallout': arrowCallout(g, 'rect'); return;
    case 'roundedRectangularCallout': arrowCallout(g, 'round'); return;
    case 'ovalCallout': arrowCallout(g, 'oval'); return;
    case 'cloudCallout': arrowCallout(g, 'cloud'); return;
    case 'lineCallout1': lineCallout(g, 'straight', false, true); return;
    case 'lineCallout2': lineCallout(g, 'bent', false, true); return;
    case 'lineCallout3': lineCallout(g, 'zigzag', false, true); return;
    case 'lineCallout4': lineCallout(g, 'drop', false, true); return;
    case 'lineCallout2AccentBar': lineCallout(g, 'bent', true, false); return;
    case 'lineCallout3AccentBar': lineCallout(g, 'zigzag', true, false); return;
    case 'lineCallout4AccentBar': lineCallout(g, 'drop', true, false); return;
    case 'lineCallout2NoBorder': lineCallout(g, 'bent', false, false); return;
    case 'lineCallout3NoBorder': lineCallout(g, 'zigzag', false, false); return;
    case 'lineCallout4NoBorder': lineCallout(g, 'drop', false, false); return;
    case 'lineCallout2BorderandAccentBar': lineCallout(g, 'bent', true, true); return;
    case 'lineCallout3BorderandAccentBar': lineCallout(g, 'zigzag', true, true); return;
    case 'lineCallout4BorderandAccentBar': lineCallout(g, 'drop', true, true); return;
    case 'rightArrow': shaftArrow(g, { right: 1 }); return;
    case 'leftArrow': shaftArrow(g, { left: 1 }); return;
    case 'upArrow': shaftArrow(g, { up: 1 }); return;
    case 'downArrow': shaftArrow(g, { down: 1 }); return;
    case 'leftRightArrow': shaftArrow(g, { left: 1, right: 1 }); return;
    case 'upDownArrow': shaftArrow(g, { up: 1, down: 1 }); return;
    case 'quadArrow': shaftArrow(g, { up: 1, down: 1, left: 1, right: 1 }); return;
    case 'leftRightUpArrow': shaftArrow(g, { up: 1, left: 1, right: 1 }); return;
    case 'bentArrow': bentBand(g); return;
    case 'bentUpArrow': polygon(g, [[0.75, 0.05], [1, 0.35], [0.87, 0.35], [0.87, 1], [0.05, 1], [0.05, 0.75], [0.63, 0.75], [0.63, 0.35], [0.5, 0.35]]); return;
    case 'uTurnArrow': uTurnBand(g); return;
    case 'leftUpArrow': polygon(g, [[0.72, 0.02], [0.98, 0.3], [0.84, 0.3], [0.84, 1], [0.6, 1], [0.6, 0.7], [0.34, 0.7], [0.34, 0.82], [0.02, 0.55], [0.34, 0.28], [0.34, 0.4], [0.6, 0.4], [0.6, 0.3], [0.46, 0.3]]); return;
    case 'curvedRightArrow': curvedArrowBand(g, 0); return;
    case 'curvedLeftArrow': curvedArrowBand(g, 1); return;
    case 'curvedUpArrow': curvedArrowBand(g, 2); return;
    case 'curvedDownArrow': curvedArrowBand(g, 3); return;
    case 'stripedRightArrow': {
      // The trial splits the shaft with two full-height divider lines, not filled blocks.
      shaftArrow(g, { right: 1 });
      const { ctx, x: sx, y: sy, w: sw, h: sh } = g;
      for (const fx of [0.16, 0.3]) { ctx.moveTo(sx + fx * sw, sy + 0.26 * sh); ctx.lineTo(sx + fx * sw, sy + 0.74 * sh); }
      return;
    }
    case 'notchedRightArrow': polygon(g, [[0.3, 0.5], [0, 0.22], [0.45, 0.22], [0.45, 0], [1, 0.5], [0.45, 1], [0.45, 0.78], [0, 0.78]]); return;
    case 'rightArrowCallout': bandCallout(g, 'E'); return;
    case 'leftArrowCallout': bandCallout(g, 'W'); return;
    case 'upArrowCallout': bandCallout(g, 'N'); return;
    case 'downArrowCallout': bandCallout(g, 'S'); return;
    case 'leftRightArrowCallout': bandCallout(g, 'EW'); return;
    case 'upDownArrowCallout': crossArrow(g); return;
    case 'quadArrowCallout': bandCallout(g, 'CROSS'); return;
    case 'circularArrow': ringArrow(g); return;
    case 'chevron': chevronLike(g, 0.3); return;
    default:
      polygon(g, [[0, 0], [1, 0], [1, 1], [0, 1]]); return;
  }
}

function roundedRectTop(g: GeomCtx, r: number, _side: number): void {
  const { ctx, x, y, w, h } = g;
  r = Math.min(r, w / 2, h);
  ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.closePath();
}

/** Walks a rectangle clockwise with independent corner radii. */
function cornerPath(g: GeomCtx, rTL: number, rTR: number, rBR: number, rBL: number): void {
  const { ctx, x, y, w, h } = g;
  const cap = (r: number): number => Math.max(0, Math.min(r, w / 2, h / 2));
  rTL = cap(rTL); rTR = cap(rTR); rBR = cap(rBR); rBL = cap(rBL);
  ctx.moveTo(x + rTL, y);
  ctx.lineTo(x + w - rTR, y);
  if (rTR) ctx.arcTo(x + w, y, x + w, y + rTR, rTR);
  ctx.lineTo(x + w, y + h - rBR);
  if (rBR) ctx.arcTo(x + w, y + h, x + w - rBR, y + h, rBR);
  ctx.lineTo(x + rBL, y + h);
  if (rBL) ctx.arcTo(x, y + h, x, y + h - rBL, rBL);
  ctx.lineTo(x, y + rTL);
  if (rTL) ctx.arcTo(x, y, x + rTL, y, rTL);
  ctx.closePath();
}

/** round2Same: both top corners rounded; round2Diag: TL and BR. */
function roundedCorners(g: GeomCtx, mode: number): void {
  const r = min(g.w, g.h) * 0.18;
  if (mode === 1) cornerPath(g, r, 0, r, 0);
  else cornerPath(g, r, r, 0, 0);
}

function wedge(g: GeomCtx, from: number, to: number): void {
  const { ctx, x, y, w, h } = g;
  ctx.moveTo(x + w / 2, y + h / 2);
  ctx.arc(x + w / 2, y + h / 2, min(w, h) / 2, from, to);
  ctx.closePath();
}

function arcChord(g: GeomCtx): void {
  // Chord: a circle cut by a straight line (the closing edge) — the trial keeps the
  // major segment, so the flat edge runs across the upper-right quadrant.
  const { ctx, x, y, w, h } = g;
  const r = min(w, h) / 2, cx = x + w / 2, cy = y + h / 2;
  ctx.moveTo(cx + r * Math.cos(1.5 * Math.PI), cy + r * Math.sin(1.5 * Math.PI));
  ctx.arc(cx, cy, r, 1.5 * Math.PI, 2 * Math.PI, true);
  ctx.closePath();
}

function tearDrop(g: GeomCtx): void {
  // Tear: a round body with the point at the upper right, joined by the two tangents. The arc
  // has to run the LONG way round (through the far side); ending at base - spread clockwise
  // collapses the tear into a small hook in one corner. The body circle is tangent to the
  // box's left and bottom edges so the icon fills its adv box (trial measure, TASK 60 item 3).
  const { ctx, x, y, w, h } = g;
  const tipX = x + w, tipY = y;
  const r = Math.min(w * 0.44, h * 0.46);
  const cx = x + w * 0.45, cy = y + h * 0.52;
  const dist = Math.hypot(tipX - cx, tipY - cy);
  const base = Math.atan2(tipY - cy, tipX - cx);
  const spread = Math.acos(Math.min(1, r / dist));
  ctx.moveTo(tipX, tipY);
  ctx.arc(cx, cy, r, base + spread, base - spread, false);
  ctx.closePath();
}

function frame(g: GeomCtx, t: number, openSide: number): void {
  const { ctx, x, y, w, h } = g;
  if (openSide === 1) {
    // Half frame: the band along the top and left edges. Both free ends taper to a point in
    // the trial (a short diagonal cut), so the shape reads as a frame, not as a plain L.
    const a = Math.min(0.2, t);
    polygon(g, [[0, 0], [1, 0], [1 - 1.5 * a, a], [a, a], [a, 1 - 1.5 * a], [0, 1]]);
    return;
  }
  ctx.rect(x, y, w, h);
  const it = t * min(w, h);
  if (openSide === 4) ctx.rect(x + it, y + it, w - 2 * it, h - 2 * it);
  else { ctx.moveTo(x + it, y + it); ctx.lineTo(x + it, y + h - it); ctx.lineTo(x + w - it, y + h - it); ctx.lineTo(x + w - it, y + it); ctx.closePath(); }
}

function plus(g: GeomCtx, band: number): void {
  const b = band;
  polygon(g, [[b, 0], [1 - b, 0], [1 - b, b], [1, b], [1, 1 - b], [1 - b, 1 - b], [1 - b, 1], [b, 1], [b, 1 - b], [0, 1 - b], [0, b], [b, b]]);
}

/** Plaque: a rectangle whose corners are cut by small inward scallops. */
function plaque(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const c = 0.22;
  const fx = (f: number): number => x + f * w;
  const fy = (f: number): number => y + f * h;
  ctx.moveTo(fx(0), fy(c));
  ctx.quadraticCurveTo(fx(c), fy(c), fx(c), fy(0));
  ctx.lineTo(fx(1 - c), fy(0));
  ctx.quadraticCurveTo(fx(1 - c), fy(c), fx(1), fy(c));
  ctx.lineTo(fx(1), fy(1 - c));
  ctx.quadraticCurveTo(fx(1 - c), fy(1 - c), fx(1 - c), fy(1));
  ctx.lineTo(fx(c), fy(1));
  ctx.quadraticCurveTo(fx(c), fy(1 - c), fx(0), fy(1 - c));
  ctx.closePath();
}

function cylinder(g: GeomCtx): void {
  // Can: the side walls and the bottom bowl, plus the full top ellipse (as the trial draws it).
  // The bowl is an ellipse matching the cap, so the shape fills the box top to bottom.
  const { ctx, x, y, w, h } = g;
  const ry = Math.min(h * 0.16, w * 0.25);
  ctx.moveTo(x, y + ry);
  ctx.lineTo(x, y + h - ry);
  ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + w, y + ry);
  ctx.closePath();
  ctx.moveTo(x + w, y + ry);
  ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, 0, Math.PI * 2);
}

function cube(g: GeomCtx): void {
  // Cube: the hexagonal silhouette plus the three inner edges of the front face; the trial
  // shows a flat front square with the top and right faces slanting up to the right.
  polygon(g, [[0, 0.28], [0.35, 0.02], [1, 0.02], [1, 0.72], [0.7, 0.98], [0, 0.98]]);
  const { ctx, x, y, w, h } = g;
  ctx.moveTo(x, y + 0.28 * h);
  ctx.lineTo(x + 0.7 * w, y + 0.28 * h);
  ctx.lineTo(x + 0.7 * w, y + 0.98 * h);
  ctx.moveTo(x + 0.7 * w, y + 0.28 * h);
  ctx.lineTo(x + w, y + 0.02 * h);
}

function bevel(g: GeomCtx): void {
  frame(g, 0.22, 4);
}

function donut(g: GeomCtx): void {
  ellipse(g);
  ellipse(g, 0.5, 0.5, 0.25, 0.25);
}

function noSymbol(g: GeomCtx): void {
  ellipse(g);
  polygon(g, [[0.21, 0.075], [0.29, 0.025], [0.79, 0.925], [0.71, 0.975]]);
}

/** Block Arc: a rainbow band whose outer ellipse spans the full adv box and whose inner
 *  ellipse is cut back to a smaller one, with flat radial ends on the baseline. */
function blockArc(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const cx = x + w / 2, cy = y + h;
  ctx.moveTo(x, cy);
  ctx.ellipse(cx, cy, w / 2, h * 0.96, 0, Math.PI, 0, false);
  ctx.lineTo(x + w * 0.78, cy);
  ctx.ellipse(cx, cy, w * 0.28, h * 0.5, 0, 0, Math.PI, true);
  ctx.closePath();
}

function foldedCorner(g: GeomCtx): void {
  const f = 0.28;
  // The trial folds the LOWER right corner up: the cut edge runs (1,1-f)-(1-f,1)
  // and the lifted flap sits inside that corner.
  polygon(g, [[0, 0], [1, 0], [1, 1 - f], [1 - f, 1], [0, 1]]);
  polygon(g, [[1, 1 - f], [1 - f, 1 - f], [1 - f, 1]]);
}

function smiley(g: GeomCtx): void {
  // Smiley face: the ring, two eye rings above the horizontal midline and a smile band that
  // stays under the eyes (a band, so the mouth reads as two strokes like the trial).
  const { ctx, x, y, w, h } = g;
  ellipse(g);
  ellipse(g, 0.35, 0.36, 0.07, 0.07);
  ellipse(g, 0.65, 0.36, 0.07, 0.07);
  ctx.moveTo(x + 0.26 * w, y + 0.58 * h);
  ctx.quadraticCurveTo(x + 0.5 * w, y + 0.9 * h, x + 0.74 * w, y + 0.58 * h);
  ctx.lineTo(x + 0.66 * w, y + 0.58 * h);
  ctx.quadraticCurveTo(x + 0.5 * w, y + 0.78 * h, x + 0.34 * w, y + 0.58 * h);
  ctx.closePath();
}

function sun(g: GeomCtx): void {
  ellipse(g, 0.5, 0.5, 0.32, 0.32);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const pts: [number, number][] = [
      [0.5 + 0.4 * Math.cos(a - 0.12), 0.5 + 0.4 * Math.sin(a - 0.12)],
      [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)],
      [0.5 + 0.4 * Math.cos(a + 0.12), 0.5 + 0.4 * Math.sin(a + 0.12)],
    ];
    polygon(g, pts);
  }
}

/** Moon: a thick crescent opening to the right. The outer edge is an elliptical arc whose
 *  half-width spans the adv box; the inner arc is shallower, its end points (the horns) sit
 *  at the box's right edge (trial measure 38x60 device in the 20 px cell). */
function moon(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const cx = x + w, cy = y + h / 2;
  const rx = w, ry = h / 2;
  ctx.moveTo(cx, y);
  ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2, true);
  const s = w * 0.42, r2 = Math.hypot(s, ry), cx2 = cx + s;
  const aBot = Math.atan2(ry, -s), aTop = 2 * Math.PI - aBot;
  ctx.ellipse(cx2, cy, r2, ry, 0, aBot, aTop);
  ctx.closePath();
}

/** Arc: a quarter arc centred on the box's lower-left corner, sweeping from the top-left
 *  corner to the lower-right one (the trial's arc bulges toward the upper right). */
function arcStroke(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  ctx.ellipse(x, y + h, w, h, 0, 1.5 * Math.PI, 2 * Math.PI);
}

/**
 * Brackets: the trial paints the single brackets as smooth "(" / ")" arcs filling the
 * adv box (TASK 60 item 3), and the Double Bracket as one "(" and one ")" at the edges.
 */
function bracket(g: GeomCtx, dir: number): void {
  if (dir === 2) {
    bracket({ ...g, w: g.w * 0.48 }, 1);
    bracket({ ...g, x: g.x + g.w * 0.52, w: g.w * 0.48 }, -1);
    return;
  }
  const { ctx, x, y, w, h } = g;
  if (dir > 0) ctx.ellipse(x + 0.98 * w, y + 0.5 * h, 0.98 * w, 0.5 * h, 0, -Math.PI / 2, Math.PI / 2, true);
  else ctx.ellipse(x + 0.02 * w, y + 0.5 * h, 0.98 * w, 0.5 * h, 0, -Math.PI / 2, Math.PI / 2, false);
}

/** Braces: a spine that pinches to a point at the middle of the box ("{" / "}"; 2 = "{ }"). */
function brace(g: GeomCtx, dir: number): void {
  if (dir === 2) {
    brace({ ...g, w: g.w * 0.48 }, 1);
    brace({ ...g, x: g.x + g.w * 0.52, w: g.w * 0.48 }, -1);
    return;
  }
  const { ctx, x, y, w, h } = g;
  const fx = (f: number): number => x + (dir > 0 ? f : 1 - f) * w;
  ctx.moveTo(fx(0.9), y);
  ctx.quadraticCurveTo(fx(0.45), y + 0.05 * h, fx(0.35), y + 0.3 * h);
  ctx.quadraticCurveTo(fx(0.28), y + 0.44 * h, fx(0), y + 0.5 * h);
  ctx.quadraticCurveTo(fx(0.28), y + 0.56 * h, fx(0.35), y + 0.7 * h);
  ctx.quadraticCurveTo(fx(0.45), y + 0.95 * h, fx(0.9), y + h);
}

/** Up-Down Arrow Callout: the trial draws a cross whose four arms end in arrow tips. */
function crossArrow(g: GeomCtx): void {
  // Up-Down Arrow Callout: a plus whose vertical arms end in arrow tips while its horizontal
  // arms stay square (the star-like version does not read as a callout arrow).
  const half = 0.17;
  polygon(g, [
    [0.5, 0.02], [0.78, 0.26], [0.5 + half, 0.26], [0.5 + half, 0.5 - half], [1, 0.5 - half], [1, 0.5 + half],
    [0.5 + half, 0.5 + half], [0.5 + half, 0.74], [0.78, 0.74], [0.5, 0.98], [0.22, 0.74], [0.5 - half, 0.74],
    [0.5 - half, 0.5 + half], [0, 0.5 + half], [0, 0.5 - half], [0.5 - half, 0.5 - half], [0.5 - half, 0.26], [0.22, 0.26],
  ]);
}

/**
 * Action buttons (TASK 60 item 3): the trial's gallery renders these as SOLID shapes -
 * the body filled in its stroke grey with the glyph punched out as a hole (even-odd).
 * Only Help (a boxed "?") and Return/Document (outlined bands) read as line drawings.
 * Every path is our own vector construction.
 */
function actionButton(g: GeomCtx, glyph: string): void {
  const bar = (fx0: number, fy0: number, fx1: number, fy1: number): void => polygon(g, [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]]);
  const { ctx } = g;
  switch (glyph) {
    case 'home':
      polygon(g, [[0.5, 0], [1, 0.42], [0.8, 0.42], [0.8, 1], [0.62, 1], [0.62, 0.68], [0.38, 0.68], [0.38, 1], [0.2, 1], [0.2, 0.42], [0, 0.42]]);
      bar(0.38, 0.68, 0.62, 1);
      break;
    case '?': {
      polygon(g, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      ctx.moveTo(g.x + 0.34 * g.w, g.y + 0.38 * g.h);
      ctx.arc(g.x + 0.5 * g.w, g.y + 0.38 * g.h, min(g.w, g.h) * 0.16, Math.PI, 0, false);
      ctx.lineTo(g.x + 0.5 * g.w, g.y + 0.62 * g.h);
      bar(0.44, 0.62, 0.56, 0.7);
      bar(0.44, 0.76, 0.56, 0.84);
      break;
    }
    case 'i':
      ellipse(g, 0.5, 0.5, 0.5, 0.5);
      bar(0.42, 0.18, 0.58, 0.34);
      bar(0.42, 0.42, 0.58, 0.82);
      break;
    case '<': polygon(g, [[0.98, 0.02], [0.98, 0.98], [0.02, 0.5]]); break;
    case '>': polygon(g, [[0.02, 0.02], [0.02, 0.98], [0.98, 0.5]]); break;
    case '|<': bar(0.02, 0, 0.16, 1); polygon(g, [[0.98, 0], [0.98, 1], [0.26, 0.5]]); break;
    case '>|': bar(0.84, 0, 0.98, 1); polygon(g, [[0.02, 0], [0.02, 1], [0.74, 0.5]]); break;
    case 'return':
      // Action Button Return: a U band whose right end rises into a barbed head pointing up.
      polygon(g, [[0.02, 0.06], [0.02, 0.92], [0.12, 1], [0.72, 1], [0.82, 0.92], [0.82, 0.4], [1, 0.4], [0.62, 0], [0.24, 0.4], [0.46, 0.4], [0.46, 0.84], [0.24, 0.84], [0.24, 0.06]]);
      break;
    case 'doc':
      polygon(g, [[0, 0], [0.72, 0], [1, 0.28], [1, 1], [0, 1]]);
      polygon(g, [[0.72, 0], [0.72, 0.28], [1, 0.28]]);
      break;
    case 'sound': {
      // Action Button Sound: a solid cone with three straight rays of increasing height.
      polygon(g, [[0, 0.34], [0.3, 0.34], [0.5, 0.12], [0.5, 0.88], [0.3, 0.66], [0, 0.66]]);
      bar(0.6, 0.36, 0.68, 0.64);
      bar(0.74, 0.16, 0.82, 0.84);
      bar(0.9, 0, 0.98, 1);
      break;
    }
    case 'film': {
      // Action Button Movie: a solid camera - body, lens cone to the right, viewfinder bump.
      polygon(g, [[0, 0.32], [0.62, 0.32], [0.62, 0.86], [0, 0.86]]);
      polygon(g, [[0.62, 0.4], [0.98, 0.14], [0.98, 0.96], [0.62, 0.7]]);
      polygon(g, [[0.1, 0.02], [0.4, 0.02], [0.4, 0.32], [0.1, 0.32]]);
      break;
    }
    default:
      polygon(g, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      break;
  }
}

function ribbon(g: GeomCtx, kind: number): void {
  // Ribbon banners (TASK 60 item 3, trial measures): a horizontal arch band whose ellipse
  // spans the full adv box width, with forked banner tails hanging from both arch ends.
  // kind 1 = Up (arch over the top), 2 = Down (mirrored), 3/4 = the curved variants with
  // pointed instead of forked tails, 0 = the Left-Right Ribbon: a flat stepped double arrow.
  const { ctx, x, y, w, h } = g;
  if (kind === 0) {
    polygon(g, [[0, 0.45], [0.3, 0.02], [0.3, 0.26], [0.46, 0.26], [0.46, 0.02], [0.7, 0.02], [0.7, 0.24], [1, 0.56], [0.7, 0.97], [0.7, 0.74], [0.54, 0.74], [0.54, 0.52], [0.3, 0.52], [0.3, 0.78]]);
    return;
  }
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (kind === 2 || kind === 4) ctx.scale(1, -1);
  const curved = kind === 3 || kind === 4;
  const cx = 0, cy = h * 0.5 - h / 2;
  const rx = w * 0.49, rxi = w * 0.23;
  const ryi = h * 0.2;
  const xL = -w * 0.49, xR = w * 0.49;
  const xLi = -w * 0.23, xRi = w * 0.23;
  const legBot = h / 2;
  ctx.moveTo(xL, legBot);
  ctx.lineTo(xL, cy);
  ctx.ellipse(cx, cy, rx, h * 0.48, 0, Math.PI, 0, false);
  ctx.lineTo(xR, legBot * (curved ? 0.92 : 1));
  if (curved) {
    ctx.lineTo(xR * 0.55, legBot * 0.6);
    ctx.lineTo(xRi, legBot * 0.92);
  } else {
    ctx.lineTo(xRi + (xR - xRi) * 0.5, legBot * 0.72);
    ctx.lineTo(xRi, legBot);
  }
  ctx.lineTo(xRi, cy);
  ctx.ellipse(cx, cy, rxi, ryi, 0, 0, Math.PI, true);
  ctx.lineTo(xLi, legBot);
  if (curved) {
    ctx.lineTo(xLi * 0.55, legBot * 0.6);
    ctx.lineTo(xL, legBot * 0.92);
  } else {
    ctx.lineTo((xLi + xL) / 2, legBot * 0.72);
    ctx.lineTo(xL, legBot);
  }
  ctx.closePath();
  ctx.restore();
}

/** Scroll banners: a straight panel between two rolled bars; the bars span the full box,
 *  so the icon fills its adv box (trial measure). Horizontal = the 90° rotated variant. */
function scroll(g: GeomCtx, horizontal: boolean): void {
  const body: [number, number][][] = [
    [[0.32, 0.14], [0.68, 0.14], [0.68, 0.86], [0.32, 0.86]],
    [[0, 0], [1, 0], [1, 0.22], [0, 0.22]],
    [[0, 0.78], [1, 0.78], [1, 1], [0, 1]],
    [[0.5, 0.14], [0.5, 0], [0.68, 0], [0.68, 0.14]],
    [[0.32, 0.86], [0.32, 1], [0.5, 1], [0.5, 0.86]],
  ];
  for (const p of body) polygon(g, horizontal ? p.map(([a, b]) => [b, a] as [number, number]) : p);
}

/** Wave / Double Wave: a flag band whose top and bottom edges are parallel sine curves;
 *  the crests touch the box top and the troughs its bottom (trial measure). */
function wave(g: GeomCtx, crests: number): void {
  const { ctx, x, y, w, h } = g;
  const step = w / crests;
  ctx.moveTo(x, y + h * 0.3);
  for (let i = 0; i < crests; i++) {
    ctx.quadraticCurveTo(x + step * (i + 0.25), y - h * 0.3, x + step * (i + 0.5), y + h * 0.3);
    ctx.quadraticCurveTo(x + step * (i + 0.75), y + h * 0.9, x + step * (i + 1), y + h * 0.3);
  }
  ctx.lineTo(x + w, y + h * 0.7);
  for (let i = crests - 1; i >= 0; i--) {
    ctx.quadraticCurveTo(x + step * (i + 0.75), y + h * 1.3, x + step * (i + 0.5), y + h * 0.7);
    ctx.quadraticCurveTo(x + step * (i + 0.25), y + h * 0.1, x + step * i, y + h * 0.7);
  }
  ctx.closePath();
}

/**
 * Curved block arrows: a quarter-band that curves around a corner and ends in a head
 * pointing along the tangent it travels with (curvedRight/Left/Up/Down).
 */
function curvedArrowBand(g: GeomCtx, kind: number): void {
  // Curved block arrows (curvedRight/Left/Up/Down) - trial measure: a U band ("∩"): two
  // parallel legs, a half-elliptic arch across the top, the right leg ending in a barbed
  // head pointing away from the arch. kind 1 mirrors it, kinds 2/3 rotate it 90° (so the
  // band fills the box's own axes: 12.7x20 for left/right, 20x12.7 for up/down).
  const { ctx, x, y, w, h } = g;
  const rot = kind === 2 || kind === 3;
  const W = rot ? h : w, H = rot ? w : h;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (rot) ctx.rotate(Math.PI / 2);
  if (kind === 1 || kind === 3) ctx.scale(-1, 1);
  const xLo = -W * 0.42, xRo = W * 0.42, xRi = W * 0.18, xLi = -W * 0.18;
  const bot = H * 0.5, legTop = 0, archTop = -H * 0.48;
  const ryi = Math.max(W * 0.1, -archTop - W * 0.24);
  const headBot = bot - H * 0.2, barbY = bot - H * 0.13;
  ctx.moveTo(xLo, bot);
  ctx.lineTo(xLo, legTop);
  ctx.ellipse(0, legTop, -xLo, -archTop, 0, Math.PI, 0, false);
  ctx.lineTo(xRo, headBot);
  ctx.lineTo(xRo + W * 0.13, barbY);
  ctx.lineTo((xRo + xRi) / 2, bot);
  ctx.lineTo(xRi - W * 0.13, barbY);
  ctx.lineTo(xRi, headBot);
  ctx.lineTo(xRi, legTop);
  ctx.ellipse(0, legTop, xRi, ryi, 0, 0, Math.PI, true);
  ctx.lineTo(xLi, bot);
  ctx.closePath();
  ctx.restore();
}

/**
 * Arrow callouts (rightArrowCallout and friends): the trial draws the text body as a
 * rectangle with the arrow protruding from one (or several) of its sides.
 */
function bandCallout(g: GeomCtx, kind: string): void {
  // Arrow callouts (rightArrowCallout and friends): the trial draws the text body out to the
  // adv box edges with the barbed arrow protruding from one (or several) sides, so the icon
  // fills its box (TASK 60 item 3 measures: 60x57 device for the single-head variants).
  const hw = 0.16, hd = 0.22, hh = 0.34;
  switch (kind) {
    case 'E':
      polygon(g, [[0, 0], [0.62, 0], [0.62, 0.5 - hw], [1 - hd, 0.5 - hw], [1 - hd, 0.5 - hh], [1, 0.5], [1 - hd, 0.5 + hh], [1 - hd, 0.5 + hw], [0.62, 0.5 + hw], [0.62, 1], [0, 1]]);
      break;
    case 'W':
      polygon(g, [[1, 0], [0.38, 0], [0.38, 0.5 - hw], [hd, 0.5 - hw], [hd, 0.5 - hh], [0, 0.5], [hd, 0.5 + hh], [hd, 0.5 + hw], [0.38, 0.5 + hw], [0.38, 1], [1, 1]]);
      break;
    case 'N':
      polygon(g, [[1, 1], [1, 0.38], [0.5 + hw, 0.38], [0.5 + hw, hd], [0.5 + hh, hd], [0.5, 0], [0.5 - hh, hd], [0.5 - hw, hd], [0.5 - hw, 0.38], [0, 0.38], [0, 1]]);
      break;
    case 'S':
      polygon(g, [[0, 0], [0, 0.62], [0.5 - hw, 0.62], [0.5 - hw, 1 - hd], [0.5 - hh, 1 - hd], [0.5, 1], [0.5 + hh, 1 - hd], [0.5 + hw, 1 - hd], [0.5 + hw, 0.62], [1, 0.62], [1, 0]]);
      break;
    case 'EW':
      polygon(g, [[0.36, 0], [0.64, 0], [0.64, 0.5 - hw], [1 - hd, 0.5 - hw], [1 - hd, 0.5 - hh], [1, 0.5], [1 - hd, 0.5 + hh], [1 - hd, 0.5 + hw], [0.64, 0.5 + hw], [0.64, 1], [0.36, 1], [0.36, 0.5 + hw], [hd, 0.5 + hw], [hd, 0.5 + hh], [0, 0.5], [hd, 0.5 - hh], [hd, 0.5 - hw], [0.36, 0.5 - hw]]);
      break;
    case 'NS':
      polygon(g, [[0, 0.36], [0.5 - hw, 0.36], [0.5 - hw, hd], [0.5 - hh, hd], [0.5, 0], [0.5 + hh, hd], [0.5 + hw, hd], [0.5 + hw, 0.36], [1, 0.36], [1, 0.64], [0.5 + hw, 0.64], [0.5 + hw, 1 - hd], [0.5 + hh, 1 - hd], [0.5, 1], [0.5 - hh, 1 - hd], [0.5 - hw, 1 - hd], [0.5 - hw, 0.64], [0, 0.64]]);
      break;
    default: {
      // quadArrowCallout: a plus-shaped body whose four arms end in barbed heads, filling
      // the whole adv box (the trial measures 60x60 device in the 20 px cell).
      polygon(g, [
        [0.5, 0], [0.84, 0.26], [0.64, 0.26], [0.64, 0.36], [0.74, 0.36], [0.74, 0.16], [1, 0.5], [0.74, 0.84], [0.74, 0.64], [0.64, 0.64],
        [0.64, 0.74], [0.84, 0.74], [0.5, 1], [0.16, 0.74], [0.36, 0.74], [0.36, 0.64], [0.26, 0.64], [0.26, 0.84], [0, 0.5], [0.26, 0.16],
        [0.26, 0.36], [0.36, 0.36], [0.36, 0.26], [0.16, 0.26],
      ]);
      break;
    }
  }
}

function crossMark(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const t = 0.18;
  ctx.moveTo(x, y + t * h); ctx.lineTo(x + (0.5 - t) * w, y + h / 2); ctx.lineTo(x, y + (1 - t) * h); ctx.lineTo(x + t * w, y + (1 - t) * h);
  ctx.lineTo(x + w / 2, y + (0.5 + t) * h); ctx.lineTo(x + (1 - t) * w, y + h); ctx.lineTo(x + w, y + (1 - t) * h);
  ctx.lineTo(x + (0.5 + t) * w, y + h / 2); ctx.lineTo(x + w, y + t * h); ctx.lineTo(x + (1 - t) * w, y + t * h);
  ctx.lineTo(x + w / 2, y + (0.5 - t) * h); ctx.lineTo(x + t * w, y); ctx.closePath();
}

function divide(g: GeomCtx): void {
  // Division: a bar across the middle with open circle dots above and below, the dots
  // touching the box edges (trial measure 50x46).
  polygon(g, [[0, 0.44], [1, 0.44], [1, 0.56], [0, 0.56]]);
  ellipse(g, 0.5, 0.1, 0.1, 0.1);
  ellipse(g, 0.5, 0.9, 0.1, 0.1);
}

/** Left Circular Arrow: a wide arch band ("∩") whose LEFT leg ends in a barbed head pointing
 *  down and whose right leg is a plain tail - the trial's leftCircularArrow fills its box. */
function leftCircularArrow(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const cx = x + w / 2, cy = y + h / 2;
  const xLo = -w * 0.44, xRo = w * 0.44, xRi = w * 0.2, xLi = -w * 0.2;
  const bot = h * 0.5, headBot = bot - h * 0.2, barbY = bot - h * 0.13;
  ctx.moveTo(cx + xRo, cy + bot);
  ctx.lineTo(cx + xRo, cy);
  ctx.ellipse(cx, cy, -xLo, h * 0.48, 0, 0, Math.PI, true);
  ctx.lineTo(cx + xLo, cy + headBot);
  ctx.lineTo(cx + xLo - w * 0.13, cy + barbY);
  ctx.lineTo(cx + (xLo + xLi) / 2, cy + bot);
  ctx.lineTo(cx + xLi + w * 0.13, cy + barbY);
  ctx.lineTo(cx + xLi, cy + headBot);
  ctx.lineTo(cx + xLi, cy);
  ctx.ellipse(cx, cy, xRi, Math.max(w * 0.1, h * 0.48 - w * 0.24), 0, Math.PI, 2 * Math.PI);
  ctx.lineTo(cx + xRi, cy + bot);
  ctx.closePath();
}

/** Left-Right Circular Arrow: the same arch with a barbed head on BOTH legs (trial 60x34). */
function curvedArrow(g: GeomCtx, kind: string): void {
  const { ctx, x, y, w, h } = g;
  if (kind !== 'leftright') {
    const r = Math.min(w, h) * 0.42;
    const cx = x + w / 2, cy = y + h / 2;
    const from = kind === 'left' ? 0.6 : kind === 'single' ? 0.15 : 0.75;
    const to = kind === 'left' ? 2.4 : kind === 'single' ? 1.8 : 2.25;
    ctx.arc(cx, cy, r, from * Math.PI, to * Math.PI, kind === 'left' || kind === 'single');
    const endA = to * Math.PI;
    const ex = cx + r * Math.cos(endA), ey = cy + r * Math.sin(endA);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + r * 0.2 * Math.cos(endA + 1.9), ey + r * 0.2 * Math.sin(endA + 1.9));
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + r * 0.2 * Math.cos(endA - 0.4), ey + r * 0.2 * Math.sin(endA - 0.4));
    return;
  }
  const cx = x + w / 2, cy = y + h / 2;
  const xLo = -w * 0.42, xRo = w * 0.42, xRi = w * 0.19, xLi = -w * 0.19;
  const bot = h * 0.5, headBot = bot - h * 0.18, barbY = bot - h * 0.1;
  ctx.moveTo(cx + (xRo + xRi) / 2, cy + bot);
  ctx.lineTo(cx + xRo + w * 0.13, cy + barbY);
  ctx.lineTo(cx + xRo, cy + headBot);
  ctx.lineTo(cx + xRo, cy);
  ctx.ellipse(cx, cy, -xLo, h * 0.44, 0, 0, Math.PI, true);
  ctx.lineTo(cx + xLo, cy + headBot);
  ctx.lineTo(cx + xLo - w * 0.13, cy + barbY);
  ctx.lineTo(cx + (xLo + xLi) / 2, cy + bot);
  ctx.lineTo(cx + xLi + w * 0.13, cy + barbY);
  ctx.lineTo(cx + xLi, cy + headBot);
  ctx.lineTo(cx + xLi, cy);
  ctx.ellipse(cx, cy, xRi, Math.max(w * 0.1, h * 0.44 - w * 0.22), 0, Math.PI, 2 * Math.PI);
  ctx.lineTo(cx + xRi, cy + headBot);
  ctx.lineTo(cx + xRi - w * 0.13, cy + barbY);
  ctx.closePath();
}

/** Pie Wedge: a quarter disc tucked into the lower-right corner (the trial fills the cell). */
function cornerWedge(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const r = min(w, h);
  ctx.moveTo(x + w, y + h);
  ctx.arc(x + w, y + h, r, Math.PI, 1.5 * Math.PI);
  ctx.closePath();
}

/** Bent Arrow: a uniform band that rises on the left, turns through a rounded elbow and
 *  ends in a barbed head at the right edge (the trial's bentArrow, not a 45° cut). */
function bentBand(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const P = (fx: number, fy: number): [number, number] => [x + fx * w, y + fy * h];
  const q = (fx: number, fy: number, gx: number, gy: number): void => {
    const a = P(fx, fy), b = P(gx, gy);
    ctx.quadraticCurveTo(a[0], a[1], b[0], b[1]);
  };
  ctx.moveTo(...P(0, 1));
  ctx.lineTo(...P(0, 0.36));
  q(0, 0.02, 0.46, 0.02);
  ctx.lineTo(...P(0.6, 0.02));
  ctx.lineTo(...P(0.6, 0));
  ctx.lineTo(...P(1, 0.36));
  ctx.lineTo(...P(0.6, 0.72));
  ctx.lineTo(...P(0.6, 0.5));
  ctx.lineTo(...P(0.46, 0.5));
  q(0.28, 0.5, 0.28, 0.68);
  ctx.lineTo(...P(0.28, 1));
  ctx.closePath();
}

/** U-Turn Arrow: up the left leg, half a turn over the top, down the right leg into a head. */
function uTurnBand(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const cx = x + w / 2, cy = y + h * 0.44, R = 0.44 * w, r = 0.18 * w, foot = y + h;
  ctx.moveTo(cx - R, foot);
  ctx.lineTo(cx - R, cy);
  ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI);
  ctx.lineTo(cx + R + 0.06 * w, cy + 0.3 * R);
  ctx.lineTo(cx + 0.3 * w, foot);
  ctx.lineTo(cx + r - 0.06 * w, cy + 0.3 * R);
  ctx.lineTo(cx + r, cy);
  ctx.arc(cx, cy, r, 0, Math.PI, true);
  ctx.lineTo(cx - r, foot);
  ctx.closePath();
}

/** Chart X / Chart Plus / Chart Star: a square key carrying 2, 4 or 8 spokes inside. */
function chartSpokes(g: GeomCtx, mode: number): void {
  polygon(g, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const { ctx, x, y, w, h } = g;
  if (mode & 1) {
    ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2);
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
  }
  if (mode & 2) {
    ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
  }
}

/** Flowchart: Offline Storage - a funnel outline closed across the wide rim. */
function offlineStorage(g: GeomCtx): void {
  polygon(g, [[0, 0], [1, 0], [0.5, 1]]);
  const { ctx, x, y, w, h } = g;
  ctx.moveTo(x + 0.23 * w, y + 0.32 * h);
  ctx.lineTo(x + 0.77 * w, y + 0.32 * h);
}

/** Swoosh Arrow: a tapered band sweeping from the lower left up into an angled head. */
function swooshArrow(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const P = (fx: number, fy: number): [number, number] => [x + fx * w, y + fy * h];
  const c1 = P(0.16, 0.3), e1 = P(0.56, 0.22), tip = P(1, 0.02), e2 = P(0.74, 0.46), c2 = P(0.32, 0.62), e3 = P(0.34, 1), e4 = P(0.02, 1);
  ctx.moveTo(e4[0], e4[1]);
  ctx.quadraticCurveTo(c1[0], c1[1], e1[0], e1[1]);
  ctx.lineTo(tip[0], tip[1]);
  ctx.lineTo(e2[0], e2[1]);
  ctx.quadraticCurveTo(c2[0], c2[1], e3[0], e3[1]);
  ctx.closePath();
}

/** Corner/Square Tabs: the trial paints only the four corner tabs of these shapes. */
function cornerTabs(g: GeomCtx, square: number): void {
  const t = 0.3;
  const tri: [number, number][][] = [
    [[0, 0], [t, 0], [0, t]], [[1, 0], [1, t], [1 - t, 0]], [[0, 1], [t, 1], [0, 1 - t]], [[1, 1], [1, 1 - t], [1 - t, 1]],
  ];
  const sq: [number, number][][] = [
    [[0, 0], [t, 0], [t, t], [0, t]], [[1 - t, 0], [1, 0], [1, t], [1 - t, t]],
    [[0, 1 - t], [t, 1 - t], [t, 1], [0, 1]], [[1 - t, 1 - t], [1, 1 - t], [1, 1], [1 - t, 1]],
  ];
  for (const pts of square ? sq : tri) polygon(g, pts);
}



/** The barbed end of an arc/strip band: two flared barbs set back from the band end and the
 *  tip pushed out along the travel direction. Shared by the curved and circular arrows. */
function bandHead(ctx: CanvasRenderingContext2D, mx: number, my: number, dx: number, dy: number, halfBase: number, len: number, back: number): void {
  const px = -dy, py = dx;
  ctx.lineTo(mx - dx * back + px * halfBase, my - dy * back + py * halfBase);
  ctx.lineTo(mx + dx * len, my + dy * len);
  ctx.lineTo(mx - dx * back - px * halfBase, my - dy * back - py * halfBase);
}

/** Circular Arrow: a ring band with one gap; the gap ends flare into a head. The trial's
 *  ring fills its adv box, so the ring is an ellipse in the box's own axes (TASK 60 item 3). */
function ringArrow(g: GeomCtx): void {
  const { ctx, x, y, w, h } = g;
  const cx = x + w / 2, cy = y + h / 2;
  const rx = w * 0.47, ry = h * 0.48, rxi = w * 0.22, ryi = h * 0.22;
  const a0 = 0.15 * Math.PI, a1 = 2.05 * Math.PI;
  ctx.moveTo(cx + rx * Math.cos(a0), cy + ry * Math.sin(a0));
  ctx.ellipse(cx, cy, rx, ry, 0, a0, a1);
  bandHead(ctx, cx + (rx + rxi) / 2 * Math.cos(a1), cy + (ry + ryi) / 2 * Math.sin(a1), -Math.sin(a1), Math.cos(a1), (rx - rxi) * 0.85, 0.3 * Math.min(w, h), 0.08 * Math.min(w, h));
  ctx.ellipse(cx, cy, rxi, ryi, 0, a1, a0, true);
  ctx.closePath();
}

/**
 * Fill + line painting for a shape. `prst` is the AutoShapeType name.
 * Exposed for the designer gallery thumbnails as well.
 */
export function paintShape(ctx: CanvasRenderingContext2D, opts: {
  prst: string; x: number; y: number; w: number; h: number;
  fill?: { color?: string | null; visible?: boolean; transparency?: number } | null;
  line?: { color?: string | null; width?: number; visible?: boolean; dash?: number } | null;
  rotation?: number;
  arrow?: { start?: boolean; end?: boolean };
}): void {
  const isLine = /Straight$|^line$|Elbow|Curved$|Connector|noHead/.test(opts.prst);
  ctx.save();
  if (opts.rotation) {
    ctx.translate(opts.x + opts.w / 2, opts.y + opts.h / 2);
    ctx.rotate((opts.rotation * Math.PI) / 180);
    ctx.translate(-(opts.x + opts.w / 2), -(opts.y + opts.h / 2));
  }
  ctx.beginPath();
  addShapePath(ctx, opts.prst, opts.x, opts.y, opts.w, opts.h);
  const lineW = Math.max(0.25, opts.line?.visible === false ? 0 : opts.line?.width ?? 2);
  if (opts.fill?.visible !== false && !isLine) {
    ctx.globalAlpha = 1 - Math.min(1, Math.max(0, (opts.fill?.transparency ?? 0) / 100));
    ctx.fillStyle = opts.fill?.color ?? 'transparent';
    ctx.fill('evenodd');
    ctx.globalAlpha = 1;
  }
  if (opts.line?.visible !== false || isLine) {
    ctx.strokeStyle = opts.line?.color ?? '#4a4a4a';
    ctx.lineWidth = lineW || 1;
    if (opts.line?.dash) ctx.setLineDash([lineW * 2.5, lineW * 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (opts.arrow?.end) arrowHead(ctx, opts.prst, opts.x, opts.y, opts.w, opts.h, 'end');
    if (opts.arrow?.start) arrowHead(ctx, opts.prst, opts.x, opts.y, opts.w, opts.h, 'start');
  }
  ctx.restore();
}

/**
 * Filled arrow head for the connector presets. The head sits on the connector's
 * end point and points along the tangent the connector leaves that point with, so the
 * straight / elbow / curved variants each read differently (and the start head points
 * back along the connector instead).
 */
function arrowHead(ctx: CanvasRenderingContext2D, prst: string, x: number, y: number, w: number, h: number, end: string): void {
  const elbow = /Elbow|bentConnector/.test(prst);
  const curved = /Curved|curvedConnector/.test(prst);
  const tip = end === 'end' ? [x + w, y + h] : [x, y];
  const dir: [number, number] = end === 'end'
    ? (elbow || curved ? [0, 1] : [Math.SQRT1_2, Math.SQRT1_2])
    : (elbow || curved ? [-1, 0] : [-Math.SQRT1_2, -Math.SQRT1_2]);
  const size = Math.max(2.5, Math.min(Math.min(w, h) * 0.24, 4));
  const [dx, dy] = dir;
  const [nx, ny] = [-dy, dx];
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(tip[0] - dx * size + nx * size * 0.45, tip[1] - dy * size + ny * size * 0.45);
  ctx.lineTo(tip[0] - dx * size - nx * size * 0.45, tip[1] - dy * size - ny * size * 0.45);
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}

/** Renders the nine form-control object types onto the shape canvas. */
export function paintFormControl(ctx: CanvasRenderingContext2D, control: ShapeControl, caption: string, x: number, y: number, w: number, h: number): void {
  const type = String(control.objectType ?? 'Button');
  ctx.save();
  ctx.strokeStyle = '#404040';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 1;
  const box = 13;
  const checked = control.value === true || control.value === 1 || control.value === '1';
  const text = caption || '';
  const label = (tx: number): void => {
    ctx.fillStyle = '#111111';
    ctx.font = '12px Calibri, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, tx, y + h / 2);
  };
  switch (type) {
    case 'CheckBox':
      ctx.strokeRect(x + 2.5, y + (h - box) / 2 + 0.5, box, box);
      if (checked) { ctx.fillStyle = '#4472c4'; ctx.fillRect(x + 4, y + (h - box) / 2 + 1.5, box - 3, box - 3); }
      label(x + 2 + box + 5);
      break;
    case 'OptionButton':
      ctx.beginPath();
      ctx.arc(x + 2 + box / 2, y + h / 2, box / 2, 0, Math.PI * 2);
      ctx.stroke();
      if (checked) { ctx.fillStyle = '#111111'; ctx.beginPath(); ctx.arc(x + 2 + box / 2, y + h / 2, 3, 0, Math.PI * 2); ctx.fill(); }
      label(x + 2 + box + 5);
      break;
    case 'Button':
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#111111';
      ctx.font = '12px Calibri, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(text, x + w / 2, y + h / 2 + 1);
      break;
    case 'ComboBox':
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.strokeRect(w - 16 + x + 0.5, y + 0.5, 15, h - 1);
      ctx.beginPath(); ctx.moveTo(x + w - 12, y + h / 2 - 1.5); ctx.lineTo(x + w - 6, y + h / 2 - 1.5); ctx.lineTo(x + w - 9, y + h / 2 + 2.5); ctx.closePath();
      ctx.fillStyle = '#404040'; ctx.fill();
      label(x + 4);
      break;
    case 'ListBox':
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.strokeRect(x + w - 14.5, y + 0.5, 14, h - 1);
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(x + w - 14, y + 14, 13, Math.max(10, h * 0.3));
      (String((control.items ?? []).join('\n')) || text).split('\n').slice(0, Math.max(1, Math.floor((h - 4) / 16))).forEach((item, i) => {
        ctx.fillStyle = i === 0 ? '#4472c4' : 'transparent';
        if (i === 0) ctx.fillRect(x + 1, y + 1 + i * 16, w - 16, 15);
        ctx.fillStyle = i === 0 ? '#ffffff' : '#111111';
        ctx.font = '12px Calibri, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(item, x + 4, y + 8 + i * 16);
      });
      break;
    case 'SpinButton':
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + w / 2 + 0.5, y + 0.5, w / 2 - 1, h / 2 - 1);
      ctx.strokeRect(x + w / 2 + 0.5, y + h / 2 + 0.5, w / 2 - 1, h / 2 - 1);
      ctx.beginPath(); ctx.moveTo(x + w * 0.68, y + h * 0.27); ctx.lineTo(x + w * 0.82, y + h * 0.27); ctx.lineTo(x + w * 0.75, y + h * 0.15); ctx.closePath();
      ctx.moveTo(x + w * 0.68, y + h * 0.73); ctx.lineTo(x + w * 0.82, y + h * 0.73); ctx.lineTo(x + w * 0.75, y + h * 0.85); ctx.closePath();
      ctx.fillStyle = '#404040'; ctx.fill();
      label(x + 3);
      break;
    case 'ScrollBar':
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#e0e0e0';
      ctx.fillRect(x + h, y + 1, w - 2 * h, h - 2);
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(x + 1, y + 1, h - 2, h - 2);
      ctx.fillRect(x + w - h, y + 1, h - 2, h - 2);
      ctx.fillStyle = '#9e9e9e';
      ctx.beginPath(); ctx.moveTo(x + h / 2 + 3, y + h / 2); ctx.lineTo(x + h / 2 - 3, y + h / 2 - 3); ctx.lineTo(x + h / 2 - 3, y + h / 2 + 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + w - h / 2 - 3, y + h / 2); ctx.lineTo(x + w - h / 2 + 3, y + h / 2 - 3); ctx.lineTo(x + w - h / 2 + 3, y + h / 2 + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(x + h + (w - 2 * h) * 0.45, y + 1, Math.max(8, (w - 2 * h) * 0.2), h - 2);
      break;
    case 'Label':
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      label(x + 3);
      break;
    case 'GroupBox':
      ctx.strokeStyle = '#8f8f8f';
      ctx.strokeRect(x + 0.5, y + 10.5, w - 1, h - 11);
      if (text) {
        ctx.fillStyle = 'transparent';
        ctx.font = '12px Calibri, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const tw = ctx.measureText(text).width;
        ctx.clearRect(x + 6, y, tw + 8, 12);
        ctx.fillStyle = '#111111';
        ctx.fillText(text, x + 10, y + 6);
      }
      break;
    default:
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      label(x + 3);
  }
  ctx.restore();
}