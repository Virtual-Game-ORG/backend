import {
  ActorType,
  LedgerAccountKind,
  LedgerDirection,
  LedgerRefType,
  Prisma,
} from '@prisma/client';

/** A balance column on Wallet / AgentAccount / OperatorAccount. */
export type BalanceField =
  | 'balance'
  | 'withdrawableBalance'
  | 'lockedBalance'
  | 'bonusBalance'
  | 'creditBalance'
  | 'commissionBalance';

export interface MovementInput {
  accountKind: LedgerAccountKind;
  /** Domain owner id (playerId / agentId / operatorId) recorded on the ledger row. */
  ownerId: string;
  /** PK of the row whose balance is mutated (Wallet.id / AgentAccount.id / OperatorAccount.id). */
  accountId: string;
  /** Which model the accountId belongs to — selects the table to update. */
  accountModel: 'wallet' | 'agentAccount' | 'operatorAccount';
  direction: LedgerDirection;
  amount: Prisma.Decimal;
  currency: string;
  /** Balance column to mutate. CREDIT increments, DEBIT decrements. */
  balanceField: BalanceField;
  refType: LedgerRefType;
  refId: string;
  reason?: string;
  actorType: ActorType;
  actorId?: string;
  /**
   * Optional guard: only apply if the current balance is >= amount. Used for
   * DEBIT movements that must not overdraw (agent credit, withdrawable lock).
   */
  requireSufficient?: boolean;
  /** Error code thrown (400) when requireSufficient fails. */
  insufficientError?: string;
}

export interface MovementResult {
  balanceAfter: Prisma.Decimal;
  ledgerEntryId: string;
}
