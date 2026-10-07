export const CHUNK_BYTES=1024*1024;
export const MAX_PROCESS_BYTES=50*1024*1024;
export const MAX_INLINE_BYTES=3*1024*1024;
export function chunkLength(size:number,part:number){if(!Number.isSafeInteger(size)||size<1||size>MAX_PROCESS_BYTES||!Number.isInteger(part)||part<0||part>=Math.ceil(size/CHUNK_BYTES))throw new Error('Fragmento de archivo inválido.');return Math.min(CHUNK_BYTES,size-part*CHUNK_BYTES);}
