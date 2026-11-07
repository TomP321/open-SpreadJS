export type RecordValue = Record<string, unknown>;
export const obj = (value: unknown): RecordValue => value && typeof value === 'object' ? value as RecordValue : {};
export const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export interface Rect { row: number; col: number; rowCount: number; colCount: number }
export function columnName(col: number): string { let s = ''; for (col++; col > 0; col = Math.floor((col-1)/26)) s = String.fromCharCode(65+(col-1)%26)+s; return s; }
export function address(row: number, col: number): string { return `${columnName(col)}${row+1}`; }
export function cellPosition(a: string): [number,number] {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a); if (!m) throw new Error(`Invalid address ${a}`);
  let c = 0; for (const l of m[1].toUpperCase()) c = c*26+l.charCodeAt(0)-64;
  const r = +m[2]-1; if (r < 0 || r > 1048575 || c < 1 || c > 16384) throw new Error(`Address out of bounds ${a}`);
  return [r,c-1];
}
export function range(a: string): Rect { const [s,e=s] = a.split(':'); const [r,c] = cellPosition(s), [r2,c2] = cellPosition(e); return {row:r,col:c,rowCount:r2-r+1,colCount:c2-c+1}; }
export function rangeAddress(r: Rect): string { const a = address(r.row,r.col); return r.rowCount===1&&r.colCount===1 ? a : `${a}:${address(r.row+r.rowCount-1,r.col+r.colCount-1)}`; }
export function normalFormula(f: string): string { return f.replace(/^=/,'').replace(/_xlfn\.(?:_xlws\.)?|_xlws\./g,''); }
/** Shift A1 references without touching quoted string literals or sheet names. */
export function shiftFormula(formula: string, dr: number, dc: number): string {
  const re = /"(?:[^"]|"")*"|'(?:[^']|'')*'!|(?:\[[^\]]*\])|(?<![\w.])(?:(\$?)([A-Za-z]{1,3})(\$?)(\d+)|(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})|(\$?)(\d+):(\$?)(\d+))(?![\w.(])/g;
  return formula.replace(re, (all: string, ca: string,c: string,ra: string,r: string,c1a: string,c1: string,c2a: string,c2: string,r1a: string,r1: string,r2a: string,r2: string) => {
    const col = (s: string,a: string) => { let n = 0; for (const ch of s.toUpperCase()) n=n*26+ch.charCodeAt(0)-64; n=n-1+(a?0:dc); return n<0||n>16383 ? '#REF!' : a+columnName(n); };
    const row = (s: string,a: string) => { const n = +s+(a?0:dr); return n<1||n>1048576 ? '#REF!' : a+n; };
    if (c) {const cc=col(c,ca),rr=row(r,ra); return cc==='#REF!'||rr==='#REF!' ? '#REF!' : cc+rr;}
    if (c1) return `${col(c1,c1a)}:${col(c2,c2a)}`;
    if (r1) return `${row(r1,r1a)}:${row(r2,r2a)}`;
    return all;
  });
}
export const bool = (value: string | undefined, defaultValue = false): boolean => value === undefined ? defaultValue : value !== '0' && value !== 'false';
export function resolvePart(base: string, target: string): string {
  const parts: string[]=[]; for(const s of (target.startsWith('/')?target:`${base.slice(0,base.lastIndexOf('/')+1)}${target}`).split('/')) {if(s==='..'){if(!parts.length)throw new Error('Invalid package path');parts.pop();} else if(s&&s!=='.')parts.push(s);} return parts.join('/');
}
export function relsPath(part: string): string { const i=part.lastIndexOf('/'); return `${part.slice(0,i+1)}_rels/${part.slice(i+1)}.rels`; }
export interface IoOptions extends RecordValue { fileType?: number; includeStyles?: boolean; includeFormulas?: boolean; password?: string }
export interface IoState { archive: Record<string,Uint8Array>; sheetPaths: string[]; theme?:string[]; warnings: string[] }
