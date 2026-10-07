'use client';
import { useState, useTransition } from 'react';
import { listSourceFiles } from '@/lib/server/drive-actions';
import { type DriveEntry, type FolderType } from '@/lib/drive-model';
import { driveLabel } from './drive-settings';
export function SourceExplorer({ type }: { type: FolderType }) {
 const [open,setOpen]=useState(false);const [pending,start]=useTransition();const [files,setFiles]=useState<DriveEntry[]>([]);const [nextPage,setNextPage]=useState<string>();const [error,setError]=useState('');
 function load(append=false){setOpen(true);setError('');start(async()=>{const result=await listSourceFiles(type,append?nextPage:undefined);setFiles(previous=>append?[...previous,...result.entries]:result.entries);setNextPage(result.nextPage);if(result.error)setError(driveLabel(result.error));});}
 return <><button className="button drive-button" disabled={pending} onClick={()=>load()}>Explorar carpeta de Google Drive</button>{open&&<section className="source-explorer" aria-label={`Archivos de Drive ${type}`} aria-busy={pending}><p>Solo metadatos de archivos compatibles. No se descargan ni procesan archivos.</p>{error&&<p role="alert">{error}</p>}{files.map(file=><div className="selected-file" key={file.id}><div><strong>{file.name}</strong><small>{file.mimeType} · {file.size?`${(Number(file.size)/1024).toLocaleString('es-MX',{maximumFractionDigits:1})} KB`:'Tamaño no disponible'}</small><small>{file.modifiedTime?new Date(file.modifiedTime).toLocaleString('es-MX'):'Sin fecha'}</small></div></div>)}{!files.length&&!pending&&!error&&<p>Sin archivos compatibles en esta página.</p>}{nextPage&&<button className="button outline" disabled={pending} onClick={()=>load(true)}>Cargar más</button>}<button className="button small outline" onClick={()=>setOpen(false)}>Cerrar lista</button></section>}</>;
}
