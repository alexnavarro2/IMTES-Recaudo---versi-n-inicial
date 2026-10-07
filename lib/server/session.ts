import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { allowedEmail, authConfigured } from '@/lib/auth/security';
export async function requireUser() {
  if (!authConfigured()) redirect('/acceso');
  const session = await auth();
  if (!session?.user?.id || !allowedEmail(session.user.email)) redirect('/acceso');
  return session.user;
}
