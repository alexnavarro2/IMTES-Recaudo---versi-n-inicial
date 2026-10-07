'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Menu, Settings, UserRound, X } from 'lucide-react';
import { logout } from '@/lib/server/auth-actions';
import logo from '@/public/branding/logo-imtes-2026.png';

export function AppHeader({ user, menuOpen, onToggleMenu }: { user: { name: string; email: string }; menuOpen: boolean; onToggleMenu: () => void }) {
  return (
    <header className="app-header">
      <button className="icon-button menu-toggle" type="button" onClick={onToggleMenu} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="app-sidebar">
        {menuOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
      <Link href="/dashboard" className="institutional-logo">
        <Image src={logo} alt="Instituto de Movilidad y Transporte para el Estado de Sonora" sizes="(max-width: 600px) 220px, 340px" preload />
      </Link>
      <div className="header-actions">
        <div className="user-preview"><span className="user-icon"><UserRound size={18} /></span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
        <form action={logout}><button className="button small outline">Salir</button></form><Link href="/configuracion" className="icon-button header-settings" aria-label="Ir a Configuración"><Settings size={20} /></Link>
      </div>
    </header>
  );
}
