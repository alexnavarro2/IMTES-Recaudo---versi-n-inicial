import 'server-only';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const globalDb = globalThis as unknown as { imtesDb?: PrismaClient };
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Base de datos sin configurar.');
  if (!globalDb.imtesDb) globalDb.imtesDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  return globalDb.imtesDb;
}
