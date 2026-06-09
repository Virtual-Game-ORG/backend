import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, SupabaseJwtPayload } from '../auth.types';
import { supabaseSecretOrKeyProvider } from './supabase-jwt-options';

@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(
  Strategy,
  'supabase-jwt',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['ES256', 'RS256', 'HS256'],
      secretOrKeyProvider: supabaseSecretOrKeyProvider(config),
    });
  }

  validate(payload: SupabaseJwtPayload): AuthUser {
    if (!payload.platform_role || !payload.platform_id) {
      throw new UnauthorizedException('USER_NOT_PROVISIONED');
    }
    return {
      supabaseId: payload.sub,
      email: payload.email,
      role: payload.platform_role,
      id: payload.platform_id,
    };
  }
}
