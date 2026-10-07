import Link from 'next/link';
import { ChartNoAxesCombined, ArrowRight } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function EmptyChart({ title, description, showAction = false }: { title: string; description: string; showAction?: boolean }) {
  return <section className="panel chart-panel"><div className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div><StatusBadge>Sin datos</StatusBadge></div><div className="empty-chart"><div className="empty-chart-icon"><ChartNoAxesCombined size={26} strokeWidth={1.5}/></div><strong>No hay información procesada</strong><p>Actualiza una semana para visualizar este indicador.</p>{showAction && <Link href="/actualizar" className="chart-action">Actualizar semana<ArrowRight size={14}/></Link>}</div></section>;
}
