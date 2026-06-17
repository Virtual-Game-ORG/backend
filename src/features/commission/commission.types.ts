import { CommissionType, Prisma } from '@prisma/client';

export interface ComputeCommissionInput {
  agentId: string;
  playerId?: string;
  transactionId?: string;
  betId?: string;
  type: CommissionType;
  /** Amount the commission rate is applied to. */
  base: Prisma.Decimal;
}

export interface CommissionResult {
  amount: Prisma.Decimal;
  rateApplied: Prisma.Decimal;
  /** True when the daily/weekly cap clamped the computed amount. */
  capped: boolean;
}
