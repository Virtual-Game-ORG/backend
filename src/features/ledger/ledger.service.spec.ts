import { BadRequestException } from '@nestjs/common';
import { ActorType, LedgerRefType, Prisma } from '@prisma/client';
import { LedgerService } from './ledger.service';

const D = (v: number | string) => new Prisma.Decimal(v);

function mockTx(balances: { creditBalance?: string; balance?: string }) {
  const ledgerEntry = { create: jest.fn().mockResolvedValue({ id: 'le-1' }) };
  return {
    ledgerEntry,
    wallet: {
      update: jest
        .fn()
        .mockResolvedValue({ balance: D(balances.balance ?? '0') }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ balance: D(balances.balance ?? '0') }),
    },
    agentAccount: {
      update: jest
        .fn()
        .mockResolvedValue({ creditBalance: D(balances.creditBalance ?? '0') }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ creditBalance: D(balances.creditBalance ?? '0') }),
    },
  };
}

const refArgs = {
  currency: 'ETB',
  refType: LedgerRefType.TRANSACTION,
  refId: 't1',
};

describe('LedgerService', () => {
  const service = new LedgerService();

  it('creditPlayerReal increments balance + withdrawable and logs one CREDIT entry', async () => {
    const tx = mockTx({ balance: '1000' });
    const res = await service.creditPlayerReal(tx as never, {
      playerId: 'p1',
      walletId: 'w1',
      amount: D(1000),
      ...refArgs,
      actorType: ActorType.AGENT,
    });
    expect(res.balanceAfter.toNumber()).toBe(1000);
    // withdrawable bump + balance bump = two wallet.update calls.
    expect(tx.wallet.update).toHaveBeenCalledTimes(2);
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.ledgerEntry.create.mock.calls[0][0].data).toMatchObject({
      accountKind: 'PLAYER_REAL',
      direction: 'CREDIT',
      balanceAfter: D(1000),
    });
  });

  it('debitAgentCredit applies the guarded debit when funds suffice', async () => {
    const tx = mockTx({ creditBalance: '4000' });
    const res = await service.debitAgentCredit(tx as never, {
      agentId: 'a1',
      accountId: 'acc1',
      amount: D(1000),
      ...refArgs,
    });
    expect(res.balanceAfter.toNumber()).toBe(4000);
    expect(tx.agentAccount.updateMany).toHaveBeenCalledWith({
      where: { id: 'acc1', creditBalance: { gte: D(1000) } },
      data: { creditBalance: { decrement: D(1000) } },
    });
    expect(tx.ledgerEntry.create.mock.calls[0][0].data).toMatchObject({
      accountKind: 'AGENT_CREDIT',
      direction: 'DEBIT',
    });
  });

  it('debitAgentCredit throws INSUFFICIENT_AGENT_CREDIT when funds are short', async () => {
    const tx = mockTx({ creditBalance: '0' });
    tx.agentAccount.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.debitAgentCredit(tx as never, {
        agentId: 'a1',
        accountId: 'acc1',
        amount: D(1000),
        ...refArgs,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('lockPlayerWithdrawable throws when withdrawable is insufficient', async () => {
    const tx = mockTx({ balance: '0' });
    tx.wallet.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.lockPlayerWithdrawable(tx as never, {
        playerId: 'p1',
        walletId: 'w1',
        amount: D(1000),
        ...refArgs,
        actorType: ActorType.PLAYER,
      }),
    ).rejects.toThrow('INSUFFICIENT_WITHDRAWABLE_BALANCE');
  });
});
