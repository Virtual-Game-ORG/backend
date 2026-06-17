import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LedgerService } from '../ledger/ledger.service';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';

const D = (v: number | string) => new Prisma.Decimal(v);

const AGENT_FULL = {
  id: 'ag1',
  operatorId: 'op1',
  name: 'Agent A',
  phone: '0912345678',
  status: 'ACTIVE',
  createdAt: new Date('2026-01-01'),
  wallet: { account: { creditBalance: D(50000), commissionBalance: D(0) } },
  commissionConfig: {
    claimCommissionRate: D('0.02'),
    depositCommissionRate: D('0.02'),
    withdrawalCommissionRate: D('0'),
    playerLossBonusRate: D('0.05'),
    dailyCapAmount: null,
    weeklyCapAmount: null,
    claimEnabled: true,
    depositEnabled: true,
    withdrawalEnabled: true,
    playerLossEnabled: true,
  },
};

function build() {
  const tx = {
    agentAccount: { create: jest.fn().mockResolvedValue({ id: 'acc1' }) },
    agent: {
      create: jest.fn().mockResolvedValue({ id: 'ag1' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(AGENT_FULL),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    agentWallet: { create: jest.fn().mockResolvedValue({}) },
    commissionConfig: { create: jest.fn().mockResolvedValue({}) },
    player: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: jest.fn((cb: (c: typeof tx) => unknown) => cb(tx)),
    agent: {
      findMany: jest.fn().mockResolvedValue([AGENT_FULL]),
      findFirst: jest.fn().mockResolvedValue(AGENT_FULL),
    },
  };
  const admin = {
    createUser: jest
      .fn()
      .mockResolvedValue({ data: { user: { id: 'sb-1' } }, error: null }),
    updateUserById: jest.fn().mockResolvedValue({}),
    deleteUser: jest.fn().mockResolvedValue({}),
  };
  const supabase = { admin: { auth: { admin } } };
  const ledger = {
    applyMovement: jest.fn().mockResolvedValue({ balanceAfter: D(50000) }),
  } as unknown as jest.Mocked<LedgerService>;

  const service = new AgentsService(prisma as never, supabase as never, ledger);
  return { service, prisma, tx, admin, ledger };
}

const dto: CreateAgentDto = {
  name: 'Agent A',
  phone: '0912345678',
  password: 'secret123',
  depositCommissionRate: '0.02',
  playerLossBonusRate: '0.05',
  initialCredit: '50000',
};

describe('AgentsService', () => {
  describe('createAgent', () => {
    it('creates the auth user, records, and routes initial credit through the ledger', async () => {
      const { service, tx, admin, ledger } = build();
      const view = await service.createAgent('op1', dto);

      expect(admin.createUser).toHaveBeenCalledTimes(1);
      expect(tx.agentAccount.create).toHaveBeenCalled();
      expect(tx.agent.create).toHaveBeenCalled();
      expect(tx.agentWallet.create).toHaveBeenCalled();
      expect(tx.commissionConfig.create).toHaveBeenCalled();
      // Initial credit is booked via the ledger, not a raw balance write.
      expect(ledger.applyMovement).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          accountKind: 'AGENT_CREDIT',
          direction: 'CREDIT',
          reason: 'INITIAL_CREDIT',
          actorType: 'OPERATOR',
        }),
      );
      expect(admin.updateUserById).toHaveBeenCalledWith('sb-1', {
        app_metadata: { platform_role: 'AGENT', platform_id: 'ag1' },
      });
      expect(view.creditBalance).toBe('50000.00');
    });

    it('skips the ledger movement when no initial credit is given', async () => {
      const { service, ledger } = build();
      await service.createAgent('op1', { ...dto, initialCredit: undefined });
      expect(ledger.applyMovement).not.toHaveBeenCalled();
    });

    it('deletes the orphan auth user if the DB transaction fails', async () => {
      const { service, prisma, admin } = build();
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error('db down'),
      );
      await expect(service.createAgent('op1', dto)).rejects.toThrow('db down');
      expect(admin.deleteUser).toHaveBeenCalledWith('sb-1');
    });

    it('maps a duplicate Supabase identity to 409 without touching the DB', async () => {
      const { service, prisma, admin } = build();
      admin.createUser.mockResolvedValue({
        data: { user: null },
        error: { status: 422, message: 'already registered' },
      });
      await expect(service.createAgent('op1', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(admin.deleteUser).not.toHaveBeenCalled();
    });
  });

  describe('setStatus', () => {
    it("rejects when the agent isn't owned by the operator", async () => {
      const { service, tx } = build();
      tx.agent.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.setStatus('op1', 'ag1', 'SUSPENDED'),
      ).rejects.toThrow(NotFoundException);
      expect(tx.player.updateMany).not.toHaveBeenCalled();
    });

    it('spreads the suspended agent players evenly across active agents', async () => {
      const { service, tx } = build();
      tx.agent.findMany.mockResolvedValue([{ id: 'ag2' }, { id: 'ag3' }]);
      tx.player.findMany.mockResolvedValue([
        { id: 'p1' },
        { id: 'p2' },
        { id: 'p3' },
      ]);

      await service.setStatus('op1', 'ag1', 'SUSPENDED');

      // Round-robin: ag2 ← p1,p3 ; ag3 ← p2.
      expect(tx.player.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['p1', 'p3'] } },
        data: { agentId: 'ag2' },
      });
      expect(tx.player.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['p2'] } },
        data: { agentId: 'ag3' },
      });
    });

    it('suspends without reassigning when there are no other active agents', async () => {
      const { service, tx } = build();
      tx.agent.findMany.mockResolvedValue([]);
      tx.player.findMany.mockResolvedValue([{ id: 'p1' }]);

      await service.setStatus('op1', 'ag1', 'SUSPENDED');

      expect(tx.player.findMany).not.toHaveBeenCalled();
      expect(tx.player.updateMany).not.toHaveBeenCalled();
    });

    it('does not reassign players when activating an agent', async () => {
      const { service, tx } = build();
      await service.setStatus('op1', 'ag1', 'ACTIVE');
      expect(tx.agent.findMany).not.toHaveBeenCalled();
      expect(tx.player.updateMany).not.toHaveBeenCalled();
    });
  });
});
