/* Insert-tab UI: shape/sparkline/form-control galleries, the drag-to-place overlay,
 * and the Format Shape task panel. Thumbnails are drawn by our own geometry engine. */
import React, { useEffect, useRef } from 'react';
// Deep dist path on purpose: the core's package exports map is read once by dev-server
// caches, and the shape painters must stay out of the core's main entry (the designer's
// IIFE bundle would otherwise inline the whole GC runtime).
import { paintFormControl, paintShape } from '@mescius/spread-sheets/dist/gc.spread.sheets.internals.js';
import { useDesigner, useDesignerVersion } from './store.js';
import { shapeGalleryGroups, shapeGalleryIconSize, sparklineGroups, formControls } from './commands/insert.js';
import { shapeGalleryLabels } from './commands/insert-shape-names.js';
import { shapeGalleryThumbBox } from './commands/insert-shape-aspect.js';
import type { DesignerShape, Worksheet } from './core-internals.js';
import { internals, shapesOf } from './core-internals.js';

/* -------------------------------------------------------------- thumbs --- */

function ThumbCanvas({ paint, size = 24, className = '', title }: { paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; size?: number; className?: string; title?: string }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    paint(ctx, size, size);
  }, [paint, size]);
  return <canvas ref={ref} className={`gc-designer-thumb${className}`} style={{ width: size, height: size }} title={title} aria-label={title} />;
}

/** Outlines a gallery preset with the core geometry engine (dark stroke, no fill).
 *  TASK 60 item 3: the trial draws every preset with its own canonical aspect (measured
 *  per tile into `shapeGalleryThumbBox`); the shape fills the cell's larger axis and is
 *  centred on the other one, exactly as the trial's 20px/16px thumbs do.
 *  TASK 63 item 11: the trial's action-button tiles (Home, Information, Back/Forward,
 *  Beginning/End, Return, Document, Sound, Movie, Help) are a rounded plate (measured
 *  stroke #bababa, 1px, box 1.5..18.5 r~2 in the 20px tile) with the glyph drawn inside
 *  it (measured #767676): solid where the trial's glyph is solid, line-drawn where the
 *  trial's is a line drawing (Document, Help, Home's body; Home's roof is solid). */
const shapePainter = (id: string, preset: string, arrows: { start?: boolean; end?: boolean }) =>
  (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
    const [fw, fh] = shapeGalleryThumbBox[id] ?? [1, 1];
    // The table holds the trial's INK box; paths are stroked 1 px centred on the box edge,
    // so the geometry box is the measured ink box minus the stroke spread (~1 CSS per axis).
    const inset = 1.0;
    const bw = Math.max(2, w * fw - inset), bh = Math.max(2, h * fh - inset);
    const x = (w - bw) / 2, y = (h - bh) / 2;
    // Sharp tips are drawn with mitered joins by default, which overshoot the trial's ink
    // by a pixel or two; round joins keep the strokes inside the measured box.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const box = PLATE_GLYPH_BOX[id];
    if (box) {
      const s = Math.min(w, h) / 20;
      ctx.save();
      ctx.translate((w - 20 * s) / 2, (h - 20 * s) / 2);
      ctx.scale(s, s);
      ctx.strokeStyle = '#bababa';
      ctx.lineWidth = 1;
      roundRectPath(ctx, 1.5, 1.5, 17, 17, 2.2);
      ctx.stroke();
      const solid = PLATE_GLYPH_SOLID.has(id);
      if (id === 'actionButtonHome') {
        // measured solid roof: apex tile (10,2.9), eaves y 9 (x 2.4..17.6)
        ctx.fillStyle = '#767676';
        ctx.beginPath();
        ctx.moveTo(10, 2.9); ctx.lineTo(17.6, 9); ctx.lineTo(2.4, 9); ctx.closePath();
        ctx.fill();
        ctx.fillRect(12.5, 4, 2, 2); // chimney (measured x12.5..14.5, y4..6)
      }
      if (id === 'actionButtonReturn' || id === 'actionButtonSound') {
        /* TASK 63 item 11 — the trial draws these two as single bespoke glyphs rather than
           preset shapes: a solid U-turn arrow (Return: 2 px arms, semicircular bottom, flat
           triangular head) and a trapezoid horn with three dashed rays (Sound). */
        ctx.fillStyle = '#767676';
        ctx.strokeStyle = '#767676';
        if (id === 'actionButtonReturn') {
          ctx.beginPath();
          ctx.moveTo(4, 7.5); ctx.lineTo(4, 11.5);
          ctx.arc(9, 11.5, 5, Math.PI, 0, true);
          ctx.lineTo(14, 7); ctx.lineTo(16.5, 7); ctx.lineTo(13.5, 4); ctx.lineTo(10.5, 7);
          ctx.lineTo(12.5, 7); ctx.lineTo(12.5, 11.5);
          ctx.arc(9, 11.5, 3.5, 0, Math.PI, false);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(10.5, 7); ctx.lineTo(2.5, 9.5); ctx.lineTo(2.5, 13); ctx.lineTo(10.5, 16.5);
          ctx.closePath();
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 1.6]);
          ctx.beginPath(); ctx.moveTo(12.6, 6.9); ctx.lineTo(16.2, 4.4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(12.6, 13.7); ctx.lineTo(16.2, 16.1); ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(12.7, 10.4); ctx.lineTo(17, 10.4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(12.7, 11.4); ctx.lineTo(17, 11.4); ctx.stroke();
        }
        ctx.restore();
        return;
      }
      paintShape(ctx, {
        prst: preset, x: box[0], y: box[1], w: box[2], h: box[3],
        fill: { visible: solid && id !== 'actionButtonHome', color: '#767676' },
        line: { visible: !(solid && id !== 'actionButtonHome'), color: '#767676', width: 1, dash: 0 },
        arrow: { start: !!arrows.start, end: !!arrows.end },
      });
      ctx.restore();
      drawGalleryCount(ctx, preset, bw, bh, x, y);
      return;
    }
    paintShape(ctx, {
      prst: preset, x, y, w: bw, h: bh,
      fill: { visible: false },
      line: { visible: true, color: '#707070', width: 1, dash: 0 },
      arrow: { start: !!arrows.start, end: !!arrows.end },
    });
    drawGalleryCount(ctx, preset, bw, bh, x, y);
  };

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Action-button tiles the trial draws as a plate + inner glyph (measured per-glyph box
 *  from the trial's 20px tiles, TASK 63 item 11). */
const PLATE_GLYPH_BOX: Record<string, [number, number, number, number]> = {
  actionButtonHome: [2.4, 2.8, 15.2, 14.4],
  actionButtonHelp: [2.5, 2.5, 15, 15],
  actionButtonInformation: [3.6, 3.6, 12.8, 12.8],
  actionButtonBackorPrevious: [5.5, 5.5, 8, 9],
  actionButtonForwardorNext: [6.5, 5.5, 8, 9],
  actionButtonBeginning: [3, 5, 11, 9.5],
  actionButtonEnd: [6, 5, 11, 9.5],
  actionButtonReturn: [3.5, 4, 13, 12],
  actionButtonDocument: [3, 2.5, 12.5, 14.5],
  actionButtonSound: [1.5, 4.5, 16, 11],
  actionButtonMovie: [2, 5, 15, 9.5],
};
/** Where the trial's glyph is a solid fill vs a line drawing. */
const PLATE_GLYPH_SOLID = new Set([
  'actionButtonHome', 'actionButtonInformation', 'actionButtonBackorPrevious', 'actionButtonForwardorNext',
  'actionButtonBeginning', 'actionButtonEnd', 'actionButtonReturn', 'actionButtonSound', 'actionButtonMovie',
]);

/**
 * The trial's gallery draws many-sided polygons with their side count and the text box
 * with an "A" — a plain outline of a 10- or 12-sided figure is indistinguishable from a
 * circle at 20 px. Both marks are our own vector strokes (seven-segment digits).
 */
const GALLERY_COUNTS: Record<string, string> = { 'hor-text-box': 'A', heptagon: '7', octagon: '8', decagon: '10', dodecagon: '12' };
const SEVEN_SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgdec', '7': 'abc', '8': 'abcdefg', '9': 'abcfgd',
};
const SEGMENT_LINES: Record<string, [number, number, number, number]> = {
  a: [0, 0, 1, 0], b: [1, 0, 1, 0.5], c: [1, 0.5, 1, 1], d: [1, 1, 0, 1], e: [0, 1, 0, 0.5], f: [0, 0.5, 0, 0], g: [0, 0.5, 1, 0.5],
};

function drawGalleryCount(ctx: CanvasRenderingContext2D, preset: string, w: number, h: number, offX = 0, offY = 0): void {
  const text = GALLERY_COUNTS[preset];
  if (!text) return;
  ctx.save();
  ctx.strokeStyle = '#707070';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  if (text === 'A') {
    // Letter A: two legs and a crossbar, centred in the box.
    const cx = offX + w / 2, cy = offY + h / 2, s = Math.min(w, h) * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy + s); ctx.lineTo(cx, cy - s); ctx.lineTo(cx + s, cy + s);
    ctx.moveTo(cx - s * 0.5, cy + s * 0.3); ctx.lineTo(cx + s * 0.5, cy + s * 0.3);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const digits = [...text];
  const dw = Math.min(w, h) * 0.21, dh = Math.min(w, h) * 0.34;
  const gap = dw * 0.5;
  const total = digits.length * dw + (digits.length - 1) * gap;
  let x = offX + (w - total) / 2;
  const y = offY + (h - dh) / 2;
  ctx.beginPath();
  for (const digit of digits) {
    for (const key of SEVEN_SEGMENTS[digit] ?? '') {
      const [x0, y0, x1, y1] = SEGMENT_LINES[key];
      ctx.moveTo(x + x0 * dw, y + y0 * dh);
      ctx.lineTo(x + x1 * dw, y + y1 * dh);
    }
    x += dw + gap;
  }
  ctx.stroke();
  ctx.restore();
}

const sparklinePainter = (kind: string) => (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
  const P = (fx: number, fy: number): [number, number] => [fx * w, fy * h];
  const line = (pts: [number, number][], color: string, width = 1.5): void => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  const bars = (values: number[], color: string, horizontal = false): void => {
    ctx.fillStyle = color;
    values.forEach((v, i) => {
      if (horizontal) ctx.fillRect(w * 0.15, h * (0.15 + i * 0.16), Math.abs(v) * w * 0.7, h * 0.1);
      else ctx.fillRect(w * (0.12 + i * 0.2), h - Math.abs(v) * h * 0.8 - h * 0.12, w * 0.12, Math.abs(v) * h * 0.8);
    });
  };
  // Trial signature (TASK 55): every sparkline thumb sits on a hairline plot frame with an
  // L-shaped axis crossing the frame's left and bottom edges and extending past them.
  if (kind !== 'month' && kind !== 'year') {
    ctx.strokeStyle = '#9c9c9c'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(w * 0.14) + 0.5, Math.round(h * 0.1) + 0.5, Math.round(w * 0.78), Math.round(h * 0.76));
    ctx.beginPath();
    ctx.moveTo(Math.round(w * 0.14) + 0.5, h * 0.02); ctx.lineTo(Math.round(w * 0.14) + 0.5, h * 0.98);
    ctx.moveTo(w * 0.04, Math.round(h * 0.86) + 0.5); ctx.lineTo(w * 0.97, Math.round(h * 0.86) + 0.5);
    ctx.stroke();
  }
  switch (kind) {
    case 'line': line([P(0.05, 0.7), P(0.3, 0.35), P(0.55, 0.55), P(0.8, 0.2), P(0.95, 0.4)], '#4472c4'); break;
    case 'area': {
      ctx.fillStyle = '#7da7e0';
      ctx.beginPath(); ctx.moveTo(...P(0.05, 0.9)); ctx.lineTo(...P(0.3, 0.5)); ctx.lineTo(...P(0.55, 0.65)); ctx.lineTo(...P(0.8, 0.3)); ctx.lineTo(...P(0.95, 0.5)); ctx.lineTo(...P(0.95, 0.9)); ctx.closePath(); ctx.fill();
      line([P(0.05, 0.9), P(0.3, 0.5), P(0.55, 0.65), P(0.8, 0.3), P(0.95, 0.5), P(0.95, 0.9)], '#2f5597', 1);
      break;
    }
    case 'column': bars([0.5, 0.9, 0.35], '#4472c4'); break;
    case 'winloss': bars([0.5, 0.8, 0.6], '#c00000'); ctx.fillStyle = '#00b050'; ctx.fillRect(w * 0.32, h * 0.55, w * 0.12, h * 0.3); break;
    case 'stacked': bars([0.4, 0.8, 0.3], '#ed7d31'); ctx.fillStyle = '#a5a5a5'; ctx.fillRect(w * 0.12, h * 0.35, w * 0.12, h * 0.2); ctx.fillRect(w * 0.52, h * 0.15, w * 0.12, h * 0.3); break;
    case 'cascade': ctx.fillStyle = '#5b9bd5'; ctx.fillRect(w * 0.1, h * 0.65, w * 0.16, h * 0.25); ctx.fillStyle = '#ed7d31'; ctx.fillRect(w * 0.42, h * 0.4, w * 0.16, h * 0.25); ctx.fillStyle = '#5b9bd5'; ctx.fillRect(w * 0.74, h * 0.2, w * 0.16, h * 0.2); break;
    case 'pareto': bars([0.85, 0.6, 0.4, 0.25], '#4472c4'); line([P(0.1, 0.15), P(0.35, 0.35), P(0.6, 0.55), P(0.85, 0.8)], '#ed7d31', 1); break;
    case 'hbar': bars([0.9, 0.6], '#ed7d31', true); break;
    case 'vbar': bars([0.8, 0.5], '#4472c4'); break;
    case 'histogram': {
      ctx.fillStyle = '#4472c4';
      [0.3, 0.6, 0.9, 0.5, 0.25].forEach((v, i) => ctx.fillRect(w * 0.08 + i * w * 0.17, h - v * h * 0.8, w * 0.16, v * h * 0.8));
      break;
    }
    case 'pie': {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
      [['#4472c4', 0, 1.4], ['#ed7d31', 1.4, 2.4], ['#a5a5a5', 2.4, 3.1], ['#f2f2f2', 3.1, 6.28]].forEach(([color, a0, a1]) => {
        ctx.fillStyle = String(color); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, Number(a0), Number(a1)); ctx.closePath(); ctx.fill();
      });
      break;
    }
    case 'scatter': {
      ctx.fillStyle = '#4472c4';
      [[0.2, 0.7], [0.35, 0.4], [0.5, 0.6], [0.7, 0.25], [0.85, 0.5]].forEach(([fx, fy]) => { ctx.beginPath(); ctx.arc(fx * w, fy * h, 1.8, 0, Math.PI * 2); ctx.fill(); });
      break;
    }
    case 'spread': {
      ctx.fillStyle = '#ed7d31';
      [[0.2, 0.6], [0.4, 0.4], [0.6, 0.6], [0.8, 0.4]].forEach(([fx, fy]) => { ctx.beginPath(); ctx.moveTo(fx * w, fy * h - 3); ctx.lineTo(fx * w + 3, fy * h); ctx.lineTo(fx * w, fy * h + 3); ctx.lineTo(fx * w - 3, fy * h); ctx.closePath(); ctx.fill(); });
      break;
    }
    case 'month': case 'year': {
      // Trial thumb: a tiny month/year calendar grid (own drawing), letter in the first cell.
      const gx = w * 0.18, gy = h * 0.14, gw = w * 0.64, gh = h * 0.7;
      ctx.strokeStyle = '#4472c4'; ctx.lineWidth = 1;
      ctx.strokeRect(gx + 0.5, gy + 0.5, gw, gh);
      ctx.strokeStyle = '#9dc3e6';
      for (let r = 1; r < 3; r++) { ctx.beginPath(); ctx.moveTo(gx, gy + (gh / 3) * r); ctx.lineTo(gx + gw, gy + (gh / 3) * r); ctx.stroke(); }
      for (let c = 1; c < 3; c++) { ctx.beginPath(); ctx.moveTo(gx + (gw / 3) * c, gy); ctx.lineTo(gx + (gw / 3) * c, gy + gh); ctx.stroke(); }
      ctx.fillStyle = '#4472c4'; ctx.font = `bold ${Math.round(h * 0.24)}px Calibri, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(kind === 'month' ? 'M' : 'Y', gx + gw / 6, gy + gh / 6 + 0.5);
      break;
    }
    case 'boxplot': {
      ctx.strokeStyle = '#2f5597'; ctx.lineWidth = 1;
      ctx.strokeRect(w * 0.3, h * 0.3, w * 0.4, h * 0.4);
      line([P(0.5, 0.1), P(0.5, 0.3), P(0.5, 0.7), P(0.5, 0.9)], '#2f5597', 1);
      break;
    }
    case 'bullet': ctx.fillStyle = '#4472c4'; ctx.fillRect(w * 0.1, h * 0.4, w * 0.6, h * 0.2); ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(w * 0.75, h * 0.25); ctx.lineTo(w * 0.75, h * 0.75); ctx.stroke(); break;
    case 'variance': case 'lollipop-variance': {
      ctx.strokeStyle = '#4472c4'; ctx.fillStyle = '#4472c4';
      [[0.25, 0.6], [0.5, 0.3], [0.75, 0.65]].forEach(([fx, fy]) => { ctx.beginPath(); ctx.moveTo(fx * w, h * 0.75); ctx.lineTo(fx * w, fy * h); ctx.stroke(); ctx.beginPath(); ctx.arc(fx * w, fy * h, 2.2, 0, Math.PI * 2); ctx.fill(); });
      break;
    }
    case 'rangeblock': ctx.fillStyle = '#a5c8ea'; [0.2, 0.45, 0.7].forEach((fx, i) => { ctx.fillStyle = ['#d6e4f7', '#9dc3e6', '#2f5597'][i]; ctx.fillRect(fx * w, h * 0.25, w * 0.18, h * 0.5); }); break;
    case 'gaugeKPI': {
      ctx.strokeStyle = '#4472c4'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(w / 2, h * 0.7, Math.min(w, h) * 0.4, Math.PI, Math.PI * 2); ctx.stroke();
      line([P(0.5, 0.7), P(0.68, 0.32)], '#c00000', 1.5);
      break;
    }
    case 'image': {
      ctx.fillStyle = '#8faadc'; ctx.fillRect(3, 4, w - 6, h - 8);
      ctx.fillStyle = '#ffe699'; ctx.beginPath(); ctx.arc(w * 0.32, h * 0.38, 2.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'progress': ctx.fillStyle = '#d9d9d9'; ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.35, 0.5 * Math.PI, 2.5 * Math.PI); ctx.fill(); ctx.strokeStyle = '#4472c4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.35, 1.35 * Math.PI, 2.5 * Math.PI); ctx.stroke(); break;
    default: line([P(0.1, 0.7), P(0.4, 0.4), P(0.7, 0.55), P(0.9, 0.25)], '#4472c4');
  }
};

const formControlPainter = (objectType: string) => (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
  const p = 3;
  paintFormControl(ctx, { objectType }, '', p, p, w - 2 * p, h - 2 * p);
};

/* ------------------------------------------------------------ galleries --- */

/* Gallery DOM and metrics follow the trial: the shape and form-control galleries are
 * `gc-list-control-group` blocks (22px bold title + wrapped 24/28px cells with 16/20px
 * icons), the sparkline gallery uses `gc-designer-group` blocks with 56x52 cells and
 * 50x50 `ribbon-button-sparkline-*` icons. */
function GalleryGroup({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="gc-designer-group">
      <div className="gc-designer-group-title">{title}</div>
      <div className="gc-designer-group-content">{children}</div>
    </div>
  );
}

export function ShapeGalleryMenu(): React.ReactElement {
  const d = useDesigner();
  const run = (id: string): void => { d.drawTool = { kind: 'shape', galleryId: id }; d.openMenu = null; d.invalidate(); };
  return (
    <div className="gc-shape-gallery gc-list-control-container" role="menu" aria-label="Shapes">
      {shapeGalleryGroups.map(group => {
        const size = shapeGalleryIconSize(group.title);
        return (
          <div className="gc-list-control-group" key={group.title}>
            <div className="gc-list-control-group-text">{group.title}</div>
            <div className="gc-list-control-item-wrap gc-list-alignment-horizontal">
              {group.items.map(item => {
                const label = shapeGalleryLabels[item.id] ?? item.id;
                return (
                <div key={item.id} className="gc-list-control-item gc-designer-list-content-item-focusable" role="menuitem" title={label} aria-label={label}
                  onClick={() => run(item.id)}>
                  <div className={`shape-insert-item insert-shape-item-${item.id} gc-list-control-item-icon`}>
                    <ThumbCanvas paint={shapePainter(item.id, item.preset, { start: item.startArrow, end: item.endArrow })} size={size} title={label} />
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const sparklineKinds: Record<string, string> = {
  sparklinesLineSparkline: 'line', sparklinesAreaSparkline: 'area', sparklinesColumnSparkline: 'column', sparklinesWinLossSparkline: 'winloss',
  sparklinesStackedSparkline: 'stacked', sparklinesCascadeSparkline: 'cascade', sparklinesParetoSparkline: 'pareto', sparklinesHBarSparkline: 'hbar',
  sparklinesVBarSparkline: 'vbar', sparklinesHistogramSparkline: 'histogram', sparklinesPieSparkline: 'pie', sparklinesScatterSparkline: 'scatter',
  sparklinesSpreadsSparkline: 'spread', sparklinesMonthSparkline: 'month', sparklinesYearSparkline: 'year', sparklinesBoxPlotSparkline: 'boxplot',
  sparklinesBulletSparkline: 'bullet', sparklinesVarianceSparkline: 'variance', sparklinesRangeBlockSparkline: 'rangeblock', sparklinesGaugeKPISparkline: 'gaugeKPI',
  sparklineImageSparkline: 'image', sparklinesLollipopVarianceSparkline: 'lollipop-variance', sparklinesProgressSparkline: 'progress',
};

export function SparklineGalleryMenu(): React.ReactElement {
  const d = useDesigner();
  return (
    <div className="gc-sparkline-gallery sparklineGallery-dropdown-container" role="menu" aria-label="Sparklines">
      {sparklineGroups.map(group => (
        <GalleryGroup key={group.title} title={group.title}>
          {group.items.map(item => {
            const kind = sparklineKinds[item.command] ?? 'line';
            return (
              <div key={item.command} className="sparkline-insert-item" role="menuitem" title={item.title} aria-label={item.title}
                onClick={() => { d.openMenu = null; d.executeCommand(item.command); }}>
                <ThumbCanvas paint={sparklinePainter(kind)} size={50} className=" gc-sparkline-thumb gc-designer-ribbon-icon" title={item.title} />
              </div>
            );
          })}
        </GalleryGroup>
      ))}
    </div>
  );
}

export function FormControlGalleryMenu(): React.ReactElement {
  const d = useDesigner();
  return (
    <div className="gc-form-control-gallery gc-list-control-container" role="menu" aria-label="Form Controls">
      <div className="gc-list-control-group">
        <div className="gc-list-control-group-text">Form Controls</div>
        <div className="gc-list-control-item-wrap gc-list-alignment-horizontal">
          {formControls.map(control => (
            <div key={control.id} className="gc-list-control-item gc-designer-list-content-item-focusable" role="menuitem" title={control.label} aria-label={control.label}
              onClick={() => { d.drawTool = { kind: 'formControl', controlId: control.id }; d.openMenu = null; d.invalidate(); }}>
              <div className={`insert-form-control-item insert-form-control-item-${control.id} gc-list-control-item-icon`}>
                <ThumbCanvas paint={formControlPainter(control.objectType)} size={20} title={control.label} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- draw layer --- */

/** Rubber-band overlay mounted while a ribbon command awaits a drag on the sheet. */
export function DrawOverlay(): React.ReactElement | null {
  const d = useDesigner();
  useDesignerVersion();
  const tool = d.drawTool;
  useEffect(() => {
    const cancel = (event: KeyboardEvent): void => { if (event.key === 'Escape' && d.drawTool) { d.drawTool = null; d.invalidate(); } };
    document.addEventListener('keydown', cancel);
    return () => document.removeEventListener('keydown', cancel);
  }, [d]);
  if (!tool) return null;
  const toModel = (clientX: number, clientY: number): { x: number; y: number } => {
    const sheet: Worksheet = d.getWorkbook().getActiveSheet();
    const view = internals(sheet)._view?.();
    const rect = d.sheetHost.getBoundingClientRect();
    const scrollX = view?.scrollX ?? 0, scrollY = view?.scrollY ?? 0, zoom = view?.zoom ?? 1;
    const headerWidth = view?.headerWidth ?? 0, headerHeight = view?.headerHeight ?? 0;
    const viewportX = view?.viewportX ?? 0, viewportY = view?.viewportY ?? 0;
    return { x: (clientX - rect.left - viewportX - headerWidth) / zoom + scrollX, y: (clientY - rect.top - viewportY - headerHeight) / zoom + scrollY };
  };
  const start = (event: React.PointerEvent): void => {
    if (event.button !== 0) { d.drawTool = null; d.invalidate(); return; }
    event.preventDefault();
    const origin = { x: event.clientX, y: event.clientY };
    const preview = document.createElement('div');
    preview.className = 'opensheets-draw-preview';
    preview.style.position = 'fixed';
    document.body.append(preview);
    const move = (moveEvent: PointerEvent): void => {
      const left = Math.min(origin.x, moveEvent.clientX);
      const top = Math.min(origin.y, moveEvent.clientY);
      Object.assign(preview.style, { left: `${left}px`, top: `${top}px`, width: `${Math.abs(moveEvent.clientX - origin.x)}px`, height: `${Math.abs(moveEvent.clientY - origin.y)}px` });
    };
    const up = (upEvent: PointerEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      preview.remove();
      const a = toModel(origin.x, origin.y);
      const b = toModel(upEvent.clientX, upEvent.clientY);
      const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(4, Math.abs(b.x - a.x)), height: Math.max(4, Math.abs(b.y - a.y)) };
      if (tool.onDone) { d.drawTool = null; tool.onDone(box); d.invalidate(); }
      else d.finishDrawTool(box);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div className="gc-designer-draw-overlay" data-tool={tool.kind} role="presentation" onPointerDown={start} />;
}

/* ----------------------------------------------------- format shape panel */

export function ShapeFormatPanel(): React.ReactElement | null {
  const d = useDesigner();
  useDesignerVersion();
  const name = d._formatShapePanel;
  if (!name) return null;
  const sheet = d.getWorkbook().getActiveSheet();
  const shape = shapesOf(sheet).get(name) as (DesignerShape & { isCamera?(): boolean; isPicture?(): boolean; fill?(): Record<string, unknown>; line?(): Record<string, unknown> }) | undefined;
  if (!shape) return null;
  // TASK 81: a group handle (and the trial classes it mirrors) answers no fill()/line() accessor.
  const fill = (typeof shape.fill === 'function' ? shape.fill() : { visible: false }) as Record<string, unknown>;
  const line = (typeof shape.line === 'function' ? shape.line() : { visible: false }) as Record<string, unknown>;
  const apply = (patch: Record<string, unknown>): void => d.runUndoable('applyShapeStyle', { data: { name, ...patch } });
  const row = (label: string, node: React.ReactNode): React.ReactElement => (
    <div className="gc-format-shape-row"><span className="gc-format-shape-label">{label}</span><span className="gc-format-shape-field">{node}</span></div>
  );
  return (
    <div className="gc-designer-root en gc-format-shape-panel" role="complementary" aria-label="Format Shape" data-shape={name}>
      <div className="gc-format-shape-title">
        <span>Format Shape</span>
        <button className="gc-format-shape-close" aria-label="Close" onClick={() => { d._formatShapePanel = null; d.invalidate(); }}>×</button>
      </div>
      <div className="gc-format-shape-tabs"><span className="gc-format-shape-tab selected">Shape Options</span><span className="gc-format-shape-tab">Text Options</span></div>
      <div className="gc-format-shape-body">
        <div className="gc-format-shape-section">Fill</div>
        {row('Fill', (
          <select value={fill.visible === false ? 'none' : 'solid'} onChange={(event) => apply({ fill: { ...fill, visible: event.target.value === 'solid' } })}>
            <option value="none">No fill</option><option value="solid">Solid fill</option>
          </select>
        ))}
        {fill.visible !== false && row('Color', <input type="color" value={/^#([0-9a-f]{6})$/i.test(String(fill.color ?? '#4472c4')) ? String(fill.color) : '#4472c4'} onChange={(event) => apply({ fill: { ...fill, color: event.target.value } })} />)}
        {row('Transparency', <input type="number" min={0} max={100} value={Number(fill.transparency ?? 0)} onChange={(event) => apply({ fill: { ...fill, transparency: Number(event.target.value) } })} />)}
        <div className="gc-format-shape-section">Line</div>
        {row('Border', (
          <select value={line.visible === false ? 'none' : 'solid'} onChange={(event) => apply({ line: { ...line, visible: event.target.value === 'solid' } })}>
            <option value="none">No line</option><option value="solid">Solid line</option>
          </select>
        ))}
        {line.visible !== false && row('Color', <input type="color" value={/^#([0-9a-f]{6})$/i.test(String(line.color ?? '#3465a4')) ? String(line.color) : '#3465a4'} onChange={(event) => apply({ line: { ...line, color: event.target.value } })} />)}
        {row('Width', <input type="number" min={0} step={0.5} value={Number(line.width ?? 2)} onChange={(event) => apply({ line: { ...line, width: Number(event.target.value) } })} />)}
        <div className="gc-format-shape-section">Size &amp; Properties</div>
        {row('Position X', <input type="number" value={Math.round(Number(shape.x()))} onChange={(event) => apply({ position: { x: Number(event.target.value) } })} />)}
        {row('Position Y', <input type="number" value={Math.round(Number(shape.y()))} onChange={(event) => apply({ position: { y: Number(event.target.value) } })} />)}
        {row('Size W', <input type="number" min={1} value={Math.round(Number(shape.width()))} onChange={(event) => apply({ position: { width: Number(event.target.value) } })} />)}
        {row('Size H', <input type="number" min={1} value={Math.round(Number(shape.height()))} onChange={(event) => apply({ position: { height: Number(event.target.value) } })} />)}
        {row('Rotation', <input type="number" min={0} max={359} value={Math.round(Number(shape.rotation?.() ?? 0))} onChange={(event) => apply({ rotation: Number(event.target.value) })} />)}
        {!shape.control?.() && !shape.isCamera?.() && !shape.isPicture?.() ? row('Text', <input type="text" value={String(shape.text?.() ?? '')} onChange={(event) => apply({ text: event.target.value })} />) : null}
      </div>
    </div>
  );
}
