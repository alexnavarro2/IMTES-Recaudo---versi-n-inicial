import {auth} from '@/auth';
import {allowedEmail} from '@/lib/auth/security';
import {reportModel} from '@/lib/reports/model';
import {historyData} from '@/lib/server/history';
import {generateWeeklyReport} from '@/lib/server/reports';
import {revalidatePath} from 'next/cache';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
 const session=await auth();if(!session?.user?.id||!allowedEmail(session.user.email))return Response.json({error:'Inicia sesión con una cuenta autorizada.'},{status:401});if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origen no autorizado.'},{status:403});
 try{const chunks:Uint8Array[]=[];let size=0;if(!request.body)return Response.json({error:'Solicitud inválida.'},{status:400});for await(const part of request.body){size+=part.length;if(size>1000)return Response.json({error:'Solicitud inválida.'},{status:413});chunks.push(part);}let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf-8'));}catch{return Response.json({error:'Solicitud inválida.'},{status:400});}const period={year:Number(value.year),week:Number(value.week)};
 // Validate separately so only known data-validation messages reach the browser.
 try{reportModel(await historyData(session.user.id),period);}catch(e){if(e instanceof Error&&/^(Periodo|Solo se generan|Faltan datos|Revisa las advertencias|Falta |Hay semanas|Hay cifras|Falta el detalle|Perfil |Los perfiles|El acumulado|Las tarjetas)/.test(e.message))return Response.json({error:e.message},{status:400});throw e;}
 const result=await generateWeeklyReport(session.user.id,period);revalidatePath('/reportes');return Response.json({result:{...result,url:`/api/reportes/${result.id}/pptx`}},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'No fue posible generar el PPTX. Revisa la conexión y vuelve a intentarlo.'},{status:500});}
}
