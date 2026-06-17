/**
 * Scenario seed — phase 1: identities only (operator, agents, players).
 *
 * Boots a Nest application context (like seed-operator.ts) and drives the real
 * service layer so every record is produced exactly the way the running API
 * would produce it.
 *
 * What it seeds:
 *   - 1 top-level Operator (idempotent — keyed by a stable email, reused)
 *   - Agents: funded+active, suspended, commission-disabled
 *   - Players referred by the funded agent
 *
 * (Transactions, credit requests, chat, games and bets are deferred to a later
 * phase.)
 *
 * Each run is namespaced by a unique tag so agent/player Supabase identities
 * never collide; re-running accumulates fresh identities. The Operator is keyed
 * by a stable email and reused.
 *
 * Usage:
 *   npm run seed:scenarios -- [--email ops@example.com] [--password '...']
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/infrastructure/supabase/supabase.service';
import { OperatorsService } from '../src/features/operators/operators.service';
import { AgentsService } from '../src/features/agents/agents.service';
import { AuthService } from '../src/features/auth/auth.service';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Unique per run so Supabase identities never collide across re-runs.
const TAG = Date.now().toString(36);
const DEFAULT_PASSWORD = 'Seed-Passw0rd!';

// Phones must be unique per run too (Supabase rejects duplicate identities).
// Build a valid ET E.164 number: +251 followed by 9 digits starting with 9.
const PHONE_SEED = 900000000 + (Date.now() % 90000000);
const phoneFor = (i: number): string => `+251${PHONE_SEED + i}`;

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

async function main(): Promise<void> {
  const operatorEmail = arg('--email') ?? 'ops@seed.local';
  const operatorPassword = arg('--password') ?? DEFAULT_PASSWORD;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const supabase = app.get(SupabaseService);
  const operators = app.get(OperatorsService);
  const agents = app.get(AgentsService);
  const auth = app.get(AuthService);

  async function findUserIdByEmail(email: string): Promise<string | undefined> {
    const { data, error } = await supabase.admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    return data.users.find((u) => u.email === email)?.id;
  }

  async function ensureAuthUser(
    email: string,
    password: string,
  ): Promise<string> {
    const existing = await findUserIdByEmail(email);
    if (existing) return existing;
    const { data, error } = await supabase.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`createUser(${email}) failed: ${error?.message}`);
    }
    return data.user.id;
  }

  try {
    log(`\n=== Seeding identities (tag=${TAG}) ===\n`);

    // ---- Operator (idempotent) --------------------------------------------
    const operatorUserId = await ensureAuthUser(operatorEmail, operatorPassword);
    const operator = await operators.provisionOperator({
      supabaseUserId: operatorUserId,
      name: 'Main Operator',
    });
    log(`Operator: ${operator.id} (${operatorEmail})`);

    // ---- Agents ------------------------------------------------------------
    // Funded + active: commissions on, generous float.
    const fundedAgent = await agents.createAgent(operator.id, {
      name: `Funded Agent ${TAG}`,
      phone: phoneFor(0),
      password: DEFAULT_PASSWORD,
      email: `agent-funded-${TAG}@seed.local`,
      claimCommissionRate: '0.01',
      depositCommissionRate: '0.02',
      withdrawalCommissionRate: '0.015',
      playerLossBonusRate: '0.05',
      dailyCapAmount: '5000',
      weeklyCapAmount: '20000',
      initialCredit: '100000',
    });
    log(`Agent (funded/active): ${fundedAgent.id}`);

    // Suspended agent — exercises the SUSPENDED status path.
    const suspendedAgent = await agents.createAgent(operator.id, {
      name: `Suspended Agent ${TAG}`,
      phone: phoneFor(1),
      password: DEFAULT_PASSWORD,
      email: `agent-suspended-${TAG}@seed.local`,
      initialCredit: '10000',
    });
    await agents.setStatus(operator.id, suspendedAgent.id, 'SUSPENDED');
    log(`Agent (suspended): ${suspendedAgent.id}`);

    // Commission-disabled agent.
    const noCommAgent = await agents.createAgent(operator.id, {
      name: `No-Commission Agent ${TAG}`,
      phone: phoneFor(2),
      password: DEFAULT_PASSWORD,
      email: `agent-nocomm-${TAG}@seed.local`,
      initialCredit: '50000',
      claimEnabled: false,
      depositEnabled: false,
      withdrawalEnabled: false,
      playerLossEnabled: false,
    });
    log(`Agent (commission-disabled): ${noCommAgent.id}`);

    // ---- Players (referred by the funded agent) ---------------------------
    async function makePlayer(label: string): Promise<string> {
      const email = `player-${label}-${TAG}@seed.local`;
      const uid = await ensureAuthUser(email, DEFAULT_PASSWORD);
      const player = await auth.provision(uid, { agentId: fundedAgent.id });
      return player.id;
    }

    const playerIds: string[] = [];
    for (const label of ['alpha', 'bravo', 'charlie', 'delta']) {
      playerIds.push(await makePlayer(label));
    }
    log(`Players: ${playerIds.length} provisioned under funded agent`);

    log(`\n=== Done. Tag: ${TAG} ===\n`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
