import {saveReportToDrive} from '@/lib/server/report-drive';
import {uploadUser,uploadFailure} from '@/lib/server/upload-http';
export const runtime='nodejs';export const maxDuration=180;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const user=await uploadUser(request);if(user instanceof Response)return user;try{const {id}=await context.params;return Response.json(await saveReportToDrive(user,id),{headers:{'Cache-Control':'no-store'}});}catch(error){return uploadFailure(error);}}
