import {auth} from '@/auth';
import {allowedEmail} from '@/lib/auth/security';
import {getGoalSettings,saveGoalSettings,GoalConflict} from '@/lib/server/goals';
import {uploadUser,boundedBody} from '@/lib/server/upload-http';
import {validateGoals} from '@/lib/config/goals';
import {revalidatePath} from 'next/cache';
export const runtime='nodejs';
export async function GET(){const session=await auth();if(!session?.user?.id||!allowedEmail(session.user.email))return Response.json({error:'Inicia sesión.'},{status:401});return Response.json(await getGoalSettings(session.user.id),{headers:{'Cache-Control':'private, no-store'}});}
export async function PUT(request:Request){const user=await uploadUser(request);if(user instanceof Response)return user;let value;try{value=JSON.parse((await boundedBody(request,2000)).toString('utf-8'));validateGoals(value?.goals);if(!Number.isSafeInteger(value.version)||value.version<0)throw new Error('Versión inválida.');}catch{return Response.json({error:'Envía las cinco metas como enteros entre 1 y 1,000,000,000.'},{status:400});}try{const saved=await saveGoalSettings(user,value.goals,value.version);revalidatePath('/dashboard');revalidatePath('/configuracion');return Response.json(saved,{headers:{'Cache-Control':'private, no-store'}});}catch(error){if(error instanceof GoalConflict)return Response.json({error:error.message},{status:409});return Response.json({error:'No fue posible guardar las metas. Reintenta.'},{status:500});}}
