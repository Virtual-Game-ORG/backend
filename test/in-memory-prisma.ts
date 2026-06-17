/**
 * A small in-memory Prisma double for scenario/flow tests.
 *
 * The unit specs under src/ mock Prisma per service and assert *call
 * orchestration*. The scenario tests instead wire the REAL services together
 * (Ledger, Commission, Transactions, Betting, …) over this shared store so they
 * can assert the actual end-to-end numbers the architecture promises — balances
 * moving, commission booked, statuses transitioning.
 *
 * It implements just enough of the Prisma client surface the services touch:
 * create (incl. nested relation create), findUnique(OrThrow), findFirst,
 * findMany (cursor/take/orderBy), update, updateMany (conditional `where` with
 * `gte` guards — the basis of the claim/overdraw locks), upsert, aggregate, and
 * `$transaction`. Atomicity is not modelled (callbacks run on the same store);
 * the conditional `updateMany` guards are, which is what the flows rely on.
 *
 * `any` is used throughout: this is a generic test double standing in for the
 * dynamically-shaped Prisma client, not production code.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from '@prisma/client';

const Dec = Prisma.Decimal;
const d0 = () => new Dec(0);
const toDec = (x: any) => (x instanceof Dec ? x : new Dec(x ?? 0));

let seq = 0;
const genId = (t: string) => `${t}_${++seq}`;

type Row = Record<string, any>;

interface RelDef {
  target: string;
  kind: 'one' | 'many';
  match: (parent: Row, candidate: Row) => boolean;
}

// hasOne / hasMany / belongsTo relations the services read via `include`.
const RELATIONS: Record<string, Record<string, RelDef>> = {
  agent: {
    wallet: { target: 'agentWallet', kind: 'one', match: (p, c) => c.agentId === p.id },
    commissionConfig: {
      target: 'commissionConfig',
      kind: 'one',
      match: (p, c) => c.agentId === p.id,
    },
  },
  agentWallet: {
    account: { target: 'agentAccount', kind: 'one', match: (p, c) => c.id === p.accountId },
  },
  operatorWallet: {
    account: { target: 'operatorAccount', kind: 'one', match: (p, c) => c.id === p.accountId },
  },
  playerWallet: {
    wallet: { target: 'wallet', kind: 'one', match: (p, c) => c.id === p.walletId },
  },
  bet: {
    selections: { target: 'betSelection', kind: 'many', match: (p, c) => c.betId === p.id },
  },
  agentCreditRequest: {
    agent: { target: 'agent', kind: 'one', match: (p, c) => c.id === p.agentId },
  },
};

// Nested `create` writes (e.g. bet.create({ data: { selections: { create: [...] }}})).
const NESTED: Record<string, Record<string, { target: string; fk: string }>> = {
  bet: { selections: { target: 'betSelection', fk: 'betId' } },
};

// Default column values so atomic increment/decrement always have a Decimal.
const DEFAULTS: Record<string, () => Row> = {
  wallet: () => ({
    currency: 'ETB',
    balance: d0(),
    withdrawableBalance: d0(),
    lockedBalance: d0(),
    bonusBalance: d0(),
  }),
  agentAccount: () => ({ currency: 'ETB', creditBalance: d0(), commissionBalance: d0() }),
  operatorAccount: () => ({ currency: 'ETB', creditBalance: d0(), commissionBalance: d0() }),
  transaction: () => ({
    claimVersion: 0,
    agentId: null,
    claimedAt: null,
    completedAt: null,
  }),
  agentCreditRequest: () => ({
    claimVersion: 0,
    operatorId: null,
    claimedAt: null,
    completedAt: null,
  }),
  bet: () => ({ settledAt: null, placedAt: new Date(), usedBonus: false }),
  chatMessage: () => ({ readAt: null }),
};

const TABLES = [
  'operator',
  'operatorAccount',
  'operatorWallet',
  'agent',
  'agentAccount',
  'agentWallet',
  'commissionConfig',
  'player',
  'wallet',
  'playerWallet',
  'transaction',
  'agentCreditRequest',
  'bet',
  'betSelection',
  'game',
  'gameProvider',
  'ledgerEntry',
  'commissionLog',
  'notification',
  'chatThread',
  'chatMessage',
];

const OPS = ['gte', 'gt', 'lte', 'lt', 'in', 'not', 'equals'];
const isPlain = (v: any) =>
  v != null &&
  typeof v === 'object' &&
  !(v instanceof Dec) &&
  !(v instanceof Date) &&
  !Array.isArray(v);
const hasOps = (v: any) => Object.keys(v).some((k) => OPS.includes(k));

function eq(a: any, b: any): boolean {
  if (a instanceof Dec && b != null) return a.equals(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function sign(a: any, b: any): number {
  if (a instanceof Dec) return a.cmp(b);
  if (a instanceof Date) return a.getTime() - (b as Date).getTime();
  return a < b ? -1 : a > b ? 1 : 0;
}

function valueMatch(rowVal: any, cond: any): boolean {
  if (isPlain(cond) && hasOps(cond)) {
    if ('gte' in cond && !(sign(rowVal, cond.gte) >= 0)) return false;
    if ('gt' in cond && !(sign(rowVal, cond.gt) > 0)) return false;
    if ('lte' in cond && !(sign(rowVal, cond.lte) <= 0)) return false;
    if ('lt' in cond && !(sign(rowVal, cond.lt) < 0)) return false;
    if ('in' in cond && !cond.in.includes(rowVal)) return false;
    if ('not' in cond && eq(rowVal, cond.not)) return false;
    if ('equals' in cond && !eq(rowVal, cond.equals)) return false;
    return true;
  }
  return eq(rowVal, cond);
}

export function createInMemoryPrisma(): any {
  const store: Record<string, Row[]> = {};
  TABLES.forEach((t) => (store[t] = []));
  const db: any = {};

  function match(table: string, row: Row, where: Row): boolean {
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === 'OR') {
        if (!(v as Row[]).some((w) => match(table, row, w))) return false;
        continue;
      }
      if (k === 'AND') {
        if (!(v as Row[]).every((w) => match(table, row, w))) return false;
        continue;
      }
      const rel = RELATIONS[table]?.[k];
      if (rel && isPlain(v) && !hasOps(v)) {
        const related = store[rel.target].filter((c) => rel.match(row, c));
        if (!related.some((c) => match(rel.target, c, v))) return false;
        continue;
      }
      // Compound unique key, e.g. { subjectType_subjectId: { ... } }.
      if (isPlain(v) && !hasOps(v)) {
        for (const [sk, sv] of Object.entries(v)) {
          if (!valueMatch(row[sk], sv)) return false;
        }
        continue;
      }
      if (!valueMatch(row[k], v)) return false;
    }
    return true;
  }

  function withInclude(table: string, row: Row, include?: Row): Row {
    const out = { ...row };
    if (!include) return out;
    const rels = RELATIONS[table] ?? {};
    for (const key of Object.keys(include)) {
      const def = rels[key];
      if (!def || !include[key]) continue;
      const sub = include[key];
      const found = store[def.target]
        .filter((c) => def.match(row, c))
        .map((c) => (isPlain(sub) && sub.include ? withInclude(def.target, c, sub.include) : { ...c }));
      out[key] = def.kind === 'many' ? found : (found[0] ?? null);
    }
    return out;
  }

  function applyData(row: Row, data: Row): void {
    for (const [k, v] of Object.entries(data)) {
      if (isPlain(v) && ('increment' in v || 'decrement' in v || 'set' in v)) {
        if ('increment' in v) {
          row[k] = typeof row[k] === 'number' ? row[k] + Number(v.increment) : toDec(row[k]).plus(v.increment);
        } else if ('decrement' in v) {
          row[k] = typeof row[k] === 'number' ? row[k] - Number(v.decrement) : toDec(row[k]).minus(v.decrement);
        } else {
          row[k] = v.set;
        }
      } else {
        row[k] = v;
      }
    }
    row.updatedAt = new Date();
  }

  function order(rows: Row[], orderBy?: Row): Row[] {
    if (!orderBy) return rows;
    const [f, dir] = Object.entries(orderBy)[0] as [string, 'asc' | 'desc'];
    const sorted = [...rows].sort((a, b) => sign(a[f], b[f]));
    return dir === 'desc' ? sorted.reverse() : sorted;
  }

  for (const table of TABLES) {
    const rows = store[table];
    db[table] = {
      create: ({ data, include }: any) => {
        const nested = NESTED[table] ?? {};
        const scalar: Row = {};
        for (const k of Object.keys(data)) {
          if (!nested[k]) scalar[k] = data[k];
        }
        const row: Row = {
          id: data.id ?? genId(table),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(DEFAULTS[table]?.() ?? {}),
          ...scalar,
        };
        rows.push(row);
        for (const [k, spec] of Object.entries(nested)) {
          const child = data[k];
          if (!child?.create) continue;
          const list = Array.isArray(child.create) ? child.create : [child.create];
          for (const c of list) {
            db[spec.target].create({ data: { ...c, [spec.fk]: row.id } });
          }
        }
        return Promise.resolve(withInclude(table, row, include));
      },
      findUnique: ({ where, include }: any) => {
        const r = rows.find((x) => match(table, x, where));
        return Promise.resolve(r ? withInclude(table, r, include) : null);
      },
      findUniqueOrThrow: ({ where, include }: any) => {
        const r = rows.find((x) => match(table, x, where));
        if (!r) return Promise.reject(new Error(`${table} not found`));
        return Promise.resolve(withInclude(table, r, include));
      },
      findFirst: ({ where, orderBy, include }: any = {}) => {
        const r = order(rows.filter((x) => (where ? match(table, x, where) : true)), orderBy)[0];
        return Promise.resolve(r ? withInclude(table, r, include) : null);
      },
      findMany: ({ where, orderBy, take, cursor, skip, include }: any = {}) => {
        let res = order(rows.filter((x) => (where ? match(table, x, where) : true)), orderBy);
        if (cursor) {
          const i = res.findIndex((x) => match(table, x, cursor));
          if (i >= 0) res = res.slice(i + (skip ?? 0));
        }
        if (typeof take === 'number') res = res.slice(0, take);
        return Promise.resolve(res.map((r) => withInclude(table, r, include)));
      },
      update: ({ where, data, include }: any) => {
        const r = rows.find((x) => match(table, x, where));
        if (!r) return Promise.reject(new Error(`${table} not found`));
        applyData(r, data);
        return Promise.resolve(withInclude(table, r, include));
      },
      updateMany: ({ where, data }: any) => {
        const ms = rows.filter((x) => match(table, x, where));
        ms.forEach((r) => applyData(r, data));
        return Promise.resolve({ count: ms.length });
      },
      upsert: ({ where, create, update, include }: any) => {
        const r = rows.find((x) => match(table, x, where));
        if (r) {
          applyData(r, update);
          return Promise.resolve(withInclude(table, r, include));
        }
        return db[table].create({ data: create, include });
      },
      aggregate: ({ where, _sum }: any) => {
        const ms = rows.filter((x) => (where ? match(table, x, where) : true));
        const sum: Row = {};
        for (const f of Object.keys(_sum ?? {})) {
          sum[f] = ms.reduce((acc, r) => acc.plus(toDec(r[f])), d0());
        }
        return Promise.resolve({ _sum: sum });
      },
      count: ({ where }: any = {}) =>
        Promise.resolve(rows.filter((x) => (where ? match(table, x, where) : true)).length),
      // Expose the raw rows for test introspection.
      _rows: rows,
    };
  }

  db.$transaction = (arg: any) =>
    typeof arg === 'function' ? arg(db) : Promise.all(arg);

  return db;
}
