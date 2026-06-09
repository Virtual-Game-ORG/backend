import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7: connection URLs live here, not in schema.prisma.
// Migrations run through the Supabase direct (session-mode) connection;
// runtime queries go through the pooler via the driver adapter (see prisma.service.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_DIRECT_URL'),
  },
});
