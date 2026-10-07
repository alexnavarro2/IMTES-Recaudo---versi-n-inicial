'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Upload, FileText, Settings, ChevronRight } from 'lucide-react';

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/actualizar', label: 'Actualizar semana', icon: Upload },
  { href: '/reportes', label: 'Reportes', icon: FileText },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
];

export function AppSidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <aside id="app-sidebar" className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="workspace-label"><strong>IMTES Recaudo</strong><span>Seguimiento institucional</span></div>
      <p className="nav-label">PLATAFORMA</p>
      <nav aria-label="Navegación principal">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return <Link key={href} href={href} onClick={onNavigate} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><Icon size={19} />{label}{active && <ChevronRight size={15} className="nav-arrow" />}</Link>;
        })}
      </nav>
      <div className="sidebar-bottom"><span className="sidebar-divider"/><p>Transporte público de Hermosillo</p><small>Instituto de Movilidad y Transporte<br/>para el Estado de Sonora</small><span className="development-label"><span/>Histórico y actualización</span></div>
    </aside>
  );
}
