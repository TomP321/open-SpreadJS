/**
 * Public custom function API (GC.Spread.CalcEngine.Functions.*).
 */
import { CalcError, CalcArray, Value } from './values.js';

export interface IFunctionDescription {
  description: string;
  parameters: { name: string; repeatable?: boolean; optional?: boolean }[];
}

/** Structural interface the engine uses for custom functions. */
export interface CalcFunction {
  name: string;
  minArgs: number;
  maxArgs: number;
  evaluate(...args: unknown[]): unknown;
  acceptsArray?(argIndex: number): boolean;
  acceptsError?(argIndex: number): boolean;
  acceptsReference?(argIndex: number): boolean;
  acceptsMissingArgument?(argIndex: number): boolean;
  isBranch?(): boolean;
  isContextSensitive?(): boolean;
  isVolatile?(): boolean;
  findTestArgument?(): number;
  findBranchArgument?(result: unknown): number;
  evaluateMode?(): number;
  interval?(): number;
}

const globalFunctions = new Map<string, Function>();

/** Represents a user defined (or built-in style) spreadsheet function. */
export class Function {
  name: string;
  minArgs: number;
  maxArgs: number;
  typeName = 'Function';
  private readonly functionDescription?: IFunctionDescription;
  constructor(name: string, minArgs = 0, maxArgs = 0, description?: IFunctionDescription) {
    this.name = name;
    this.minArgs = minArgs;
    this.maxArgs = maxArgs;
    this.functionDescription = description;
  }
  acceptsArray(_argIndex: number): boolean {
    return false;
  }
  acceptsError(_argIndex: number): boolean {
    return false;
  }
  acceptsMissingArgument(_argIndex: number): boolean {
    return false;
  }
  acceptsReference(_argIndex: number): boolean {
    return false;
  }
  description(): IFunctionDescription {
    return this.functionDescription ?? { description: '', parameters: [] };
  }
  evaluate(..._args: unknown[]): unknown {
    return undefined;
  }
  findBranchArgument(_test: unknown): number {
    return -1;
  }
  findTestArgument(): number {
    return 0;
  }
  isBranch(): boolean {
    return false;
  }
  isContextSensitive(): boolean {
    return false;
  }
  isVolatile(): boolean {
    return false;
  }
  supportCalcWorker(): boolean {
    return false;
  }
}

export enum AsyncFunctionEvaluateMode {
  onRecalculation = 0,
  calculateOnce = 1,
  onInterval = 2,
}

/** Context handed to asynchronous custom functions. */
export class AsyncEvaluateContext {
  private callback?: (value: unknown) => void;
  constructor(readonly context: unknown) {
    void context;
  }
  /** Registers the callback used when the async result becomes available. */
  _setCallback(callback: (value: unknown) => void): void {
    this.callback = callback;
  }
  setAsyncResult(value: unknown): void {
    this.callback?.(value);
  }
}

export class AsyncFunction extends Function {
  defaultValue(): unknown {
    return null;
  }
  evaluateAsync(_context: AsyncEvaluateContext, _args: unknown): unknown {
    return undefined;
  }
  evaluateMode(): AsyncFunctionEvaluateMode {
    return AsyncFunctionEvaluateMode.onRecalculation;
  }
  interval(): number {
    return 0;
  }
}

export function defineGlobalCustomFunction(name: string, fn: Function): Function {
  globalFunctions.set(name.toUpperCase(), fn);
  return fn;
}
export function findGlobalFunction(name?: string): Function | Function[] {
  if (!name) return [...globalFunctions.values()];
  return globalFunctions.get(name.toUpperCase()) as Function;
}
export function removeGlobalFunction(name?: string): void {
  if (!name) globalFunctions.clear();
  else globalFunctions.delete(name.toUpperCase());
}
export function getGlobalFunction(name: string): Function | undefined {
  return globalFunctions.get(name.toUpperCase());
}

export { CalcArray, CalcError };
export type { Value };
