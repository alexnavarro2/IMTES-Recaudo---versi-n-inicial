import 'server-only';
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter, AdapterAccount } from 'next-auth/adapters';
import { db } from '@/lib/server/db';
import { allowedEmail, authConfigured, encryptToken, decryptToken } from '@/lib/auth/security';

function encryptedAccount(account: AdapterAccount) {
  const result = { ...account };
  for (const field of ['access_token', 'refresh_token', 'id_token'] as const) if (result[field]) result[field] = encryptToken(result[field]!);
  return result;
}
function adapter(): Adapter {
  const base = PrismaAdapter(db());
  return { ...base,
    async linkAccount(account) { await db().account.create({ data: encryptedAccount(account) }); return account; },
    async getAccount(providerAccountId, provider) {
      const account = await base.getAccount!(providerAccountId, provider);
      if (!account) return null;
      return { ...account, access_token: account.access_token ? decryptToken(account.access_token) : undefined, refresh_token: account.refresh_token ? decryptToken(account.refresh_token) : undefined, id_token: account.id_token ? decryptToken(account.id_token) : undefined };
    },
  };
}
export const { auth, handlers, signIn, signOut } = NextAuth(() => ({
  adapter: authConfigured() ? adapter() : undefined,
  secret: process.env.AUTH_SECRET,
  logger: { error() { console.error('IMTES: no fue posible completar la autenticación.'); }, warn() { console.warn('IMTES: revisa la configuración de autenticación.'); }, debug() {} },
  session: { strategy: 'database', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/acceso', error: '/acceso' },
  providers: [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET,
    authorization: { params: { scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file', access_type: 'offline', include_granted_scopes: 'true' } } })],
  callbacks: {
    async signIn({ account, profile }) {
      if (!authConfigured() || profile?.email_verified !== true || !allowedEmail(profile.email)) return false;
      if (account?.provider !== 'google' || !account.scope?.split(' ').includes('https://www.googleapis.com/auth/drive.readonly')) return false;
      const session = await auth();
      if (session?.user?.id) {
        if (!allowedEmail(session.user.email)) return false;
        const existing = await db().account.findFirst({ where: { userId: session.user.id, provider: 'google', providerAccountId: account.providerAccountId } });
        return !!existing;
      }
      return true;
    },
    async session({ session, user }) {
      session.user.id = user.id;
      // The session DTO contains identity only. OAuth credentials never reach the browser.
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google' || !user.id) return;
      const data = { access_token: account.access_token ? encryptToken(account.access_token) : undefined,
        refresh_token: account.refresh_token ? encryptToken(account.refresh_token) : undefined,
        id_token: account.id_token ? encryptToken(account.id_token) : undefined, expires_at: account.expires_at, scope: account.scope };
      await db().account.updateMany({ where: { userId: user.id, provider: 'google', providerAccountId: account.providerAccountId }, data });
      await db().driveConnection.upsert({ where: { userId: user.id }, create: { userId: user.id, email: user.email!, status: 'connected', lastValidatedAt: new Date() }, update: { email: user.email!, status: 'connected', lastValidatedAt: new Date() } });
    },
  },
}));
