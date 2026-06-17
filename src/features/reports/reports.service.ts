import { Injectable } from '@nestjs/common';
import {
  BetStatus,
  PlayerStatus,
  Prisma,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { Decimal, formatMoney } from '../../common/money';
import { PrismaService } from '../../database/prisma.service';
import {
  AgentPerformanceQueryDto,
  PerformancePeriod,
} from './dto/agent-performance.query.dto';
import { AuditQueryDto } from './dto/audit.query.dto';
import {
  AgentPerformanceRow,
  AuditEntryView,
  PeriodStats,
  PlatformSummary,
} from './reports.types';

const SETTLED = [BetStatus.WON, BetStatus.LOST, BetStatus.VOID];
const D0 = () => new Decimal(0);
const coalesce = (v: Prisma.Decimal | null) => v ?? D0();

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Platform summary ----------------------------------------------------

  async platformSummary(): Promise<PlatformSummary> {
    const now = new Date();
    const [today, week, month, totals] = await Promise.all([
      this.periodStats(startOfDay(now)),
      this.periodStats(startOfWeek(now)),
      this.periodStats(startOfMonth(now)),
      this.totals(),
    ]);
    return { today, week, month, totals };
  }

  private async periodStats(start: Date): Promise<PeriodStats> {
    const [deposits, withdrawals, commission, bets] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.COMPLETED,
          completedAt: { gte: start },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.COMPLETED,
          completedAt: { gte: start },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.commissionLog.aggregate({
        where: { createdAt: { gte: start } },
        _sum: { amount: true },
      }),
      this.prisma.bet.aggregate({
        where: { settledAt: { gte: start }, status: { in: SETTLED } },
        _sum: { stake: true, payout: true },
      }),
    ]);

    const houseRevenue = coalesce(bets._sum.stake).minus(
      coalesce(bets._sum.payout),
    );
    return {
      depositVolume: formatMoney(coalesce(deposits._sum.amount)),
      depositCount: deposits._count,
      withdrawalVolume: formatMoney(coalesce(withdrawals._sum.amount)),
      withdrawalCount: withdrawals._count,
      commissionPaid: formatMoney(coalesce(commission._sum.amount)),
      houseRevenue: formatMoney(houseRevenue),
    };
  }

  private async totals(): Promise<PlatformSummary['totals']> {
    const [pendingCount, completedCount, agentCount, playerCount] =
      await Promise.all([
        this.prisma.transaction.count({
          where: {
            status: {
              in: [TransactionStatus.PENDING, TransactionStatus.CLAIMED],
            },
          },
        }),
        this.prisma.transaction.count({
          where: { status: TransactionStatus.COMPLETED },
        }),
        this.prisma.agent.count(),
        this.prisma.player.count(),
      ]);
    return { pendingCount, completedCount, agentCount, playerCount };
  }

  // ---- Per-agent performance ----------------------------------------------

  async agentPerformance(
    query: AgentPerformanceQueryDto,
  ): Promise<AgentPerformanceRow[]> {
    const start = this.windowStart(query.period ?? 'all');
    const window = start ? { gte: start } : undefined;

    const [agents, txByAgent, commByAgent, playersByAgent] = await Promise.all([
      this.prisma.agent.findMany({
        include: { wallet: { include: { account: true } } },
      }),
      this.prisma.transaction.groupBy({
        by: ['agentId'],
        where: {
          status: TransactionStatus.COMPLETED,
          ...(window && { completedAt: window }),
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.commissionLog.groupBy({
        by: ['agentId'],
        where: { ...(window && { createdAt: window }) },
        _sum: { amount: true },
      }),
      this.prisma.player.groupBy({
        by: ['agentId'],
        where: { status: PlayerStatus.ACTIVE },
        _count: true,
      }),
    ]);

    const txMap = new Map(txByAgent.map((r) => [r.agentId, r]));
    const commMap = new Map(commByAgent.map((r) => [r.agentId, r._sum.amount]));
    const playerMap = new Map(playersByAgent.map((r) => [r.agentId, r._count]));

    const rows = agents.map((agent) => {
      const tx = txMap.get(agent.id);
      const volume = coalesce(tx?._sum.amount ?? null);
      const account = agent.wallet?.account;
      const row: AgentPerformanceRow = {
        agentId: agent.id,
        name: agent.name,
        status: agent.status,
        creditBalance: formatMoney(account?.creditBalance ?? D0()),
        commissionBalance: formatMoney(account?.commissionBalance ?? D0()),
        volume: formatMoney(volume),
        transactionsProcessed: tx?._count ?? 0,
        commissionPaid: formatMoney(coalesce(commMap.get(agent.id) ?? null)),
        activePlayers: playerMap.get(agent.id) ?? 0,
      };
      return { row, volume };
    });

    rows.sort((a, b) => b.volume.comparedTo(a.volume));
    return rows.slice(0, query.take ?? 20).map((r) => r.row);
  }

  private windowStart(period: PerformancePeriod): Date | undefined {
    const now = new Date();
    switch (period) {
      case 'today':
        return startOfDay(now);
      case 'week':
        return startOfWeek(now);
      case 'month':
        return startOfMonth(now);
      default:
        return undefined;
    }
  }

  // ---- Audit log -----------------------------------------------------------

  async auditLog(query: AuditQueryDto): Promise<AuditEntryView[]> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        accountKind: query.accountKind,
        refType: query.refType,
        ownerId: query.ownerId,
      },
      orderBy: { createdAt: 'desc' },
      take: query.take,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
    return entries.map((e) => ({
      id: e.id,
      accountKind: e.accountKind,
      ownerId: e.ownerId,
      direction: e.direction,
      amount: formatMoney(e.amount),
      balanceAfter: formatMoney(e.balanceAfter),
      currency: e.currency,
      refType: e.refType,
      refId: e.refId,
      reason: e.reason,
      actorType: e.actorType,
      actorId: e.actorId,
      createdAt: e.createdAt,
    }));
  }
}
