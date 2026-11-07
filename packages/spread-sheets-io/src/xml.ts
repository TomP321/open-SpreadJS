/** Small namespace-tolerant XML reader. Worksheet rows are scanned independently. */
export interface XmlNode { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string }
export function escapeXml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r/g, '&#13;');
}
export function unescapeXml(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, name: string) => {
    if (name[0] === '#') { const n = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : +name.slice(1); return n <= 0x10ffff && n >= 0 && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '\ufffd'; }
    return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[name] ?? _;
  });
}
export function attrs(text: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string,string>;
  for (const m of text.matchAll(/([^\s=<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) result[m[1]] = unescapeXml(m[2] ?? m[3]);
  return result;
}
export function parseXml(xml: string): XmlNode {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD is unsupported');
  const root: XmlNode = {name:'',attrs:{},children:[],text:''}, stack = [root];
  for (const m of xml.matchAll(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<([^>]+)>|([^<]+)/g)) {
    if (m[1] !== undefined) { stack[stack.length - 1].text += m[1]; continue; }
    if (m[3] !== undefined) { stack[stack.length - 1].text += unescapeXml(m[3]); continue; }
    const tag = m[2]; if (!tag) continue;
    if (tag[0] === '/') { const top = stack.pop(); if (stack.length === 0 || top?.name !== tag.slice(1).trim().split(':').pop()) throw new Error('Mismatched XML tag'); continue; }
    if (tag[0] === '!') throw new Error('Unsupported XML declaration');
    const full = tag.match(/^([^\s/]+)/)?.[1]; if (!full) throw new Error('Missing XML tag');
    const node: XmlNode = {name:full.split(':').pop()!,attrs:attrs(tag.slice(full.length)),children:[],text:''};
    stack[stack.length - 1].children.push(node);
    if (!tag.endsWith('/')) stack.push(node);
  }
  if (stack.length !== 1 || root.children.length !== 1) throw new Error('Incomplete XML');
  return root.children[0];
}
export function child(node: XmlNode | undefined, name: string): XmlNode | undefined { return node?.children.find(n => n.name === name); }
export function children(node: XmlNode | undefined, name: string): XmlNode[] { return node?.children.filter(n => n.name === name) ?? []; }
export function descendants(node: XmlNode | undefined, name: string): XmlNode[] { return node ? node.children.flatMap(n => [...(n.name === name ? [n] : []), ...descendants(n,name)]) : []; }
export function textOf(node: XmlNode | undefined): string { return node ? node.text + node.children.map(textOf).join('') : ''; }
export function tag(name: string, attributes: Record<string, unknown> = {}, body?: string): string {
  const a = Object.entries(attributes).filter(([,v]) => v !== undefined && v !== null).map(([k,v]) => ` ${k}="${escapeXml(typeof v === 'boolean' ? +v : v)}"`).join('');
  return body === undefined ? `<${name}${a}/>` : `<${name}${a}>${body}</${name}>`;
}
export const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export function* elements(xml: string, name: string): Generator<string> {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?=[\\s/>])[^>]*(?:/>|>[\\s\\S]*?</(?:[\\w.-]+:)?${name}\\s*>)`, 'g');
  for (const match of xml.matchAll(re)) yield match[0];
}
export function section(xml: string, name: string): string { return elements(xml,name).next().value ?? ''; }
