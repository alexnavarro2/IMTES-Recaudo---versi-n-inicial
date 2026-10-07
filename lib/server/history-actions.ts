'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from './session';
import { importHistorySource } from './history';
import type { HistorySource } from '@/lib/history-model';
export async function importSource(source:HistorySource):Promise<{message:string;error?:boolean}>{const user=await requireUser();try{const result=await importHistorySource(user.id,source);revalidatePath('/dashboard');revalidatePath('/actualizar');return {message:`${source}: ${result.weeks} semanas importadas${result.warnings.length?` · ${result.warnings.length} archivos requieren revisión`:''}.`};}catch(error){const message=error instanceof Error&&!('status'in error)&&/consolidado|carpeta|seman|archivo|CAUS|Fuente|datos|montos|numérico|Consolidado|periodo|Conteo|acumulado/i.test(error.message)?error.message:'No fue posible importar esta fuente. Revisa la conexión y los permisos de Drive.';return {message,error:true};}}
