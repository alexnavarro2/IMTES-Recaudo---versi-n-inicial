import 'server-only';
import {Pool} from 'pg';
import type {Prisma} from '@prisma/client';
import {OxxoHistory,verifyOxxoCoverage} from '@/lib/oxxo-history';
import {hash,weeklyCsv,type InputFile} from '@/lib/weekly-model';
import {MAX_PROCESS_BYTES} from '@/lib/upload-limits';
import type {IsoWeek} from '@/lib/iso-week';
import type {WeeklyRow} from '@/lib/history-model';
import type {DriveEntry} from '@/lib/drive-model';
import {db} from './db';
import {accessToken,driveRequest} from './drive';
import {sharedHistoryDataset} from './shared-history';
import {upload} from './weekly';
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function processOxxo(userId:string,period:IsoWeek,incoming:InputFile[],expectedFolderId?:string){
 if(!incoming.length||incoming.length>8||incoming.reduce((n,f)=>n+f.data.length,0)>MAX_PROCESS_BYTES)throw new Error('Selecciona hasta ocho DAT y 50 MB por carga.');
 if(incoming.some(f=>!f.name.toLowerCase().endsWith('.dat')))throw new Error('OXXO requiere archivos .DAT.');
 const folder=await db().driveFolder.findUnique({where:{userId_type:{userId,type:'OXXO'}}});
 if(!folder)throw new Error('Configura primero la carpeta OXXO.');
 if(expectedFolderId&&expectedFolderId!==folder.folderId)throw new Error('La carpeta cambió durante la carga. Selecciona de nuevo los archivos.');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:15000});
 const connection=await pool.connect().catch(async error=>{await pool.end();throw error;});
 try{
  await connection.query('BEGIN');
  const lock=await connection.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',[`OXXO:${folder.folderId}`]);
  if(!lock.rows[0].locked)throw new Error('OXXO ya se está procesando. Espera a que termine antes de reintentar.');
  const dataset=await sharedHistoryDataset(userId,'OXXO',folder.folderId);
  const account=await db().account.findFirst({where:{userId,provider:'google'}});
  if(!account?.scope?.split(' ').includes('https://www.googleapis.com/auth/drive.file'))throw new Error('La sesión no tiene permiso de carga en Drive. Vuelve a autorizar Google desde Configuración.');
  const resource={id:folder.folderId,key:folder.resourceKey||undefined};
  const metadata=await driveRequest<{capabilities?:{canAddChildren?:boolean}}>(userId,`files/${folder.folderId}`,{fields:'capabilities(canAddChildren)',supportsAllDrives:'true'},resource);
  if(!metadata.capabilities?.canAddChildren)throw new Error('No tienes permiso de editor en la carpeta OXXO.');
  const token=await accessToken(userId),history=new OxxoHistory(period),originals:{id:string;name:string;hash:string}[]=[];
  let page:string|undefined,listed=0;
  do{
   const listing=await driveRequest<{files:DriveEntry[];nextPageToken?:string}>(userId,'files',{q:`trashed=false and '${folder.folderId}' in parents`,fields:'files(id,name,size,resourceKey),nextPageToken',pageSize:'100',supportsAllDrives:'true',includeItemsFromAllDrives:'true',...(page?{pageToken:page}:{})},resource);
   listed+=listing.files.length;if(listed>1000)throw new Error('La carpeta OXXO requiere procesamiento por lotes; no se modificó el histórico.');
   for(const file of listing.files.filter(f=>/\.dat$/i.test(f.name))){
    if(Number(file.size)>MAX_PROCESS_BYTES)throw new Error(`El DAT ${file.name} excede 50 MB.`);
    const key=file.resourceKey;
    const response=await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`,...(key?{'X-Goog-Drive-Resource-Keys':`${file.id}/${key}`}:{})},signal:AbortSignal.timeout(30000),cache:'no-store'});
    if(!response.ok||!response.body)throw new Error(`No fue posible leer el DAT ${file.name}. No se modificó el histórico.`);
    const parts:Uint8Array[]=[];let bytes=0;
    for await(const part of response.body){bytes+=part.length;if(bytes>MAX_PROCESS_BYTES)throw new Error(`El DAT ${file.name} excede 50 MB.`);parts.push(part);}
    const added=history.add(Buffer.concat(parts));if(added.added)originals.push({id:file.id,name:file.name,hash:added.digest});
   }
   page=listing.nextPageToken;
  }while(page);
  const additions:InputFile[]=[];
  for(const file of incoming){const result=history.add(file.data);if(result.added)additions.push(file);}
  const rows=history.rows();verifyOxxoCoverage((dataset?.rows||[]) as unknown as WeeklyRow[],rows);
  const digest=history.fingerprint(),key={userId,source:'OXXO' as const,folderId:folder.folderId,year:period.year,week:period.week};
  const previous=await db().weeklyImport.findUnique({where:{userId_source_folderId_year_week:key}});
  if(previous?.status==='complete'&&previous.fingerprint===digest&&JSON.stringify(dataset?.rows)===JSON.stringify(rows))return {...previous.result as object,duplicate:true};
  for(const file of additions){const fileHash=hash(file.data),name=`OXXO_original_${fileHash.slice(0,16)}.DAT`;
   const id=await upload(userId,token,folder.folderId,folder.resourceKey||undefined,name,file.data,'text/plain',hash(`OXXO:${folder.folderId}:${fileHash}`));originals.push({id,name,hash:fileHash});}
  const csv=Buffer.from(weeklyCsv('OXXO',rows)),name=`OXXO_consolidado_hasta_${period.year}_S${period.week}_${digest.slice(0,12)}.csv`;
  const id=await upload(userId,token,folder.folderId,folder.resourceKey||undefined,name,csv,'text/csv',hash(`OXXO:${folder.folderId}:snapshot:${digest}:${period.year}:${period.week}`));
  const atCutoff=rows.find(row=>row.year===period.year&&row.week===period.week);
  const summary={source:'OXXO',...period,records:history.records,count:atCutoff?.count||0,amountCents:atCutoff?.amountCents||0,weeksProcessed:rows.length,historyRebuilt:true,files:[...originals,{id,name}].map(f=>({id:f.id,name:f.name})),duplicate:false};
  await db().$transaction(async tx=>{
   await tx.historicalDataset.upsert({where:{userId_source:{userId,source:'OXXO'}},create:{userId,source:'OXXO',folderId:folder.folderId,rows:json(rows),provenance:json([...originals,{id,name,hash:hash(csv)}]),warnings:[]},update:{folderId:folder.folderId,rows:json(rows),provenance:json([...originals,{id,name,hash:hash(csv)}]),warnings:[],importedAt:new Date()}});
   await tx.weeklyImport.upsert({where:{userId_source_folderId_year_week:key},create:{...key,fingerprint:digest,status:'complete',result:json(summary)},update:{fingerprint:digest,status:'complete',result:json(summary)}});
  });
  return summary;
 }finally{try{await connection.query('ROLLBACK');}finally{connection.release();await pool.end();}}
}
