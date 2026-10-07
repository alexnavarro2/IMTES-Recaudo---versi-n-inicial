import type { LucideIcon } from 'lucide-react';

export function KpiCard({ title, description, icon: Icon, value = null }: { title: string; description: string; icon: LucideIcon; value?: string | null }) {
  return <article className="kpi-card"><div className="kpi-top"><span>{title}</span><Icon size={19} aria-hidden="true"/></div><div className="kpi-value">{value ?? '—'}</div><p className="kpi-state">{value === null ? 'Sin datos procesados' : description}</p><p className="kpi-description">{description}</p></article>;
}
