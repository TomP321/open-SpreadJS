export interface CommandOptions {
  cmd: string;
  [key: string]: unknown;
}
export interface Command {
  canUndo?: boolean;
  // The trial's built-ins pass raw values through (some return objects, e.g.
  // `{ ignoreCancelDefault: true }`); TASK 44 widened the return type.
  execute(context: unknown, options: CommandOptions, isUndo: boolean): unknown;
}
interface HistoryEntry {
  options: CommandOptions;
  undo(): boolean;
  redo(): boolean;
}
export class UndoManager {
  private undos: HistoryEntry[] = [];
  private redos: HistoryEntry[] = [];
  private limit = 2147483647;
  recording = true;
  canRedo(): boolean {
    return this.redos.length > 0;
  }
  canUndo(): boolean {
    return this.undos.length > 0;
  }
  clear(): void {
    this.undos = [];
    this.redos = [];
  }
  getRedoStack(): CommandOptions[] {
    return this.redos.map((e) => e.options);
  }
  getUndoStack(): CommandOptions[] {
    return this.undos.map((e) => e.options);
  }
  maxSize(): number;
  maxSize(value: number): this;
  maxSize(value?: number): number | this {
    if (value === undefined) return this.limit;
    this.limit = Math.max(0, Math.floor(value));
    this.undos.splice(0, Math.max(0, this.undos.length - this.limit));
    return this;
  }
  add(entry: HistoryEntry): void {
    if (!this.recording || !this.limit) return;
    this.undos.push(entry);
    this.redos = [];
    if (this.undos.length > this.limit) this.undos.shift();
  }
  undo(): boolean {
    return this.run(this.undos, this.redos, 'undo');
  }
  redo(): boolean {
    return this.run(this.redos, this.undos, 'redo');
  }
  private run(from: HistoryEntry[], to: HistoryEntry[], operation: 'undo' | 'redo'): boolean {
    const entry = from.at(-1);
    if (!entry) return false;
    this.recording = false;
    try {
      if (!entry[operation]()) return false;
      from.pop();
      to.push(entry);
      return true;
    } finally {
      this.recording = true;
    }
  }
}
export interface CommandContext {
  options?: { allowUndo?: boolean };
  undoManager?(): UndoManager;
}
export class CommandManager {
  private commands = new Map<string, Command>();
  readonly shortcuts = new Map<string, string>();
  private history: UndoManager;
  constructor(private context: CommandContext = {}) {
    this.history = context.undoManager?.() ?? new UndoManager();
  }
  register(
    name: string,
    command: Command,
    key?: number,
    ctrl = false,
    shift = false,
    alt = false,
    meta = false,
  ): void {
    this.commands.set(name, command);
    Object.defineProperty(this, name, { configurable: true, enumerable: true, value: command });
    if (key !== undefined) this.setShortcutKey(name, key, ctrl, shift, alt, meta);
  }
  execute(options: CommandOptions): boolean {
    const command = this.commands.get(options.cmd);
    if (!command) return undefined as unknown as boolean; // trial: unknown commands return null (probed via `collapseRowOutline`, `DefineColumn`, ...)
    // The trial passes the built-in command's raw return through: some
    // commands return `undefined` (JSON `null`), one returns an options
    // object; only an explicit `false` marks failure (TASK 44 probes).
    const result = command.execute(this.context, options, false);
    if (result === false) return false;
    if (command.canUndo && this.context.options?.allowUndo !== false)
      this.history.add({
        // Shallow copy only: options may legitimately carry live objects
        // (sheet instances, Range arrays), which a deep clone would recurse into.
        options: { ...options },
        undo: () => command.execute(this.context, options, true) !== false,
        redo: () => command.execute(this.context, options, false) !== false,
      });
    return result as boolean;
  }
  setShortcutKey(
    name: string | undefined,
    key?: number,
    ctrl = false,
    shift = false,
    alt = false,
    meta = false,
  ): void {
    if (key === undefined) {
      for (const [key, value] of this.shortcuts) if (value === name) this.shortcuts.delete(key);
      return;
    }
    const chord = [key, +ctrl, +shift, +alt, +meta].join(':');
    if (name) this.shortcuts.set(chord, name);
    else this.shortcuts.delete(chord);
  }
}
