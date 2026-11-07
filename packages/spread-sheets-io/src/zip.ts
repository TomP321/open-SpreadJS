import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { child, children, declaration, parseXml, tag } from './xml.js';
import { relsPath, resolvePart } from './common.js';
export const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export interface Relationship { id: string; type: string; target: string; external?: boolean }
export function xmlFile(files: Record<string,Uint8Array>, path: string): string { const b=files[path]; return b?strFromU8(b):''; }
export function readZip(bytes: Uint8Array): Record<string,Uint8Array> {
  if(bytes[0]!==80||bytes[1]!==75)throw new Error('Not a ZIP file');
  // Filter before decompression so hostile sizes cannot allocate unbounded memory.
  let total=0;
  return unzipSync(bytes,{filter: f=>{total+=f.originalSize;if(total>1024*1024*1024||f.originalSize>512*1024*1024)throw new Error('Package exceeds size limit');if(f.name.startsWith('/')||f.name.split('/').includes('..'))throw new Error('Unsafe ZIP path');return !f.name.endsWith('/');}});
}
export function writeZip(files: Record<string,Uint8Array|string>): Uint8Array { return zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,typeof v==='string'?strToU8(v):v])),{level:1}); }
export function relationships(files: Record<string,Uint8Array>, part: string): Relationship[] {
  const xml=xmlFile(files,part?relsPath(part):'_rels/.rels'); if(!xml)return [];
  return children(parseXml(xml),'Relationship').map(n=>({id:n.attrs.Id,type:n.attrs.Type,target:n.attrs.Target,external:n.attrs.TargetMode==='External'}));
}
export function relationshipXml(rels: Relationship[]): string { return declaration+tag('Relationships',{xmlns:'http://schemas.openxmlformats.org/package/2006/relationships'},rels.map(r=>tag('Relationship',{Id:r.id,Type:r.type,Target:r.target,TargetMode:r.external?'External':undefined})).join('')); }
export function related(files: Record<string,Uint8Array>, base: string, kind: string): string { const r=relationships(files,base).find(r=>r.type.endsWith('/'+kind));return r&&!r.external?resolvePart(base,r.target):''; }
/** Structural validation used by fixtures and import; never dereferences external links. */
export function validatePackage(files: Record<string,Uint8Array>): void {
  const types=xmlFile(files,'[Content_Types].xml');if(!types||parseXml(types).name!=='Types')throw new Error('Missing content types');
  const office=related(files,'','officeDocument');if(!office||!files[office])throw new Error('Missing workbook');
  if(!child(parseXml(xmlFile(files,office)),'sheets'))throw new Error('Missing worksheets');
  for(const path of Object.keys(files).filter(p=>p.endsWith('.rels'))) {
    const base=path==='_rels/.rels'?'':path.replace(/_rels\/([^/]+)\.rels$/,'$1');
    for(const r of relationships(files,base))if(!r.external&&!files[resolvePart(base,r.target)])throw new Error(`Missing relationship target ${base}: ${r.target}`);
  }
}
