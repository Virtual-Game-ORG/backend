import { UnauthorizedException } from '@nestjs/common';
import { SupabaseJwtPayload } from './auth.types';

// jwks-rsa pulls in `jose` (ESM) which Jest doesn't transform; mocked since
// these tests exercise the pure mapPayload, not real JWKS verification.
jest.mock('jwks-rsa', () => ({ JwksClient: jest.fn() }));

import { SocketAuthService } from './socket-auth.service';

// Construct without invoking the real constructor (which builds a JwksClient) —
// mapPayload is pure and is the unit under test.
const service = Object.create(SocketAuthService.prototype) as SocketAuthService;

const base: SupabaseJwtPayload = {
  sub: 'sb-1',
  email: 'a@b.c',
  role: 'authenticated',
  iss: 'supabase',
  iat: 0,
  exp: 0,
  app_metadata: {},
  user_metadata: {},
};

describe('SocketAuthService.mapPayload', () => {
  it('maps a provisioned payload to an AuthUser', () => {
    const user = service.mapPayload({
      ...base,
      platform_role: 'AGENT',
      platform_id: 'ag1',
    });
    expect(user).toEqual({
      supabaseId: 'sb-1',
      email: 'a@b.c',
      role: 'AGENT',
      id: 'ag1',
    });
  });

  it('rejects an unprovisioned payload (no platform claims)', () => {
    expect(() => service.mapPayload(base)).toThrow(UnauthorizedException);
  });
});
