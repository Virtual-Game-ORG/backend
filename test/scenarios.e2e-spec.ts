/**
 * Scenario tests for the end-to-end flows described in architecture.md.
 *
 * These wire the REAL services together (Ledger, Commission, Transactions,
 * CreditRequests, Betting, Auth, Operators, Agents, Wallet, Chat) over a shared
 * in-memory Prisma double, then drive each architecture flow and assert the
 * actual money/commission/status outcomes — not just that methods were called.
 *
 *   Flow 1: Player Deposits Credit            (architecture.md §"Flow 1")
 *   Flow 2: Player Withdraws Credit           (architecture.md §"Flow 2")
 *   Flow 3: Agent Requests Credit Top-Up      (architecture.md §"Flow 3")
 *   Flow 4: Player Loss → Agent Commission    (architecture.md §"Flow 4")
 *   + Claim locking (concurrency protection)  (architecture.md §"Claim Locking")
 *   + Bet settlement outcomes (WON / VOID)    (architecture.md §"Betting System")
 */
import { ConflictException } from '@nestjs/common';
import { BetType, PaymentMethod, Prisma } from '@prisma/client';
import { createInMemoryPrisma } from './in-memory-prisma';
import { LedgerService } from '../src/features/ledger/ledger.service';
import { CommissionService } from '../src/features/commission/commission.service';
import { OperatorsService } from '../src/features/operators/operators.service';
import { AgentsService } from '../src/features/agents/agents.service';
import { AuthService } from '../src/features/auth/auth.service';
import { TransactionsService } from '../src/features/transactions/transactions.service';
import { CreditRequestsService } from '../src/features/credit-requests/credit-requests.service';
import { BettingService } from '../src/features/betting/betting.service';
import { ChatService } from '../src/features/messaging/chat.service';
import { WalletService } from '../src/features/wallet/wallet.service';
import type { CreateAgentDto } from '../src/features/agents/dto/create-agent.dto';

const Dec = Prisma.Decimal;

function makeSupabase(): any {
  let n = 0;
  const adminApi = {
    createUser: () => Promise.resolve({ data: { user: { id: `sb_${++n}` } }, error: null }),
    updateUserById: () => Promise.resolve({ data: {}, error: null }),
    deleteUser: () => Promise.resolve({ data: {}, error: null }),
    listUsers: () => Promise.resolve({ data: { users: [] }, error: null }),
  };
  return { admin: { auth: { admin: adminApi } } };
}

function harness() {
  const prisma = createInMemoryPrisma();
  const supabase = makeSupabase();
  const events = { emit: jest.fn() } as any;

  const ledger = new LedgerService();
  const commission = new CommissionService();
  const operators = new OperatorsService(prisma, supabase);
  const agents = new AgentsService(prisma, supabase, ledger);
  const auth = new AuthService(prisma, supabase);
  const transactions = new TransactionsService(prisma, ledger, commission, events);
  const creditRequests = new CreditRequestsService(prisma, ledger, events);
  const betting = new BettingService(prisma, ledger, commission, events);
  const chat = new ChatService(prisma);
  const wallet = new WalletService(prisma);

  let pc = 0;

  const helpers = {
    async operator(name = 'Operator') {
      return operators.provisionOperator({ supabaseUserId: `op_${name}`, name });
    },
    async agent(operatorId: string, dto: Partial<CreateAgentDto> = {}) {
      return agents.createAgent(operatorId, {
        name: 'Agent',
        phone: `+25191${Date.now()}`,
        password: 'pw',
        ...dto,
      } as CreateAgentDto);
    },
    async player(agentId: string) {
      const p = await auth.provision(`pl_${++pc}`, { agentId });
      return p.id;
    },
    /** Seed a player's real+withdrawable balance directly (no deposit noise). */
    async fund(playerId: string, amount: string) {
      const link = await prisma.playerWallet.findUnique({ where: { playerId } });
      await prisma.wallet.update({
        where: { id: link.walletId },
        data: {
          balance: { increment: new Dec(amount) },
          withdrawableBalance: { increment: new Dec(amount) },
        },
      });
    },
    async game(minBet = '10', maxBet = '100000') {
      const g = await prisma.game.create({
        data: {
          providerId: 'prov',
          code: 'G1',
          name: 'Test Game',
          category: 'FOOTBALL',
          minBet: new Dec(minBet),
          maxBet: new Dec(maxBet),
          enabled: true,
        },
      });
      return g.id as string;
    },
    async agentAccount(agentId: string) {
      const link = await prisma.agentWallet.findUnique({ where: { agentId } });
      return prisma.agentAccount.findUnique({ where: { id: link.accountId } });
    },
    async operatorAccount(operatorId: string) {
      const link = await prisma.operatorWallet.findUnique({ where: { operatorId } });
      return prisma.operatorAccount.findUnique({ where: { id: link.accountId } });
    },
  };

  return {
    prisma,
    operators,
    agents,
    auth,
    transactions,
    creditRequests,
    betting,
    chat,
    wallet,
    helpers,
  };
}

describe('Architecture scenarios', () => {
  // ---- Flow 1: Player Deposits Credit -------------------------------------
  it('Flow 1 — deposit: debits agent float, credits player, books commission', async () => {
    const h = harness();
    const op = await h.helpers.operator();
    const agent = await h.helpers.agent(op.id, {
      depositCommissionRate: '0.02', // 2% deposit commission
      initialCredit: '100000',
    });
    const player = await h.helpers.player(agent.id);

    const dep = await h.transactions.createDeposit(player, {
      amount: '1000',
      paymentMethod: PaymentMethod.TELEBIRR,
      playerPhone: '+251911000000',
      zplayPhone: '+251922000000',
    });
    await h.transactions.claim(agent.id, dep.id);
    const done = await h.transactions.completeAndCredit(agent.id, dep.id);

    expect(done.status).toBe('COMPLETED');

    // Player credited 1000 (deposited cash is withdrawable).
    const w = await h.wallet.getPlayerWallet(player);
    expect(w.total).toBe('1000.00');
    expect(w.withdrawable).toBe('1000.00');

    // Agent float down 1000, commission up 2% = 20.
    const acc = await h.helpers.agentAccount(agent.id);
    expect(acc.creditBalance.toFixed(2)).toBe('99000.00');
    expect(acc.commissionBalance.toFixed(2)).toBe('20.00');
  });

  // ---- Flow 2: Player Withdraws Credit ------------------------------------
  it('Flow 2 — withdrawal: locks then settles, reimbursing the agent float', async () => {
    const h = harness();
    const op = await h.helpers.operator();
    const agent = await h.helpers.agent(op.id, {
      withdrawalCommissionRate: '0.015', // 1.5%
      initialCredit: '100000',
    });
    const player = await h.helpers.player(agent.id);
    await h.helpers.fund(player, '5000');

    const wd = await h.transactions.createWithdrawal(player, {
      amount: '1000',
      paymentMethod: PaymentMethod.CBE_BIRR,
      playerPhone: '+251911000010',
    });

    // On request the funds are locked (still in total, out of withdrawable).
    let w = await h.wallet.getPlayerWallet(player);
    expect(w.total).toBe('5000.00');
    expect(w.withdrawable).toBe('4000.00');
    expect(w.locked).toBe('1000.00');

    await h.transactions.claim(agent.id, wd.id);
    const done = await h.transactions.completeAndCredit(agent.id, wd.id);
    expect(done.status).toBe('COMPLETED');

    // Player balance drops by 1000, lock cleared.
    w = await h.wallet.getPlayerWallet(player);
    expect(w.total).toBe('4000.00');
    expect(w.withdrawable).toBe('4000.00');
    expect(w.locked).toBe('0.00');

    // Agent float reimbursed (+1000), commission up 1.5% = 15.
    const acc = await h.helpers.agentAccount(agent.id);
    expect(acc.creditBalance.toFixed(2)).toBe('101000.00');
    expect(acc.commissionBalance.toFixed(2)).toBe('15.00');
  });

  // ---- Flow 3: Agent Requests Credit Top-Up from Operator -----------------
  it('Flow 3 — credit top-up: operator funds the agent float (operator may go negative)', async () => {
    const h = harness();
    const op = await h.helpers.operator();
    const agent = await h.helpers.agent(op.id); // no initial credit

    const req = await h.creditRequests.createRequest(agent.id, {
      amount: '50000',
      paymentMethod: PaymentMethod.TELEBIRR,
    });
    await h.creditRequests.claim(op.id, req.id);
    const done = await h.creditRequests.completeAndCredit(op.id, req.id);
    expect(done.status).toBe('COMPLETED');

    // Agent float credited; operator account debited (credit in circulation).
    const agentAcc = await h.helpers.agentAccount(agent.id);
    expect(agentAcc.creditBalance.toFixed(2)).toBe('50000.00');
    const opAcc = await h.helpers.operatorAccount(op.id);
    expect(opAcc.creditBalance.toFixed(2)).toBe('-50000.00');
  });

  // ---- Flow 4: Player Loss → Agent Commission Bonus -----------------------
  it('Flow 4 — player loss: agent earns the configured loss-bonus on the stake', async () => {
    const h = harness();
    const op = await h.helpers.operator();
    const agent = await h.helpers.agent(op.id, { playerLossBonusRate: '0.05' }); // 5%
    const player = await h.helpers.player(agent.id);
    await h.helpers.fund(player, '1000');
    const gameId = await h.helpers.game();

    const bet = await h.betting.placeBet(player, {
      gameId,
      type: BetType.SINGLE,
      stake: '500',
      selections: [{ marketName: '1X2', selectionName: 'Home', odds: '2.0' }],
    });

    // Stake debited up front.
    let w = await h.wallet.getPlayerWallet(player);
    expect(w.total).toBe('500.00');

    const settled = await h.betting.settle(op.id, bet.id, { result: 'LOST' });
    expect(settled.status).toBe('LOST');
    expect(settled.selections[0].result).toBe('LOST');

    // Loss leaves the player as-is; agent earns 5% of the 500 stake = 25.
    w = await h.wallet.getPlayerWallet(player);
    expect(w.total).toBe('500.00');
    const acc = await h.helpers.agentAccount(agent.id);
    expect(acc.commissionBalance.toFixed(2)).toBe('25.00');
  });

  // ---- Claim locking (concurrency protection) -----------------------------
  it('Claim locking — a second agent cannot claim an already-claimed transaction', async () => {
    const h = harness();
    const op = await h.helpers.operator();
    const a1 = await h.helpers.agent(op.id, { initialCredit: '10000' });
    const a2 = await h.helpers.agent(op.id, { initialCredit: '10000' });
    const player = await h.helpers.player(a1.id);

    const dep = await h.transactions.createDeposit(player, {
      amount: '1000',
      paymentMethod: PaymentMethod.EBIRR,
      playerPhone: '+251911000020',
      zplayPhone: '+251922000020',
    });

    await h.transactions.claim(a1.id, dep.id);
    await expect(h.transactions.claim(a2.id, dep.id)).rejects.toThrow(ConflictException);
  });

  // ---- Bet settlement outcomes (WON / VOID) -------------------------------
  it('Bet WON — player is paid the potential return', async () => {
    const h = harness();
    const op = await h.helpers.operator();
    const agent = await h.helpers.agent(op.id);
    const player = await h.helpers.player(agent.id);
    await h.helpers.fund(player, '1000');
    const gameId = await h.helpers.game();

    const bet = await h.betting.placeBet(player, {
      gameId,
      type: BetType.SINGLE,
      stake: '200',
      selections: [{ marketName: '1X2', selectionName: 'Home', odds: '2.0' }],
    });
    await h.betting.settle(op.id, bet.id, { result: 'WON' });

    // 1000 - 200 stake + 400 payout (200 * 2.0) = 1200.
    const w = await h.wallet.getPlayerWallet(player);
    expect(w.total).toBe('1200.00');
  });

  it('Bet VOID — the stake is refunded', async () => {
    const h = harness();
    const op = await h.helpers.operator();
    const agent = await h.helpers.agent(op.id);
    const player = await h.helpers.player(agent.id);
    await h.helpers.fund(player, '1000');
    const gameId = await h.helpers.game();

    const bet = await h.betting.placeBet(player, {
      gameId,
      type: BetType.SINGLE,
      stake: '200',
      selections: [{ marketName: '1X2', selectionName: 'Home', odds: '3.0' }],
    });
    await h.betting.settle(op.id, bet.id, { result: 'VOID' });

    const w = await h.wallet.getPlayerWallet(player);
    expect(w.total).toBe('1000.00');
  });
});
