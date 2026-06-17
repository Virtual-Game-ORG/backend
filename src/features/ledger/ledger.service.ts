import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ActorType,
  LedgerAccountKind,
  LedgerDirection,
  LedgerRefType,
  Prisma,
} from '@prisma/client';
import { BalanceField, MovementInput, MovementResult } from './ledger.types';

/**
 * The single writer of account balances and the append-only LedgerEntry audit
 * log. Every method takes a Prisma transaction client so callers can compose
 * several movements atomically inside one `$transaction`.
 *
 * Balances are mutated with atomic `increment`/`decrement` — never read then
 * written — and each movement records a matching LedgerEntry with balanceAfter.
 */
@Injectable()
export class LedgerService {
  async applyMovement(
    tx: Prisma.TransactionClient,
    input: MovementInput,
  ): Promise<MovementResult> {
    const {
      accountModel,
      accountId,
      balanceField,
      direction,
      amount,
      requireSufficient,
    } = input;

    const delegate = tx[accountModel] as unknown as {
      updateMany: (args: unknown) => Promise<{ count: number }>;
      update: (args: unknown) => Promise<Record<BalanceField, Prisma.Decimal>>;
      findUniqueOrThrow: (
        args: unknown,
      ) => Promise<Record<BalanceField, Prisma.Decimal>>;
    };

    const change =
      direction === LedgerDirection.CREDIT
        ? { increment: amount }
        : { decrement: amount };

    let balanceAfter: Prisma.Decimal;

    if (direction === LedgerDirection.DEBIT && requireSufficient) {
      // Atomic conditional debit: only applies when funds suffice. Postgres
      // serializes the row, so concurrent debits can't overdraw.
      const res = await delegate.updateMany({
        where: { id: accountId, [balanceField]: { gte: amount } },
        data: { [balanceField]: change },
      });
      if (res.count === 0) {
        throw new BadRequestException(
          input.insufficientError ?? 'INSUFFICIENT_FUNDS',
        );
      }
      const row = await delegate.findUniqueOrThrow({
        where: { id: accountId },
        select: { [balanceField]: true },
      });
      balanceAfter = row[balanceField];
    } else {
      const row = await delegate.update({
        where: { id: accountId },
        data: { [balanceField]: change },
        select: { [balanceField]: true },
      });
      balanceAfter = row[balanceField];
    }

    const entry = await tx.ledgerEntry.create({
      data: {
        accountKind: input.accountKind,
        ownerId: input.ownerId,
        direction: input.direction,
        amount: input.amount,
        balanceAfter,
        currency: input.currency,
        refType: input.refType,
        refId: input.refId,
        reason: input.reason,
        actorType: input.actorType,
        actorId: input.actorId,
      },
      select: { id: true },
    });

    return { balanceAfter, ledgerEntryId: entry.id };
  }

  // ---- Player real-money wallet --------------------------------------------

  /** Credit a player's real balance (deposited cash is withdrawable). */
  async creditPlayerReal(
    tx: Prisma.TransactionClient,
    args: {
      playerId: string;
      walletId: string;
      amount: Prisma.Decimal;
      currency: string;
      refType: LedgerRefType;
      refId: string;
      reason?: string;
      actorType: ActorType;
      actorId?: string;
    },
  ): Promise<MovementResult> {
    // withdrawableBalance tracks the slice of balance eligible for withdrawal.
    await tx.wallet.update({
      where: { id: args.walletId },
      data: { withdrawableBalance: { increment: args.amount } },
    });
    return this.applyMovement(tx, {
      accountKind: LedgerAccountKind.PLAYER_REAL,
      ownerId: args.playerId,
      accountId: args.walletId,
      accountModel: 'wallet',
      direction: LedgerDirection.CREDIT,
      amount: args.amount,
      currency: args.currency,
      balanceField: 'balance',
      refType: args.refType,
      refId: args.refId,
      reason: args.reason,
      actorType: args.actorType,
      actorId: args.actorId,
    });
  }

  /**
   * Debit a player's real balance (e.g. a bet stake). Guards on both balance and
   * withdrawableBalance so a player can't stake funds already reserved for a
   * pending withdrawal. Decrements both columns.
   */
  async debitPlayerReal(
    tx: Prisma.TransactionClient,
    args: {
      playerId: string;
      walletId: string;
      amount: Prisma.Decimal;
      currency: string;
      refType: LedgerRefType;
      refId: string;
      reason?: string;
      actorType: ActorType;
      actorId?: string;
    },
  ): Promise<MovementResult> {
    const res = await tx.wallet.updateMany({
      where: {
        id: args.walletId,
        balance: { gte: args.amount },
        withdrawableBalance: { gte: args.amount },
      },
      data: {
        balance: { decrement: args.amount },
        withdrawableBalance: { decrement: args.amount },
      },
    });
    if (res.count === 0) {
      throw new BadRequestException('INSUFFICIENT_BALANCE');
    }
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { id: args.walletId },
      select: { balance: true },
    });
    const entry = await tx.ledgerEntry.create({
      data: {
        accountKind: LedgerAccountKind.PLAYER_REAL,
        ownerId: args.playerId,
        direction: LedgerDirection.DEBIT,
        amount: args.amount,
        balanceAfter: wallet.balance,
        currency: args.currency,
        refType: args.refType,
        refId: args.refId,
        reason: args.reason,
        actorType: args.actorType,
        actorId: args.actorId,
      },
      select: { id: true },
    });
    return { balanceAfter: wallet.balance, ledgerEntryId: entry.id };
  }

  /** Lock withdrawable funds at withdrawal-request time. */
  async lockPlayerWithdrawable(
    tx: Prisma.TransactionClient,
    args: {
      playerId: string;
      walletId: string;
      amount: Prisma.Decimal;
      currency: string;
      refType: LedgerRefType;
      refId: string;
      actorType: ActorType;
      actorId?: string;
    },
  ): Promise<MovementResult> {
    const res = await tx.wallet.updateMany({
      where: { id: args.walletId, withdrawableBalance: { gte: args.amount } },
      data: {
        withdrawableBalance: { decrement: args.amount },
        lockedBalance: { increment: args.amount },
      },
    });
    if (res.count === 0) {
      throw new BadRequestException('INSUFFICIENT_WITHDRAWABLE_BALANCE');
    }
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { id: args.walletId },
      select: { balance: true },
    });
    const entry = await tx.ledgerEntry.create({
      data: {
        accountKind: LedgerAccountKind.PLAYER_REAL,
        ownerId: args.playerId,
        direction: LedgerDirection.DEBIT,
        amount: args.amount,
        balanceAfter: wallet.balance,
        currency: args.currency,
        refType: args.refType,
        refId: args.refId,
        reason: 'WITHDRAWAL_LOCK',
        actorType: args.actorType,
        actorId: args.actorId,
      },
      select: { id: true },
    });
    return { balanceAfter: wallet.balance, ledgerEntryId: entry.id };
  }

  /** Release a withdrawal lock back to withdrawable (on cancel). */
  async unlockPlayerWithdrawable(
    tx: Prisma.TransactionClient,
    args: {
      playerId: string;
      walletId: string;
      amount: Prisma.Decimal;
      currency: string;
      refType: LedgerRefType;
      refId: string;
      actorType: ActorType;
      actorId?: string;
    },
  ): Promise<void> {
    await tx.wallet.update({
      where: { id: args.walletId },
      data: {
        lockedBalance: { decrement: args.amount },
        withdrawableBalance: { increment: args.amount },
      },
    });
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { id: args.walletId },
      select: { balance: true },
    });
    await tx.ledgerEntry.create({
      data: {
        accountKind: LedgerAccountKind.PLAYER_REAL,
        ownerId: args.playerId,
        direction: LedgerDirection.CREDIT,
        amount: args.amount,
        balanceAfter: wallet.balance,
        currency: args.currency,
        refType: args.refType,
        refId: args.refId,
        reason: 'WITHDRAWAL_UNLOCK',
        actorType: args.actorType,
        actorId: args.actorId,
      },
    });
  }

  /** Settle a withdrawal: remove the locked funds from the real balance. */
  async debitPlayerLocked(
    tx: Prisma.TransactionClient,
    args: {
      playerId: string;
      walletId: string;
      amount: Prisma.Decimal;
      currency: string;
      refType: LedgerRefType;
      refId: string;
      actorType: ActorType;
      actorId?: string;
    },
  ): Promise<MovementResult> {
    await tx.wallet.update({
      where: { id: args.walletId },
      data: { lockedBalance: { decrement: args.amount } },
    });
    return this.applyMovement(tx, {
      accountKind: LedgerAccountKind.PLAYER_REAL,
      ownerId: args.playerId,
      accountId: args.walletId,
      accountModel: 'wallet',
      direction: LedgerDirection.DEBIT,
      amount: args.amount,
      currency: args.currency,
      balanceField: 'balance',
      refType: args.refType,
      refId: args.refId,
      reason: 'WITHDRAWAL_SETTLE',
      actorType: args.actorType,
      actorId: args.actorId,
    });
  }

  // ---- Agent account -------------------------------------------------------

  /** Debit an agent's credit float; rejects if it would overdraw. */
  async debitAgentCredit(
    tx: Prisma.TransactionClient,
    args: {
      agentId: string;
      accountId: string;
      amount: Prisma.Decimal;
      currency: string;
      refType: LedgerRefType;
      refId: string;
      actorId?: string;
    },
  ): Promise<MovementResult> {
    return this.applyMovement(tx, {
      accountKind: LedgerAccountKind.AGENT_CREDIT,
      ownerId: args.agentId,
      accountId: args.accountId,
      accountModel: 'agentAccount',
      direction: LedgerDirection.DEBIT,
      amount: args.amount,
      currency: args.currency,
      balanceField: 'creditBalance',
      refType: args.refType,
      refId: args.refId,
      actorType: ActorType.AGENT,
      actorId: args.actorId,
      requireSufficient: true,
      insufficientError: 'INSUFFICIENT_AGENT_CREDIT',
    });
  }

  /** Reimburse an agent's credit float (withdrawal settlement). */
  async creditAgentCredit(
    tx: Prisma.TransactionClient,
    args: {
      agentId: string;
      accountId: string;
      amount: Prisma.Decimal;
      currency: string;
      refType: LedgerRefType;
      refId: string;
      actorId?: string;
    },
  ): Promise<MovementResult> {
    return this.applyMovement(tx, {
      accountKind: LedgerAccountKind.AGENT_CREDIT,
      ownerId: args.agentId,
      accountId: args.accountId,
      accountModel: 'agentAccount',
      direction: LedgerDirection.CREDIT,
      amount: args.amount,
      currency: args.currency,
      balanceField: 'creditBalance',
      refType: args.refType,
      refId: args.refId,
      actorType: ActorType.AGENT,
      actorId: args.actorId,
    });
  }

  /** Credit earned commission to an agent's commission balance. */
  async creditAgentCommission(
    tx: Prisma.TransactionClient,
    args: {
      agentId: string;
      accountId: string;
      amount: Prisma.Decimal;
      currency: string;
      refType: LedgerRefType;
      refId: string;
      actorId?: string;
    },
  ): Promise<MovementResult> {
    return this.applyMovement(tx, {
      accountKind: LedgerAccountKind.AGENT_COMMISSION,
      ownerId: args.agentId,
      accountId: args.accountId,
      accountModel: 'agentAccount',
      direction: LedgerDirection.CREDIT,
      amount: args.amount,
      currency: args.currency,
      balanceField: 'commissionBalance',
      refType: args.refType,
      refId: args.refId,
      actorType: ActorType.AGENT,
      actorId: args.actorId,
    });
  }
}
