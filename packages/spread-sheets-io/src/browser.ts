import { install, type IoGC } from './install.js';
declare const module: {exports:unknown}|undefined;
declare const require: ((id:string)=>IoGC)|undefined;
declare const define: (((deps:string[],factory:(core:IoGC)=>void)=>void)&{amd?:unknown})|undefined;
if(typeof module==='object'&&module&&typeof require==='function'){
  install(require('@mescius/spread-sheets'));module.exports={};
}else if(typeof define==='function'&&define.amd)define(['@mescius/spread-sheets'],install);
else {
  const GC=(globalThis as typeof globalThis&{GC?:IoGC}).GC;
  if(!GC)throw new Error('Load the spreadsheet core before the IO plugin');
  install(GC);
}
