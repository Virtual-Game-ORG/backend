import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActorType,
  ChatSubjectType,
  CommissionType,
  LedgerRefType,
  NotificationType,
  Prisma,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { CommissionService } from '../commission/commission.service';
import { LedgerService } from '../ledger/ledger.service';
import { formatMoney, parseMoney } from '../../common/money';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.dto';
import { AgentQueueQueryDto } from './dto/agent-queue.query.dto';
import { CURRENCY, MAX_AMOUNT, MIN_AMOUNT } from './transactions.constants';
import { TRANSACTION_EVENTS } from './transactions.events';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly commission: CommissionService,
    private readonly events: EventEmitter2,
  ) {}

  // ---- Player: create requests --------------------------------------------

  async createDeposit(
    playerId: string,
    dto: CreateDepositDto,
  ): Promise<Transaction> {
    const amount = parseMoney(dto.amount, MIN_AMOUNT, MAX_AMOUNT);
    const tx = await this.prisma.transaction.create({
      data: {
        type: TransactionType.DEPOSIT,
        playerId,
        amount,
        paymentMethod: dto.paymentMethod,
        playerPhone: dto.playerPhone,
        zplayPhone: dto.zplayPhone,
        status: TransactionStatus.PENDING,
      },
    });
    this.events.emit(TRANSACTION_EVENTS.CREATED, {
      transactionId: tx.id,
      type: tx.type,
      playerId,
      amount: formatMoney(amount),
    });
    return tx;
  }

  async createWithdrawal(
    playerId: string,
    dto: CreateWithdrawalDto,
  ): Promise<Transaction> {
    const amount = parseMoney(dto.amount, MIN_AMOUNT, MAX_AMOUNT);
    const walletId = await this.resolvePlayerWalletId(this.prisma, playerId);

    const tx = await this.prisma.$transaction(async (db) => {
      const created = await db.transaction.create({
        data: {
          type: TransactionType.WITHDRAWAL,
          playerId,
          amount,
          paymentMethod: dto.paymentMethod,
          playerPhone: dto.playerPhone,
          // Withdrawals carry no separate Zplay number; reuse the player phone.
          zplayPhone: dto.playerPhone,
          status: TransactionStatus.PENDING,
        },
      });
      // Reserve the funds now so concurrent requests can't double-spend.
      await this.ledger.lockPlayerWithdrawable(db, {
        playerId,
        walletId,
        amount,
        currency: CURRENCY,
        refType: LedgerRefType.TRANSACTION,
        refId: created.id,
        actorType: ActorType.PLAYER,
        actorId: playerId,
      });
      return created;
    });

    this.events.emit(TRANSACTION_EVENTS.CREATED, {
      transactionId: tx.id,
      type: tx.type,
      playerId,
      amount: formatMoney(amount),
    });
    return tx;
  }

  // ---- Listing -------------------------------------------------------------

  async listForPlayer(
    playerId: string,
    query: ListTransactionsQueryDto,
  ): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: { playerId, status: query.status, type: query.type },
      orderBy: { createdAt: 'desc' },
      take: query.take,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
  }

  async listAgentQueue(
    agentId: string,
    query: AgentQueueQueryDto,
  ): Promise<Transaction[]> {
    const where = this.queueWhere(agentId, query.filter ?? 'NEW');
    return this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: query.take,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
  }

  private queueWhere(
    agentId: string,
    filter: NonNullable<AgentQueueQueryDto['filter']>,
  ): Prisma.TransactionWhereInput {
    switch (filter) {
      case 'NEW':
        return { status: TransactionStatus.PENDING };
      case 'IN_PROGRESS':
        return { status: TransactionStatus.CLAIMED, agentId };
      case 'COMPLETED':
        return { status: TransactionStatus.COMPLETED, agentId };
      case 'ALL':
        return { OR: [{ agentId }, { status: TransactionStatus.PENDING }] };
    }
  }

  // ---- Agent: claim --------------------------------------------------------

  async claim(agentId: string, id: string): Promise<Transaction> {
    const tx = await this.prisma.$transaction(async (db) => {
      // Atomic conditional claim: the WHERE status=PENDING predicate lets
      // exactly one of two racing agents win.
      const res = await db.transaction.updateMany({
        where: { id, status: TransactionStatus.PENDING },
        data: {
          status: TransactionStatus.CLAIMED,
          agentId,
          claimedAt: new Date(),
          claimVersion: { increment: 1 },
        },
      });
      if (res.count === 0) {
        // Distinguish missing from already-claimed for a clearer error.
        const exists = await db.transaction.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!exists) throw new NotFoundException('TRANSACTION_NOT_FOUND');
        throw new ConflictException('TRANSACTION_ALREADY_CLAIMED');
      }
      const claimed = await db.transaction.findUniqueOrThrow({ where: { id } });

      await db.chatThread.upsert({
        where: {
          subjectType_subjectId: {
            subjectType: ChatSubjectType.TRANSACTION,
            subjectId: id,
          },
        },
        create: {
          subjectType: ChatSubjectType.TRANSACTION,
          subjectId: id,
        },
        update: {},
      });

      await db.notification.create({
        data: {
          recipientType: ActorType.PLAYER,
          recipientId: claimed.playerId,
          type: NotificationType.TRANSACTION_CLAIMED,
          payload: { transactionId: id, agentId },
        },
      });
      return claimed;
    });

    this.events.emit(TRANSACTION_EVENTS.CLAIMED, {
      transactionId: tx.id,
      agentId,
      playerId: tx.playerId,
    });
    return tx;
  }

  // ---- Agent: confirm & credit --------------------------------------------

  async completeAndCredit(agentId: string, id: string): Promise<Transaction> {
    const existing = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('TRANSACTION_NOT_FOUND');
    if (existing.agentId !== agentId) {
      throw new ForbiddenException('FORBIDDEN_NOT_OWNER');
    }
    if (existing.status !== TransactionStatus.CLAIMED) {
      throw new ConflictException('INVALID_TRANSACTION_STATE');
    }

    const walletId = await this.resolvePlayerWalletId(
      this.prisma,
      existing.playerId,
    );
    const accountId = await this.resolveAgentAccountId(this.prisma, agentId);

    const tx = await this.prisma.$transaction(async (db) => {
      // Re-guard the state transition to close the complete-race.
      const res = await db.transaction.updateMany({
        where: { id, status: TransactionStatus.CLAIMED, agentId },
        data: { status: TransactionStatus.COMPLETED, completedAt: new Date() },
      });
      if (res.count === 0) {
        throw new ConflictException('INVALID_TRANSACTION_STATE');
      }

      if (existing.type === TransactionType.DEPOSIT) {
        await this.settleDeposit(db, existing, walletId, accountId, agentId);
      } else {
        await this.settleWithdrawal(db, existing, walletId, accountId, agentId);
      }

      await db.notification.create({
        data: {
          recipientType: ActorType.PLAYER,
          recipientId: existing.playerId,
          type: NotificationType.TRANSACTION_COMPLETED,
          payload: {
            transactionId: id,
            amount: formatMoney(existing.amount),
            type: existing.type,
          },
        },
      });

      return db.transaction.findUniqueOrThrow({ where: { id } });
    });

    this.events.emit(TRANSACTION_EVENTS.COMPLETED, {
      transactionId: tx.id,
      type: tx.type,
      agentId,
      playerId: tx.playerId,
      amount: formatMoney(existing.amount),
    });
    return tx;
  }

  private async settleDeposit(
    db: Prisma.TransactionClient,
    txn: Transaction,
    walletId: string,
    accountId: string,
    agentId: string,
  ): Promise<void> {
    // Agent funds the deposit from their credit float, player is credited.
    await this.ledger.debitAgentCredit(db, {
      agentId,
      accountId,
      amount: txn.amount,
      currency: CURRENCY,
      refType: LedgerRefType.TRANSACTION,
      refId: txn.id,
      actorId: agentId,
    });
    await this.ledger.creditPlayerReal(db, {
      playerId: txn.playerId,
      walletId,
      amount: txn.amount,
      currency: CURRENCY,
      refType: LedgerRefType.TRANSACTION,
      refId: txn.id,
      actorType: ActorType.AGENT,
      actorId: agentId,
    });
    await this.bookCommission(
      db,
      txn,
      accountId,
      agentId,
      CommissionType.DEPOSIT,
    );
  }

  private async settleWithdrawal(
    db: Prisma.TransactionClient,
    txn: Transaction,
    walletId: string,
    accountId: string,
    agentId: string,
  ): Promise<void> {
    // Funds were locked at create; remove them and reimburse the agent float.
    await this.ledger.debitPlayerLocked(db, {
      playerId: txn.playerId,
      walletId,
      amount: txn.amount,
      currency: CURRENCY,
      refType: LedgerRefType.TRANSACTION,
      refId: txn.id,
      actorType: ActorType.AGENT,
      actorId: agentId,
    });
    await this.ledger.creditAgentCredit(db, {
      agentId,
      accountId,
      amount: txn.amount,
      currency: CURRENCY,
      refType: LedgerRefType.TRANSACTION,
      refId: txn.id,
      actorId: agentId,
    });
    await this.bookCommission(
      db,
      txn,
      accountId,
      agentId,
      CommissionType.WITHDRAWAL,
    );
  }

  private async bookCommission(
    db: Prisma.TransactionClient,
    txn: Transaction,
    accountId: string,
    agentId: string,
    type: CommissionType,
  ): Promise<void> {
    const result = await this.commission.computeAndLog(db, {
      agentId,
      playerId: txn.playerId,
      transactionId: txn.id,
      type,
      base: txn.amount,
    });
    if (result.amount.greaterThan(0)) {
      await this.ledger.creditAgentCommission(db, {
        agentId,
        accountId,
        amount: result.amount,
        currency: CURRENCY,
        refType: LedgerRefType.COMMISSION,
        refId: txn.id,
        actorId: agentId,
      });
    }
  }

  // ---- Cancel --------------------------------------------------------------

  async cancel(user: AuthUser, id: string): Promise<Transaction> {
    const existing = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('TRANSACTION_NOT_FOUND');

    if (user.role === 'PLAYER') {
      if (existing.playerId !== user.id) {
        throw new ForbiddenException('FORBIDDEN_NOT_OWNER');
      }
      if (existing.status !== TransactionStatus.PENDING) {
        throw new ConflictException('INVALID_TRANSACTION_STATE');
      }
    } else if (user.role === 'AGENT') {
      if (existing.agentId !== user.id) {
        throw new ForbiddenException('FORBIDDEN_NOT_OWNER');
      }
      if (existing.status !== TransactionStatus.CLAIMED) {
        throw new ConflictException('INVALID_TRANSACTION_STATE');
      }
    } else {
      throw new ForbiddenException('FORBIDDEN_NOT_OWNER');
    }

    return this.prisma.$transaction(async (db) => {
      const res = await db.transaction.updateMany({
        where: { id, status: existing.status },
        data: { status: TransactionStatus.CANCELLED },
      });
      if (res.count === 0) {
        throw new ConflictException('INVALID_TRANSACTION_STATE');
      }
      // Release the reservation placed when a withdrawal was created.
      if (existing.type === TransactionType.WITHDRAWAL) {
        const walletId = await this.resolvePlayerWalletId(
          db,
          existing.playerId,
        );
        await this.ledger.unlockPlayerWithdrawable(db, {
          playerId: existing.playerId,
          walletId,
          amount: existing.amount,
          currency: CURRENCY,
          refType: LedgerRefType.TRANSACTION,
          refId: id,
          actorType: user.role === 'AGENT' ? ActorType.AGENT : ActorType.PLAYER,
          actorId: user.id,
        });
      }
      return db.transaction.findUniqueOrThrow({ where: { id } });
    });
  }

  // ---- Helpers -------------------------------------------------------------

  private async resolvePlayerWalletId(
    db: Prisma.TransactionClient | PrismaService,
    playerId: string,
  ): Promise<string> {
    const link = await db.playerWallet.findUnique({
      where: { playerId },
      select: { walletId: true },
    });
    if (!link) throw new NotFoundException('PLAYER_WALLET_NOT_FOUND');
    return link.walletId;
  }

  private async resolveAgentAccountId(
    db: Prisma.TransactionClient | PrismaService,
    agentId: string,
  ): Promise<string> {
    const link = await db.agentWallet.findUnique({
      where: { agentId },
      select: { accountId: true },
    });
    if (!link) throw new NotFoundException('AGENT_ACCOUNT_NOT_FOUND');
    return link.accountId;
  }
}
