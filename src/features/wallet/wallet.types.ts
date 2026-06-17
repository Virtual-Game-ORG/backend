// Player wallet breakdown shown in the balance widget. All amounts are 2-dp
// money strings; `total` is the full balance, `withdrawable` the slice eligible
// for withdrawal, `locked` funds reserved by pending withdrawals, `bonus` the
// separate bonus wallet.
export interface WalletView {
  currency: string;
  total: string;
  withdrawable: string;
  locked: string;
  bonus: string;
}
