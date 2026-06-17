import { TransactionType } from '@prisma/client';

// Domain events emitted AFTER a transaction's $transaction commits. A future
// WebSocket gateway subscribes via @OnEvent to push live queue/balance updates;
// no service change required when that lands.
export const TRANSACTION_EVENTS = {
  CREATED: 'transaction.created',
  CLAIMED: 'transaction.claimed',
  COMPLETED: 'transaction.completed',
} as const;

export interface TransactionCreatedEvent {
  transactionId: string;
  type: TransactionType;
  playerId: string;
  amount: string;
}

export interface TransactionClaimedEvent {
  transactionId: string;
  agentId: string;
  playerId: string;
}

export interface TransactionCompletedEvent {
  transactionId: string;
  type: TransactionType;
  agentId: string;
  playerId: string;
  amount: string;
}
