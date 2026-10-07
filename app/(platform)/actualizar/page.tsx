import { PageHeading } from '@/components/ui/page-heading';
import { UploadWorkspace } from '@/components/upload/upload-workspace';
import { lastClosedWeek, weekLabel } from '@/lib/iso-week';
export const metadata = { title: 'Actualizar semana' };
export default function UpdatePage() { return <><PageHeading eyebrow="ACTUALIZACIÓN DE INFORMACIÓN" title="Actualizar semana" description="Carga los archivos del periodo para actualizar automáticamente los indicadores."/><p className="notice">Corte histórico esperado: {weekLabel(lastClosedWeek())} · última semana cerrada.</p><UploadWorkspace cutoff={lastClosedWeek()}/></>; }
