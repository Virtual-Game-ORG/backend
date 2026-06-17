import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter that sets CORS and, when a Redis URL is provided, attaches
 * the Redis pub/sub adapter so events fan out across server instances. Without a
 * URL it behaves as the default in-memory adapter (correct for one process).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private readonly corsOrigin: string | string[];

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl?: string,
    corsOrigins?: string,
  ) {
    super(app);
    this.corsOrigin = corsOrigins
      ? corsOrigins.split(',').map((o) => o.trim())
      : '*';
  }

  async connectToRedis(): Promise<void> {
    if (!this.redisUrl) return;
    const pubClient = new Redis(this.redisUrl);
    const subClient = pubClient.duplicate();
    // Fail fast at boot if REDIS_URL is set but the server is unreachable.
    await pubClient.ping();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigin, credentials: true },
    }) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
