import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { CommissionService } from '../commission/commission.service';
import { LedgerService } from '../ledger/ledger.service';
import { TransactionsService } from './transactions.service';

const D = (v: number | string) => new Prisma.Decimal(v);

const CLAIMED_DEPOSIT = {
  id: 't1',
  type: TransactionType.DEPOSIT,
  playerId: 'p1',
  agentId: 'a1',
  amount: D(1000),
  status: TransactionStatus.CLAIMED,
};

function build() {
  // The `db` client handed to each $transaction callback.
  const db = {
    transaction: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue(CLAIMED_DEPOSIT),
      create: jest.fn(),
    },
    chatThread: { upsert: jest.fn().mockResolvedValue({}) },
    notification: { create: jest.fn().mockResolvedValue({}) },
    playerWallet: {
      findUnique: jest.fn().mockResolvedValue({ walletId: 'w1' }),
    },
  };

  const prisma = {
    transaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    playerWallet: {
      findUnique: jest.fn().mockResolvedValue({ walletId: 'w1' }),
    },
    agentWallet: {
      findUnique: jest.fn().mockResolvedValue({ accountId: 'acc1' }),
    },
    $transaction: jest.fn((cb: (c: typeof db) => unknown) => cb(db)),
  };

  const ledger = {
    debitAgentCredit: jest.fn().mockResolvedValue({}),
    creditPlayerReal: jest.fn().mockResolvedValue({}),
    creditAgentCommission: jest.fn().mockResolvedValue({}),
    debitPlayerLocked: jest.fn().mockResolvedValue({}),
    creditAgentCredit: jest.fn().mockResolvedValue({}),
    lockPlayerWithdrawable: jest.fn().mockResolvedValue({}),
    unlockPlayerWithdrawable: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<LedgerService>;

  const commission = {
    computeAndLog: jest.fn().mockResolvedValue({
      amount: D(20),
      rateApplied: D('0.02'),
      capped: false,
    }),
  } as unknown as jest.Mocked<CommissionService>;

  const events = { emit: jest.fn() };

  const service = new TransactionsService(
    prisma as never,
    ledger,
    commission,
    events as never,
  );
  return { service, prisma, db, ledger, commission, events };
}

describe('TransactionsService', () => {
  describe('claim', () => {
    it('claims when the row is still PENDING and notifies the player', async () => {
      const { service, db, events } = build();
      await service.claim('a1', 't1');
      expect(db.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', status: TransactionStatus.PENDING },
        data: expect.objectContaining({
          status: TransactionStatus.CLAIMED,
          agentId: 'a1',
        }),
      });
      expect(db.chatThread.upsert).toHaveBeenCalled();
      expect(db.notification.create).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'transaction.claimed',
        expect.objectContaining({ transactionId: 't1', agentId: 'a1' }),
      );
    });

    it('throws ALREADY_CLAIMED when another agent won the race', async () => {
      const { service, db } = build();
      db.transaction.updateMany.mockResolvedValue({ count: 0 });
      db.transaction.findUnique.mockResolvedValue({ id: 't1' });
      await expect(service.claim('a2', 't1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('completeAndCredit (deposit)', () => {
    it('debits agent, credits player, books commission, notifies', async () => {
      const { service, prisma, ledger, commission, db, events } = build();
      prisma.transaction.findUnique.mockResolvedValue(CLAIMED_DEPOSIT);

      await service.completeAndCredit('a1', 't1');

      expect(ledger.debitAgentCredit).toHaveBeenCalled();
      expect(ledger.creditPlayerReal).toHaveBeenCalled();
      expect(commission.computeAndLog).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ type: 'DEPOSIT', base: D(1000) }),
      );
      expect(ledger.creditAgentCommission).toHaveBeenCalled();
      expect(db.notification.create).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'transaction.completed',
        expect.objectContaining({ transactionId: 't1' }),
      );
    });

    it('rejects when the agent does not own the transaction', async () => {
      const { service, prisma } = build();
      prisma.transaction.findUnique.mockResolvedValue(CLAIMED_DEPOSIT);
      await expect(service.completeAndCredit('other', 't1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects completing a non-claimed transaction', async () => {
      const { service, prisma } = build();
      prisma.transaction.findUnique.mockResolvedValue({
        ...CLAIMED_DEPOSIT,
        status: TransactionStatus.PENDING,
      });
      await expect(service.completeAndCredit('a1', 't1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('does not credit the player if the agent credit debit fails', async () => {
      const { service, prisma, ledger } = build();
      prisma.transaction.findUnique.mockResolvedValue(CLAIMED_DEPOSIT);
      (ledger.debitAgentCredit as jest.Mock).mockRejectedValue(
        new Error('INSUFFICIENT_AGENT_CREDIT'),
      );
      await expect(service.completeAndCredit('a1', 't1')).rejects.toThrow(
        'INSUFFICIENT_AGENT_CREDIT',
      );
      expect(ledger.creditPlayerReal).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('lets a player cancel their own PENDING request', async () => {
      const { service, prisma, db } = build();
      prisma.transaction.findUnique.mockResolvedValue({
        id: 't1',
        type: TransactionType.DEPOSIT,
        playerId: 'p1',
        agentId: null,
        amount: D(1000),
        status: TransactionStatus.PENDING,
      });
      db.transaction.findUniqueOrThrow.mockResolvedValue({ id: 't1' });
      await service.cancel({ id: 'p1', role: 'PLAYER' } as never, 't1');
      expect(db.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.CANCELLED },
      });
    });

    it("rejects cancelling another agent's transaction", async () => {
      const { service, prisma } = build();
      prisma.transaction.findUnique.mockResolvedValue({
        id: 't1',
        type: TransactionType.DEPOSIT,
        playerId: 'p1',
        agentId: 'a1',
        amount: D(1000),
        status: TransactionStatus.CLAIMED,
      });
      await expect(
        service.cancel({ id: 'a2', role: 'AGENT' } as never, 't1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
