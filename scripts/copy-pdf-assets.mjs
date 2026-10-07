import {readFile,mkdir,copyFile,cp} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),source=path.join(root,'node_modules/pdfjs-dist'),{version}=JSON.parse(await readFile(path.join(source,'package.json'),'utf-8')),target=path.join(root,'public/pdf-assets',version);
await mkdir(target,{recursive:true});await copyFile(path.join(source,'build/pdf.worker.min.mjs'),path.join(target,'pdf.worker.min.mjs'));for(const folder of ['standard_fonts','wasm','cmaps'])await cp(path.join(source,folder),path.join(target,folder),{recursive:true});console.log('Recursos del visor PDF preparados.');
