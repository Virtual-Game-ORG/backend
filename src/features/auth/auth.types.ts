export interface SupabaseJwtPayload {
  sub: string; // Supabase user UUID
  email: string;
  role: 'authenticated';
  iss: string;
  iat: number;
  exp: number;
  // Injected by the custom access token hook after provisioning:
  platform_role?: 'PLAYER' | 'AGENT' | 'OPERATOR';
  platform_id?: string; // local domain record UUID
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
}

export interface AuthUser {
  supabaseId: string;
  email: string;
  role: 'PLAYER' | 'AGENT' | 'OPERATOR';
  id: string; // local Player / Agent / Operator UUID
}

// Attached to req.user on the @Public provision route, where the caller has a
// validly-signed Supabase JWT but is not yet provisioned (no platform claims).
export interface ProvisionIdentity {
  supabaseId: string;
}
