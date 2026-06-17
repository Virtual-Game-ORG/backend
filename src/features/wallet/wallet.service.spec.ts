import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WalletService } from './wallet.service';

const D = (v: number | string) => new Prisma.Decimal(v);

function build(link: unknown) {
  const prisma = {
    playerWallet: { findUnique: jest.fn().mockResolvedValue(link) },
  };
  return { service: new WalletService(prisma as never), prisma };
}

describe('WalletService', () => {
  it('returns the balance breakdown as formatted money strings', async () => {
    const { service } = build({
      wallet: {
        currency: 'ETB',
        balance: D('1000'),
        withdrawableBalance: D('800.5'),
        lockedBalance: D('200'),
        bonusBalance: D('0'),
      },
    });
    await expect(service.getPlayerWallet('p1')).resolves.toEqual({
      currency: 'ETB',
      total: '1000.00',
      withdrawable: '800.50',
      locked: '200.00',
      bonus: '0.00',
    });
  });

  it('throws when the player has no wallet', async () => {
    const { service } = build(null);
    await expect(service.getPlayerWallet('p1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
