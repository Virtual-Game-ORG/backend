import { BadRequestException, ConflictException } from '@nestjs/common';
import { BetStatus, Prisma } from '@prisma/client';
import { CommissionService } from '../commission/commission.service';
import { LedgerService } from '../ledger/ledger.service';
import { BettingService } from './betting.service';
import { PlaceBetDto } from './dto/place-bet.dto';

const D = (v: number | string) => new Prisma.Decimal(v);

const GAME = { id: 'g1', enabled: true, minBet: D(10), maxBet: D(100000) };

const OPEN_BET = {
  id: 'b1',
  playerId: 'p1',
  gameId: 'g1',
  type: 'SINGLE',
  stake: D(500),
  totalOdds: D(2),
  potentialReturn: D(1000),
  payout: D(0),
  status: BetStatus.OPEN,
  acceptBetterOdds: false,
  placedAt: new Date('2026-01-01'),
  settledAt: null,
  selections: [
    {
      marketName: 'm',
      selectionName: 's',
      oddsAtPlacement: D(2),
      result: 'PENDING',
    },
  ],
};

function build() {
  const db = {
    bet: {
      create: jest.fn().mockResolvedValue(OPEN_BET),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(OPEN_BET),
    },
    betSelection: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    notification: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    game: { findUnique: jest.fn().mockResolvedValue(GAME) },
    bet: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    player: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ agentId: 'ag1' }),
    },
    playerWallet: {
      findUnique: jest.fn().mockResolvedValue({ walletId: 'w1' }),
    },
    agentWallet: {
      findUnique: jest.fn().mockResolvedValue({ accountId: 'aAcc' }),
    },
    $transaction: jest.fn((cb: (c: typeof db) => unknown) => cb(db)),
  };
  const ledger = {
    debitPlayerReal: jest.fn().mockResolvedValue({ balanceAfter: D(0) }),
    creditPlayerReal: jest.fn().mockResolvedValue({ balanceAfter: D(0) }),
    applyMovement: jest.fn().mockResolvedValue({ balanceAfter: D(0) }),
  } as unknown as jest.Mocked<LedgerService>;
  const commission = {
    computeAndLog: jest.fn().mockResolvedValue({
      amount: D(25),
      rateApplied: D('0.05'),
      capped: false,
    }),
  } as unknown as jest.Mocked<CommissionService>;
  const events = { emit: jest.fn() };
  const service = new BettingService(
    prisma as never,
    ledger,
    commission,
    events as never,
  );
  return { service, prisma, db, ledger, commission, events };
}

const placeDto: PlaceBetDto = {
  gameId: 'g1',
  type: 'SINGLE',
  stake: '500',
  selections: [{ marketName: 'm', selectionName: 's', odds: '2.0' }],
};

describe('BettingService', () => {
  describe('placeBet', () => {
    it('debits the stake and creates an OPEN bet', async () => {
      const { service, db, ledger, events } = build();
      await service.placeBet('p1', placeDto);
      expect(db.bet.create).toHaveBeenCalled();
      expect(ledger.debitPlayerReal).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ amount: D(500), refType: 'BET' }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'bet.placed',
        expect.objectContaining({ betId: 'b1', stake: '500.00' }),
      );
    });

    it('rejects a stake outside the game min/max', async () => {
      const { service } = build();
      await expect(
        service.placeBet('p1', { ...placeDto, stake: '5' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a disabled game', async () => {
      const { service, prisma } = build();
      prisma.game.findUnique.mockResolvedValue({ ...GAME, enabled: false });
      await expect(service.placeBet('p1', placeDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('settle', () => {
    it('LOST books the player-loss commission to the agent and notifies', async () => {
      const { service, prisma, db, ledger, commission, events } = build();
      prisma.bet.findUnique.mockResolvedValue(OPEN_BET);

      await service.settle('op1', 'b1', { result: 'LOST' });

      expect(commission.computeAndLog).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          agentId: 'ag1',
          betId: 'b1',
          type: 'PLAYER_LOSS',
          base: D(500),
        }),
      );
      expect(ledger.applyMovement).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          accountKind: 'AGENT_COMMISSION',
          direction: 'CREDIT',
          amount: D(25),
        }),
      );
      expect(ledger.creditPlayerReal).not.toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'bet.settled',
        expect.objectContaining({
          status: 'LOST',
          agentId: 'ag1',
          lossCommission: '25.00',
        }),
      );
    });

    it('WON pays out potentialReturn and books no commission', async () => {
      const { service, prisma, ledger, commission } = build();
      prisma.bet.findUnique.mockResolvedValue(OPEN_BET);
      await service.settle('op1', 'b1', { result: 'WON' });
      expect(ledger.creditPlayerReal).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: D(1000), reason: 'BET_PAYOUT' }),
      );
      expect(commission.computeAndLog).not.toHaveBeenCalled();
    });

    it('VOID refunds the stake', async () => {
      const { service, prisma, ledger } = build();
      prisma.bet.findUnique.mockResolvedValue(OPEN_BET);
      await service.settle('op1', 'b1', { result: 'VOID' });
      expect(ledger.creditPlayerReal).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: D(500), reason: 'BET_VOID_REFUND' }),
      );
    });

    it('rejects settling an already-settled bet', async () => {
      const { service, prisma } = build();
      prisma.bet.findUnique.mockResolvedValue({
        ...OPEN_BET,
        status: BetStatus.WON,
      });
      await expect(
        service.settle('op1', 'b1', { result: 'LOST' }),
      ).rejects.toThrow(ConflictException);
    });

    it('LOST still settles when commission is zero (no ledger credit)', async () => {
      const { service, prisma, ledger, commission } = build();
      prisma.bet.findUnique.mockResolvedValue(OPEN_BET);
      (commission.computeAndLog as jest.Mock).mockResolvedValue({
        amount: D(0),
        rateApplied: D(0),
        capped: false,
      });
      await service.settle('op1', 'b1', { result: 'LOST' });
      expect(ledger.applyMovement).not.toHaveBeenCalled();
    });
  });
});
