# NestJS

Use `use context7 nestjs` for current NestJS 11 decorator and module API.

---

## Module anatomy

```typescript
// features/example/example.module.ts
import { Module } from '@nestjs/common';
import { ExampleController } from './example.controller';
import { ExampleService }    from './example.service';

@Module({
  imports:     [],                  // other modules whose exports this needs
  controllers: [ExampleController],
  providers:   [ExampleService],
  exports:     [ExampleService],    // only if another module injects this service
})
export class ExampleModule {}
```

`AppModule` imports every feature module. Feature modules do not import
each other except through explicit `exports` + `imports` pairs.

---

## Controller pattern

```typescript
// features/example/example.controller.ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard }   from '../../common/guards/jwt-auth.guard';
import { RolesGuard }     from '../../common/guards/roles.guard';
import { Roles }          from '../../common/decorators/roles.decorator';
import { CurrentUser }    from '../../common/decorators/current-user.decorator';
import { AuthUser }       from '../auth/auth.types';
import { ExampleService } from './example.service';
import { CreateExampleDto } from './dto/create-example.dto';

@Controller('examples')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExampleController {
  constructor(private readonly svc: ExampleService) {}

  @Post()
  @Roles('AGENT')
  create(@Body() dto: CreateExampleDto, @CurrentUser() user: AuthUser) {
    return this.svc.create(dto, user.id);
  }

  @Get(':id')
  @Roles('AGENT', 'OPERATOR')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.findOne(id, user);
  }
}
```

Rules:
- One service call per route handler. No logic in controllers.
- No Prisma in controllers.
- No `try/catch` in controllers — let exceptions bubble to filters.
- `@HttpCode()` only when overriding defaults (201 POST, 200 GET/PATCH/DELETE).

---

## Guards

```typescript
// src/common/guards/jwt-auth.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector }  from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('supabase-jwt') {
  constructor(private reflector: Reflector) { super(); }

  canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    return isPublic ? true : super.canActivate(ctx);
  }
}
```

```typescript
// src/common/guards/roles.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return required.includes(user?.role);
  }
}
```

---

## Decorators

```typescript
// current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);

// roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY  = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// public.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

---

## Config

```typescript
// src/config/supabase.config.ts
import { registerAs } from '@nestjs/config';

export const supabaseConfig = registerAs('supabase', () => ({
  url:            process.env.SUPABASE_URL!,
  anonKey:        process.env.SUPABASE_ANON_KEY!,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  jwtSecret:      process.env.SUPABASE_JWT_SECRET!,
}));
```

```typescript
// src/config/database.config.ts
import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url:       process.env.DATABASE_URL!,
  directUrl: process.env.DATABASE_DIRECT_URL!,
}));
```

```typescript
// src/config/redis.config.ts
import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL!,   // full Redis Cloud URL including credentials
}));
```

```typescript
// src/config/app.config.ts
import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port:        parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv:     process.env.NODE_ENV ?? 'development',
  playerUrl:   process.env.PLAYER_APP_URL!,
  agentUrl:    process.env.AGENT_APP_URL!,
  operatorUrl: process.env.OPERATOR_APP_URL!,
}));
```

Validate all vars at startup in `AppModule`:

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  load:     [appConfig, supabaseConfig, databaseConfig, redisConfig],
  validationSchema: Joi.object({
    NODE_ENV:                    Joi.string().valid('development', 'production', 'test').required(),
    PORT:                        Joi.number().default(3000),
    SUPABASE_URL:                Joi.string().uri().required(),
    SUPABASE_ANON_KEY:           Joi.string().required(),
    SUPABASE_SERVICE_ROLE_KEY:   Joi.string().required(),
    SUPABASE_JWT_SECRET:         Joi.string().required(),
    DATABASE_URL:                Joi.string().required(),
    DATABASE_DIRECT_URL:         Joi.string().required(),
    REDIS_URL:                   Joi.string().required(),
    PLAYER_APP_URL:              Joi.string().uri().required(),
    AGENT_APP_URL:               Joi.string().uri().required(),
    OPERATOR_APP_URL:            Joi.string().uri().required(),
  }),
}),
```

---

## Redis service (Redis Cloud — URL only)

```typescript
// src/infrastructure/redis/redis.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('redis.url'), {
      lazyConnect:         true,
      maxRetriesPerRequest: 3,
      enableReadyCheck:    true,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
  }

  async onModuleInit()    { await this.client.connect(); }
  async onModuleDestroy() { await this.client.quit(); }
}
```

```typescript
// src/infrastructure/redis/redis.module.ts
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
```

ioredis infers TLS from `rediss://` scheme automatically.
No additional TLS configuration is needed for Redis Cloud.

---

## DTO conventions

```typescript
import { IsEnum, IsNotEmpty, IsNumberString, IsOptional, IsUUID } from 'class-validator';

export class CreateExampleDto {
  @IsUUID()
  relatedId: string;

  @IsNumberString()         // string in — parsed to Decimal in service
  @IsNotEmpty()
  amount: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
```

Enable globally in `main.ts`:

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist:            true,
  forbidNonWhitelisted: true,
  transform:            true,
  transformOptions:     { enableImplicitConversion: true },
}));
```

---

## Response shape

All HTTP responses wrapped by `ResponseInterceptor`:

```
// Success
{ "data": <payload>, "meta": { "timestamp": "...", "requestId": "..." } }

// Error (from filters)
{ "error": { "code": "P2025", "message": "Record not found.", "statusCode": 404 } }
```

Exception: `/v1/game/*` routes return flat provider responses — exclude from interceptor.

---

## Bootstrap

```typescript
// src/main.ts
import { NestFactory }        from '@nestjs/core';
import { ValidationPipe }     from '@nestjs/common';
import { AppModule }          from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { HttpExceptionFilter }   from './common/filters/http-exception.filter';
import { ResponseInterceptor }   from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, transform: true, forbidNonWhitelisted: true,
  }));

  app.useGlobalFilters(
    new PrismaExceptionFilter(),
    new HttpExceptionFilter(),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());

  app.enableCors({
    origin: [
      process.env.PLAYER_APP_URL!,
      process.env.AGENT_APP_URL!,
      process.env.OPERATOR_APP_URL!,
    ],
    credentials: true,
  });

  // All routes under /api/v1 except provider-facing game endpoints
  app.setGlobalPrefix('api/v1', { exclude: ['v1/game/(.*)'] });

  // App Runner health check target
  app.use('/health', (_req, res) => res.json({ status: 'ok' }));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```
