import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { formatMoney } from '../../common/money';
import { WalletView } from './wallet.types';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /** The player's balance breakdown, resolved via the PlayerWallet bridge. */
  async getPlayerWallet(playerId: string): Promise<WalletView> {
    const link = await this.prisma.playerWallet.findUnique({
      where: { playerId },
      include: { wallet: true },
    });
    if (!link) throw new NotFoundException('PLAYER_WALLET_NOT_FOUND');

    const w = link.wallet;
    return {
      currency: w.currency,
      total: formatMoney(w.balance),
      withdrawable: formatMoney(w.withdrawableBalance),
      locked: formatMoney(w.lockedBalance),
      bonus: formatMoney(w.bonusBalance),
    };
  }
}
