import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActorType,
  BetStatus,
  CommissionType,
  LedgerAccountKind,
  LedgerDirection,
  LedgerRefType,
  NotificationType,
  Prisma,
  SelectionResult,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Decimal, formatMoney, parseMoneyValue } from '../../common/money';
import { CommissionService } from '../commission/commission.service';
import { LedgerService } from '../ledger/ledger.service';
import { CURRENCY } from '../transactions/transactions.constants';
import { PlaceBetDto } from './dto/place-bet.dto';
import { SettleBetDto } from './dto/settle-bet.dto';
import { ListBetsQueryDto } from './dto/list-bets.query.dto';
import { BetView } from './bet.types';
import { BET_EVENTS } from './betting.events';

const BET_INCLUDE = { selections: true } satisfies Prisma.BetInclude;
type BetWithSelections = Prisma.BetGetPayload<{ include: typeof BET_INCLUDE }>;

const RESULT_TO_BET_STATUS: Record<SettleBetDto['result'], BetStatus> = {
  WON: BetStatus.WON,
  LOST: BetStatus.LOST,
  VOID: BetStatus.VOID,
};
const RESULT_TO_SELECTION: Record<SettleBetDto['result'], SelectionResult> = {
  WON: SelectionResult.WON,
  LOST: SelectionResult.LOST,
  VOID: SelectionResult.VOID,
};

@Injectable()
export class BettingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly commission: CommissionService,
    private readonly events: EventEmitter2,
  ) {}

  // ---- Player: place + read ------------------------------------------------

  async placeBet(playerId: string, dto: PlaceBetDto): Promise<BetView> {
    const game = await this.prisma.game.findUnique({
      where: { id: dto.gameId },
    });
    if (!game) throw new NotFoundException('GAME_NOT_FOUND');
    if (!game.enabled) throw new ConflictException('GAME_DISABLED');

    const stake = parseMoneyValue(dto.stake, 'stake');
    if (stake.lessThan(game.minBet) || stake.greaterThan(game.maxBet)) {
      throw new BadRequestException('STAKE_OUT_OF_RANGE');
    }

    let totalOdds = new Decimal(1);
    for (const sel of dto.selections) {
      const odds = new Decimal(sel.odds);
      if (odds.lessThan(1)) throw new BadRequestException('INVALID_ODDS');
      totalOdds = totalOdds.mul(odds);
    }
    const potentialReturn = stake.mul(totalOdds);
    const walletId = await this.resolvePlayerWalletId(playerId);

    const bet = await this.prisma.$transaction(async (db) => {
      const created = await db.bet.create({
        data: {
          playerId,
          gameId: dto.gameId,
          type: dto.type,
          stake,
          totalOdds,
          potentialReturn,
          payout: new Decimal(0),
          status: BetStatus.OPEN,
          acceptBetterOdds: dto.acceptBetterOdds ?? false,
          usedBonus: false,
          selections: {
            create: dto.selections.map((s) => ({
              marketName: s.marketName,
              selectionName: s.selectionName,
              oddsAtPlacement: new Decimal(s.odds),
              result: SelectionResult.PENDING,
            })),
          },
        },
        include: BET_INCLUDE,
      });
      // Debit the stake; rolls the whole bet back if funds are short.
      await this.ledger.debitPlayerReal(db, {
        playerId,
        walletId,
        amount: stake,
        currency: CURRENCY,
        refType: LedgerRefType.BET,
        refId: created.id,
        reason: 'BET_STAKE',
        actorType: ActorType.PLAYER,
        actorId: playerId,
      });
      return created;
    });

    this.events.emit(BET_EVENTS.PLACED, {
      betId: bet.id,
      playerId,
      stake: formatMoney(stake),
    });
    return this.toView(bet);
  }

  async listForPlayer(
    playerId: string,
    query: ListBetsQueryDto,
  ): Promise<BetView[]> {
    const bets = await this.prisma.bet.findMany({
      where: { playerId, status: query.status },
      include: BET_INCLUDE,
      orderBy: { placedAt: 'desc' },
      take: query.take,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
    return bets.map((b) => this.toView(b));
  }

  async getBet(playerId: string, id: string): Promise<BetView> {
    const bet = await this.prisma.bet.findFirst({
      where: { id, playerId },
      include: BET_INCLUDE,
    });
    if (!bet) throw new NotFoundException('BET_NOT_FOUND');
    return this.toView(bet);
  }

  // ---- Operator: settle ----------------------------------------------------

  async settle(
    operatorId: string,
    id: string,
    dto: SettleBetDto,
  ): Promise<BetView> {
    const bet = await this.prisma.bet.findUnique({ where: { id } });
    if (!bet) throw new NotFoundException('BET_NOT_FOUND');
    if (bet.status !== BetStatus.OPEN) {
      throw new ConflictException('BET_ALREADY_SETTLED');
    }

    const result = dto.result;
    const payout =
      result === 'WON'
        ? dto.payout
          ? parseMoneyValue(dto.payout, 'payout')
          : bet.potentialReturn
        : new Decimal(0);

    // Pre-resolve the accounts each branch needs (reads outside the tx).
    const walletId =
      result === 'WON' || result === 'VOID'
        ? await this.resolvePlayerWalletId(bet.playerId)
        : undefined;
    let agentId: string | null = null;
    let agentAccountId: string | undefined;
    if (result === 'LOST') {
      const player = await this.prisma.player.findUniqueOrThrow({
        where: { id: bet.playerId },
        select: { agentId: true },
      });
      agentId = player.agentId;
      agentAccountId = await this.resolveAgentAccountId(agentId);
    }

    let lossCommission: Decimal | undefined;

    const settled = await this.prisma.$transaction(async (db) => {
      const res = await db.bet.updateMany({
        where: { id, status: BetStatus.OPEN },
        data: {
          status: RESULT_TO_BET_STATUS[result],
          settledAt: new Date(),
          payout,
        },
      });
      if (res.count === 0) throw new ConflictException('BET_ALREADY_SETTLED');
      await db.betSelection.updateMany({
        where: { betId: id },
        data: { result: RESULT_TO_SELECTION[result] },
      });

      if (result === 'WON') {
        await this.ledger.creditPlayerReal(db, {
          playerId: bet.playerId,
          walletId: walletId!,
          amount: payout,
          currency: CURRENCY,
          refType: LedgerRefType.BET,
          refId: id,
          reason: 'BET_PAYOUT',
          actorType: ActorType.OPERATOR,
          actorId: operatorId,
        });
      } else if (result === 'VOID') {
        await this.ledger.creditPlayerReal(db, {
          playerId: bet.playerId,
          walletId: walletId!,
          amount: bet.stake,
          currency: CURRENCY,
          refType: LedgerRefType.BET,
          refId: id,
          reason: 'BET_VOID_REFUND',
          actorType: ActorType.OPERATOR,
          actorId: operatorId,
        });
      } else if (agentId) {
        // LOST → the player's referring agent earns the configured loss bonus.
        const c = await this.commission.computeAndLog(db, {
          agentId,
          playerId: bet.playerId,
          betId: id,
          type: CommissionType.PLAYER_LOSS,
          base: bet.stake,
        });
        if (c.amount.greaterThan(0)) {
          await this.ledger.applyMovement(db, {
            accountKind: LedgerAccountKind.AGENT_COMMISSION,
            ownerId: agentId,
            accountId: agentAccountId!,
            accountModel: 'agentAccount',
            direction: LedgerDirection.CREDIT,
            amount: c.amount,
            currency: CURRENCY,
            balanceField: 'commissionBalance',
            refType: LedgerRefType.BET,
            refId: id,
            reason: 'PLAYER_LOSS_BONUS',
            actorType: ActorType.OPERATOR,
            actorId: operatorId,
          });
          await db.notification.create({
            data: {
              recipientType: ActorType.AGENT,
              recipientId: agentId,
              type: NotificationType.SYSTEM,
              payload: { betId: id, lossCommission: formatMoney(c.amount) },
            },
          });
          lossCommission = c.amount;
        }
      }

      await db.notification.create({
        data: {
          recipientType: ActorType.PLAYER,
          recipientId: bet.playerId,
          type: NotificationType.BET_RESULT,
          payload: { betId: id, status: result, payout: formatMoney(payout) },
        },
      });

      return db.bet.findUniqueOrThrow({ where: { id }, include: BET_INCLUDE });
    });

    this.events.emit(BET_EVENTS.SETTLED, {
      betId: id,
      playerId: bet.playerId,
      status: RESULT_TO_BET_STATUS[result],
      payout: formatMoney(payout),
      ...(lossCommission && {
        agentId: agentId ?? undefined,
        lossCommission: formatMoney(lossCommission),
      }),
    });
    return this.toView(settled);
  }

  // ---- Helpers -------------------------------------------------------------

  private async resolvePlayerWalletId(playerId: string): Promise<string> {
    const link = await this.prisma.playerWallet.findUnique({
      where: { playerId },
      select: { walletId: true },
    });
    if (!link) throw new NotFoundException('PLAYER_WALLET_NOT_FOUND');
    return link.walletId;
  }

  private async resolveAgentAccountId(agentId: string): Promise<string> {
    const link = await this.prisma.agentWallet.findUnique({
      where: { agentId },
      select: { accountId: true },
    });
    if (!link) throw new NotFoundException('AGENT_ACCOUNT_NOT_FOUND');
    return link.accountId;
  }

  private toView(bet: BetWithSelections): BetView {
    return {
      id: bet.id,
      playerId: bet.playerId,
      gameId: bet.gameId,
      type: bet.type,
      status: bet.status,
      stake: formatMoney(bet.stake),
      totalOdds: bet.totalOdds.toString(),
      potentialReturn: formatMoney(bet.potentialReturn),
      payout: formatMoney(bet.payout),
      acceptBetterOdds: bet.acceptBetterOdds,
      placedAt: bet.placedAt,
      settledAt: bet.settledAt,
      selections: bet.selections.map((s) => ({
        marketName: s.marketName,
        selectionName: s.selectionName,
        oddsAtPlacement: s.oddsAtPlacement.toString(),
        result: s.result,
      })),
    };
  }
}
