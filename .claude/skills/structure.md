# Structure

Feature-based layout. Every feature owns its own module, controller, service, and DTOs.

---

## Full tree

```
src/
│
├── main.ts                           # bootstrap only
├── app.module.ts                     # imports all feature modules
│
├── config/
│   ├── app.config.ts                 # PORT, NODE_ENV, CORS origins
│   ├── supabase.config.ts            # SUPABASE_URL, JWT_SECRET, SERVICE_ROLE_KEY
│   ├── database.config.ts            # DATABASE_URL, DATABASE_DIRECT_URL
│   ├── redis.config.ts               # REDIS_URL
│   └── index.ts                      # re-exports all configs
│
├── database/
│   ├── database.module.ts            # @Global() PrismaModule
│   └── prisma.service.ts
│
├── infrastructure/
│   ├── supabase/
│   │   ├── supabase.module.ts        # @Global()
│   │   └── supabase.service.ts       # Supabase admin client
│   ├── redis/
│   │   ├── redis.module.ts           # @Global()
│   │   └── redis.service.ts          # ioredis — single shared client
│   └── events/
│       └── events.module.ts          # NestJS EventEmitter2
│
├── common/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts
│   │   └── ws-jwt.guard.ts
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   ├── roles.decorator.ts
│   │   └── public.decorator.ts
│   ├── filters/
│   │   ├── http-exception.filter.ts
│   │   ├── prisma-exception.filter.ts
│   │   └── ws-exception.filter.ts
│   ├── interceptors/
│   │   └── response.interceptor.ts
│   └── pipes/
│       └── decimal-parse.pipe.ts
│
├── features/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts        # POST /auth/provision
│   │   ├── auth.service.ts
│   │   ├── auth.types.ts             # AuthUser interface
│   │   ├── strategies/
│   │   │   └── supabase-jwt.strategy.ts
│   │   └── dto/
│   │       └── provision.dto.ts
│   │
│   ├── operators/
│   │   ├── operators.module.ts
│   │   ├── operators.controller.ts
│   │   ├── operators.service.ts
│   │   └── dto/
│   │
│   ├── agents/
│   │   ├── agents.module.ts
│   │   ├── agents.controller.ts
│   │   ├── agents.service.ts
│   │   └── dto/
│   │
│   ├── players/
│   │   ├── players.module.ts
│   │   ├── players.controller.ts
│   │   ├── players.service.ts
│   │   └── dto/
│   │
│   ├── ledger/                       # no controller
│   │   ├── ledger.module.ts          # exports LedgerService, WalletService
│   │   ├── ledger.service.ts
│   │   ├── wallet.service.ts
│   │   └── utils/
│   │       ├── hash.util.ts
│   │       └── ref.util.ts
│   │
│   ├── transactions/
│   │   ├── transactions.module.ts
│   │   ├── transactions.controller.ts
│   │   ├── transactions.service.ts
│   │   ├── claim-lock.service.ts
│   │   └── dto/
│   │
│   ├── chat/
│   │   ├── chat.module.ts
│   │   ├── chat.controller.ts
│   │   ├── chat.service.ts
│   │   └── dto/
│   │
│   ├── commission/                   # no controller
│   │   ├── commission.module.ts
│   │   └── commission.service.ts
│   │
│   ├── betting/
│   │   ├── betting.module.ts
│   │   ├── betting.controller.ts
│   │   ├── betting.service.ts
│   │   └── dto/
│   │
│   ├── promotions/
│   │   ├── promotions.module.ts
│   │   ├── promotions.controller.ts
│   │   ├── promotions.service.ts
│   │   ├── cashback.service.ts
│   │   ├── tournament.service.ts
│   │   └── dto/
│   │
│   └── game-integration/
│       ├── game-integration.module.ts
│       ├── game-wallet.controller.ts  # /v1/game/* — provider-facing
│       ├── game-wallet.service.ts
│       ├── game-session.service.ts
│       ├── guards/
│       │   └── provider-auth.guard.ts
│       └── dto/
│
└── websocket/                        # gateways span features — live outside features/
    ├── websocket.module.ts
    ├── transaction-queue.gateway.ts
    ├── chat.gateway.ts
    ├── player.gateway.ts
    └── operator.gateway.ts
```

---

## Rules

**Feature owns everything it needs.**
Module, controller, service, DTOs, and feature-specific guards all live
inside the feature folder. Nothing leaks into `common/` unless used by
3+ unrelated features.

**Services are the only Prisma layer.**
Controllers → services → Prisma. Nothing else calls PrismaService directly.

**Cross-feature communication via injection.**
If `TransactionsService` needs ledger writes, it imports `LedgerModule`
and injects `LedgerService`. It never touches `prisma.ledgerTransaction` directly.

**Gateways live in `websocket/`, not inside features.**
Gateways emit events across domain boundaries. Keeping them outside features
prevents circular imports.

**`infrastructure/` vs `common/`**
- `infrastructure/` = external service clients (Supabase, Redis, EventEmitter)
- `common/` = NestJS plumbing (guards, filters, interceptors, decorators)

**Config is always typed.**
`process.env` is accessed only inside `config/` files.
Everywhere else: `configService.get('supabase.jwtSecret')`.
