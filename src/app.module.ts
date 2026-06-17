import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  databaseConfig,
  redisConfig,
  supabaseConfig,
  swaggerConfig,
} from './config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { DatabaseModule } from './database/database.module';
import { AgentsModule } from './features/agents/agents.module';
import { AuthModule } from './features/auth/auth.module';
import { BettingModule } from './features/betting/betting.module';
import { CreditRequestsModule } from './features/credit-requests/credit-requests.module';
import { MessagingModule } from './features/messaging/messaging.module';
import { OperatorsModule } from './features/operators/operators.module';
import { RealtimeModule } from './features/realtime/realtime.module';
import { ReportsModule } from './features/reports/reports.module';
import { TransactionsModule } from './features/transactions/transactions.module';
import { WalletModule } from './features/wallet/wallet.module';
import { SupabaseModule } from './infrastructure/supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [supabaseConfig, databaseConfig, redisConfig, swaggerConfig],
      validationSchema: Joi.object({
        SUPABASE_URL: Joi.string().uri().required(),
        SUPABASE_ANON_KEY: Joi.string().optional(),
        SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
        // Optional: only used as an HS256 fallback; asymmetric projects verify via JWKS.
        SUPABASE_JWT_SECRET: Joi.string().optional().allow(''),
        DATABASE_URL: Joi.string().required(),
        DIRECT_URL: Joi.string().required(),
        // Optional: enables the Socket.IO Redis adapter for multi-instance fan-out.
        REDIS_URL: Joi.string().uri().optional(),
        CORS_ORIGINS: Joi.string().optional(),
        // Optional: API docs. SWAGGER_ENABLED='false' disables the UI (e.g. prod).
        SWAGGER_ENABLED: Joi.string().valid('true', 'false').optional(),
        SWAGGER_PATH: Joi.string().optional(),
      }),
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    SupabaseModule,
    AuthModule,
    OperatorsModule,
    AgentsModule,
    TransactionsModule,
    WalletModule,
    CreditRequestsModule,
    BettingModule,
    ReportsModule,
    MessagingModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
