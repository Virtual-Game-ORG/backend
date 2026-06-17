import { Injectable } from '@nestjs/common';
import { CommissionConfig, CommissionType, Prisma } from '@prisma/client';
import { startOfDay, startOfWeek } from 'date-fns';
import { ComputeCommissionInput, CommissionResult } from './commission.types';

type RateSelector = {
  rate: keyof CommissionConfig;
  enabled: keyof CommissionConfig;
};

// Commission rates are stored as fractions (0.02 = 2%). The cap amounts apply
// across all commission types for an agent within the day/week window.
const SELECTORS: Record<CommissionType, RateSelector> = {
  CLAIM: { rate: 'claimCommissionRate', enabled: 'claimEnabled' },
  DEPOSIT: { rate: 'depositCommissionRate', enabled: 'depositEnabled' },
  WITHDRAWAL: {
    rate: 'withdrawalCommissionRate',
    enabled: 'withdrawalEnabled',
  },
  PLAYER_LOSS: { rate: 'playerLossBonusRate', enabled: 'playerLossEnabled' },
};

@Injectable()
export class CommissionService {
  /** Pure rate application — no I/O. The unit-test seam. */
  calc(base: Prisma.Decimal, rate: Prisma.Decimal): Prisma.Decimal {
    return base.mul(rate);
  }

  /**
   * Compute commission for a transaction, apply daily/weekly caps, and persist
   * a CommissionLog when the result is positive. A missing config or a disabled
   * type yields zero and writes nothing — commission never blocks the money flow.
   */
  async computeAndLog(
    tx: Prisma.TransactionClient,
    input: ComputeCommissionInput,
  ): Promise<CommissionResult> {
    const zero = new Prisma.Decimal(0);
    const config = await tx.commissionConfig.findUnique({
      where: { agentId: input.agentId },
    });
    if (!config) return { amount: zero, rateApplied: zero, capped: false };

    const selector = SELECTORS[input.type];
    if (!config[selector.enabled]) {
      return { amount: zero, rateApplied: zero, capped: false };
    }

    const rate = config[selector.rate] as Prisma.Decimal;
    const raw = this.calc(input.base, rate);
    if (raw.lessThanOrEqualTo(0)) {
      return { amount: zero, rateApplied: rate, capped: false };
    }

    let amount = raw;
    amount = await this.applyCap(
      tx,
      input.agentId,
      amount,
      config.dailyCapAmount,
      startOfDay(new Date()),
    );
    amount = await this.applyCap(
      tx,
      input.agentId,
      amount,
      config.weeklyCapAmount,
      startOfWeek(new Date()),
    );

    const capped = amount.lessThan(raw);
    if (amount.lessThanOrEqualTo(0)) {
      return { amount: zero, rateApplied: rate, capped };
    }

    await tx.commissionLog.create({
      data: {
        agentId: input.agentId,
        playerId: input.playerId,
        transactionId: input.transactionId,
        betId: input.betId,
        type: input.type,
        amount,
        rateApplied: rate,
      },
    });

    return { amount, rateApplied: rate, capped };
  }

  /** Clamp `amount` so the period total never exceeds `cap`. */
  private async applyCap(
    tx: Prisma.TransactionClient,
    agentId: string,
    amount: Prisma.Decimal,
    cap: Prisma.Decimal | null,
    windowStart: Date,
  ): Promise<Prisma.Decimal> {
    if (!cap) return amount;
    const agg = await tx.commissionLog.aggregate({
      where: { agentId, createdAt: { gte: windowStart } },
      _sum: { amount: true },
    });
    const used = agg._sum.amount ?? new Prisma.Decimal(0);
    const remaining = cap.minus(used);
    if (remaining.lessThanOrEqualTo(0)) return new Prisma.Decimal(0);
    return amount.greaterThan(remaining) ? remaining : amount;
  }
}
