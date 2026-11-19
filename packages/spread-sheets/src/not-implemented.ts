import entries from './generated/stubs.json';

export const STUB = Symbol.for('@opensheets/NotImplemented');
export function notImplemented(path: string): never { throw new Error(`NotImplemented: ${path}`); }
function fallback(path: string) {
  const fn = function () { return notImplemented(path); };
  Object.defineProperty(fn, STUB, { value: true });
  return fn;
}
type Container = Record<string, unknown>;
/**
 * Declared data properties (`CellRange.row`, `Rect.x`, ...) must have a real
 * descriptor on the class prototype: the fallback test and the coverage report
 * read it there. The values themselves live on each instance, exactly like in
 * the trial, so the prototype holds a lazy accessor: the first write (the
 * constructor assignment) stores an own enumerable field on the instance, and
 * every later read and write goes to that field directly.
 */
export function instanceProperties(ctor: { prototype: object }, ...names: string[]): void {
  for (const name of names) {
    if (Object.hasOwn(ctor.prototype, name)) continue;
    Object.defineProperty(ctor.prototype, name, {
      configurable: true,
      enumerable: false,
      get(this: Container) {
        return undefined;
      },
      set(this: Container, value: unknown) {
        Object.defineProperty(this, name, { value, writable: true, enumerable: true, configurable: true });
      },
    });
  }
}
/**
 * Adds `NotImplemented` fallbacks for every declared member that our classes do
 * not define. Declared data properties get throwing accessors; own instance
 * fields (constructor parameter properties) shadow them, so real instances keep
 * working while the prototype descriptor still exists for the coverage report.
 */
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
      if (member.name in target) {
        if (!Object.hasOwn(target, member.name)) {
          let parent = Object.getPrototypeOf(target) as Container | null;
          while (parent) {
            const descriptor = Object.getOwnPropertyDescriptor(parent, member.name);
            if (descriptor) {
              const values = [descriptor.value, descriptor.get, descriptor.set];
              if (values.some(value => typeof value === 'function' && Reflect.get(value, STUB))) {
                const path = `${entry.path}.${member.name}`;
                if (member.declarationKind === 'MethodDeclaration') {
                  Object.defineProperty(target, member.name, { configurable: true, writable: true, value: fallback(path) });
                } else Object.defineProperty(target, member.name, {
                  configurable: true, enumerable: true, get: fallback(path), set: fallback(path),
                });
              } else Object.defineProperty(target, member.name, descriptor);
              break;
            }
            parent = Object.getPrototypeOf(parent) as Container | null;
          }
        }
        continue;
      }
      const path = `${entry.path}.${member.name}`;
      if (member.declarationKind === 'MethodDeclaration') target[member.name] = fallback(path);
      else Object.defineProperty(target, member.name, { configurable: true, enumerable: true, get: fallback(path), set: fallback(path) });
    }
  }
}
