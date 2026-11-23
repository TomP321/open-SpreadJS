/**
 * TASK 94 regression tests (supervisor-found designer-compare failures).
 *
 * 1. TASK 87 generated `\${res.…}` template strings; four of them ended with an
 *    interpolation instead of a literal `}` (e.g. `\${res.${tree}.${uiKey(name)}`), so
 *    `resolveText` never matched them and raw `${res.dialogs.none` fragments leaked into
 *    aria-labels — breaking the Format Cells Font/Border/Fill specs and the precision gate.
 *    The source scan below pins the invariant "every generated placeholder template is a
 *    complete `${res.path}` string".
 * 2. The trial keeps `undoList`/`redoList` as raw machine names in aria-label/title in
 *    every language; the specs must not localize them (shell.spec.ts ribbon layout gate).
 * 3. resolveText semantics documentation test: a truncated placeholder stays as-is
 *    (that is how the leak silently survived) — a complete one resolves.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveText } from '../src/resolve.js';
import { builtinCommandSpecs } from '../src/commands/index.js';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Literals of every template in `src` that starts with `\${res.` and the tail left after
 *  removing balanced `${…}` interpolations — a generated placeholder is only resolvable
 *  when that tail ends with a literal `}`. */
function incompletePlaceholderTemplates(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const bad: string[] = [];
  const head = /`\\\$\{res\./g;
  let m: RegExpExecArray | null;
  while ((m = head.exec(src))) {
    // find the closing backtick (no escaped backticks are used in these templates)
    const end = src.indexOf('`', m.index + 1);
    if (end < 0) break;
    const body = src.slice(m.index + 1, end);
    // strip balanced interpolations, allowing one nesting level for object literals
    let literal = '';
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '\\' && body[i + 1] === '$') { literal += '$'; i++; continue; }
      if (body[i] === '$' && body[i + 1] === '{') { depth++; i++; continue; }
      if (depth > 0) { if (body[i] === '{') depth++; else if (body[i] === '}') depth--; continue; }
      literal += body[i];
    }
    if (!literal.endsWith('}')) {
      // concatenated builders like `\${res.….` + key + `}` close the placeholder in a
      // later segment — legal when the rest of the line supplies the final brace.
      const restOfLine = src.slice(end + 1, (src.indexOf('\n', end) + 1) || src.length);
      if (!/\+\s*`\\?\}/.test(restOfLine)) bad.push(body);
    }
    head.lastIndex = end;
  }
  return bad;
}

describe('TASK 94: generated ${res.…} placeholder templates stay complete', () => {
  it('no template builds a truncated placeholder (missing literal closing brace)', () => {
    const offenders: string[] = [];
    for (const file of walk(new URL('../src', import.meta.url).pathname)) {
      for (const tpl of incompletePlaceholderTemplates(file)) offenders.push(`${file.replace(/\\/g, '/').split('/src/')[1]}: \`${tpl}\``);
    }
    expect(offenders, 'templates whose result is not a resolvable ${res.path} string').toEqual([]);
  });
});

describe('TASK 94: trial machine-name labels are never localized', () => {
  it('undoList/redoList keep the raw command name as their title (aria-label in the trial)', () => {
    // Black-box: the trial renders these split buttons with aria-label/title exactly
    // "undoList"/"redoList"; shell.spec.ts compares the ribbon layout label-by-label.
    expect(builtinCommandSpecs.undoList?.title).toBe('undoList');
    expect(builtinCommandSpecs.redoList?.title).toBe('redoList');
  });
});

describe('TASK 94: resolveText semantics (why the leak was silent)', () => {
  it('resolves a complete placeholder and leaves a truncated one untouched', () => {
    const resources = { dialogs: { medium: 'Medium' } };
    expect(resolveText('${res.dialogs.medium}', resources)).toBe('Medium');
    // The old broken templates produced exactly this string; the regex needs the
    // closing brace, so it passed through unchanged (truthy) and beat the `|| fallback`.
    expect(resolveText('${res.dialogs.medium', resources)).toBe('${res.dialogs.medium');
  });
});
