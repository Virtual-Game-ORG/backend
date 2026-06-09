import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { databaseConfig, supabaseConfig } from './config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './features/auth/auth.module';
import { SupabaseModule } from './infrastructure/supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [supabaseConfig, databaseConfig],
      validationSchema: Joi.object({
        SUPABASE_URL: Joi.string().uri().required(),
        SUPABASE_ANON_KEY: Joi.string().optional(),
        SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
        // Optional: only used as an HS256 fallback; asymmetric projects verify via JWKS.
        SUPABASE_JWT_SECRET: Joi.string().optional().allow(''),
        DATABASE_URL: Joi.string().required(),
        DATABASE_DIRECT_URL: Joi.string().required(),
      }),
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    DatabaseModule,
    SupabaseModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
