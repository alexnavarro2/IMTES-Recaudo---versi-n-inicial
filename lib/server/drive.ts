import 'server-only';
import { db } from './db';
import { encryptToken, decryptToken } from '@/lib/auth/security';
import { DriveError, requestDrive } from '@/lib/drive-protocol';
export { DriveError } from '@/lib/drive-protocol';
export async function accessToken(userId: string) {
  const accounts = await db().account.findMany({ where: { userId, provider: { in: ['google', 'google-drive'] } } });
  // Prefer unified credentials; retain older Drive connections until the next login.
  const account = accounts.find(value => value.provider === 'google' && value.scope?.split(' ').includes('https://www.googleapis.com/auth/drive.readonly')) || accounts.find(value => value.provider === 'google-drive');
  const connection = await db().driveConnection.findUnique({ where: { userId } });
  if (!account?.access_token || !connection || connection.status === 'disconnected') throw new DriveError('disconnected');
  if (account.expires_at && account.expires_at * 1000 > Date.now() + 60_000) return decryptToken(account.access_token);
  if (!account.refresh_token) { await db().driveConnection.updateMany({ where: { userId }, data: { status: 'expired' } }); throw new DriveError('expired'); }
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000), body: new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!, grant_type: 'refresh_token', refresh_token: decryptToken(account.refresh_token) }) });
  if (!response.ok) { const result = await response.json().catch(() => ({})); const status = result.error === 'invalid_grant' ? 'expired' : 'error'; await db().driveConnection.updateMany({ where: { userId }, data: { status } }); throw new DriveError(status); }
  const result = await response.json();
  if (typeof result.access_token !== 'string' || typeof result.expires_in !== 'number') throw new DriveError('error');
  const updated = await db().account.updateMany({ where: { id: account.id }, data: { access_token: encryptToken(result.access_token), expires_at: Math.floor(Date.now()/1000) + result.expires_in, ...(result.refresh_token ? { refresh_token: encryptToken(result.refresh_token) } : {}) } });
  if (!updated.count) throw new DriveError('disconnected');
  return result.access_token as string;
}
export async function driveRequest<T>(userId: string, path: string, parameters: Record<string,string> = {}, resource?: { id: string; key?: string }): Promise<T> {
  const token = await accessToken(userId);
  try { return await requestDrive<T>(token,path,parameters,resource); }
  catch (error) { if (error instanceof DriveError && error.status === 'expired') await db().driveConnection.updateMany({ where: { userId }, data: { status: 'expired' } }); throw error; }
}
export function safeDriveError(error: unknown) { return error instanceof DriveError ? error.status : 'error'; }
