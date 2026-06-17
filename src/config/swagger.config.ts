import { registerAs } from '@nestjs/config';

export const swaggerConfig = registerAs('swagger', () => ({
  // Default ON; set SWAGGER_ENABLED='false' to disable in production.
  enabled: process.env.SWAGGER_ENABLED !== 'false',
  // Mount path for the Swagger UI (JSON served at `${path}-json`).
  path: process.env.SWAGGER_PATH ?? 'docs',
  title: 'core-api',
  description:
    'Betting platform API — auth, agents, transactions, betting, credit requests, wallet, messaging, and operator reports.',
  version: process.env.npm_package_version ?? '0.0.1',
}));
