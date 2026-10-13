import ExcelJS from 'exceljs';
import {isoWeek} from '@/lib/iso-week';
import {checkXlsxSize} from '@/lib/xlsx-limits';
export type IncomeReference={year:number;rows:{week:number;amount:number}[];file?:{id:string;name:string;modifiedTime:string|null;hash:string}};
export async function parseIncomeReference(data:Buffer,year:number):Promise<IncomeReference>{
 await checkXlsxSize(data);const w=new ExcelJS.Workbook();await w.xlsx.load(data as never,{ignoreNodes:['mergeCells']});const sheet=w.worksheets[0];if(!sheet)throw new Error('El anexo de ingresos no tiene hoja.');
 const headers=new Map<string,number>();sheet.getRow(1).eachCell((c,i)=>headers.set(String(c.value??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,''),i));
 const yc=headers.get('ANIOISO'),wc=headers.get('SEMANAISO'),ac=headers.get('IMPORTESEMANALTOTAL');if(!yc||!wc||!ac)throw new Error('El anexo requiere Anio_ISO, Semana_ISO e IMPORTE_SEMANAL_TOTAL.');
 const rows:IncomeReference['rows']=[],seen=new Set<number>();
 for(let r=2;r<=sheet.rowCount;r++){const cells=sheet.getRow(r);if(Number(cells.getCell(yc).value)!==year)continue;const week=Number(cells.getCell(wc).value),raw=cells.getCell(ac).value,amount=typeof raw==='object'&&raw&&'result'in raw?Number(raw.result):Number(raw);
  if(!Number.isInteger(week)||week<1||week>isoWeek(new Date(Date.UTC(year,11,28))).week||raw===null||!Number.isFinite(amount)||amount<0)throw new Error('El anexo de ingresos contiene semanas o importes inválidos.');
  if(seen.has(week))throw new Error('El anexo de ingresos contiene semanas duplicadas.');seen.add(week);rows.push({week,amount});
 }
 if(!rows.length)throw new Error(`El anexo no contiene ingresos de ${year}.`);return {year,rows:rows.sort((a,b)=>a.week-b.week)};
}
/** Match Colab: sum original amounts for matching ISO weeks, then round the total. */
export function referenceIncomeCents(reference:IncomeReference,year:number,throughWeek:number):number{
 if(reference.year!==year)throw new Error('El año del anexo no coincide con el comparativo.');
 for(let week=1;week<=throughWeek;week++)if(!reference.rows.some(r=>r.week===week))throw new Error(`Falta el ingreso de referencia en ${year}-S${String(week).padStart(2,'0')}.`);
 const result=Math.round(reference.rows.filter(r=>r.week<=throughWeek).reduce((sum,r)=>sum+r.amount,0)*100);if(!Number.isSafeInteger(result))throw new Error('El total del anexo excede el rango permitido.');return result;
}
