import GC from './index.js';
(globalThis as typeof globalThis & { GC: typeof GC }).GC = GC;
