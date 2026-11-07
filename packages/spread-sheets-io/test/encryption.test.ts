import { timingSafeEqual } from 'node:crypto';
import { expect, it } from 'vitest';
import { isCompound, readCompound, writeCompound } from '../src/compound.js';
import { decryptXlsx, encryptXlsx } from '../src/encryption.js';
import { readXlsx, writeXlsx } from '../src/xlsx.js';
import { obj } from '../src/common.js';
it('round trips mini streams, regular streams and multi-sector DIFAT',()=>{
  const source=new Map([['empty',new Uint8Array()],['small',new Uint8Array([1,2,3])],['large',Uint8Array.from({length:8*1024*1024},(_,i)=>i%251)]]);
  const bytes=writeCompound(source);expect(isCompound(bytes)).toBe(true);const result=readCompound(bytes);expect([...result.keys()]).toEqual([...source.keys()]);for(const [name,data]of source)expect(timingSafeEqual(result.get(name)!,data)).toBe(true);
  expect(()=>readCompound(bytes.subarray(0,100))).toThrow();
});
it('encrypts OOXML with random salts, verifies passwords and authenticates the package',()=>{
  const plain=writeXlsx({sheets:{Data:{name:'Data',data:{dataTable:{0:{0:{value:'Secret 😀'}}}}}}}).bytes;
  const encrypted=encryptXlsx(plain,'päss😀');expect(isCompound(encrypted)).toBe(true);expect(decryptXlsx(encrypted,'päss😀')).toEqual(plain);
  expect(obj(obj(readXlsx(decryptXlsx(encrypted,'päss😀')).json.sheets).Data).name).toBe('Data');
  expect(()=>decryptXlsx(encrypted)).toThrow(expect.objectContaining({errorCode:2}));expect(()=>decryptXlsx(encrypted,'bad')).toThrow(expect.objectContaining({errorCode:3}));
  const streams=readCompound(encrypted);streams.get('EncryptedPackage')![10]^=1;expect(()=>decryptXlsx(writeCompound(streams),'päss😀')).toThrow('integrity');
  expect(encryptXlsx(plain,'päss😀')).not.toEqual(encrypted);
});
