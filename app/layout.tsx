import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: { default: 'IMTES Recaudo', template: '%s · IMTES Recaudo' }, description: 'Gestión de credencialización, validaciones e ingreso electrónico de IMTES.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es"><body>{children}</body></html>; }
