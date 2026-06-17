import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  AgentStatus,
  LedgerAccountKind,
  LedgerDirection,
  LedgerRefType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';
import { Decimal, formatMoney, parseRate } from '../../common/money';
import { LedgerService } from '../ledger/ledger.service';
import { CURRENCY } from '../transactions/transactions.constants';
import { CreateAgentDto } from './dto/create-agent.dto';
import { AgentView } from './agents.types';

const AGENT_INCLUDE = {
  wallet: { include: { account: true } },
  commissionConfig: true,
} satisfies Prisma.AgentInclude;

type AgentWithRelations = Prisma.AgentGetPayload<{
  include: typeof AGENT_INCLUDE;
}>;

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Create an agent on behalf of an operator: provision the Supabase auth user,
   * then the AgentAccount + Agent + AgentWallet bridge + CommissionConfig and any
   * initial credit float — all in one DB transaction. If the DB work fails the
   * orphan auth user is deleted (compensation) so the two stores stay in sync.
   */
  async createAgent(
    operatorId: string,
    dto: CreateAgentDto,
  ): Promise<AgentView> {
    const rates = {
      claimCommissionRate: parseRate(
        dto.claimCommissionRate ?? '0',
        'claimCommissionRate',
      ),
      depositCommissionRate: parseRate(
        dto.depositCommissionRate ?? '0',
        'depositCommissionRate',
      ),
      withdrawalCommissionRate: parseRate(
        dto.withdrawalCommissionRate ?? '0',
        'withdrawalCommissionRate',
      ),
      playerLossBonusRate: parseRate(
        dto.playerLossBonusRate ?? '0',
        'playerLossBonusRate',
      ),
    };
    const dailyCapAmount = this.parseNonNegative(
      dto.dailyCapAmount,
      'dailyCapAmount',
    );
    const weeklyCapAmount = this.parseNonNegative(
      dto.weeklyCapAmount,
      'weeklyCapAmount',
    );
    const initialCredit = this.parseNonNegative(
      dto.initialCredit,
      'initialCredit',
    );

    const supabaseUserId = await this.createAuthUser(dto);

    try {
      const agent = await this.prisma.$transaction(async (tx) => {
        const account = await tx.agentAccount.create({
          data: { currency: CURRENCY },
        });
        const created = await tx.agent.create({
          data: {
            supabaseUserId,
            operatorId,
            name: dto.name,
            phone: dto.phone,
            status: AgentStatus.ACTIVE,
          },
        });
        await tx.agentWallet.create({
          data: { agentId: created.id, accountId: account.id },
        });
        await tx.commissionConfig.create({
          data: {
            agentId: created.id,
            ...rates,
            dailyCapAmount,
            weeklyCapAmount,
            claimEnabled: dto.claimEnabled ?? true,
            depositEnabled: dto.depositEnabled ?? true,
            withdrawalEnabled: dto.withdrawalEnabled ?? true,
            playerLossEnabled: dto.playerLossEnabled ?? true,
          },
        });

        if (initialCredit && initialCredit.greaterThan(0)) {
          // Operator funds the float — booked via the ledger, attributed to the
          // operator as the actor, so the audit trail is complete.
          await this.ledger.applyMovement(tx, {
            accountKind: LedgerAccountKind.AGENT_CREDIT,
            ownerId: created.id,
            accountId: account.id,
            accountModel: 'agentAccount',
            direction: LedgerDirection.CREDIT,
            amount: initialCredit,
            currency: CURRENCY,
            balanceField: 'creditBalance',
            refType: LedgerRefType.ADMIN_ADJUSTMENT,
            refId: created.id,
            reason: 'INITIAL_CREDIT',
            actorType: ActorType.OPERATOR,
            actorId: operatorId,
          });
        }

        return tx.agent.findUniqueOrThrow({
          where: { id: created.id },
          include: AGENT_INCLUDE,
        });
      });

      await this.supabase.admin.auth.admin.updateUserById(supabaseUserId, {
        app_metadata: { platform_role: 'AGENT', platform_id: agent.id },
      });

      return this.toView(agent);
    } catch (err) {
      // Roll back the auth user so a failed create leaves nothing behind.
      await this.supabase.admin.auth.admin
        .deleteUser(supabaseUserId)
        .catch(() => undefined);
      throw err;
    }
  }

  async listAgents(operatorId: string): Promise<AgentView[]> {
    const agents = await this.prisma.agent.findMany({
      where: { operatorId },
      include: AGENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return agents.map((a) => this.toView(a));
  }

  async getAgent(operatorId: string, id: string): Promise<AgentView> {
    const agent = await this.prisma.agent.findFirst({
      where: { id, operatorId },
      include: AGENT_INCLUDE,
    });
    if (!agent) throw new NotFoundException('AGENT_NOT_FOUND');
    return this.toView(agent);
  }

  async setStatus(
    operatorId: string,
    id: string,
    status: AgentStatus,
  ): Promise<AgentView> {
    await this.prisma.$transaction(async (tx) => {
      // Scope the update to the operator's own agents — a foreign agent simply
      // isn't found for this operator.
      const res = await tx.agent.updateMany({
        where: { id, operatorId },
        data: { status },
      });
      if (res.count === 0) throw new NotFoundException('AGENT_NOT_FOUND');

      // Suspending an agent hands its players to the operator's other active
      // agents, spread as evenly as possible. If there are none, the players
      // stay put until an active agent exists.
      if (status === AgentStatus.SUSPENDED) {
        await this.reassignPlayers(tx, operatorId, id);
      }
    });
    return this.getAgent(operatorId, id);
  }

  /**
   * Redistribute a suspended agent's players across the operator's other active
   * agents, round-robin for an even spread. No-op when the agent has no players
   * or the operator has no other active agent. Money is untouched — only the
   * referral link (Player.agentId) moves, so future commissions flow to the new
   * agent.
   */
  private async reassignPlayers(
    tx: Prisma.TransactionClient,
    operatorId: string,
    suspendedAgentId: string,
  ): Promise<void> {
    const targets = await tx.agent.findMany({
      where: {
        operatorId,
        status: AgentStatus.ACTIVE,
        id: { not: suspendedAgentId },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (targets.length === 0) return;

    const players = await tx.player.findMany({
      where: { agentId: suspendedAgentId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (players.length === 0) return;

    // Bucket players per target so each target is a single updateMany.
    const buckets = new Map<string, string[]>();
    players.forEach((p, i) => {
      const target = targets[i % targets.length].id;
      const bucket = buckets.get(target) ?? [];
      bucket.push(p.id);
      buckets.set(target, bucket);
    });

    for (const [agentId, playerIds] of buckets) {
      await tx.player.updateMany({
        where: { id: { in: playerIds } },
        data: { agentId },
      });
    }
  }

  // ---- Helpers -------------------------------------------------------------

  private async createAuthUser(dto: CreateAgentDto): Promise<string> {
    const { data, error } = await this.supabase.admin.auth.admin.createUser({
      phone: dto.phone,
      password: dto.password,
      email: dto.email,
      phone_confirm: true,
      email_confirm: dto.email ? true : undefined,
    });
    if (error) {
      // Supabase returns 422 for an already-registered identity.
      if (error.status === 422) {
        throw new ConflictException('AGENT_IDENTITY_EXISTS');
      }
      throw new BadRequestException(error.message);
    }
    if (!data.user) throw new BadRequestException('AUTH_USER_CREATION_FAILED');
    return data.user.id;
  }

  private parseNonNegative(
    raw: string | undefined,
    field: string,
  ): Decimal | null {
    if (raw === undefined) return null;
    const value = new Decimal(raw);
    if (value.lessThan(0)) {
      throw new BadRequestException(`${field}: must not be negative`);
    }
    return value;
  }

  private toView(agent: AgentWithRelations): AgentView {
    const account = agent.wallet?.account;
    const cfg = agent.commissionConfig;
    return {
      id: agent.id,
      operatorId: agent.operatorId,
      name: agent.name,
      phone: agent.phone,
      status: agent.status,
      creditBalance: formatMoney(account?.creditBalance ?? new Decimal(0)),
      commissionBalance: formatMoney(
        account?.commissionBalance ?? new Decimal(0),
      ),
      createdAt: agent.createdAt,
      commissionConfig: cfg
        ? {
            claimCommissionRate: cfg.claimCommissionRate.toString(),
            depositCommissionRate: cfg.depositCommissionRate.toString(),
            withdrawalCommissionRate: cfg.withdrawalCommissionRate.toString(),
            playerLossBonusRate: cfg.playerLossBonusRate.toString(),
            dailyCapAmount: cfg.dailyCapAmount
              ? formatMoney(cfg.dailyCapAmount)
              : null,
            weeklyCapAmount: cfg.weeklyCapAmount
              ? formatMoney(cfg.weeklyCapAmount)
              : null,
            claimEnabled: cfg.claimEnabled,
            depositEnabled: cfg.depositEnabled,
            withdrawalEnabled: cfg.withdrawalEnabled,
            playerLossEnabled: cfg.playerLossEnabled,
          }
        : null,
    };
  }
}
