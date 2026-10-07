'use server';
import { signIn, signOut } from '@/auth';
import { authConfigured } from '@/lib/auth/security';
import { requireUser } from './session';
export async function login() { if (!authConfigured()) throw new Error('Configuración pendiente.'); await signIn('google', { redirectTo: '/dashboard' }, { prompt: 'consent' }); }
export async function logout() { await signOut({ redirectTo: '/acceso' }); }
export async function connectDrive() { await requireUser(); await signIn('google', { redirectTo: '/configuracion' }, { prompt: 'consent' }); }
