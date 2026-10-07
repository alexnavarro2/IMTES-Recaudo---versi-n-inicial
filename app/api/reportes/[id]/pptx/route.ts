import {auth} from '@/auth';
import {allowedEmail} from '@/lib/auth/security';
import {db} from '@/lib/server/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const session=await auth();if(!session?.user?.id||!allowedEmail(session.user.email))return new Response('Inicia sesión.',{status:401});const {id}=await params;if(!/^[a-z0-9]{15,40}$/.test(id))return new Response('Reporte no disponible.',{status:404});
 const report=await db().weeklyReport.findFirst({where:{id,userId:session.user.id},select:{pptx:true,year:true,week:true}});if(!report)return new Response('Reporte no disponible.',{status:404});
 return new Response(new Uint8Array(report.pptx),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation','Content-Disposition':`attachment; filename="Credencializacion_Semana${report.week}_${report.year}.pptx"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
