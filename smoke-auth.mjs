import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client } = pg;
const BASE = 'http://localhost:3000';
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `smoke+${Date.now()}@example.com`;
const password = `Smoke!${randomUUID().slice(0, 12)}`;

// Players are linked to a referring agent at registration, so we must seed a
// real Operator -> Agent before provisioning (Player.agentId is a required FK).
const operatorId = randomUUID();
const agentId = randomUUID();

let userId;
let playerId;
let walletId;
let pass = true;
const log = (ok, msg) => {
  if (!ok) pass = false;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
};

const db = new Client({ connectionString: process.env.DIRECT_URL });

try {
  await db.connect();

  // 0. Seed the referring Operator + Agent the player will be linked to.
  await db.query(
    `INSERT INTO operator_domain."Operator"(id,"supabaseUserId",name,status,"createdAt","updatedAt")
     VALUES($1,$2,$3,'ACTIVE',now(),now())`,
    [operatorId, randomUUID(), `smoke-operator-${Date.now()}`],
  );
  await db.query(
    `INSERT INTO agent_network."Agent"(id,"supabaseUserId","operatorId",name,status,"createdAt","updatedAt")
     VALUES($1,$2,$3,$4,'ACTIVE',now(),now())`,
    [agentId, randomUUID(), operatorId, `smoke-agent-${Date.now()}`],
  );
  console.log(`\n# seeded operator=${operatorId} agent=${agentId}\n`);

  // 1. Create a confirmed Supabase auth user (admin bypasses signup gates)
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw new Error(`createUser: ${created.error.message}`);
  userId = created.data.user.id;
  console.log(`# test user ${email}  sub=${userId}\n`);

  // 2. Sign in with the anon client to get a real access_token
  const signin = await anon.auth.signInWithPassword({ email, password });
  if (signin.error) throw new Error(`signIn: ${signin.error.message}`);
  const token = signin.data.session.access_token;
  log(!!token, 'obtained signed access_token');

  // 3a. Negative: provision WITHOUT a token must be rejected (401)
  const noTok = await fetch(`${BASE}/auth/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId }),
  });
  log(noTok.status === 401, `no token -> 401 (got ${noTok.status})`);

  // 3b. Negative: invalid agentId must fail DTO validation (400)
  const badDto = await fetch(`${BASE}/auth/provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ agentId: 'not-a-uuid' }),
  });
  log(badDto.status === 400, `bad agentId -> 400 (got ${badDto.status})`);

  // 3c. Negative: a well-formed but unknown agentId must be rejected (404)
  const unknownAgent = await fetch(`${BASE}/auth/provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ agentId: randomUUID() }),
  });
  log(unknownAgent.status === 404, `unknown agent -> 404 (got ${unknownAgent.status})`);

  // 4. Provision (happy path) with the seeded agent
  const res = await fetch(`${BASE}/auth/provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ agentId }),
  });
  const body = await res.json();
  log(res.status === 201, `provision -> 201 (got ${res.status})`);
  console.log('   response:', JSON.stringify(body));
  playerId = body.id;
  log(!!playerId, 'response contains a Player id');
  log(body.supabaseUserId === userId, 'Player.supabaseUserId == token sub');
  log(body.agentId === agentId, 'Player.agentId == seeded agent id');
  log(body.status === 'ACTIVE', 'Player.status == ACTIVE');

  // 5. Idempotency: second call returns the same player, no duplicates
  const res2 = await fetch(`${BASE}/auth/provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ agentId }),
  });
  const body2 = await res2.json();
  log(
    res2.status === 201 && body2.id === playerId,
    `idempotent: same Player id returned (got ${body2.id})`,
  );

  // 6. app_metadata claims were set via service role
  const fetched = await admin.auth.admin.getUserById(userId);
  const meta = fetched.data.user.app_metadata ?? {};
  log(meta.platform_role === 'PLAYER', `app_metadata.platform_role == PLAYER (got ${meta.platform_role})`);
  log(meta.platform_id === playerId, `app_metadata.platform_id == Player id (got ${meta.platform_id})`);

  // 7. Verify the row graph in the DB (Player -> PlayerWallet -> Wallet)
  const rows = await db.query(
    `SELECT pw."walletId", w.currency, w.balance
       FROM player_core."PlayerWallet" pw
       JOIN financial_ledger."Wallet" w ON w.id = pw."walletId"
      WHERE pw."playerId" = $1`,
    [playerId],
  );
  log(rows.rowCount === 1, `exactly one PlayerWallet+Wallet for the player (got ${rows.rowCount})`);
  if (rows.rowCount === 1) {
    walletId = rows.rows[0].walletId;
    log(rows.rows[0].currency === 'ETB', `Wallet.currency == ETB (got ${rows.rows[0].currency})`);
  }
  const dupes = await db.query(
    `SELECT COUNT(*)::int AS n FROM player_core."Player" WHERE "supabaseUserId" = $1`,
    [userId],
  );
  log(dupes.rows[0].n === 1, `exactly one Player row for the user (got ${dupes.rows[0].n})`);
} catch (err) {
  log(false, `unexpected error: ${err.message}`);
} finally {
  // Cleanup: remove rows (FK-safe order) and the auth user
  try {
    if (playerId) {
      await db.query(`DELETE FROM player_core."PlayerWallet" WHERE "playerId" = $1`, [playerId]);
      await db.query(`DELETE FROM player_core."Player" WHERE id = $1`, [playerId]);
    }
    if (walletId) {
      await db.query(`DELETE FROM financial_ledger."Wallet" WHERE id = $1`, [walletId]);
    }
    await db.query(`DELETE FROM agent_network."Agent" WHERE id = $1`, [agentId]);
    await db.query(`DELETE FROM operator_domain."Operator" WHERE id = $1`, [operatorId]);
    await db.end().catch(() => {});
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log('\n# cleanup done (test user + seeded rows removed)');
  } catch (e) {
    console.log(`\n# cleanup WARNING: ${e.message}`);
  }
  console.log(`\n=== SMOKE ${pass ? 'PASSED' : 'FAILED'} ===`);
  process.exit(pass ? 0 : 1);
}
