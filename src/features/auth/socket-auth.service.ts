import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { AuthUser, SupabaseJwtPayload } from './auth.types';

/**
 * Verifies a raw Supabase JWT outside the HTTP/passport flow (for the Socket.IO
 * handshake). Mirrors `supabaseSecretOrKeyProvider` + `SupabaseJwtStrategy`:
 * HS256 tokens verify against the shared secret, asymmetric tokens (ES256/RS256)
 * resolve their public key by `kid` from the project's JWKS endpoint.
 */
@Injectable()
export class SocketAuthService {
  private readonly jwks: JwksClient;
  private readonly hsSecret?: string;

  constructor(config: ConfigService) {
    this.jwks = new JwksClient({
      jwksUri: config.getOrThrow<string>('supabase.jwksUri'),
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
    });
    this.hsSecret = config.get<string>('supabase.jwtSecret');
  }

  async verify(token: string): Promise<AuthUser> {
    if (!token) throw new UnauthorizedException('MISSING_TOKEN');
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new UnauthorizedException('INVALID_TOKEN');
    }
    const alg = decoded.header.alg;

    let payload: SupabaseJwtPayload;
    try {
      if (alg === 'HS256') {
        if (!this.hsSecret) {
          throw new UnauthorizedException(
            'HS256 token but SUPABASE_JWT_SECRET unset',
          );
        }
        payload = jwt.verify(token, this.hsSecret) as SupabaseJwtPayload;
      } else {
        const key = await this.jwks.getSigningKey(decoded.header.kid);
        payload = jwt.verify(token, key.getPublicKey(), {
          algorithms: ['ES256', 'RS256'],
        }) as SupabaseJwtPayload;
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('INVALID_TOKEN');
    }

    return this.mapPayload(payload);
  }

  /** Pure payload → AuthUser mapping, mirroring SupabaseJwtStrategy.validate. */
  mapPayload(payload: SupabaseJwtPayload): AuthUser {
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
