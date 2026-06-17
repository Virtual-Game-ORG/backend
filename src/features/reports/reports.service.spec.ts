import { Prisma } from '@prisma/client';
import { ReportsService } from './reports.service';

const D = (v: number | string) => new Prisma.Decimal(v);

describe('ReportsService', () => {
  describe('platformSummary', () => {
    it('coalesces null sums to 0.00 and computes house revenue = stake - payout', async () => {
      const prisma = {
        transaction: {
          aggregate: jest
            .fn()
            // deposits/withdrawals for each of 3 periods (6 calls); alternate
            .mockResolvedValue({ _sum: { amount: null }, _count: 0 }),
          count: jest.fn().mockResolvedValue(0),
        },
        commissionLog: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        bet: {
          aggregate: jest
            .fn()
            .mockResolvedValue({ _sum: { stake: D(1000), payout: D(300) } }),
        },
        agent: { count: jest.fn().mockResolvedValue(2) },
        player: { count: jest.fn().mockResolvedValue(5) },
      };
      const service = new ReportsService(prisma as never);
      const summary = await service.platformSummary();

      expect(summary.today.depositVolume).toBe('0.00');
      expect(summary.today.houseRevenue).toBe('700.00');
      expect(summary.totals).toEqual({
        pendingCount: 0,
        completedCount: 0,
        agentCount: 2,
        playerCount: 5,
      });
    });
  });

  describe('agentPerformance', () => {
    it('stitches groupBy results, defaults missing agents to 0, sorts by volume desc, applies take', async () => {
      const prisma = {
        agent: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'a1',
              name: 'Low',
              status: 'ACTIVE',
              wallet: {
                account: { creditBalance: D(100), commissionBalance: D(5) },
              },
            },
            {
              id: 'a2',
              name: 'High',
              status: 'ACTIVE',
              wallet: {
                account: { creditBalance: D(200), commissionBalance: D(50) },
              },
            },
            { id: 'a3', name: 'None', status: 'ACTIVE', wallet: null },
          ]),
        },
        transaction: {
          groupBy: jest.fn().mockResolvedValue([
            { agentId: 'a1', _sum: { amount: D(1000) }, _count: 3 },
            { agentId: 'a2', _sum: { amount: D(9000) }, _count: 12 },
          ]),
        },
        commissionLog: {
          groupBy: jest
            .fn()
            .mockResolvedValue([{ agentId: 'a2', _sum: { amount: D(180) } }]),
        },
        player: {
          groupBy: jest.fn().mockResolvedValue([{ agentId: 'a2', _count: 7 }]),
        },
      };
      const service = new ReportsService(prisma as never);
      const rows = await service.agentPerformance({ period: 'all', take: 2 });

      expect(rows).toHaveLength(2);
      // Highest volume first.
      expect(rows[0].agentId).toBe('a2');
      expect(rows[0].volume).toBe('9000.00');
      expect(rows[0].commissionPaid).toBe('180.00');
      expect(rows[0].activePlayers).toBe(7);
      expect(rows[1].agentId).toBe('a1');
      // 'a3' (no activity) is dropped by take=2, but would default to 0s.
      expect(rows.find((r) => r.agentId === 'a3')).toBeUndefined();
    });

    it('defaults an agent with no activity to zeroes', async () => {
      const prisma = {
        agent: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'a3', name: 'None', status: 'ACTIVE', wallet: null },
            ]),
        },
        transaction: { groupBy: jest.fn().mockResolvedValue([]) },
        commissionLog: { groupBy: jest.fn().mockResolvedValue([]) },
        player: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      const service = new ReportsService(prisma as never);
      const [row] = await service.agentPerformance({ period: 'all', take: 20 });
      expect(row).toMatchObject({
        volume: '0.00',
        transactionsProcessed: 0,
        commissionPaid: '0.00',
        activePlayers: 0,
        creditBalance: '0.00',
      });
    });
  });

  describe('auditLog', () => {
    it('passes filters through and formats amounts', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'le1',
          accountKind: 'AGENT_CREDIT',
          ownerId: 'ag1',
          direction: 'DEBIT',
          amount: D('1000'),
          balanceAfter: D('4000'),
          currency: 'ETB',
          refType: 'TRANSACTION',
          refId: 't1',
          reason: null,
          actorType: 'AGENT',
          actorId: 'ag1',
          createdAt: new Date('2026-01-01'),
        },
      ]);
      const prisma = { ledgerEntry: { findMany } };
      const service = new ReportsService(prisma as never);
      const entries = await service.auditLog({
        refType: 'TRANSACTION',
        take: 50,
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ refType: 'TRANSACTION' }),
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(entries[0]).toMatchObject({
        amount: '1000.00',
        balanceAfter: '4000.00',
      });
    });
  });
});
