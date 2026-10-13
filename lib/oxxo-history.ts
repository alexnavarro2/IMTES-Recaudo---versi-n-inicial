import {createHash} from 'node:crypto';
import {parse} from 'csv-parse/sync';
import {dateValue,weekKey,type WeeklyRow} from './history-model';
import {isoWeek,type IsoWeek} from './iso-week';

/** Rebuild totals from the original DAT corpus, never from saved weekly totals. */
export class OxxoHistory {
 private hashes=new Set<string>();
 private weeks=new Map<number,WeeklyRow>();
 records=0;
 constructor(private cutoff:IsoWeek){}
 add(data:Buffer){
  const digest=createHash('sha256').update(data).digest('hex');
  if(this.hashes.has(digest))return {digest,added:false};
  const lines=parse(new TextDecoder('utf-8',{fatal:true}).decode(data),{bom:true,skip_empty_lines:true,trim:true}) as string[][];
  for(const line of lines){
   if(line.length!==7)throw new Error('DAT inválido: se esperan siete columnas.');
   const date=dateValue(line[2].replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'));
   if(!date)throw new Error('Fecha OXXO inválida.');
   const period=isoWeek(date);if(weekKey(period)>weekKey(this.cutoff))continue;
   if(!line[5].slice(0,14).startsWith('04'))continue;
   const amount=Number(line[6]);if(!Number.isFinite(amount)||amount<0)throw new Error('Importe OXXO inválido.');
   const row=this.weeks.get(weekKey(period))||{...period,count:0,amountCents:0};
   // Match Colab: count non-empty folios; sum income for every filtered row.
   if(line[4])row.count++;row.amountCents+=Math.round(amount*100);this.records++;
   if(!Number.isSafeInteger(row.amountCents))throw new Error('El ingreso OXXO excede el rango admitido.');
   this.weeks.set(weekKey(period),row);
  }
  this.hashes.add(digest);return {digest,added:true};
 }
 rows(){return [...this.weeks.values()].sort((a,b)=>weekKey(a)-weekKey(b));}
 fingerprint(){return createHash('sha256').update(JSON.stringify([...this.hashes].sort())).digest('hex');}
}
export function verifyOxxoCoverage(previous:WeeklyRow[],rebuilt:WeeklyRow[]){
 const keys=new Set(rebuilt.map(weekKey));
 if(previous.some(row=>!keys.has(weekKey(row))))throw new Error('Faltan DAT del histórico en la carpeta OXXO. Conserva todos los archivos originales antes de recalcular; no se modificaron los datos guardados.');
 if(!rebuilt.length)throw new Error('Los DAT no contienen operaciones de tarjetas 04 hasta el corte seleccionado.');
}
