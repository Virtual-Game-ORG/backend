import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';

function build() {
  const db = {
    player: { create: jest.fn().mockResolvedValue({ id: 'p1', agentId: 'a1' }) },
    wallet: { create: jest.fn().mockResolvedValue({ id: 'w1' }) },
    playerWallet: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    player: { findUnique: jest.fn().mockResolvedValue(null) },
    agent: { findUnique: jest.fn() },
    $transaction: jest.fn((cb: (c: typeof db) => unknown) => cb(db)),
  };
  const supabase = {
    admin: { auth: { admin: { updateUserById: jest.fn().mockResolvedValue({}) } } },
  };
  const service = new AuthService(prisma as never, supabase as never);
  return { service, prisma, db, supabase };
}

describe('AuthService.provision', () => {
  const dto = { agentId: 'a1' };

  it('provisions a player under an active agent and stamps PLAYER claims', async () => {
    const { service, prisma, db, supabase } = build();
    prisma.agent.findUnique.mockResolvedValue({ id: 'a1', status: 'ACTIVE' });

    const player = await service.provision('sb-1', dto);

    expect(player).toEqual({ id: 'p1', agentId: 'a1' });
    expect(db.player.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ agentId: 'a1' }) }),
    );
    expect(supabase.admin.auth.admin.updateUserById).toHaveBeenCalledWith('sb-1', {
      app_metadata: { platform_role: 'PLAYER', platform_id: 'p1' },
    });
  });

  it('rejects an unknown agent', async () => {
    const { service, prisma } = build();
    prisma.agent.findUnique.mockResolvedValue(null);
    await expect(service.provision('sb-1', dto)).rejects.toThrow(NotFoundException);
  });

  it('rejects a suspended agent — no new players under it', async () => {
    const { service, prisma, db } = build();
    prisma.agent.findUnique.mockResolvedValue({ id: 'a1', status: 'SUSPENDED' });
    await expect(service.provision('sb-1', dto)).rejects.toThrow(BadRequestException);
    expect(db.player.create).not.toHaveBeenCalled();
  });

  it('is idempotent — returns the existing player without re-checking the agent', async () => {
    const { service, prisma } = build();
    prisma.player.findUnique.mockResolvedValue({ id: 'pX', agentId: 'a1' });
    const player = await service.provision('sb-1', dto);
    expect(player).toEqual({ id: 'pX', agentId: 'a1' });
    expect(prisma.agent.findUnique).not.toHaveBeenCalled();
  });
});
