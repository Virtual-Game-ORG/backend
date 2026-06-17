import { Prisma } from '@prisma/client';
import { CommissionService } from './commission.service';

const D = (v: number | string) => new Prisma.Decimal(v);

function mockTx(config: unknown, priorSum: Prisma.Decimal | null = null) {
  return {
    commissionConfig: { findUnique: jest.fn().mockResolvedValue(config) },
    commissionLog: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: priorSum } }),
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
  };
}

const baseConfig = {
  agentId: 'a1',
  claimCommissionRate: D(0),
  depositCommissionRate: D('0.02'),
  withdrawalCommissionRate: D('0.01'),
  playerLossBonusRate: D('0.05'),
  minOdds: null,
  dailyCapAmount: null,
  weeklyCapAmount: null,
  claimEnabled: true,
  depositEnabled: true,
  withdrawalEnabled: true,
  playerLossEnabled: true,
};

describe('CommissionService', () => {
  const service = new CommissionService();

  describe('calc', () => {
    it('applies the rate as a fraction', () => {
      expect(service.calc(D(1000), D('0.02')).toString()).toBe('20');
    });
  });

  describe('computeAndLog', () => {
    const input = { agentId: 'a1', type: 'DEPOSIT' as const, base: D(1000) };

    it('returns zero and writes nothing when no config exists', async () => {
      const tx = mockTx(null);
      const res = await service.computeAndLog(tx as never, input);
      expect(res.amount.toNumber()).toBe(0);
      expect(tx.commissionLog.create).not.toHaveBeenCalled();
    });

    it('returns zero and writes nothing when the type is disabled', async () => {
      const tx = mockTx({ ...baseConfig, depositEnabled: false });
      const res = await service.computeAndLog(tx as never, input);
      expect(res.amount.toNumber()).toBe(0);
      expect(tx.commissionLog.create).not.toHaveBeenCalled();
    });

    it('computes 2% and logs it', async () => {
      const tx = mockTx(baseConfig);
      const res = await service.computeAndLog(tx as never, input);
      expect(res.amount.toNumber()).toBe(20);
      expect(res.capped).toBe(false);
      expect(tx.commissionLog.create).toHaveBeenCalledTimes(1);
    });

    it('clamps to the daily cap remaining', async () => {
      // cap 25, already used 10 → only 15 of the 20 raw is allowed.
      const tx = mockTx({ ...baseConfig, dailyCapAmount: D(25) }, D(10));
      const res = await service.computeAndLog(tx as never, input);
      expect(res.amount.toNumber()).toBe(15);
      expect(res.capped).toBe(true);
      expect(tx.commissionLog.create).toHaveBeenCalledTimes(1);
    });

    it('clamps to zero and writes nothing once the cap is exhausted', async () => {
      const tx = mockTx({ ...baseConfig, dailyCapAmount: D(20) }, D(20));
      const res = await service.computeAndLog(tx as never, input);
      expect(res.amount.toNumber()).toBe(0);
      expect(res.capped).toBe(true);
      expect(tx.commissionLog.create).not.toHaveBeenCalled();
    });

    it('records betId on the CommissionLog for player-loss bonuses', async () => {
      const tx = mockTx(baseConfig);
      await service.computeAndLog(tx as never, {
        agentId: 'a1',
        playerId: 'p1',
        betId: 'b1',
        type: 'PLAYER_LOSS' as const,
        base: D(500),
      });
      expect(tx.commissionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ betId: 'b1', type: 'PLAYER_LOSS' }),
      });
    });
  });
});
