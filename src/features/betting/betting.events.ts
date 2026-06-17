import { BetStatus } from '@prisma/client';

// Domain events emitted AFTER a bet's $transaction commits. The realtime gateway
// pushes live bet results to the player and loss-bonus signals to the agent.
export const BET_EVENTS = {
  PLACED: 'bet.placed',
  SETTLED: 'bet.settled',
} as const;

export interface BetPlacedEvent {
  betId: string;
  playerId: string;
  stake: string;
}

export interface BetSettledEvent {
  betId: string;
  playerId: string;
  status: BetStatus;
  payout: string;
  // Set only when the loss booked an agent commission.
  agentId?: string;
  lossCommission?: string;
}
