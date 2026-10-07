import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireUser } from '@/lib/server/session';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, {params}: {params: Promise<{asset:string}>}) {
 await requireUser();
 const {asset}=await params;
 if(asset!=='reporte.pptx'&&!/^slide-[1-6]\.png$/.test(asset))return new Response('Archivo no disponible.',{status:404});
 try {
  const data=await readFile(path.join(process.env.REPORT_EXAMPLE_DIR||path.join(process.cwd(),'.private/reports/s40-2026'),asset));
  return new Response(data,{headers:{'Content-Type':asset.endsWith('.png')?'image/png':'application/vnd.openxmlformats-officedocument.presentationml.presentation','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(asset==='reporte.pptx'?{'Content-Disposition':'attachment; filename="Credencializacion_Semana40_2026_Ejemplo.pptx"'}:{})}});
 } catch {return new Response('El ejemplo aún no está disponible en este entorno.',{status:404,headers:{'Cache-Control':'private, no-store'}});}
}
