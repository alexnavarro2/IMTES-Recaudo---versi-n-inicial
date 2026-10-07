import {processUploads} from '@/lib/server/upload-staging';
import {uploadUser,boundedBody,uploadFailure} from '@/lib/server/upload-http';
import {revalidatePath} from 'next/cache';
export const runtime='nodejs';export const maxDuration=300;
export async function POST(request:Request){const user=await uploadUser(request);if(user instanceof Response)return user;try{const value=JSON.parse((await boundedBody(request,2000)).toString('utf-8'));const result=await processUploads(user,value.source,Number(value.year),Number(value.week),value.ids);revalidatePath('/dashboard');revalidatePath('/actualizar');return Response.json({result},{headers:{'Cache-Control':'no-store'}});}catch(error){return uploadFailure(error);}}
