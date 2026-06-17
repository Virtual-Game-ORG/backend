import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  // Optional: when set, Socket.IO uses the Redis adapter for cross-instance
  // fan-out. Unset → single-instance in-memory adapter.
  url: process.env.REDIS_URL,
  // CORS allow-list for the Socket.IO server (comma-separated). Defaults to '*'.
  corsOrigins: process.env.CORS_ORIGINS,
}));
