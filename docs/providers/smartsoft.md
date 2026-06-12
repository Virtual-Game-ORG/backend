# SmartSoft Gaming — Provider Integration Spec

Integration contract for **SmartSoft Gaming** (X-Games / crash provider, flagship
**JetX**). This document is the source of truth the `game-integration` feature
implements against. It maps SmartSoft's three APIs onto our planned module layout.

> **Status of accuracy.** Part 1 (Game Launch) is **verified** against the live
> `ssgportal.com` endpoint. Parts 2–3 follow SmartSoft's seamless-wallet model;
> exact field names are confirmed on operator onboarding (their spec is NDA-gated).
> Structure, types, and semantics here are correct — treat field names as the
> contract to confirm, not to invent. Money is **`string` in DTOs, `Decimal` in
> services** everywhere (per `CLAUDE.md`).

---

## 1. Where this lives

Per `.claude/skills/structure.md`, all of this belongs to one feature:

```
src/features/game-integration/
├── game-integration.module.ts
├── game-wallet.controller.ts     # Part 2 — provider POSTs here  (/v1/game/*)
├── game-wallet.service.ts        # Part 2 — debit/credit via LedgerModule
├── game-session.service.ts       # Parts 1 & 3 — mint launch token, catalog
├── guards/
│   └── provider-auth.guard.ts    # verifies SmartSoft signature / IP allowlist
└── dto/
    ├── launch.dto.ts             # Part 1
    ├── wallet-callback.dto.ts    # Part 2
    └── report.dto.ts             # Part 3
```

- Wallet writes go through `LedgerModule` (`WalletService`) — the controller never
  touches Prisma (structure.md rule).
- All SmartSoft config (`base url`, `portalName`, `secret`) comes from
  `config/` via `ConfigService` — never `process.env` outside `config/`.

```
suggested config/smartsoft.config.ts keys
  smartsoft.baseUrl     SSG_BASE_URL        e.g. https://eu-server.ssgportal.com
  smartsoft.portalName  SSG_PORTAL_NAME     our operator/brand id
  smartsoft.secret      SSG_SECRET          shared HMAC secret (callback signing)
  smartsoft.apiKey      SSG_API_KEY         bearer for the reporting API
  smartsoft.ipAllowlist SSG_IP_ALLOWLIST    comma-separated provider IPs
```

---

## 2. Three APIs at a glance

| # | API | Direction | Transport | Owner file |
|---|-----|-----------|-----------|------------|
| 1 | **Game Launch** | browser → SmartSoft | `GET` HTML (iframe) | `game-session.service` builds URL |
| 2 | **Seamless Wallet** | SmartSoft → us | `POST` JSON callbacks | `game-wallet.controller` |
| 3 | **Backoffice / Reporting** | us → SmartSoft | `POST`/`GET` JSON (REST) | `game-session.service` |

```
[3] POST /api/session/create   → token + launchUrl       (we call SmartSoft)
        ↓ token handed to browser
[1] GET  Loader.aspx?Token=…   → game iframe              (browser → SmartSoft)
        ↓ during play, provider → us
[2] POST /v1/game/wallet  getBalance → bet → win|rollback (the money path)
        ↓ nightly
[3] GET  /api/transactions     → reconcile vs our ledger  (we call SmartSoft)
```

---

## 3. Part 1 — Game Launch API ✅ verified

```
GET https://{region}-server.ssgportal.com/GameLauncher/Loader.aspx
```

| field | type | req | example | notes |
|---|---|---|---|---|
| `GameCategory` | string | ✓ | `JetX` | game family |
| `GameName` | string | ✓ | `JetX` | specific game |
| `Token` | string | ✓ | `a1b2…` / `DEMO` | session token (Part 3), or `DEMO` for fun mode |
| `PortalName` | string | ✓ | `vgo` / `DEMO` | our brand id |
| `ReturnUrl` | url | ✗ | `https://vgo.bet/lobby` | back-to-lobby target |
| `Lang` | string | ✗ | `en` | ISO-639-1 |
| `Currency` | string | ✗ | `ETB` | display currency override |

**Response:** `text/html` — the game itself. No JSON. Embed in `<iframe>`.
Static assets serve from `static.ssg-public.com`. Verified: HTTP 200, **no
`X-Frame-Options` / CSP `frame-ancestors`** → embeddable. `Token=DEMO&PortalName=DEMO`
runs fun mode with no wallet calls (used today in `frontend-player`).

The frontend never builds this URL itself in production — it asks our backend
(Part 3 `session/create`), which returns a ready `launchUrl` with a real `Token`.

---

## 4. Part 2 — Seamless Wallet API (provider → us)

SmartSoft POSTs JSON to **one endpoint we host**. `method` discriminates the union.
This is the **money path** — idempotency and signature verification are mandatory.

```
POST /v1/game/wallet
Content-Type: application/json
```

### 4.1 Common request envelope

```jsonc
{
  "method": "getBalance" | "bet" | "win" | "rollback",
  "portalName": "vgo",            // must equal our configured portalName
  "token": "a1b2c3...",           // player session token (from Part 3)
  "requestId": "req_8f3...",      // unique per call — log for audit
  "hash": "hex-hmac-sha256(...)", // signature over the body w/ shared secret
  "data": { /* method-specific, §4.4 */ }
}
```

### 4.2 Common success response

```jsonc
{
  "status": "OK",
  "data": {
    "userId": "usr_4412",
    "balance": "1850.00",         // STRING (Decimal serialized) — never number
    "currency": "ETB"
  }
}
```

### 4.3 Common error response

```jsonc
{ "status": "ERROR", "code": "INSUFFICIENT_FUNDS", "message": "..." }
```

| code | meaning |
|---|---|
| `INVALID_TOKEN` | token unknown / expired |
| `INVALID_HASH` | signature mismatch → reject before any wallet read |
| `INSUFFICIENT_FUNDS` | bet exceeds balance |
| `BET_ALREADY_EXISTS` | duplicate `transactionId` on a `bet` (return prior result) |
| `TRANSACTION_NOT_FOUND` | rollback references unknown txn |
| `USER_BLOCKED` | player suspended |

### 4.4 Method-specific `data`

**`getBalance`** — game open / authenticate
```jsonc
// request.data
{ "gameId": "JetX" }
// response.data → common success (userId, balance, currency)
```

**`bet`** — debit a stake
```jsonc
// request.data
{
  "transactionId": "ssg_tx_1001",  // provider txn id — debit ONCE per id
  "roundId": "round_77",
  "gameId": "JetX",
  "amount": "50.00",               // string
  "currency": "ETB",
  "timestamp": "2026-06-12T09:41:00Z"
}
// response.data
{ "userId": "usr_4412", "balance": "1800.00", "currency": "ETB",
  "operatorTxId": "vtx_55001" }    // our ledger id, echoed for reconciliation
```

**`win`** — credit a payout (`amount:"0"` settles a loss)
```jsonc
// request.data
{
  "transactionId": "ssg_tx_1002",
  "roundId": "round_77",           // same round as the bet
  "gameId": "JetX",
  "amount": "140.00",
  "currency": "ETB",
  "timestamp": "2026-06-12T09:41:20Z"
}
// response.data → balance after credit + operatorTxId
```

**`rollback`** — void a prior bet/win (timeout, crash, cancel)
```jsonc
// request.data
{
  "transactionId": "ssg_tx_1003",
  "refTransactionId": "ssg_tx_1001", // the txn being reversed
  "roundId": "round_77",
  "gameId": "JetX"
}
// response.data → balance after reversal
```

### 4.5 Invariants (enforced in `game-wallet.service`)

1. **Idempotent on `transactionId`.** A duplicate `bet`/`win` returns the *same*
   stored result and balance — never double-writes. Back this with a unique
   constraint on the provider txn id in the ledger.
2. **Verify `hash` first** (in `provider-auth.guard`), before any wallet read.
   Reject with `INVALID_HASH`. Also IP-allowlist the provider.
3. **`rollback` is idempotent and tolerant.** Reversing an unknown or
   already-reversed txn returns `OK` (no-op), not an error.
4. **Atomic balance change.** Debit/credit + ledger row in a single Prisma
   transaction via `WalletService`.
5. **Money is `string` in/out, `Decimal` internally.** No `number` anywhere on
   this path.

---

## 5. Part 3 — Backoffice / Reporting API (us → provider, REST)

Server-to-server, authenticated with `SSG_API_KEY`. Called from
`game-session.service`. Base `https://{region}-server.ssgportal.com/api`.

### 5.1 `POST /api/session/create` — mint a launch token

```jsonc
// request
{ "portalName": "vgo", "userId": "usr_4412", "currency": "ETB",
  "language": "en", "gameId": "JetX", "mode": "real" }   // "real" | "demo"
// response
{ "token": "a1b2c3...",
  "launchUrl": "https://eu-server.ssgportal.com/GameLauncher/Loader.aspx?GameCategory=JetX&GameName=JetX&Token=a1b2c3...&PortalName=vgo&Lang=en" }
```
This is the bridge to Part 1: frontend calls *our* `players`/`game-integration`
route, we call this, return `launchUrl` to the iframe.

### 5.2 `GET /api/games` — catalog (replaces hardcoded `games.ts`)

```jsonc
// response.items[]
{
  "gameId": "JetX",
  "gameName": "JetX",
  "category": "X-Games",
  "provider": "SmartSoft",
  "rtp": 97.0,
  "thumbnailUrl": "https://static.ssg-public.com/.../jetx.jpg",
  "supportedCurrencies": ["ETB", "USD"],
  "demoAvailable": true
}
```

### 5.3 `GET /api/transactions?from=&to=&page=` — reconciliation

```jsonc
// response.items[]
{
  "transactionId": "ssg_tx_1001",
  "operatorTxId": "vtx_55001",
  "type": "bet" | "win" | "rollback",
  "roundId": "round_77",
  "gameId": "JetX",
  "userId": "usr_4412",
  "amount": "50.00",
  "currency": "ETB",
  "status": "settled" | "voided",
  "createdAt": "2026-06-12T09:41:00Z"
}
```

### 5.4 `GET /api/rounds/{roundId}` — full round detail (audit / dispute)

```jsonc
{ "roundId": "round_77", "gameId": "JetX", "userId": "usr_4412",
  "bets":  [{ "transactionId": "ssg_tx_1001", "amount": "50.00" }],
  "wins":  [{ "transactionId": "ssg_tx_1002", "amount": "140.00" }],
  "multiplier": "2.80", "crashedAt": "3.10", "status": "completed" }
```

---

## 6. Reference DTO + controller sketch

Illustrative only — not wired into `src/` until the `game-integration` feature
and its deps (`class-validator`, Prisma ledger, config) are stood up. Shows the
shape the implementation must match.

```ts
// dto/wallet-callback.dto.ts
import { IsIn, IsString, IsOptional, Matches } from 'class-validator';

const MONEY = /^\d+(\.\d{1,2})?$/; // string money, ≤2dp

class WalletDataDto {
  @IsString() gameId: string;
  @IsOptional() @IsString() transactionId?: string;
  @IsOptional() @IsString() refTransactionId?: string;
  @IsOptional() @IsString() roundId?: string;
  @IsOptional() @Matches(MONEY) amount?: string;   // string, never number
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() timestamp?: string;
}

export class WalletCallbackDto {
  @IsIn(['getBalance', 'bet', 'win', 'rollback']) method: string;
  @IsString() portalName: string;
  @IsString() token: string;
  @IsString() requestId: string;
  @IsString() hash: string;
  data: WalletDataDto;
}
```

```ts
// game-wallet.controller.ts  — one service call per route, nothing else
@Controller('v1/game')
@UseGuards(ProviderAuthGuard)            // verifies hash + IP allowlist
export class GameWalletController {
  constructor(private readonly wallet: GameWalletService) {}

  @Post('wallet')
  @HttpCode(200)
  handle(@Body() dto: WalletCallbackDto) {
    return this.wallet.handle(dto);      // service routes on dto.method
  }
}
```

```ts
// game-wallet.service.ts  — Decimal internally, idempotent, atomic
async handle(dto: WalletCallbackDto) {
  switch (dto.method) {
    case 'getBalance': return this.getBalance(dto);
    case 'bet':        return this.bet(dto);      // unique(transactionId) → idempotent
    case 'win':        return this.win(dto);
    case 'rollback':   return this.rollback(dto); // no-op if unknown/reversed
  }
}
```

---

## 7. Implementation checklist

- [ ] `config/smartsoft.config.ts` + env keys (§1).
- [ ] `game-integration` feature folder per structure.md.
- [ ] `provider-auth.guard.ts` — HMAC verify + IP allowlist, runs before body.
- [ ] Ledger: unique constraint on provider `transactionId` (idempotency).
- [ ] `game-wallet.service` — `getBalance`/`bet`/`win`/`rollback`, atomic via `WalletService`.
- [ ] `game-session.service` — `session/create`, `games`, `transactions` clients.
- [ ] Replace `frontend-player` static catalog with `GET /api/games` (later).
- [ ] Confirm exact field names against SmartSoft's onboarding spec, update this doc.
- [ ] Currency: platform is **ETB**; confirm SmartSoft enables it (else map display only).

---

_Frontend status: `frontend-player` already embeds Part 1 in fun mode (JetX,
`Token=DEMO`). Parts 2–3 are backend and unbuilt — this doc is the contract._
