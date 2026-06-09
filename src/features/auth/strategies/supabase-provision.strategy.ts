import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ProvisionIdentity, SupabaseJwtPayload } from '../auth.types';
import { supabaseSecretOrKeyProvider } from './supabase-jwt-options';

/**
 * Verifies a Supabase JWT signature locally (HS256, SUPABASE_JWT_SECRET) without
 * requiring the platform claims. A freshly-registered player has a validly-signed
 * token but no `platform_role`/`platform_id` yet, so the normal `supabase-jwt`
 * strategy would reject it with USER_NOT_PROVISIONED. This strategy guards the
 * @Public provision route and yields a trusted `supabaseId` (the JWT `sub`).
 */
@Injectable()
export class SupabaseProvisionStrategy extends PassportStrategy(
  Strategy,
  'supabase-provision',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['ES256', 'RS256', 'HS256'],
      secretOrKeyProvider: supabaseSecretOrKeyProvider(config),
    });
  }

  validate(payload: SupabaseJwtPayload): ProvisionIdentity {
    if (!payload.sub) {
      throw new UnauthorizedException('INVALID_TOKEN');
    }
    return { supabaseId: payload.sub };
  }
}
