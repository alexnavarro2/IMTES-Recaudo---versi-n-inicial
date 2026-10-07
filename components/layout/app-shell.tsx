'use client';

import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';

export function AppShell({ children, user }: { children: ReactNode; user: { name: string; email: string } }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="app-shell" onKeyDown={event => { if (event.key === 'Escape') setMenuOpen(false); }}>
      <a className="skip-link" href="#contenido">Ir al contenido</a>
      <AppHeader user={user} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(open => !open)} />
      <div className="app-body">
        <AppSidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
        <div className="workspace">
          <main id="contenido" tabIndex={-1}>
            <div className="phase-banner"><Info size={16} /><span><strong>Vista de desarrollo · Actualización semanal.</strong> Datos de las carpetas autorizadas en Drive. Procesamiento de semanas cerradas.</span></div>
            {children}
            <footer className="page-footer"><span>IMTES · Credencialización y Recaudo Electrónico</span><span>Hermosillo, Sonora</span></footer>
          </main>
        </div>
      </div>
    </div>
  );
}
