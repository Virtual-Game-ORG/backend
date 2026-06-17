export interface AgentCommissionView {
  claimCommissionRate: string;
  depositCommissionRate: string;
  withdrawalCommissionRate: string;
  playerLossBonusRate: string;
  dailyCapAmount: string | null;
  weeklyCapAmount: string | null;
  claimEnabled: boolean;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  playerLossEnabled: boolean;
}

export interface AgentView {
  id: string;
  operatorId: string;
  name: string;
  phone: string | null;
  status: string;
  creditBalance: string;
  commissionBalance: string;
  createdAt: Date;
  commissionConfig: AgentCommissionView | null;
}
