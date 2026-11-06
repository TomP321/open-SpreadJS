import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compatRoot, repoRoot, extract, type Entry } from './inventory.js';

const inventory = JSON.parse(fs.readFileSync(path.join(compatRoot, 'api-inventory.json'), 'utf8')) as {
  entries: Entry[];
};
const declarations = extract(path.join(repoRoot, 'packages/spread-sheets/dist/gc.spread.sheets.d.ts'));
const declared = new Map(declarations.entries.map((e) => [`${e.kind}:${e.path}`, e]));
const { default: GC } = (await import(
  pathToFileURL(path.join(repoRoot, 'packages/spread-sheets/dist/gc.spread.sheets.esm.js')).href
)) as { default: object };
const STUB = Symbol.for('@opensheets/NotImplemented');
type Runtime = Record<string | symbol, unknown>;
function descriptorAt(apiPath: string): PropertyDescriptor | undefined {
  let object: unknown = { GC };
  const parts = apiPath.split('.');
  for (let index = 0; index < parts.length; index++) {
    if (object == null) return;
    const descriptor = Object.getOwnPropertyDescriptor(object, parts[index]!);
    if (!descriptor) return;
    if (index === parts.length - 1) return descriptor;
    if (!('value' in descriptor)) return;
    object = descriptor.value;
  }
}
function implemented(descriptor?: PropertyDescriptor): boolean {
  if (!descriptor) return false;
  const value: unknown = descriptor.value ?? descriptor.get;
  return !(typeof value === 'function' && (value as unknown as Runtime)[STUB]);
}
function percent(done: number, total: number) {
  return total ? `${done}/${total} (${((100 * done) / total).toFixed(1)}%)` : '—';
}
interface Counts {
  classes: number;
  classTotal: number;
  methods: number;
  methodTotal: number;
  enums: number;
  enumTotal: number;
  declared: number;
  total: number;
}
const namespaces = new Map<string, Counts>();
const gaps: string[] = [];
const missing: string[] = [];
for (const entry of inventory.entries) {
  const ns = entry.namespace || 'GC';
  let counts = namespaces.get(ns);
  if (!counts)
    namespaces.set(
      ns,
      (counts = {
        classes: 0,
        classTotal: 0,
        methods: 0,
        methodTotal: 0,
        enums: 0,
        enumTotal: 0,
        declared: 0,
        total: 0,
      }),
    );
  counts.total++;
  const declaration = declared.get(`${entry.kind}:${entry.path}`);
  if (declaration) counts.declared++;
  else missing.push(entry.path);
  const descriptor = descriptorAt(entry.path);
  if (entry.kind === 'class') {
    counts.classTotal++;
    if (implemented(descriptor)) counts.classes++;
    else gaps.push(`- \`${entry.path}\`: constructor throws \`NotImplemented\`.`);
    const ctor = descriptor?.value as
      | ({ prototype?: object } & (new (...args: unknown[]) => object))
      | undefined;
    const instance =
      implemented(descriptor) && ctor
        ? new ctor(entry.path.endsWith('.Worksheet') ? 'Coverage' : undefined)
        : undefined;
    const unsupported: string[] = [];
    const seen = new Set<string>();
    for (const member of entry.members) {
      const key = `${member.kind}:${member.name}`;
      if (member.kind === 'ctor' || seen.has(key)) continue;
      seen.add(key);
      const isMethod = member.declarationKind === 'MethodDeclaration';
      const target = member.kind === 'static' ? ctor : ctor?.prototype;
      const memberDescriptor =
        (member.kind !== 'static' && instance && Object.getOwnPropertyDescriptor(instance, member.name)) ||
        (target && Object.getOwnPropertyDescriptor(target, member.name));
      const available = implemented(memberDescriptor);
      if (isMethod) {
        counts.methodTotal++;
        if (available) counts.methods++;
      }
      if (!available) unsupported.push(`${member.kind === 'static' ? 'static ' : ''}${member.name}`);
      if (!memberDescriptor) missing.push(`${entry.path}.${member.name} (runtime)`);
      if (!declaration?.members.some((m) => m.name === member.name && m.kind === member.kind))
        missing.push(`${entry.path}.${member.name} (declaration)`);
    }
    if (unsupported.length)
      gaps.push(
        `- \`${entry.path}\` members throwing \`NotImplemented\`: ${unsupported.map((m) => `\`${m}\``).join(', ')}.`,
      );
  } else if (entry.kind === 'enum') {
    counts.enumTotal++;
    const runtime = descriptor?.value as Record<string, unknown> | undefined;
    const correct =
      runtime &&
      Object.entries(entry.values!).every(
        ([key, value]) => runtime[key] === value && declaration?.values?.[key] === value,
      );
    if (correct) counts.enums++;
    else missing.push(`${entry.path} (enum value mismatch)`);
  } else if (entry.kind === 'function') {
    counts.methodTotal++;
    if (implemented(descriptor)) counts.methods++;
    else gaps.push(`- \`${entry.path}\`: function throws \`NotImplemented\`.`);
    if (!descriptor) missing.push(`${entry.path} (runtime)`);
  } else if (entry.kind === 'variable') {
    if (!implemented(descriptor))
      gaps.push(`- \`${entry.path}\`: property access throws \`NotImplemented\`.`);
    if (!descriptor) missing.push(`${entry.path} (runtime)`);
  }
}
const lines = [
  '# API coverage — SpreadJS 19.2.5 contract',
  '',
  'Generated by `pnpm coverage:api` from the public declaration inventory, our built declarations, and runtime reflection. No official runtime is loaded.',
  '',
  'Classes count implemented constructors (their remaining members may be partial). Methods include static methods and namespace functions, counting overloads once. Enums count only when every declared value matches at runtime and in our declarations. Explicit NotImplemented fallbacks do not count as implemented. Declaration presence is not behavioral compatibility.',
  '',
  '| Namespace | Classes | Methods | Enums | Declarations |',
  '| --- | ---: | ---: | ---: | ---: |',
];
const totals: Counts = {
  classes: 0,
  classTotal: 0,
  methods: 0,
  methodTotal: 0,
  enums: 0,
  enumTotal: 0,
  declared: 0,
  total: 0,
};
for (const [namespace, counts] of [...namespaces].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(
    `| ${namespace} | ${percent(counts.classes, counts.classTotal)} | ${percent(counts.methods, counts.methodTotal)} | ${percent(counts.enums, counts.enumTotal)} | ${percent(counts.declared, counts.total)} |`,
  );
  for (const key of Object.keys(totals) as (keyof Counts)[]) totals[key] += counts[key];
}
lines.push(
  `| **Total** | ${percent(totals.classes, totals.classTotal)} | ${percent(totals.methods, totals.methodTotal)} | ${percent(totals.enums, totals.enumTotal)} | ${percent(totals.declared, totals.total)} |`,
  '',
  '## M1/M2 behavior and limits',
  '',
  'Implemented: headless Workbook/Worksheet model, all 71 workbook option defaults, live options, sheets and active tabs, nested paint/event/calculation suspension, namespaced events, commands and undo/redo, sparse values/formulas/styles/tags, area-aware dimensions and sparse Fenwick layouts, structural changes, spans, selections, dirty tracking, named styles/names, ranges and note text storage. Style and validator/cell-type metadata can be stored without rendering or validation. All declared event names are constants. GeneralFormatter provides Excel format sections, conditions, colors, dates/times, elapsed time, percentages, scientific notation, fractions, padding and text, using SSF with our compatibility fixes and culture/parse adapters. See docs/STATUS.md for tested scope.',
  '',
  'Serialization: three official 19.2.5 ssjson fixtures round-trip without differences; an independently replayed public model scenario also matches. Cached formula values survive import; evaluation and dependency reference rewriting belong to M3. Unknown advanced JSON fields are preserved as opaque data, not implemented modules. Advanced export/import transformations, incremental loading, dynamic dimension strings, rich-text value variants, throw NotImplemented. Browser autoFit measures text; headless autoFit still explicitly requires a measurement context. Numeric API counts include partially supported methods and are not a claim of complete behavioral compatibility. Number-format support is bounded by the format engine; unsupported syntax throws NotImplemented. Culture registration is supported; en-US is the included culture.',
  '',
  'M2: browser hosts attach layered HiDPI canvases with viewport virtualization, rAF batching, dirty-row clips, headers, gridlines, formatted text/styles, overflow, borders, spans, frozen panes, selection/edit overlays, scrolling and tabs. Keyboard/pointer selection, editing and undo, measured auto-fit, clipboard, fill, drag-drop and basic context menus are implemented within the scenarios in docs/RENDERING.md. Part A numeric/dirty storage uses typed-array chunks. Passing bounded visual gates does not establish full rendering or interaction parity; remaining limits are in docs/STATUS.md.',
  '',
  'React: supported workbook option/event props, incremental worksheet/column configuration, keyed sheet reorder, array source/field binding, prop removal resets and lifecycle are implemented. Cell edits do not trigger React renders. currentTheme and outline-info props still require unsupported modules and throw explicitly. Alternate CSS theme filenames currently alias the white theme. Context-menu advanced filtering/sorting/comment UI actions throw NotImplemented; paste icon groups, rich external HTML formatting, browser tooltip parity, full action exports, advanced touch/accessibility, and additional layout/keyboard edge cases remain partial.',
  '',
  '## Explicit unsupported runtime APIs',
  '',
  ...gaps,
  '',
  '## Missing surfaces',
  '',
  missing.length
    ? missing.map((m) => `- ${m}`).join('\n')
    : 'None: declarations and explicit fallbacks exist. See above for implementation gaps.',
  '',
);
fs.writeFileSync(path.join(repoRoot, 'docs/API_COVERAGE.md'), lines.join('\n'));
console.log(
  `Classes ${percent(totals.classes, totals.classTotal)}; methods ${percent(totals.methods, totals.methodTotal)}; enums ${percent(totals.enums, totals.enumTotal)}; declarations ${percent(totals.declared, totals.total)}.`,
);
if (missing.length)
  throw new Error(`${missing.length} missing/mismatched API surfaces. See docs/API_COVERAGE.md.`);
