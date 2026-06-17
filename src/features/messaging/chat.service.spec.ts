import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { ChatService } from './chat.service';

const PLAYER: AuthUser = {
  supabaseId: 's',
  email: 'p',
  role: 'PLAYER',
  id: 'p1',
};
const AGENT: AuthUser = {
  supabaseId: 's',
  email: 'a',
  role: 'AGENT',
  id: 'a1',
};

function build(txn: unknown, thread: unknown = { id: 'th1' }) {
  const prisma = {
    transaction: { findUnique: jest.fn().mockResolvedValue(txn) },
    chatThread: { findUnique: jest.fn().mockResolvedValue(thread) },
    chatMessage: {
      create: jest.fn().mockResolvedValue({ id: 'm1' }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  const service = new ChatService(prisma as never);
  return { service, prisma };
}

const CLAIMED = { playerId: 'p1', agentId: 'a1' };

describe('ChatService', () => {
  describe('assertParticipant', () => {
    it('allows the owning player', async () => {
      const { service } = build(CLAIMED);
      await expect(
        service.assertParticipant(PLAYER, 't1'),
      ).resolves.toMatchObject({ threadId: 'th1' });
    });

    it('allows the claiming agent', async () => {
      const { service } = build(CLAIMED);
      await expect(
        service.assertParticipant(AGENT, 't1'),
      ).resolves.toMatchObject({ threadId: 'th1' });
    });

    it('rejects a non-participant', async () => {
      const { service } = build({ playerId: 'other', agentId: 'someone' });
      await expect(service.assertParticipant(PLAYER, 't1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects when the chat thread is not open yet', async () => {
      const { service } = build(CLAIMED, null);
      await expect(service.assertParticipant(AGENT, 't1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('sendMessage', () => {
    it('persists with the sender role mapped to ActorType', async () => {
      const { service, prisma } = build(CLAIMED);
      await service.sendMessage(AGENT, 't1', 'hello');
      expect(prisma.chatMessage.create).toHaveBeenCalledWith({
        data: {
          threadId: 'th1',
          senderType: 'AGENT',
          senderId: 'a1',
          body: 'hello',
        },
      });
    });
  });

  describe('markRead', () => {
    it("marks the counterparty's unread messages read", async () => {
      const { service, prisma } = build(CLAIMED);
      const count = await service.markRead(PLAYER, 't1');
      expect(count).toBe(2);
      expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith({
        where: { threadId: 'th1', senderType: 'AGENT', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
