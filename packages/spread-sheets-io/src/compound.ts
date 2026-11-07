/** MS-CFB sectors, FAT and mini-FAT. Only streams are exposed to the IO layer. */
const FREE=0xffffffff, END=0xfffffffe, FAT=0xfffffffd, DIF=0xfffffffc;
const signature=new Uint8Array([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
export function isCompound(bytes:Uint8Array):boolean {return signature.every((n,i)=>bytes[i]===n);}
export function readCompound(bytes:Uint8Array):Map<string,Uint8Array> {
  if(bytes.length<512||!isCompound(bytes))throw new Error('Invalid compound file');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u32=(p:number)=>view.getUint32(p,true);
  const major=view.getUint16(26,true),shift=view.getUint16(30,true),miniShift=view.getUint16(32,true);
  if(view.getUint16(28,true)!==0xfffe||!((major===3&&shift===9)||(major===4&&shift===12))||miniShift!==6)throw new Error('Unsupported compound header');
  const size=2**shift,sectorCount=Math.floor(bytes.length/size)-1;
  const sector=(id:number)=>{if(id<0||id>=sectorCount)throw new Error('Invalid compound sector');return bytes.subarray((id+1)*size,(id+2)*size);};
  const words=(b:Uint8Array)=>Array.from({length:b.length/4},(_,i)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(i*4,true));
  const fatIds=Array.from({length:109},(_,i)=>u32(76+i*4)).filter(n=>n!==FREE);
  let dif=u32(68);const seenDif=new Set<number>();
  for(let i=0;i<u32(72);i++){if(seenDif.has(dif))throw new Error('Cyclic DIFAT');seenDif.add(dif);const ids=words(sector(dif));fatIds.push(...ids.slice(0,-1).filter(n=>n!==FREE));dif=ids.at(-1)!;}
  if(fatIds.length!==u32(44))throw new Error('Invalid FAT count');
  const fat=fatIds.flatMap(id=>words(sector(id)));
  function chain(start:number,table:number[],get:(id:number)=>Uint8Array,length?:number):Uint8Array {
    const chunks:Uint8Array[]=[],seen=new Set<number>();let id=start,total=0;
    while(id!==END){if(id>=table.length||seen.has(id))throw new Error('Invalid compound chain');seen.add(id);const b=get(id);chunks.push(b);total+=b.length;if(total>1024*1024*1024)throw new Error('Compound stream too large');id=table[id];}
    if(length!==undefined&&length>total)throw new Error('Truncated compound stream');
    const result=new Uint8Array(length??total);let at=0;for(const b of chunks){const n=Math.min(b.length,result.length-at);if(n<=0)break;result.set(b.subarray(0,n),at);at+=n;}return result;
  }
  const dirs=chain(u32(48),fat,sector),entries:{name:string;type:number;start:number;length:number}[]=[];
  for(let p=0;p+128<=dirs.length;p+=128){const d=new DataView(dirs.buffer,dirs.byteOffset+p,128),type=d.getUint8(66);if(!type)continue;const n=d.getUint16(64,true);if(n<2||n>64||n%2)throw new Error('Invalid compound stream name');const name=new TextDecoder('utf-16le').decode(dirs.subarray(p,p+n-2));const length=d.getUint32(120,true)+(major===4?d.getUint32(124,true)*2**32:0);entries.push({name,type,start:d.getUint32(116,true),length});}
  const root=entries.find(e=>e.type===5);if(!root)throw new Error('Missing compound root');
  const mini=root.length?chain(root.start,fat,sector,root.length):new Uint8Array();
  const miniFat=u32(64)?words(chain(u32(60),fat,sector,u32(64)*size)):[];
  const streams=new Map<string,Uint8Array>();
  for(const e of entries.filter(e=>e.type===2))streams.set(e.name,e.length<u32(56)?chain(e.start,miniFat,id=>{const at=id*64;if(at+64>mini.length)throw new Error('Invalid mini sector');return mini.subarray(at,at+64);},e.length):chain(e.start,fat,sector,e.length));
  return streams;
}
export function writeCompound(streams:Map<string,Uint8Array>):Uint8Array {
  const size=512,sectors:Uint8Array[]=[],links:number[]=[],miniLinks:number[]=[],miniChunks:Uint8Array[]=[];
  const allocate=(data:Uint8Array)=>{if(!data.length)return END;const start=sectors.length,count=Math.ceil(data.length/size);for(let i=0;i<count;i++){const b=new Uint8Array(size);b.set(data.subarray(i*size,(i+1)*size));sectors.push(b);links.push(i===count-1?END:start+i+1);}return start;};
  const entries:{name:string;type:number;start:number;length:number}[]=[{name:'Root Entry',type:5,start:END,length:0}];
  for(const [name,data]of streams){if(name.length>31)throw new Error('Compound stream name too long');let start=END;if(data.length&&data.length<4096){start=miniChunks.length;for(let i=0;i<Math.ceil(data.length/64);i++){const b=new Uint8Array(64);b.set(data.subarray(i*64,(i+1)*64));miniChunks.push(b);miniLinks.push((i+1)*64>=data.length?END:miniChunks.length);}}else if(data.length)start=allocate(data);entries.push({name,type:2,start,length:data.length});}
  const mini=new Uint8Array(miniChunks.length*64);miniChunks.forEach((b,i)=>mini.set(b,i*64));entries[0].start=allocate(mini);entries[0].length=mini.length;
  const mf=new Uint8Array(Math.ceil(miniLinks.length/128)*512);mf.fill(255);const mfv=new DataView(mf.buffer);miniLinks.forEach((n,i)=>mfv.setUint32(i*4,n,true));const miniFatStart=allocate(mf);
  const directory=new Uint8Array(Math.ceil(entries.length/4)*512),dv=new DataView(directory.buffer);
  entries.forEach((e,i)=>{const p=i*128;for(let c=0;c<e.name.length;c++)dv.setUint16(p+c*2,e.name.charCodeAt(c),true);dv.setUint16(p+64,(e.name.length+1)*2,true);dv.setUint8(p+66,e.type);dv.setUint8(p+67,1);for(const o of [68,72,76])dv.setUint32(p+o,FREE,true);dv.setUint32(p+116,e.start,true);dv.setUint32(p+120,e.length,true);});
  // Balanced directory search tree, sorted by the CFB length/uppercase order.
  const ids=entries.map((_,i)=>i).slice(1).sort((a,b)=>entries[a].name.length-entries[b].name.length||entries[a].name.toUpperCase().localeCompare(entries[b].name.toUpperCase()));
  function tree(a:number[]):number {if(!a.length)return FREE;const mid=Math.floor(a.length/2),id=a[mid];dv.setUint32(id*128+68,tree(a.slice(0,mid)),true);dv.setUint32(id*128+72,tree(a.slice(mid+1)),true);return id;}
  dv.setUint32(76,tree(ids),true);const dirStart=allocate(directory);
  const dataCount=sectors.length;let fatCount=0,difCount=0;
  for(;;){const f=Math.ceil((dataCount+fatCount+difCount)/128),d=Math.max(0,Math.ceil((f-109)/127));if(f===fatCount&&d===difCount)break;fatCount=f;difCount=d;}
  const fatIds=Array.from({length:fatCount},(_,i)=>dataCount+i),difIds=Array.from({length:difCount},(_,i)=>dataCount+fatCount+i);
  links.push(...fatIds.map(()=>FAT),...difIds.map(()=>DIF));
  const table=new Uint8Array(fatCount*512);table.fill(255);const tv=new DataView(table.buffer);links.forEach((n,i)=>tv.setUint32(i*4,n,true));for(let i=0;i<fatCount;i++)sectors.push(table.subarray(i*512,(i+1)*512));
  for(let i=0;i<difCount;i++){const d=new Uint8Array(512);d.fill(255);const v=new DataView(d.buffer);fatIds.slice(109+i*127,109+(i+1)*127).forEach((n,j)=>v.setUint32(j*4,n,true));v.setUint32(508,difIds[i+1]??END,true);sectors.push(d);}
  const result=new Uint8Array((sectors.length+1)*512);result.set(signature);const h=new DataView(result.buffer);h.setUint16(24,0x3e,true);h.setUint16(26,3,true);h.setUint16(28,0xfffe,true);h.setUint16(30,9,true);h.setUint16(32,6,true);h.setUint32(44,fatCount,true);h.setUint32(48,dirStart,true);h.setUint32(56,4096,true);h.setUint32(60,miniFatStart,true);h.setUint32(64,mf.length/512,true);h.setUint32(68,difIds[0]??END,true);h.setUint32(72,difCount,true);result.fill(255,76,512);fatIds.slice(0,109).forEach((n,i)=>h.setUint32(76+i*4,n,true));sectors.forEach((b,i)=>result.set(b,(i+1)*512));return result;
}
