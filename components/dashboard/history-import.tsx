'use client';
import { useState,useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importSource } from '@/lib/server/history-actions';
import { historySources } from '@/lib/history-model';
export function HistoryImport(){const[busy,start]=useTransition(),[messages,setMessages]=useState<string[]>([]);const router=useRouter();return <section className="panel settings-panel"><h2>Importar histórico de Drive</h2><p>Actualiza los consolidados y los Excel CAUS hasta la última semana cerrada. Repetir la importación reemplaza cada fuente y no suma sus totales otra vez.</p><button className="button primary" disabled={busy} onClick={()=>start(async()=>{setMessages([]);for(const source of historySources){setMessages(prev=>[...prev,`Consultando ${source}…`]);try{const result=await importSource(source);setMessages(prev=>[...prev.slice(0,-1),result.message]);}catch{setMessages(prev=>[...prev.slice(0,-1),`${source}: no se pudo completar la importación.`]);}}router.refresh();})}>{busy?'Importando fuentes…':'Importar / actualizar histórico'}</button><div role="status" aria-live="polite">{messages.map((message,i)=><p key={i}>{message}</p>)}</div></section>;}
