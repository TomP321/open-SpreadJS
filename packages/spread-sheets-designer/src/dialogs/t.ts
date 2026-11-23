/**
 * TASK 87: display text for the custom dialog bodies. The English fallbacks are
 * the strings transcribed from the trial; a language package overrides them via
 * the `dialogs` subtree (the global resources, which every language package
 * merges through setResources before the Designer is created).
 */
import { resolveText, getResources } from '../resolve.js';

export function T(key: string, en: string): string {
  return resolveText(`\${res.dialogs.${key}}`, getResources()) || en;
}
