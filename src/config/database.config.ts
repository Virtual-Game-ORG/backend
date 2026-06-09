import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL!,
  directUrl: process.env.DATABASE_DIRECT_URL!,
}));
