import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActorType,
  AgentCreditRequest,
  CreditRequestStatus,
  LedgerAccountKind,
  LedgerDirection,
  LedgerRefType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { formatMoney, parseMoney } from '../../common/money';
import { LedgerService } from '../ledger/ledger.service';
import { CURRENCY } from '../transactions/transactions.constants';
import { CreateCreditRequestDto } from './dto/create-credit-request.dto';
import { ListCreditRequestsQueryDto } from './dto/list-credit-requests.query.dto';
import { OperatorQueueQueryDto } from './dto/operator-queue.query.dto';
import { MAX_TOPUP, MIN_TOPUP } from './credit-requests.constants';
import { CREDIT_REQUEST_EVENTS } from './credit-requests.events';

@Injectable()
export class CreditRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly events: EventEmitter2,
  ) {}

  // ---- Agent: create + list ------------------------------------------------

  async createRequest(
    agentId: string,
    dto: CreateCreditRequestDto,
  ): Promise<AgentCreditRequest> {
    const amount = parseMoney(dto.amount, MIN_TOPUP, MAX_TOPUP);
    const request = await this.prisma.agentCreditRequest.create({
      data: {
        agentId,
        amount,
        paymentMethod: dto.paymentMethod,
        status: CreditRequestStatus.PENDING,
      },
    });
    this.events.emit(CREDIT_REQUEST_EVENTS.CREATED, {
      requestId: request.id,
      agentId,
      amount: formatMoney(amount),
    });
    return request;
  }

  async listForAgent(
    agentId: string,
    query: ListCreditRequestsQueryDto,
  ): Promise<AgentCreditRequest[]> {
    return this.prisma.agentCreditRequest.findMany({
      where: { agentId, status: query.status },
      orderBy: { createdAt: 'desc' },
      take: query.take,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
  }

  // ---- Operator: queue -----------------------------------------------------

  async listOperatorQueue(
    operatorId: string,
    query: OperatorQueueQueryDto,
  ): Promise<AgentCreditRequest[]> {
    return this.prisma.agentCreditRequest.findMany({
      where: this.queueWhere(operatorId, query.filter ?? 'NEW'),
      orderBy: { createdAt: 'asc' },
      take: query.take,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
  }

  private queueWhere(
    operatorId: string,
    filter: NonNullable<OperatorQueueQueryDto['filter']>,
  ): Prisma.AgentCreditRequestWhereInput {
    switch (filter) {
      case 'NEW':
        // operatorId is null pre-claim, so scope by the agent's operator.
        return { status: CreditRequestStatus.PENDING, agent: { operatorId } };
      case 'IN_PROGRESS':
        return { status: CreditRequestStatus.CLAIMED, operatorId };
      case 'COMPLETED':
        return { status: CreditRequestStatus.COMPLETED, operatorId };
      case 'ALL':
        return {
          OR: [
            { operatorId },
            { status: CreditRequestStatus.PENDING, agent: { operatorId } },
          ],
        };
    }
  }

  // ---- Operator: claim -----------------------------------------------------

  async claim(operatorId: string, id: string): Promise<AgentCreditRequest> {
    const existing = await this.prisma.agentCreditRequest.findUnique({
      where: { id },
      include: { agent: { select: { operatorId: true } } },
    });
    if (!existing) throw new NotFoundException('CREDIT_REQUEST_NOT_FOUND');
    if (existing.agent.operatorId !== operatorId) {
      throw new ForbiddenException('FORBIDDEN_NOT_OWNER');
    }

    const request = await this.prisma.$transaction(async (db) => {
      // Atomic claim: WHERE status=PENDING lets exactly one operator win.
      // Ownership is fixed (checked above), so it needn't be in the guard.
      const res = await db.agentCreditRequest.updateMany({
        where: { id, status: CreditRequestStatus.PENDING },
        data: {
          status: CreditRequestStatus.CLAIMED,
          operatorId,
          claimedAt: new Date(),
          claimVersion: { increment: 1 },
        },
      });
      if (res.count === 0) {
        throw new ConflictException('CREDIT_REQUEST_ALREADY_CLAIMED');
      }
      const claimed = await db.agentCreditRequest.findUniqueOrThrow({
        where: { id },
      });
      await db.notification.create({
        data: {
          recipientType: ActorType.AGENT,
          recipientId: claimed.agentId,
          type: NotificationType.SYSTEM,
          payload: { creditRequestId: id, operatorId, status: 'CLAIMED' },
        },
      });
      return claimed;
    });

    this.events.emit(CREDIT_REQUEST_EVENTS.CLAIMED, {
      requestId: id,
      agentId: request.agentId,
      operatorId,
    });
    return request;
  }

  // ---- Operator: confirm & credit ------------------------------------------

  async completeAndCredit(
    operatorId: string,
    id: string,
  ): Promise<AgentCreditRequest> {
    const existing = await this.prisma.agentCreditRequest.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('CREDIT_REQUEST_NOT_FOUND');
    if (existing.operatorId !== operatorId) {
      throw new ForbiddenException('FORBIDDEN_NOT_OWNER');
    }
    if (existing.status !== CreditRequestStatus.CLAIMED) {
      throw new ConflictException('INVALID_CREDIT_REQUEST_STATE');
    }

    const agentAccountId = await this.resolveAgentAccountId(existing.agentId);
    const operatorAccountId = await this.resolveOperatorAccountId(operatorId);

    const request = await this.prisma.$transaction(async (db) => {
      const res = await db.agentCreditRequest.updateMany({
        where: { id, status: CreditRequestStatus.CLAIMED, operatorId },
        data: {
          status: CreditRequestStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      if (res.count === 0) {
        throw new ConflictException('INVALID_CREDIT_REQUEST_STATE');
      }

      // Operator is the source of platform credit (may go negative = credit in
      // circulation); the agent's float is credited by the same amount.
      await this.ledger.applyMovement(db, {
        accountKind: LedgerAccountKind.OPERATOR,
        ownerId: operatorId,
        accountId: operatorAccountId,
        accountModel: 'operatorAccount',
        direction: LedgerDirection.DEBIT,
        amount: existing.amount,
        currency: CURRENCY,
        balanceField: 'creditBalance',
        refType: LedgerRefType.CREDIT_REQUEST,
        refId: id,
        reason: 'AGENT_TOPUP',
        actorType: ActorType.OPERATOR,
        actorId: operatorId,
      });
      await this.ledger.applyMovement(db, {
        accountKind: LedgerAccountKind.AGENT_CREDIT,
        ownerId: existing.agentId,
        accountId: agentAccountId,
        accountModel: 'agentAccount',
        direction: LedgerDirection.CREDIT,
        amount: existing.amount,
        currency: CURRENCY,
        balanceField: 'creditBalance',
        refType: LedgerRefType.CREDIT_REQUEST,
        refId: id,
        reason: 'AGENT_TOPUP',
        actorType: ActorType.OPERATOR,
        actorId: operatorId,
      });

      await db.notification.create({
        data: {
          recipientType: ActorType.AGENT,
          recipientId: existing.agentId,
          type: NotificationType.BALANCE_UPDATE,
          payload: {
            creditRequestId: id,
            amount: formatMoney(existing.amount),
          },
        },
      });

      return db.agentCreditRequest.findUniqueOrThrow({ where: { id } });
    });

    this.events.emit(CREDIT_REQUEST_EVENTS.COMPLETED, {
      requestId: id,
      agentId: existing.agentId,
      operatorId,
      amount: formatMoney(existing.amount),
    });
    return request;
  }

  // ---- Cancel --------------------------------------------------------------

  async cancel(user: AuthUser, id: string): Promise<AgentCreditRequest> {
    const existing = await this.prisma.agentCreditRequest.findUnique({
      where: { id },
      include: { agent: { select: { operatorId: true } } },
    });
    if (!existing) throw new NotFoundException('CREDIT_REQUEST_NOT_FOUND');

    if (user.role === 'AGENT') {
      if (existing.agentId !== user.id) {
        throw new ForbiddenException('FORBIDDEN_NOT_OWNER');
      }
      if (existing.status !== CreditRequestStatus.PENDING) {
        throw new ConflictException('INVALID_CREDIT_REQUEST_STATE');
      }
    } else if (user.role === 'OPERATOR') {
      const ownsPending =
        existing.status === CreditRequestStatus.PENDING &&
        existing.agent.operatorId === user.id;
      const ownsClaimed =
        existing.status === CreditRequestStatus.CLAIMED &&
        existing.operatorId === user.id;
      if (!ownsPending && !ownsClaimed) {
        throw new ForbiddenException('FORBIDDEN_NOT_OWNER');
      }
    } else {
      throw new ForbiddenException('FORBIDDEN_NOT_OWNER');
    }

    // No ledger reversal: no funds move until completion.
    const res = await this.prisma.agentCreditRequest.updateMany({
      where: { id, status: existing.status },
      data: { status: CreditRequestStatus.CANCELLED },
    });
    if (res.count === 0) {
      throw new ConflictException('INVALID_CREDIT_REQUEST_STATE');
    }
    return this.prisma.agentCreditRequest.findUniqueOrThrow({ where: { id } });
  }

  // ---- Helpers -------------------------------------------------------------

  private async resolveAgentAccountId(agentId: string): Promise<string> {
    const link = await this.prisma.agentWallet.findUnique({
      where: { agentId },
      select: { accountId: true },
    });
    if (!link) throw new NotFoundException('AGENT_ACCOUNT_NOT_FOUND');
    return link.accountId;
  }

  private async resolveOperatorAccountId(operatorId: string): Promise<string> {
    const link = await this.prisma.operatorWallet.findUnique({
      where: { operatorId },
      select: { accountId: true },
    });
    if (!link) throw new NotFoundException('OPERATOR_ACCOUNT_NOT_FOUND');
    return link.accountId;
  }
}
