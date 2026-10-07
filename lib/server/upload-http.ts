import 'server-only';
import {auth} from '@/auth';
import {allowedEmail} from '@/lib/auth/security';
export async function uploadUser(request:Request){const session=await auth();if(!session?.user?.id||!allowedEmail(session.user.email))return Response.json({error:'Inicia sesión con una cuenta autorizada.'},{status:401});if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origen no autorizado.'},{status:403});return session.user.id;}
export async function boundedBody(request:Request,limit:number){if(!request.body)throw new Error('Solicitud vacía.');const parts:Uint8Array[]=[];let size=0;for await(const part of request.body){size+=part.length;if(size>limit)throw new Error('La solicitud excede el límite.');parts.push(part);}return Buffer.concat(parts);}
export function uploadFailure(error:unknown){const message=error instanceof Error?error.message:'';return Response.json({error:message&&!/postgres|prisma|database|connection|token|secret|connect|query|socket|timeout|fetch|syntaxerror|json/i.test(message)?message:'No fue posible completar la carga. Reintenta con los mismos archivos.'},{status:400,headers:{'Cache-Control':'no-store'}});}
