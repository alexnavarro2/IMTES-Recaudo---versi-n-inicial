import {parse} from 'csv-parse/sync';
function header(value:unknown){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
export function readValidationCsv(data:Buffer):unknown[][]{
 let text:string;
 if(data[0]===0xff&&data[1]===0xfe)text=new TextDecoder('utf-16le',{fatal:true}).decode(data);
 else if(data[0]===0xfe&&data[1]===0xff)text=new TextDecoder('utf-16be',{fatal:true}).decode(data);
 else{try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{text=new TextDecoder('windows-1252').decode(data);}}
 // BEA exports include period and title rows before the actual column headings.
 for(const delimiter of [',',';','\t']){
  let preview:{record:string[];info:{lines:number}}[];
  try{preview=parse(text,{delimiter,bom:true,skip_empty_lines:true,trim:true,relax_column_count:true,to_line:50,info:true}) as unknown as {record:string[];info:{lines:number}}[];}catch{continue;}
  const found=preview.find(({record})=>{const names=record.map(header);return names.some(n=>['TARJETA','IDTARJETA','NOTARJETA','NUMEROTARJETA','NUMTARJETA'].includes(n))&&names.some(n=>['FECHAHORA','FECHAHORAVALIDACION','FECHAHORADEVALIDACION','FECHA'].includes(n));});
  if(found){const rows=parse(text,{delimiter,bom:true,skip_empty_lines:false,trim:true,relax_column_count:true,from_line:found.info.lines+1}) as string[][];const names=found.record.map(header),serial=names.indexOf('NO'),card=names.findIndex(n=>['TARJETA','IDTARJETA','NOTARJETA','NUMEROTARJETA','NUMTARJETA'].includes(n)),date=names.findIndex(n=>['FECHAHORA','FECHAHORAVALIDACION','FECHAHORADEVALIDACION','FECHA'].includes(n));const end=rows.findIndex(row=>row.every(cell=>cell.trim()==='')||(serial>=0&&!row[serial]?.trim()&&!row[card]?.trim()&&!row[date]?.trim()));return [found.record,...(end<0?rows:rows.slice(0,end))];}
 }
 throw new Error('No se detectaron las columnas Tarjeta y Fecha/Hora en las primeras 50 líneas del CSV de validaciones.');
}
