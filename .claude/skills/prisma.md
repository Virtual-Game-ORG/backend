# Prisma

Use `use context7 prisma` to pull the current Prisma 7 API before implementing
anything not covered here — Prisma 7 introduced breaking changes from v6.

---

## schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
  // multiSchema is stable in Prisma 7 — no longer a previewFeature
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")          // Supabase transaction pooler (port 6543)
  directUrl  = env("DATABASE_DIRECT_URL")   // Supabase direct connection (port 5432)
  schemas    = [
    "operator_domain",
    "agent_network",
    "player_core",
    "financial_ledger",
    "game_integration",
    "betting_core",
    "promotions",
    "messaging"
  ]
}
```

**Why two URLs with Supabase:**
- `DATABASE_URL` goes through Supavisor transaction-mode pooler. Efficient for
  short-lived query bursts. Requires `?pgbouncer=true` suffix.
- `DATABASE_DIRECT_URL` bypasses the pooler. Prisma Migrate needs a persistent
  session connection that transaction pooling cannot provide.

> **Verify with context7:** Prisma 7 may have renamed or restructured generator
> options. Run `use context7 prisma schema` to confirm the current `generator`
> block syntax before scaffolding the schema.

---

## PrismaService

```typescript
// src/database/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
      errorFormat: 'minimal',
    });
  }

  async onModuleInit()    { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

```typescript
// src/database/database.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class DatabaseModule {}
```

`DatabaseModule` is `@Global()`. Import it once in `AppModule`.
Feature modules never import it — they receive `PrismaService` by NestJS injection.

---

## Multi-schema rules

Every model declares its schema:

```prisma
model Agent {
  // fields ...
  @@schema("agent_network")
}
```

**Cross-schema references use bridge models only.**
Never add a raw `walletId UUID` FK on a model pointing into another schema.
Use a dedicated bridge model instead:

```prisma
// agent_network → financial_ledger bridge
model AgentWallet {
  id       String @id @default(uuid()) @db.Uuid
  agentId  String @unique @db.Uuid
  agent    Agent  @relation(fields: [agentId], references: [id])
  walletId String @unique @db.Uuid
  wallet   Wallet @relation(fields: [walletId], references: [id])

  @@schema("agent_network")
}
```

---

## Migration rules

| Context | Command | Notes |
|---|---|---|
| Local dev | `pnpm prisma:migrate:dev` | creates migration file + applies it |
| CI pipeline | `pnpm prisma:migrate:deploy` | applies pending files, no generation |
| Container startup | `prisma migrate deploy` | runs before `node dist/main.js` in CMD |
| Never | `prisma db push` | bypasses migration history — forbidden everywhere |

Migrations are **never auto-applied at runtime**. The container CMD handles
`migrate deploy` before the app process starts (see `skills/docker.md`).

Always run after any schema change:
```bash
pnpm prisma:generate    # keeps Prisma Client in sync with schema
```

---

## Query conventions

**Raw SQL — always use tagged template literals:**
```typescript
// Correct — parameterised, safe
const rows = await this.prisma.$queryRaw<Row[]>`
  SELECT id, balance FROM financial_ledger."Wallet"
  WHERE id = ${walletId}::uuid
  FOR UPDATE
`;

// Wrong — string interpolation, SQL injection risk
const rows = await this.prisma.$queryRaw(
  `SELECT ... WHERE id = '${walletId}'`  // never do this
);
```

**Monetary values — never `Float`:**
```typescript
// schema.prisma
balance Decimal @db.Decimal(20, 8)

// TypeScript — Prisma 7 ships Decimal as a top-level export
import { Decimal } from 'prisma/client/runtime/library';
// If that path errors, verify with: use context7 prisma decimal
const amount = new Decimal(dto.amount);   // dto.amount comes in as string
```

**Transactions — always use callback form:**
```typescript
await this.prisma.$transaction(
  async (tx) => {
    // tx is a transactional PrismaClient
    // any thrown error triggers automatic rollback
  },
  {
    isolationLevel: 'ReadCommitted',   // default for non-financial ops
    maxWait:  5_000,
    timeout:  10_000,
  },
);
```

Use `isolationLevel: 'Serializable'` for any operation that reads and writes
wallet balances.

**Select only needed fields in list queries:**
```typescript
const agents = await this.prisma.agent.findMany({
  where:   { operatorId, status: 'ACTIVE' },
  select:  { id: true, email: true, status: true, createdAt: true },
  orderBy: { createdAt: 'desc' },
  take:    limit,
  skip:    offset,
});
```

**Quoted table names in raw SQL:**
```sql
-- Correct (PostgreSQL is case-sensitive for quoted identifiers)
financial_ledger."Wallet"
financial_ledger."LedgerTransaction"

-- Wrong
financial_ledger.Wallet
```

---

## Error filter

Map Prisma errors to HTTP responses. Register globally in `main.ts`.

```typescript
// src/common/filters/prisma-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from 'prisma/client';   // Prisma 7 import path — verify with context7
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private static readonly statusMap: Record<string, HttpStatus> = {
    P2002: HttpStatus.CONFLICT,
    P2025: HttpStatus.NOT_FOUND,
    P2003: HttpStatus.BAD_REQUEST,
    P2034: HttpStatus.CONFLICT,   // serialization failure — client should retry
  };

  private static readonly messageMap: Record<string, string> = {
    P2002: 'A record with this value already exists.',
    P2025: 'Record not found.',
    P2003: 'Related record not found.',
    P2034: 'Transaction conflict, please retry.',
  };

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status  = PrismaExceptionFilter.statusMap[exception.code]  ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const message = PrismaExceptionFilter.messageMap[exception.code] ?? 'A database error occurred.';
    res.status(status).json({ error: { code: exception.code, message, statusCode: status } });
  }
}
```

---

## Naming conventions

| Thing | Convention |
|---|---|
| Schema name | `snake_case` |
| Model name | `PascalCase` |
| Field name | `camelCase` |
| Enum value | `SCREAMING_SNAKE_CASE` |
| Raw SQL table ref | `schema_name."ModelName"` (quoted) |
