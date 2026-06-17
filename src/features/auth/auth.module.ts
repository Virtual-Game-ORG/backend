import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { DatabaseModule } from '../../database/database.module';
import { SupabaseModule } from '../../infrastructure/supabase/supabase.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SocketAuthService } from './socket-auth.service';
import { SupabaseJwtStrategy } from './strategies/supabase-jwt.strategy';
import { SupabaseProvisionStrategy } from './strategies/supabase-provision.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'supabase-jwt' }),
    SupabaseModule,
    DatabaseModule,
  ],
  controllers: [AuthController],
  providers: [
    SupabaseJwtStrategy,
    SupabaseProvisionStrategy,
    AuthService,
    SocketAuthService,
  ],
  exports: [SocketAuthService],
})
export class AuthModule {}
