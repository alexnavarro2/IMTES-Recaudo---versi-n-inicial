export const dynamic = 'force-dynamic';
import { AppShell } from '@/components/layout/app-shell';
import { requireUser } from '@/lib/server/session';
export default async function PlatformLayout({ children }: { children: React.ReactNode }) { const user = await requireUser(); return <AppShell user={{ name: user.name || 'Usuario IMTES', email: user.email || '' }}>{children}</AppShell>; }
