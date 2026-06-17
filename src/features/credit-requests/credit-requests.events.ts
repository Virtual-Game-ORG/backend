// Domain events emitted AFTER an AgentCreditRequest's $transaction commits. The
// realtime gateway fans these to the operator queue + agent rooms.
export const CREDIT_REQUEST_EVENTS = {
  CREATED: 'credit_request.created',
  CLAIMED: 'credit_request.claimed',
  COMPLETED: 'credit_request.completed',
} as const;

export interface CreditRequestCreatedEvent {
  requestId: string;
  agentId: string;
  amount: string;
}

export interface CreditRequestClaimedEvent {
  requestId: string;
  agentId: string;
  operatorId: string;
}

export interface CreditRequestCompletedEvent {
  requestId: string;
  agentId: string;
  operatorId: string;
  amount: string;
}
