import {auth} from '@/auth';
import {allowedEmail} from '@/lib/auth/security';
import {db} from '@/lib/server/db';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {buildReportPdf} from '@/lib/reports/pdf';
import type {ReportModel} from '@/lib/reports/model';
export const runtime='nodejs';export const maxDuration=60;
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){const session=await auth();if(!session?.user?.id||!allowedEmail(session.user.email))return new Response('Inicia sesión.',{status:401});const {id}=await context.params;const report=await db().weeklyReport.findFirst({where:{id,userId:session.user.id},select:{year:true,week:true,summary:true}});if(!report)return new Response('Reporte no disponible.',{status:404});const model=(report.summary as {model?:ReportModel}).model;if(!model)return new Response('Genera nuevamente el reporte para habilitar el PDF.',{status:409});try{const data=await buildReportPdf(model,await readFile(path.join(process.cwd(),'public/branding/logo-imtes-2026.png')));return new Response(new Uint8Array(data),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Credencializacion_Semana${report.week}_${report.year}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch{return new Response('No fue posible generar el PDF. Reintenta.',{status:500});}}
