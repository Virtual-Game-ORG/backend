import { ConflictException, ForbiddenException } from '@nestjs/common';
import { CreditRequestStatus, Prisma } from '@prisma/client';
import { LedgerService } from '../ledger/ledger.service';
import { CreditRequestsService } from './credit-requests.service';

const D = (v: number | string) => new Prisma.Decimal(v);

const CLAIMED = {
  id: 'cr1',
  agentId: 'ag1',
  operatorId: 'op1',
  amount: D(50000),
  status: CreditRequestStatus.CLAIMED,
};

function build() {
  const db = {
    agentCreditRequest: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(CLAIMED),
    },
    notification: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    agentCreditRequest: {
      create: jest.fn().mockResolvedValue({ id: 'cr1', agentId: 'ag1' }),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue(CLAIMED),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    agentWallet: {
      findUnique: jest.fn().mockResolvedValue({ accountId: 'aAcc' }),
    },
    operatorWallet: {
      findUnique: jest.fn().mockResolvedValue({ accountId: 'oAcc' }),
    },
    $transaction: jest.fn((cb: (c: typeof db) => unknown) => cb(db)),
  };
  const ledger = {
    applyMovement: jest.fn().mockResolvedValue({ balanceAfter: D(0) }),
  } as unknown as jest.Mocked<LedgerService>;
  const events = { emit: jest.fn() };
  const service = new CreditRequestsService(
    prisma as never,
    ledger,
    events as never,
  );
  return { service, prisma, db, ledger, events };
}

describe('CreditRequestsService', () => {
  describe('claim', () => {
    it('claims a PENDING request owned by the operator', async () => {
      const { service, prisma, db, events } = build();
      prisma.agentCreditRequest.findUnique.mockResolvedValue({
        id: 'cr1',
        agent: { operatorId: 'op1' },
      });
      await service.claim('op1', 'cr1');
      expect(db.agentCreditRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'cr1', status: CreditRequestStatus.PENDING },
        data: expect.objectContaining({
          status: CreditRequestStatus.CLAIMED,
          operatorId: 'op1',
        }),
      });
      expect(events.emit).toHaveBeenCalledWith(
        'credit_request.claimed',
        expect.objectContaining({ requestId: 'cr1', operatorId: 'op1' }),
      );
    });

    it('rejects claiming a request from another operator', async () => {
      const { service, prisma } = build();
      prisma.agentCreditRequest.findUnique.mockResolvedValue({
        id: 'cr1',
        agent: { operatorId: 'other-op' },
      });
      await expect(service.claim('op1', 'cr1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ALREADY_CLAIMED when the row is no longer PENDING', async () => {
      const { service, prisma, db } = build();
      prisma.agentCreditRequest.findUnique.mockResolvedValue({
        id: 'cr1',
        agent: { operatorId: 'op1' },
      });
      db.agentCreditRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.claim('op1', 'cr1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('completeAndCredit', () => {
    it('books the operator-debit + agent-credit ledger pair and notifies', async () => {
      const { service, prisma, db, ledger, events } = build();
      prisma.agentCreditRequest.findUnique.mockResolvedValue(CLAIMED);

      await service.completeAndCredit('op1', 'cr1');

      expect(ledger.applyMovement).toHaveBeenCalledTimes(2);
      expect(ledger.applyMovement).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          accountKind: 'OPERATOR',
          direction: 'DEBIT',
        }),
      );
      expect(ledger.applyMovement).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          accountKind: 'AGENT_CREDIT',
          direction: 'CREDIT',
        }),
      );
      expect(db.notification.create).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'credit_request.completed',
        expect.objectContaining({ requestId: 'cr1', amount: '50000.00' }),
      );
    });

    it('rejects completing a foreign operator request', async () => {
      const { service, prisma } = build();
      prisma.agentCreditRequest.findUnique.mockResolvedValue({
        ...CLAIMED,
        operatorId: 'other',
      });
      await expect(service.completeAndCredit('op1', 'cr1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects completing a non-claimed request', async () => {
      const { service, prisma } = build();
      prisma.agentCreditRequest.findUnique.mockResolvedValue({
        ...CLAIMED,
        status: CreditRequestStatus.PENDING,
      });
      await expect(service.completeAndCredit('op1', 'cr1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rolls back (no notify) if a ledger leg throws', async () => {
      const { service, prisma, db, ledger } = build();
      prisma.agentCreditRequest.findUnique.mockResolvedValue(CLAIMED);
      (ledger.applyMovement as jest.Mock).mockRejectedValueOnce(
        new Error('ledger down'),
      );
      await expect(service.completeAndCredit('op1', 'cr1')).rejects.toThrow(
        'ledger down',
      );
      expect(db.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('lets an agent cancel their own PENDING request', async () => {
      const { service, prisma } = build();
      prisma.agentCreditRequest.findUnique.mockResolvedValue({
        id: 'cr1',
        agentId: 'ag1',
        operatorId: null,
        status: CreditRequestStatus.PENDING,
        agent: { operatorId: 'op1' },
      });
      await service.cancel({ id: 'ag1', role: 'AGENT' } as never, 'cr1');
      expect(prisma.agentCreditRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'cr1', status: CreditRequestStatus.PENDING },
        data: { status: CreditRequestStatus.CANCELLED },
      });
    });

    it('rejects an agent cancelling a CLAIMED request', async () => {
      const { service, prisma } = build();
      prisma.agentCreditRequest.findUnique.mockResolvedValue({
        id: 'cr1',
        agentId: 'ag1',
        operatorId: 'op1',
        status: CreditRequestStatus.CLAIMED,
        agent: { operatorId: 'op1' },
      });
      await expect(
        service.cancel({ id: 'ag1', role: 'AGENT' } as never, 'cr1'),
      ).rejects.toThrow(ConflictException);
    });

    it('lets the owning operator cancel a CLAIMED request', async () => {
      const { service, prisma } = build();
      prisma.agentCreditRequest.findUnique.mockResolvedValue({
        id: 'cr1',
        agentId: 'ag1',
        operatorId: 'op1',
        status: CreditRequestStatus.CLAIMED,
        agent: { operatorId: 'op1' },
      });
      await service.cancel({ id: 'op1', role: 'OPERATOR' } as never, 'cr1');
      expect(prisma.agentCreditRequest.updateMany).toHaveBeenCalled();
    });
  });
});
