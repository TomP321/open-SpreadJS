/**
 * Build-time shim for the script-tag (IIFE/UMD) bundle only: maps
 * `react/jsx-runtime` onto the page's `window.React` (the React UMD build has
 * no separate runtime module, so `jsx`/`jsxs` delegate to `React.createElement`).
 */
var g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
if (!g.React) throw new Error('OpenSheets Designer React UMD: the page must load the React UMD build (window.React) before this script.');
function runtimeJsx(type, props, key) {
  var children = props.children;
  var rest = {};
  for (var name in props) if (name !== 'children') rest[name] = props[name];
  if (key !== undefined && key !== null) rest.key = String(key);
  if (children === undefined) return g.React.createElement(type, rest);
  if (Array.isArray(children)) return g.React.createElement.apply(null, [type, rest].concat(children));
  return g.React.createElement(type, rest, children);
}
exports.Fragment = g.React.Fragment;
exports.jsx = runtimeJsx;
exports.jsxs = runtimeJsx;
