import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export function allowedEmail(email: string | null | undefined, allowlist = process.env.AUTH_ALLOWED_EMAILS || '') {
  return !!email && allowlist.split(',').map(value => value.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}
function key() {
  const value = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (value.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY debe contener 32 bytes en base64.');
  return value;
}
export function encryptToken(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), encrypted.toString('base64'), cipher.getAuthTag().toString('base64')].join('.');
}
export function decryptToken(value: string) {
  const [version, iv, encrypted, tag] = value.split('.');
  if (version !== 'v1' || !iv || !encrypted || !tag) throw new Error('Token cifrado inválido.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
}
export function authConfigured() {
  return ['AUTH_SECRET','AUTH_GOOGLE_ID','AUTH_GOOGLE_SECRET','DATABASE_URL','TOKEN_ENCRYPTION_KEY','AUTH_ALLOWED_EMAILS'].every(name => !!process.env[name]?.trim()) && Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'base64').length === 32;
}
