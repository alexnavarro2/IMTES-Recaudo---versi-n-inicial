import ExcelJS from 'exceljs';
import {parse} from 'csv-parse/sync';
import {credentialRows,credentialConsolidatedCsv} from './history-excel';
import {dateValue,parseSnapshot,weekKey,type WeeklyRow} from './history-model';
import {isoWeek,type IsoWeek} from './iso-week';
const aliases:Record<string,string>={'TARIFA GENERAL':'PREPAGO','DISCAPACITADO':'DISCAPACIDAD'};
const profiles=new Set(['PREPAGO','ESTUDIANTE','TERCERA EDAD','DISCAPACIDAD','GOBIERNO']);
export function credentialProfiles(row:WeeklyRow){const result:Record<string,number>={};for(const [name,count] of Object.entries(row.profiles||{})){const normal=name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),key=aliases[normal]||normal;if(!profiles.has(key))throw new Error('Perfil de credencialización desconocido. Revisa el reporte.');if(!Number.isSafeInteger(count)||count<0)throw new Error('Conteo de credencialización inválido.');result[key]=(result[key]||0)+count;}if(Object.values(result).reduce((a,b)=>a+b,0)!==row.count)throw new Error('Los perfiles de credencialización no coinciden con el total.');return result;}
export async function parseCredentials(name:string,data:Buffer,period:IsoWeek){let text:string|undefined;const ext=name.split('.').at(-1)?.toLowerCase();if(ext==='xlsx'){const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(data as never,{ignoreNodes:['mergeCells']});if(workbook.getWorksheet('long_consolidado'))text=await credentialConsolidatedCsv(data);else{const movements=parseCredentialMovements(workbook,period);if(movements)return movements;const row=await credentialRows(data,period);if(!row||weekKey(row)!==weekKey(period))throw new Error('El reporte de credencialización no corresponde a la semana seleccionada.');row.profiles=credentialProfiles(row);return {row,records:row.count,snapshot:undefined};}}else if(ext==='csv')text=new TextDecoder('utf-8',{fatal:true}).decode(data);else throw new Error('Credencialización requiere .xlsx o .csv.');
 const records=parse(text!,{columns:true,bom:true,trim:true,skip_empty_lines:true}) as Record<string,string>[];
 const seen=new Set<string>();for(const record of records){const normalized=Object.fromEntries(Object.entries(record).map(([k,v])=>[k.toLowerCase().replace(/[ _]/g,''),v]));if(/TOTAL GENERAL|GRAND TOTAL/i.test((normalized.perfil||'')+' '+(normalized.establecimiento||'')))continue;const key=JSON.stringify([normalized.anioiso,normalized.semanaiso,normalized.perfil?.trim().toUpperCase(),normalized.establecimiento?.trim().toUpperCase()]);if(seen.has(key))throw new Error('El consolidado de credencialización repite un perfil y establecimiento en la misma semana.');seen.add(key);}
 const snapshot=parseSnapshot('CREDENCIALIZACION',text!,{year:2100,week:53});if(snapshot.some(r=>weekKey(r)>weekKey(period)))throw new Error('El consolidado contiene semanas posteriores a la seleccionada.');for(const row of snapshot)row.profiles=credentialProfiles(row);const row=snapshot.find(r=>weekKey(r)===weekKey(period));if(!row)throw new Error('Falta la semana seleccionada en credencialización.');return {row,records:records.length,snapshot:snapshot.length>1?snapshot:undefined};
}
export function reconcileCredentials(oldRows:WeeklyRow[],snapshot:WeeklyRow[]|undefined,period:IsoWeek){if(!snapshot)return;for(const old of oldRows.filter(r=>weekKey(r)<weekKey(period))){const candidate=snapshot.find(r=>weekKey(r)===weekKey(old));if(!candidate)throw new Error('El consolidado de credencialización omite una semana del histórico.');const left=credentialProfiles(old),right=credentialProfiles(candidate);if(old.count!==candidate.count||[...new Set([...Object.keys(left),...Object.keys(right)])].some(p=>(left[p]||0)!==(right[p]||0)))throw new Error('El consolidado modifica semanas anteriores de credencialización. Revisa las diferencias antes de continuar.');}}

const emissionMovements=new Set(['PERSONALIZACION','REEXPEDICION','VENTA','REPOSICION']);
function normalizedText(value:unknown){return String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');}
function movementValue(value:ExcelJS.CellValue):unknown{if(value&&typeof value==='object'){if('result'in value)return value.result;if('richText'in value)return value.richText.map(part=>part.text).join('');}return value;}
function parseCredentialMovements(workbook:ExcelJS.Workbook,period:IsoWeek){
 const sheet=workbook.worksheets[0];if(!sheet)return null;
 const headers=new Map<string,number>();sheet.getRow(3).eachCell((cell,column)=>headers.set(normalizedText(movementValue(cell.value)).replace(/[^A-Z0-9]/g,''),column));
 if(!headers.has('MOVIMIENTO'))return null;
 for(const name of ['ESTABLECIMIENTO','MOVIMIENTO','FECHAHORA','CLASE'])if(!headers.has(name))throw new Error(`El archivo de movimientos requiere la columna ${name} en la fila 3.`);
 const row:WeeklyRow={...period,count:0,amountCents:0,profiles:{}};
 for(let r=4;r<=sheet.rowCount;r++){
  const cells=sheet.getRow(r),get=(name:string)=>movementValue(cells.getCell(headers.get(name)!).value);
  if(!emissionMovements.has(normalizedText(get('MOVIMIENTO'))))continue;
  const rawDate=get('FECHAHORA'),date=rawDate instanceof Date?rawDate:dateValue(rawDate);
  // The reference notebook drops movements without a valid date.
  if(!date||!Number.isFinite(date.getTime()))continue;
  if(weekKey(isoWeek(date))!==weekKey(period))throw new Error('Los movimientos de emisión contienen fechas fuera de la semana seleccionada.');
  if(!String(get('ESTABLECIMIENTO')??'').trim())throw new Error('Hay movimientos de emisión sin establecimiento.');
  const name=normalizedText(get('CLASE')),profile=aliases[name]||name;
  if(!profiles.has(profile))throw new Error('Hay movimientos de emisión sin Clase válida. Revisa el perfil de las tarjetas.');
  row.profiles![profile]=(row.profiles![profile]||0)+1;row.count++;
 }
 if(!row.count)throw new Error('No hay movimientos de PERSONALIZACIÓN, REEXPEDICIÓN, VENTA o REPOSICIÓN con fecha válida para procesar.');
 return {row,records:row.count,snapshot:undefined};
}
