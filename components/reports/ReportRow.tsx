import type {IsoWeek} from '@/lib/iso-week';
import type {ReportTotals} from '@/lib/server/reports';
import { StatusBadge } from '@/components/ui/StatusBadge';

export type ReportListItem = { id: string; period?:IsoWeek; summary?:ReportTotals; week: string; cutoffDate: string; status: string; createdAt?: string; pptxUrl?: string; pdfUrl?: string };

export function ReportRow({ report,onPreview,selected,disabled }: { report: ReportListItem;onPreview?:()=>void;selected?:boolean;disabled?:boolean }) {
  return <tr><td>{report.week}{onPreview&&<button type="button" className="table-link report-history-preview" disabled={disabled||!report.pdfUrl} aria-pressed={selected} onClick={onPreview}>Ver reporte</button>}{report.createdAt&&<small style={{display:"block",color:"#777",marginTop:4}}>Generado: {report.createdAt}</small>}</td><td>{report.cutoffDate}</td><td><StatusBadge>{report.status}</StatusBadge></td><td>{report.pptxUrl ? <a className="table-link" href={report.pptxUrl}>Descargar PPTX</a> : '—'}</td><td>{report.pdfUrl ? <a className="table-link" href={report.pdfUrl}>Descargar PDF</a> : '—'}</td></tr>;
}
