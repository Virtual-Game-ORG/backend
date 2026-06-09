import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { SecretOrKeyProvider } from 'passport-jwt';

/**
 * Shared passport-jwt key resolver for the Supabase strategies.
 *
 * Supabase projects sign access tokens with asymmetric keys (ES256/RS256) served
 * from a JWKS endpoint; older projects use a symmetric HS256 shared secret. We
 * pick the verification key per-token from the JWT header `alg`, so both work.
 */
export function supabaseSecretOrKeyProvider(
  config: ConfigService,
): SecretOrKeyProvider {
  const jwksUri = config.getOrThrow<string>('supabase.jwksUri');
  const hsSecret = config.get<string>('supabase.jwtSecret');
  const jwks = passportJwtSecret({
    jwksUri,
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
  });

  return (request, rawJwtToken, done) => {
    try {
      const segment = String(rawJwtToken).split('.')[0];
      const header = JSON.parse(
        Buffer.from(segment, 'base64url').toString('utf8'),
      ) as { alg?: string };

      if (header.alg === 'HS256') {
        if (!hsSecret) {
          done(
            new Error('HS256 token received but SUPABASE_JWT_SECRET is unset'),
          );
          return;
        }
        done(null, hsSecret);
        return;
      }
      // Asymmetric (ES256/RS256): resolve the public key by `kid` from JWKS.
      jwks(request, rawJwtToken, done);
    } catch (err) {
      done(err as Error);
    }
  };
}
