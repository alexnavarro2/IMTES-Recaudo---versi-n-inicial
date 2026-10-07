import {putChunk} from '@/lib/server/upload-staging';
import {uploadUser,boundedBody,uploadFailure} from '@/lib/server/upload-http';
import {CHUNK_BYTES} from '@/lib/upload-limits';
export const runtime='nodejs';
export async function PUT(request:Request,context:{params:Promise<{id:string;part:string}>}){const user=await uploadUser(request);if(user instanceof Response)return user;try{const {id,part}=await context.params;await putChunk(user,id,Number(part),await boundedBody(request,CHUNK_BYTES));return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch(error){return uploadFailure(error);}}
