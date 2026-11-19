#!/usr/bin/env node
/**
 * prepack/postpack hook for `npm pack` (TASK 52, drop-in packaging).
 *
 * Inside this pnpm workspace, cross-package dependencies are written with the pnpm
 * `workspace:` protocol. `npm pack` copies package.json verbatim, so a tarball packed
 * with npm would carry specs (`workspace:*`, `workspace:@opensheets/x@*`) that no npm
 * consumer can resolve. pnpm rewrites them on publish; this hook does the same for
 * `npm pack`, and restores the workspace form afterwards:
 *
 *   "x": "workspace:*"                 -> "x": "^<version-of-x>"
 *   "@mescius/x": "workspace:@opensheets/x@*" -> "@mescius/x": "npm:@opensheets/x@^<version-of-x>"
 *
 * Run from the package directory (npm does that for lifecycle scripts):
 *   node ../compat/scripts/publish-workspace-specs.mjs prepack
 *   node ../compat/scripts/publish-workspace-specs.mjs postpack
 * The original manifest is kept in `.package.json.prepack` until postpack restores it.
 */
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2];
const cwd = process.cwd();
const manifestPath = path.join(cwd, 'package.json');
const backupPath = path.join(cwd, '.package.json.prepack');
const FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'];

/** name -> version, for every package directory in this workspace. */
function workspaceVersions() {
  const root = path.resolve(cwd, '..', '..');
  const versions = new Map();
  for (const dir of fs.readdirSync(path.join(root, 'packages'))) {
    const file = path.join(root, 'packages', dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof pkg.name === 'string' && typeof pkg.version === 'string') versions.set(pkg.name, pkg.version);
  }
  return versions;
}

/** Split `workspace:[name@]range` into its parts. */
function parseWorkspace(spec) {
  const rest = spec.slice('workspace:'.length);
  const at = rest.lastIndexOf('@');
  if (at > 0) return { name: rest.slice(0, at), range: rest.slice(at + 1) };
  return { name: null, range: rest };
}

if (mode === 'prepack') {
  const original = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(original);
  const versions = workspaceVersions();
  const rewritten = [];
  for (const field of FIELDS) {
    const deps = manifest[field];
    if (!deps || typeof deps !== 'object') continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== 'string' || !spec.startsWith('workspace:')) continue;
      const { name: target, range } = parseWorkspace(spec);
      const packageName = target ?? name;
      const version = versions.get(packageName);
      if (!version) throw new Error(`prepack: cannot resolve workspace package "${packageName}" (from ${field}.${name})`);
      const caret = range === '*' || range === '' || range === '^' || range === '~' ? `^${version}` : `^${range.replace(/^\^/, '')}`;
      deps[name] = target && target !== name ? `npm:${target}@${caret}` : caret;
      rewritten.push(`${field}.${name}: ${spec} -> ${deps[name]}`);
    }
  }
  if (rewritten.length === 0) {
    console.log('prepack: no workspace: specs to rewrite');
    process.exit(0);
  }
  fs.writeFileSync(backupPath, original);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`prepack: rewrote ${rewritten.length} workspace: spec(s)\n  ${rewritten.join('\n  ')}`);
  process.exit(0);
}

if (mode === 'postpack') {
  if (!fs.existsSync(backupPath)) {
    console.log('postpack: nothing to restore');
    process.exit(0);
  }
  const original = fs.readFileSync(backupPath, 'utf8');
  fs.writeFileSync(manifestPath, original);
  fs.rmSync(backupPath);
  console.log('postpack: restored the workspace form of package.json');
  process.exit(0);
}

console.error('usage: publish-workspace-specs.mjs prepack|postpack');
process.exit(2);
