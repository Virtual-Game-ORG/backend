# Supabase

Covers Auth and PostgreSQL — both are served by the same Supabase project.
Use the **supabase** MCP or `use context7 supabase` for current API reference.

---

## Secrets and where to find them

| Env var | Location in dashboard | Exposure |
|---|---|---|
| `SUPABASE_URL` | Settings → API → Project URL | frontend-safe |
| `SUPABASE_ANON_KEY` | Settings → API → anon public | frontend-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role | backend only |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT Settings → JWT Secret | backend only |
| `SUPABASE_ACCESS_TOKEN` | Account → Access Tokens | dev machine only (MCP) |
| `DATABASE_URL` | Settings → Database → Connection string → Transaction pooler | backend only |
| `DATABASE_DIRECT_URL` | Settings → Database → Connection string → Direct connection | backend only |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are forwarded to frontend apps.
All others stay in the backend container only.

---

## PostgreSQL connection strings

Supabase provides a Supavisor connection pooler and a direct connection.
Both are needed.

```
# Transaction-mode pooler — use for all Prisma runtime queries
# Port 6543, append ?pgbouncer=true
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct connection — used by Prisma Migrate only (needs a persistent connection)
DATABASE_DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```

Find both strings at:
**Dashboard → Project Settings → Database → Connection string**
(toggle between "Transaction" and "Direct" tabs)

The project reference and region are embedded in both strings.
Do not swap the two URLs — using the direct URL for runtime queries
will exhaust Supabase's direct connection limit under load.

---

## JWT auth flow

```
Frontend (any app)
  │  supabase.auth.signInWithPassword({ email, password })
  ▼
Supabase Auth
  │  returns { access_token, refresh_token }
  │  access_token is HS256 JWT signed with SUPABASE_JWT_SECRET
  ▼
Frontend → NestJS   Authorization: Bearer <access_token>
  ▼
SupabaseJwtStrategy
  │  validates with SUPABASE_JWT_SECRET
  │  reads payload.sub, payload.email, payload.platform_role, payload.platform_id
  ▼
JwtAuthGuard → req.user: AuthUser
```

NestJS never issues, refreshes, or revokes tokens. All session management
is handled by the Supabase JS SDK on the frontend.

---

## JWT payload

```typescript
// src/features/auth/auth.types.ts
export interface SupabaseJwtPayload {
  sub:            string;       // Supabase user UUID
  email:          string;
  role:           'authenticated';
  iss:            string;
  iat:            number;
  exp:            number;
  // Injected by the custom access token hook after provisioning:
  platform_role?: 'PLAYER' | 'AGENT' | 'OPERATOR';
  platform_id?:   string;       // local domain record UUID
  app_metadata:   Record<string, unknown>;
  user_metadata:  Record<string, unknown>;
}

export interface AuthUser {
  supabaseId: string;
  email:      string;
  role:       'PLAYER' | 'AGENT' | 'OPERATOR';
  id:         string;           // local Player / Agent / Operator UUID
}
```

Never use `user_metadata` for access-control decisions — it is user-editable.
`app_metadata` is only writable via the service role key.

---

## Custom access token hook

Adds `platform_role` and `platform_id` as top-level JWT claims so NestJS
does not need a DB lookup on every request.

Run once in **Dashboard → SQL Editor**:

```sql
CREATE OR REPLACE FUNCTION auth.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims        jsonb := event -> 'claims';
  platform_role text  := event -> 'user' -> 'app_metadata' ->> 'platform_role';
  platform_id   text  := event -> 'user' -> 'app_metadata' ->> 'platform_id';
BEGIN
  IF platform_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{platform_role}', to_jsonb(platform_role));
  END IF;
  IF platform_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{platform_id}', to_jsonb(platform_id));
  END IF;
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION auth.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION auth.custom_access_token_hook FROM authenticated, anon, public;
```

Then register it at:
**Dashboard → Authentication → Hooks → Custom Access Token Hook**
→ select the `auth.custom_access_token_hook` function.

---

## NestJS JWT strategy

```typescript
// src/features/auth/strategies/supabase-jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, SupabaseJwtPayload } from '../auth.types';

@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(Strategy, 'supabase-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest:  ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:     config.getOrThrow<string>('supabase.jwtSecret'),
      algorithms:      ['HS256'],
      ignoreExpiration: false,
    });
  }

  validate(payload: SupabaseJwtPayload): AuthUser {
    if (!payload.platform_role || !payload.platform_id) {
      throw new UnauthorizedException('USER_NOT_PROVISIONED');
    }
    return {
      supabaseId: payload.sub,
      email:      payload.email,
      role:       payload.platform_role,
      id:         payload.platform_id,
    };
  }
}
```

---

## Supabase admin service

```typescript
// src/infrastructure/supabase/supabase.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  readonly admin: SupabaseClient;

  constructor(config: ConfigService) {
    this.admin = createClient(
      config.getOrThrow('supabase.url'),
      config.getOrThrow('supabase.serviceRoleKey'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
}
```

```typescript
// src/infrastructure/supabase/supabase.module.ts
import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

@Global()
@Module({ providers: [SupabaseService], exports: [SupabaseService] })
export class SupabaseModule {}
```

---

## Creating users (backend-initiated — Agents and Operators)

```typescript
// Preferred for Agents: sends a magic-link invite email
const { data, error } = await this.supabase.admin.auth.admin.inviteUserByEmail(
  email,
  {
    data:       { intended_role: 'AGENT' },
    redirectTo: `${process.env.AGENT_APP_URL}/auth/accept-invite`,
  },
);
if (error) throw new InternalServerErrorException(error.message);

// After creating the local Agent record, set custom claims:
await this.supabase.admin.auth.admin.updateUserById(data.user.id, {
  app_metadata: { platform_role: 'AGENT', platform_id: agent.id },
});
```

```typescript
// For Operators (seeding / no invite email needed):
const { data, error } = await this.supabase.admin.auth.admin.createUser({
  email,
  password:      temporaryPassword,
  email_confirm: true,
  app_metadata:  { intended_role: 'OPERATOR' },
});
```

---

## Provisioning players (self-register)

Players register via the Supabase JS SDK in the Player app.
After OTP verification, the app calls `POST /auth/provision`.
This is idempotent — safe to call more than once.

```typescript
// src/features/auth/auth.service.ts (relevant method only)
async provision(supabaseId: string, dto: ProvisionDto): Promise<Player> {
  const existing = await this.prisma.player.findUnique({
    where: { supabaseUserId: supabaseId },
  });
  if (existing) return existing;

  const player = await this.prisma.$transaction(async (tx) => {
    const p = await tx.player.create({
      data: { supabaseUserId: supabaseId, agentId: dto.agentId, status: 'ACTIVE' },
    });
    const wallet = await tx.wallet.create({ data: { currency: 'ETB' } });
    await tx.playerWallet.create({ data: { playerId: p.id, walletId: wallet.id } });
    return p;
  });

  await this.supabase.admin.auth.admin.updateUserById(supabaseId, {
    app_metadata: { platform_role: 'PLAYER', platform_id: player.id },
  });

  return player;
}
```

---

## Email / OTP (SMTP)

Supabase sends OTP and invite emails. Configure a custom SMTP provider for production.

**Dashboard → Project Settings → Authentication → SMTP Settings**

Recommended: Resend (free tier covers OTP volume at Tier 1 and Tier 2).

```
Host:     smtp.resend.com
Port:     465
Username: resend
Password: <Resend API key>
Sender:   noreply@<your-domain>
```

Customise email templates at:
**Dashboard → Authentication → Email Templates**

---

## RLS

Row Level Security is **disabled on all application tables**.
Access control is enforced in NestJS via guards and service-layer checks.

RLS remains active on Supabase-internal tables (`auth.*`). Do not modify
those policies.

To confirm RLS status on an application table, run via the Supabase MCP:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'player_core';
```
