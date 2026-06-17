import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';
import type { swaggerConfig } from './config';

type SwaggerSettings = ReturnType<typeof swaggerConfig>;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = app.get(ConfigService);

  // OpenAPI 3.0 docs — Swagger UI at `${path}`, JSON at `${path}-json`.
  // Served as express middleware, so the global JwtAuthGuard does not apply;
  // SWAGGER_ENABLED='false' gates exposure (e.g. in production).
  const swagger = config.get<SwaggerSettings>('swagger');
  if (swagger?.enabled) {
    const docConfig = new DocumentBuilder()
      .setTitle(swagger.title)
      .setDescription(swagger.description)
      .setVersion(swagger.version)
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'supabase-jwt',
      )
      .addTag('auth', 'Provisioning of platform identity claims')
      .addTag('agents', 'Operator-managed agent accounts')
      .addTag('transactions', 'Player deposits/withdrawals and the agent queue')
      .addTag('betting', 'Bet placement and settlement')
      .addTag('credit-requests', 'Agent credit top-up requests')
      .addTag('wallet', 'Player wallet balance')
      .addTag('messaging', 'Transaction-scoped chat')
      .addTag('reports', 'Operator dashboards and audit logs')
      .build();
    const document = SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup(swagger.path, app, document, {
      jsonDocumentUrl: `${swagger.path}-json`,
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Socket.IO: Redis adapter when REDIS_URL is set (cross-instance fan-out),
  // otherwise single-instance in-memory. CORS from CORS_ORIGINS (default '*').
  const redisAdapter = new RedisIoAdapter(
    app,
    config.get<string>('redis.url'),
    config.get<string>('redis.corsOrigins'),
  );
  await redisAdapter.connectToRedis();
  app.useWebSocketAdapter(redisAdapter);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
