/**
 * Scenario seed — phase 1: identities + suspension reassignment demo.
 *
 * Boots a Nest application context (like seed-operator.ts) and drives the real
 * service layer so every record is produced exactly the way the running API
 * would produce it.
 *
 * What it seeds:
 *   - 1 top-level Operator (idempotent — keyed by a stable email, reused)
 *   - Active agents: funded, commission-disabled
 *   - Players under the funded agent
 *   - A "departing" agent WITH its own players, which is then suspended to
 *     demonstrate that its players are reassigned across the active agents.
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
import { PrismaService } from '../src/database/prisma.service';
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

  const prisma = app.get(PrismaService);
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

  async function makePlayer(label: string, agentId: string): Promise<string> {
    const email = `player-${label}-${TAG}@seed.local`;
    const uid = await ensureAuthUser(email, DEFAULT_PASSWORD);
    const player = await auth.provision(uid, { agentId });
    return player.id;
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

    // ---- Active agents (the reassignment targets) -------------------------
    const fundedAgent = await agents.createAgent(operator.id, {
      name: `Funded Agent ${TAG}`,
      phone: phoneFor(0),
      password: DEFAULT_PASSWORD,
      email: `agent-funded-${TAG}@seed.local`,
      claimCommissionRate: '0.01',
      depositCommissionRate: '0.02',
      withdrawalCommissionRate: '0.015',
      playerLossBonusRate: '0.05',
      initialCredit: '100000',
    });
    log(`Agent (funded/active): ${fundedAgent.id}`);

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
    log(`Agent (commission-disabled/active): ${noCommAgent.id}`);

    // A couple of players that already belong to the funded agent.
    await makePlayer('alpha', fundedAgent.id);
    await makePlayer('bravo', fundedAgent.id);

    // ---- Suspension reassignment demo -------------------------------------
    // Create an agent that owns players, then suspend it and watch its players
    // get spread across the operator's active agents (funded + no-commission).
    const departingAgent = await agents.createAgent(operator.id, {
      name: `Departing Agent ${TAG}`,
      phone: phoneFor(1),
      password: DEFAULT_PASSWORD,
      email: `agent-departing-${TAG}@seed.local`,
      initialCredit: '10000',
    });
    log(`\nAgent (to be suspended): ${departingAgent.id}`);

    const departingPlayers: string[] = [];
    for (const label of ['charlie', 'delta', 'echo', 'foxtrot']) {
      departingPlayers.push(await makePlayer(label, departingAgent.id));
    }
    log(`  provisioned ${departingPlayers.length} players under it`);

    log(`  suspending ${departingAgent.id} ...`);
    await agents.setStatus(operator.id, departingAgent.id, 'SUSPENDED');

    // Report where each player landed, resolving the new agent's name from the
    // DB. Players spread across ALL the operator's active agents — including any
    // left over from previous seed runs (the operator is reused across runs).
    log(`  reassignment result:`);
    for (const id of departingPlayers) {
      const p = await prisma.player.findUnique({ where: { id } });
      const newAgent = p
        ? await prisma.agent.findUnique({ where: { id: p.agentId } })
        : null;
      const tag =
        newAgent?.id === departingAgent.id
          ? ' (still on suspended agent — no active target!)'
          : '';
      log(`    player ${id} -> ${newAgent?.name ?? p?.agentId ?? '?'}${tag}`);
    }

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
