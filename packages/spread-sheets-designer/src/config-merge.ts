import type { IDesignerConfig } from './types.js';
import { DefaultConfig } from './config.js';

function isPlain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => deepClone(v)) as T;
  if (isPlain(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
    return out as T;
  }
  return value;
}

/** Arrays are replaced as a unit; objects and console maps merge recursively. */
export function mergeConfig(base: IDesignerConfig, override?: IDesignerConfig | null): IDesignerConfig {
  const source = deepClone(base);
  if (!override) return source;
  const assign = (target: Record<string, unknown>, input: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      const current = target[key];
      if (isPlain(value) && isPlain(current)) assign(current, value);
      else target[key] = deepClone(value);
    }
  };
  assign(source as Record<string, unknown>, override as Record<string, unknown>);
  return source;
}

export function defaultConfigClone(): IDesignerConfig {
  return mergeConfig(DefaultConfig);
}

export function ribbonPanels(config: IDesignerConfig): import('./types.js').IRibbonPanel[] {
  if (Array.isArray(config.ribbon)) return config.ribbon;
  return config.ribbon?.panels ?? [];
}
