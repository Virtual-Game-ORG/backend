export interface PeriodStats {
  depositVolume: string;
  depositCount: number;
  withdrawalVolume: string;
  withdrawalCount: number;
  commissionPaid: string;
  houseRevenue: string;
}

export interface PlatformSummary {
  today: PeriodStats;
  week: PeriodStats;
  month: PeriodStats;
  totals: {
    pendingCount: number;
    completedCount: number;
    agentCount: number;
    playerCount: number;
  };
}

export interface AgentPerformanceRow {
  agentId: string;
  name: string;
  status: string;
  creditBalance: string;
  commissionBalance: string;
  volume: string;
  transactionsProcessed: number;
  commissionPaid: string;
  activePlayers: number;
}

export interface AuditEntryView {
  id: string;
  accountKind: string;
  ownerId: string;
  direction: string;
  amount: string;
  balanceAfter: string;
  currency: string;
  refType: string;
  refId: string;
  reason: string | null;
  actorType: string;
  actorId: string | null;
  createdAt: Date;
}
