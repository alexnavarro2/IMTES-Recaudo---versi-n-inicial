import 'server-only';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {db} from './db';
import {historyData} from './history';
import {getGoalSettings} from './goals';
import {reportModel,type ReportModel} from '@/lib/reports/model';
import {buildWeeklyPptx,PPTX_RENDERER_VERSION} from '@/lib/reports/pptx';
import type {IsoWeek} from '@/lib/iso-week';
export async function generateWeeklyReport(userId:string,period:IsoWeek){
 const [datasets,settings]=await Promise.all([historyData(userId),getGoalSettings(userId)]),model=reportModel(datasets,period,new Date(),settings.goals);const template=await readFile(path.join(process.cwd(),'lib/reports/template.pptx'));
 const fingerprint=createHash('sha256').update(template).update(PPTX_RENDERER_VERSION).update(JSON.stringify({period:model.period,totals:model.totals,charts:model.charts,goals:model.goals})).digest('hex');
 const existing=await db().weeklyReport.findUnique({where:{userId_year_week_fingerprint:{userId,...period,fingerprint}},select:{id:true}});if(existing)return {id:existing.id,summary:model.totals,duplicate:true};
 const pptx=await buildWeeklyPptx(template,model);const data={userId,...period,cutoff:model.cutoff,fingerprint,summary:JSON.parse(JSON.stringify({totals:model.totals,sources:model.sources,goals:model.goals,model})),pptx:new Uint8Array(pptx)};
 const report=await db().weeklyReport.upsert({where:{userId_year_week_fingerprint:{userId,...period,fingerprint}},create:data,update:{},select:{id:true}});return {id:report.id,summary:model.totals,duplicate:false};
}
export async function reportList(userId:string){return db().weeklyReport.findMany({where:{userId},select:{id:true,year:true,week:true,cutoff:true,createdAt:true,summary:true},orderBy:{createdAt:'desc'},take:100});}
export type ReportTotals=ReportModel['totals'];
