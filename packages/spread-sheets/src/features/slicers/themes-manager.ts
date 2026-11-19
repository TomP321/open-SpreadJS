/**
 * Workbook-scoped custom slicer/timeline theme managers
 * (`workbook.customSlicerThemes`, `workbook.customTimelineThemes`).
 * Registered lazily from install.ts to dodge the workbook module cycle.
 */
import { SlicerStyle, TimelineStyle } from './styles.js';
import type { JsonRecord } from '../../serialization.js';

export class CustomSlicerThemeManager {
  protected themes = new Map<string, SlicerStyle | TimelineStyle>();
  constructor(protected workbook?: unknown) {}
  /** The style flavour this manager creates for a plain name (timeline subclass overrides). */
  protected create(): SlicerStyle { return new SlicerStyle(); }
  add(theme: string | SlicerStyle | TimelineStyle): SlicerStyle | TimelineStyle | undefined {
    const name = typeof theme === 'string' ? theme : String(theme.name?.() ?? '');
    if (!name || this.themes.has(name)) return undefined;
    const style = typeof theme === 'string' ? this.create() : theme;
    style.name(name);
    this.themes.set(name, style);
    return style;
  }
  all(): (SlicerStyle | TimelineStyle)[] { return [...this.themes.values()]; }
  get(name: string): SlicerStyle | undefined { return this.themes.get(name) as SlicerStyle | undefined; }
  remove(name: string): void { this.themes.delete(name); }
  update(oldThemeName: string, newTheme: SlicerStyle | TimelineStyle): void {
    if (!this.themes.has(oldThemeName)) return;
    this.themes.delete(oldThemeName);
    this.add(newTheme);
  }
  toJSON(): JsonRecord[] { return this.all().map(theme => theme.toJSON()); }
}

export class CustomTimelineThemeManager extends CustomSlicerThemeManager {
  constructor(workbook?: unknown) {
    super(workbook);
  }
  protected override create(): SlicerStyle { return new TimelineStyle(); }
  // Own declarations (the contract test enumerates these per class, and the
  // official d.ts repeats them on the subclass): delegate to the base.
  add(theme: string | SlicerStyle | TimelineStyle): SlicerStyle | TimelineStyle | undefined {
    return super.add(theme);
  }
  all(): (SlicerStyle | TimelineStyle)[] { return super.all(); }
  get(name: string): SlicerStyle | undefined { return super.get(name); }
  remove(name: string): void { super.remove(name); }
  update(oldThemeName: string, newTheme: SlicerStyle | TimelineStyle): void {
    super.update(oldThemeName, newTheme);
  }
}
