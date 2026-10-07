export const dynamic = 'force-dynamic';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import logo from '@/public/branding/logo-imtes-2026.png';
import { auth } from '@/auth';
import { authConfigured, allowedEmail } from '@/lib/auth/security';
import { login } from '@/lib/server/auth-actions';
export const metadata = { title: 'Acceso' };
export default async function AccessPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ready = authConfigured(); const { error } = await searchParams;
  if (ready) { const session = await auth(); if (!error && session?.user && allowedEmail(session.user.email)) redirect('/dashboard'); }
  return <main className="access-page"><section className="panel access-card"><Image src={logo} alt="Instituto de Movilidad y Transporte para el Estado de Sonora" sizes="(max-width: 600px) 90vw, 600px" preload/><span className="eyebrow">PLATAFORMA INSTITUCIONAL</span><h1>IMTES Recaudo 360</h1><p>Sistema de credencialización y recaudo electrónico</p><form action={login}><button className="button primary" disabled={!ready}>Continuar con Google</button></form>{!ready && <p role="status">Configuración pendiente de Google y base de datos. Consulta la guía de Fase 2.</p>}{error && <p role="alert">No se pudo autorizar el acceso. Verifica que tu cuenta esté autorizada y vuelve a intentar.</p>}<p>Con una sola autorización iniciarás sesión y conectarás tus carpetas de Google Drive.</p><small>Acceso exclusivo para cuentas autorizadas por IMTES.</small></section></main>;
}
