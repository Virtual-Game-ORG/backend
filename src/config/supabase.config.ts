import { registerAs } from '@nestjs/config';

export const supabaseConfig = registerAs('supabase', () => ({
  url: process.env.SUPABASE_URL!,
  anonKey: process.env.SUPABASE_ANON_KEY!,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  // Legacy HS256 shared secret — only used as a fallback for projects that still
  // sign access tokens symmetrically. Newer projects use asymmetric keys (JWKS).
  jwtSecret: process.env.SUPABASE_JWT_SECRET,
  // JWKS endpoint for the project's asymmetric signing keys (ES256/RS256).
  jwksUri: `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
}));
