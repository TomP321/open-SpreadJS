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
