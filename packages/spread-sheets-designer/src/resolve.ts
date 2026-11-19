import type { ITheme } from './types.js';
export type Resources = Record<string, unknown>;
import { englishResources } from './resources.js';

export function getPath(object: unknown, path: string): unknown {
  let current: unknown = object;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function resolveText(value: unknown, resources: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'string') return String(value);
  return value.replace(/\$\{res\.([^}]+)\}/g, (_m, path: string) => {
    const found = getPath(resources, path);
    return found == null ? '' : String(found);
  });
}

export function mergeResources(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && existing && typeof existing === 'object' && !Array.isArray(existing)) {
      out[key] = mergeResources(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else out[key] = value;
  }
  return out;
}

let resources: Record<string, unknown> = mergeResources({}, englishResources);

export function getResources(): Record<string, unknown> {
  return resources;
}

export function setResources(value: Record<string, unknown>): void {
  resources = mergeResources(resources, value ?? {});
}

const themeKeys = [
  'colorForeground', 'colorForegroundDisabled', 'colorBackground', 'colorBackgroundHover',
  'colorBackgroundSelected', 'colorBackgroundDisabled', 'colorBackground2', 'colorBackground2Hover',
  'colorBackground2Selected', 'colorBrandForeground', 'colorBrandBackground', 'colorBrandBackgroundHover',
  'colorBrandBackgroundSelected', 'colorStroke', 'colorStrokeHover', 'colorStrokeSelected',
  'colorStrokeDisabled', 'borderRadiusM', 'borderRadiusL', 'borderRadiusXL', 'shadow4', 'shadow8',
] as const;

export function themeToCss(theme: ITheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of themeKeys) {
    const value = theme[key];
    if (value) out[cssName(key)] = value;
  }
  return out;
}

export function cssName(key: string): string {
  if (key.startsWith('borderRadius')) return `--sjs-border-radius-${key.slice('borderRadius'.length).toLowerCase()}`;
  if (key.startsWith('shadow')) return `--sjs-shadow-${key.slice('shadow'.length)}`;
  return `--sjs-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}
