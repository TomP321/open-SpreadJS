/**
 * Style-driven cell extras shared by the canvas renderer and the pointer
 * interaction, so hit-testing and painting always agree:
 *  - `cellPadding` insets (CSS shorthand string or plain number)
 *  - `watermark` text with `labelOptions` placement (cell label)
 *  - `decoration` corner folds and icons
 *  - `cellButtons` layout, painting and click hit-testing
 * Official numeric enum values and the GC.Data string aliases are both
 * accepted; everything is normalized to numbers internally.
 */
import { cachedImage } from './image-cache.js';

export interface Insets { top: number; right: number; bottom: number; left: number }
export interface CellBox { x: number; y: number; width: number; height: number }

/** Parse a CSS-style shorthand ("7", "7 6", "7 6 4 5", with optional px units). */
export function parseInsets(value: unknown): Insets | undefined {
  if (value == null || value === '') return undefined;
  const tokens = typeof value === 'number' ? [value] : String(value).trim().split(/\s+/);
  const nums = tokens.map((token) => parseFloat(String(token).replace(/px$/i, '')));
  if (!nums.length || nums.some((n) => !Number.isFinite(n))) return undefined;
  const [top = 0, right = top, bottom = top, left = right] = nums;
  return { top, right, bottom, left };
}

/** Inset a painted rect by the given padding (already-zoom-scaled in, scaled here). */
export function applyInsets(rect: CellBox, insets: Insets | undefined, zoom: number): CellBox {
  if (!insets) return rect;
  return {
    x: rect.x + insets.left * zoom,
    y: rect.y + insets.top * zoom,
    width: Math.max(0, rect.width - (insets.left + insets.right) * zoom),
    height: Math.max(0, rect.height - (insets.top + insets.bottom) * zoom),
  };
}

function enumValue<T extends Record<string, string | number>>(value: unknown, names: readonly string[], fallback: number, map: T): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value) {
    const index = names.indexOf(value);
    if (index >= 0) return Number(map[names[index]]);
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
}

const POSITIONS = ['left', 'right', 'leftOfText', 'rightOfText'] as const;
const VISIBILITIES = ['always', 'onSelected', 'onEditing'] as const;
const IMAGE_TYPES = ['none', 'custom', 'clear', 'cancel', 'ok', 'dropdown', 'ellipsis', 'left', 'right', 'plus', 'minus', 'undo', 'redo', 'search', 'separator', 'spinLeft', 'spinRight', 'collapse', 'expand'] as const;
const CAPTION_ALIGNS = ['left', 'right'] as const;
const ICON_POSITIONS = ['left', 'right', 'leftOfText', 'rightOfText', 'outsideLeft', 'outsideRight'] as const;

export interface ResolvedButton {
  index: number;
  option: Record<string, unknown>;
  /** 0 left, 1 right, 2 leftOfText, 3 rightOfText */
  position: number;
  /** ButtonImageType */
  imageType: number;
  /** ButtonVisibility */
  visibility: number;
  /** CaptionAlignment */
  captionAlign: number;
  enabled: boolean;
  useButtonStyle: boolean;
  width?: number;
  caption: string;
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  backColor?: string;
  hoverBackColor?: string;
}

/** Normalize one style.cellButtons entry into the resolved shape used for painting and hit-testing. */
export function resolveButton(option: unknown, index: number): ResolvedButton {
  const source = (option ?? {}) as Record<string, unknown>;
  const imageSize = (source.imageSize ?? {}) as Record<string, unknown>;
  return {
    index,
    option: source,
    position: enumValue(source.position, POSITIONS, 1, { left: 0, right: 1, leftOfText: 2, rightOfText: 3 }),
    imageType: enumValue(source.imageType, IMAGE_TYPES, 0, Object.fromEntries(IMAGE_TYPES.map((name, i) => [name, i]))),
    visibility: enumValue(source.visibility, VISIBILITIES, 0, { always: 0, onSelected: 1, onEditing: 2 }),
    captionAlign: enumValue(source.captionAlign, CAPTION_ALIGNS, 1, { left: 0, right: 1 }),
    enabled: source.enabled !== false,
    useButtonStyle: !!source.useButtonStyle,
    width: typeof source.width === 'number' && Number.isFinite(source.width) ? source.width : undefined,
    caption: String(source.caption ?? ''),
    imageSrc: String(source.imageSrc ?? ''),
    imageWidth: Number(imageSize.width ?? 16) || 16,
    imageHeight: Number(imageSize.height ?? 16) || 16,
    backColor: source.buttonBackColor == null || source.buttonBackColor === '' ? undefined : String(source.buttonBackColor),
    hoverBackColor: source.hoverBackColor == null || source.hoverBackColor === '' ? undefined : String(source.hoverBackColor),
  };
}

/** All resolved buttons of a style, filtered by visibility against the paint context. */
export function visibleButtons(style: Record<string, unknown>, state: { active: boolean; editing: boolean }): ResolvedButton[] {
  const list = style.cellButtons;
  if (!Array.isArray(list) || !list.length) return [];
  const result: ResolvedButton[] = [];
  list.forEach((option, index) => {
    const button = resolveButton(option, index);
    if (button.visibility === 1 && !state.active && !state.editing) return;
    if (button.visibility === 2 && !state.editing) return;
    result.push(button);
  });
  return result;
}

let measureCanvas: HTMLCanvasElement | null = null;
function measure(text: string, font: string): number {
  if (!text) return 0;
  if (typeof document === 'undefined') return text.length * 7;
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export interface ButtonRect extends CellBox { button: ResolvedButton; side: 'left' | 'right' }

/**
 * Lay out the visible buttons of a cell inside `rect` (already inset by cellPadding).
 * Left-side buttons stack from the left edge, right-side buttons from the right edge,
 * each occupying the full cell height; text flows between the two bands.
 */
export function layoutButtons(buttons: ResolvedButton[], rect: CellBox, font: string, zoom: number): ButtonRect[] {
  const laid: ButtonRect[] = [];
  let leftCursor = rect.x;
  let rightCursor = rect.x + rect.width;
  for (const button of buttons) {
    const side = button.position === 0 || button.position === 2 ? 'left' : 'right';
    const gap = 2 * zoom;
    const image = button.imageType === 0 ? 0 : button.imageType === 1 ? button.imageWidth * zoom : 16 * zoom;
    const caption = button.caption ? measure(button.caption, font) : 0;
    const auto = image && caption ? image + 4 * zoom + caption : image || caption || 16 * zoom;
    const width = (button.width ?? auto) * zoom + (button.useButtonStyle ? 4 * zoom : 0);
    if (side === 'left') {
      laid.push({ x: leftCursor, y: rect.y, width: Math.max(1, width), height: rect.height, button, side });
      leftCursor += width + gap;
    } else {
      rightCursor -= width;
      laid.push({ x: rightCursor, y: rect.y, width: Math.max(1, width), height: rect.height, button, side });
    }
  }
  return laid;
}

/** Combined left/right band widths so text can avoid the buttons. */
export function buttonBands(laid: ButtonRect[]): { left: number; right: number } {
  let left = 0, right = 0;
  for (const item of laid) {
    if (item.side === 'left') left += item.width + 2;
    else right += item.width + 2;
  }
  return { left, right };
}

/** Which button (if any) covers the point (x, y) in cell coordinates. */
export function hitButton(laid: ButtonRect[], x: number, y: number): ButtonRect | undefined {
  return laid.find((item) => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height);
}

/** Draw the vector glyph of a built-in button image type. All paths are our own. */
export function drawButtonGlyph(ctx: CanvasRenderingContext2D, imageType: number, cx: number, cy: number, zoom: number, color: string): void {
  const s = 4 * zoom; // half-size of the glyph box
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, zoom);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const arrow = (dx: number): void => {
    ctx.beginPath();
    ctx.moveTo(cx - dx * s * 0.5, cy - s * 0.8);
    ctx.lineTo(cx + dx * s * 0.6, cy);
    ctx.lineTo(cx - dx * s * 0.5, cy + s * 0.8);
    ctx.closePath();
    ctx.fill();
  };
  switch (imageType) {
    case 2: // clear: a small circle
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.9, 0, Math.PI * 2); ctx.stroke(); break;
    case 3: // cancel
      ctx.beginPath(); ctx.moveTo(cx - s * 0.7, cy - s * 0.7); ctx.lineTo(cx + s * 0.7, cy + s * 0.7);
      ctx.moveTo(cx + s * 0.7, cy - s * 0.7); ctx.lineTo(cx - s * 0.7, cy + s * 0.7); ctx.stroke(); break;
    case 4: // ok
      ctx.beginPath(); ctx.moveTo(cx - s * 0.8, cy + s * 0.1); ctx.lineTo(cx - s * 0.2, cy + s * 0.7); ctx.lineTo(cx + s * 0.9, cy - s * 0.7); ctx.stroke(); break;
    case 5: case 18: // dropdown / expand
      arrow(0); ctx.beginPath(); ctx.moveTo(cx - s * 0.8, cy - s * 0.35); ctx.lineTo(cx, cy + s * 0.55); ctx.lineTo(cx + s * 0.8, cy - s * 0.35); ctx.closePath(); ctx.fill(); break;
    case 6: // ellipsis
      for (const dx of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(cx + dx * s * 0.9, cy, Math.max(0.8, 1 * zoom), 0, Math.PI * 2); ctx.fill(); } break;
    case 7: case 15: // left / spinLeft
      ctx.beginPath(); ctx.moveTo(cx + s * 0.4, cy - s * 0.8); ctx.lineTo(cx - s * 0.6, cy); ctx.lineTo(cx + s * 0.4, cy + s * 0.8); ctx.stroke(); break;
    case 8: case 16: // right / spinRight
      ctx.beginPath(); ctx.moveTo(cx - s * 0.4, cy - s * 0.8); ctx.lineTo(cx + s * 0.6, cy); ctx.lineTo(cx - s * 0.4, cy + s * 0.8); ctx.stroke(); break;
    case 9: // plus
      ctx.beginPath(); ctx.moveTo(cx - s * 0.8, cy); ctx.lineTo(cx + s * 0.8, cy); ctx.moveTo(cx, cy - s * 0.8); ctx.lineTo(cx, cy + s * 0.8); ctx.stroke(); break;
    case 10: // minus
      ctx.beginPath(); ctx.moveTo(cx - s * 0.8, cy); ctx.lineTo(cx + s * 0.8, cy); ctx.stroke(); break;
    case 11: // undo
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.2, s * 0.8, Math.PI * 1.15, Math.PI * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.9, cy - s * 0.35); ctx.lineTo(cx - s * 1.1, cy + s * 0.15); ctx.lineTo(cx - s * 0.4, cy - s * 0.05); ctx.closePath(); ctx.fill(); break;
    case 12: // redo
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.2, s * 0.8, Math.PI * 1.9, Math.PI * 0.85, true); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.9, cy - s * 0.35); ctx.lineTo(cx + s * 1.1, cy + s * 0.15); ctx.lineTo(cx + s * 0.4, cy - s * 0.05); ctx.closePath(); ctx.fill(); break;
    case 13: // search
      ctx.beginPath(); ctx.arc(cx - s * 0.2, cy - s * 0.2, s * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.3, cy + s * 0.3); ctx.lineTo(cx + s * 0.9, cy + s * 0.9); ctx.stroke(); break;
    case 14: // separator
      ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s); ctx.stroke(); break;
    case 17: // collapse
      ctx.beginPath(); ctx.moveTo(cx - s * 0.8, cy + s * 0.35); ctx.lineTo(cx, cy - s * 0.55); ctx.lineTo(cx + s * 0.8, cy + s * 0.35); ctx.closePath(); ctx.fill(); break;
    default: break; // none / custom handled by the caller
  }
  ctx.restore();
}

/** Paint one laid-out cell button (background, border, image, caption). */
export function drawButton(ctx: CanvasRenderingContext2D, item: ButtonRect, font: string, zoom: number, hover: boolean): void {
  const button = item.button;
  const { x, y, width, height } = item;
  ctx.save();
  if (button.useButtonStyle) {
    const fill = hover && button.hoverBackColor ? button.hoverBackColor : button.backColor ?? '#f5f6f7';
    ctx.fillStyle = fill;
    const radius = 2 * zoom;
    ctx.beginPath();
    ctx.roundRect(x + zoom, y + zoom, Math.max(1, width - 2 * zoom), Math.max(1, height - 2 * zoom), radius);
    ctx.fill();
    ctx.strokeStyle = hover && button.hoverBackColor ? button.hoverBackColor : '#c8ccd0';
    ctx.lineWidth = zoom;
    ctx.stroke();
  } else if (hover) {
    ctx.fillStyle = button.hoverBackColor ?? button.backColor ?? '#e5e7ea';
    ctx.fillRect(x, y, width, height);
  } else if (button.backColor) {
    ctx.fillStyle = button.backColor;
    ctx.fillRect(x, y, width, height);
  }
  ctx.globalAlpha = button.enabled ? 1 : 0.4;
  ctx.fillStyle = '#595959';
  ctx.strokeStyle = '#595959';
  const cy = y + height / 2;
  const image = button.imageType === 0 ? 0 : button.imageType === 1 ? button.imageWidth * zoom : 16 * zoom;
  const captionWidth = button.caption ? measure(button.caption, font) : 0;
  const total = image && captionWidth ? image + 4 * zoom + captionWidth : image || captionWidth;
  let cursor = x + Math.max(2 * zoom, (width - total) / 2);
  const drawImagePart = (): void => {
    if (!image) return;
    if (button.imageType === 1 && button.imageSrc) {
      const source = cachedImage(button.imageSrc, () => undefined);
      if (source && source.complete && source.naturalWidth) ctx.drawImage(source, cursor, cy - (button.imageHeight * zoom) / 2, image, button.imageHeight * zoom);
      else drawButtonGlyph(ctx, 5, cursor + image / 2, cy, zoom, '#595959');
    } else if (button.imageType !== 1) {
      drawButtonGlyph(ctx, button.imageType, cursor + image / 2, cy, zoom, '#595959');
    }
  };
  const drawCaptionPart = (): void => {
    if (!captionWidth) return;
    ctx.font = font;
    ctx.fillStyle = '#1a1a1a';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(button.caption, cursor, cy + 1 * zoom);
  };
  if (button.captionAlign === 0) { drawCaptionPart(); cursor += captionWidth + (image ? 4 * zoom : 0); drawImagePart(); }
  else { drawImagePart(); cursor += image + (captionWidth ? 4 * zoom : 0); drawCaptionPart(); }
  ctx.restore();
}

/** Draw the watermark/cell-label text of a style inside `rect`. */
export function drawWatermark(ctx: CanvasRenderingContext2D, style: Record<string, unknown>, rect: CellBox, zoom: number, hasValue: boolean, font: string): void {
  const content = style.watermark;
  if (typeof content !== 'string' || !content) return;
  const label = (style.labelOptions ?? {}) as Record<string, unknown>;
  const visibility = enumValue(label.visibility, ['visible', 'hidden', 'auto'], 2, { visible: 0, hidden: 1, auto: 2 });
  if (visibility === 1) return;
  if (visibility === 2 && hasValue) return;
  const hasLabel = Object.keys(label).length > 0;
  const alignment = enumValue(label.alignment, ['topLeft', 'topCenter', 'topRight', 'bottomLeft', 'bottomCenter', 'bottomRight'], 0,
    { topLeft: 0, topCenter: 1, topRight: 2, bottomLeft: 3, bottomCenter: 4, bottomRight: 5 });
  const margin = parseInsets(label.margin) ?? { top: 2, right: 2, bottom: 2, left: 2 };
  let labelFont = font;
  if (hasLabel && typeof label.font === 'string' && label.font) {
    // Convert CSS-style font shorthand ("normal normal 11pt Calibri") to canvas px units.
    const size = label.font.match(/([\d.]+)pt/);
    if (size) labelFont = label.font.replace(/([\d.]+)pt/, `${Number(size[1]) * (4 / 3) * zoom}px`);
    else if (!/px|em|%/.test(label.font)) labelFont = `${14.6667 * zoom}px ${label.font.split(' ').slice(-1)[0]}`;
    else labelFont = label.font;
  }
  const color = hasLabel ? String(label.foreColor ?? '#808080') : '#808080';
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.font = labelFont;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  const textWidth = measure(content, labelFont);
  const column = alignment % 3;
  const row = alignment < 3 ? 0 : 1;
  const x = column === 0 ? rect.x + margin.left * zoom : column === 1 ? rect.x + (rect.width - textWidth) / 2 : rect.x + rect.width - textWidth - margin.right * zoom;
  const size = Number(labelFont.match(/([\d.]+)px/)?.[1] ?? 14);
  const y = row === 0 ? rect.y + margin.top * zoom : rect.y + rect.height - size - margin.bottom * zoom;
  ctx.fillText(content, x, y);
  ctx.restore();
}

/** Draw `decoration` (corner fold + icons) over a cell rect. */
export function drawDecoration(ctx: CanvasRenderingContext2D, style: Record<string, unknown>, rect: CellBox, zoom: number, onImage: () => void): void {
  const decoration = style.decoration as Record<string, unknown> | undefined;
  if (!decoration || typeof decoration !== 'object') return;
  const fold = decoration.cornerFold as Record<string, unknown> | undefined;
  if (fold) {
    const size = Number(fold.size ?? 0) * zoom;
    const position = enumValue(fold.position, ['leftTop', 'rightTop', 'leftBottom', 'rightBottom'], 1, { leftTop: 1, rightTop: 2, leftBottom: 4, rightBottom: 8 });
    if (size > 0) {
      const color = fold.color ? String(fold.color) : '#cccccc';
      const corners: [number, number, number, number, number, number, number][] = [
        [1, rect.x, rect.y, rect.x + size, rect.y, rect.x, rect.y + size],
        [2, rect.x + rect.width, rect.y, rect.x + rect.width - size, rect.y, rect.x + rect.width, rect.y + size],
        [4, rect.x, rect.y + rect.height, rect.x + size, rect.y + rect.height, rect.x, rect.y + rect.height - size],
        [8, rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - size, rect.y + rect.height, rect.x + rect.width, rect.y + rect.height - size],
      ];
      for (const [bit, ax, ay, bx, by, cx2, cy2] of corners) {
        if (!(position & bit)) continue;
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        ctx.clip();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(cx2, cy2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = Math.max(1, zoom);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  const icons = decoration.icons;
  if (Array.isArray(icons)) {
    for (const raw of icons) {
      const icon = (raw ?? {}) as Record<string, unknown>;
      const src = String(icon.src ?? '');
      if (!src) continue;
      const image = cachedImage(src, onImage);
      if (!image || !image.complete || !image.naturalWidth) continue;
      const width = Number(icon.width ?? 16) * zoom || 16 * zoom;
      const height = Number(icon.height ?? 16) * zoom || 16 * zoom;
      const position = enumValue(icon.position, ICON_POSITIONS, 1, Object.fromEntries(ICON_POSITIONS.map((name, i) => [name, i])));
      const left = position === 0 || position === 2 || position === 4;
      const outside = position === 4 || position === 5;
      const x = left ? (outside ? rect.x - width : rect.x) : rect.x + rect.width - width;
      const y = rect.y + (rect.height - height) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x - width, rect.y, rect.width + width * 2, rect.height);
      ctx.clip();
      ctx.drawImage(image, x, y, width, height);
      ctx.restore();
    }
  }
}
