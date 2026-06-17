export interface BetSelectionView {
  marketName: string;
  selectionName: string;
  oddsAtPlacement: string;
  result: string;
}

export interface BetView {
  id: string;
  playerId: string;
  gameId: string;
  type: string;
  status: string;
  stake: string;
  totalOdds: string;
  potentialReturn: string;
  payout: string;
  acceptBetterOdds: boolean;
  placedAt: Date;
  settledAt: Date | null;
  selections: BetSelectionView[];
}
