import { parse } from 'csv-parse/sync';
import { isoWeek, type IsoWeek } from './iso-week';
export type HistorySource = 'OXXO'|'CAUS'|'VALIDACIONES'|'CREDENCIALIZACION';
export const historySources: HistorySource[] = ['OXXO','CAUS','VALIDACIONES','CREDENCIALIZACION'];
export interface WeeklyRow { year:number; week:number; count:number; amountCents:number; profiles?:Record<string,number> }
export interface DatasetView { source:HistorySource; rows:WeeklyRow[]; importedAt:string; warnings:string[] }
export function weekKey(row:{year:number;week:number}) {return row.year*100+row.week;}
export function included(row:WeeklyRow,cutoff:IsoWeek){return weekKey(row)<=weekKey(cutoff);}
function number(value:unknown){const n=Number(String(value??'').replace(/,/g,'').trim());if(value===undefined||String(value).trim()===''||!Number.isFinite(n)||n<0)throw new Error('Dato numérico inválido.');return n;}
function normalize(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[ _]/g,'');}
export function parseSnapshot(source:HistorySource,text:string,cutoff:IsoWeek):WeeklyRow[]{
 const records=parse(text,{columns:true,bom:true,skip_empty_lines:true,trim:true}) as Record<string,string>[];
 const rows=new Map<number,WeeklyRow>();const detailKeys=new Set<string>();
 for(const record of records){const fields=Object.fromEntries(Object.entries(record).map(([k,v])=>[normalize(k),v]));const year=number(fields.anioiso??fields.ano),week=number(fields.semanaiso??fields.semana);if(!Number.isInteger(year)||!Number.isInteger(week)||year<2000||year>2100||week<1||week>isoWeek(new Date(Date.UTC(year,11,28))).week)throw new Error('Año o semana ISO inválida.');
 const row:WeeklyRow={year,week,count:0,amountCents:0};if(!included(row,cutoff))continue;
 if(source==='OXXO'){row.count=number(fields.frecuencia);row.amountCents=Math.round(number(fields.monto)*100);}
 else if(source==='CAUS'){row.amountCents=Math.round(number(fields.ingresocaus)*100);}
 else{row.count=number(fields.tarjetas);if(!Number.isSafeInteger(row.count))throw new Error('Conteo de tarjetas inválido.');}
 const key=weekKey(row);
 if(source==='CREDENCIALIZACION'){
 const profile=fields.perfil?.trim();if(!profile||!fields.establecimiento||!fields.archivo)throw new Error('Consolidado de credencialización incompleto.');if(/TOTAL GENERAL|GRAND TOTAL/i.test(profile+' '+fields.establecimiento))continue;
 const detail=[key,fields.archivo,profile,fields.establecimiento].join('|');if(detailKeys.has(detail))throw new Error('Consolidado con filas duplicadas.');detailKeys.add(detail);
 const previous=rows.get(key)||{...row,count:0,profiles:{}};previous.count+=row.count;previous.profiles![profile]=(previous.profiles![profile]||0)+row.count;rows.set(key,previous);
 }else{if(rows.has(key))throw new Error('Consolidado con semanas duplicadas.');rows.set(key,row);}
 }
 const result=[...rows.values()].sort((a,b)=>weekKey(a)-weekKey(b));if(!result.length)throw new Error('No hay semanas cerradas en este archivo.');
 if(source==='VALIDACIONES')for(let i=1;i<result.length;i++)if(result[i].count<result[i-1].count)throw new Error('El acumulado de tarjetas disminuye; revisa el consolidado.');
 return result;
}
export function sourceCoverage(dataset:DatasetView,cutoff:IsoWeek){const weeks=new Set(dataset.rows.filter(r=>r.year===cutoff.year&&r.week<=cutoff.week).map(r=>r.week));const missing=Array.from({length:cutoff.week},(_,i)=>i+1).filter(w=>!weeks.has(w));const latest=dataset.rows.filter(r=>included(r,cutoff)).at(-1);return {latest:latest?{year:latest.year,week:latest.week}:null,missing,complete:missing.length===0&&dataset.warnings.length===0};}
export function dateValue(value:unknown):Date|null {if(value instanceof Date&&!Number.isNaN(value.valueOf()))return value;if(typeof value!=='string')return null;const iso=value.match(/^(\d{4})-(\d{2})-(\d{2})/);const local=value.match(/(\d{2})\/(\d{2})\/(\d{4})/);const parts=iso?[+iso[1],+iso[2],+iso[3]]:local?[+local[3],+local[2],+local[1]]:null;if(!parts)return null;const d=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));return d.getUTCFullYear()===parts[0]&&d.getUTCMonth()===parts[1]-1&&d.getUTCDate()===parts[2]?d:null;}
