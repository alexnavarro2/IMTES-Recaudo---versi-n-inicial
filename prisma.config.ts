import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });
export default defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' }, datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || '' } });
