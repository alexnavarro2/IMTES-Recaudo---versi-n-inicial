import 'server-only';
import {createHash} from 'node:crypto';
import {parseIncomeReference} from '@/lib/reports/income-reference';
import {driveRequest,accessToken} from './drive';
export async function loadIncomeReference(userId:string,year:number){
 const name=`recaudoElect_semana_${year}.xlsx`;
 const result=await driveRequest<{files:{id:string;name:string;size?:string;modifiedTime?:string;resourceKey?:string}[]}>(userId,'files',{q:`trashed=false and name='${name}'`,fields:'files(id,name,size,modifiedTime,resourceKey)',supportsAllDrives:'true',includeItemsFromAllDrives:'true',pageSize:'100'});
 if(result.files.length!==1)throw new Error(result.files.length?`Hay varios anexos ${name} en Drive. Conserva una referencia inequívoca.`:`No se encontró ${name} en Drive. La cuenta debe tener acceso al anexo para generar el comparativo.`);
 const file=result.files[0];if(Number(file.size)>20*1024*1024)throw new Error('El anexo de ingresos excede 20 MB.');
 const token=await accessToken(userId),response=await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`,...(file.resourceKey?{'X-Goog-Drive-Resource-Keys':`${file.id}/${file.resourceKey}`}:{})},cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok||!response.body)throw new Error('No fue posible leer el anexo de ingresos autorizado en Drive.');
 const parts:Uint8Array[]=[];let bytes=0;for await(const part of response.body){bytes+=part.length;if(bytes>20*1024*1024)throw new Error('El anexo de ingresos excede 20 MB.');parts.push(part);}
 const data=Buffer.concat(parts),reference=await parseIncomeReference(data,year);reference.file={id:file.id,name:file.name,modifiedTime:file.modifiedTime||null,hash:createHash('sha256').update(data).digest('hex')};return reference;
}
