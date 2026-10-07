import type { NextRequest } from 'next/server';
import { handlers } from '@/auth';
import { authConfigured } from '@/lib/auth/security';
export async function GET(request: NextRequest) { return authConfigured() ? handlers.GET(request) : Response.json({ error: 'Autenticación pendiente de configurar.' }, { status: 503 }); }
export async function POST(request: NextRequest) { return authConfigured() ? handlers.POST(request) : Response.json({ error: 'Autenticación pendiente de configurar.' }, { status: 503 }); }
