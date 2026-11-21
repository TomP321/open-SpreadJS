import React from 'react';

/**
 * Hand-authored, multi-colour ribbon icon set. Every glyph is vector geometry
 * defined here (paths, shapes, stroke font outlines — never <text> nodes, so
 * no DOM text leaks into accessibility/inventory scans); no artwork is taken
 * from another product. Icons are drawn on a 32-unit grid so a 16px/24px CSS
 * box maps to exact device pixels at DPR 1/2.
 *
 * Colours follow the reference Designer's accent system measured from its
 * rendered ribbon (black-box screenshots): action blue #367fc9, light blue
 * fills #81befc/#99bee3/#bfdefd, accent orange #fa7541, yellow #ffca00,
 * green #45ba6f, red #e65249, neutrals #666/#b2b2b2/#d8d8d8.
 */
type IconProps = { className?: string; size?: number };

const P = {
  green: '#45ba6f', darkGreen: '#157631', paleGreen: '#a1dcb6',
  blue: '#367fc9', lightBlue: '#81befc', midBlue: '#99bee3', paleBlue: '#bfdefd', deepBlue: '#244d98',
  cyan: '#00b0f0', gray: '#666666', midGray: '#999999', lightGray: '#b2b2b2', paleGray: '#d8d8d8',
  faintGray: '#f2f2f2', dark: '#333333', black: '#1a1a1a', red: '#e65249', paleRed: '#ef8f89',
  orange: '#fa7541', paleOrange: '#fcb99f', yellow: '#ffca00', paleYellow: '#ffe47f',
  gold: '#d19d00', white: '#ffffff', paper: '#f7f7f7', brown: '#8c6d3f',
  purple: '#7030a0', teal: '#008272', pink: '#e83e8c',
  /** Paste-gallery inks measured from the reference dropdown (TASK 63 item 6). */
  ink: '#606060', accentBlue: '#3070c0', accentRed: '#f07030',
};

const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 1, stroke?: string) =>
  <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth={1.5} />;
const path = (d: string, fill: string, stroke?: string, sw = 1.5) =>
  <path d={d} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />;
const circle = (cx: number, cy: number, r: number, fill: string, stroke?: string, sw = 1) =>
  <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={sw} />;
const line = (d: string, stroke: string, sw = 2, cap: 'round' | 'butt' | 'square' = 'round') =>
  <path d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={cap} strokeLinejoin="round" />;
const oval = (cx: number, cy: number, rx: number, ry: number, stroke: string, sw = 2) =>
  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={stroke} strokeWidth={sw} />;
/** Thin dash marker (grid lines etc.). */
const hair = (d: string, stroke: string, sw = 1) =>
  <path d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="butt" />;

/* --- Stroke letter/number font (cap height 10..26) ----------------------- */
const GL = {
  A: 'M2 26 9 10l7 16M4.6 20.5h8.8',
  Z: 'M2 11h12L2 25h12',
  F: 'M4 26V10h11M4 17.5h8',
  f: 'M6.5 31C10 22 12 16 13 13.4 13.9 11 15.7 9.4 18.4 9.4c1.9 0 3 .9 3 2.2 0 1.9-1.9 3.3-4.4 3.3',
  x: 'M2 14l11 12M13 14 2 26',
  sigma: 'M25 8.5H8.5L17 16 8.5 23.5H25',
  s: 'M12 14c-1-1.1-2.6-1.7-4.3-1.7-2.4 0-4.2 1.4-4.2 3.3 0 3.9 8.4 2.4 8.4 7.4 0 2.3-2 3.8-4.9 3.8-2 0-3.8-.7-5-1.9',
  dollar: 'M16 5v22M22 11c-1.3-2.2-3.4-3.3-6-3.3-3.4 0-5.8 2-5.8 4.7 0 4 8.2 2.6 8.2 7.3 0 2.5-2.4 4.4-5.9 4.4-2.7 0-4.9-1.2-6.2-3.4',
  one: 'M4 16l5-6v16',
  two: 'M2.5 15.5a5.2 5 0 1 1 8.8 4.6L2.5 26.5h11',
  three: 'M2.8 15.2a5 5 0 1 1 7.6 4.3 5 5 0 1 1-7.4 5',
  nine: 'M3.5 16a5.2 5 0 1 1 10.4 0 5.2 5 0 1 1-10.4 0M13.9 13v13.5',
  qm: 'M10.5 13a5.4 5.4 0 1 1 9 4c-1.5 1.6-3.5 2.3-3.5 5.2',
  theta: 'oval',
  slash: 'M20 8 8 26',
};
const g = (d: string, stroke: string, sw = 2.4) =>
  <path d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
const dot = (cx: number, cy: number, r: number, fill: string) => <circle cx={cx} cy={cy} r={r} fill={fill} />;

/* --- Shared composite pieces --------------------------------------------- */
const doc = (tint = P.paper) => <>{rect(7, 3, 18, 26, tint, 1, P.gray)}{hair('M13 10h9M13 15h9M13 20h6', P.gray, 1.6)}</>;
/** 3x3 spreadsheet grid with header accents — the PivotTable motif. */
const pivotGrid = (edge: string, corner: string) => (
  <>
    <rect x={4} y={6} width={24} height={20} rx={1} fill={P.white} stroke={edge} strokeWidth={1.5} />
    <rect x={4} y={6} width={8} height={6} fill={edge} />
    <rect x={20} y={12} width={8} height={7} fill={corner} />
    {hair('M12 6v20M20 6v20M4 12h24M4 19h24', edge, 1.2)}
  </>
);
/** 3x3 white table with gray rules, optional filled cells given as [col,row,fill]. */
const table3 = (fills: Array<[number, number, string]> = [], stroke = P.gray, x0 = 5, y0 = 6, cell = 7.4) => (
  <>
    <rect x={x0} y={y0} width={cell * 3} height={cell * 3} fill={P.white} stroke={stroke} strokeWidth={1.5} />
    {fills.map(([c, r, f], i) => <rect key={i} x={x0 + c * cell} y={y0 + r * cell} width={cell} height={cell} fill={f} />)}
    {hair(`M${x0 + cell} ${y0}v${cell * 3}M${x0 + 2 * cell} ${y0}v${cell * 3}M${x0} ${y0 + cell}h${cell * 3}M${x0} ${y0 + 2 * cell}h${cell * 3}`, stroke, 1.1)}
  </>
);
/* Heavy blue merge grid (TASK 67 DPR4 re-measure): crisp 1px rules — full-width horizontals at
   CSS y1/5/12/16 (units 2/9/23/30... centers 3,9.5,23,29.5→ odd-unit crisp rows), center vertical
   only in the top and bottom rows; the taller middle band is the merged row. */
const mergeTable = () => (
  <>
    <rect x={1} y={3} width={28} height={28} fill={P.white} stroke={P.blue} strokeWidth={2} />
    {hair('M1 9.5h28M1 22.5h28', P.blue, 2)}
    {hair('M15 3v6.5M15 22.5V31', P.blue, 2)}
  </>
);
/** Slim solid orange double-headed arrow across the merged band (Merge & Center). */
const mergeArrow = () => (
  <path d="M4.5 16.5L9.5 13v2.4h11V13l5 3.5-5 3.5v-2.4H9.5V20Z" fill={P.orange} />
);
/* Shape Styles quick tile (TASK 55): white rounded tile, colored frame, black "Abc" drawn
   with our own stroke letters (A + b + c). Frame colors follow the trial's seven quick styles. */
const shapeStyleTile = (color: string) => (
  <>
    <rect x={2.5} y={5} width={27} height={22} rx={3} fill="#ffffff" stroke={color} strokeWidth={1.8} />
    <path d="M7 21.8l3.7-9.6 3.7 9.6M8.7 18.9h6.6M17.8 7.6v10.8M17.8 18.4a3 3 0 0 0 0-6M26.8 15c-2.8-1.8-5.9.5-5.9 2.9s3.1 4.7 5.9 2.9" fill="none" stroke="#262626" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </>
);
const chartFrame = (content: React.ReactNode) => <>{rect(3, 4, 26, 24, P.white, 1, P.gray)}{hair('M7 8v16h18', P.gray, 1)}{content}</>;
const pageFrame = (content: React.ReactNode) => <>{rect(7, 3, 18, 26, P.white, 1, P.gray)}{content}</>;
/** Small cog wheel badge (Settings family). */
const gear = (cx: number, cy: number, r: number, fill = P.blue) => (
  <g transform={`translate(${cx} ${cy})`}>
    <path d={`M0 ${-r} 1.6 ${-r + 0.4} 1.9 ${-r * 0.62} ${r * 0.62} -1.9 ${r - 0.4} -1.6 ${r} 0 ${r - 0.4} 1.6 ${r * 0.62} 1.9 1.9 ${r * 0.62} 1.6 ${r} 0 ${r - 0.4} -1.9 ${r * 0.62} ${-r * 0.62} 1.9 -1.6 ${r * 0.62} -1.9 ${r - 0.4} -1.6 ${r} 0 ${r - 0.4} -1.9 ${-r * 0.62} ${-r * 0.62} -1.9 -1.6 ${-r * 0.62} -1.9 ${-r + 0.4}Z`} fill={fill} />
    <circle r={r * 0.38} fill={P.white} />
  </g>
);
/** Diagonal paintbrush badge (Format Table / Cell Styles / Sheet Binding). */
const brush = (dx: number, dy: number, handle = P.blue) => (
  <g transform={`translate(${dx} ${dy})`}>
    {path('M15 1 23 9 12 20 4 12Z', P.paleGray, P.gray, 1)}
    {rect(9, 9, 6, 4, handle, 0)}
    {path('M4 12 12 20 6 25 1 20Z', handle)}
  </g>
);

/* --- Paste gallery clipboard (TASK 63 item 6; TASK 67 re-cut to the reference) ----------
   Re-measured at DPR4 on the live reference dropdown (24px glyph = 32 icon units, so
   reference CSS boxes are multiplied by 4/3):
   board   CSS x3..21, y2.2..21.5  -> units 4..28, 2.9..28.7 (solid #ffca00, no outline)
   clip    grey bar CSS 7..16.5 / y2..4.3, white clearance ring behind it, dark handle CSS 8.8..13.3 / y0..2
   The reference badge tiles have NO outlined sheet: the board simply shows white faces —
     middle face CSS 6..18, 5..15   -> units 8..24, 6.7..20
     lower face  CSS 6..23.5, 14.5..23.5 -> units 8..31.3, 19.3..31.3 (bleeds to the glyph box edges)
   pasteAll alone keeps a yellow interior plus a grey-outlined document sheet CSS 9.5..22, 8..23.5
   with a folded top-right corner. Badge boxes (measured): fx CSS 14..22.5 / 10..22.5;
   123 CSS 9..21.5 / 16..23.5; small % CSS 9.5..14.5 / 8.5..13; brush bristles CSS 9..16 / 18.5..23.75.
   Ink #606060, accents blue #3070c0 / red #f07030 (measured). Disabled tiles: measured faded
   board is exactly #ffca00 @50% over white, so opacity-dimming is correct — enabled art stays full strength. */
const INK = P.ink;
/** Yellow board + grey clip (TASK 67 reference geometry). */
const pasteBoard = (): React.ReactElement => (
  <>
    <rect x={4} y={2.9} width={24} height={25.8} rx={2} fill={P.yellow} />
    {rect(7.6, 1.7, 15.8, 5.2, P.white, 1.4)}
    {rect(9.3, 2.7, 12.7, 3, P.gray, 1)}
    {rect(11.5, 0, 5.8, 2.7, P.gray, 0.8)}
  </>
);
/** The reference's unbordered white board faces: middle block + lower sheet. */
const pasteFace = (): React.ReactElement => (
  <>
    {rect(8, 6.7, 16, 13.3, P.white, 0)}
    {rect(8, 19.3, 23.3, 12, P.white, 0)}
  </>
);
/** pasteAll document: grey-outlined white sheet, folded top-right corner. CSS 9.5..22 / 8..23.5. */
const pasteDocument = (): React.ReactElement => (
  <>
    <path d="M12.7 31.3V10.7h12l4.6 4.6v16z" fill={P.white} stroke={P.gray} strokeWidth={1.7} strokeLinejoin="round" />
    <path d="M24.7 10.7v4.6h4.6" fill={P.paleGray} stroke={P.gray} strokeWidth={1.3} strokeLinejoin="round" />
  </>
);
/** Serif-italic "f" (right shoulder hook, slanted stem, crossbar, bottom tail) + "x" beside it.
    Reference glyph box CSS 14..22.5 / 10..22.5 -> units 18.7..30 / 13.3..30. */
const fxGlyph = (): React.ReactElement => (
  <>
    {g('M27.4 14.6C26.2 11.8 23 12 21.5 15.2L19.4 25.6c-.5 2.2-1 3.4-2.3 4.4', INK, 2)}
    {g('M15.6 19h7.6', INK, 2)}
    {g('M23.8 20.4 28.8 26M28.8 20.4 23.8 26', INK, 2)}
  </>
);
/** Percent sign: two open circles + slash. Local box 15; tiles call it small (k~0.42). */
const percentGlyph = (x: number, y: number, k = 1, sw = 4.4): React.ReactElement => (
  <g transform={`translate(${x} ${y}) scale(${k})`}>
    {circle(3.4, 3.4, 2.9, P.white, INK, sw)}
    {circle(11.6, 11.6, 2.9, P.white, INK, sw)}
    {line('M1.2 13.8 13.8 1.2', INK, sw)}
  </g>
);
/** "123" (values): condensed stroke digits, local box 22x10. Reference (24px glyph):
    full-size 123 spans CSS 9..21.5 / 16..23.5 -> units 12..28.7 / 21.3..31.3 (k 0.85);
    the small variant in the brush composites is CSS 8..16.5 / 6..11.5 → kx 0.58 ky 0.74. */
const digits123 = (x: number, y: number, kx = 1, ky = kx): React.ReactElement => (
  <g transform={`translate(${x} ${y}) scale(${kx} ${ky})`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.8 2.6 7.4 0.2V10" />
    <path d="M10 2.4a2.7 2.5 0 1 1 5 1.3L10 10h5.3" />
    <path d="M17.7 1h4.1M18 1c2.5 0 4 1 4 2.5 0 1.3-.9 2.2-2.4 2.4 1.6.2 2.6 1.1 2.6 2.6 0 1.7-1.6 2.7-4.2 2.7" />
  </g>
);
/** Paintbrush at 45°: grey handle upper right, pale ferrule, blue bristle fan spreading
    to the lower left. Reference bristles CSS 9..16 / 18.5..23.75 -> units 12..21.3 / 24.7..31.7. */
const pasteBrush = (x: number, y: number, k = 1): React.ReactElement => (
  <g transform={`translate(${x} ${y}) scale(${k})`}>
    {line('M15.6 0.9 9 7.5', P.lightGray, 3)}
    {path('M7.4 6.4l3.1 3.1-2.2 2.2-3.1-3.1z', P.paleGray, P.midGray, 0.9)}
    {path('M1.6 9.1l5.9 3.6-3 3-2.5-1.4-1.9-2.3z', P.accentBlue)}
  </g>
);
/** Grey 3x3 table with rules — reference grid spans CSS x12..22, y12..22 with rules at
    12/17/22 CSS → units box 16..29.3, inner rules at 22.7 and 29.3. */
const noBorderGrid = (): React.ReactElement => (
  <>
    {rect(16, 16, 13.3, 13.3, P.white, 0, P.midGray)}
    {hair('M22.7 16v13.3M29.3 16v13.3M16 22.7h13.3M16 29.3h13.3', P.midGray, 1.1)}
  </>
);
/** Blue width bar with end ticks over an outer-frame-only table — "keep column widths".
    TASK 67: the reference table also carries a center rule (two columns). */
const columnWidthGlyph = (): React.ReactElement => (
  <>
    {rect(16, 20, 12.6, 9.3, P.white, 0, P.midGray)}
    {hair('M22.3 20v9.3', P.midGray, 1.1)}
    {line('M16 17.3h12.6M16 14.7v4.6M28.6 14.7v4.6', P.accentBlue, 1.5)}
  </>
);
/** Single Γ elbow with open-V heads at both free ends — transpose (reference: one horizontal
    arrow right + one vertical arrow down from a shared upper-left corner). Corner CSS (14,14),
    arms to CSS 22 (right) and 20.5 (down); head apexes CSS ~(23,14) and (14,22). */
const transposeGlyph = (): React.ReactElement => (
  <>
    {g('M29.3 18.7H18.7V27.3', P.accentBlue, 2.2)}
    {g('M15.8 25.8 19 29.4 22.2 25.8', P.accentBlue, 2.2)}
    {g('M27.6 15.5 31 18.7 27.6 21.9', P.accentBlue, 2.2)}
  </>
);
/** The reference's chain: two horizontal rounded links overlapping along a down-right
 *  diagonal — Paste Link: link 1 CSS x10..19 / y15..19, link 2 CSS x14..23.5 / y18..23.5
 *  (×4/3 units); Linked Picture shifts the whole chain left (links at CSS 0..13). */
const chainGlyph = (dx = 0): React.ReactElement => (
  <>
    <rect x={13.3 + dx} y={20} width={12} height={6.7} rx={3.35} fill="none" stroke={P.accentBlue} strokeWidth={1.9} />
    <rect x={18.7 + dx} y={24} width={12} height={6.7} rx={3.35} fill="none" stroke={P.accentBlue} strokeWidth={1.9} />
  </>
);
/** Small framed picture (blue mountains + red sun) — reference frame px x14..23, y15..23. */
const linkedPicture = (): React.ReactElement => (
  <>
    {rect(18.7, 20, 12, 10.7, P.paleBlue, 0.5, P.gray)}
    {path('M19.5 30.2l2.6-3.7 2 2.4 1.8-2.1 3.4 3.4z', P.accentBlue)}
    {dot(26.9, 23, 1.2, P.accentRed)}
  </>
);

/** 3x3 solid key squares (calculator motif): 4-unit keys on a 6-unit pitch. */
const keys3x3 = (x0: number, y0: number, step = 6, size = 4, fill = P.gray) => (
  <>
    {[0, 1, 2].flatMap((r) =>
      [0, 1, 2].map((c) => <rect key={`${r}-${c}`} x={x0 + c * step} y={y0 + r * step} width={size} height={size} fill={fill} />),
    )}
  </>
);

/* --- Data-tab outline icons (TASK 63 item 8, measured from the live reference) -----
   The trial's Outline family uses a grey 3x1 row table carrying colored value bars,
   and a "medallion" box: a grey square holding a dark diamond ring + cross arms
   reaching the box edges, with a white square hole at the center. Group adds bracket
   arms from the box to the table; Ungroup stamps a red box with an inner "/" over
   the lower half; Subtotal stacks a medallion box over a solid-diamond box with a
   white plus and puts an orange bar on the table's last row. Show/Hide Detail are a
   plus/minus at the left and 7 short grey bars at the right, every third one
   extending further left (measured ink runs). */
const outlineTable = (barColors: string[], barY = [2, 12, 22], rules = [8, 20]) => (
  <>
    <rect x={16} y={0} width={14} height={28} fill={P.white} stroke={P.gray} strokeWidth={2.2} />
    {hair(`M16 ${rules[0]}H30M16 ${rules[1]}H30`, P.gray, 1.8)}
    {barColors.map((c, i) => <rect key={i} x={20} y={barY[i]} width={6} height={2} fill={c} />)}
  </>
);
const groupArms = () => hair('M8 8V0h4M8 20v8h4', P.gray, 2.4);
const medallion = (x: number, y: number) => (
  <>
    <rect x={x} y={y} width={11} height={11} fill={P.white} stroke={P.gray} strokeWidth={2.4} />
    {line(`M${x + 5.5} ${y}V${y + 11}M${x} ${y + 5.5}H${x + 11}`, '#3d3d3d', 2.4, 'butt')}
    {path(`M${x + 5.5} ${y} ${x + 11} ${y + 5.5} ${x + 5.5} ${y + 11} ${x} ${y + 5.5}Z`, 'none', '#3d3d3d', 2.2)}
    <rect x={x + 3.9} y={y + 3.9} width={3.2} height={3.2} fill={P.white} />
  </>
);
const detailBars = (baseY: number) => (
  <>
    {[0, 1, 2, 3, 4, 5, 6].map((k) => (
      <React.Fragment key={k}>{line(`M${k % 3 ? 22 : 18} ${baseY + 4 * k}H28`, P.gray, 2, 'butt')}</React.Fragment>
    ))}
  </>
);

/* --- Borders dropdown grid (TASK 63 item 7) --------------------------------
   Measured from the live reference dropdown at DPR4 (16px icons): a grey #666666
   dashed 3x3 grid — 1px lines whose ink occupies CSS [2,15) at rows/cols 2, 8, 14,
   dash 1-on/1-off always starting on an even CSS px — with the affected edge(s)
   replaced by solid blue #367fc9 (= P.blue) lines: 1px, 2px for "thick" (ink
   [13,15)), two 1px lines at [12,13)+[14,15) for "double". "More Borders" is a
   solid 1px blue outer frame with a solid yellow #ffca00 cross inside spanning
   the box interior (ink [3,14)). Unit-32 coords = CSS px x 2: lines at u5/17/29,
   extent u4..30, dasharray "2 2", butt caps so the phase matches the reference. */
const bDash = (d: string): React.ReactElement =>
  <path d={d} fill="none" stroke={P.gray} strokeWidth={2} strokeDasharray="2 2" strokeLinecap="butt" />;
const bEdge = (d: string, w = 2): React.ReactElement =>
  <path d={d} fill="none" stroke={P.blue} strokeWidth={w} strokeLinecap="butt" />;
/** Dashed 3x3 grid minus the rows (H) / columns (V) drawn as solid edges. */
const bGrid = (omitH: number[] = [], omitV: number[] = []): React.ReactElement => (
  <>
    {[3, 15, 27].filter((c) => !omitH.includes(c)).map((c) => <React.Fragment key={`h${c}`}>{bDash(`M4 ${c}h26`)}</React.Fragment>)}
    {[5, 17, 29].filter((c) => !omitV.includes(c)).map((c) => <React.Fragment key={`v${c}`}>{bDash(`M${c} 2v26`)}</React.Fragment>)}
  </>
);

const icons: Record<string, React.ReactNode> = {
  /* --- Clipboard / history (Quick Access Toolbar) ----------------------- */
  /* TASK 67 item 2 — Undo/Redo (Home group + Quick Access Toolbar). DPR4 reference: a solid
     left head ~4×6.5 CSS px with the tip at the glyph's left edge, a 1.5 px shaft at CSS y5
     curling 180° (arc radius ~4.7) down the right edge and a ~1.5px butt tail ending at CSS
     x6.5/y14.5; ink #b1b1b1. Mirrored for Redo. */
  'gc-accessbar-undo': <>{path('M1 10 9 3.6 9 16.6Z', P.lightGray)}{g('M8 10H21.5A9.5 9.5 0 0 1 21.5 29H13', P.lightGray, 3)}</>,
  'gc-accessbar-redo': <>{path('M31 10 23 3.6 23 16.6Z', P.lightGray)}{g('M24 10H10.5A9.5 9.5 0 0 0 10.5 29H19', P.lightGray, 3)}</>,
  'ribbon-button-undo-list': g('M10 13l6 6 6-6', P.gray, 2.4),
  'ribbon-button-redo-list': g('M10 13l6 6 6-6', P.gray, 2.4),
  // Trial (TASK 51 crop home1280-dpr2): yellow clipboard board with a grey clip at the left,
  // a plain white sheet offset to the lower right; no text lines on the sheet.
  /* TASK 67 item 1 — the Paste gallery clipboard family, re-cut to the DPR4 measurements
     in the base block above: 24px glyphs, full-strength #ffca00 boards with the reference's
     unbordered white faces, dark badges sitting on the lower face. */
  'ribbon-button-paste': <>{pasteBoard()}{pasteDocument()}</>,
  'ribbon-button-paste-formula': <>{pasteBoard()}{pasteFace()}{fxGlyph()}</>,
  'ribbon-button-paste-formula-formatting': <>{pasteBoard()}{pasteFace()}{percentGlyph(12.5, 10.4, 0.45)}{fxGlyph()}</>,
  'ribbon-button-paste-formula-numberFormat': <>{pasteBoard()}{pasteFace()}{percentGlyph(12.5, 10.4, 0.45)}{fxGlyph()}</>,
  'ribbon-button-paste-source-format': <>{pasteBoard()}{pasteFace()}{hair('M10.7 11.3h11.3', P.accentBlue, 1.8)}{hair('M10.7 14.7h9.3', P.accentRed, 1.8)}{pasteBrush(11.5, 14.5, 1.18)}</>,
  'ribbon-button-paste-noBorders': <>{pasteBoard()}{pasteFace()}{noBorderGrid()}</>,
  'ribbon-button-paste-column-width': <>{pasteBoard()}{pasteFace()}{columnWidthGlyph()}</>,
  'ribbon-button-paste-transpose': <>{pasteBoard()}{pasteFace()}{transposeGlyph()}</>,
  'ribbon-button-paste-values': <>{pasteBoard()}{pasteFace()}{digits123(8.4, 21.6, 0.8)}</>,
  'ribbon-button-paste-value-formatting': <>{pasteBoard()}{pasteFace()}{percentGlyph(12.5, 10.4, 0.45)}{digits123(8.4, 21.6, 0.8)}</>,
  'ribbon-button-paste-value-numberFormat': <>{pasteBoard()}{pasteFace()}{digits123(7.9, 7.3, 0.58, 0.75)}{pasteBrush(11.5, 14.5, 1.18)}</>,
  'ribbon-button-paste-values-source-format': <>{pasteBoard()}{pasteFace()}{digits123(7.9, 7.3, 0.58, 0.75)}{pasteBrush(11.5, 14.5, 1.18)}</>,
  'ribbon-button-formatting': <>{pasteBoard()}{pasteFace()}{percentGlyph(12.5, 10.4, 0.45)}{pasteBrush(11.5, 14.5, 1.18)}</>,
  'ribbon-button-paste-link': <>{pasteBoard()}{pasteFace()}{chainGlyph()}</>,
  'ribbon-button-paste-linked-picture': <>{pasteBoard()}{pasteFace()}{chainGlyph(-13.3)}{linkedPicture()}</>,
  // Trial (TASK 67 re-cut, DPR4): wide-open scissors — dark grey #666 blades crossing near the
  // middle (tips at CSS x4/y1 and x12/y1), each blade running to the far ring, thick blue rings
  // (~4.5 px outer) centered at CSS (3.3,13) and (11.3,13).
  'ribbon-button-cut': <>{line('M8 2 22.5 21', P.gray, 4)}{line('M24 2 7.5 21', P.gray, 4)}{oval(6.5, 26.5, 3.1, 3.1, P.blue, 3.2)}{oval(22.5, 26.5, 3.1, 3.1, P.blue, 3.2)}</>,
  // Trial (TASK 67 re-cut): two documents with folded corners; the back sheet carries two small
  // blue dashes, the front sheet a short + a long blue text rule. Grey outlines #666 ~1.7 px.
  'ribbon-button-copy': <>
    <path d="M2.5 26.5V2.5H11l4 4v20z" fill={P.white} stroke={P.gray} strokeWidth={2.6} strokeLinejoin="round" />
    <path d="M11 2.5v4h4" fill={P.paleGray} stroke={P.gray} strokeWidth={1.6} strokeLinejoin="round" />
    {rect(7.6, 9.8, 2.8, 2.8, P.blue, 0)}
    {rect(7.6, 15.6, 2.8, 2.8, P.blue, 0)}
    <path d="M9.5 31V9.5H20l8 8V31z" fill={P.white} stroke={P.gray} strokeWidth={2.6} strokeLinejoin="round" />
    <path d="M20 9.5v8h8" fill={P.paleGray} stroke={P.gray} strokeWidth={1.6} strokeLinejoin="round" />
    {rect(13.5, 17.5, 5, 2.2, P.blue, 0)}
    {rect(17.5, 24.5, 10, 2.2, P.blue, 0)}
  </>,
  // Trial (TASK 67 re-cut): a big brush filling the 16px glyph — grey outlined rounded handle rod at
  // the top right, pale ferrule block at 45°, wide splayed bristles spreading into the lower-left
  // corner (measured fan corners CSS (0.5,6.5)/(7.5,15.5)/(12,11.5)). All shapes are our own paths;
  // fan inks #f8c451 fill / #ef7d11 edge / #e07b12 inner arc measured from the reference.
  'ribbon-button-formatPainter': <>
    {line('M20 12 29 3', '#5f5f5f', 4.6, 'round')}{line('M20.9 11.1 28.1 3.9', '#f6f6f6', 2.2, 'round')}
    <path d="M1 13L24.5 22 15 31.5Z" fill="#f8c451" stroke="#ef7d11" strokeWidth={2.2} strokeLinejoin="round" />
    <path d="M9.2 19.2L17.2 11.2 20.8 14.8 12.8 22.8Z" fill="#dcdcdc" stroke="#5f5f5f" strokeWidth={2} strokeLinejoin="round" />
    <path d="M4.5 18.5C9 22.5 14.5 24.8 20.5 24" fill="none" stroke="#e07b12" strokeWidth={1.5} />
  </>,
  // Trial (TASK 67 re-cut, DPR4): a large blue "A" (incfs legs CSS x1.5/11.5 at y14.5, ~1.6px stroke)
  // with a small solid grey #666 triangle at the upper right: incfs ▲ apex CSS (13.4,2.25) base y4.75,
  // decfs A smaller (legs CSS 2.5/10.5 at y13.5) and ▼ apex CSS (11.4,4.75) base y2.
  'ribbon-button-increaseFontSize': <>{g('M3 29 12.8 5 23 29M6.5 17.5H19', P.blue, 3.2)}{path('M26.8 4.5 31 9.5H22.5Z', P.gray)}</>,
  'ribbon-button-decreaseFontSize': <>{g('M5 27 12.8 8 21 27M8 19.5H17.5', P.blue, 3.2)}{path('M18.5 4H27L22.8 9.5Z', P.gray)}</>,
  'ribbon-button-bold': <path d="M8 4h10c6 0 9 3 9 7 0 3-2 5-4 6 4 1 5 3 5 6 0 4-4 6-10 6H8zm5 5v6h5c3 0 4-1 4-3s-1-3-4-3zm0 11v5h6c3 0 4-1 4-2.5S22 20 19 20z" fill={P.blue} fillRule="evenodd" />,
  'ribbon-button-italic': <>{path('M13 4h12l-1 4h-4l-6 16h4l-1 4H5l1-4h4l6-16h-4z', P.blue)}</>,
  'ribbon-button-underline': <>{line('M9 4v12a7 7 0 0 0 14 0V4', P.blue, 3)}{line('M7 27h18', P.blue, 3)}</>,
  'ribbon-button-double-underline': <>{line('M9 3v11a7 7 0 0 0 14 0V3', P.blue, 3)}{line('M7 22h18', P.blue, 2.4)}{line('M7 27h18', P.blue, 2.4)}</>,
  /* Borders dropdown (TASK 63 item 7; TASK 67 vertical re-tune): dashed-grid glyphs, solid blue
     marks the edge(s) the command applies. All rows carry the -2u render compensation (see the
     helper note); "All Border" is the trial's full blue 3x3 grid (four horizontal + vertical
     1px rules, crisp rows [2,15)). */
  'ribbon-control-dropdown-bottomborder': <>{bGrid([27])}{bEdge('M4 27h26')}</>,
  'ribbon-control-dropdown-topborder': <>{bGrid([3])}{bEdge('M4 3h26')}</>,
  'ribbon-control-dropdown-leftborder': <>{bGrid([], [5])}{bEdge('M5 2v26')}</>,
  'ribbon-control-dropdown-rightborder': <>{bGrid([], [29])}{bEdge('M29 2v26')}</>,
  'ribbon-control-dropdown-noborder': bGrid(),
  'ribbon-control-dropdown-allborder': bEdge('M4 3h26M4 15h26M4 27h26M5 2v26M17 2v26M29 2v26'),
  'ribbon-control-dropdown-outsideborder': <>{bGrid([3, 27], [5, 29])}{bEdge('M4 3h26M4 27h26M5 2v26M29 2v26')}</>,
  'ribbon-control-dropdown-thickboxborder': <>{bGrid([3, 27], [5, 29])}{bEdge('M4 4h26M4 26h26M6 2v26M28 2v26', 4)}</>,
  'ribbon-control-dropdown-bottomdoubleborder': <>{bGrid([27])}{bEdge('M4 23h26M4 27h26')}</>,
  'ribbon-control-dropdown-thickbottomborder': <>{bGrid([27])}{bEdge('M4 26h26', 4)}</>,
  'ribbon-control-dropdown-topbottomborder': <>{bGrid([3, 27])}{bEdge('M4 3h26M4 27h26')}</>,
  'ribbon-control-dropdown-topthickbottomborder': <>{bGrid([3, 27])}{bEdge('M4 3h26')}{bEdge('M4 26h26', 4)}</>,
  'ribbon-control-dropdown-topdoublebottomborder': <>{bGrid([3, 27])}{bEdge('M4 3h26M4 23h26M4 27h26')}</>,
  'ribbon-control-dropdown-moreborder': <>{bEdge('M4 3h26M4 27h26M5 2v26M29 2v26')}<path d="M17 4v22M6 15h22" fill="none" stroke={P.yellow} strokeWidth={2} strokeLinecap="butt" /></>,
  'back-color-icon': <>{path('M6 15 13 4l8 10-7 10z', P.white, P.gray, 1.8)}{path('M13 4 21 14l-4 5-8-10z', P.paleGray)}{g('M19 18c2.5 2.5 3.5 4 3.5 5.2a2 2 0 0 1-4 0C18.5 22 19 20.5 19 18Z', P.blue, 1.6)}{rect(4, 26, 24, 4, P.dark, 0)}</>,
  'fore-color-icon': <>{g(GL.A, P.gray, 2.6)}{rect(6, 26, 20, 4, P.dark, 0)}</>,
  'ribbon-button-fill': <>{path('M6 15 13 4l8 10-7 10z', P.white, P.gray, 1.8)}{path('M13 4 21 14l-4 5-8-10z', P.paleGray)}{g('M19 18c2.5 2.5 3.5 4 3.5 5.2a2 2 0 0 1-4 0C18.5 22 19 20.5 19 18Z', P.blue, 1.6)}{rect(4, 26, 24, 4, P.yellow, 0)}</>,
  /* TASK 63 item 8 — Orientation dropdown menu items (16px variants use the re-cut base glyph above). */
  'ribbon-control-dropdown-angleCounterclockwise': <>{g('M9 25V11', P.blue, 2.2)}{path('M9 5 14 11H4z', P.blue)}{g('M19 11h6M22 8l3 3-3 3', P.orange, 1.8)}{g('M19 21h6', P.orange, 1.8)}</>,
  'ribbon-control-dropdown-angleClockwise': <>{g('M23 25V11', P.blue, 2.2)}{path('M23 5l5 6h-10z', P.blue)}{g('M7 11h6M10 8 7 11l3 3', P.orange, 1.8)}{g('M7 21h6', P.orange, 1.8)}</>,
  'ribbon-control-dropdown-verticalText': <>{g('M9 26V12', P.blue, 2.2)}{g('M6 12h6M6 17h6M6 21.5h6', P.orange, 1.8)}{g('M18 6h5', P.blue, 1.8)}{path('M20.5 6 17 26h7z', P.blue, P.blue, 1)}</>,
  'ribbon-control-dropdown-rotateTextUp': <>{g('M8 26V6', P.blue, 2.2)}{path('M8 3 12 8H4z', P.orange)}{g('M17 20h7', P.blue, 2)}{path('M20.5 12 17 26h7z', P.blue)}</>,
  'ribbon-control-dropdown-rotateTextDown': <>{g('M8 6v20', P.blue, 2.2)}{path('M8 29l4-5H4z', P.orange)}{g('M17 12h7', P.blue, 2)}{path('M20.5 6 17 20h7z', P.blue)}</>,
  'ribbon-control-dropdown-formatCellAlignment': <>{rect(5, 5, 22, 22, P.white, 2, P.gray)}{hair('M9 10h14M9 15h9M9 20h12', P.blue, 1.8)}{line('M9 25h14', P.blue, 2)}</>,
  /* TASK 67 item 2 — alignment family (DPR4 re-measure): the trial uses only blue #367fc9 rules,
     1 CSS px thick. Vertical group: 3 rules 4px apart — long (CSS x1..15) / short (CSS x3..13,
     centered) / long; the 9px block anchored at the box top (topalign y0.5/4.5/8.5), middle
     (y4.5/8.5/12.5) or bottom (y7.5/11.5/15.5). Horizontal group: 6 rules 3px apart at CSS y1.5,
     4.5, 7.5, 10.5, 13.5, 16.5 (long 14px / short 10px alternating); short rules are left- (x1..11),
     center- (x3..13) or right-aligned (x5..15). Unit coords = CSS x 2. */
  'ribbon-button-topalign': hair('M2 1h28M6 9h20M2 17h28', P.blue, 2),
  'ribbon-button-middlealign': hair('M2 9h28M6 17h20M2 25h28', P.blue, 2),
  'ribbon-button-bottomalign': hair('M2 15h28M6 23h20M2 31h28', P.blue, 2),
  'ribbon-button-leftalign': hair('M2 1h28M2 7h20M2 13h28M2 19h20M2 25h28M2 31h20', P.blue, 2),
  'ribbon-button-centeralign': hair('M2 1h28M6 7h20M2 13h28M6 19h20M2 25h28M6 31h20', P.blue, 2),
  'ribbon-button-rightalign': hair('M2 1h28M10 7h20M2 13h28M10 19h20M2 25h28M10 31h20', P.blue, 2),
  // Trial (TASK 67 re-cut, DPR4): italic blue "a" lower-left + "b" upper-right with a thick orange
  // arrow from the lower-left corner to a solid triangle head in the upper-right corner
  // (a bowl CSS ~ (1.5,6.5)-(6,11.5) + stem to 6.5/11.75; b ascender CSS (4.5,1)-(6.5,4.5) + bowl
  // (7..10.75, 2..6.5); arrow shaft CSS (5.5,14.5)-(11.5,7.5), head triangle (11,4.8)-(14.8,4.8)-(14.8,8.8)).
  'ribbon-button-orientation': <>
    <ellipse cx={6.8} cy={17.6} rx={4} ry={5} fill="none" stroke={P.blue} strokeWidth={2.4} />
    {line('M13 11.5v10.5', P.blue, 2.4)}
    {line('M9.5 2.5 13 9.5', P.blue, 2.4)}
    <ellipse cx={17.4} cy={9} rx={3.6} ry={4.2} fill="none" stroke={P.blue} strokeWidth={2.4} />
    {line('M11 29 23 15.5', P.orange, 3.5, 'butt')}
    <path d="M21.5 18L29.5 10.5V18Z" fill={P.orange} />
  </>,
  /* TASK 63 item 8 — Indent bars (blue 1 px rules — full-width top/bottom, short rules on the
     right at CSS x9..15). TASK 67 re-measure: the solid orange arrow sits in the LEFT half of the
     glyph (CSS x1..8, head ~5 px tall, 1.7px shaft; increase points RIGHT at CSS x8, decrease
     points LEFT at CSS x1.5). */
  'ribbon-button-decreaseindent': <>{hair('M2 1h28M18 11h12M18 21h12M2 31h28', P.blue, 2)}{path('M2.5 18 11 13V16.2H15.5V19.8H11V23Z', P.orange)}</>,
  'ribbon-button-increaseindent': <>{hair('M2 1h28M18 11h12M18 21h12M2 31h28', P.blue, 2)}{path('M15.5 18 8 13V16.2H2.5V19.8H8V23Z', P.orange)}</>,
  // Trial (TASK 67 re-cut, DPR4): blue "ab" over "c" — round-bowl letters ~1.2px strokes (a at CSS
  // 2..7/3.5..8.5, b at 8.9..13.5/0.5..8.5, c at 2..7/10..16) + an orange elbow: short vertical
  // stub at CSS (12.5,10) into a big solid left-pointing head (apex CSS 8.5,13.3).
  'ribbon-button-wraptext': <>
    {circle(8.6, 12.4, 4.2, 'none', P.blue, 2.4)}{line('M13 7v10', P.blue, 2.4)}
    {line('M17.8 1v16', P.blue, 2.4)}{circle(22.4, 12.6, 4.2, 'none', P.blue, 2.4)}
    <path d="M12.4 22.4A4.4 4.4 0 1 0 12.4 29" fill="none" stroke={P.blue} strokeWidth={2.4} />
    <path d="M25.5 22.5L17.5 26.5 25.5 30.5Z" fill={P.orange} />
    {line('M25.5 20.5v1.8', P.orange, 2.6, 'butt')}
  </>,
  // Trial: blue-framed table (first header cell and one body cell filled) with an orange two-headed arrow.
  // Trial (TASK 55): blue grids for the Merge family; TASK 67 DPR4 re-measure: the merge glyphs are a
  // crisp 1px blue 3-row grid — full rules at CSS y1/5/12/16 (the middle row is double-height) with the
  // center vertical drawn only in the top and bottom rows (the middle row is the merged band) — and a
  // slim solid orange double-headed arrow across the middle band.
  'ribbon-button-mergecenter': <>{mergeTable()}{mergeArrow()}</>,
  'ribbon-control-dropdown-mergecenter': <>{mergeTable()}{mergeArrow()}</>,
  'ribbon-control-dropdown-mergeacross': <>{mergeTable()}{path('M25.5 16.5L18.5 12.5V14.8H5V18.2H18.5V20.5Z', P.orange)}</>,
  'ribbon-control-dropdown-mergecells': <>{mergeTable()}{path('M3 11h26v12H3z', 'none', P.orange, 2.4)}</>,
  'ribbon-control-dropdown-unmergecells': <>{mergeTable()}{path('M3 11h26v12H3z', 'none', P.orange, 2.4)}{hair('M10 11.5V22.5M20 11.5V22.5', P.orange, 2)}</>,
  /* Number group (TASK 67 item 2, DPR4 re-measure): percent — big hollow blue % filling the box
     (slash CSS ~3..13 diagonal, hollow circles ~5px outer); comma — one solid blue comma: a round
     head (CSS blob x6..13.5 y2..8.5) with a tail curving down-left to a tip at CSS (5,15.5);
     decimals — two stacked rows of blue hollow digits with an orange arrow: increase = top row
     "arrow .0" (arrow CSS 2..8.5 y4, dot+0 at CSS 9..15 y2..7.5), bottom row ".00" (CSS 2..15
     y10..15.5); decrease = mirrored rows. Strokes ~1.4px, blue #367fc9, orange #fa7541. */
  'ribbon-button-percentstyle': <>
    {line('M6.5 26.5 25.5 5.5', P.blue, 3, 'butt')}
    {circle(10.5, 11.5, 4.2, 'none', P.blue, 3)}
    {circle(21.5, 21, 4.2, 'none', P.blue, 3)}
  </>,
  'ribbon-button-commastyle': <path d="M17.8 4.2C22.6 4.2 25.8 7 26.2 10.6 26.5 14 24.7 16.2 22.1 16.8 21.2 19.4 19.6 21.2 17.2 22.8L14 29.4H11.6L13.8 22.8C11.8 21 10.8 18.6 11.2 15.6 11.8 9.8 13.8 4.2 17.8 4.2Z" fill={P.blue} />,
  'ribbon-button-increasedecimal': <>
    <path d="M4.5 8.5L12 4v2.8h5.5v3.4H12V13Z" fill={P.orange} />
    {rect(18, 12, 3.6, 3.4, P.blue, 0)}
    <ellipse cx={26} cy={9.8} rx={3.2} ry={4.2} fill="none" stroke={P.blue} strokeWidth={2.4} />
    {rect(5, 27.5, 3.6, 3.4, P.blue, 0)}
    <ellipse cx={15.5} cy={25} rx={3.2} ry={4.2} fill="none" stroke={P.blue} strokeWidth={2.4} />
    <ellipse cx={25.5} cy={25} rx={3.2} ry={4.2} fill="none" stroke={P.blue} strokeWidth={2.4} />
  </>,
  'ribbon-button-decreasedecimal': <>
    {rect(5, 11.5, 3.6, 3.4, P.blue, 0)}
    <ellipse cx={15.5} cy={9} rx={3.2} ry={4.2} fill="none" stroke={P.blue} strokeWidth={2.4} />
    <ellipse cx={25.5} cy={9} rx={3.2} ry={4.2} fill="none" stroke={P.blue} strokeWidth={2.4} />
    <path d="M17.5 24.5L12 20v2.6H4v3.6h8V29Z" fill={P.orange} />
    {rect(19, 27.5, 3.6, 3.4, P.blue, 0)}
    <ellipse cx={26.5} cy={25} rx={3.2} ry={4.2} fill="none" stroke={P.blue} strokeWidth={2.4} />
  </>,
  'ribbon-button-conditionalformat': <>{table3([[0, 0, P.paleYellow], [1, 1, P.lightBlue]], P.gray, 4, 4, 8.7)}{path('M18 19l4 8h-8z', P.red)}{rect(20, 20, 10, 10, P.white, 1.5, P.gray)}{g('M22.5 27l5-5', P.dark, 1.4)}{hair('M23 23c1-1 2.4-1 3.4 0M24.6 27c1-1 2.4-1 3.4 0', P.dark, 1.2)}</>,
  'ribbon-button-formattable': <>{table3([[0, 0, P.midBlue], [0, 1, P.paleBlue], [0, 2, P.paleBlue], [2, 1, P.paleBlue], [2, 2, P.paleBlue]], P.blue, 4, 5, 7.6)}{brush(16, 15, P.blue)}</>,
  'ribbon-button-cellstyles': <>{table3([[0, 0, P.lightBlue], [1, 0, P.paleBlue], [0, 1, P.paleBlue]], P.blue, 4, 5, 7.6)}{brush(16, 15, P.blue)}</>,
  'ribbon-button-namedcelltemplates': <>{rect(4, 4, 20, 24, P.white, 1, P.gray)}{rect(7, 8, 14, 4, P.lightBlue, 0)}{hair('M7 16h10M7 20h8M7 24h6', P.gray, 1.4)}{rect(18, 18, 12, 12, P.white, 1.5, P.blue)}{g('M21 24l3 3 5-6', P.blue, 2)}</>,
  'ribbon-button-celltype': <>{rect(4, 6, 24, 17, P.midBlue, 1.5, P.gray)}{rect(7, 9, 18, 11, P.white, 0.5)}{gear(24, 25, 6, P.midGray)}</>,
  'ribbon-button-celltype-large': <>{rect(4, 6, 24, 17, P.midBlue, 1.5, P.gray)}{rect(7, 9, 18, 11, P.white, 0.5)}{gear(24, 25, 6, P.midGray)}</>,
  // Cell Editors menu rows (TASK 55): blue monitor with a gear (Cell Type) or a dropdown list (Cell Dropdowns).
  'ribbon-button-celldropdowns': <>{rect(4, 6, 24, 17, P.midBlue, 1.5, P.gray)}{rect(7, 9, 12, 3, P.white, 0.5)}{rect(7, 14, 12, 3, P.white, 0.5)}{g('M20 10.5l4 4 4-4', P.deepBlue, 2.2)}{g('M21.5 27h5', P.midBlue, 2.4)}</>,
  'ribbon-button-insert': <>{rect(6, 4, 20, 7, P.white, 0.5, P.gray)}{hair('M13 4v7M20 4v7', P.lightGray, 1)}{path('M8 13h16v6a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z', P.blue)}{dot(5, 13.5, 1.7, P.orange)}{rect(6, 23, 20, 6, P.white, 0.5, P.gray)}{hair('M13 23v6M20 23v6', P.lightGray, 1)}</>,
  'ribbon-button-delete': <>{rect(6, 4, 20, 7, P.white, 0.5, P.gray)}{hair('M13 4v7M20 4v7', P.lightGray, 1)}{rect(6, 13, 12, 6, P.white, 0.5, P.gray)}{rect(18, 13, 8, 6, P.lightBlue, 0.5, P.blue)}{g('M21 22l9 9M30 22l-9 9', P.orange, 2.4)}{rect(6, 23, 20, 6, P.white, 0.5, P.gray)}{hair('M13 23v6M20 23v6', P.lightGray, 1)}</>,
  'ribbon-button-format': <>{rect(4, 6, 24, 21, P.white, 1, P.gray)}{rect(4, 6, 24, 5, P.midBlue)}{hair('M4 16h24M12 11v16M20 11v16', P.lightGray, 1.2)}{rect(12, 16, 8, 5, P.lightBlue, 0)}{g('M8 8h2M10 30l4-20', P.orange, 2)}</>,
  'ribbon-button-formatting-cell': <>{rect(4, 6, 24, 21, P.white, 1, P.gray)}{rect(4, 6, 24, 5, P.midBlue)}{hair('M4 16h24M12 11v16M20 11v16', P.lightGray, 1.2)}{rect(12, 16, 8, 5, P.lightBlue, 0)}</>,
  'ribbon-thumbnail-editing': <>{rect(5, 4, 22, 6, P.dark, 1)}{path('M13 10h6v9h5l-8 8-8-8h5z', P.orange)}</>,
  /* Sum (TASK 55 pair check): solid blue block with a bold white sigma (own geometry). */
  /* TASK 63 item 8 — AutoSum: the trial draws a bare blue Sigma (serifs at the bar ends,
     the vertex mid-height), ~3.5 px thick, filling the 24 px button. */
  'ribbon-button-autosum': <><path d="M25.5 11.5V6.5H8l9 9.5-9 9.5h17.5v-5" fill="none" stroke={P.blue} strokeWidth={4.5} strokeLinecap="butt" strokeLinejoin="miter" /></>,
  /* Editing group "Fill": white cell box with grey border, bold red down arrow whose tip
     touches a heavy dark baseline (own geometry, TASK 55 pair check). */
  'ribbon-button-edit-fill': <>{rect(6, 4, 20, 18, P.white, 2, P.gray)}{path('M14 7h5v8h4l-6.5 8L10 15h4z', '#e2593f')}{line('M8 26h16', P.dark, 2.6, 'butt')}</>,
  /* Editing group "Clear": fat two-tone salmon eraser tilted -42°, lighter worn tip at the
     upper-left end (own geometry, TASK 55 pair check). */
  'ribbon-button-edit-clear': <g transform="rotate(-42 16 16)">{rect(5, 10, 22, 12, '#f2a09a', 2)}{rect(5, 10, 7.5, 12, '#fbcdc9', 2)}<line x1={12.5} y1={10} x2={12.5} y2={22} stroke="#e58a80" strokeWidth={1.4} /></g>,
  /* "Sort & Filter": blue A over gold Z on the left, solid blue funnel on the right. */
  'ribbon-button-sortfilter': <><g transform="translate(1 1) scale(0.68)">{g(GL.A, P.blue, 3.2)}</g><g transform="translate(1 13.5) scale(0.68)">{g(GL.Z, P.gold, 3.2)}</g>{path('M18 5h12l-5.5 8v4l-4.5 4.5v-8.5z', P.blue)}</>,
  /* "Find": plain light-blue outlined magnifier, no fill (TASK 55 pair check). */
  'ribbon-button-find': <>{circle(13, 13, 7.5, 'none', '#4a90d9', 2.4)}{line('M18.6 18.6 26 26', '#4a90d9', 3)}</>,
  'ribbon-button-more': <>{dot(6, 16, 2.2, P.gray)}{dot(16, 16, 2.2, P.gray)}{dot(26, 16, 2.2, P.gray)}</>,
  'file-menu-new': <>{rect(7, 3, 18, 26, P.white, 1, P.green)}{path('M12 3h8l5 5v6', P.paleGreen, P.green)}{line('M21 16v12M15 22h12', P.green, 2.5)}</>,
  'file-menu-open': <>{path('M4 8h10l3 4h11v14H4z', P.paleYellow, P.gold)}{path('M4 12h24l-4 14H8z', P.paleOrange, P.orange)}</>,
  'file-menu-save': <>{rect(4, 4, 24, 24, P.blue, 1)}{rect(9, 5, 14, 9, P.white, 1)}{rect(8, 17, 16, 10, P.paleBlue, 1)}{rect(15, 6, 3, 5, P.blue)}</>,
  'file-menu-import': <>{doc()}{line('M16 13v12M11 20l5 5 5-5', P.blue, 2.4)}</>,
  'file-menu-export': <>{doc()}{line('M16 25V13M11 18l5-5 5 5', P.green, 2.4)}</>,
  'file-menu-print': <>{rect(8, 4, 16, 7, P.white, 1, P.gray)}{rect(4, 10, 24, 12, P.blue, 1)}{rect(9, 18, 14, 10, P.white, 1, P.gray)}{hair('M9 23h14M9 26h9', P.gray, 1.2)}</>,
  'file-menu-info': <>{circle(16, 16, 12, P.paleBlue, P.blue, 1.6)}{line('M16 14v10M16 9v2', P.blue, 3)}</>,
  'file-menu-back': <>{line('M28 16H6M14 7l-8 9 8 9', '#1a1a1a', 2.4)}</>,
  'ribbon-thumbnail-undo': <>{g('M21 9.5H14a7 7 0 0 0 0 14h11.5', P.gray, 2.8)}{path('M17.5 4.5 11.5 9.5l6 5.2', P.gray)}</>,
  'ribbon-thumbnail-redo': <>{g('M11 9.5h7a7 7 0 0 1 0 14H6.5', P.gray, 2.8)}{path('M14.5 4.5l6 5-6 5.2', P.gray)}</>,
  'ribbon-thumbnail-clipboard': <>{rect(7, 5, 18, 24, P.yellow, 2, P.gold)}{rect(11, 2, 10, 5, P.paleGray, 1, P.gray)}{rect(10, 9, 12, 16, P.white, 0.5, P.lightGray)}</>,
  'ribbon-thumbnail-fonts': <path d="M9 6h9c5 0 8 2 8 6 0 2-1 4-4 5 3 1 5 2 5 5 0 4-4 6-9 6H9zm4 4v5h5c2 0 3-1 3-2.5S20 10 18 10zm0 9v5h5c3 0 4-1 4-2.5S21 19 18 19z" fill={P.blue} fillRule="evenodd" />,
  'ribbon-thumbnail-alignment': <>{hair('M7 7h18M11 13h14M7 19h18M11 25h14', P.blue, 2)}</>,
  'ribbon-thumbnail-numbers': <>{line('M8 25 24 7', P.blue, 2)}{oval(9, 9, 4, 4.6, P.blue, 1.8)}{oval(23, 23, 4, 4.6, P.blue, 1.8)}</>,
  // Trial: blue 3x3 grid (one cell filled) crossed by a grey paint pen from lower-left to upper-right.
  'ribbon-thumbnail-styles': <>{rect(5, 5, 22, 22, P.white, 1, P.blue)}{hair('M5 12.3h22M5 19.6h22M12.3 5v22M19.6 5v22', P.blue, 1.3)}{rect(12.6, 12.6, 6.7, 6.7, P.midBlue)}{g('M10 24.5 24 10.5', P.lightGray, 4)}{g('M10 24.5 24 10.5', P.gray, 1)}{g('M24 10.5 27.5 7', P.gray, 3)}{path('M6.5 28.5l4-1.2 1.2-4z', P.blue)}</>,
  'ribbon-thumbnail-cells': <>{rect(4, 4, 24, 24, P.white, 2, P.blue)}{hair('M4 12h24M4 20h24M12 4v24M20 4v24', P.blue, 1.4)}{rect(12, 12, 8, 8, P.paleBlue)}</>,
  'ribbon-thumbnail-table': <>{rect(4, 5, 24, 22, P.white, 1, P.blue)}{rect(4, 5, 24, 6, P.blue)}{hair('M4 17h24M12 11v16M21 11v16', P.blue, 1.4)}</>,
  'ribbon-thumbnail-chart': <>{rect(3, 4, 26, 24, P.white, 1, P.gray)}{rect(7, 18, 4, 7, P.blue)}{rect(13, 13, 4, 12, P.yellow)}{rect(19, 8, 4, 17, P.red)}{hair('M4 26h24', P.gray, 1.5)}</>,
  'ribbon-button-picture-big': <>{rect(4, 6, 24, 20, P.white, 1, P.gray)}{path('M6 23l6-9 5 5.5 4-4.5 7 8z', P.lightBlue)}{dot(21, 11, 3, P.orange)}</>,
  'ribbon-button-picture': <>{rect(4, 6, 24, 20, P.white, 1, P.gray)}{path('M6 23l6-9 5 5.5 4-4.5 7 8z', P.lightBlue)}{dot(21, 11, 3, P.orange)}</>,
  'ribbon-button-picture-in-cell': <>{rect(4, 6, 24, 20, P.white, 1, P.blue)}{rect(9, 11, 14, 10, P.paleBlue)}{dot(12, 14, 2, P.orange)}</>,
  'ribbon-insert-sparkline-gallery': <>{rect(3, 5, 26, 22, P.white, 1, P.gray)}{line('M6 22l5-9 5 6 4-10 6 6', P.blue, 2)}{dot(11, 13, 2, P.orange)}{dot(20, 9, 2, P.green)}</>,
  'ribbon-button-table': <>{rect(4, 5, 24, 22, P.white, 1, P.blue)}{rect(4, 5, 24, 6, P.blue)}{hair('M4 17h24M12 11v16M21 11v16', P.blue, 1.4)}</>,
  /* PivotTable glyphs. Class names follow the trial's customization
   * contract (users reference them); every drawing here is our own SVG. */
  'ribbon-button-insert-pivot-table': <>{rect(5, 5, 22, 22, P.white, 2, P.gray)}{rect(8, 8, 6, 16, P.midBlue)}{rect(16, 8, 8, 5, P.paleGray)}{g('M22 27l-4-4M18 27l4-4', P.blue, 2.2)}</>,
  'ribbon-button-pivot-table-from-data-table': <>{rect(4, 8, 17, 17, P.white, 1, P.blue)}{rect(4, 8, 17, 5, P.blue)}{hair('M9 13v12M14 13v12', P.blue, 1.2)}{line('M22 20h6', P.green, 1.8)}{path('M25 17l3 3-3 3', 'none', P.green, 1.8)}</>,
  'ribbon-button-pivot-table-analyze-options': <>{pivotGrid(P.blue, P.lightBlue)}{gear(26, 26, 5.4, P.midGray)}</>,
  'ribbon-button-pivot-table-field-setting': <>{rect(6, 6, 17, 20, P.white, 1, P.deepBlue)}{hair('M6 12h17M6 18h17M12 6v20', P.deepBlue, 1.2)}{gear(24, 24, 6, P.blue)}</>,
  'ribbon-button-pivot-table-expand-field': <>{g('M7 10h10M10 17h9M13 24h8', P.gray, 2)}{g('M7 17h2.5M7 24h2.5', P.gray, 2)}{g('M23 10v14M16 17h14', P.green, 2.6)}</>,
  'ribbon-button-pivot-table-collapse-field': <>{g('M7 10h10M10 17h9M13 24h8', P.gray, 2)}{g('M7 17h2.5M7 24h2.5', P.gray, 2)}{g('M16 17h14', P.red, 2.6)}</>,
  'ribbon-button-pivot-table-filter-connections': <>{rect(5, 6, 18, 15, P.white, 1, P.gray)}{hair('M11 6v15M5 13h18', P.gray, 1.2)}{rect(5, 6, 6, 7, P.paleBlue)}{gear(24, 24, 6, P.blue)}</>,
  'ribbon-button-pivot-table-group-selection': <>{rect(5, 9, 14, 14, P.white, 1, P.gray)}{hair('M12 9v14', P.lightGray, 1.2)}{g('M21 16h8M25.5 11.5 29 16l-3.5 4.5', P.blue, 2)}</>,
  'ribbon-button-pivot-table-ungroup': <>{rect(7, 8, 8, 16, P.white, 1, P.gray)}{rect(17, 8, 8, 16, P.white, 1, P.gray)}{g('M16 4v24', P.lightGray, 1.4)}{g('M20 13l-8 6M20 19l-8-6', P.red, 2)}</>,
  'ribbon-button-pivot-table-group-field': <>{rect(7, 7, 18, 21, P.white, 1.5, P.gray)}{rect(7, 7, 18, 5, P.white)}{hair('M7 12h18', P.gray, 1.4)}{g('M12 4v6M20 4v6', P.gray, 1.6)}{dot(12, 4.5, 1.4, P.orange)}{dot(20, 4.5, 1.4, P.orange)}<g transform="translate(10.5 14) scale(0.75)">{g(GL.two, P.dark, 4)}</g></>,
  'ribbon-button-pivot-table-refresh': <>{doc(P.white)}{g('M20 12a7.5 7.5 0 1 0 4 2.5', P.green, 2.4)}{path('M24 6.5l1 6.5-6.5-1', 'none', P.green, 2.4)}</>,
  'ribbon-button-pivot-table-changeDataSource': <>{rect(5, 5, 14, 22, P.white, 1, P.gray)}{path('M12 5l7 7h-7z', P.paleGray, P.gray, 1)}{rect(15, 15, 13, 13, P.white, 1, P.blue)}{rect(15, 15, 13, 4, P.blue)}{hair('M19.3 19v9M23.6 19v9', P.blue, 1)}</>,
  'ribbon-button-pivot-table-clear': <>{rect(6, 6, 17, 17, P.white, 1, P.gray)}{hair('M9 12h11M9 17h11M9 21h11', P.lightGray, 1.5)}{circle(23, 22, 6, P.white, P.red, 1.7)}{g('M20.7 19.7l4.6 4.6M25.3 19.7l-4.6 4.6', P.red, 1.7)}</>,
  'ribbon-button-pivot-table-clear-all': <>{rect(5, 6, 17, 17, P.white, 1, P.red)}{hair('M8 12h11M8 17h11M8 21h11', P.lightGray, 1.4)}{g('M21 10l7 7M28 10l-7 7', P.red, 2)}</>,
  'ribbon-button-pivot-table-move': <>{rect(6, 6, 13, 11, P.paleBlue, 1, P.blue)}{hair('M9 9h7M9 12h7', P.blue, 1.1)}{line('M13 20v6', P.green, 1.8)}{path('M10 23l3 4 3-4z', P.green)}</>,
  'ribbon-button-pivot-table-fields-items-sets': <>{rect(5, 7, 19, 15, P.white, 1, P.blue)}{hair('M5 12h19M12 7v15M19 7v15', P.blue, 1.2)}{rect(17, 17, 11, 10, P.paleBlue, 1, P.blue)}{hair('M20 21h5M20 24h5', P.blue, 1.4)}</>,
  'ribbon-button-pivot-table-field-list': <>{rect(4, 6, 17, 20, P.white, 1, P.deepBlue)}{hair('M4 12h17', P.deepBlue, 1.2)}{hair('M7 16h9M7 20h9M7 24h9', P.gray, 1.2)}{rect(18, 6, 10, 20, P.paleGray, 1, P.gray)}</>,
  'ribbon-button-pivot-table-drill-button': <>{rect(5, 8, 15, 16, P.white, 1, P.gray)}{hair('M5 14h15', P.lightGray, 1.2)}{rect(20, 10, 8, 8, P.white, 1, P.green)}{line('M24 12v4M22 14h4', P.green, 1.4)}{line('M20 22h8', P.green, 1.4)}</>,
  'ribbon-button-pivot-table-field-headers': <>{rect(5, 6, 22, 20, P.white, 1, P.blue)}{rect(5, 6, 22, 5, P.blue)}{rect(5, 6, 6, 20, P.paleBlue)}{hair('M11 11v15M5 16h22M5 21h22', P.blue, 1)}</>,
  'ribbon-button-pivot-table-subtotal': <>{rect(7, 4, 18, 24, P.white, 1, P.gray)}{hair('M11 10h10M11 15h10M11 25h10', P.blue, 1.6)}{hair('M11 20h6M11 30h6', P.lightGray, 1.6)}</>,
  'ribbon-button-pivot-table-grand-total': <>{rect(7, 4, 18, 24, P.white, 1, P.gray)}{hair('M11 10h10M11 15h10M11 25h10', P.blue, 1.6)}{line('M11 20h10', P.dark, 1.8)}</>,
  'ribbon-button-pivot-table-report-layout': <>{rect(7, 4, 18, 24, P.white, 1, P.gray)}{hair('M11 10h10M14 15h8M14 20h8M17 25h5', P.blue, 1.6)}</>,
  'ribbon-button-pivot-table-blank-rows': <>{rect(7, 4, 18, 24, P.white, 1, P.gray)}{rect(11, 8, 10, 4, P.blue)}{hair('M11 18h10M11 23h10M11 28h10', P.blue, 1.6)}</>,
  'ribbon-button-pivot-table-not-subtotal': <>{rect(6, 6, 20, 20, P.white, 1, P.gray)}{hair('M16 6v20M6 16h20', P.lightGray, 1.2)}{g('M8 8l16 16', P.red, 1.8)}</>,
  'ribbon-button-pivot-table-subtotal-bottom': <>{rect(6, 6, 20, 20, P.white, 1, P.blue)}{rect(6, 20, 20, 6, P.paleBlue)}{hair('M6 14h20M16 6v20', P.blue, 1)}</>,
  'ribbon-button-pivot-table-subtotal-top': <>{rect(6, 6, 20, 20, P.white, 1, P.blue)}{rect(6, 6, 20, 6, P.paleBlue)}{hair('M6 14h20M16 6v20', P.blue, 1)}</>,
  'ribbon-button-pivot-table-off-row-col': <>{rect(6, 6, 20, 20, P.white, 1, P.gray)}{hair('M6 20h20M20 6v20', P.lightGray, 1.4)}{g('M8 8l16 16', P.red, 1.6)}</>,
  'ribbon-button-pivot-table-on-row-col': <>{rect(6, 6, 20, 20, P.white, 1, P.blue)}{hair('M6 20h20M20 6v20', P.deepBlue, 2)}</>,
  'ribbon-button-pivot-table-on-row': <>{rect(6, 6, 20, 20, P.white, 1, P.blue)}{line('M6 20h20', P.deepBlue, 2)}</>,
  'ribbon-button-pivot-table-on-col': <>{rect(6, 6, 20, 20, P.white, 1, P.blue)}{line('M20 6v20', P.deepBlue, 2)}</>,
  'ribbon-button-pivot-table-show-compact': <>{rect(5, 7, 22, 18, P.white, 1, P.blue)}{line('M5 13h22', P.blue, 1.2)}{hair('M9 17h10M12 21h10', P.gray, 1.2)}</>,
  'ribbon-button-pivot-table-show-outline': <>{rect(5, 7, 22, 18, P.white, 1, P.blue)}{line('M5 13h22', P.blue, 1.2)}{hair('M9 17h13M15 21h13', P.gray, 1.2)}</>,
  'ribbon-button-pivot-table-show-tabular': <>{rect(5, 7, 22, 18, P.white, 1, P.blue)}{hair('M5 13h22M15 13v12', P.blue, 1.2)}{hair('M8 17h4M18 17h5', P.gray, 1.2)}</>,
  'ribbon-button-pivot-table-repeat-all': <>{rect(5, 7, 22, 18, P.white, 1, P.blue)}{line('M5 13h22', P.blue, 1.2)}{hair('M9 17h4M9 21h4', P.gray, 1.2)}{g('M22 16l3 3-3 3', P.green, 1.4)}</>,
  'ribbon-button-pivot-table-not-repeat': <>{rect(5, 7, 22, 18, P.white, 1, P.blue)}{line('M5 13h22', P.blue, 1.2)}{hair('M9 17h4M9 21h4', P.gray, 1.2)}{g('M27 24l-5-5', P.red, 1.8)}</>,
  'ribbon-button-pivot-table-insert-blank-rows': <>{rect(5, 7, 20, 16, P.white, 1, P.blue)}{hair('M5 12h20M5 18h20', P.lightGray, 1.2)}{line('M25 20v7M21.5 23.5h7', P.green, 1.6)}</>,
  'ribbon-button-pivot-table-remove-blank-rows': <>{rect(5, 7, 20, 16, P.white, 1, P.blue)}{hair('M5 12h20M5 18h20', P.lightGray, 1.2)}{line('M21.5 23.5h7', P.red, 1.6)}</>,
  'ribbon-button-new-pivot-table-style': <>{rect(5, 6, 18, 18, P.white, 1, P.blue)}{rect(5, 6, 18, 4, P.blue)}{hair('M5 15h18M14 10v14', P.blue, 1)}{rect(18, 18, 10, 10, P.white, 1, P.green)}{line('M23 20.5v5M20.5 23h5', P.green, 1.5)}</>,
  /* TASK 65: Format Table gallery footer — a small blue table plus a star (own drawing). */
  'ribbon-button-new-table-style-element': <>{rect(3, 5, 16, 14, P.white, 1, P.blue)}{rect(3, 5, 16, 4, P.blue)}{hair('M3 13h16M11 9v10', P.blue, 1)}<path d="M22 10.5l1.7 3.4 3.8.5-2.8 2.6.7 3.7-3.4-1.8-3.4 1.8.7-3.7-2.8-2.6 3.8-.5z" fill={P.orange} stroke={P.orange} strokeWidth="0.5" /></>,
  'ribbon-button-clear-pivot-table-style': <>{rect(5, 6, 18, 18, P.white, 1, P.gray)}{rect(5, 6, 18, 4, P.lightGray)}{hair('M5 15h18M14 10v14', P.lightGray, 1)}{circle(23, 22, 6, P.white, P.red, 1.6)}{g('M20.7 19.7l4.6 4.6M25.3 19.7l-4.6 4.6', P.red, 1.6)}</>,
  'ribbon-thumbnail-pivot-table': <>{pivotGrid(P.blue, P.lightBlue)}</>,
  'ribbon-thumbnail-pivot-table-active-field': <>{rect(6, 8, 20, 16, P.white, 1, P.blue)}{hair('M6 14h20M14 8v16', P.blue, 1.2)}</>,
  'ribbon-thumbnail-pivot-table-group': <>{rect(5, 8, 8, 14, P.paleBlue, 1, P.blue)}{rect(14, 8, 8, 14, P.paleBlue, 1, P.blue)}{rect(23, 8, 5, 14, P.white, 1, P.gray)}</>,
  'ribbon-thumbnail-pivot-table-data': <>{rect(8, 4, 16, 24, P.white, 1, P.blue)}{hair('M8 11h16M8 18h16M16 4v24', P.blue, 1.2)}</>,
  'ribbon-thumbnail-pivot-table-actions': <>{rect(6, 6, 16, 16, P.white, 1, P.gray)}{circle(22, 20, 7, P.white, P.red, 1.8)}{g('M19.5 17.5l5 5M24.5 17.5l-5 5', P.red, 1.8)}</>,
  'ribbon-thumbnail-pivot-table-calculations': <>{rect(7, 5, 18, 22, P.white, 1, P.blue)}{line('M11 11h10M16 6v10M11 22h10', P.blue, 1.8)}</>,
  'ribbon-thumbnail-pivot-table-show': <>{rect(5, 7, 22, 18, P.white, 1, P.blue)}{hair('M5 13h22M13 13v12', P.blue, 1.2)}</>,
  'ribbon-thumbnail-pivot-table-layout': <>{rect(5, 7, 22, 18, P.white, 1, P.blue)}{hair('M5 13h22M13 13v12', P.blue, 1.2)}</>,
  'ribbon-thumbnail-pivot-table-options': <>{rect(5, 6, 22, 20, P.white, 1, P.gray)}{rect(5, 6, 22, 5, P.deepBlue)}{rect(5, 11, 7, 15, P.paleBlue)}{hair('M12 13.5h15M12 18.5h15M12 23.5h15', P.gray, 1.2)}</>,
  'ribbon-thumbnail-pivot-table-styles': <>{rect(5, 6, 22, 20, P.white, 1, P.gray)}{rect(5, 6, 22, 5, P.deepBlue)}{rect(5, 11, 7, 5, P.blue)}{hair('M12 13.5h15M12 18.5h15M12 23.5h15', P.gray, 1.2)}</>,
  'ribbon-button-table-from-data-table': <>{rect(4, 7, 18, 18, P.white, 1, P.blue)}{rect(4, 7, 18, 5, P.blue)}{path('M22 16h7m-3-3l3 3-3 3', 'none', P.green, 2)}</>,
  'ribbon-thumbnail-illustration': <>{rect(4, 5, 17, 17, P.paleBlue, 1, P.blue)}{path('M7 18l5-6 4 4 3-3 4 5z', P.blue)}{circle(20, 8, 6, P.paleYellow, P.gold)}{hair('M4 27h24', P.gray, 2)}</>,
  'ribbon-thumbnail-hyperlink': <>{line('M13 18a6 6 0 0 1 0-8l3-3a6 6 0 0 1 9 9l-2 2', P.blue, 2)}{line('M19 14a6 6 0 0 1 0 9l-3 3a6 6 0 0 1-9-9l2-2', P.blue, 2)}{line('M12 20l8-8', P.blue, 2.4)}</>,
  'ribbon-thumbnail-insertTextBox': <>{rect(5, 7, 22, 18, P.white, 1, P.gray)}{g(GL.A, P.blue, 2.6)}</>,
  /* TASK 63 item 8 — Themes big button (trial: white page with folded top-right corner,
     grey #7b818d outline, serif "Aa" in slate #44546A, a row of theme swatches along the
     bottom: blue, orange, grey, yellow, blue, green). */
  'ribbon-thumbnail-themes': <>
    <path d="M23 7v21H3V2h15z" fill={P.white} stroke="#7b818d" strokeWidth={2} strokeLinejoin="round" />
    <path d="M18 2v5h5" fill="none" stroke="#7b818d" strokeWidth={2} strokeLinejoin="round" />
    {g('M7 21 10.4 10.5 13.8 21M8.3 17.2h3.6', '#44546a', 2)}
    {g('M19.8 21V14.6a2.6 2.6 0 0 0-5.2 0 2.6 2.6 0 0 0 5.2 0M17.3 21v-5.5', '#44546a', 2)}
    {rect(4.5, 26, 3.4, 3.2, P.blue, 0)}{rect(8.8, 26, 3.4, 3.2, P.orange, 0)}{rect(13.1, 26, 3.4, 3.2, P.paleGray, 0)}
    {rect(17.4, 26, 3.4, 3.2, P.yellow, 0)}{rect(21.7, 26, 3.4, 3.2, P.deepBlue, 0)}{rect(26, 26, 3.4, 3.2, P.green, 0)}
  </>,
  'ribbon-thumbnail-page-setup': <>{rect(8, 3, 16, 26, P.white, 1, P.gray)}{hair('M12 9h8M12 14h8M12 19h5', P.gray, 1.3)}{rect(17, 18, 10, 10, P.paleBlue, 1, P.blue)}{line('M19 23h6M22 20v6', P.blue, 1.5)}</>,
  'ribbon-thumbnail-scale-to-fit': <>{rect(4, 7, 15, 18, P.white, 1, P.gray)}{path('M19 12h8v14h-8z', P.paleBlue, P.blue)}{line('M9 21l4-4 4 4M13 17v8', P.green, 1.8)}</>,
  'ribbon-thumbnail-sheet-option': <>{rect(4, 4, 24, 24, P.white, 1, P.gray)}{hair('M4 12h24M4 20h24M12 4v24M20 4v24', P.paleGray, 1.2)}{g('M7 7l4 4M11 7l-4 4', P.green, 1.6)}</>,
  'ribbon-thumbnail-functions': <>{g(GL.f, P.blue, 2.8)}{g('M18 18l10 12M28 18 18 30', P.blue, 2.6)}</>,
  'ribbon-thumbnail-names': <>{rect(4, 6, 24, 20, P.white, 1, P.gray)}{hair('M8 11h16M8 16h12M8 21h9', P.blue, 1.5)}{line('M21 19l3 3 5-6', P.green, 1.8)}</>,
  'ribbon-thumbnail-formula-auditing': <>{circle(16, 16, 11, P.paleBlue, P.blue, 1.6)}{line('M16 7v18M7 16h18', P.blue, 1.6)}{g('M9.5 9.5 22.5 22.5M22.5 9.5 9.5 22.5', P.white, 1.4)}</>,
  'ribbon-thumbnail-formula-calculation': <>{rect(9, 3, 14, 26, P.white, 1.5, P.gray)}{rect(11.5, 6, 9, 5, P.lightBlue, 0)}{dot(12.8, 15.5, 1.2, P.dark)}{dot(16, 15.5, 1.2, P.dark)}{dot(19.2, 15.5, 1.2, P.dark)}{dot(12.8, 19.5, 1.2, P.dark)}{dot(16, 19.5, 1.2, P.dark)}{dot(19.2, 19.5, 1.2, P.dark)}{dot(12.8, 23.5, 1.2, P.dark)}{dot(16, 23.5, 1.2, P.dark)}{dot(19.2, 23.5, 1.2, P.dark)}</>,
  /* TASK 63 item 8 — Sheet Binding button (Data tab, measured): light-grey 3x3 grid with a
     filled light-blue column and a grey-handled paintbrush (blue bristles) laid across its
     lower-right corner. */
  'ribbon-button-template': <>
    <rect x={2.7} y={2.7} width={22.7} height={22.7} fill={P.white} stroke={P.lightGray} strokeWidth={2} />
    {hair('M9.3 2.7V25.3M18.7 2.7V25.3M2.7 9.3H25.3M2.7 16H25.3M2.7 22H25.3', '#c4c4c4', 1.6)}
    <rect x={9.3} y={9.3} width={9.4} height={12.7} fill={P.lightBlue} />
    {hair('M9.3 13.3H18.7M9.3 17.3H18.7', '#61a5e4', 1.3)}
    {line('M30.7 8L22 19.3', P.midGray, 3.4)}
    {path('M23.3 17.3l3.4 3-3.7 3.7-3.4-3z', P.paleGray, P.gray, 1.1)}
    {path('M13 29.3l6-8.7 5.3 4.7-4 5.3-6-1.3z', P.blue)}
  </>,
  'ribbon-thumbnail-data-sources': <>{rect(4, 6, 24, 9, P.paleBlue, 1, P.blue)}{rect(4, 18, 24, 9, P.paleYellow, 1, P.gold)}{circle(26, 24, 3, P.orange)}</>,
  'ribbon-thumbnail-queriedAndConnections': <>{rect(4, 6, 16, 16, P.white, 1, P.blue)}{hair('M4 12h16M12 6v16', P.blue, 1.2)}{line('M20 20l7 7M20 24h10V14', P.orange, 2)}</>,
  'ribbon-thumbnail-sortAndFilter': <>{hair('M4 8h16M8 14h10M12 20h5', P.dark, 2.2)}{path('M24 14l5 5 5-5z', P.blue)}{line('M29 19v9', P.blue, 2.6)}</>,
  'ribbon-thumbnail-datatools': <>{rect(4, 5, 24, 22, P.white, 1, P.gray)}{path('M8 10h6v6H8zM18 10h6v6h-6zM8 18h6v6H8z', P.paleBlue)}{path('M18 18h6v6h-6z', P.paleYellow)}{line('M22 8l4 4M26 8l-4 4', P.red, 1.8)}</>,
  'ribbon-thumbnail-outline': <>{hair('M4 5h24M4 16h24M4 27h24', P.dark, 1.8)}{rect(7, 10, 10, 12, P.paleBlue, 1, P.blue)}{line('M20 13l4 4 4-4', P.green, 2)}</>,
  'ribbon-thumbnail-forecast': <>{rect(4, 6, 24, 20, P.white, 1, P.gray)}{line('M8 21l5-7 4 4 7-9', P.blue, 2.4)}{line('M20 9h5v5', P.green, 2)}</>,
  'ribbon-thumbnail-threaded-comments': <>{path('M5 6h22v15H14l-6 5v-5H5z', P.white, P.gray, 1.8)}{hair('M10 11h12M10 16h8', P.gray, 1.4)}</>,
  'ribbon-thumbnail-showhide': <>{path('M3 16s5-8 13-8 13 8 13 8-5 8-13 8S3 16 3 16z', P.white, P.blue, 1.8)}{circle(16, 16, 5, P.paleBlue, P.blue, 1.6)}</>,
  'ribbon-thumbnail-zoom': <>{circle(14, 14, 9, P.white, P.blue, 2)}{line('M21 21l8 8', P.blue, 3)}{line('M10 14h8M14 10v8', P.blue, 1.6)}</>,
  'ribbon-thumbnail-viewport': <>{rect(4, 5, 24, 22, P.white, 1, P.gray)}{hair('M4 13h24M13 5v22', P.blue, 2)}{path('M6 7h5v4H6zM15 7h11v4H15zM6 15h5v10H6z', P.paleBlue)}</>,
  'ribbon-thumbnail-spreadsettings': <>{rect(4, 5, 22, 20, P.white, 1, P.gray)}{hair('M9 11h12M9 16h8', P.gray, 1.4)}{path('M20 25l6 4 2-3-6-4z', P.orange)}{gear(25, 25, 6, P.blue)}</>,
  'ribbon-thumbnail-sheetsettings': <>{rect(4, 4, 24, 24, P.white, 1, P.gray)}{hair('M4 12h24M4 20h24M12 4v24M20 4v24', P.blue, 1.4)}{rect(12, 12, 8, 8, P.paleBlue)}{gear(25, 25, 6, P.blue)}</>,
  /* --- Functions library: white "booklet" with a coloured symbol -------- */
  'ribbon-button-insertfunction': <>{g(GL.f, P.blue, 2.6)}{g('M17 17l11 12M28 17 17 29', P.blue, 2.6)}</>,
  // Data Binding gallery (TASK 51; labels from the trial UI, drawings our own).
  'ribbon-button-load-schema': <>{rect(7, 3, 17, 22, P.white, 1, P.gray)}{hair('M10 9h11M10 13h11M10 17h8', P.lightGray, 1.6)}{g('M16 12v12M12 20.5l4 4 4-4', P.green, 2.2)}</>,
  'ribbon-button-save-schema': <>{rect(7, 3, 17, 22, P.white, 1, P.gray)}{hair('M10 9h11M10 13h11M10 17h8', P.lightGray, 1.6)}{g('M16 26V13M12 16.5l4-4 4 4', P.blue, 2.2)}</>,
  'ribbon-button-clear-bindingpath': <>{rect(7, 3, 17, 22, P.white, 1, P.gray)}{hair('M10 10h11M10 15h7', P.lightGray, 1.6)}{g('M2 16c0-2 2-2 4-2M26 16c0 2-2 2-4 2', P.gray, 1.8)}{g('M19 19l9 9M28 19l-9 9', P.red, 2.6)}</>,
  'ribbon-button-bind-datamanager': <>{rect(4, 8, 17, 13, P.white, 1, P.blue)}{hair('M4 13h17M4 17h17M10 8v13', P.blue, 1.2)}{g('M26 26v-9M22.5 20l3.5-3.5 3.5 3.5', P.green, 2)}</>,
  // Picture placement menu (trial: blue picture tile; arrow points in for "Place in Cells", hovers above for "over").
  'ribbon-button-place-in-cells': <>{rect(4, 8, 19, 15, P.white, 1, P.blue)}{circle(9, 13, 1.8, P.blue)}{path('M5 21l5-5 4 4 3-3 5 4z', P.paleBlue, P.blue, 1)}{g('M26 4v12M22.5 12.5 26 16l3.5-3.5', P.green, 2)}</>,
  'ribbon-button-place-over-cells': <>{rect(4, 8, 19, 15, P.white, 1, P.blue)}{circle(9, 13, 1.8, P.blue)}{path('M5 21l5-5 4 4 3-3 5 4z', P.paleBlue, P.blue, 1)}{g('M26 14V3M22.5 6.5 26 3l3.5 3.5', P.green, 2)}</>,
  'ribbon-button-financialfunction': <>{rect(6, 4, 20, 25, P.white, 1.5, P.dark)}{oval(16, 13, 6, 2.6, P.green, 1.8)}{g('M10 13v8a6 2.6 0 0 0 12 0v-8', P.green, 1.8)}{hair('M10 16.5a6 2.6 0 0 0 12 0M10 20a6 2.6 0 0 0 12 0', P.green, 1.3)}</>,
  'ribbon-button-logicalfunction': <>{rect(6, 4, 20, 25, P.white, 1.5, P.dark)}{g(GL.qm, P.purple, 2.6)}{dot(16, 26, 1.7, P.purple)}</>,
  'ribbon-button-textfunction': <>{rect(6, 4, 20, 25, P.white, 1.5, P.dark)}<g transform="translate(7 10) scale(0.85)">{g(GL.A, P.blue, 3)}</g></>,
  'ribbon-button-datetimefunction': <>{rect(6, 4, 20, 25, P.white, 1.5, P.dark)}{circle(16, 17, 7, P.white, P.red, 1.8)}{line('M16 17V12.5M16 17l3.4 2.2', P.red, 1.6)}</>,
  'ribbon-button-lookupreferencefunction': <>{rect(6, 4, 20, 25, P.white, 1.5, P.dark)}{circle(14.5, 15.5, 5.5, P.white, P.blue, 1.8)}{line('M18.8 19.8l5 5', P.blue, 2.2)}</>,
  'ribbon-button-mathtrigfunction': <>{rect(6, 4, 20, 25, P.white, 1.5, P.dark)}{oval(16, 17, 5.4, 7.4, P.green, 1.8)}{hair('M10.6 17h10.8', P.green, 1.8)}</>,
  'ribbon-button-morefunction': <>{rect(6, 4, 20, 25, P.white, 1.5, P.dark)}{dot(11, 17, 1.8, P.red)}{dot(16, 17, 1.8, P.red)}{dot(21, 17, 1.8, P.red)}</>,
  'ribbon-button-namemanager': <>{path('M6 14h20l-2 14H8z', P.white, P.dark, 1.6)}{path('M10 14 13 5h8l2 9z', P.paleBlue, P.blue, 1.4)}{rect(16, 8, 7, 6, P.midBlue)}</>,
  /* TASK 63 item 8 — Show Formulas: trial glyph = a grey right-triangle "flag" outline
     (top edge + left edge + hypotenuse) with a small blue cursive "fx" at its lower right. */
  'ribbon-show-formulas': <>
    <path d="M3 3.5h18L3 21.5z" fill="none" stroke={P.gray} strokeWidth={2.6} strokeLinejoin="round" />
    {g('M12.5 8.5c.8-1.7 3-2.4 3.9-.6.8 1.7-1 3.4-2.5 5.3-1.4 1.8-2.4 3.3-2.9 5.4', P.blue, 2)}
    {g('M9.5 11h8', P.blue, 2)}
    {g('M15 12l4.5 4.5M19.5 12 15 16.5', P.blue, 2)}
  </>,
  'gc-formula-editor-panel-ribbon-show': <>{rect(4, 5, 24, 22, P.white, 1, P.blue)}{hair('M8 11h16M8 16h11M8 21h13', P.lightBlue, 2)}</>,
  /* TASK 63 item 8 — Calculate Now / Calculate Sheet (measured): a thick grey calculator
     with a blue display carrying a lighter highlight and 3x3 solid grey keys; Calculate
     Sheet is a 3x3 grey grid sheet (folded lower-left corner) with the calculator at its
     lower-right. */
  'ribbon-button-calculateNow': <>
    <rect x={4} y={1} width={26} height={28} rx={1} fill={P.white} stroke={P.gray} strokeWidth={2.6} />
    {rect(6, 4, 18, 5, P.blue, 0)}{rect(8, 5.5, 14, 2, P.midBlue, 0)}
    {keys3x3(8, 12, 6, 4, P.gray)}
  </>,
  'ribbon-button-calculateSheet': <>
    <rect x={0} y={0} width={28} height={22} rx={1} fill={P.white} stroke={P.gray} strokeWidth={2.2} />
    {hair('M10 1v20M18 1v20M1 8h26M1 15h26', P.paleGray, 1.6)}
    <path d="M0 22v-6l6 6z" fill={P.white} stroke={P.gray} strokeWidth={1.8} strokeLinejoin="round" />
    <rect x={18} y={10} width={13} height={17} rx={1} fill={P.white} stroke={P.gray} strokeWidth={2} />
    {rect(21, 13, 7, 3, P.blue, 0)}
    {keys3x3(20.5, 18.5, 3.8, 2, P.gray)}
  </>,
  'ribbon-button-editLinks': <>{rect(7, 3, 18, 26, P.white, 1, P.gray)}{g('M12 17a4 4 0 0 1 4-5.4l1.6.4', P.blue, 2)}{g('M20 17.6a4 4 0 0 1-4 5.4l-1.6-.4', P.blue, 2)}{line('M13.5 19.5l6-2.6', P.blue, 2)}</>,
  'ribbon-button-sortAZ': <><g transform="translate(3 2) scale(0.72)">{g(GL.A, P.blue, 3)}</g><g transform="translate(3 14) scale(0.72)">{g(GL.Z, P.red, 3)}</g>{g('M26 6v18M21.5 20 26 25l4.5-5', P.dark, 2.2)}</>,
  'ribbon-button-sortZA': <><g transform="translate(3 2) scale(0.72)">{g(GL.Z, P.red, 3)}</g><g transform="translate(3 14) scale(0.72)">{g(GL.A, P.blue, 3)}</g>{g('M26 6v18M21.5 20 26 25l4.5-5', P.dark, 2.2)}</>,
  'ribbon-button-sort': <>{rect(4, 6, 20, 21, P.white, 1, P.gray)}{rect(4, 6, 10, 10.5, P.blue)}{rect(14, 6, 10, 10.5, P.paleBlue)}{rect(4, 16.5, 10, 10.5, P.paleYellow)}{rect(14, 16.5, 10, 10.5, P.paleOrange)}<g transform="translate(6 6) scale(0.62)">{g(GL.A, P.white, 4)}</g><g transform="translate(16 6) scale(0.62)">{g(GL.A, P.blue, 4)}</g><g transform="translate(6 16) scale(0.62)">{g(GL.Z, P.gold, 4)}</g><g transform="translate(16 16) scale(0.62)">{g(GL.Z, P.orange, 4)}</g>{g('M27 8v16M23 20.5 27 25l4-4.5', P.dark, 2)}</>,
  'ribbon-button-filter': <>{path('M4 5h24L19 18v9l-6 3V18z', P.blue)}</>,
  'ribbon-button-clearfilter': <>{path('M4 6h20l-7 9v7l-5 3v-10z', P.lightBlue, P.blue, 1.5)}{g('M21 21l9 9M30 21l-9 9', P.orange, 2.4)}</>,
  'ribbon-button-reapplyfilter': <>{path('M4 6h22l-8 10v8l-5 3V16z', P.midBlue, P.blue, 1.2)}{g('M25 18a7 7 0 1 1-2-5M25 9v5h-5', P.orange, 2)}</>,
  'ribbon-button-textToColumn': <>{rect(18, 5, 10, 22, P.white, 1, P.gray)}{hair('M18 12h10M18 19h10', P.gray, 1.1)}{hair('M4 8h10M4 14h8M4 20h10', P.dark, 1.8)}{g('M13 16h6M16 12l4 4-4 4', P.blue, 1.8)}</>,
  'ribbon-button-remove-duplicates': <>{rect(4, 5, 13, 22, P.white, 1, P.blue)}{rect(4, 5, 13, 5, P.blue)}{rect(14, 5, 13, 22, P.white, 1, P.blue)}{rect(14, 5, 13, 5, P.blue)}{g('M17 16l8 8M25 16l-8 8', P.red, 2.2)}</>,
  'gc-ribbon-control-dropdown-datavalidationsmall': <>{rect(4, 5, 24, 22, P.white, 1, P.gray)}{g('M9 16l4 4 8-9', P.green, 2.6)}</>,
  /* TASK 63 item 8 — Outline family (Data tab), measured glyph geometry (see note above). */
  'ribbon-button-innerGroup': <>{outlineTable([P.blue, P.blue, P.blue])}{groupArms()}{medallion(0.5, 8.5)}</>,
  'ribbon-button-innerUngroup': <>
    {outlineTable([P.blue, P.blue, P.blue])}{groupArms()}{medallion(0.5, 8.5)}
    <rect x={0} y={10} width={12} height={12} fill={P.white} stroke={P.red} strokeWidth={2.8} />
    {line('M2.2 19.8L9.8 12.2', P.red, 2.6, 'butt')}
  </>,
  'ribbon-button-subtotal': <>
    {outlineTable([P.blue, P.blue, P.orange], [4, 14, 24], [10, 19.5])}{medallion(0.5, 0.5)}
    <rect x={0.5} y={19.5} width={11} height={11} fill={P.white} stroke={P.gray} strokeWidth={2.4} />
    {path('M6 20 11.5 25 6 30 0.5 25Z', '#3d3d3d')}
    {line('M6 22.5v5M3.5 25h5', P.white, 1.6, 'butt')}
  </>,
  'ribbon-button-showdetail': <>{line('M8 6V14M4 10H12', P.gray, 2.6, 'butt')}{detailBars(6)}</>,
  'ribbon-button-hidedetail': <>{line('M4 8H12', P.gray, 2.6, 'butt')}{detailBars(4)}</>,
  'ribbon-button-whatIfAnalysis': <>{table3([[0, 0, P.lightBlue], [0, 1, P.paleBlue], [1, 2, P.paleBlue]], P.gray, 4, 5, 7.6)}{g('M15 12a4.8 4.8 0 1 1 8 3.6c-1.3 1.4-3 2-3 4.4', P.blue, 2.4)}{dot(20, 25, 1.7, P.blue)}</>,
  'ribbon-button-review-newThreadedComment': <>{path('M5 6h22v15H14l-6 5v-5H5z', P.white, P.gray, 1.8)}{line('M16 10v8M12 14h8', P.green, 2.4)}</>,
  'ribbon-button-review-deleteThreadedComment': <>{path('M5 6h20v15H14l-6 5v-5H5z', P.white, P.gray, 1.8)}{g('M11 10.5l8 7M19 10.5l-8 7', P.red, 2)}</>,
  'ribbon-button-review-previousThreadedComment': <>{path('M5 6h22v15H14l-6 5v-5H5z', P.white, P.gray, 1.8)}{path('M19 10l-6 4 6 4z', P.blue)}</>,
  'ribbon-button-review-nextThreadedComment': <>{path('M5 6h22v15H14l-6 5v-5H5z', P.white, P.gray, 1.8)}{path('M13 10l6 4-6 4z', P.blue)}</>,
  'ribbon-button-review-showThreadedComments': <>{path('M5 6h22v15H14l-6 5v-5H5z', P.white, P.gray, 1.8)}{hair('M10 11h12M10 16h8', P.gray, 1.4)}</>,
  'ribbon-button-zoom': <>{circle(14, 14, 9, P.white, P.blue, 2)}{line('M21 21l8 8', P.blue, 3)}</>,
  /* TASK 63 item 8 — Zoom "100%" (View tab): a solid grey page with a folded upper-right
     corner, a dashed frame continuing to the right, a blue arrow feeding into a blue
     "100" tile overlapping the page's lower-right corner. */
  'ribbon-button-zoomdefault': <>
    <path d="M20.7 18.7V7.3l-6-6H2.7v24.6" fill="none" stroke={P.gray} strokeWidth={1.8} strokeLinejoin="round" />
    <path d="M14.7 1.3v4.7h6" fill="none" stroke={P.gray} strokeWidth={1.6} strokeLinejoin="round" />
    <path d="M19.3 1.3h9.4M28.7 4.7V19.3" fill="none" stroke={P.lightGray} strokeWidth={1.8} strokeDasharray="3 2.5" strokeLinecap="butt" />
    {line('M18.5 13.3H23', P.blue, 2)}{path('M22.5 10.5 26.5 13.3 22.5 16.1z', P.blue)}
    {hair('M25 15.5v3.8', P.gray, 1.8)}
    <rect x={14} y={19.3} width={13.3} height={7.3} rx={1} fill={P.blue} stroke={P.midBlue} strokeWidth={1.4} />
    {line('M17.5 21.6l1.3-1v4.3', P.white, 1.2)}
    {oval(21.9, 24.1, 1.4, 2, P.white, 1.2)}{oval(25.1, 24.1, 1.4, 2, P.white, 1.2)}
  </>,
  'ribbon-button-zoomtoselection': <>{table3([[1, 0, P.lightBlue], [1, 1, P.paleBlue], [2, 1, P.paleBlue]], P.gray, 4, 4, 8)}{circle(21, 21, 6, 'rgba(255,255,255,0)', P.blue, 2)}{line('M25.4 25.4l4.6 4.6', P.blue, 2.4)}</>,
  'ribbon-button-freezepane': <>{rect(4, 4, 24, 24, P.white, 1, P.gray)}{rect(4, 4, 24, 8, P.paleBlue)}{rect(4, 12, 8, 16, P.paleBlue)}{line('M4 12h24M12 4v24', P.blue, 2)}</>,
  'ribbon-button-unfreezepane': <>{rect(4, 5, 24, 22, P.white, 1, P.gray)}{hair('M4 12h24M12 5v22', P.blue, 2)}{g('M16 16l8 8M24 16l-8 8', P.red, 2)}</>,
  'gc-designer-selection-pane-ribbon': <>{rect(4, 5, 24, 22, P.white, 1, P.gray)}{rect(7, 8, 7, 16, P.paleBlue, 1, P.blue)}{hair('M17 10h8M17 15h6M17 20h8', P.gray, 1.4)}</>,
  /* TASK 63 item 8 — Command Palette (View tab): white tile outlined in grey holding a blue
     "> _" prompt, with a blue magnifier over its upper-right corner (white fill masks the
     tile edge; a faint dashed halo surrounds the lens). */
  'ribbon-button-command-palette': <>
    <rect x={5} y={7} width={20} height={17} rx={1.5} fill={P.white} stroke={P.gray} strokeWidth={1.6} />
    {line('M9 12l3.2 2.8-3.2 2.8', P.blue, 2)}
    {hair('M12.5 19.5H20.5', P.blue, 1.8)}
    <circle cx={21.5} cy={7.5} r={5.6} fill="none" stroke={P.paleGray} strokeWidth={1.2} strokeDasharray="2 2" />
    {line('M24.3 10.6l3 3', P.blue, 2)}
    {circle(21.5, 7.5, 3.9, P.white, P.blue, 1.8)}
  </>,
  'ribbon-button-spreadgeneral': <>{rect(6, 4, 20, 24, P.white, 1, P.gray)}{hair('M10 11h12M10 16h8', P.gray, 1.4)}{path('M19 24l7 4 1.5-2.5-7-4z', P.orange)}{gear(25, 25, 6, P.blue)}</>,
  'ribbon-button-scrollbars': <>{rect(4, 5, 22, 20, P.white, 1, P.gray)}{rect(19, 7, 5, 16, P.paleGray)}{rect(20, 10, 3, 6, P.blue, 0.5)}{hair('M8 10h7M8 14h7', P.gray, 1.2)}{gear(24, 24, 6, P.blue)}</>,
  'ribbon-button-calculation': <>{rect(9, 3, 14, 26, P.white, 1.5, P.gray)}{rect(11.5, 6, 9, 5, P.blue, 0)}{dot(12.8, 15.5, 1.1, P.dark)}{dot(16, 15.5, 1.1, P.dark)}{dot(19.2, 15.5, 1.1, P.dark)}{dot(12.8, 19.5, 1.1, P.dark)}{dot(16, 19.5, 1.1, P.dark)}{dot(19.2, 19.5, 1.1, P.dark)}{dot(12.8, 23.5, 1.1, P.dark)}{dot(16, 23.5, 1.1, P.dark)}{dot(19.2, 23.5, 1.1, P.dark)}{gear(25, 25, 6, P.blue)}</>,
  'ribbon-button-tabstrip': <>{rect(4, 5, 24, 22, P.white, 1, P.gray)}{rect(4, 21, 24, 6, P.paleBlue)}{rect(7, 23, 5, 2.5, P.blue)}{rect(14, 23, 5, 2.5, P.paleGray)}{gear(25, 25, 6, P.blue)}</>,
  'ribbon-button-sheetgeneral': <>{rect(4, 4, 24, 24, P.white, 1, P.gray)}{hair('M4 12h24M4 20h24M12 4v24M20 4v24', P.gray, 1.2)}{gear(25, 25, 6, P.blue)}</>,
  'ribbon-button-gridlines': <>{rect(4, 5, 24, 22, P.white, 1, P.gray)}{hair('M4 12h24M4 19h24M12 5v22M20 5v22', P.gray, 1.2)}{gear(25, 25, 6, P.blue)}</>,
  'ribbon-button-headers': <>{rect(4, 5, 24, 22, P.white, 1, P.gray)}{rect(4, 5, 24, 5, P.yellow)}{rect(4, 10, 5, 17, P.yellow)}{hair('M12 15h14M12 20h10', P.gray, 1.3)}{gear(25, 25, 6, P.blue)}</>,
  'ribbon-button-print-titles': <>{rect(6, 6, 18, 16, P.white, 1, P.gray)}{rect(6, 6, 18, 4, P.paleRed, 0, P.red)}{hair('M12 6v16M18 6v16M6 14h18', P.gray, 1)}{path('M19 22h6l2 6h-10z', P.midGray)}{rect(17, 20, 10, 3, P.paleGray, 0.5, P.gray)}</>,
  'ribbon-button-page-setup-background': <>{rect(4, 5, 24, 22, P.white, 1, P.gray)}{path('M6 24l7-10 5 5.5 4-4.5 6 9z', P.lightBlue)}{dot(21, 10, 3, P.orange)}</>,
  /* TASK 63 item 8 — Scale-to-fit labels (Page Layout): grey row-table bracket plus a blue
     double-headed arrow toward the fitted dimension (measured from the reference strip). */
  'ribbon-button-scale-to-fit-page-width-text': <>
    <rect x={10.7} y={5.3} width={20} height={6.7} fill={P.white} stroke={P.gray} strokeWidth={2} />
    {hair('M10.7 14.7v2.6M30.7 14.7v2.6', P.gray, 2)}
    {line('M10.7 22.7H18.7M22.7 22.7H30.7', P.blue, 2)}
    {line('M13.3 20l-2.6 2.7 2.6 2.7M28 20l2.7 2.7-2.7 2.7', P.blue, 2)}
  </>,
  'ribbon-button-scale-to-fit-page-height-text': <>
    <rect x={24} y={5.3} width={6.7} height={20} fill={P.white} stroke={P.gray} strokeWidth={2} />
    {hair('M18.7 5.3h2.6M18.7 25.3h2.6', P.gray, 2)}
    {line('M13.3 6.7V24', P.blue, 2)}
    {line('M10.7 8l2.6-2.7 2.6 2.7M10.7 22.7l2.6 2.6 2.6-2.6', P.blue, 2)}
  </>,
  'ribbon-button-scale-to-fit-scale-text': <>
    <path d="M24 6.7H30.7V26.7H10.7V20" fill="none" stroke={P.lightGray} strokeWidth={2} strokeLinecap="butt" />
    <path d="M21.3 12V6.7H10.7V17.3H16" fill="none" stroke={P.gray} strokeWidth={2} strokeLinecap="butt" strokeLinejoin="miter" />
    {line('M21.3 17.3l5.4 5.4', P.blue, 2.2)}
    {hair('M18.7 14.7H24M18.7 14.7V20', P.blue, 2.2)}
  </>,
  'ribbon-button-checkbox-cell-type': <>{rect(8, 8, 16, 16, P.white, 2, P.gray)}{g('M11.5 16l3.5 4 6-8', P.blue, 2.6)}</>,
  'ribbon-button-hyperlink': <>{line('M13 18a6 6 0 0 1 0-8l3-3a6 6 0 0 1 9 9l-2 2', P.blue, 2.2)}{line('M19 14a6 6 0 0 1 0 9l-3 3a6 6 0 0 1-9-9l2-2', P.blue, 2.2)}</>,
  'ribbon-button-insert-textBox': <>{rect(5, 7, 22, 18, P.white, 1, P.gray)}{g(GL.A, P.blue, 2.6)}</>,
  'ribbon-button-chart': <>{rect(4, 13, 7, 16, P.blue, 0)}{rect(13, 5, 7, 24, P.yellow, 0)}{rect(22, 9, 7, 20, P.red, 0)}</>,
  /* TASK 63 item 8 — Barcode (Insert tab): the trial shows a QR-style glyph — three finder
     squares (top-left, top-right, bottom-left) with filled centers, plus scattered modules
     and a dashed column (our own module arrangement, measured box positions). */
  'ribbon-button-barcode': <>
    <rect x={2.7} y={2.7} width={9.3} height={9.3} fill={P.white} stroke={P.gray} strokeWidth={1.8} />
    <rect x={5.3} y={5.3} width={4} height={4} fill={P.midGray} />
    <rect x={18.7} y={2.7} width={8.7} height={9.3} fill={P.white} stroke={P.gray} strokeWidth={1.8} />
    <rect x={21.3} y={5.3} width={3.3} height={3.3} fill={P.midGray} />
    <rect x={2.7} y={14.7} width={9.3} height={9.3} fill={P.white} stroke={P.gray} strokeWidth={1.8} />
    <rect x={5.3} y={17.3} width={4} height={4} fill={P.midGray} />
    <path d="M14.7 2.7V26" fill="none" stroke={P.lightGray} strokeWidth={2} strokeDasharray="2.5 2.5" strokeLinecap="butt" />
    <path d="M2.7 12H26.7" fill="none" stroke={P.lightGray} strokeWidth={2} strokeDasharray="2.5 2.5" strokeLinecap="butt" />
    <rect x={12} y={15.3} width={2.7} height={2.7} fill={P.gray} />
    <rect x={18.7} y={16} width={2.7} height={2.7} fill={P.gray} />
    <rect x={24.7} y={15.3} width={2.7} height={2.7} fill={P.lightGray} />
    <rect x={16} y={19.3} width={2.7} height={2.7} fill={P.lightGray} />
    <rect x={21} y={20} width={2.7} height={2.7} fill={P.gray} />
    <rect x={25.3} y={19.3} width={2.7} height={2.7} fill={P.gray} />
    <rect x={14.7} y={23.3} width={2.7} height={2.7} fill={P.gray} />
    <rect x={19.3} y={24} width={2.7} height={2.7} fill={P.lightGray} />
    <rect x={23.3} y={23.3} width={4} height={4} fill={P.gray} />
  </>,
  'ribbon-button-shapes': <>{rect(6, 6, 12, 12, 'none', 0, P.blue)}{circle(21, 12, 6, 'none', P.blue, 1.8)}{path('M16 20 22 28l6-8z', 'none', P.blue, 1.8)}</>,
  'ribbon-button-shape-group': <>{rect(4, 8, 12, 10, P.paleBlue, 1, P.blue)}{rect(15, 15, 12, 10, P.paleYellow, 1, P.gold)}{hair('M3 25h26M3 3h26', P.gray, 1.2)}</>,
  /* Shape Format tab. */
  'ribbon-thumbnail-shape-insert': <>{rect(3, 3, 11, 11, P.paleBlue, 1, P.blue)}{circle(23, 9, 6, P.paleYellow, P.gold)}{path('M4 29l5.5-11L15 29z', P.paleGreen, P.green)}{rect(18, 18, 11, 11, P.paleOrange, 5.5, P.orange)}</>,
  'ribbon-thumbnail-shape-styles': <>{rect(3, 7, 20, 13, P.blue, 3)}{g('M8 16v-6M8 10a3 3 0 0 1 6 0v6', P.white, 1.6)}{oval(19, 14, 3, 3, P.white, 1.6)}{line('M22 10v6', P.white, 1.6)}{g('M26 16a2.8 2.8 0 1 0 0-5', P.white, 1.6)}{rect(24, 22, 6, 6, P.orange)}{rect(16, 22, 6, 6, P.green)}{rect(8, 22, 6, 6, P.gold)}</>,
  'ribbon-thumbnail-shape-accessibility': <>{rect(4, 4, 24, 24, P.white, 2, P.gray)}{circle(16, 11, 3.2, P.deepBlue)}{path('M16 15c-4 0-6 2-6 5h3v6h6v-6h3c0-3-2-5-6-5z', P.deepBlue)}</>,
  'ribbon-thumbnail-shape-rotate': <>{g('M23.5 11a10 10 0 1 0 2 8', P.blue, 2.4)}{path('M19 2l7 5.5-8 3z', P.blue)}{rect(11, 12, 10, 8, P.paleBlue, 1, P.blue)}</>,
  'ribbon-thumbnail-shape-group': <>{rect(9, 9, 12, 12, P.paleBlue, 1, P.blue)}{rect(15, 15, 12, 12, P.paleOrange, 1, P.orange)}{line('M4 8V4h4M24 4h4v4M28 24v4h-4M8 28H4v-4', P.gray, 1.8)}</>,
  'ribbon-thumbnail-shape-align': <>{line('M6 4v24', P.gray, 1.8)}{rect(6, 6, 20, 5, P.paleBlue, 0, P.blue)}{rect(6, 14, 13, 5, P.paleYellow, 0, P.gold)}{rect(6, 22, 18, 5, P.paleOrange, 0, P.orange)}</>,
  'ribbon-thumbnail-shape-format-pane': <>{rect(3, 5, 17, 22, P.paleBlue, 1, P.blue)}{rect(22, 5, 7, 22, P.white, 1, P.gray)}{hair('M24 10h3M24 14h3M24 18h3M24 22h3', P.gray, 1.3)}</>,
  'ribbon-button-shape-ungroup': <>{rect(3, 6, 11, 9, P.paleBlue, 1, P.blue)}{rect(18, 17, 11, 9, P.paleYellow, 1, P.gold)}{line('M16 3v26', P.gray, 1.2)}</>,
  'ribbon-button-shape-change': <>{path('M14 4l9 7-3 11H8L5 11z', P.paleBlue, P.blue)}{line('M22 20a7 7 0 1 0 4 4v-4h-4', P.green, 2)}</>,
  'ribbon-button-shape-alt-text': <>{rect(4, 8, 24, 16, P.paleBlue, 2, P.blue)}{g(GL.A, P.deepBlue, 2)}<g transform="translate(11 12) scale(0.6)">{g(GL.A, P.deepBlue, 4)}</g>{g('M25 12v8M21 20a4 4 0 1 0 8 0', P.deepBlue, 1.8)}</>,
  'ribbon-button-rotate-shape': <>{line('M24 12a9.5 9.5 0 1 0 2 8', P.blue, 2.2)}<path d="M20 2l6 5-7 3z" fill={P.blue} stroke="none"/></>,
  'ribbon-thumbnail-shapealign': <>{line('M6 4v24', P.gray, 1.6)}{rect(6, 6, 18, 5, P.paleBlue, 0, P.blue)}{rect(6, 14, 12, 5, P.paleBlue, 0, P.blue)}{rect(6, 22, 21, 5, P.paleBlue, 0, P.blue)}</>,
  'ribbon-thumbnail-shape-arrange': <>{rect(5, 5, 14, 14, P.paleBlue, 1, P.blue)}{rect(14, 14, 14, 14, P.paleOrange, 1, P.orange)}{line('M23 8h6M26 5l3 3-3 3', P.green, 1.6)}</>,
  'ribbon-thumbnail-shapesize': <>{rect(8, 8, 14, 14, P.paleBlue, 1, P.blue)}{line('M8 27h16M11 24l-3 3 3 3M21 24l3 3-3 3', P.gray, 1.6)}</>,
  'ribbon-button-formatPane': <>{rect(3, 5, 18, 22, P.white, 1, P.gray)}{rect(23, 5, 7, 22, P.paleBlue, 1, P.blue)}{hair('M7 11h9M7 16h9M7 21h6', P.gray, 1.4)}</>,
  'ribbon-button-shape-bring-to-front': <>{rect(4, 14, 12, 12, P.paleGray, 1, P.gray)}{rect(13, 4, 14, 14, P.paleBlue, 1, P.blue)}{line('M25 26v6M21 30l4 4 4-4', P.green, 2)}</>,
  /* Submenu flyout rows (TASK 55 pass 2): the trial uses orange/white overlapping squares —
     filled orange square (the selection) at the destination corner, plain outline square behind. */
  'context-sub-bring-forward': <>{rect(15, 13, 12, 12, P.white, 1, P.midGray)}{rect(6, 6, 12, 12, '#f8a33d', 1.5, '#c55a11')}</>,
  'context-sub-bring-to-front': <>{rect(6, 6, 12, 12, P.white, 1, P.midGray)}{rect(15, 13, 12, 12, '#f8a33d', 1.5, '#c55a11')}</>,
  'context-sub-send-backward': <>{rect(6, 6, 12, 12, '#f8a33d', 1.5, '#c55a11')}{rect(15, 13, 12, 12, P.white, 1, P.midGray)}</>,
  'context-sub-send-to-back': <>{rect(15, 13, 12, 12, '#f8a33d', 1.5, '#c55a11')}{rect(6, 6, 12, 12, P.white, 1, P.midGray)}</>,
  'ribbon-button-shape-send-to-back': <>{rect(13, 13, 14, 14, P.paleGray, 1, P.gray)}{rect(4, 4, 14, 14, P.paleBlue, 1, P.blue)}{line('M25 6v8M21 10l4-4 4 4', P.orange, 2)}</>,
  /* Shape Styles quick tiles (TASK 55, from the trial's Shape Format strip): white tile,
     2px colored frame, colored "Abc" drawn with our own stroke letters. */
  'ribbon-shape-style-1': shapeStyleTile('#262626'),
  'ribbon-shape-style-2': shapeStyleTile('#2e75b6'),
  'ribbon-shape-style-3': shapeStyleTile('#ed7d31'),
  'ribbon-shape-style-4': shapeStyleTile('#a6a6a6'),
  'ribbon-shape-style-5': shapeStyleTile('#ffc000'),
  'ribbon-shape-style-6': shapeStyleTile('#5b9bd5'),
  'ribbon-shape-style-7': shapeStyleTile('#70ad47'),
  'ribbon-button-shape-bring-forward': <>{rect(6, 6, 12, 12, P.white, 1, P.gray)}{rect(14, 14, 13, 13, P.paleBlue, 1, P.blue)}{line('M25 4v10M21 8l4-4 4 4', P.green, 2)}</>,
  'ribbon-button-shape-send-backward': <>{rect(14, 14, 12, 12, P.white, 1, P.gray)}{rect(6, 6, 13, 13, P.paleBlue, 1, P.blue)}{line('M25 14V4M21 10l4 4 4-4', P.orange, 2)}</>,
  'ribbon-button-format-pane': <>{rect(3, 5, 18, 22, P.white, 1, P.gray)}{rect(23, 5, 7, 22, P.paleBlue, 1, P.blue)}{hair('M7 11h9M7 16h9M7 21h6', P.gray, 1.4)}</>,
  'ribbon-button-save-as-picture': <>{rect(4, 7, 24, 18, P.white, 1, P.gray)}{path('M7 21l5-6 4 4.5 3-3.5 5 5z', P.lightBlue)}{dot(11, 12, 2.4, P.orange)}{line('M16 25v6M12.5 28.5L16 32l3.5-3.5', P.blue, 2)}</>,
  'context-insert-comment': <>{rect(3, 3, 26, 20, P.paleYellow, 1, P.gold)}{path('M3 23l8 0 0 6z', P.paleYellow, P.gold)}{hair('M8 9h16M8 14h12', P.gray, 1.4)}</>,
  'ribbon-button-camera-shape': <>{rect(4, 10, 24, 16, P.white, 2, P.gray)}{rect(11, 6, 10, 4, P.white, 0.5, P.gray)}{circle(16, 18, 5.5, P.paleBlue, P.blue, 1.8)}{dot(24, 14, 1.6, P.red)}</>,
  'ribbon-button-formControl': <>{rect(5, 7, 22, 18, P.white, 1.5, P.gray)}{rect(10, 4, 12, 4, P.paleGray, 0.8, P.gray)}{g('M20 19.5a3.6 3.6 0 1 1-4-3.6 3.6 3.6 0 0 1 1.4.3l3.2-3.2 1.9 1.9-3.2 3.2c.2.5.3 1 .3 1.6Z', P.blue)}</>,
  'ribbon-button-disable': <>{}</>,
  'ribbon-checkbox-checked': <>{rect(3, 3, 26, 26, '#ffffff', 3, P.gray)}{g('M8 17l6 6 11-13', P.blue, 3)}</>,
  'ribbon-checkbox-unchecked': <>{rect(3, 3, 26, 26, '#ffffff', 3, P.gray)}</>,
  // Chart context-menu row glyphs (TASK 55) — our own drawings following the trial's motifs.
  'context-chart-reset': <>{rect(5, 4, 17, 24, P.white, 1, P.gray)}{rect(5, 4, 17, 5, P.blue, 0)}{hair('M5 14h17M5 19.5h17M13 9.5v18', P.lightGray, 1.2)}{g('M25 12a6 6 0 1 1-2 6.5', P.blue, 2)}{g('M25 8v4.4h-4.4', P.blue, 2)}</>,
  'context-chart-type': <>{rect(5, 14, 5, 13, P.blue, 0)}{rect(13.5, 8, 5, 19, P.orange, 0)}{rect(22, 11, 5, 16, P.yellow, 0)}{hair('M4 27h24', P.gray, 1.6)}</>,
  'context-chart-selectdata': <>{rect(4, 5, 17, 15, P.white, 1, P.gray)}{rect(4, 5, 17, 4, P.midBlue, 0)}{hair('M4 13h17M12.5 9.5v10.5', P.lightGray, 1.1)}{rect(17, 17, 3.5, 8, P.blue, 0)}{rect(22, 13, 3.5, 12, P.orange, 0)}{rect(27, 20, 3, 5, P.yellow, 0)}</>,
  'context-chart-move': <>{rect(4, 6, 24, 16, P.white, 1.5, P.blue)}{hair('M11 17l4-5 4 4 5-6', P.blue, 1.8)}{rect(14, 22, 4, 3, P.blue, 0)}{g('M8 27h16', P.blue, 2)}</>,
  'context-chart-formatseries': <>{rect(5, 15, 4.5, 12, P.blue, 0)}{rect(11.5, 10, 4.5, 17, P.paleBlue, 0)}{path('M24 5l4 4-11 11-4-1z', P.yellow, P.gold, 1.4)}{g('M13 19l-1.5 4 4-1.5', P.gold, 1.4)}</>,
  'context-chart-group': <>{rect(14, 14, 12, 12, P.white, 1, P.gray)}{rect(5, 5, 12, 12, P.white, 1, P.blue)}{rect(3.5, 3.5, 3, 3, P.blue, 0.5)}{rect(15.5, 3.5, 3, 3, P.blue, 0.5)}{rect(3.5, 15.5, 3, 3, P.blue, 0.5)}{rect(15.5, 15.5, 3, 3, P.blue, 0.5)}</>,
  // Cell Styles gallery footers (TASK 55): new-style = mini table + starburst; manage = list + cog.
  'gallery-new-cell-style': <>{rect(4, 7, 18, 16, P.white, 1, P.blue)}{hair('M10 7v16M16 7v16M4 12.3h18M4 17.7h18', P.lightBlue, 1.2)}{g('M24 11v11M19 13.5l10 6M29 13.5l-10 6', P.orange, 2)}</>,
  'gallery-manage-cell-states': <>{rect(5, 4, 16, 24, P.white, 1, P.gray)}{hair('M9 10h8M9 15h8M9 20h6', P.gray, 1.4)}{circle(23, 21, 5.5, P.paleBlue, P.blue, 1.6)}{g('M23 17.5v7M19.5 21h7', P.blue, 1.6)}</>,
  // Focus Cell dropdown toggle row (TASK 55): the trial shows a checkbox glyph; unchecked = empty
  // square (class ribbon-button-focuscell-unchecked in the trial DOM).
  'ribbon-button-focuscell-unchecked': <>{rect(6, 6, 20, 20, '#ffffff', 2, '#8c8c8c')}</>,
  // Plain green check (Calculation options "Automatic" row, TASK 55).
  'context-check-green': <>{g('M5 17l7 7L28 7', P.green, 3.6)}</>,
  /* Context-menu paste tiles (TASK 55): yellow clipboard with clip on top and the motif at the
     lower right (white page / fx / 123 / %-brush / %-123 / %-fx) — our own geometry. */
  'context-paste-all': <>{rect(4, 5, 15, 23, P.yellow, 1.5, P.gold)}{rect(8, 2.5, 7, 5, P.paleGray, 1, P.gray)}{path('M15 14h8l4 4v10h-12z', P.white, P.dark, 1.4)}{path('M23 14v4h4', P.white, P.dark, 1.2)}</>,
  'context-paste-formula': <>{rect(4, 5, 15, 23, P.yellow, 1.5, P.gold)}{rect(8, 2.5, 7, 5, P.paleGray, 1, P.gray)}<g transform="translate(14 13) scale(0.6)">{g('M10 4C13 0 16 -0.5 18 -0.5c2 0 3 1 3 2.2 0 1.9-2 3.2-4.4 3.2M7 9h10M13 9c0 8-2.5 14-6 18', P.dark, 2.4)}</g>{g('M19 20l8 9M27 20l-8 9', P.dark, 2)}</>,
  'context-paste-values': <>{rect(4, 5, 15, 23, P.yellow, 1.5, P.gold)}{rect(8, 2.5, 7, 5, P.paleGray, 1, P.gray)}<g transform="translate(15 17) scale(0.36)" fill="none" stroke="#3b3b3b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l5-5v18"/><path d="M14 8a5 5 0 1 1 9 3.5L13 21h11"/></g>{g('M21 27.5a4 3.4 0 1 1 6.5 2.6L21 30h8', P.dark, 1.8)}</>,
  'context-paste-formatting': <>{rect(4, 5, 15, 23, P.yellow, 1.5, P.gold)}{rect(8, 2.5, 7, 5, P.paleGray, 1, P.gray)}{line('M11 15a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 1 0 0 5.2Z', P.dark, 1.8)}{g('M17 8 10 22', P.dark, 1.8)}{line('M18 19a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 1 0 0-5.2Z', P.dark, 1.8)}{g('M20 26l6-6 3.6 3.6-6 6-5 1.4z', P.blue)}</>,
  'context-paste-values-formatting': <>{rect(4, 5, 15, 23, P.yellow, 1.5, P.gold)}{rect(8, 2.5, 7, 5, P.paleGray, 1, P.gray)}{line('M10 14a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 1 0 0 4.8Z', P.dark, 1.7)}{g('M16 7 9 21', P.dark, 1.7)}{line('M17 18a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 1 0 0-4.8Z', P.dark, 1.7)}<g transform="translate(19 24) scale(0.3)" fill="none" stroke="#3b3b3b" strokeWidth="4.5" strokeLinecap="round"><path d="M2 6l4-4v14"/><path d="M12 6a4 4 0 1 1 7 3L11 17h9"/><path d="M25 13.5a3.4 3.4 0 1 1 5.5 2.6L25 17h6"/></g></>,
  'context-paste-formula-formatting': <>{rect(4, 5, 15, 23, P.yellow, 1.5, P.gold)}{rect(8, 2.5, 7, 5, P.paleGray, 1, P.gray)}{line('M10 14a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 1 0 0 4.8Z', P.dark, 1.7)}{g('M16 7 9 21', P.dark, 1.7)}{line('M17 18a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 1 0 0-4.8Z', P.dark, 1.7)}<g transform="translate(19 22) scale(0.42)">{g('M10 3C13-1 16-1.5 18-1.5c2 0 3 1 3 2.2 0 1.9-2 3.2-4.4 3.2M7 7h10M12 7c0 7-2 11-5 14', P.dark, 2.6)}</g>{g('M21 27l6 5M27 27l-6 5', P.dark, 2)}</>,
  'ribbon-control-dropdown-greater-than': <>{g('M10 9l9 7-9 7', P.blue, 2.4)}{rect(19, 8, 9, 9, 'none', 0, P.lightGray)}</>,
  'ribbon-control-dropdown-less-than': <>{g('M19 9l-9 7 9 7', P.blue, 2.4)}{rect(19, 8, 9, 9, 'none', 0, P.lightGray)}</>,
  'ribbon-control-dropdown-between': <>{g('M15 9l-7 7 7 7M20 9l7 7-7 7', P.blue, 2.2)}{rect(21, 8, 7, 9, 'none', 0, P.lightGray)}</>,
  'ribbon-control-dropdown-equal-to': <>{line('M8 12h16M8 18h16', P.blue, 2.4)}</>,
  'ribbon-control-dropdown-text-that-contains': <><g transform="translate(4 6) scale(0.8)">{g(GL.A, P.blue, 3)}</g>{rect(19, 8, 9, 9, 'none', 0, P.lightGray)}</>,
  'ribbon-control-dropdown-a-date-occurring': <>{rect(5, 9, 14, 13, P.white, 1, P.blue)}{hair('M5 13h14M9 6v5M15 6v5', P.blue, 1.3)}</>,
  'ribbon-control-dropdown-duplicate-values': <>{rect(4, 5, 10, 10, P.paleBlue, 1, P.blue)}{rect(8, 10, 10, 10, P.paleYellow, 1, P.gold)}</>,
  'ribbon-control-dropdown-top-10-items': <><g transform="translate(3 8) scale(0.62)">{g(GL.one, P.blue, 4)}</g><g transform="translate(11 8) scale(0.62)">{g('M2 16a7 7 0 1 1 14 0 7 7 0 0 1-14 0', P.blue, 4)}</g>{path('M22 8l8 8-8 8z', P.green)}</>,
  'ribbon-control-dropdown-top-10-percent': <><g transform="translate(2 10) scale(0.5)">{g(GL.one, P.blue, 4.5)}</g><g transform="translate(9 10) scale(0.5)">{g('M2 14a7 7 0 1 1 14 0 7 7 0 0 1-14 0', P.blue, 4)}</g>{g('M22 10 30 24', P.blue, 2)}{dot(22, 10.5, 1.6, P.blue)}{dot(29, 23, 1.6, P.blue)}</>,
  'ribbon-control-dropdown-bottom-10-items': <><g transform="translate(3 8) scale(0.62)">{g(GL.one, P.blue, 4)}</g><g transform="translate(11 8) scale(0.62)">{g('M2 16a7 7 0 1 1 14 0 7 7 0 0 1-14 0', P.blue, 4)}</g>{path('M22 24l8-8-8-8z', P.orange)}</>,
  'ribbon-control-dropdown-bottom-10-percent': <><g transform="translate(2 10) scale(0.5)">{g(GL.one, P.blue, 4.5)}</g><g transform="translate(9 10) scale(0.5)">{g('M2 14a7 7 0 1 1 14 0 7 7 0 0 1-14 0', P.blue, 4)}</g>{g('M22 10 30 24', P.blue, 2)}{dot(22, 10.5, 1.6, P.blue)}{dot(29, 23, 1.6, P.blue)}</>,
  'ribbon-control-dropdown-above-average': <>{path('M4 24l12-12 12 12z', P.paleGreen, P.green, 1.5)}{line('M4 28h24', P.gray, 1.8)}</>,
  'ribbon-control-dropdown-below-average': <>{path('M4 8l12 12L28 8z', P.paleOrange, P.orange, 1.5)}{line('M4 5h24', P.gray, 1.8)}</>,
  'ribbon-control-dropdown-new-rule': <>{rect(4, 4, 24, 24, P.paleBlue, 2, P.blue)}{line('M16 9v14M9 16h14', P.green, 3)}</>,
  'ribbon-control-dropdown-manage-rules': <>{rect(4, 4, 24, 24, P.white, 2, P.gray)}{hair('M9 11h14M9 16h14M9 21h9', P.blue, 1.6)}{circle(24, 21, 4, P.paleGreen, P.green)}</>,
  'ribbon-button-chart-column': chartFrame(<>{rect(10, 16, 3, 8, P.blue, 0)}{rect(15, 11, 3, 13, P.yellow, 0)}{rect(20, 7, 3, 17, P.red, 0)}</>),
  'ribbon-button-chart-treemap': <>{rect(4, 4, 15, 24, P.blue, 0)}{rect(21, 4, 7, 9, P.orange, 0)}{rect(21, 15, 7, 13, P.green, 0)}</>,
  'ribbon-button-chart-funnel': <>{path('M3 5h26l-5 6H8z', P.blue)}{path('M8 13h16l-4 6h-8z', P.orange)}{path('M12 21h8l-3 6h-2z', P.green)}</>,
  'ribbon-button-chart-line': chartFrame(<>{line('M9 20l5-9 5 5 7-9', P.blue, 2)}{line('M9 14l5 5 5-7 7 8', P.orange, 2)}</>),
  'ribbon-button-chart-pie': <>{circle(16, 17, 12, P.blue)}{path('M16 17V5a12 12 0 0 1 12 12z', P.orange)}{path('M16 17h12a12 12 0 0 1-6 10.4z', P.green)}{line('M16 5v12l6 10.4M16 17h12', P.white, 1)}</>,
  'ribbon-button-chart-combo': chartFrame(<>{rect(9, 16, 4, 8, P.blue, 0)}{rect(16, 12, 4, 12, P.paleBlue, 0)}{rect(23, 7, 4, 17, P.blue, 0)}{line('M8 15l7-7 6 8 7-5', P.orange, 2)}</>),
  'ribbon-button-chart-scatter': chartFrame(<>{dot(10, 19, 2, P.blue)}{dot(14, 14, 2, P.blue)}{dot(23, 10, 2, P.blue)}{dot(18, 20, 2, P.orange)}{dot(25, 16, 2, P.orange)}</>),
  'ribbon-button-sparklines': <>{rect(3, 5, 26, 22, P.white, 1, P.gray)}{line('M6 22l5-9 5 6 4-10 6 6', P.blue, 2)}{dot(11, 13, 2, P.orange)}{dot(20, 9, 2, P.green)}</>,
  'ribbon-button-margins': pageFrame(<>{rect(11, 7, 10, 18, P.paleBlue, 0, P.blue)}{hair('M13 11h6M13 15h6M13 19h4', P.gray, 1)}</>),
  'ribbon-button-paper-size': pageFrame(<>{hair('M11 9h10M11 13h10M11 17h7', P.gray, 1.5)}{g('M7 5v22M4 8l3-3 3 3M4 24l3 3 3-3', P.blue, 1.8)}{g('M9 5h14M12 2l-3 3 3 3M20 2l3 3-3 3', P.blue, 1.8)}</>),
  'ribbon-button-print-area': <>{rect(5, 3, 16, 22, P.white, 1, P.gray)}{g('M3 22h9v6H3z', P.blue, 1.6)}{rect(4, 20, 10, 3, P.paleGray, 0.5, P.gray)}{dot(11.5, 24.5, 1, P.blue)}{g('M17 25l3 2 1-2', P.gray, 1.4)}</>,
  'ribbon-button-breaks': <>
    {hair('M5.3 0V10.7H25.3V0', P.gray, 1.6)}
    <path d="M1.3 14.7H30.7" fill="none" stroke={P.midBlue} strokeWidth={1.6} strokeDasharray="4.4 2.2" strokeLinecap="butt" />
    {hair('M5.3 30.7V20H25.3V30.7', P.gray, 1.6)}
  </>,
  'ribbon-button-focuscell': <>{rect(11, 4, 10, 10, P.lightBlue, 0, P.blue)}{rect(11, 18, 10, 10, P.lightBlue, 0, P.blue)}{rect(4, 11, 10, 10, P.lightBlue, 0, P.blue)}{rect(18, 11, 10, 10, P.lightBlue, 0, P.blue)}{rect(11, 11, 10, 10, P.white, 0, P.blue)}</>,
  'ribbon-button-focuscellcolor': <>{path('M16 4c7.2 0 12.5 4.6 12.5 10.6 0 3.8-2.6 6.2-5.8 6.2h-2.4c-1.8 0-3 1.2-3 2.6 0 .8.3 1.3.8 1.9.5.6.8 1.2.8 2 0 1.5-1.2 2.7-3 2.7C9.4 30 4 24.6 4 17 4 9.8 9.4 4 16 4Z', P.paleYellow, P.gray, 1.5)}{dot(10, 10.5, 1.8, '#e65249')}{dot(16, 8.5, 1.8, '#ffca00')}{dot(21.5, 10.5, 1.8, '#45ba6f')}{dot(8, 16, 1.8, '#367fc9')}{g('M23 20l6.5 6.5-2 2-6.5-6.5z', '#367fc9')}{path('M27.5 26.5 31 31l-4.5-1z', P.gray)}</>,
  /* --- Number-format gallery icons (combo dropdown) ---------------------- */
  // Trial: the "Bottom Border" dropdown glyph (dashed grey 3x3 grid, solid blue bottom edge).
  'ribbon-button-border': <>{bGrid([27])}{bEdge('M4 27h26')}</>,
  'ribbon-button-page-portrait': <>{rect(10, 5, 13, 22, P.white, 1, P.dark)}</>,
  'ribbon-button-page-landscape': <>{rect(6, 10, 22, 13, P.white, 1, P.dark)}</>,
  'ribbon-button-page-orientation': <>{rect(5, 6, 12, 17, P.white, 1, P.dark)}{rect(14, 13, 14, 10, P.white, 1, P.dark)}</>,
  // Cells-group dropdown lists (TASK 51): every official item carries a coloured glyph.
  'ribbon-button-insert-cells': <>{rect(5, 5, 10, 10, P.white, 0.5, P.blue)}{rect(17, 17, 10, 10, P.white, 0.5, P.blue)}{hair('M15 10h4M10 15v4', P.midBlue, 1.4)}{g('M20 6v8M17 11l3 3 3-3', P.green, 2)}{g('M6 20h8M11 17l3 3-3 3', P.blue, 2)}</>,
  'ribbon-button-delete-cells': <>{rect(5, 5, 10, 10, P.white, 0.5, P.blue)}{rect(17, 17, 10, 10, P.white, 0.5, P.blue)}{hair('M15 10h4M10 15v4', P.midBlue, 1.4)}{g('M17 17l8 8M25 17l-8 8', P.red, 2.2)}</>,
  'ribbon-button-insert-sheet-rows': <>{rect(6, 6, 20, 5, P.white, 0.5, P.blue)}{rect(6, 21, 20, 5, P.white, 0.5, P.blue)}{rect(6, 13.5, 20, 5, P.paleBlue, 0.5, P.blue)}{g('M16 1v5M13.5 3.5l2.5 2.5 2.5-2.5', P.green, 1.8)}</>,
  'ribbon-button-insert-sheet-columns': <>{rect(6, 6, 5, 20, P.white, 0.5, P.blue)}{rect(21, 6, 5, 20, P.white, 0.5, P.blue)}{rect(13.5, 6, 5, 20, P.paleBlue, 0.5, P.blue)}{g('M1 16h5M3.5 13.5l2.5 2.5 2.5-2.5', P.green, 1.8)}</>,
  'ribbon-button-insert-sheet': <>{rect(4, 5, 19, 15, P.white, 1, P.blue)}{hair('M4 10h19M4 15h19M10 5v15M16 5v15', P.blue, 1.2)}{g('M25 21v8M21 25h8', P.green, 2.6)}</>,
  'ribbon-button-delete-sheet-rows': <>{rect(6, 6, 20, 5, P.white, 0.5, P.blue)}{rect(6, 21, 20, 5, P.white, 0.5, P.blue)}{rect(6, 13.5, 20, 5, P.paleBlue, 0.5, P.blue)}{g('M13 15.5l6 0', P.red, 2.4)}</>,
  'ribbon-button-delete-sheet-columns': <>{rect(6, 6, 5, 20, P.white, 0.5, P.blue)}{rect(21, 6, 5, 20, P.white, 0.5, P.blue)}{rect(13.5, 6, 5, 20, P.paleBlue, 0.5, P.blue)}{g('M15.5 13v6', P.red, 2.4)}</>,
  'ribbon-button-delete-sheet': <>{rect(4, 5, 19, 15, P.white, 1, P.blue)}{hair('M4 10h19M4 15h19M10 5v15M16 5v15', P.blue, 1.2)}{g('M21 21l8 8M29 21l-8 8', P.red, 2.4)}</>,
  'ribbon-button-row-height': <>{rect(9, 5, 18, 6, P.white, 0.5, P.blue)}{rect(9, 21, 18, 6, P.white, 0.5, P.blue)}{g('M4 8v16M1 11l3-3 3 3M1 21l3 3 3-3', P.orange, 1.8)}</>,
  'ribbon-button-column-width': <>{rect(5, 9, 6, 18, P.white, 0.5, P.blue)}{rect(21, 9, 6, 18, P.white, 0.5, P.blue)}{g('M8 16h16M11 13l-3 3 3 3M21 13l3 3-3 3', P.blue, 1.8)}</>,
  'ribbon-button-protect-sheet': <>{rect(3, 13, 17, 14, P.white, 1, P.blue)}{hair('M3 18h17M3 23h17M9 13v14', P.blue, 1.1)}{path('M23 22v-3a4 4 0 0 1 8 0v3', P.white, P.red, 2)}{rect(21, 21, 12, 9, P.red, 1.5)}</>,
  'ribbon-button-unlock-cells': <>{path('M9 16v-4a5 5 0 0 1 10 0', P.white, P.dark, 2.2)}{rect(6, 16, 15, 12, P.dark, 1.5)}</>,
  'context-transform-cells': <>{rect(4, 6, 14, 14, P.white, 1, P.blue)}{hair('M11 6v14M4 13h14', P.lightBlue, 1.2)}{g('M21 9h6M24 6l3 3-3 3', P.green, 1.6)}{g('M27 20h-6M24 17l-3 3 3 3', P.green, 1.6)}{rect(12, 18, 10, 8, P.white, 1, P.blue)}</>,
  'context-table-totals': <>{rect(5, 6, 22, 20, P.white, 1, P.gray)}{hair('M5 13h22M5 19h22M12.5 6v20M19.5 6v20', P.lightGray, 1.2)}{rect(5, 19, 22, 7, P.paleBlue, 0, P.blue)}</>,
  'context-convert-range': <>{rect(5, 6, 16, 16, P.paleBlue, 1, P.blue)}{hair('M13 6v16M5 14h16', P.blue, 1)}{g('M24 12v14M20 22l4 4 4-4', P.green, 2)}</>,
  'context-convert-datatable': <>{rect(8, 5, 20, 18, P.white, 1, P.gray)}{rect(8, 5, 20, 5, P.midBlue)}{hair('M15 5v18M22 5v18M8 16h20', P.lightGray, 1.2)}{path('M4 16 10 22l-6 0z', 'none', P.green, 1.6)}</>,
  'context-insert-columns-left': <>{rect(4, 7, 6, 18, P.lightBlue, 0.5, P.blue)}{rect(14, 7, 14, 18, P.white, 0.5, P.gray)}{hair('M21 7v18', P.lightGray, 1)}{g('M10 16h2M11 11v10', P.orange, 1.8)}</>,
  'context-insert-columns-right': <>{rect(14, 7, 6, 18, P.lightBlue, 0.5, P.blue)}{rect(4, 7, 14, 18, P.white, 0.5, P.gray)}{hair('M11 7v18', P.lightGray, 1)}{g('M21 16h2M22 11v10', P.orange, 1.8)}</>,
  'context-insert-rows-above': <>{rect(6, 4, 20, 6, P.lightBlue, 0.5, P.blue)}{rect(6, 14, 20, 14, P.white, 0.5, P.gray)}{hair('M6 21h20', P.lightGray, 1)}{g('M16 10v2M11 11h10', P.orange, 1.8)}</>,
  'context-insert-rows-below': <>{rect(6, 22, 20, 6, P.lightBlue, 0.5, P.blue)}{rect(6, 4, 20, 14, P.white, 0.5, P.gray)}{hair('M6 11h20', P.lightGray, 1)}{g('M16 18v2M11 19h10', P.orange, 1.8)}</>,
  'context-delete-columns': <>{rect(4, 7, 10, 18, P.white, 0.5, P.gray)}{rect(18, 7, 10, 18, P.white, 0.5, P.gray)}{rect(14, 7, 4, 18, P.paleRed, 0, P.red)}</>,
  'context-delete-rows': <>{rect(6, 4, 20, 10, P.white, 0.5, P.gray)}{rect(6, 18, 20, 10, P.white, 0.5, P.gray)}{rect(6, 14, 20, 4, P.paleRed, 0, P.red)}</>,
  'number-format-general': <><g transform="translate(10 1) scale(0.5)">{g(GL.one, P.dark, 4)}</g><g transform="translate(2 13) scale(0.42)">{g('M2 20h12', P.dark, 3)}</g><g transform="translate(2 19) scale(0.42)">{g('M2 20h8', P.dark, 3)}</g>{oval(24, 21, 2, 2.4, P.blue, 1.4)}{oval(26.5, 25, 2, 2.4, P.blue, 1.4)}{oval(22.5, 25, 2, 2.4, P.blue, 1.4)}</>,
  'number-format-number': <><g transform="translate(1 8) scale(0.7)">{g(GL.one, P.gray, 4)}</g><g transform="translate(10 8) scale(0.7)">{g(GL.two, P.gray, 4)}</g>{dot(24, 25, 1.6, P.gray)}</>,
  'number-format-currency': <>{rect(4, 9, 24, 15, P.paleYellow, 1.5, P.gold)}{g('M12 12c-1-1-2.2-1.6-3.6-1.6-2 0-3.4 1.2-3.4 2.8 0 3.3 6.8 2 6.8 6 0 1.9-1.7 3.2-4 3.2-1.6 0-3-.6-4-1.6', P.green, 1.6)}{line('M9 9v13', P.green, 1.4)}{dot(24, 16.5, 2.6, P.midBlue)}</>,
  'number-format-accounting': <>{rect(4, 6, 24, 20, P.white, 1.5, P.gray)}{rect(4, 6, 24, 5, P.midBlue)}{g('M12 16c-1-1-2.2-1.5-3.6-1.5-2 0-3.3 1.1-3.3 2.7 0 3.1 6.6 1.9 6.6 5.7 0 1.8-1.6 3-3.9 3-1.6 0-3-.6-4-1.5', P.blue, 1.6)}{line('M9 13.5v13', P.blue, 1.3)}{hair('M16 26h10', P.gray, 1.4)}</>,
  'number-format-shortdate': <>{rect(5, 7, 22, 20, P.white, 1.5, P.gray)}{rect(5, 7, 22, 5, P.midBlue)}{hair('M9 16h4M9 21h4M16 16h4M16 21h4', P.gray, 1.6)}</>,
  'number-format-longdate': <>{rect(5, 7, 22, 20, P.white, 1.5, P.gray)}{rect(5, 7, 22, 5, P.blue)}{g('M10 4v6M22 4v6', P.gray, 1.6)}{hair('M9 17h14M9 22h9', P.gray, 1.6)}</>,
  'number-format-time': <>{circle(16, 17, 10, P.white, P.gray, 1.8)}{line('M16 17v-6M16 17l5 3', P.blue, 2)}</>,
  'number-format-percentage': <>{g('M7 24 25 8', P.blue, 2.4)}{oval(10, 11, 3.4, 4, P.blue, 1.8)}{oval(22, 21, 3.4, 4, P.blue, 1.8)}</>,
  'number-format-fraction': <><g transform="translate(6 1) scale(0.5)">{g(GL.one, P.gray, 4)}</g>{line('M6 26 26 6', P.gray, 2)}<g transform="translate(15 13) scale(0.52)">{g(GL.two, P.gray, 4)}</g></>,
  'number-format-scientific': <><g transform="translate(1 10) scale(0.66)">{g(GL.one, P.gray, 4)}</g><g transform="translate(9 10) scale(0.66)">{oval(8, 12, 4.5, 6.5, P.gray, 4)}</g><g transform="translate(18 4) scale(0.34)">{g('M2 14l11 12M13 14 2 26', P.gray, 6)}</g></>,
  'number-format-text': <>{oval(9, 21.5, 4.2, 4.6, P.gray, 1.8)}{line('M13.2 17v9.5', P.gray, 1.8)}{line('M19 9.5v17', P.gray, 1.8)}{oval(22.5, 22, 3.8, 4.4, P.gray, 1.8)}</>,
  /* --- Conditional Formatting menu (TASK 55; weight pass 3, TASK 57): every row carries a
     table motif filling the 24px box like the trial's (grid ~19-20px, frame 1.5px-classic,
     solid accent blocks #367fc9/#f5c400/#e8663c measured from the trial menu raster). --- */
  // 3x3 gray grid, centre cell highlighted yellow, "$" tag card bottom-right.
  'ribbon-button-highlightcellsrules': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={11.3} width={8.6} height={8.4} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.8}/><rect x={20.8} y={20.8} width={10.4} height={10.4} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/>{g('M27.7 23.4l-4.5 2.7 4.5 2.7M22.8 30.2h5.2', '#4a4a4a', 1.7)}</>,
  // 3x3 grid with the middle column banded yellow and a dark up-arrow, "10" tag card.
  'ribbon-button-topbottomrules': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={3} width={8.6} height={25} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.7}/>{g('M16 21.5V10.2m-3.7 3.7L16 8.3l3.7 5.6', '#4a4a4a', 1.9)}<rect x={20.8} y={20.8} width={10.4} height={10.4} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/>{g('M23.9 24.4v6.4M22.7 25.5l1.2-1.1', '#9e9e9e', 1.5)}<ellipse cx={28.3} cy={27.7} rx={1.8} ry={3.1} fill="none" stroke="#9e9e9e" strokeWidth={1.5}/></>,
  // 3x3 grid with three solid blue bars of varying length in the middle column (data bars).
  'ribbon-button-databars': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#a8a8a8" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#d6d6d6', 1.7)}<rect x={12.3} y={4.3} width={7.4} height={6.1} fill={P.blue}/><rect x={12.3} y={12.6} width={12.2} height={6.1} fill={P.blue}/><rect x={12.3} y={20.9} width={4.4} height={6.1} fill={P.blue}/></>,
  // 3x3 grid with the middle cell of each row filled blue / yellow / orange (color scale ramp).
  'ribbon-button-colorscales': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#a8a8a8" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#d6d6d6', 1.7)}<rect x={12.3} y={4.3} width={7.4} height={6.1} fill={P.blue}/><rect x={12.3} y={12.6} width={7.4} height={6.1} fill="#ffd000"/><rect x={12.3} y={20.9} width={7.4} height={6.1} fill="#f2704d"/></>,
  // 3-row list grid; centre cell holds a coloured square cluster (2x2 blue, 3x3 gold, 3x3 red), right column a grey dash.
  'ribbon-button-iconsets': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#8f8f8f" strokeWidth={2.4}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#cfcfcf', 1.8)}<rect x={13.1} y={6.1} width={2.1} height={2.1} fill="#4b8bd2"/><rect x={15.6} y={6.1} width={2.1} height={2.1} fill="#4b8bd2"/><rect x={13.1} y={8.6} width={2.1} height={2.1} fill="#4b8bd2"/><rect x={15.6} y={8.6} width={2.1} height={2.1} fill="#4b8bd2"/><rect x={13.1} y={14.1} width={1.6} height={1.6} fill="#f5c400"/><rect x={15} y={14.1} width={1.6} height={1.6} fill="#f5c400"/><rect x={16.9} y={14.1} width={1.6} height={1.6} fill="#f5c400"/><rect x={13.1} y={16} width={1.6} height={1.6} fill="#f5c400"/><rect x={15} y={16} width={1.6} height={1.6} fill="#f5c400"/><rect x={16.9} y={16} width={1.6} height={1.6} fill="#f5c400"/><rect x={13.1} y={17.9} width={1.6} height={1.6} fill="#f5c400"/><rect x={15} y={17.9} width={1.6} height={1.6} fill="#f5c400"/><rect x={16.9} y={17.9} width={1.6} height={1.6} fill="#f5c400"/><rect x={13.1} y={22.5} width={1.6} height={1.6} fill="#e8663c"/><rect x={15} y={22.5} width={1.6} height={1.6} fill="#e8663c"/><rect x={16.9} y={22.5} width={1.6} height={1.6} fill="#e8663c"/><rect x={13.1} y={24.4} width={1.6} height={1.6} fill="#e8663c"/><rect x={15} y={24.4} width={1.6} height={1.6} fill="#e8663c"/><rect x={16.9} y={24.4} width={1.6} height={1.6} fill="#e8663c"/><rect x={13.1} y={26.3} width={1.6} height={1.6} fill="#e8663c"/><rect x={15} y={26.3} width={1.6} height={1.6} fill="#e8663c"/><rect x={16.9} y={26.3} width={1.6} height={1.6} fill="#e8663c"/><rect x={21.4} y={7} width={5} height={2} fill="#7d7d7d"/><rect x={21.4} y={15.5} width={5} height={2} fill="#7d7d7d"/><rect x={21.4} y={24} width={5} height={2} fill="#7d7d7d"/></>,
  // Thick-framed grid, one yellow centre cell (new rule).
  'ribbon-button-newrule': <><rect x={4} y={5.5} width={25} height={21} fill={P.white} stroke="#6e6e6e" strokeWidth={2.6}/>{hair('M12.33 5.5v21M20.67 5.5v21M4 12.5h25M4 19.5h25', '#b5b5b5', 2)}<rect x={12.33} y={12.5} width={8.34} height={7} fill="#fff3c4" stroke="#f5c400" strokeWidth={2.4}/></>,
  // New-rule grid with its lower-right corner open and red eraser flecks (clear rules).
  'ribbon-button-clearrules': <><rect x={4} y={5.5} width={25} height={21} fill={P.white}/>{g('M29 19.5V5.5H4v21h9', '#6e6e6e', 2.6)}{hair('M12.33 5.5v21M20.67 5.5v14M4 12.5h25M4 19.5h25', '#b5b5b5', 2)}<rect x={12.33} y={12.5} width={8.34} height={7} fill="#fff3c4" stroke="#f5c400" strokeWidth={2.4}/><g fill="#ef9d92"><rect x={22.7} y={22.7} width={2.6} height={2.6}/><rect x={25.6} y={25.6} width={2.6} height={2.6}/><rect x={28.5} y={22.7} width={2.6} height={2.6}/><rect x={25.6} y={19.8} width={2.6} height={2.6} fill="#f7c5c0"/></g></>,
  // Two stacked grids (rule manager), front one with the yellow centre cell.
  'ribbon-button-managerules': <><path d="M6 11.5V5h19v2.5H8.5v4z" fill="#5f5f5f"/><rect x={7} y={7.5} width={22} height={19} fill={P.white} stroke="#6e6e6e" strokeWidth={2.6}/>{hair('M14.33 7.5v19M21.67 7.5v19M7 13.83h22M7 20.17h22', '#b5b5b5', 2)}<rect x={14.33} y={13.83} width={7.34} height={6.34} fill="#fff3c4" stroke="#f5c400" strokeWidth={2.4}/></>,
  /* Highlight-Cells submenu family (TASK 57): grid + yellow centre + per-rule badge, as the
     trial distinguishes Greater/Less/Between/Equal/Text/Date/Duplicate rows. */
  'ribbon-button-hcr-greater': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={12.2} width={8.6} height={8.2} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.8}/><rect x={20.6} y={20.6} width={10.6} height={10.6} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/>{g('M24.4 23.8l3.8 2.6-3.8 2.6', '#454545', 1.7)}</>,
  'ribbon-button-hcr-less': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={12.2} width={8.6} height={8.2} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.8}/><rect x={20.6} y={20.6} width={10.6} height={10.6} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/>{g('M28.6 23.8l-3.8 2.6 3.8 2.6', '#454545', 1.7)}</>,
  'ribbon-button-hcr-between': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={12.2} width={8.6} height={8.2} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.8}/><rect x={4.4} y={4.4} width={6.7} height={6.3} fill="#5b9bd5"/><rect x={21} y={4.4} width={6.7} height={6.3} fill="#5b9bd5"/></>,
  'ribbon-button-hcr-equal': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={12.2} width={8.6} height={8.2} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.8}/><rect x={20.6} y={20.6} width={10.6} height={10.6} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/><rect x={23.2} y={24.3} width={5.4} height={1.8} fill="#454545"/><rect x={23.2} y={27.6} width={5.4} height={1.8} fill="#454545"/></>,
  'ribbon-button-hcr-text': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={12.2} width={8.6} height={8.2} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.8}/><rect x={20.6} y={20.6} width={10.6} height={10.6} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/>{g('M29.2 24.6v5.9M29.2 26.5c-.6-.9-1.7-1.3-2.6-.8-1.4.7-1.5 3.1-.1 3.8 1 .5 2.1 0 2.7-1.1', '#454545', 1.5)}</>,
  'ribbon-button-hcr-date': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={12.2} width={8.6} height={8.2} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.8}/><rect x={21.4} y={22.6} width={9.2} height={8} fill={P.white} stroke="#6f6f6e" strokeWidth={1.4}/>{g('M21.4 25h9.2', '#6f6f6e', 1.4)}<rect x={23.4} y={20.8} width={1.4} height={2.4} fill="#6f6f6e"/><rect x={27.2} y={20.8} width={1.4} height={2.4} fill="#6f6f6e"/></>,
  'ribbon-button-hcr-duplicate': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.9} y={4.4} width={8.2} height={6.3} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.6}/><rect x={11.9} y={20.9} width={8.2} height={6.3} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.6}/></>,
  /* Top/Bottom submenu family: yellow column + direction arrow + "10" / "%" / "x̄" badge. */
  'ribbon-button-tbr-top10': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={3} width={8.6} height={25} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.7}/>{g('M16 21.5V10.2m-3.7 3.7L16 8.3l3.7 5.6', '#4a4a4a', 1.9)}<rect x={20.6} y={20.6} width={10.6} height={10.6} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/>{g('M23.9 24.4v6.4M22.7 25.5l1.2-1.1', '#9e9e9e', 1.5)}<ellipse cx={28.3} cy={27.7} rx={1.8} ry={3.1} fill="none" stroke="#9e9e9e" strokeWidth={1.5}/></>,
  'ribbon-button-tbr-top10percent': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={3} width={8.6} height={25} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.7}/>{g('M16 21.5V10.2m-3.7 3.7L16 8.3l3.7 5.6', '#4a4a4a', 1.9)}<rect x={20.6} y={20.6} width={10.6} height={10.6} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/>{g('M23.4 29.4l5.2-6.8', '#6f6f6f', 1.3)}<ellipse cx={24.5} cy={24.4} rx={1} ry={1.3} fill="none" stroke="#6f6f6f" strokeWidth={1.2}/><ellipse cx={28.1} cy={27.9} rx={1} ry={1.3} fill="none" stroke="#6f6f6f" strokeWidth={1.2}/></>,
  'ribbon-button-tbr-bottom10': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={3} width={8.6} height={25} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.7}/>{g('M16 8.5V19.8m-3.7-3.7L16 21.7l3.7-5.6', '#4a4a4a', 1.9)}<rect x={20.6} y={20.6} width={10.6} height={10.6} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/>{g('M23.9 24.4v6.4M22.7 25.5l1.2-1.1', '#9e9e9e', 1.5)}<ellipse cx={28.3} cy={27.7} rx={1.8} ry={3.1} fill="none" stroke="#9e9e9e" strokeWidth={1.5}/></>,
  'ribbon-button-tbr-bottom10percent': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={3} width={8.6} height={25} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.7}/>{g('M16 8.5V19.8m-3.7-3.7L16 21.7l3.7-5.6', '#4a4a4a', 1.9)}<rect x={20.6} y={20.6} width={10.6} height={10.6} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/>{g('M23.4 29.4l5.2-6.8', '#6f6f6f', 1.3)}<ellipse cx={24.5} cy={24.4} rx={1} ry={1.3} fill="none" stroke="#6f6f6f" strokeWidth={1.2}/><ellipse cx={28.1} cy={27.9} rx={1} ry={1.3} fill="none" stroke="#6f6f6f" strokeWidth={1.2}/></>,
  'ribbon-button-tbr-aboveaverage': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={3} width={8.6} height={25} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.7}/>{g('M16 21.5V10.2m-3.7 3.7L16 8.3l3.7 5.6', '#4a4a4a', 1.9)}<rect x={20.6} y={20.6} width={10.6} height={10.6} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/>{g('M23.7 25.9l4.4 4.4M28.1 25.9l-4.4 4.4', '#6f6f6f', 1.4)}{g('M23.4 24.2h5', '#6f6f6f', 1.3)}</>,
  'ribbon-button-tbr-belowaverage': <><rect x={3} y={3} width={26} height={25} fill={P.white} stroke="#b0b0b0" strokeWidth={2.2}/>{hair('M11.7 3v25M20.3 3v25M3 11.3h26M3 19.7h26', '#dadada', 1.7)}<rect x={11.7} y={3} width={8.6} height={25} fill="#fff0b8" stroke="#f2c230" strokeWidth={1.7}/>{g('M16 8.5V19.8m-3.7-3.7L16 21.7l3.7-5.6', '#4a4a4a', 1.9)}<rect x={20.6} y={20.6} width={10.6} height={10.6} fill={P.white} stroke="#8f8f8f" strokeWidth={1.5}/>{g('M23.7 25.9l4.4 4.4M28.1 25.9l-4.4 4.4', '#6f6f6f', 1.4)}{g('M23.4 24.2h5', '#6f6f6f', 1.3)}</>,
};

icons['ribbon-thumbnail-undoredo'] = <>{g('M21 9.5H14a7 7 0 0 0 0 14h11.5', P.gray, 2.8)}{path('M17.5 4.5 11.5 9.5l6 5.2', P.gray)}{g('M15 16h8a5 5 0 0 1 0 10h-4', P.lightGray, 2.4)}</>;
icons['ribbon-thumbnail-chart-alt-text'] = icons['ribbon-button-chart'];

/* ================================================================================
 * TASK 69 — re-cut of every non-Home tab icon family from the DPR4 pair re-shoot
 * (.probe/t69/list.txt + sheet-<tab>.png). All geometry hand-drawn here; colours
 * are our own palette values chosen by looking at the reference pairs.
 * Common motif vocabulary learned from the trial:
 *  - "document" glyphs: thin dark frame (~2.2u), folded lower-left corner, pale rules;
 *  - settings family: document + LARGE medium-blue gear with white hub;
 *  - chart previews: grey axis 'L', grey + pale-blue data marks (no frame box);
 *  - function family: thin book with bottom-left fold and a centred coloured symbol;
 *  - comment bubbles: thin sharp bubble with the accent straddling its top-left corner.
 * ================================================================================ */
const T69 = {
  ink: '#666666', mid: '#7f7f7f', soft: '#a6a6a6', rule: '#bbbbbb', faint: '#e2e2e2',
  blue: '#367fc9', midBlue: '#81befc', paleBlue: '#b3d7fd', faintBlue: '#d4e9fe', deep: '#367fc9',
  orange: '#ee8815', red: '#d9534a', redSoft: '#e0704a', green: '#45ba6f', greenDark: '#2e7d42',
  yellow: '#ffd95d', paleYellow: '#f8dfa0', gold: '#d19d00', graphite: '#4a4a4a', silver: '#bbbbbb', white: '#ffffff',
  gearBlue: '#4472c4',
};
/** The reference's action blue used by solid gears/accents (TASK 69). */
const GEARBLUE = '#367fc9';
const l69 = (d: string, stroke: string, sw = 2): React.ReactElement =>
  <path d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="butt" strokeLinejoin="miter" />;
const l69r = (d: string, stroke: string, sw = 2): React.ReactElement =>
  <path d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
/** Eight-or-more-tooth gear, white hub (Settings family). outline for the lighter 24px variant. */
const gear69 = (cx: number, cy: number, r = 8.6, fill = '#4472b8', outline?: string, ow = 1.3, teeth = 8): React.ReactElement => {
  let d = '';
  const p = (ang: number, rad: number): string => `${(Math.cos(ang) * rad).toFixed(2)} ${(Math.sin(ang) * rad).toFixed(2)}`;
  for (let i = 0; i < teeth; i += 1) {
    const step = (Math.PI * 2) / teeth;
    const a = step * i - Math.PI / 2;
    d += `${i ? 'L' : 'M'}${p(a - step * 0.3, r * 0.74)}L${p(a - step * 0.18, r)}L${p(a + step * 0.18, r)}L${p(a + step * 0.3, r * 0.74)}`;
  }
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <path d={`${d}Z`} fill={fill} stroke={outline ?? 'none'} strokeWidth={outline ? ow : 0} strokeLinejoin="round" />
      <circle r={r * 0.4} fill={T69.white} />
    </g>
  );
};
/** Thin grey axis 'L' for chart-preview glyphs. */
const axis69 = (): React.ReactElement => l69('M7 5V27H29', T69.soft, 1.8);
/* Thin outlined comment bubble (sharp corners) with a lower-left tail spike; r4 pair re-measure:
   outer x3.5..20.5 y6.5..22.5, tail tip ≈(6.5,27). */
const bubble69 = (line: string): React.ReactElement => (
  <path d="M3.5 6.5H20.5V22.5H10.5L6.5 27V22.5H3.5Z" fill={T69.white} stroke={line} strokeWidth={1.3} strokeLinejoin="miter" />
);
/* Data group family (16px, measured r3): table right-flush outer x16.5..31.2 with 1.9u #666 frame,
   1.7u rules between bar rows at y11/21; bars h2.2 centred in the rows (x20.5 w8). Arms: a 1.9u
   vertical at x9.5 with a short bar to x14.3 at the far end. Medallion: a 12×12 box with 2u frame
   holding a concave four-point #333 star (tips ±4.1, waist ±1.35) with a 2.7u white centre square;
   SUBTOTAL's lower box is a plain solid diamond; UNGROUP drops the medallion and shows a red
   (#e65249) box with a red '/' slash. */
const outlineTable69 = (bars: string[], barY: number[], rules = [10, 20]): React.ReactElement => (
  <>
    <rect x={17.5} y={1.2} width={13.4} height={30.2} fill={T69.white} stroke={T69.ink} strokeWidth={1.65} />
    {l69(`M18.5 ${rules[0]}H30.5M18.5 ${rules[1]}H30.5`, T69.ink, 1.6)}
    {bars.map((c, i) => <rect key={i} x={20.5} y={barY[i]} width={8} height={2.2} fill={c} />)}
  </>
);
const groupArms69 = (): React.ReactElement => l69('M9.5 10.5V1.5H14.3M9.5 21.5V30.5H14.3', T69.ink, 1.9);
const diamondBox69 = (x: number, y: number, hollow = true): React.ReactElement => {
  const cx = x + 6; const cy = y + 6;
  return (
    <>
      <rect x={x} y={y} width={12} height={12} fill={T69.white} stroke={T69.ink} strokeWidth={2} />
      {hollow
        ? <>
          <path d={`M${cx} ${cy - 4.1}L${cx + 1.35} ${cy - 1.35}L${cx + 4.1} ${cy}L${cx + 1.35} ${cy + 1.35}L${cx} ${cy + 4.1}L${cx - 1.35} ${cy + 1.35}L${cx - 4.1} ${cy}L${cx - 1.35} ${cy - 1.35}Z`} fill="#333333" />
          <rect x={cx - 1.35} y={cy - 1.35} width={2.7} height={2.7} fill={T69.white} />
        </>
        : <path d={`M${cx} ${y + 1}L${x + 11} ${cy}L${cx} ${y + 11}L${x + 1} ${cy}Z`} fill="#333333" />}
    </>
  );
};
/* Review family accents: thin corner-straddling marks (measured from the DPR4 crops); the green +
   of NEW is small (~8.5u arms, 2u) centred on the bubble's top-left corner. */
icons['ribbon-button-review-newThreadedComment'] = <>{bubble69(T69.ink)}{l69('M8 0.6V12.8M1.2 7.6H13.8', T69.green, 2)}</>;
icons['ribbon-button-review-deleteThreadedComment'] = <>{bubble69('#b1b1b1')}{l69('M3 0.5L11.5 9M11.5 0.5L3 9', '#fcb99f', 2.2)}</>;
icons['ribbon-button-review-previousThreadedComment'] = <>{bubble69('#b1b1b1')}{l69('M16 6H2.5', '#99bee3', 2.2)}<path d="M8 1.5L2.5 6 8 10.5" fill="none" stroke="#99bee3" strokeWidth={1.54} strokeLinejoin="miter" /></>;
icons['ribbon-button-review-nextThreadedComment'] = <>{bubble69('#b1b1b1')}{l69('M3 6H13', '#99bee3', 2.2)}<path d="M9.5 1.5L15 6 9.5 10.5" fill="none" stroke="#99bee3" strokeWidth={1.54} strokeLinejoin="miter" /></>;
icons['ribbon-button-review-showThreadedComments'] = bubble69(T69.ink);

/* --- View tab --------------------------------------------------------------------------
   TASK 69 r3 measured via .probe/t69/bands.py on DPR4 crops: freeze docs (24px): ink
   frame 1.35u at (2.8,3.2)-(29.8,23.2) with peel foot (left frame to y27.2, tab bottom,
   diagonal back at x14.5, extra 23.2 line above the tab); grid rules #bbb 1.35u at
   x11.8/20.8 x y8.2/13.2/18.2; the selected cell is exactly col2 x row2 (11.8..20.8 x
   8.2..13.2), fill #81befc, border #367fc9 1.7u. viewportFreeze darkens the two split
   rules and hatches only the frozen bands (row1 full width + col1); unFreeze hatches
   the whole sheet; 45° hatch lines pitch ~6.5u, #81befc 1.7u. */
const freezeDoc69 = (): React.ReactElement => (
  <>
    <path d="M2.8 27.2V3.2H29.8V23.2H14.5L11 27.2Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.35} strokeLinejoin="miter" />
    {l69('M2.8 23.2H11', T69.ink, 1.35)}
  </>
);
const freezeCell69 = (): React.ReactElement => (
  <rect x={11.8} y={8.2} width={9} height={5} fill={T69.midBlue} stroke={T69.blue} strokeWidth={1.4} />
);
const hatchLines69 = (cs: number[]): React.ReactElement => (
  <>{cs.map((c) => l69(`M${Math.max(2.8, c - 23.2).toFixed(1)} ${Math.min(23.2, c - 2.8).toFixed(1)}L${Math.min(29.8, c - 3.2).toFixed(1)} ${Math.max(3.2, c - 29.8).toFixed(1)}`, '#9dc7f0', 1.4))}</>
);
icons['ribbon-button-freezepane'] = <>
  {freezeDoc69()}
  {l69('M20.8 3.2V23.2M13.2 2.8H29.8M18.2 2.8H29.8', T69.silver, 1.35)}
  {l69('M11.8 3.2V23.2M8.2 2.8H29.8', '#333333', 1.5)}
  <clipPath id="t69-vf-clip"><path d="M2.8 3.2H29.8V8.2H11.8V23.2H2.8Z" /></clipPath>
  <g clipPath="url(#t69-vf-clip)">{hatchLines69([8.7, 15.2, 21.7, 28.2, 34.7])}</g>
  {freezeCell69()}
</>;
icons['ribbon-button-unfreezepane'] = <>
  {freezeDoc69()}
  {l69('M11.8 3.2V23.2M20.8 3.2V23.2M8.2 2.8H29.8M13.2 2.8H29.8M18.2 2.8H29.8', T69.silver, 1.35)}
  <clipPath id="t69-uf-clip"><path d="M2.8 3.2H29.8V23.2H2.8Z" /></clipPath>
  <g clipPath="url(#t69-uf-clip)">{hatchLines69([7, 13.5, 20, 26.5, 33, 39.5, 46, 52.5])}</g>
  {freezeCell69()}
</>;
icons['ribbon-button-zoomtoselection'] = <>
  <path d="M1.8 29.5V3.2H29.8V26.3H14L10.5 29.5Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.35} strokeLinejoin="miter" />
  {l69('M1.8 26.3H10.5', T69.ink, 1.35)}
  {l69('M8.8 3.2V26.3M15.8 3.2V26.3M22.8 3.2V26.3', T69.silver, 1.35)}
  {l69('M1.8 8.2H29.8M1.8 13.2H29.8M1.8 18.2H29.8', T69.silver, 1.35)}
  <rect x={8.8} y={8.2} width={7} height={5} fill={T69.midBlue} />
  <rect x={15.8} y={8.2} width={7} height={5} fill={T69.paleBlue} />
  <rect x={8.8} y={13.2} width={7} height={5} fill={T69.paleBlue} />
  <rect x={15.8} y={13.2} width={7} height={5} fill={T69.midBlue} />
  {l69('M8.8 8.2H22.8V18.2H8.8ZM15.8 8.2V18.2M8.8 13.2H22.8', T69.blue, 1.3)}
  <circle cx={24.8} cy={22.8} r={6.2} fill={T69.white} stroke="#4a80c8" strokeWidth={1.8} />
  {l69('M29.5 27.2L32 29.7', '#4a80c8', 1.9)}
</>;
icons['ribbon-button-zoom'] = <>
  <circle cx={12.5} cy={12.5} r={8.5} fill="none" stroke="#5b96cf" strokeWidth={1.68} />
  {l69('M19 19L27.5 27.5', '#5b96cf', 3)}
</>;
icons['ribbon-button-zoomdefault'] = <>
  <path d="M3.8 26.2V3.2H14.5L20.8 9.5V26.2Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.4} strokeLinejoin="miter" />
  {l69('M14.5 3.2V9.5H20.8', T69.ink, 1.3)}
  <path d="M21.5 3.2H28.8M28.8 3.2V16.5" fill="none" stroke={T69.mid} strokeWidth={1.6} strokeDasharray="1.7 2.1" strokeLinecap="butt" />
  {l69('M17.5 14.2H24.6', GEARBLUE, 2.2)}
  <path d="M24.2 11.5L28 14.2l-3.8 2.7Z" fill={GEARBLUE} />
  <rect x={16.8} y={20.6} width={12.8} height={8.8} fill={GEARBLUE} />
  {l69('M18.8 23.9l1.5-1.1v5.6', T69.white, 1.5)}
  {l69r('M23 26.6m-1.6 0a1.6 2.4 0 1 0 3.2 0a1.6 2.4 0 1 0 -3.2 0', T69.white, 1.5)}
  {l69r('M26.6 26.6m-1.6 0a1.6 2.4 0 1 0 3.2 0a1.6 2.4 0 1 0 -3.2 0', T69.white, 1.5)}
</>;
/* focusCell (24px, measured r3): plus of five adjacent squares — mid-blue #81befc arms with thin
   #367fc9 borders meeting a white centre cell (thin #4d4d4d border) at x10.5/21.5 × y10.5/21.5. */
icons['ribbon-button-focuscell'] = <>
  <rect x={10.5} y={0.6} width={11} height={10} fill={T69.midBlue} stroke={GEARBLUE} strokeWidth={1.2} />
  <rect x={10.5} y={21.4} width={11} height={10} fill={T69.midBlue} stroke={GEARBLUE} strokeWidth={1.2} />
  <rect x={0.6} y={10.5} width={10} height={11} fill={T69.midBlue} stroke={GEARBLUE} strokeWidth={1.2} />
  <rect x={21.4} y={10.5} width={10} height={11} fill={T69.midBlue} stroke={GEARBLUE} strokeWidth={1.2} />
  <rect x={10.5} y={10.5} width={11} height={11} fill={T69.white} stroke="#4d4d4d" strokeWidth={1.2} />
</>;
/* selectionPane (View, 24px, measured r3): yellow panel (#ffd95d fill, #ee8815 frame) at the upper
   right (11.5,1.5)-(29,14.5); a thin white outlined pane lower-left (2.5,14)-(20.5,25.5); a
   black-outlined white cursor overlapping the lower-right. */
icons['gc-designer-selection-pane-ribbon'] = <>
  <rect x={12.1} y={2.1} width={16.5} height={12} fill="#ffd95d" stroke="#ee8815" strokeWidth={1.2} />
  <rect x={3.1} y={14.6} width={17} height={10.4} fill={T69.white} stroke={T69.ink} strokeWidth={1.2} />
  <path d="M16.8 12.2L17.2 26.2 20.5 23.2 23.1 28.6 25.3 27.5 22.8 22.4 28.3 22.2Z" fill={T69.white} stroke="#4d4d4d" strokeWidth={1.4} strokeLinejoin="round" />
</>;
/* commandPalette (24px, measured r3): thin #666 square (1.5,5)-(30,28.5); blue '>_' prompt (2.3u);
   a small plain magnifier (no gear) overlapping the top-right corner. */
icons['ribbon-button-command-palette'] = <>
  <rect x={2.1} y={5.6} width={27.9} height={22.9} rx={0.6} fill={T69.white} stroke={T69.ink} strokeWidth={1.2} />
  {l69('M6.8 9.8L12.8 15.8L6.8 21.8', GEARBLUE, 2.3)}
  {l69('M14.8 21.2H22.3', GEARBLUE, 2.3)}
  <circle cx={24.8} cy={6.3} r={5.3} fill={T69.white} stroke={GEARBLUE} strokeWidth={1.8} />
  {l69('M28.7 10.2L31.2 12.7', GEARBLUE, 2)}
</>;

/* --- Settings tab --------------------------------------------------------------------
   TASK 69 r3, re-measured from the DPR4 grid-viewer crops (.probe/t69/gv-settings-*.png):
   - 16px family: full-size peeled-foot document (frame bands #666 1.6u at x 1.45/30.3,
     y 2.45/26.3; foot 4..12.5 down to y29.5), #bbbbbb 1.7u rules at x11.5/21.5 x y9.5/19.5,
     and a SOLID #367fc9 gear r7.8 white hub centred at the lower-right corner ≈(24.3,24.3)
     occluding frame/rule ends; scrollbar/tabstrip gears sit a bit higher with a small chip.
   - 24px General pair: document (2.2,3.2)→(29.4,22.5) with fold step at the lower-left,
     1.45u rules at x11.2/20.2 x y8.7/13.2/18.2; lighter 10-tooth gear fill #81befc,
     outline #367fc9, hub ring + white hub at ≈(24.4,23.8). */
const doc16s69 = (): React.ReactElement => (
  <>
    <rect x={2.25} y={3.25} width={27.25} height={22.25} fill={T69.white} stroke={T69.ink} strokeWidth={2} />
    <path d="M4 25.5V29.5H9L13 25.5" fill="none" stroke={T69.ink} strokeWidth={2} strokeLinejoin="miter" />
  </>
);
const gear16s69 = (cx = 24.3, cy = 24.3, r = 7.8): React.ReactElement => (
  <>
    {gear69(cx, cy, r, GEARBLUE)}
    <circle cx={cx} cy={cy} r={r * 0.34} fill={T69.white} />
  </>
);
const doc24s69 = (): React.ReactElement => (
  <>
    <path d="M2.2 3.2H29.4V22.5H15.7L12.5 26.4H2.2Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.45} strokeLinejoin="miter" />
    {l69('M2.2 8.7H28.6M2.2 13.2H28.6M2.2 18.2H17.5', T69.silver, 1.45)}
    {l69('M11.2 3.2V21.5M20.2 3.2V17.5', T69.silver, 1.45)}
  </>
);
const gear24s69 = (): React.ReactElement => (
  <>
    {gear69(24.4, 23.8, 7, '#81befc', GEARBLUE, 1.15, 10)}
    <circle cx={24.4} cy={23.8} r={4.2} fill="none" stroke="#4a80c8" strokeWidth={1.1} />
    <circle cx={24.4} cy={23.8} r={3} fill={T69.white} />
  </>
);
icons['ribbon-button-sheetgeneral'] = <>{doc24s69()}{gear24s69()}</>;
icons['ribbon-button-gridlines'] = <>
  {doc16s69()}
  {l69('M2.25 9.5H29.5M2.25 19.5H17.5', T69.silver, 2)}
  {l69('M11.5 3.25V22.5M21.5 3.25V17', T69.silver, 2)}
  {gear16s69()}
</>;
/* sheetSettingHeaders (16px, measured r3): yellow band inset inside the frame top: (4.3,5)-(23.7,13.5)
   with the frame's top edge above it; body rules below the band only. */
icons['ribbon-button-headers'] = <>
  {doc16s69()}
  <rect x={4.3} y={5} width={19.4} height={8.5} fill="#ffca00" />
  {l69('M11.5 14.5V22.5M21.5 14.5V17M2.25 19.5H17.5', T69.silver, 2)}
  {gear16s69()}
</>;
/* spreadSettingTabStrip (16px, measured r3): frame: thick top bar y5..7 x2..25.5, left edge x2..4,
   tab divider x14..16 to y20.5, bottom bar y19.5..21.5 x2..14, right tab cell: right edge x23.5..25.5
   (y6..17.5) + its bottom bar y16.5..18.5 x16..23.5; big left arrow x7.4..12.8 (y10.2..15.8) and a
   small one x15.4..18.2 (y10.6..13.6); a big solid blue gear centred ≈(22.2,21.8) r8.3. */
icons['ribbon-button-tabstrip'] = <>
  {l69('M2 6H25.5M2 6V20.5M15 6V20.5M2 20.5H15M17 17.5H24.5M24.5 6V17.5', T69.ink, 1.9)}
  <path d="M12.8 10.2V15.8L7.4 13Z" fill={GEARBLUE} />
  <path d="M18.2 10.6V13.6L15.4 12.1Z" fill={GEARBLUE} />
  {gear16s69(22.2, 21.8, 8.3)}
</>;
icons['ribbon-button-spreadgeneral'] = <>
  {doc24s69()}
  <rect x={13.5} y={21.3} width={7} height={4} fill={T69.white} stroke={T69.ink} strokeWidth={1.35} />
  {gear24s69()}
</>;
/* spreadSettingScrollBar (16px, measured): full-height scrollbar document x5.5..16.75 × 1..28.25
   (#666 1.8u), dark divider under the arrow button at y14.3, solid blue up-triangle in the button
   (11..15.9 × 6..9.8), a small solid left-arrow chip in the trough (~10..12.6 × 19..21), and a big
   solid blue gear centred at (20.6, 23.2) r7.7 with white hub overlapping the trough's lower right. */
icons['ribbon-button-scrollbars'] = <>
  <rect x={5.5} y={1} width={11.25} height={27.25} fill={T69.white} stroke={T69.ink} strokeWidth={1.8} />
  {l69('M5.5 14.3H16.75', T69.ink, 1.7)}
  <path d="M13.4 5.9 15.9 9.8H10.9Z" fill={GEARBLUE} />
  <path d="M12.6 18.7V21.3L9.8 20Z" fill={GEARBLUE} />
  {gear16s69(20.6, 23.2, 7.7)}
</>;
icons['ribbon-button-tabstrip'] = <>
  {l69('M2 6H29.8M2 6V20M16 6V20M2 20H16M16 16.6H29.8M29.8 6V16.6', T69.ink, 1.9)}
  <path d="M12.6 11.2V15.6L7.3 13.4Z" fill={GEARBLUE} />
  <path d="M23.2 10.8V13.7L20.3 12.25Z" fill={GEARBLUE} />
  {gear16s69(24.7, 21.2, 6.9)}
</>;
/* spreadSettingCalculation (16px, measured via unit colour-maps): tall grid sheet x2..30 ×
   3.5..29.5 with a full-width grey band at y10.4, header rules x11.9/x20.9 (between frame and
   band), a body rule x11.9 down to the sheet bottom, a short grey rule y20 in the first column,
   a peeled foot (bottom edge y26.2 to x13.6, foot strip y28.4 to x10.7, fold back to 13.6) and
   a solid blue calculator flush at the lower-right (frame 2u blue 16..31 × 14..31, blue display
   18..28.6 × 17..20.8, 2u keys at x18/23.5/28.5 × y23/27, right column solid orange). */
icons['ribbon-button-calculation'] = <>
  {l69('M2.9 3.7H30.3V10.9M2.1 3.7V28.6M2.9 25.9H13M2.1 25.9V28.6H10.4L12.9 25.9', T69.ink, 2)}
  {l69('M11.4 4V11M20.75 4V11M2.6 9.85H30M11.4 11V23.7M3.1 19.6H10.9', T69.silver, 1.9)}
  <rect x={16} y={14} width={15} height={17} fill={T69.white} stroke={GEARBLUE} strokeWidth={2} />
  <rect x={17.4} y={17.4} width={11.3} height={4} fill="#8fc3f5" />
  <rect x={18} y={17} width={10.6} height={3.8} fill={GEARBLUE} />
  {[18, 23.5].flatMap((x) => [23, 27].map((y) => <rect key={`k${x}-${y}`} x={x} y={y} width={2.3} height={2.3} fill="#888888" />))}
  {[23, 27].map((y) => <rect key={`o${y}`} x={28.4} y={y} width={2.3} height={2.3} fill="#fa7541" />)}
</>;

/* --- Page Layout tab ------------------------------------------------------------------- */
/* margins (24px, measured): plain page 5.17..26.17 x 0.7..31.2 stroke #595959 1.35 with four
   light-blue margin guides across it at x10.17/21.17 and y5.17/26.17. */
icons['ribbon-button-margins'] = <>
  <rect x={5.17} y={0.7} width={21} height={30.5} fill={T69.white} stroke="#595959" strokeWidth={1.35} />
  {l69('M10.17 0.7V31.2M21.17 0.7V31.2M5.17 5.17H26.17M5.17 26.17H26.17', T69.midBlue, 1.35)}
</>;
/* paperSize: portrait page 9..28.3 x 6..31.3 with a folded top-right corner, a blue vertical
   T-headed double arrow at x4.17 and a horizontal one at y1.17 (measured). */
icons['ribbon-button-paper-size'] = <>
  <path d="M9 31.3V6H24.3L28.3 10V31.3Z" fill={T69.white} stroke="#595959" strokeWidth={1.4} strokeLinejoin="miter" />
  {l69('M24.3 6V10H28.3', '#595959', 1.3)}
  {l69('M4.17 6.7V28.3M2.2 6.7H6.1M2.2 28.3H6.1', GEARBLUE, 1.6)}
  {l69('M9 1.17H26.5M9 0V3.3M26.5 0V3.3', GEARBLUE, 1.6)}
</>;
/* orientation: portrait sheet behind (left frame 1.5, foot 14.2, fold at top-right
   (11,1.5)-(14.5,5)) and a landscape sheet in front (8.5..28.5 x 13.5..31.2, fold
   (23.5,13.5)-(28.5,18.5)). */
icons['ribbon-button-page-layout-orientation'] = <>
  <path d="M1.5 14.2V1.5H11L14.5 5V9.5" fill={T69.white} stroke="#595959" strokeWidth={1.35} strokeLinejoin="miter" />
  {l69('M11 1.5V5H14.5', '#595959', 1.3)}
  <path d="M8.5 31.2V13.5H23.5L28.5 18.5V31.2Z" fill={T69.white} stroke="#595959" strokeWidth={1.35} strokeLinejoin="miter" />
  {l69('M23.5 13.5V18.5H28.5', '#595959', 1.3)}
</>;
icons['ribbon-control-orientationportrait'] = <>
  <path d="M9 3H20L25 8V29H9Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.4} strokeLinejoin="miter" />
  {l69('M20 3V8H25', T69.ink, 1.3)}
</>;
icons['ribbon-control-orientationlandscape'] = <>
  <path d="M4 7H29V19L24 24H4Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.4} strokeLinejoin="miter" />
  {l69('M29 19H24V24', T69.ink, 1.3)}
</>;
icons['ribbon-button-page-portrait'] = icons['ribbon-control-orientationportrait'];
icons['ribbon-button-page-landscape'] = icons['ribbon-control-orientationlandscape'];
/* printArea (24px, measured via unit map): page frame #595959 1.35u — left x3.2 (y1..30.4),
   top edge y1 to x16.4, dog-ear fold: hypotenuse (16.4,1)→(22.2,7.3) with flap edges (vertical
   x16.4 to y7.3 + horizontal to the right frame), right frame x22.2 from 7.3 down to ~14.5,
   bottom edge y30.4 x3.2..12.7; blue print-area frame 1.7u x5.2..19.5 x 2.6..27.4 (corner tucked
   under the fold); printer lower right: tray 17.7..25.1 y16.4..21, body 13.7..27 y21..27.3,
   output paper 18..25.3 y27.3..31.4, small grey dot at the body's inner left. */
const printer69 = (bx = 14.6, by = 21.3, ph = 4.8, oh = 4.3): React.ReactElement => (
  <>
    <path d={`M${bx + 4.5} ${by}V${by - ph}h7V${by}`} fill={T69.white} stroke={T69.ink} strokeWidth={1.15} />
    <rect x={bx + 0.55} y={by + 0.55} width={14.9} height={5.4} fill={T69.white} stroke={T69.ink} strokeWidth={1.15} />
    <path d={`M${bx + 4.5} ${by + 6}v${oh}h7v-${oh}`} fill={T69.white} stroke={T69.ink} strokeWidth={1.15} />
    <rect x={bx + 2} y={by + 1.4} width={1.2} height={1.2} fill={T69.ink} />
  </>
);
/* printArea (24px, measured r3): the page frame is only left/bottom/right + the fold flap:
   left edge centre x3.1 (y2.4..29.8), bottom y29.7 to x13.8, right edge x24 only y8..14.8;
   flap: vertical x17.1 (1.8..7.5), horizontal y7.5 to x24, cut-diagonal (17.6,1.6)→(23.6,7.4).
   The blue print-area frame: top edge y2.2 from x4.9 to 16.4 (ends at the flap), left x5 full
   to y27.2, bottom y27.2 to x13.6, and a short right edge at x22 (y8.3..14.8). Printer body
   origin (14.6,21.3). */
icons['ribbon-button-print-area'] = <>
  <path d="M3.1 29.7V2.4M3.1 29.7H13.8M24 7.6V14.8" fill="none" stroke={T69.ink} strokeWidth={1.3} />
  <path d="M17.1 1.8V7.5H24" fill="none" stroke={T69.ink} strokeWidth={1.3} />
  {l69('M17.6 1.6L23.9 7.6', T69.ink, 1.3)}
  <path d="M16.4 2.2H5V27.2H13.6" fill="none" stroke={GEARBLUE} strokeWidth={1.15} />
  <path d="M22 8.3V14.8" fill="none" stroke={GEARBLUE} strokeWidth={1.15} />
  {printer69()}
</>;
/* printTitles (24px, measured r3): grid #666 1.2u outer (0,2.4)-(27.8,24.6); grey #c4c4c4 1.3u
   rules at x9.5/18.5 below the band plus one horizontal rule at y15.7; a RED #e65249 1.2u
   outline around the whole top row band (outer x0..28, y1.8..9.8) with red dividers at x9.5/18.5
   splitting it into three red cells; printer at body origin (16,19.5). */
icons['ribbon-button-print-titles'] = <>
  <rect x={0.6} y={3} width={26.6} height={21} fill={T69.white} stroke={T69.ink} strokeWidth={1.2} />
  {l69('M9.5 9.8V24M18.5 9.8V24M1.2 15.7H26.6', '#c4c4c4', 1.3)}
  <rect x={0.6} y={2.4} width={26.8} height={6.5} fill={T69.white} stroke="#e65249" strokeWidth={1.2} />
  {l69('M9.5 2.4V9.5M18.5 2.4V9.5', '#e65249', 1.2)}
  {printer69(16, 19.5, 4.5, 4.5)}
</>;
/* worksheetBackground: full-width grid sheet (0.5..31.5 x 3.2..25.2, gray rules at x10.5/21.5
   y10.3/17.3, foot at the lower-left) painted with blue mountains + an orange sun (measured). */
icons['ribbon-button-page-setup-background'] = <>
  <rect x={0.5} y={3.2} width={31} height={22} fill={T69.white} stroke="#595959" strokeWidth={1.4} />
  <path d="M3 25.2V29.2H9.5L13 25.2" fill="none" stroke="#595959" strokeWidth={1.4} strokeLinejoin="miter" />
  {l69('M10.5 3.2V25.2M21.5 3.2V25.2M0.5 10.3H31.5M0.5 17.3H31.5', T69.silver, 1.35)}
  <path d="M1.2 24.5L10.5 13.3 20 24.5Z" fill={T69.midBlue} stroke="#4a87c8" strokeWidth={1.35} strokeLinejoin="round" />
  <path d="M16 24.5L23.5 17.3 31 24.5Z" fill={T69.midBlue} stroke="#4a87c8" strokeWidth={1.35} strokeLinejoin="round" />
  <circle cx={24.7} cy={10.5} r={2.5} fill="#ff9a3a" />
</>;
icons['ribbon-button-breaks'] = <>
  {l69('M6 1V11H26V1', T69.ink, 1.4)}
  <path d="M1 16H31" fill="none" stroke="#7fb2e5" strokeWidth={1.3} strokeDasharray="2.6 2.2" strokeLinecap="butt" />
  {l69('M6 31V21H26V31', T69.ink, 1.4)}
</>;

/* --- Formulas tab ---------------------------------------------------------------------- */
/* Serif-italic blue fx (own calligraphy): hooked bowl, crossbar, curled descender ball,
   cursive x = two arcs whose lower tails curl outwards. Local bbox ~ (0,0,22,25);
   stroke width passed in 32-unit space. */
/* fx glyph: italic f (top curl + crossbar + tail) with x; curly=true renders the cursive
   double-bow x seen in the showFormulas flag glyph, straight italic × otherwise. */
const fx69 = (x: number, y: number, k = 1, sw = 3.2, color = T69.blue, curly = false): React.ReactElement => (
  <g transform={`translate(${x} ${y}) scale(${k})`} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.2 5.8C14 3 10.2 2.9 8.6 6.3L4.6 18.4C3.9 21 2.8 22.7 1 24.4" strokeWidth={sw} />
    <path d="M3.4 11.6H14.6" strokeWidth={sw * 0.75} />
    {curly ? <>
      <path d="M14.7 10.4C16.7 13 19 15.9 20.8 18.2c0.9 1.2 0.3 2.2-1.1 1.9" strokeWidth={sw * 0.82} />
      <path d="M21.3 10.4C19.3 13 17 15.9 15.2 18.2c-0.9 1.2-0.3 2.2 1.1 1.9" strokeWidth={sw * 0.82} />
    </> : <>
      <path d="M14.4 11.2L21.4 19" strokeWidth={sw * 0.82} />
      <path d="M21.4 11.2L15.2 19" strokeWidth={sw * 0.82} />
    </>}
  </g>
);
/* Thin dark book with folded foot bottom-left + centred coloured symbol. */
const funcBook69 = (symbol: React.ReactNode): React.ReactElement => (
  <>
    <path d="M26.5 24.5V6.2Q26.5 3.4 23.6 3.4H8.4Q5.5 3.4 5.5 6.2V24.5Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.5} strokeLinejoin="round" />
    {l69('M5.5 24.5V28.6H12.5', T69.ink, 1.5)}
    {symbol}
  </>
);
icons['ribbon-button-mathtrigfunction'] = funcBook69(<><ellipse cx={16} cy={13.6} rx={4.6} ry={6.2} fill="none" stroke={T69.green} strokeWidth={1.8} />{l69('M11.4 13.6H20.6', T69.green, 1.8)}</>);
icons['ribbon-button-textfunction'] = funcBook69(<>{l69('M10.8 20.8L16 7.8l5.2 13M12.7 16.5h6.6', T69.blue, 2.4)}</>);
icons['ribbon-button-financialfunction'] = funcBook69(<>
  <ellipse cx={16} cy={9} rx={5} ry={2} fill="#70c484" stroke={T69.greenDark} strokeWidth={1.19} />
  <path d="M11 9v6.6a5 2 0 0 0 10 0V9" fill="#70c484" stroke={T69.greenDark} strokeWidth={1.19} />
  {l69('M11 12.2a5 2 0 0 0 10 0M11 15.4a5 2 0 0 0 10 0', T69.greenDark, 1.4)}
</>);
icons['ribbon-button-logicalfunction'] = funcBook69(<g transform="translate(1.5 -1.5)">{g(GL.qm, '#8546a8', 2.6)}{dot(16, 24.5, 1.5, '#8546a8')}</g>);
icons['ribbon-button-datetimefunction'] = funcBook69(<>
  <circle cx={16} cy={14} r={6} fill="none" stroke="#e0503c" strokeWidth={1.6} />
  {l69('M16 9.6V14.2L19.2 16.2', '#e0503c', 1.8)}
</>);
icons['ribbon-button-lookupreferencefunction'] = funcBook69(<>
  <circle cx={14.2} cy={13.4} r={5.2} fill="none" stroke={T69.blue} strokeWidth={1.6} />
  {l69('M18 17.2L22.6 21.8', T69.blue, 2.2)}
</>);
icons['ribbon-button-morefunction'] = funcBook69(<>{dot(11, 14, 1.7, T69.red)}{dot(16, 14, 1.7, T69.red)}{dot(21, 14, 1.7, T69.red)}</>);
icons['ribbon-button-insertfunction'] = fx69(5, 4.5, 1.15, 2.7);
/* measured (bands.py + unit scans): panel = near-full 16px box (frame 1.6u at 1.75..31.25 x
   0.75..30.75) with a big fx (bbox 6..26.5 x 5..26.5); showFormulas (16px) = flag: left bar
   x0.5..2.5 to y24.5, top bar to x~21, hypotenuse (21,1.5)→(1.5,24.5), all #666 ~2.4u; fx sits
   lower-right with crossbar at y~16.5. */
icons['ribbon-show-formulas'] = <>
  <path d="M1.6 1.6H21.4L1.6 24.4Z" fill={T69.white} stroke="#666666" strokeWidth={2} strokeLinejoin="miter" />
  {fx69(5.5, 3, 1, 2.7, T69.blue, true)}
</>;
icons['gc-formula-editor-panel-ribbon-show'] = <>
  <rect x={1.75} y={0.75} width={29.5} height={30} fill={T69.white} stroke="#595959" strokeWidth={1.5} />
  {fx69(5.6, 3.4, 0.96, 2.5)}
</>;
/* autoSum (24px, measured r3b): bars 3u (y3.5..6.5 / 25.5..28.5) x3.5..29.7; 2.1u serifs at
   x27.6..29.7 (top one y6.5..19.6, bottom one fused with the bar); diagonals as two flat bands
   joining at the apex (outer point x21, horizontal band width ~5.8u). */
icons['ribbon-button-autosum'] = (
  <g fill={GEARBLUE}>
    <rect x={3.5} y={3.5} width={26.2} height={3} />
    <rect x={3.5} y={25.5} width={26.2} height={3} />
    <rect x={27.6} y={6.5} width={2.1} height={13.1} />
    <rect x={27.6} y={23.7} width={2.1} height={4.8} />
    <path d="M3.5 6.5H9.2L21 16H15.3Z" />
    <path d="M15.3 16H21L9.2 25.5H3.5Z" />
  </g>
);
/* calculatenow (16px calc): frame 5.5..27.5 x 1.5..31.2 stroke 2 #595959; solid blue display
   6.5..26.5 x 4.5..10.5 with lighter inset band; 3x3 keys 4u at 6u pitch #595959.
   calculationoptions (24px, measured): frame #666 ~1.35u at 5.8..25.8 x 2.2..29.2; display band
   #367fc9 9.4..22.4 x 5.7..10.7 with a pale #85bbfc inset; 3x3 solid #595959 keys 3u at
   x9.33/14.33/19.33 x y12.6/17.8/23 (5u pitch); no gear. */
icons['ribbon-button-calculateNow'] = <>
  <rect x={5.5} y={1.5} width={22} height={29.75} fill={T69.white} stroke="#595959" strokeWidth={2} />
  <rect x={6.5} y={4.5} width={20} height={6} fill={GEARBLUE} />
  <rect x={8.5} y={6.3} width={16} height={2.4} fill="#a9c9ea" />
  {[8.5, 14.5, 20.5].flatMap((x) => [12.5, 18.5, 24.5].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width={4} height={4} fill="#595959" />))}
</>;
icons['ribbon-button-calculationoptions'] = <>
  <rect x={5.8} y={2.2} width={20} height={27} fill={T69.white} stroke={T69.ink} strokeWidth={1.35} />
  <rect x={9.4} y={5.7} width={13} height={5} fill={GEARBLUE} />
  <rect x={10.2} y={6.7} width={11} height={2.7} fill="#85bbfc" />
  {[9.33, 14.33, 19.33].flatMap((x) => [12.6, 17.8, 23].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width={3} height={3} fill="#595959" />))}
</>;
/* calculateSheet (16px, measured): grid sheet x2.8..30 (frame 2.2u #666; right frame only down to
   the band y10.2; thick 2.3u grey band; header rules x12.35/22.15 between frame and band; body rule
   x12.35 down to the main bottom y22.4 which runs to x16.3; a wide white gap, then a peeled foot
   strip y27.35 to x11.6 folding back to 14.3) + a thick gray-framed calculator flush lower-right
   (frame 2.9u 20..31.3 x 12.8..31, blue display 22.5..28.4 x 15..17.8, 2x2 dark keys 2.5u). */
icons['ribbon-button-calculateSheet'] = <>
  {l69('M1.5 0.9H30.7V9.4M1.5 0.9V26.4M1.5 22.7H15.7M1.5 22.7V26.4H10.6L14.2 23.4', T69.ink, 1.8)}
  {l69('M11.4 1.9V5.8M20.35 1.9V5.8M2.2 6.85H30.5M11.4 7.8V21.4M3.2 16.8H16', '#b8b8b8', 1.9)}
  <rect x={19.6} y={12.7} width={11.2} height={16} fill={T69.white} stroke="#595959" strokeWidth={1.8} />
  <rect x={22.9} y={15.8} width={5.7} height={2} fill={GEARBLUE} />
  {[21.7, 25.7].flatMap((x) => [20, 23.6].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width={1.8} height={1.8} fill="#595959" />))}
</>;
/* nameManager (24px, measured r3 from the DPR4 1u-grid crop): open drawer — box outline #666
   1.8u at outer (3.2,18.7)-(22.2,26.9); behind it a gray side wall rising up-right: pentagon
   (23.2,16)-(27.4,11.4)-(27.4,21)-(24.4,24)-(23.2,24) with a 1u white slot at (24.5,17); a gray
   wedge tri (3.7,15.9)-(7.2,11.3) at the left; three blue folder cards with 45° bottom-right
   chamfers: c1 x15.2..25.5 y3.3..5.9, c2 x11.5..25.5 y6.5..9.7, c3 x8.5..24.5 y10.3..15.6 (its
   right edge verticals 12.8..15.6), c3 with a 1.7r white hole at (20.1,13.1). */
icons['ribbon-button-namemanager'] = <>
  <path d="M23.2 24.6V16.2l4.7-4.9V21.5l-3.4 3.1v1.2Z" fill="#666666" />
  <rect x={24.5} y={17.2} width={1} height={5.6} fill={T69.white} />
  <path d="M3.7 15.9H7.2V11.3Z" fill="#666666" />
  <rect x={4.1} y={19.6} width={17.2} height={6.4} fill={T69.white} stroke="#666666" strokeWidth={1.8} />
  <path d="M15.2 3.3H25.5L22.9 5.9H15.2Z" fill={GEARBLUE} />
  <path d="M11.5 6.5H25.5L22.5 9.7H11.5Z" fill={GEARBLUE} />
  <path d="M8.5 10.3H24.5V12.8L21.7 15.6H8.5Z" fill={GEARBLUE} />
  <circle cx={20.1} cy={13.1} r={1.7} fill={T69.white} />
</>;

/* --- Data tab -------------------------------------------------------------------------- */
icons['ribbon-button-innerGroup'] = <>{outlineTable69([T69.blue, T69.blue, T69.blue], [4.8, 14.7, 24.6])}{groupArms69()}{diamondBox69(1.5, 10.5)}</>;
icons['ribbon-button-innerUngroup'] = <>
  {outlineTable69([T69.blue, T69.blue, T69.blue], [4.8, 14.8, 24.8], [11, 21])}{groupArms69()}
  <rect x={2} y={12} width={11.5} height={12} fill={T69.white} stroke="#e65249" strokeWidth={1.9} />
  {l69('M12.1 13.9L4.1 21.9', '#e65249', 2.1)}
</>;
icons['ribbon-button-subtotal'] = <>
  {outlineTable69([T69.blue, T69.blue, '#fa7541'], [4.9, 14.9, 25.2], [11, 21])}
  {diamondBox69(2, 3)}
  {diamondBox69(2, 18.5, false)}
</>;
/* customSort (24px, measured): solid blue header band #367fc9 2.6..29.4 × 1.7..6.8 (no outline),
   thin #666 frame 1u below the band: sides x2.83/x28.83 y6.8..27.2, bottom y27.2, shared vertical
   at x15.83; four sans letters ~6.4u tall: left cell Z(orange #fa7541) top / A(blue) bottom,
   right cell A(blue) top / Z(orange) bottom; strokes ~2u, no arrows. */
icons['ribbon-button-sort'] = <>
  <rect x={2.6} y={1.7} width={26.8} height={5.1} fill={GEARBLUE} />
  {l69('M2.83 6.8V27.2H28.83V6.8M15.83 6.8V27.2', T69.ink, 1)}
  <g fill="none" strokeLinecap="butt" strokeLinejoin="miter">
    <g transform="translate(6.13 4.9) scale(0.4)">{g(GL.Z, '#fa7541', 5)}</g>
    <g transform="translate(7.13 13.3) scale(0.4)">{g(GL.A, GEARBLUE, 5)}</g>
    <g transform="translate(20.13 5.3) scale(0.4)">{g(GL.A, GEARBLUE, 5)}</g>
    <g transform="translate(19.13 12.9) scale(0.4)">{g(GL.Z, '#fa7541', 5)}</g>
  </g>
</>;
icons['ribbon-button-sortAZ'] = <>
  <g fill="none" strokeLinecap="butt" strokeLinejoin="miter">
    <g transform="translate(1 -6) scale(0.9)">{g(GL.A, GEARBLUE, 2.4)}</g>
    <g transform="translate(1 6.8) scale(0.9)">{g(GL.Z, '#fa7541', 2.4)}</g>
  </g>
  {l69('M24 2V21', '#666666', 4.2)}
  <path d="M19.5 19.5L24 29 28.5 19.5Z" fill="#666666" />
</>;
icons['ribbon-button-sortZA'] = <>
  <g fill="none" strokeLinecap="butt" strokeLinejoin="miter">
    <g transform="translate(1 6.8) scale(0.9)">{g(GL.Z, '#fa7541', 2.4)}</g>
    <g transform="translate(1 -6) scale(0.9)">{g(GL.A, GEARBLUE, 2.4)}</g>
  </g>
  {l69('M24 2V21', '#666666', 4.2)}
  <path d="M19.5 19.5L24 29 28.5 19.5Z" fill="#666666" />
</>;
icons['ribbon-button-filter'] = <path d="M4 6H28L18 19V27L14 29V19Z" fill={T69.blue} />;
icons['ribbon-button-clearfilter'] = <>
  <path d="M4 6H25L16 18V25L12 27V18Z" fill={T69.blue} />
  {l69('M10.2 14.8L19.8 24.4M19.8 14.8L10.2 24.4', T69.white, 5.2)}
  {l69('M10.2 14.8L19.8 24.4M19.8 14.8L10.2 24.4', '#fa7541', 2.7)}
</>;
icons['ribbon-button-reapplyfilter'] = <>
  <path d="M4 6H25L16 18V25L12 27V18Z" fill={T69.paleBlue} />
  {l69('M27 19a6 6 0 1 1-3-4.5', T69.orange, 2)}<path d="M27 10.5l1.2 5.5-5.5-1.2Z" fill={T69.orange} />
</>;
/* textToColumn (24px, cmap + pair r4): 3 dark text rules top-left (y6/11/15, lengths 12/16/8);
   a thin blue loop arrow sweeping left/below/right ending in an open down-right V head;
   three outlined cells stacked at the right (x21..30), each with a mid-blue dash. */
icons['ribbon-button-textToColumn'] = <>
  {l69('M2.7 5.5H15M2.7 10.7H18.5M2.7 15H10.5', T69.ink, 2)}
  <path d="M14 17.5C6.5 16.5 3 20 3.5 24C4 27.5 8.5 29 13.5 28.4" fill="none" stroke={GEARBLUE} strokeWidth={1.7} strokeLinecap="butt" />
  <path d="M10.8 24.6L14.2 29.2L17 23.6" fill="none" stroke={GEARBLUE} strokeWidth={1.7} strokeLinejoin="miter" />
  {[0, 1, 2].map((i) => <rect key={i} x={21.3} y={2.5 + i * 9.7} width={8.8} height={8} fill={T69.white} stroke={T69.ink} strokeWidth={1.3} />)}
  {[0, 1, 2].map((i) => <rect key={`d${i}`} x={23.3} y={5.5 + i * 9.7} width={4.8} height={1.6} fill={GEARBLUE} />)}
</>;
/* removeDuplicates (24px, cmap r4): only TWO pale-blue bands (thin #367fc9 frame, no middle band):
   top band (x4..22, y3..11) and a bottom band (x4..20, y19..29); a thin red ✗ overlaps the bottom
   band's right end. */
icons['ribbon-button-remove-duplicates'] = <>
  <rect x={4} y={3.5} width={18} height={8} fill={T69.midBlue} stroke={T69.blue} strokeWidth={1.2} />
  <rect x={4} y={19.5} width={16.5} height={9.5} fill={T69.midBlue} stroke={T69.blue} strokeWidth={1.2} />
  {l69('M20 19.5L28 27.5M28 19.5L20 27.5', T69.white, 3.8)}
  {l69('M20 19.5L28 27.5M28 19.5L20 27.5', '#e65249', 1.9)}
</>;
/* editLinks (24px, cmap r4): document x4..25 y2.5..28, big folded corner (slant (15,2.5)→(25,12.5),
   fold vertical x15 + horizontal y12.5); two tilted hollow blue chain links over the lower half,
   the lower-right link drawn over the first with a white gap. */
icons['ribbon-button-editLinks'] = <>
  <path d="M4.5 28V2.5H15L25 12.5V28Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.3} strokeLinejoin="miter" />
  {l69('M15 2.5V12.5H25', T69.ink, 1.2)}
  <g transform="rotate(-32 10 18)">
    <rect x={4.5} y={15} width={11} height={6.8} rx={3.4} fill={T69.white} stroke={GEARBLUE} strokeWidth={1.9} />
  </g>
  <g transform="rotate(-32 21.5 22)">
    <rect x={15.5} y={18.5} width={12} height={7} rx={3.5} fill="none" stroke={T69.white} strokeWidth={4.4} />
    <rect x={15.5} y={18.5} width={12} height={7} rx={3.5} fill="none" stroke={GEARBLUE} strokeWidth={1.9} />
  </g>
</>;
/* dataValidation (24px main, cmap-measured r4): two wide outlined rows (x4..28 & x2..26) with a
   green ✓ over row1's right end and a red ✗ over row2's right end; thin strokes. */
icons['gc-ribbon-control-dropdown-datavalidationsmall'] = <>
  <rect x={3.5} y={3} width={24} height={9.5} fill={T69.white} stroke={T69.ink} strokeWidth={1.3} />
  <rect x={2.5} y={17.5} width={23.5} height={9.5} fill={T69.white} stroke={T69.ink} strokeWidth={1.3} />
  {l69('M19 7L22 10.5L26.5 3.5', T69.white, 4)}
  {l69('M19 7L22 10.5L26.5 3.5', T69.green, 2.1)}
  {l69('M21 18.5L27.5 25.5M27.5 18.5L21 25.5', T69.white, 4)}
  {l69('M21 18.5L27.5 25.5M27.5 18.5L21 25.5', '#e65249', 2.1)}
</>;
/* whatIfAnalysis (24px, measured): grid frame #666 1.35u: left x2.85 (y2.2..23.2), top y2.2 to
   x29.85, right x29.85 only down to y11.5, bottom y23.2 only to x21.3; grey 1.35u rules x12 full
   height, x21 down to y12.5, y9.3 from x12.7, y16.2 short from x12.7; left-column cells rows 1+3
   filled pale #85bbfc with 1.7u blue borders (2.85..12.5 × 2.25..10.35 and 16.15..23.25); a big
   blue question mark over the lower right (hook x20.5..29.5 y11.7..21, stem 2.7u at x24.8..27.5,
   square dot 26.2..29.8 with its own square dot). */
icons['ribbon-button-whatIfAnalysis'] = <>
  {l69('M2.85 2.2V23.2H21.3M2.85 2.2H29.85V11.5', T69.ink, 1.35)}
  {l69('M12 2.2V23.2M21 2.2V12.5M12.7 9.3H29M12.7 16.2H18.6', T69.silver, 1.35)}
  <rect x={3.7} y={3.1} width={8.8} height={6.4} fill="#85bbfc" stroke={GEARBLUE} strokeWidth={1.7} />
  <rect x={3.7} y={17} width={8.8} height={6.3} fill="#85bbfc" stroke={GEARBLUE} strokeWidth={1.7} />
  {l69r('M21.4 14.4a4.6 4.6 0 1 1 6.4 5.6c-1.4 1.3-1.8 2-1.8 3.9', GEARBLUE, 2.7)}
  <rect x={24.8} y={26.2} width={2.7} height={3.1} fill={GEARBLUE} />
</>;
/* templateDesignMode (24px, measured): 3-col grid frame #666 1.2u x2.5..26.5 × 2.2..27.2, rules
   x9.5/x19.5 full height, grey 1.2u horizontals y6.8/y13.5/y20.5; middle column rows 2-3 filled
   pale blue #81befc with a 1.5u blue outline; a big paintbrush from the top-right: rounded 4.6u
   grey handle (29.3,4.5)→(17.5,17.5), white collar at (15.5,19.5), blue bristle blob centred
   (12.5,25.5) reaching down to y30. */
icons['ribbon-button-template'] = <>
  {l69('M2.5 2.2H26.5V27.2H2.5Z', T69.ink, 1.2)}
  {l69('M9.5 2.2V27.2M19.5 2.2V27.2', T69.ink, 1.2)}
  {l69('M2.5 6.8H26.5M2.5 13.5H26.5M2.5 20.5H26.5', T69.silver, 1.2)}
  <rect x={9.5} y={6.8} width={10} height={13.7} fill="#81befc" stroke={GEARBLUE} strokeWidth={1.5} />
  {l69('M9.5 13.6H19.5', GEARBLUE, 1.2)}
  {line('M29.3 4.5L17.8 17', '#9b9b9b', 4.6, 'round')}
  <circle cx={16.1} cy={18.9} r={2.4} fill={T69.white} stroke="#c8c8c8" strokeWidth={1.2} />
  <path d="M13 21.4c4.4-1 7 1.5 6.6 4.6-0.5 3.8-4.4 5.6-7.8 4-2.6-1.4-3.4-4.4-1.6-7 0.8-1.1 1.8-1.4 2.8-1.6Z" fill={GEARBLUE} />
  {l69r('M9.9 25.5c0.6-1.8 2-3.2 3.6-4', T69.white, 1.4)}
</>;
icons['ribbon-button-showdetail'] = <>
  {l69('M8 6V14M4 10H12', T69.mid, 2.2)}
  {detailBars(6)}
</>;
icons['ribbon-button-hidedetail'] = <>
  {l69('M4 8H12', T69.mid, 2.2)}
  {detailBars(4)}
</>;

/* --- Insert tab ------------------------------------------------------------------------ */
/* 24px table (measured r3): frame #666 1.35u at (2.5,2.5)-(29.5,29.5), solid blue header band
   flush to the frame (y2.5..8.1, #367fc9), three #666 column rules x9.3/15.8/22.5 below the header
   and two #bbbbbb data-row rules at y13.4/20.6 (header + 3 data rows, last column widest).
   Fractions keep the small 14u variant (changeDataSource) proportional. */
const table69 = (x = 2.5, y = 2.5, w = 27, h = 27): React.ReactElement => {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill={T69.white} stroke={T69.ink} strokeWidth={1.35} />
      <rect x={x + 0.02 * w} y={y + 0.02 * h} width={w - 0.04 * w} height={h * 0.2} fill={GEARBLUE} />
      {l69(`M${x + 0.252 * w} ${y + 0.207 * h}V${y + h}M${x + 0.493 * w} ${y + 0.207 * h}V${y + h}M${x + 0.741 * w} ${y + 0.207 * h}V${y + h}`, T69.ink, 1.2)}
      {l69(`M${x} ${y + 0.404 * h}H${x + w}M${x} ${y + 0.67 * h}H${x + w}`, T69.silver, 1.35)}
    </>
  );
};
icons['ribbon-button-table'] = table69();
icons['ribbon-thumbnail-table'] = table69();
icons['ribbon-button-insert-pivot-table'] = <>
  <rect x={2.5} y={2.5} width={27} height={27} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />
  <rect x={6.5} y={6.5} width={5} height={4.5} fill={T69.silver} />
  <rect x={13.5} y={6.5} width={12.5} height={4.5} fill={T69.silver} />
  <rect x={6.5} y={13.5} width={4.5} height={9.5} fill={T69.silver} />
  {l69('M24.5 14.5V24.5H14.5', GEARBLUE, 2.1)}
  <path d="M21.7 17L24.5 13.6l2.8 3.4M17.6 21.7L14.2 24.5l3.4 2.8" fill="none" stroke={GEARBLUE} strokeWidth={1.9} strokeLinejoin="miter" />
</>;
icons['ribbon-button-chart'] = <>
  <rect x={4} y={13} width={7} height={17} fill="#8fb4e3" />
  <rect x={12.5} y={5} width={7} height={25} fill="#ffd966" />
  <rect x={21} y={9} width={7} height={21} fill="#f2b9a4" />
</>;
icons['ribbon-button-chart-column'] = <>{axis69()}<rect x={9} y={16} width={3.5} height={10} fill="#c9c9c9" /><rect x={14} y={11} width={3.5} height={15} fill={T69.paleBlue} /><rect x={19} y={14} width={3.5} height={12} fill={T69.paleBlue} /><rect x={24} y={9} width={3.5} height={17} fill="#c9c9c9" /></>;
icons['ribbon-button-chart-line'] = <>{axis69()}{l69r('M9 22L14 12L19 17L25 7', T69.blue, 2)}{dot(9, 22, 1.4, T69.redSoft)}{dot(14, 12, 1.4, T69.blue)}{dot(19, 17, 1.4, T69.blue)}{dot(25, 7, 1.4, T69.blue)}{l69r('M9 16L15 20L20 13L26 16', '#a6a6a6', 1.8)}</>;
icons['ribbon-button-chart-pie'] = <>
  <circle cx={16} cy={16.5} r={9.5} fill={T69.white} stroke={T69.mid} strokeWidth={1.40} />
  <path d="M16 16.5V7A9.5 9.5 0 0 1 25.5 16.5Z" fill={T69.paleBlue} />
  <circle cx={16} cy={16.5} r={4} fill={T69.white} stroke={T69.mid} strokeWidth={1.12} />
</>;
icons['ribbon-button-chart-combo'] = <>{axis69()}<rect x={9} y={15} width={3.5} height={11} fill="#c9c9c9" /><rect x={14} y={11} width={3.5} height={15} fill={T69.paleBlue} /><rect x={19} y={13} width={3.5} height={13} fill="#c9c9c9" />{l69r('M9 12L15 17L21 9L27 13', T69.mid, 1.8)}</>;
icons['ribbon-button-chart-scatter'] = <>{axis69()}
  {[[10, 12], [17, 20], [23, 9]].map(([x, y], i) => <path key={`g${i}`} d={`M${x - 2} ${y}H${x + 2}M${x} ${y - 2}V${y + 2}`} stroke="#9a9a9a" strokeWidth={1.26} fill="none" />)}
  {[[13, 17], [21, 22], [26, 14]].map(([x, y], i) => <path key={`b${i}`} d={`M${x - 1.8} ${y - 1.8}L${x + 1.8} ${y + 1.8}M${x + 1.8} ${y - 1.8}L${x - 1.8} ${y + 1.8}`} stroke={T69.blue} strokeWidth={1.26} fill="none" />)}
</>;
/* treemap preview (16px, measured r3): edge-to-edge cells on a thick #7f7f7f 2.2u gray grid:
   outer (1.2,1.2)-(30.8,30.8), a vertical rule at x13.2 (blue column | white cells), a horizontal
   at y7.7 (x13.2..30.8), a vertical at x21 (y7.7..30.8) and a horizontal at y19.5 (x21..30.8).
   The left column holds two pale-blue cells (#c6e0f6 fill, thin #8fb4de frames) inset in a white
   gutter, split at y15 by a blue rule. */
icons['ribbon-button-chart-treemap'] = <>
  <rect x={1.2} y={1.2} width={29.6} height={29.6} fill={T69.white} stroke="#7f7f7f" strokeWidth={2.2} />
  {l69('M13.2 1.2V30.8M13.2 7.7H30.8M21 7.7V30.8M21 19.5H30.8', '#7f7f7f', 2.2)}
  <rect x={3.4} y={3.4} width={8.2} height={10.4} fill="#c6e0f6" stroke="#8fb4de" strokeWidth={1.4} />
  <rect x={3.4} y={16.2} width={8.2} height={11} fill="#c6e0f6" stroke="#8fb4de" strokeWidth={1.4} />
</>;
icons['ribbon-button-chart-funnel'] = <>
  <rect x={7} y={9} width={4} height={13} fill={T69.white} stroke={T69.mid} strokeWidth={1.12} />
  {l69('M9 6V25', T69.mid, 1.5)}
  <rect x={13} y={5} width={4} height={18} fill={T69.white} stroke={T69.mid} strokeWidth={1.12} />
  {l69('M15 2V26', T69.mid, 1.5)}
  <rect x={19} y={12} width={4} height={8} fill={T69.paleBlue} stroke={T69.mid} strokeWidth={1.12} />
  {l69('M21 9V23', T69.mid, 1.5)}
</>;
/* barcode (24px, measured r3 on a 1u grid): finders 10u at (2.8,2.8)/(18.4,2.8)/(2.8,18.4) with
   1.2u frames and 2.4u centred dots; two staggered dashed gutter columns at x14.6/16.6 below and
   between the top finders; three full bar rows y13.8/15.8/17.8 (left 3.4..13.4, right 18.4..28.4
   with random 1u breaks); a lower-right module field of broken bar rows at y20.2/23.2/26.2 plus
   short vertical dashes; everything #666666 (the official crop has exactly two colors). */
icons['ribbon-button-barcode'] = <>
  {[[3.4, 3.4], [19, 3.4], [3.4, 19]].map(([x, y], i) => (
    <React.Fragment key={i}>
      <rect x={x} y={y} width={9} height={9} fill={T69.white} stroke={T69.ink} strokeWidth={1.2} />
      <rect x={x + 3.3} y={y + 3.3} width={2.4} height={2.4} fill={T69.ink} />
    </React.Fragment>
  ))}
  <path d="M14.6 3V6.4M14.6 8.4V12.4M14.6 13.8V18.6M16.6 2.8V5.8M16.6 7.8V12.8M16.6 19.5V22M16.6 24.5V27" fill="none" stroke={T69.ink} strokeWidth={1.2} />
  {[[13.8, 3.4, 10], [15.8, 3.4, 10], [17.8, 3.4, 10]].map(([y, x, w], i) => <rect key={`l${i}`} x={x} y={y} width={w} height={1.1} fill={T69.ink} />)}
  {[[13.8, 18.4, 6], [13.8, 25.4, 3], [15.8, 19.4, 5], [15.8, 26.4, 2], [17.8, 18.4, 6], [17.8, 25.4, 3]].map(([y, x, w], i) => <rect key={`r${i}`} x={x} y={y} width={w} height={1.1} fill={T69.ink} />)}
  {[[20.2, 18.4, 3], [20.2, 22.4, 3.5], [20.2, 27, 1.4], [23.2, 19.5, 3.4], [23.2, 24, 3], [26.2, 18.4, 3.2], [26.2, 22.5, 3], [26.2, 26.5, 1.9]].map(([y, x, w], i) => <rect key={`q${i}`} x={x} y={y} width={w} height={1.1} fill={T69.ink} />)}
  <path d="M18.9 20.2V24M21.4 23.2V27.4M25.4 20.2V24.6M27.8 14V18.4M27.8 20.2V23.5M27.8 26.2V28.8" fill="none" stroke={T69.ink} strokeWidth={1.2} />
</>;
icons['ribbon-button-picture-big'] = <>
  <rect x={2.5} y={2.5} width={27} height={27} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />
  <path d="M3.4 28.9L10 11.5 20.5 28.9Z" fill="#d6e9f8" stroke="#4a87c8" strokeWidth={1.35} strokeLinejoin="round" />
  <path d="M13.5 28.9L21.5 14 28.6 28.9Z" fill="#cde3f6" fillOpacity={0.85} stroke="#4a87c8" strokeWidth={1.35} strokeLinejoin="round" />
  <circle cx={21.2} cy={7.8} r={2.2} fill="#e07030" />
</>;
icons['ribbon-button-picture'] = icons['ribbon-button-picture-big'];
icons['ribbon-button-shapes'] = <>
  <rect x={3.5} y={7.5} width={11.5} height={11.5} fill="none" stroke={T69.blue} strokeWidth={1.7} />
  <circle cx={21} cy={10.5} r={6.5} fill="none" stroke={T69.blue} strokeWidth={1.7} />
  <path d="M17 21.5L22 26.5L27 21.5L22 16.5Z" fill={T69.white} stroke={T69.blue} strokeWidth={1.7} strokeLinejoin="miter" />
</>;
icons['ribbon-button-camera-shape'] = <>
  <rect x={1.4} y={10.8} width={29} height={16.4} rx={2} fill={T69.white} stroke={T69.ink} strokeWidth={1.3} />
  <path d="M10 10.8V5.9a1.3 1.3 0 0 1 1.3-1.3h8.4a1.3 1.3 0 0 1 1.3 1.3v4.9" fill={T69.white} stroke={T69.ink} strokeWidth={1.25} />
  <circle cx={4.2} cy={14.2} r={1.45} fill="#e03c31" />
  <circle cx={15.9} cy={19.2} r={6.2} fill={T69.white} stroke="#7d7d7d" strokeWidth={1.3} />
  <circle cx={15.9} cy={19.2} r={4.4} fill={T69.white} stroke={GEARBLUE} strokeWidth={1.4} />
  <circle cx={15.9} cy={19.2} r={2.8} fill="#c7e3f8" />
</>;
icons['ribbon-button-hyperlink'] = <>
  <g transform="rotate(-45 16 16)">
    {l69('M7.5 12.5H12.5a3.5 3.5 0 0 1 0 7H7.5a3.5 3.5 0 0 1 0-7Z', T69.blue, 1.8)}
    {l69('M20.5 12.5H25.5a3.5 3.5 0 0 1 0 7H20.5a3.5 3.5 0 0 1 0-7Z', T69.blue, 1.8)}
  </g>
</>;
/* insertTextBox (24px, measured r3): wide thin box #666 1.2u outer x1..31 × y5..27 with a blue A
   (2.2u strokes) fully inside: apex (16,7.5), legs to y24.5, crossbar at y17.8. */
icons['ribbon-button-insert-textBox'] = <>
  <rect x={1.6} y={5.6} width={28.8} height={20.8} fill={T69.white} stroke={T69.ink} strokeWidth={1.2} />
  {l69('M11.9 24.5L16 7.5l4.1 17M13.7 17.8H18.3', GEARBLUE, 2.2)}
</>;
/* insertCheckBox (24px, measured r3): sharp thin box #666 1.2u outer 3.5..28.5 with a thin blue ✓. */
icons['ribbon-button-checkbox-cell-type'] = <>
  <rect x={4.1} y={4.1} width={23.8} height={23.8} fill={T69.white} stroke={T69.ink} strokeWidth={1.2} />
  {l69('M8.5 14.5L13 19.2L22 8.8', GEARBLUE, 2.3)}
</>;
/* formControl (24px, measured r3): briefcase — body #666 1.2u outer x2..30 × y6..27, rounded
   handle x10..18 (top y3), handle-side frame stubs, band line y15.5 up to the latch, grey latch
   square x14..18 y13.5..17.5; a solid blue wrench (head with up-open notch at x18.5..24 y14..19.5,
   shaft to y26.5 with rounded foot) and screwdriver (wide top x26..29.5 y13.8..16.8, thin shaft,
   flange + rounded grip to y27.5) overlap the case's lower right. */
icons['ribbon-button-formControl'] = <>
  <rect x={2.6} y={6.6} width={26.8} height={19.8} rx={1} fill={T69.white} stroke={T69.ink} strokeWidth={1.2} />
  {l69('M10.5 6.6V4a1.2 1.2 0 0 1 1.2-1.2h5.6A1.2 1.2 0 0 1 18.5 4v2.6', T69.ink, 1.2)}
  {l69('M2.6 15.5H13.8', T69.ink, 1.15)}
  <rect x={14.4} y={14.1} width={3.6} height={3.5} fill={T69.white} stroke="#8a8a8a" strokeWidth={1.1} />
  <g fill={GEARBLUE}>
    <path d="M18.7 17.2a2.7 2.7 0 1 0 5.4 0v-1.1h-1.9v1a0.9 0.9 0 1 1-1.6 0v-1h-1.9Z" />
    <path d="M20.6 13.6h1.6v12.2a1 1 0 0 1-1.6 0Z" />
    <rect x={20.1} y={23.8} width={2.6} height={3.4} rx={1.2} />
    <rect x={26.2} y={13.8} width={3.3} height={3} rx={0.9} />
    <rect x={27.2} y={16.6} width={1.5} height={8} />
    <rect x={26} y={23.8} width={3.5} height={1.6} rx={0.6} />
    <rect x={26.6} y={25} width={2.3} height={2.6} rx={1} />
  </g>
</>;
/* sparklines (24px + gallery, measured r3): open axis — left vertical (x6, y4.5..31.5) crossed by
   two horizontal rules (y6.7 and y30, x5..31); a slim 1.8u blue zigzag between them ending in a
   short down-tail. */
const sparkAxis69 = (): React.ReactElement => <>{l69('M6 4.5V31.5M5 6.7H31M5 30H31', T69.ink, 1.4)}</>;
icons['ribbon-insert-sparkline-gallery'] = <>{sparkAxis69()}{l69('M7.5 25.5L10.5 20.5L14 28L18 15.5L21.5 20.5L24.5 16.5L27 19.5', GEARBLUE, 1.8)}</>;
icons['ribbon-button-sparklines'] = <>{sparkAxis69()}{l69('M7.5 25.5L10.5 20.5L14 28L18 15.5L21.5 20.5L24.5 16.5L27 19.5', GEARBLUE, 1.8)}</>;

/* --- Pivot contextual tabs -------------------------------------------------------------
   TASK 69 r4 (re-measured with .probe/t69/cmap_ctx.py colour maps + per-icon pairs):
   the Analyze "pivot document" motif (move / clear / fields-items-sets / options /
   field-setting): full-box sheet with a #666 frame holding three header blocks — a small
   square top-left, a long bar top-right, a column bar below the square — each a pale
   #c8c8c8 fill with a thin #7f7f7f outline. The 24px variant fits a margin; the 16px
   variant fills the whole box. */
const pbar69 = (x: number, y: number, w: number, h: number): React.ReactElement => (
  <rect x={x} y={y} width={w} height={h} fill="#c8c8c8" stroke="#7f7f7f" strokeWidth={1.1} />
);
const pivotDoc69 = (): React.ReactElement => (
  <>
    <rect x={3} y={3} width={24} height={26} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />
    {pbar69(5.5, 5, 4.5, 4.5)}
    {pbar69(13, 5, 12.5, 4.5)}
    {pbar69(5.5, 12.5, 4.5, 12.5)}
  </>
);
const pivotDoc16 = (): React.ReactElement => (
  <>
    <rect x={1.2} y={4.4} width={29.6} height={26.6} fill={T69.white} stroke={T69.ink} strokeWidth={1.7} />
    {pbar69(4.4, 6.4, 5.6, 5.6)}
    {pbar69(12.4, 6.4, 15.6, 5.6)}
    {pbar69(4.4, 13, 5.6, 15.4)}
  </>
);
icons['ribbon-button-pivot-table-analyze-options'] = <>
  {pivotDoc16()}
  <rect x={14.6} y={16.2} width={16.2} height={14.8} fill={T69.white} stroke={T69.ink} strokeWidth={1.7} />
  {[[17.6, 19], [23.4, 19], [17.6, 25], [23.4, 25]].map(([x, y], i) => <rect key={i} x={x} y={y} width={4.4} height={4.4} fill={T69.blue} />)}
</>;
icons['ribbon-button-pivot-table-field-setting'] = <>
  {pivotDoc16()}
  {gear69(22.5, 22.5, 8.6, '#a8cbf2', '#5b96cf', 1.2)}
</>;
icons['ribbon-button-pivot-table-expand-field'] = <>
  {l69('M13 8H27M13 16H27M13 24H27', '#b1b1b1', 2.2)}
  {l69('M6 8V16M2 12H10', '#7fd49a', 2.6)}
</>;
icons['ribbon-button-pivot-table-collapse-field'] = <>
  {l69('M13 8H27M13 16H27M13 24H27', '#b1b1b1', 2.2)}
  {l69('M2 12H10', '#e59187', 2.6)}
</>;
icons['ribbon-button-pivot-table-filter-connections'] = <>
  <rect x={3} y={3.5} width={24} height={21} fill={T69.white} stroke="#b0b0b0" strokeWidth={1.3} />
  {l69('M3 10.5H27M3 17.5H27M9.5 3.5V24.5M15.5 3.5V24.5M21.5 3.5V24.5', '#d4d4d4', 1.15)}
  <circle cx={23.5} cy={22} r={10} fill={T69.white} />
  {gear69(23.5, 22, 7.4, '#a8cbf2', '#7fb3e0', 1.1)}
</>;
icons['ribbon-button-pivot-table-group-selection'] = <>
  {l69('M2 15.5H22', '#81befc', 3)}
  <path d="M18 10.5L25.5 15.5 18 20.5" fill="none" stroke="#81befc" strokeWidth={2.6} strokeLinejoin="miter" />
</>;
icons['ribbon-button-pivot-table-ungroup'] = <>
  <rect x={8} y={8.5} width={7.5} height={21.5} fill={T69.white} stroke="#a6a6a6" strokeWidth={1.6} />
  <rect x={17} y={8.5} width={13.5} height={21.5} fill={T69.white} stroke="#a6a6a6" strokeWidth={1.6} />
  {l69('M17 13.5H30.5M17 21.5H30.5', '#a6a6a6', 1.5)}
  <rect x={1.5} y={11.5} width={11} height={11} rx={1.2} fill={T69.white} stroke="#e8907f" strokeWidth={2} />
  {l69('M3.8 20.2L10.2 13.8', '#e8907f', 2)}
</>;
icons['ribbon-button-pivot-table-group-field'] = <>
  <rect x={1.5} y={5} width={29} height={25.5} fill={T69.white} stroke="#bdbdbd" strokeWidth={2} />
  {l69('M7 1.5V6M23 1.5V6', '#8c8c8c', 1.8)}
  {l69('M1.5 11H30.5', '#bdbdbd', 1.5)}
  {l69('M10.5 14.5H20L14.8 28', '#8c8c8c', 2.4)}
</>;
icons['ribbon-button-pivot-table-refresh'] = <>
  <path d="M3.5 28.5V2.5H14L21 9.5V28.5Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.35} strokeLinejoin="miter" />
  {l69('M14 2.5V9.5H21', T69.ink, 1.35)}
  {l69('M12.6 17.6a5.6 5.6 0 0 1 9.6-1', T69.green, 1.9)}
  {l69('M22.4 22.4a5.6 5.6 0 0 1-9.6 1', T69.green, 1.9)}
  <path d="M22.9 14.8l0.9 3.6-3.6 0.7Z" fill={T69.green} />
  <path d="M12.1 25.2l-0.9-3.6 3.6-0.7Z" fill={T69.green} />
</>;
icons['ribbon-button-pivot-table-changeDataSource'] = <>
  <path d="M5 27V3H16L22 9V27Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.4} strokeLinejoin="miter" />
  {l69('M16 3V9H22', T69.ink, 1.4)}
  {table69(15, 15, 14, 14)}
  {l69('M20 22H29', T69.blue, 2.2)}
  <path d="M25.5 18L29.5 22 25.5 26" fill="none" stroke={T69.blue} strokeWidth={1.7} strokeLinejoin="miter" />
</>;
icons['ribbon-button-pivot-table-clear'] = <>
  {pivotDoc69()}
  <g transform="rotate(-45 21.5 22)">
    <rect x={14} y={18.3} width={15} height={7.6} rx={1.8} fill="#e5968c" stroke="#d87f74" strokeWidth={1.2} />
    <rect x={22.6} y={19.1} width={5.6} height={6} fill="#efb8ae" />
  </g>
</>;
icons['ribbon-button-pivot-table-clear-all'] = <>
  <rect x={4} y={4} width={18} height={18} fill={T69.white} stroke={T69.ink} strokeWidth={1.40} />
  {l69('M7 10H19M7 14H19', '#c8c8c8', 1.4)}
  {l69('M21 13L31 23M31 13L21 23', T69.red, 2.4)}
</>;
icons['ribbon-button-pivot-table-move'] = <>
  {pivotDoc69()}
  {l69('M10.5 24.5H24', T69.blue, 1.8)}
  <path d="M21.5 19.5L27.5 24.5 21.5 29.5" fill="none" stroke={T69.blue} strokeWidth={1.8} strokeLinejoin="miter" />
</>;
icons['ribbon-button-pivot-table-fields-items-sets'] = <>
  {pivotDoc69()}
  {fx69(12, 12, 0.72, 2.9, '#262626')}
</>;
icons['ribbon-button-pivot-table-field-list'] = <>
  <rect x={6.5} y={2.5} width={18.5} height={26.5} fill={T69.white} stroke={T69.ink} strokeWidth={1.3} />
  {[5, 9.3, 13.6].map((y) => <g key={y}><rect x={8} y={y} width={2.4} height={2.4} fill="#595959" /><rect x={11.5} y={y} width={9.5} height={2.4} fill="#8f8f8f" /></g>)}
  {l69('M7 19H24.5', T69.mid, 1.3)}
  {l69('M14.5 19V28.5M7 24H24.5', T69.ink, 1.2)}
</>;
icons['ribbon-button-pivot-table-drill-button'] = <>
  <rect x={2.5} y={2.5} width={14.5} height={13} fill={T69.white} stroke={T69.ink} strokeWidth={1.25} />
  {l69('M7 9.5H15.5M11 4.5V14', T69.blue, 1.9)}
  <rect x={13.5} y={13.5} width={15.5} height={15.5} fill={T69.white} stroke={T69.ink} strokeWidth={1.25} />
  {l69('M16.5 21H25.5', T69.blue, 1.9)}
</>;
icons['ribbon-button-pivot-table-field-headers'] = <>
  <rect x={3} y={4} width={25} height={25} fill={T69.white} stroke={T69.ink} strokeWidth={1.25} />
  <rect x={3} y={4} width={25} height={7.5} fill={T69.midBlue} stroke={T69.blue} strokeWidth={1.7} />
  {l69('M3 20.5H28', T69.mid, 1.15)}
  <path d="M19 6H25L22 10.2Z" fill="#595959" />
</>;
const designCard69 = (lines: React.ReactNode): React.ReactElement => (
  <>
    <rect x={7} y={3.5} width={20} height={25.5} rx={0.6} fill={T69.white} stroke={T69.ink} strokeWidth={1.3} />
    {lines}
  </>
);
/* Measured official layout: pairs of thin 1.6u text segments (label left, value right) in the
   upper part of a tall card; per-icon left segments may be indented (outline forms). */
type Row69 = [string | null, number, number, string | null, number, number, number];
const rowsCard69 = (rows: Row69[]): React.ReactNode =>
  rows.flatMap(([l, lx1, lx2, r, rx1, rx2, y], i) => [
    l ? <path key={`l${i}`} d={`M${lx1} ${y}H${lx2}`} stroke={l} strokeWidth={1.6} fill="none" /> : null,
    r ? <path key={`r${i}`} d={`M${rx1} ${y}H${rx2}`} stroke={r} strokeWidth={1.6} fill="none" /> : null,
  ]);
const M = T69.mid; const BL = T69.blue;
icons['ribbon-button-pivot-table-subtotal'] = designCard69(rowsCard69([
  [M, 10, 18, M, 19.5, 23.5, 7],
  [M, 12, 18, M, 19.5, 23.5, 11],
  [BL, 10, 18, BL, 19.5, 23.5, 15],
]));
icons['ribbon-button-pivot-table-grand-total'] = designCard69(rowsCard69([
  [M, 12, 18, BL, 19.5, 23.5, 7],
  [M, 12, 18, BL, 19.5, 23.5, 11],
  [M, 10, 18, BL, 19.5, 23.5, 15],
  [M, 12, 18, BL, 19.5, 23.5, 19],
]));
icons['ribbon-button-pivot-table-report-layout'] = designCard69(rowsCard69([
  [BL, 10, 16, null, 0, 0, 7],
  [M, 12, 18, BL, 19.5, 23.5, 11],
  [M, 12, 18, BL, 19.5, 23.5, 15],
]));
icons['ribbon-button-pivot-table-blank-rows'] = designCard69(rowsCard69([
  [BL, 10, 16, BL, 18, 22, 7],
  [M, 12, 16, M, 18, 22, 11],
  [M, 12, 16, M, 18, 22, 15],
  [BL, 10, 16, BL, 18, 22, 19],
  [M, 12, 16, M, 18, 22, 23],
]));
icons['ribbon-button-new-pivot-table-style'] = <>
  <rect x={2} y={2} width={22} height={22} fill={T69.white} stroke={T69.blue} strokeWidth={1.8} />
  <rect x={2} y={2} width={7.3} height={7.3} fill={T69.midBlue} />
  <rect x={2} y={9.3} width={7.3} height={7.3} fill={T69.paleBlue} />
  <rect x={2} y={16.6} width={7.3} height={7.4} fill={T69.faintBlue} />
  {l69('M9.3 2V24M16.7 2V24M2 9.3H24M2 16.7H24', T69.blue, 1.3)}
  {l69('M30 6L19 17', '#9a9a9a', 3)}
  <g transform="rotate(45 17 17)">
    <rect x={13.5} y={15.5} width={7} height={3.5} fill={T69.silver} stroke={T69.mid} strokeWidth={0.84} />
    <path d="M13.5 19l-4.5 6.5 3.2 2.2 4.5-6.5Z" fill={T69.blue} />
  </g>
</>;
/* 'PivotTable Styles'/'Format as Table' (measured r4): 4x4 pale grid (#808080 outer, #b0b0b0
   inner rules) with a solid #81befc 2x2 block at cols 2-3 rows 2-3 (#367fc9 rules) plus one pale
   cell at (r2,c4); a grey paintbrush from the top-right corner to the lower-left (#367fc9
   bristles, silver ferrule). */
icons['ribbon-button-formattable'] = <>
  <rect x={3} y={3} width={24} height={24} fill={T69.white} stroke="#808080" strokeWidth={1.25} />
  {l69('M9 3V27M15 3V27M21 3V27M3 9H27M3 15H27M3 21H27', '#b0b0b0', 1.1)}
  <rect x={9} y={9} width={12} height={12} fill={T69.midBlue} />
  <rect x={21} y={9} width={6} height={6} fill={T69.paleBlue} />
  {l69('M9 9V21M15 9V21M21 9V21M9 9H21M9 15H21', T69.blue, 1.2)}
  <g strokeLinecap="round">
    {l69r('M28.8 6.2L18.8 16.2', '#8c8c8c', 3.2)}
    {l69r('M28 7L19.4 15.6', '#c9c9c9', 1.7)}
  </g>
  <g transform="rotate(45 16 16)">
    <rect x={12.6} y={14.6} width={7} height={3.6} fill="#ececec" stroke={T69.mid} strokeWidth={1} />
    <path d="M12.6 18.2l-4.1 6.1 3 2 4.1-6.1Z" fill={T69.blue} />
  </g>
</>;
icons['ribbon-thumbnail-pivot-table-active-field'] = <>
  <rect x={5} y={7} width={22} height={18} fill={T69.white} stroke={T69.ink} strokeWidth={1.40} />
  {l69('M5 14H27M13 7V25M20 7V25M5 19.5H27', '#c8c8c8', 1.5)}
</>;

/* --- Shape Format tab ------------------------------------------------------------------ */
const shapeStyleTile69 = (color: string): React.ReactElement => (
  <>
    <rect x={3} y={5} width={26} height={22} rx={4.5} fill={T69.white} stroke={color} strokeWidth={1.35} />
    <g fill="none" stroke="#262626" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.4 21L11.9 11l3.5 10M9.8 17.6h4.2" />
      <path d="M16.4 7.5V21M16.4 13.6c3.9 0 3.9 7.4 0 7.4" />
      <path d="M25.6 12.6c-.9-1.1-2-1.7-3.3-1.7-2.1 0-3.5 1.7-3.5 4.3s1.4 4.3 3.5 4.3c1.3 0 2.4-.6 3.3-1.7" />
    </g>
  </>
);
icons['ribbon-shape-style-1'] = shapeStyleTile69('#262626');
icons['ribbon-shape-style-2'] = shapeStyleTile69('#2e75b6');
icons['ribbon-shape-style-3'] = shapeStyleTile69('#ed7d31');
icons['ribbon-shape-style-4'] = shapeStyleTile69('#a6a6a6');
icons['ribbon-shape-style-5'] = shapeStyleTile69('#ffc000');
icons['ribbon-shape-style-6'] = shapeStyleTile69('#5b9bd5');
icons['ribbon-shape-style-7'] = shapeStyleTile69('#70ad47');
icons['ribbon-button-shape-change'] = <>
  <rect x={1.5} y={8} width={13} height={13} fill="none" stroke="#6f9fd8" strokeWidth={1.5} />
  <circle cx={21} cy={10} r={6.8} fill={T69.white} stroke="#6f9fd8" strokeWidth={1.5} />
  <path d="M14 21L21 28L28 21L21 14Z" fill={T69.white} stroke="#6f9fd8" strokeWidth={1.5} strokeLinejoin="miter" />
</>;
icons['ribbon-button-shape-alt-text'] = <>
  <rect x={1.5} y={2.5} width={22} height={23} fill={T69.white} stroke={T69.ink} strokeWidth={1.3} />
  <path d="M3.5 23.5L11 11l5.5 6.5 4-4.5 4.5 10.5Z" fill={T69.paleBlue} stroke="#4a87c8" strokeWidth={1.35} strokeLinejoin="round" />
  <circle cx={19.5} cy={8.5} r={2.2} fill="#e07030" />
  <rect x={13.5} y={17.5} width={16.5} height={12.5} fill={T69.white} stroke="#4a87c8" strokeWidth={1.5} />
  {l69('M17 22H27M17 25.5H24', '#8f8f8f', 1.9)}
</>;
icons['ribbon-button-rotate-shape'] = <>
  {l69('M4.5 15A7 7 0 1 1 8 3.5', T69.blue, 1.8)}
  <path d="M8.5 0.5L14.5 4.5 9.5 8.5 8.5 4.5Z" fill={T69.blue} />
  <path d="M3 27H15V10Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.7} strokeLinejoin="miter" />
  <path d="M17 27H29V9Z" fill="#808080" />
</>;
icons['ribbon-thumbnail-shape-rotate'] = <>{l69('M23.5 11a10 10 0 1 0 2 8', T69.blue, 2.4)}<path d="M19 2l7 5.5-8 3z" fill={T69.blue} />{rect(11, 12, 10, 8, T69.faintBlue, 1, T69.blue)}</>;
icons['ribbon-button-shape-group'] = <>
  <rect x={6} y={3} width={13} height={10} fill={T69.white} stroke="#8f8f8f" strokeWidth={1.5} />
  <rect x={12} y={8} width={13} height={10} fill={T69.white} stroke="#8f8f8f" strokeWidth={1.5} />
  <rect x={3} y={1} width={4} height={4} fill="#a9c9ea" />
  <rect x={24} y={1} width={4} height={4} fill="#a9c9ea" />
  <rect x={3} y={22} width={4} height={4} fill="#a9c9ea" />
  <rect x={24} y={22} width={4} height={4} fill="#a9c9ea" />
</>;
icons['ribbon-thumbnail-shape-group'] = <>
  <rect x={5} y={5} width={10} height={10} fill={T69.faintBlue} stroke={T69.blue} strokeWidth={1.12} />
  <rect x={13} y={13} width={12} height={12} fill={T69.white} stroke={T69.ink} strokeWidth={1.12} />
  {l69('M27 14.5H30M27 17.5H30', T69.mid, 1.4)}
</>;
icons['ribbon-thumbnail-shapealign'] = <>
  {l69('M4 3V29', T69.ink, 1.5)}
  <rect x={7} y={4} width={8} height={5} fill={T69.white} stroke={T69.ink} strokeWidth={1.35} />
  <rect x={7} y={11} width={16} height={5} fill={T69.white} stroke={T69.ink} strokeWidth={1.35} />
  <rect x={7} y={18} width={12} height={5} fill={T69.white} stroke={T69.ink} strokeWidth={1.35} />
  {l69('M28 26H14', T69.blue, 2)}
  <path d="M17.5 22.5L13.5 26 17.5 29.5" fill="none" stroke={T69.blue} strokeWidth={2} strokeLinejoin="miter" />
</>;
icons['ribbon-thumbnail-shape-align'] = icons['ribbon-thumbnail-shapealign'];
const zsquares69 = (frontYellow: boolean): React.ReactElement => {
  const yellow = <rect x={4} y={4} width={15} height={15} fill="#fae3b0" stroke="#e5b873" strokeWidth={1.8} />;
  const white = <rect x={12} y={12} width={15} height={15} fill={T69.white} stroke="#9a9a9a" strokeWidth={1.8} />;
  return frontYellow ? <>{white}{yellow}</> : <>{yellow}{white}</>;
};
icons['ribbon-button-shape-bring-forward'] = zsquares69(true);
icons['ribbon-button-shape-send-backward'] = zsquares69(false);
icons['ribbon-button-shape-bring-to-front'] = zsquares69(true);
icons['ribbon-button-shape-send-to-back'] = zsquares69(false);
icons['ribbon-button-formatPane'] = <>
  <path d="M15 6L25 16L15 26L5 16Z" fill={T69.white} stroke={T69.ink} strokeWidth={1.40} strokeLinejoin="miter" />
  <circle cx={15} cy={4.5} r={2} fill={T69.white} stroke={T69.ink} strokeWidth={1.05} />
  {l69('M29 9L20 18', '#9a9a9a', 3)}
  <g transform="rotate(45 19 18)">
    <rect x={15.5} y={16.5} width={7} height={3.5} fill={T69.silver} stroke={T69.mid} strokeWidth={0.84} />
    <path d="M15.5 20l-4.5 6.5 3.2 2.2 4.5-6.5Z" fill={T69.blue} />
  </g>
</>;
icons['ribbon-button-format-pane'] = icons['ribbon-button-formatPane'];
icons['ribbon-thumbnail-shape-format-pane'] = icons['ribbon-button-formatPane'];

/* ================================================================================
 * TASK 74 — contextual-tab artwork (Table Design / Chart Design / Sparkline /
 * re-grouped Shape Format). Every glyph is hand-drawn vector geometry here; the
 * motifs (what each official icon *means* and its rough palette) were read from
 * the running trial's rendered tabs — no bitmap, path or colour table was copied.
 * ================================================================================ */
/** Shared mini-chart frame for the contextual families. */
const frame74 = (w = 22, h = 17, x = 5, y = 8, stroke = T69.mid, fill = T69.white): React.ReactElement =>
  <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={1.4} />;
/** Thin table: header band + column rules (Table Design family body). */
const table74 = (accent: string): React.ReactElement => (
  <>
    <rect x={4.5} y={5.5} width={23} height={21} fill={T69.white} stroke={T69.ink} strokeWidth={1.5} />
    <rect x={4.5} y={5.5} width={23} height={6} fill={accent} />
    {l69('M4.5 17H27.5M4.5 22.5H27.5M12.5 11.5V26.5M19.5 11.5V26.5', '#cfcfcf', 1.1)}
  </>
);
/** Clustered 4-series bars (chart family body). */
const BARS74: [string, number][] = [['#4472c4', 12], ['#ed7d31', 7], ['#a5a5a5', 9], ['#ffc000', 5]];
const cluster74 = (x: number, y: number, k = 1): React.ReactElement => (
  <g>
    {BARS74.map(([c, h], index) =>
      <rect key={index} x={x + index * 5 * k} y={y - h * k} width={4 * k} height={h * k} fill={c} />)}
  </g>
);
const plus74 = (cx: number, cy: number, s = 5, color = T69.green): React.ReactElement =>
  <>{l69(`M${cx} ${cy - s}V${cy + s}M${cx - s} ${cy}H${cx + s}`, color, 3)}</>;
/** Tiny blue database cylinder (data-table badge). */
const cylinder74 = (x: number, y: number): React.ReactElement => (
  <>
    <path d={`M${x} ${y + 2.5}a4.5 2.5 0 0 1 9 0v9a4.5 2.5 0 0 1 -9 0Z`} fill={T69.faintBlue} stroke={GEARBLUE} strokeWidth={1.3} />
    {l69(`M${x} ${y + 6}a4.5 2.5 0 0 0 9 0M${x} ${y + 9.5}a4.5 2.5 0 0 0 9 0`, GEARBLUE, 1)}
  </>
);
/** Blue double arrow (resize/move accents). */
const arrow74 = (d: string, color = GEARBLUE, sw = 2.2): React.ReactElement =>
  <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="butt" strokeLinejoin="miter" />;
/** Quarter-turn curved arrow with head (Shape Format Rotate rows). */
const rotateArrow74 = (flip: boolean): React.ReactElement => (
  <g transform={flip ? 'translate(32 0) scale(-1 1)' : undefined}>
    <rect x={13.5} y={11.5} width={12} height={12} fill={T69.faintBlue} stroke={GEARBLUE} strokeWidth={1.3} />
    <path d="M27.5 9.5A13 13 0 0 0 6 12" fill="none" stroke={GEARBLUE} strokeWidth={2} strokeLinecap="butt" />
    <path d="M2.6 12.8L7.6 10.6 7.2 16.2Z" fill={GEARBLUE} />
  </g>
);
/** One row of the Align family: anchor bar + two shape squares. */
const alignRow74 = (anchor: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): React.ReactElement => {
  const vertical = anchor === 'top' || anchor === 'bottom';
  const edge = anchor === 'left' || anchor === 'top' ? 4.5 : anchor === 'right' || anchor === 'bottom' ? 26 : 15.5;
  const bar = vertical
    ? <rect x={5} y={edge} width={22} height={2.4} fill={T69.graphite} />
    : <rect x={edge} y={5} width={2.4} height={22} fill={T69.graphite} />;
  const cell = (x: number, y: number, key: string, filled: boolean): React.ReactElement =>
    <rect key={key} x={x} y={y} width={8} height={8} fill={filled ? T69.midBlue : T69.white} stroke={GEARBLUE} strokeWidth={1.3} />;
  const pos: Record<string, [number, number][]> = {
    left: [[7.5, 6], [7.5, 17]], center: [[11.5, 6], [11.5, 17]], right: [[15.5, 6], [15.5, 17]],
    top: [[6, 7.5], [17, 7.5]], middle: [[6, 11.5], [17, 11.5]], bottom: [[6, 15.5], [17, 15.5]],
  };
  const pair = pos[anchor] ?? pos.left;
  return <>{bar}{cell(...pair[0], 'a', anchor !== 'middle' && anchor !== 'center')}{cell(...pair[1], 'b', false)}</>;
};
/** Distribute rows: three squares + double arrow showing even gaps. */
const distribute74 = (horizontal: boolean): React.ReactElement => (
  <g transform={horizontal ? undefined : 'rotate(90 16 16)'}>
    {[4.5, 12.5, 20.5].map((x, index) => <rect key={index} x={x} y={11.5} width={9} height={9} fill={index === 1 ? T69.midBlue : T69.white} stroke={GEARBLUE} strokeWidth={1.3} />)}
    {arrow74('M2.5 5.5H29.5M6.5 2.5L2.5 5.5L6.5 8.5M25.5 2.5L29.5 5.5L25.5 8.5', T69.graphite, 1.8)}
  </g>
);
/* ---- Table Design commands ------------------------------------------------------------ */
icons['ribbon-button-resize-table'] = <>
  {table74(GEARBLUE)}
  <path d="M20 20L28 28M28 22.5V28H22.5" fill="none" stroke={T69.orange} strokeWidth={2.2} strokeLinecap="butt" />
</>;
icons['ribbon-button-converttorange'] = <>
  <rect x={3.5} y={6.5} width={15} height={19} fill={T69.white} stroke={GEARBLUE} strokeWidth={1.5} />
  <rect x={3.5} y={6.5} width={15} height={5} fill={GEARBLUE} />
  {l69('M3.5 16H18.5M11.5 11.5V25.5', '#c7d8f5', 1.1)}
  {arrow74('M20.5 16H28M24.5 12.5L28 16L24.5 19.5', T69.orange, 2.2)}
</>;
icons['ribbon-button-convert-to-data-table'] = <>
  <rect x={3.5} y={6.5} width={17} height={19} fill={T69.white} stroke={T69.ink} strokeWidth={1.5} />
  <rect x={3.5} y={6.5} width={17} height={5} fill={T69.soft} />
  {l69('M3.5 16H20.5M12 11.5V25.5', '#d5d5d5', 1.1)}
  {arrow74('M22 11L27 15.5M23.5 16L27 15.5L26.5 12', T69.orange, 1.8)}
  {cylinder74(19.5, 16)}
</>;
icons['ribbon-button-convert-from-data-table'] = <>
  {cylinder74(4.5, 7)}
  {arrow74('M13 16L18.5 16M15.5 12.5L18.5 16L15.5 19.5', T69.orange, 1.9)}
  <rect x={19.5} y={7.5} width={9} height={17} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />
  <rect x={19.5} y={7.5} width={9} height={4.5} fill={T69.soft} />
  {l69('M19.5 17H28.5M24 12V24.5', '#d5d5d5', 1)}
</>;

/* ---- Chart Design commands ------------------------------------------------------------ */
icons['ribbon-button-add-chart-element'] = <>
  {cluster74(6, 26, 1.05)}
  {plus74(26, 8, 5)}
</>;
icons['ribbon-button-quick-layout'] = <>
  <rect x={4.5} y={4.5} width={23} height={23} fill={T69.white} stroke={T69.mid} strokeWidth={1.4} />
  <rect x={10.5} y={7} width={11} height={3} fill={T69.graphite} />
  {[12.5, 17, 21.5].map((x, index) => <rect key={index} x={x} y={24 - [9, 5, 7][index]} width={3} height={[9, 5, 7][index]} fill={['#4472c4', '#ed7d31', '#a5a5a5'][index]} />)}
  {l69('M8 24H27', T69.soft, 1.2)}
</>;
icons['ribbon-button-change-colors'] = <>
  {[[10, 8, '#4472c4'], [18, 7, '#ed7d31'], [23, 12, '#ffc000'], [8, 16, '#70ad47'], [16, 17, '#a5a5a5'], [23, 22, '#4472c4'], [11, 24, '#ed7d31']].map(([cx, cy, c], index) =>
    <circle key={index} cx={cx as number} cy={cy as number} r={4.4} fill={c as string} />)}
</>;
icons['ribbon-button-chart-styles'] = <>
  <rect x={4.5} y={4.5} width={23} height={18} fill={T69.white} stroke={T69.mid} strokeWidth={1.4} />
  {[9.5, 14, 18.5].map((x, index) => <rect key={index} x={x} y={19 - [9, 5, 7][index]} width={3.2} height={[9, 5, 7][index]} fill={['#4472c4', '#ed7d31', '#a5a5a5'][index]} />)}
  {l69('M7 19H25', T69.soft, 1.2)}
  <path d="M4 24.5H28V28.5H4Z" fill={T69.blue} />
  <path d="M24 22.5l5 2 -5 2Z" fill={T69.deep} />
</>;
icons['ribbon-button-switch-row-column'] = <>
  <rect x={7.5} y={7.5} width={17} height={17} fill={T69.white} stroke={T69.mid} strokeWidth={1.4} />
  {l69('M7.5 13H24.5M7.5 18.5H24.5M13 7.5V24.5M18.5 7.5V24.5', '#e0e0e0', 1)}
  {arrow74('M4 11H21M17.5 7.5L21 11L17.5 14.5', GEARBLUE, 2)}
  {arrow74('M28 21H11M14.5 17.5L11 21L14.5 24.5', T69.yellow, 2.4)}
</>;
icons['ribbon-button-selectData'] = <>
  <rect x={4.5} y={6.5} width={23} height={19} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />
  <rect x={4.5} y={6.5} width={23} height={4.5} fill={T69.soft} />
  {l69('M4.5 15H27.5M4.5 20.5H27.5M12.5 11V25.5M19.5 11V25.5', '#dcdcdc', 1)}
  <rect x={12.5} y={11} width={7} height={4} fill={T69.midBlue} stroke={GEARBLUE} strokeWidth={1.1} />
  {l69('M6.5 23.5L10.5 20.5L14.5 22.5L18.5 18.5L22.5 21.5', T69.orange, 1.6)}
  {circle(18.5, 18.5, 1.5, T69.orange)}
</>;
icons['ribbon-button-change-chart-type'] = <>
  {axis69()}
  {cluster74(11.5, 26, 0.95)}
  <path d="M7 4.5A11 11 0 0 1 25 8" fill="none" stroke={T69.orange} strokeWidth={2} strokeLinecap="butt" />
  <path d="M25 3L25.4 9 20 6.6Z" fill={T69.orange} />
</>;
icons['ribbon-button-move-chart'] = <>
  {frame74(20, 16, 6, 6)}
  {[10, 14, 18].map((x, index) => <rect key={index} x={x} y={18 - [6, 3.5, 5][index]} width={2.6} height={[6, 3.5, 5][index]} fill={['#4472c4', '#ed7d31', '#a5a5a5'][index]} />)}
  {arrow74('M16 22.5V29M13 26.5L16 29.5 19 26.5M8 24.5h-4.5M3.5 24.5l3-2.5M3.5 24.5l3 2.5M24 24.5h4.5M28.5 24.5l-3-2.5M28.5 24.5l-3 2.5', T69.mid, 1.6)}
</>;
icons['ribbon-button-chart-alt-text'] = <>
  <rect x={4.5} y={6.5} width={23} height={19} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />
  <path d="M6.5 22L11 15l3.5 4 3-6 8 9Z" fill={T69.midBlue} />
  <circle cx={9.5} cy={11} r={2.2} fill={T69.yellow} />
  <rect x={6.5} y={25.5} width={12} height={2.4} fill={T69.graphite} />
  <path d="M21.5 24.5l6 6M27.5 27.5l3-3" stroke={GEARBLUE} strokeWidth={2} fill="none" strokeLinecap="butt" />
</>;
icons['ribbon-button-formula-sparkline-settings'] = <>
  {l69('M3 22l6-7 5 4 6-9 7 5', T69.blue, 2.2)}
  {gear69(24, 24, 6.5, GEARBLUE, undefined, 0, 8)}
</>;

/* ---- Sparkline commands --------------------------------------------------------------- */
icons['ribbon-button-sparkline-line-type'] = <>
  {l69('M4 22l6-8 5 5 6-11 7 6', T69.blue, 2.4)}
  {[[4, 22], [10, 14], [15, 19], [21, 8], [28, 14]].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r={1.6} fill={T69.midBlue} stroke={T69.blue} strokeWidth={1} />)}
</>;
icons['ribbon-button-sparkline-column-type'] = <>
  {cluster74(6.5, 25.5, 1.05)}
  {l69('M4 25.5H28', T69.mid, 1.4)}
</>;
icons['ribbon-button-sparkline-winloss-type'] = <>
  {l69('M4 16H28', T69.mid, 1.6)}
  {[[6, 6], [13, 3.5], [20, 4.5]].map(([x, h], index) => <rect key={`u${index}`} x={x} y={15 - h} width={4.5} height={h} fill={T69.green} />)}
  {[[9.5, 5], [16.5, 7], [23.5, 3.5]].map(([x, h], index) => <rect key={`d${index}`} x={x} y={17} width={4.5} height={h} fill={T69.redSoft} />)}
</>;
icons['sparkline-color-icon'] = <>
  {l69('M4 24l7-9 5 4 6-9 6 5', T69.blue, 2.4)}
  <rect x={3.5} y={3.5} width={9} height={7} fill={T69.blue} stroke={T69.deep} strokeWidth={1.2} />
</>;
icons['ribbon-button-sparkline-marker-color'] = <>
  {[6, 12, 18].flatMap((x, row) => [6, 12, 18].map((y, col) => {
    const colors = [['#4472c4', '#ed7d31', '#a5a5a5'], ['#ffc000', '#70ad47', '#4472c4'], ['#ed7d31', '#a5a5a5', '#70ad47']];
    return <circle key={`${row}-${col}`} cx={x + 2} cy={y + 2} r={3.4} fill={colors[row][col]} />;
  }))}
</>;
icons['ribbon-button-sparkline-group'] = <>
  <rect x={4.5} y={8.5} width={10} height={15} fill={T69.faintBlue} stroke={GEARBLUE} strokeWidth={1.3} />
  <rect x={17.5} y={8.5} width={10} height={15} fill={T69.faintBlue} stroke={GEARBLUE} strokeWidth={1.3} />
  {l69('M6 20l3.5-5 3 3 2.5-4M19 20l3.5-5 3 3 2.5-4', T69.blue, 1.6)}
  {l69('M14 6H25M14 6V11M25 26H14M25 26V21', T69.green, 1.8)}
</>;
icons['ribbon-button-sparkline-ungroup'] = <>
  <rect x={4.5} y={8.5} width={10} height={15} fill={T69.faintBlue} stroke={GEARBLUE} strokeWidth={1.3} />
  <rect x={17.5} y={8.5} width={10} height={15} fill={T69.faintBlue} stroke={GEARBLUE} strokeWidth={1.3} />
  {l69('M6 20l3.5-5 3 3 2.5-4M19 20l3.5-5 3 3 2.5-4', T69.blue, 1.6)}
  {l69('M15.5 4L22 11M22 4L15.5 11', T69.red, 2.2)}
</>;
icons['ribbon-button-clearall'] = <>
  <path d="M8 27.5L20 14l6.5 6.5L14 31H8Z" fill="#f8cbad" stroke={T69.orange} strokeWidth={1.4} strokeLinejoin="round" />
  {l69('M8 27.5L14 31M20 14L26.5 20.5', '#c66', 1.2)}
  {l69('M6 12l6-7 5 4 6-9 6 5', '#c9c9c9', 2.2)}
  {circle(23, 10, 1.5, T69.midBlue)}
</>;

/* ---- Add Chart Element flyout glyphs -------------------------------------------------- */
icons['ribbon-control-dropdown-axes'] = <>
  {l69('M8 4V28H28', T69.ink, 1.8)}
  {arrow74('M13 12H23M17 8.5L13 12 17 15.5M19 21H9M12 17.5L9 21 12 24.5', GEARBLUE, 1.8)}
</>;
icons['ribbon-control-dropdown-axistitles'] = <>
  {l69('M12 4V24H30', T69.ink, 1.8)}
  <rect x={4.5} y={10} width={3.4} height={14} fill={T69.graphite} />
  <rect x={13} y={26} width={15} height={3.4} fill={T69.graphite} />
</>;
icons['ribbon-control-dropdown-charttitle'] = <>
  {frame74(23, 19, 4.5, 7)}
  <rect x={11} y={10} width={10} height={3} fill={T69.graphite} />
</>;
icons['ribbon-control-dropdown-errorbar'] = <>
  {cluster74(8, 26, 1)}
  {l69('M10.5 6.5V12M8 6.5H13M21 12.5V17M18.5 12.5H23.5', T69.ink, 1.6)}
</>;
icons['ribbon-control-dropdown-gridlines'] = <>
  {l69('M5 11H27M5 17H27M5 23H27M11 5V27M17 5V27M23 5V27', '#c9c9c9', 1.3)}
  {l69('M5 5V27H27', T69.ink, 1.8)}
</>;
icons['ribbon-control-dropdown-datalabels'] = <>
  {cluster74(7, 27, 1)}
  <rect x={10.5} y={7.5} width={6} height={4.5} fill={T69.white} stroke={T69.mid} strokeWidth={1.1} />
  <rect x={17} y={3.5} width={6} height={4.5} fill={T69.white} stroke={T69.mid} strokeWidth={1.1} />
  {l69('M12 10H14.5M18.5 6H21', T69.mid, 1.2)}
</>;
icons['ribbon-control-dropdown-legend'] = <>
  {frame74(22, 14, 5, 6)}
  {[9, 13.5, 18].map((x, index) => <rect key={index} x={x} y={16 - [6, 3.5, 5][index]} width={2.5} height={[6, 3.5, 5][index]} fill={['#4472c4', '#ed7d31', '#a5a5a5'][index]} />)}
  {l69('M7 16H25', T69.soft, 1.2)}
  {['#4472c4', '#ed7d31', '#a5a5a5'].map((c, index) => <g key={c}><rect x={5.5 + index * 8.5} y={23} width={3} height={3} fill={c} /><rect x={9.5 + index * 8.5} y={23.8} width={4} height={1.5} fill={T69.soft} /></g>)}
</>;
icons['ribbon-control-dropdown-trendline'] = <>
  {l69('M4 25l6-7 5 3 6-9 7 5', T69.mid, 2)}
  {l69('M4 24L28 7', T69.red, 2)}
  {l69('M4 24l4-1.7M10.5 20.6l3.5-1.5', T69.white, 1.4)}
</>;

/* ---- Weight combo line glyphs (thickness = the value it writes) ------------------------ */
const weightLine74 = (w: number): React.ReactElement =>
  <rect x={4} y={16 - w / 2} width={24} height={w} rx={w / 2} fill={T69.graphite} />;
icons['ribbon-control-dropdown-sparkline-dot25'] = weightLine74(1.2);
icons['ribbon-control-dropdown-sparkline-dot1'] = weightLine74(2.4);
icons['ribbon-control-dropdown-sparkline-dot225'] = weightLine74(4);
icons['ribbon-control-dropdown-sparkline-dot3'] = weightLine74(5.4);
icons['ribbon-control-dropdown-sparkline-dot45'] = weightLine74(7);
icons['ribbon-control-dropdown-sparkline-dot6'] = weightLine74(9);
icons['ribbon-control-dropdown-sparkline-weight-custom'] = <>
  {l69('M4 20H28', T69.graphite, 3)}
  {[6, 12, 18].map((x) => <rect key={x} x={x} y={4} width={3} height={3} fill={T69.soft} />)}
  {l69('M7.5 5.5L22 17.5', GEARBLUE, 1.4)}
  <path d="M22 17.5l4 3 -2 3 -4 -3Z" fill={T69.midBlue} stroke={GEARBLUE} strokeWidth={1} />
</>;

/* ---- Shape Format row glyphs (Rotate/Align/Arrange flyouts) --------------------------- */
icons['ribbon-button-rotate-right-90'] = rotateArrow74(false);
icons['ribbon-button-rotate-left-90'] = rotateArrow74(true);
icons['ribbon-button-shape-align-left'] = alignRow74('left');
icons['ribbon-button-shape-align-center'] = alignRow74('center');
icons['ribbon-button-shape-align-right'] = alignRow74('right');
icons['ribbon-button-shape-align-top'] = alignRow74('top');
icons['ribbon-button-shape-align-middle'] = alignRow74('middle');
icons['ribbon-button-shape-align-bottom'] = alignRow74('bottom');
icons['ribbon-button-shape-distribute-horizontal'] = distribute74(true);
icons['ribbon-button-shape-distribute-vertical'] = distribute74(false);
icons['ribbon-button-shape-snap-grid'] = <>
  {l69('M6 11H26M6 16H26M6 21H26M11 6V26M16 6V26M21 6V26', '#c9c9c9', 1.2)}
  <rect x={12.5} y={12.5} width={9} height={9} fill={T69.midBlue} stroke={GEARBLUE} strokeWidth={1.4} />
  <circle cx={12.5} cy={12.5} r={1.8} fill={T69.red} />
</>;
icons['ribbon-button-shape-snap-shape'] = <>
  <rect x={5} y={9.5} width={9} height={13} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />
  <rect x={14} y={9.5} width={9} height={13} fill={T69.midBlue} stroke={GEARBLUE} strokeWidth={1.4} />
  {arrow74('M26 16h4M27.5 13.5L30 16 27.5 18.5', T69.graphite, 1.6)}
  <rect x={23.5} y={9.5} width={2.2} height={13} fill={T69.red} />
</>;
icons['ribbon-thumbnail-shape-bring-forward'] = <>
  <rect x={6.5} y={6.5} width={13} height={13} fill={T69.white} stroke={T69.mid} strokeWidth={1.4} />
  <rect x={13} y={13} width={13} height={13} fill={T69.yellow} stroke={T69.gold} strokeWidth={1.4} />
</>;
icons['ribbon-thumbnail-shape-send-backward'] = <>
  <rect x={13} y={13} width={13} height={13} fill={T69.white} stroke={T69.mid} strokeWidth={1.4} />
  <rect x={6.5} y={6.5} width={13} height={13} fill={T69.yellow} stroke={T69.gold} strokeWidth={1.4} />
</>;

/* ---- Adaptive group thumbnails (collapsed contextual ribbons) -------------------------
 * Same artwork as the family's main glyph, aliased to the trial's group names. */
icons['ribbon-thumbnail-properties'] = <>
  <rect x={4.5} y={5.5} width={23} height={7} fill={T69.white} stroke={T69.mid} strokeWidth={1.3} />
  <rect x={4.5} y={16.5} width={23} height={9} fill={T69.white} stroke={GEARBLUE} strokeWidth={1.5} />
  {l69('M7.5 8.5H17', T69.mid, 1.4)}
  {l69('M7.5 21H13', T69.graphite, 1.6)}
</>;
icons['ribbon-thumbnail-tools'] = <>
  <path d="M21.5 4.5a7 7 0 0 0-9.6 9.6L4.5 21.5l6 6 7.4-7.4a7 7 0 0 0 9.6-9.6l-4.6 4.6-4-4Z" fill={T69.silver} stroke={T69.ink} strokeWidth={1.5} strokeLinejoin="round" />
  <circle cx={23.5} cy={23.5} r={3.5} fill={T69.white} stroke={T69.ink} strokeWidth={1.5} />
</>;
icons['ribbon-thumbnail-tablestyleoptions'] = <>
  {[[5, 6], [5, 15], [5, 24]].map(([x, y], index) => <rect key={index} x={x} y={y} width={7} height={7} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />)}
  {l69('M6.5 9.5l1.6 1.8 2.4-3M6.5 18.5l1.6 1.8 2.4-3', T69.blue, 1.5)}
  {[13, 13, 13].map((x, index) => <rect key={index} x={x} y={[6, 15, 24][index]} width={14} height={7} fill={['#dce6f6', '#f2f2f2', '#dce6f6'][index]} stroke="#c5c5c5" strokeWidth={1} />)}
</>;
icons['ribbon-thumbnail-tablestyles'] = table74(GEARBLUE);
icons['ribbon-thumbnail-table-binding'] = <>{cylinder74(8.5, 5)}{l69('M22 8H28M25.5 4.5L28 8 25.5 11.5', T69.orange, 1.8)}<rect x={20.5} y={16.5} width={8} height={11} fill={T69.white} stroke={T69.ink} strokeWidth={1.3} /><rect x={20.5} y={16.5} width={8} height={3.4} fill={T69.soft} /></>;
icons['ribbon-thumbnail-chartlayouts'] = icons['ribbon-button-quick-layout'];
icons['ribbon-thumbnail-chartstyles'] = icons['ribbon-button-chart-styles'];
icons['ribbon-thumbnail-chartdata'] = icons['ribbon-button-selectData'];
icons['ribbon-thumbnail-charttype'] = icons['ribbon-button-change-chart-type'];
icons['ribbon-thumbnail-chartlocation'] = icons['ribbon-button-move-chart'];
icons['ribbon-thumbnail-chart-alt-text'] = icons['ribbon-button-chart-alt-text'];
icons['ribbon-thumbnail-formatPane'] = icons['ribbon-button-formatPane'];
icons['ribbon-thumbnail-argument'] = <>
  {l69('M16 4V28', T69.ink, 2)}
  <path d="M8 8h9c3.5 0 3.5 8 0 8h9" fill="none" stroke={GEARBLUE} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
  {gear69(6.5, 25, 5, T69.orange, undefined, 0, 8)}
</>;
icons['ribbon-thumbnai-sparkline-type'] = icons['ribbon-button-sparkline-line-type'];
icons['ribbon-thumbnail-sparkline-show'] = <>
  {l69('M4 22l6-8 5 5 6-11 7 6', T69.mid, 2)}
  {[[10, 6], [21, 8], [15, 19], [4, 22]].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r={index < 2 ? 2.4 : 1.9} fill={index === 0 ? T69.red : index === 1 ? T69.blue : index === 2 ? T69.green : T69.yellow} />)}
</>;
icons['ribbon-thumbnail-sparkline-style'] = <>
  {l69('M4 25l6-8 5 5 6-11 7 6', T69.blue, 2.4)}
  <rect x={4.5} y={4.5} width={10} height={7} fill={T69.orange} />
  <circle cx={22.5} cy={8} r={4} fill={T69.yellow} />
</>;
icons['ribbon-thumbnail-sparkline-groups'] = icons['ribbon-button-sparkline-group'];
icons['ribbon-thumbnail-shapeinsertshape'] = icons['ribbon-button-shapes'];
icons['ribbon-thumbnail-shapeStyles'] = <>{<rect x={4.5} y={6.5} width={12} height={12} fill={T69.midBlue} stroke={GEARBLUE} strokeWidth={1.4} />}<circle cx={22} cy={12.5} r={6} fill={T69.yellow} stroke={T69.gold} strokeWidth={1.4} />{l69('M6 24H26M6 28H20', T69.soft, 2)}</>;
icons['ribbon-thumbnail-shaperotate'] = icons['ribbon-button-rotate-right-90'];
icons['ribbon-thumbnail-shapegroup'] = <>
  <rect x={4.5} y={4.5} width={11} height={11} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />
  <rect x={16.5} y={16.5} width={11} height={11} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />
  {l69('M4.5 26.5H27.5M26.5 26.5V4.5M4.5 4.5V11M11 4.5H27.5', T69.blue, 2)}
</>;
icons['ribbon-thumbnail-shapealign'] = alignRow74('left');
/* 'ribbon-thumbnail-shape-arrange' already has artwork from TASK 69. */
icons['ribbon-thumbnail-shapesize'] = <>
  <rect x={8.5} y={8.5} width={15} height={15} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />
  {l69('M2.5 8.5V2.5H8.5M23.5 2.5H29.5V8.5M29.5 23.5V29.5H23.5M8.5 29.5H2.5V23.5', GEARBLUE, 2)}
</>;
icons['ribbon-thumbnail-selection-panel'] = <>
  <rect x={4.5} y={5.5} width={23} height={21} fill={T69.white} stroke={T69.ink} strokeWidth={1.4} />
  <rect x={17} y={5.5} width={10.5} height={21} fill={T69.faint} stroke={T69.ink} strokeWidth={1.4} />
  {l69('M19 10.5H25.5M19 15H25.5M19 19.5H25.5', T69.mid, 1.4)}
  <rect x={7.5} y={9} width={6} height={5} fill={T69.midBlue} stroke={GEARBLUE} strokeWidth={1.2} />
</>;

const fallbackIcons: Record<string, React.ReactNode> = {
  default: <>{rect(6, 6, 20, 20, P.paleBlue, 2, P.blue)}{line('M11 16h10M16 11v10', P.blue, 2)}</>,
};

/** Hex colours used by an icon definition (used by tests to assert multi-colour art). */
export function iconColourCount(className?: string): number {
  const node = icons[className ?? ''];
  if (!node) return 0;
  const colours = new Set<string>();
  const visit = (value: unknown): void => {
    if (!React.isValidElement(value)) return;
    const props = value.props as Record<string, unknown>;
    for (const key of ['fill', 'stroke']) if (typeof props[key] === 'string' && props[key] !== 'none') colours.add(props[key] as string);
    React.Children.forEach(props.children as React.ReactNode, visit);
  };
  visit(node);
  return colours.size;
}

export function hasIcon(className?: string): boolean { return !!className && !!icons[className]; }

export function DesignerIcon({ className, size = 16 }: IconProps): React.ReactElement {
  const content = icons[className ?? ''] ?? fallbackIcons.default;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="none"
      aria-hidden="true"
      focusable="false"
      shapeRendering="geometricPrecision"
      data-icon={className ?? ''}
    >
      {content}
    </svg>
  );
}

export const iconClassToName = (iconClass?: string): string => iconClass ?? '';
