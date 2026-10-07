import { PageHeading } from '@/components/ui/page-heading';
import { ReportWorkspace } from '@/components/reports/report-workspace';
import {requireUser} from '@/lib/server/session';
import {reportList} from '@/lib/server/reports';
import type {ReportTotals} from '@/lib/server/reports';
import {lastClosedWeek} from '@/lib/iso-week';
export const metadata = { title: 'Reportes' };
export default async function ReportsPage() { const user=await requireUser();const rows=await reportList(user.id);const reports=rows.map(r=>({id:r.id,period:{year:r.year,week:r.week},summary:(r.summary as {totals?:ReportTotals}).totals,week:`${r.year} · S${r.week}`,cutoffDate:r.cutoff.split('-').reverse().join('/'),status:'Generado',createdAt:new Intl.DateTimeFormat('es-MX',{timeZone:'America/Hermosillo',dateStyle:'short',timeStyle:'short'}).format(r.createdAt),pdfUrl: (r.summary as {model?:unknown}).model?`/api/reportes/${r.id}/pdf`:undefined, pptxUrl:`/api/reportes/${r.id}/pptx`}));return <><PageHeading eyebrow="REPORTE SEMANAL" title="Reportes semanales" description="Genera y consulta los reportes de credencialización y recaudo electrónico."/><ReportWorkspace cutoff={lastClosedWeek()} reports={reports}/></>; }
