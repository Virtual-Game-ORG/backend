import { Injectable, NotFoundException } from '@nestjs/common';
import { Player } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';
import { ProvisionDto } from './dto/provision.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async provision(supabaseId: string, dto: ProvisionDto): Promise<Player> {
    const existing = await this.prisma.player.findUnique({
      where: { supabaseUserId: supabaseId },
    });
    if (existing) return existing;

    // Players are linked at registration to the agent who referred them, so the
    // referring agent must already exist (Player.agentId is a required FK).
    const agent = await this.prisma.agent.findUnique({
      where: { id: dto.agentId },
    });
    if (!agent) throw new NotFoundException('UNKNOWN_AGENT');

    const player = await this.prisma.$transaction(async (tx) => {
      const p = await tx.player.create({
        data: {
          supabaseUserId: supabaseId,
          agentId: dto.agentId,
          status: 'ACTIVE',
        },
      });
      const wallet = await tx.wallet.create({ data: { currency: 'ETB' } });
      await tx.playerWallet.create({
        data: { playerId: p.id, walletId: wallet.id },
      });
      return p;
    });

    await this.supabase.admin.auth.admin.updateUserById(supabaseId, {
      app_metadata: { platform_role: 'PLAYER', platform_id: player.id },
    });

    return player;
  }
}
