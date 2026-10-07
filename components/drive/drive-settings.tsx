'use client';
import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen, FileText, X, ChevronRight, ArrowLeft, Link as LinkIcon } from 'lucide-react';
import { browseDrive, selectFolder, disconnectDrive } from '@/lib/server/drive-actions';
import { connectDrive } from '@/lib/server/auth-actions';
import { folderTypes, isFolder, type BrowseLocation, type DriveEntry, type DriveState, type FolderType } from '@/lib/drive-model';
const labels: Record<string,string> = { connected: 'Conectado', disconnected: 'No conectado', expired: 'Sesión de Drive expirada', error: 'Error de conexión', available: 'Disponible', missing: 'No encontrada o sin acceso', forbidden: 'Sin permiso', changed: 'Acceso directo modificado', unconfigured: 'Carpeta sin seleccionar' };
export function driveLabel(status: string) { return labels[status] || 'No disponible'; }
type Crumb = { name: string; location: BrowseLocation };
export function DriveSettings({ state }: { state: DriveState }) {
  const router = useRouter(); const [pending,start] = useTransition(); const [message,setMessage] = useState(''); const [type,setType] = useState<FolderType | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!type) return;
    const previous = document.activeElement as HTMLElement | null;
    const savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.body.style.overflow = savedOverflow; previous?.focus(); };
  }, [type]);
  const [crumbs,setCrumbs] = useState<Crumb[]>([]); const [entries,setEntries] = useState<DriveEntry[]>([]); const [nextPage,setNextPage] = useState<string>(); const [selected,setSelected] = useState<DriveEntry | null>(null);
  function load(path: Crumb[], append = false) {
    setSelected(null); setMessage(''); start(async () => { const result = await browseDrive(path[path.length-1].location, append ? nextPage : undefined); setCrumbs(path); setEntries(previous => append ? [...previous,...result.entries] : result.entries); setNextPage(result.nextPage); if(result.error) setMessage(driveLabel(result.error)); });
  }
  function root(mode: 'mine'|'shared'|'drives') { load([{ name: mode === 'mine' ? 'Mi Drive' : mode === 'shared' ? 'Compartido conmigo' : 'Unidades compartidas', location: { mode } }]); }
  function open(entry: DriveEntry) {
    if (entry.mimeType === 'shared-drive') load([...crumbs,{ name: entry.name, location: { mode:'drive',id:entry.id } }]);
    else if (isFolder(entry)) load([...crumbs,{ name: entry.name, location: { mode:'folder', id: entry.shortcutDetails?.targetId || entry.id, resourceKey: entry.shortcutDetails?.targetResourceKey || entry.resourceKey } }]);
  }
  return <section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">GOOGLE DRIVE</span><h2>Conexión y carpetas</h2><p>Selecciona las carpetas compartidas que corresponden a tus fuentes.</p></div><span className="status-badge">{pending ? 'Conectando / validando…' : driveLabel(state.status)}</span></div>
    <div className="connection-row"><div><strong>{state.email || 'Conecta tu cuenta de Google'}</strong><p>{state.lastValidatedAt ? `Última validación: ${new Date(state.lastValidatedAt).toLocaleString('es-MX')}` : 'Sin validación de Drive.'}</p></div>
    <form action={connectDrive}><button className="button outline" disabled={pending}>{state.status === 'connected' ? 'Renovar autorización' : 'Conectar Google Drive'}</button></form>
    {state.status !== 'disconnected' && <button className="button outline" disabled={pending} onClick={()=>start(async()=>{const result=await disconnectDrive();setMessage(result.warning || 'Drive desconectado.');router.refresh();})}>Desconectar</button>}</div>
    <div className="folder-list">{folderTypes.map(source=>{const folder=state.folders.find(item=>item.type===source);return <div className="folder-row" key={source}><FolderOpen size={20}/><strong>Carpeta {source}</strong><div><span>{folder?.name || 'Carpeta sin seleccionar'}</span><small>{folder ? driveLabel(folder.status) : 'Pendiente'}{folder?.shortcutId ? ' · Acceso directo' : ''}</small>{source==='REPORTES' && folder && !folder.canWrite && <small className="error-text">La cuenta no puede agregar archivos en esta carpeta. Solicita permiso de editor.</small>}{folder?.lastValidatedAt && <small>Validada: {new Date(folder.lastValidatedAt).toLocaleString('es-MX')}</small>}</div><button className="button small outline" disabled={state.status!=='connected'||pending} onClick={()=>{setType(source);root('mine');}}>{folder ? 'Cambiar carpeta' : 'Seleccionar carpeta'}</button></div>;})}</div>
    {message && !type && <p role="status">{message}</p>}
    {type && <div className="drive-picker" ref={dialog} onKeyDown={event=>{
      if(event.key==='Escape'){event.stopPropagation();setType(null);setMessage('');}
      if(event.key==='Tab'){const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    }} role="dialog" aria-modal="true" aria-label={`Seleccionar carpeta ${type}`}><div className="panel drive-dialog"><div className="panel-heading"><h2>Carpeta {type}</h2><button autoFocus className="icon-button" aria-label="Cerrar selector" onClick={()=>{setType(null);setMessage('');}}><X/></button></div><p>Selecciona una carpeta o un acceso directo a carpeta. Los archivos se muestran como referencia.</p><div className="drive-tabs">{(['mine','shared','drives'] as const).map(mode=><button key={mode} disabled={pending} className="button outline" aria-pressed={crumbs[0]?.location.mode===mode} onClick={()=>root(mode)}>{mode==='mine'?'Mi Drive':mode==='shared'?'Compartido conmigo':'Unidades compartidas'}</button>)}</div>
    <nav aria-label="Ruta de carpetas" className="drive-breadcrumbs">{crumbs.length>1 && <button aria-label="Volver a carpeta anterior" disabled={pending} onClick={()=>load(crumbs.slice(0,-1))}><ArrowLeft size={16}/></button>}{crumbs.map((crumb,index)=><button key={index} disabled={pending} onClick={()=>load(crumbs.slice(0,index+1))}>{crumb.name}<ChevronRight size={14}/></button>)}</nav>
    <div className="drive-entries" aria-busy={pending}>{entries.map(entry=><div key={entry.id} className={`drive-entry ${selected?.id===entry.id?'selected':''}`}><button disabled={pending || !isFolder(entry)} onClick={()=>setSelected(entry)}>{isFolder(entry)||entry.mimeType==='shared-drive'?<FolderOpen size={18}/>:<FileText size={18}/>}<span>{entry.name}<small>{entry.shortcutDetails ? <><LinkIcon size={12}/> Acceso directo</> : isFolder(entry)?'Carpeta':entry.mimeType==='shared-drive'?'Unidad compartida':'Archivo'}</small></span></button>{(isFolder(entry)||entry.mimeType==='shared-drive') && <button aria-label={`Abrir ${entry.name}`} disabled={pending} onClick={()=>open(entry)}><ChevronRight size={18}/></button>}</div>)}{!entries.length&&!pending&&<p>No hay elementos en esta ubicación.</p>}</div>
    {nextPage&&<button className="button outline" disabled={pending} onClick={()=>load(crumbs,true)}>Cargar más</button>}{message&&<p role="alert">{message}</p>}<div className="settings-bottom"><span>{selected ? selected.name : 'Selecciona una carpeta de la lista.'}</span><button className="button primary" disabled={!selected||pending} onClick={()=>{if(!selected)return;start(async()=>{const result=await selectFolder(type,selected.id,selected.resourceKey);if(result.error)setMessage(driveLabel(result.error));else{setType(null);setMessage('Carpeta guardada.');router.refresh();}});}}>Guardar carpeta</button></div></div></div>}
  </section>;
}
