import {beginUpload,cancelUploads} from '@/lib/server/upload-staging';
import {uploadUser,boundedBody,uploadFailure} from '@/lib/server/upload-http';
export const runtime='nodejs';
export async function POST(request:Request){const user=await uploadUser(request);if(user instanceof Response)return user;try{const value=JSON.parse((await boundedBody(request,2000)).toString('utf-8'));return Response.json(await beginUpload(user,value),{headers:{'Cache-Control':'no-store'}});}catch(error){return uploadFailure(error);}}

export async function DELETE(request:Request){const user=await uploadUser(request);if(user instanceof Response)return user;try{const value=JSON.parse((await boundedBody(request,1000)).toString("utf-8"));await cancelUploads(user,value.ids);return Response.json({ok:true});}catch(error){return uploadFailure(error);}}
