import { auth } from '@/auth';
import { allowedEmail } from '@/lib/auth/security';
import { checkedPeriod, MAX_UPLOAD_BYTES, weeklySources, type WeeklySource } from '@/lib/weekly-model';
import { processWeekly } from '@/lib/server/weekly';
import { revalidatePath } from 'next/cache';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:Request){
 const session=await auth();if(!session?.user?.id||!allowedEmail(session.user.email))return Response.json({error:'Inicia sesión con una cuenta autorizada.'},{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origen no autorizado.'},{status:403});
 if(Number(request.headers.get('content-length'))>MAX_UPLOAD_BYTES+65536)return Response.json({error:'El lote excede 3 MB.'},{status:413});
 try{const chunks:Uint8Array[]=[];let bytes=0;if(!request.body)throw new Error('Solicitud vacía.');for await(const part of request.body){bytes+=part.length;if(bytes>MAX_UPLOAD_BYTES+65536)return Response.json({error:'El lote excede 3 MB.'},{status:413});chunks.push(part);}const form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData(),source=String(form.get('source')) as WeeklySource;if(!weeklySources.includes(source))throw new Error('Fuente inválida.');const period=checkedPeriod(Number(form.get('year')),Number(form.get('week')));const entries=form.getAll('files');if(!entries.length||entries.some(f=>!(f instanceof File)))throw new Error('Selecciona archivos válidos.');const files=entries as File[];if(files.reduce((n,f)=>n+f.size,0)>MAX_UPLOAD_BYTES)throw new Error('El lote excede 3 MB.');const result=await processWeekly(session.user.id,source,period,await Promise.all(files.map(async f=>({name:f.name,data:Buffer.from(await f.arrayBuffer())}))));revalidatePath('/dashboard');revalidatePath('/actualizar');return Response.json({result},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const message=error instanceof Error?error.message:'';const safe=message&&!/postgres|prisma|database|connection|token|secret|connect|query|socket|timeout|fetch/i.test(message)?message:'No fue posible completar el procesamiento. Revisa la conexión y reintenta con los mismos archivos.';return Response.json({error:safe},{status:400,headers:{'Cache-Control':'no-store'}});}
}
