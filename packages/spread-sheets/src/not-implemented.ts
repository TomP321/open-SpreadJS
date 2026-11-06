import entries from './generated/stubs.json';

export const STUB = Symbol.for('@opensheets/NotImplemented');
export function notImplemented(path: string): never { throw new Error(`NotImplemented: ${path}`); }
function fallback(path: string) {
  const fn = function () { return notImplemented(path); };
  Object.defineProperty(fn, STUB, { value: true });
  return fn;
}
type Container = Record<string, unknown>;
export function installFallbacks(root: object): void {
  const resolveParent = (parts: string[]) => {
    let parent = root as Container;
    for (const part of parts) {
      if (!Object.hasOwn(parent, part)) parent[part] = {};
      parent = parent[part] as Container;
    }
    return parent;
  };
  // Install classes before namespaces: classes may also contain nested namespaces.
  const ordered = [...entries].sort((a, b) => a.path.split('.').length - b.path.split('.').length || (a.kind === 'class' ? -1 : b.kind === 'class' ? 1 : 0));
  for (const entry of ordered) {
    const parts = entry.path.split('.').slice(1);
    const key = parts.pop();
    if (!key) continue;
    const parent = resolveParent(parts);
    if (!Object.hasOwn(parent, key)) {
      if (entry.kind === 'namespace') parent[key] = {};
      else if (entry.kind === 'class' || entry.kind === 'function') parent[key] = fallback(entry.path);
      else {
        Object.defineProperty(parent, key, { configurable: true, enumerable: true, get: fallback(entry.path), set: fallback(entry.path) });
        continue;
      }
    }
    if (entry.kind !== 'class') continue;
    const ctor = parent[key] as { prototype: Container } & Container;
    for (const member of entry.members) {
      const target = member.kind === 'static' ? ctor : ctor.prototype;
      if (Object.hasOwn(target, member.name)) continue;
      const path = `${entry.path}.${member.name}`;
      if (member.declarationKind === 'MethodDeclaration') target[member.name] = fallback(path);
      else Object.defineProperty(target, member.name, { configurable: true, enumerable: true, get: fallback(path), set: fallback(path) });
    }
  }
}
