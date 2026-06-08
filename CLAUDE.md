# core-api

NestJS monolith · Prisma ORM · Supabase PostgreSQL · Redis Cloud · Supabase Auth · Docker container

---

## Stack

| | |
|---|---|
| Node.js | 24 LTS |
| NestJS | 11 |
| Prisma | 7+ |
| TypeScript | 5.8 strict |
| Socket.IO | 4 |
| Database | Supabase PostgreSQL 17 |
| Cache | Redis Cloud (URL only) |
| Auth | Supabase Auth |
| Runtime | Docker container |

---

## Commands

```bash
# Development
pnpm dev                        # NestJS --watch
pnpm build                      # compile → dist/
pnpm start:prod                 # node dist/main.js

# Database
pnpm prisma:generate            # regenerate client after schema change
pnpm prisma:migrate:dev         # create + apply migration (dev only)
pnpm prisma:migrate:deploy      # apply pending migrations (CI / container startup)
pnpm prisma:studio              # Prisma Studio

# Container
pnpm docker:build               # docker build -t core-api .
pnpm docker:run                 # docker run --env-file .env -p 3000:3000 core-api

# Quality
pnpm test                       # Jest unit
pnpm test:e2e                   # e2e
pnpm lint                       # ESLint
pnpm typecheck                  # tsc --noEmit
```

---

## MCP servers

**supabase** — live access to the Supabase project (auth users, SQL, table structure).
Use before implementing anything Supabase-specific.

**context7** — resolves current library documentation on demand.
Add `use context7` to any prompt to pull the latest API reference for NestJS,
Prisma, Supabase JS, Socket.IO, or class-validator.

---

## Skills index

Read the relevant skill before starting work in that area.

| Skill | When to read |
|---|---|
| `skills/structure.md` | before creating any new file |
| `skills/supabase.md` | Supabase Auth, Supabase Postgres, connection strings |
| `skills/prisma.md` | schema changes, queries, migrations |
| `skills/nestjs.md` | modules, guards, config, DTOs, bootstrap |
| `skills/docker.md` | Dockerfile, image build, container config |

---

## Non-negotiable rules

- No business logic in controllers — one service call per route, nothing else.
- No Prisma calls outside service files.
- All config from `ConfigService`. No `process.env` outside `config/`.
- No `any` without a comment explaining why.
- No `number` for money. `string` in DTOs, `Decimal` in services.
- Every new file belongs in a feature folder. Read `skills/structure.md` first.
- No secrets hardcoded anywhere. All from environment variables.
