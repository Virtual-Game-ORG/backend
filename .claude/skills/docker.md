# Docker

The app ships as a single container image. Multi-stage build: `builder` compiles
TypeScript and generates the Prisma client; `runner` is the lean production image.

---

## Dockerfile

```dockerfile
# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies (all, including dev — needed for tsc + prisma generate)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN pnpm prisma generate

# Copy source and compile
COPY . .
RUN pnpm build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Prisma schema (needed by migrate deploy at startup)
COPY prisma ./prisma/

# Prisma generated client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Compiled application
COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nestjs
USER nestjs

EXPOSE 3000

# Startup: migrate then run
# migrate deploy is idempotent — safe on every container start
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
```

---

## .dockerignore

```
node_modules
dist
.env
.env.*
.git
.gitignore
*.log
coverage
README.md
.claude
```

---

## Build and run locally

```bash
# Build image
docker build -t core-api .

# Run with local env file
docker run --rm \
  --env-file .env \
  -p 3000:3000 \
  core-api

# Verify health
curl http://localhost:3000/health
```

---

## Environment variables

All secrets are injected as environment variables at runtime.
No `.env` file is copied into the image — it is in `.dockerignore`.

Required variables the container must receive:

```
NODE_ENV=production
PORT=3000

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

DATABASE_URL=          # Supabase transaction pooler (port 6543, ?pgbouncer=true)
DATABASE_DIRECT_URL=   # Supabase direct connection (port 5432)

REDIS_URL=             # Redis Cloud full URL (rediss://...)

PLAYER_APP_URL=
AGENT_APP_URL=
OPERATOR_APP_URL=
```

On AWS App Runner, inject these via the service's environment variable configuration
or via AWS Secrets Manager (recommended for SERVICE_ROLE_KEY and JWT_SECRET).

---

## CMD behaviour

```dockerfile
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
```

- `prisma migrate deploy` applies any pending migrations against `DATABASE_DIRECT_URL`.
  It is idempotent: if no migrations are pending, it exits immediately with code 0.
- If migrate fails (bad connection, broken migration), the container exits with
  a non-zero code and App Runner will not route traffic to it.
- `node dist/main.js` starts the NestJS app only after migrations succeed.

Do not use `npx prisma` in the CMD — it adds cold-start latency.
`node_modules/.bin/prisma` is the direct binary path.

---

## Image size tips

- `node:24-alpine` base keeps the runner image under 300 MB.
- `--prod` flag on the runner's `pnpm install` excludes all devDependencies
  (TypeScript compiler, Jest, ESLint, etc.).
- Only `node_modules/.prisma` (the generated client) is copied from the builder,
  not the full `node_modules`.

---

## Health check

The `/health` route is registered in `main.ts` before any other middleware:

```typescript
app.use('/health', (_req, res) => res.json({ status: 'ok' }));
```

App Runner pings `/health` every 20 seconds.
The route must respond in under 5 seconds or the container is marked unhealthy.
Keep it dependency-free — no Prisma or Redis calls inside it.
