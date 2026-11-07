/** OOXML password protection, independently implemented from MS-OFFCRYPTO
 * sections 2.3.4.7 and 2.3.4.11–15. Cryptographic primitives are MIT noble. */
import { cbc, ecb } from '@noble/ciphers/aes';
import { sha1 } from '@noble/hashes/sha1';
import { sha256 } from '@noble/hashes/sha256';
import { sha384, sha512 } from '@noble/hashes/sha512';
import { hmac } from '@noble/hashes/hmac';
import { concatBytes, randomBytes } from '@noble/hashes/utils';
import { equalBytes } from '@noble/ciphers/utils';
import { readCompound, writeCompound } from './compound.js';
import { child, declaration, descendants, parseXml, tag } from './xml.js';
const blocks={input:new Uint8Array([0xfe,0xa7,0xd2,0x76,0x3b,0x4b,0x9e,0x79]),verifier:new Uint8Array([0xd7,0xaa,0x0f,0x6d,0x30,0x61,0x34,0x4e]),key:new Uint8Array([0x14,0x6e,0x0b,0xe7,0xab,0xac,0xd0,0xd6]),hmacKey:new Uint8Array([0x5f,0xb2,0xad,0x01,0x0c,0xb9,0xe1,0xf6]),hmacValue:new Uint8Array([0xa0,0x67,0x7f,0x02,0xb2,0x2c,0x84,0x33])};
const uint=(n:number)=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b;};
function utf16(s:string):Uint8Array {const b=new Uint8Array(s.length*2),v=new DataView(b.buffer);for(let i=0;i<s.length;i++)v.setUint16(i*2,s.charCodeAt(i),true);return b;}
const b64=(b:Uint8Array)=>{let s='';for(const c of b)s+=String.fromCharCode(c);return btoa(s);};
const unb64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function resize(b:Uint8Array,n:number,fill=0x36):Uint8Array {const a=new Uint8Array(n).fill(fill);a.set(b.subarray(0,n));return a;}
const pad=(b:Uint8Array)=>resize(b,Math.ceil(b.length/16)*16,0);
function hashAlgorithm(s:string){switch(s.toUpperCase().replace('-','')){case 'SHA1':return sha1;case 'SHA256':return sha256;case 'SHA384':return sha384;case 'SHA512':return sha512;default:throw new Error(`NotImplemented: OOXML hash ${s}`);}}
function passwordHash(password:string,salt:Uint8Array,spin:number,hash:ReturnType<typeof hashAlgorithm>):Uint8Array {
  if(!Number.isSafeInteger(spin)||spin<0||spin>10000000)throw new Error('Invalid password spin count');
  let h=hash(concatBytes(salt,utf16(password)));const block=new Uint8Array(h.length+4),v=new DataView(block.buffer);
  for(let i=0;i<spin;i++){v.setUint32(0,i,true);block.set(h,4);h=hash(block);}return h;
}
const crypt=(key:Uint8Array,iv:Uint8Array,data:Uint8Array,decrypt=false)=>{const c=cbc(key,iv,{disablePadding:true});return decrypt?c.decrypt(data):c.encrypt(pad(data));};
const passwordError=(code:number)=>({errorCode:code,errorMessage:code===2?'The Excel file cannot be opened because the workbook is password protected.':'The password you supplied is not correct.'});
function packageSize(bytes:Uint8Array):number {if(bytes.length<8)throw new Error('Truncated encrypted package');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true)+v.getUint32(4,true)*2**32;if(n>1024*1024*1024)throw new Error('Encrypted package too large');return n;}
export function decryptXlsx(bytes:Uint8Array,password?:string):Uint8Array {
  const streams=readCompound(bytes),info=streams.get('EncryptionInfo'),data=streams.get('EncryptedPackage');if(!info||!data)throw new Error('Not an encrypted OOXML package');
  if(!password)throw passwordError(2);
  const v=new DataView(info.buffer,info.byteOffset,info.byteLength),major=v.getUint16(0,true),minor=v.getUint16(2,true);
  if(major===4&&minor===4){
    const root=parseXml(new TextDecoder().decode(info.subarray(8))),kd=child(root,'keyData')?.attrs,pk=descendants(root,'encryptedKey').find(n=>n.attrs.spinCount!==undefined)?.attrs;
    if(!kd||!pk)throw new Error('Missing password encryptor');
    if(kd.cipherAlgorithm!=='AES'||pk.cipherAlgorithm!=='AES'||kd.cipherChaining!=='ChainingModeCBC'||pk.cipherChaining!=='ChainingModeCBC'||+kd.blockSize!==16||+pk.blockSize!==16)throw new Error('NotImplemented: OOXML cipher');
    const hash=hashAlgorithm(pk.hashAlgorithm),salt=unb64(pk.saltValue),h=passwordHash(password,salt,+pk.spinCount,hash),bits=+pk.keyBits;
    if(![128,192,256].includes(bits))throw new Error('Invalid AES key size');
    const dec=(s:string,b:Uint8Array)=>crypt(resize(hash(concatBytes(h,b)),bits/8),resize(salt,16),unb64(s),true);
    const verifier=dec(pk.encryptedVerifierHashInput,blocks.input).subarray(0,+pk.saltSize),expected=dec(pk.encryptedVerifierHashValue,blocks.verifier).subarray(0,hash.outputLen);
    if(!equalBytes(hash(verifier),expected))throw passwordError(3);
    const key=dec(pk.encryptedKeyValue,blocks.key).subarray(0,+kd.keyBits/8),dataSalt=unb64(kd.saltValue),dh=hashAlgorithm(kd.hashAlgorithm),iv=(b:Uint8Array)=>resize(dh(concatBytes(dataSalt,b)),16);
    const integrity=child(root,'dataIntegrity')?.attrs;
    if(integrity?.encryptedHmacKey&&integrity.encryptedHmacValue){const hk=crypt(key,iv(blocks.hmacKey),unb64(integrity.encryptedHmacKey),true).subarray(0,+kd.hashSize),hv=crypt(key,iv(blocks.hmacValue),unb64(integrity.encryptedHmacValue),true).subarray(0,dh.outputLen);if(!equalBytes(hmac(dh,hk,data),hv))throw new Error('Encrypted package integrity check failed');}
    const size=packageSize(data),result=new Uint8Array(size);
    for(let at=0,i=0;at<size;at+=4096,i++){const n=Math.min(4096,size-at),chunk=data.subarray(8+at,8+at+Math.ceil(n/16)*16);if(chunk.length!==Math.ceil(n/16)*16)throw new Error('Truncated encrypted package');result.set(crypt(key,iv(uint(i)),chunk,true).subarray(0,n),at);}return result;
  }
  if(minor===2&&[2,3,4].includes(major)){
    const headerSize=v.getUint32(8,true),alg=v.getUint32(20,true),bits=v.getUint32(28,true),offset=12+headerSize;
    if(![0x660e,0x660f,0x6610].includes(alg)||v.getUint32(24,true)!==0x8004||![128,192,256].includes(bits))throw new Error('NotImplemented: standard OOXML cipher');
    const saltSize=v.getUint32(offset,true),salt=info.subarray(offset+4,offset+4+saltSize);if(saltSize!==16)throw new Error('Invalid encryption salt');
    const h=sha1(concatBytes(passwordHash(password,salt,50000,sha1),uint(0))),derive=(fill:number)=>{const a=new Uint8Array(64).fill(fill);h.forEach((n,i)=>a[i]^=n);return sha1(a);},key=concatBytes(derive(0x36),derive(0x5c)).subarray(0,bits/8);
    const start=offset+4+saltSize,verifier=ecb(key,{disablePadding:true}).decrypt(info.subarray(start,start+16)),hash=ecb(key,{disablePadding:true}).decrypt(info.subarray(start+20,start+52)).subarray(0,20);
    if(!equalBytes(sha1(verifier),hash))throw passwordError(3);return ecb(key,{disablePadding:true}).decrypt(data.subarray(8)).subarray(0,packageSize(data));
  }
  throw new Error(`NotImplemented: OOXML encryption version ${major}.${minor}`);
}
export function encryptXlsx(bytes:Uint8Array,password:string):Uint8Array {
  const salt=randomBytes(16),dataSalt=randomBytes(16),verifier=randomBytes(16),key=randomBytes(32),hmacKey=randomBytes(64),spin=100000,hash=sha512;
  const h=passwordHash(password,salt,spin,hash),enc=(b:Uint8Array,block:Uint8Array)=>b64(crypt(resize(hash(concatBytes(h,block)),32),salt,b)),iv=(b:Uint8Array)=>resize(hash(concatBytes(dataSalt,b)),16);
  const data=new Uint8Array(8+Math.ceil(bytes.length/16)*16);new DataView(data.buffer).setBigUint64(0,BigInt(bytes.length),true);
  for(let at=0,i=0;at<bytes.length;at+=4096,i++)data.set(crypt(key,iv(uint(i)),bytes.subarray(at,at+4096)),8+at);
  const attrs={saltSize:16,blockSize:16,keyBits:256,hashSize:64,cipherAlgorithm:'AES',cipherChaining:'ChainingModeCBC',hashAlgorithm:'SHA512'};
  const xml=declaration+tag('encryption',{xmlns:'http://schemas.microsoft.com/office/2006/encryption','xmlns:p':'http://schemas.microsoft.com/office/2006/keyEncryptor/password'},tag('keyData',{...attrs,saltValue:b64(dataSalt)})+tag('dataIntegrity',{encryptedHmacKey:b64(crypt(key,iv(blocks.hmacKey),hmacKey)),encryptedHmacValue:b64(crypt(key,iv(blocks.hmacValue),hmac(hash,hmacKey,data)))})+tag('keyEncryptors',{},tag('keyEncryptor',{uri:'http://schemas.microsoft.com/office/2006/keyEncryptor/password'},tag('p:encryptedKey',{...attrs,spinCount:spin,saltValue:b64(salt),encryptedVerifierHashInput:enc(verifier,blocks.input),encryptedVerifierHashValue:enc(hash(verifier),blocks.verifier),encryptedKeyValue:enc(key,blocks.key)}))));
  const content=new TextEncoder().encode(xml),info=new Uint8Array(8+content.length),v=new DataView(info.buffer);v.setUint16(0,4,true);v.setUint16(2,4,true);v.setUint32(4,0x40,true);info.set(content,8);
  return writeCompound(new Map([['EncryptionInfo',info],['EncryptedPackage',data]]));
}
