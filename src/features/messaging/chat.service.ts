import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActorType, ChatMessage, ChatSubjectType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto';

export interface ChatParticipants {
  threadId: string;
  playerId: string;
  agentId: string | null;
}

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Authorize a player/agent for a transaction's chat and resolve its thread.
   * Only the owning player or the claiming agent may participate. The thread is
   * opened when an agent claims the transaction, so a missing thread means chat
   * isn't open yet.
   */
  async assertParticipant(
    user: AuthUser,
    transactionId: string,
  ): Promise<ChatParticipants> {
    const txn = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { playerId: true, agentId: true },
    });
    if (!txn) throw new NotFoundException('TRANSACTION_NOT_FOUND');

    const isPlayer = user.role === 'PLAYER' && user.id === txn.playerId;
    const isAgent = user.role === 'AGENT' && user.id === txn.agentId;
    if (!isPlayer && !isAgent) {
      throw new ForbiddenException('FORBIDDEN_NOT_PARTICIPANT');
    }

    const thread = await this.prisma.chatThread.findUnique({
      where: {
        subjectType_subjectId: {
          subjectType: ChatSubjectType.TRANSACTION,
          subjectId: transactionId,
        },
      },
      select: { id: true },
    });
    if (!thread) throw new ConflictException('CHAT_NOT_OPEN');

    return {
      threadId: thread.id,
      playerId: txn.playerId,
      agentId: txn.agentId,
    };
  }

  async sendMessage(
    user: AuthUser,
    transactionId: string,
    body: string,
  ): Promise<ChatMessage> {
    const { threadId } = await this.assertParticipant(user, transactionId);
    return this.prisma.chatMessage.create({
      data: {
        threadId,
        senderType: this.actorType(user),
        senderId: user.id,
        body,
      },
    });
  }

  async listMessages(
    user: AuthUser,
    transactionId: string,
    query: ListMessagesQueryDto,
  ): Promise<ChatMessage[]> {
    const { threadId } = await this.assertParticipant(user, transactionId);
    return this.prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      take: query.take,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
  }

  /** Mark the counterparty's unread messages as read. Returns the count updated. */
  async markRead(user: AuthUser, transactionId: string): Promise<number> {
    const { threadId } = await this.assertParticipant(user, transactionId);
    const counterparty =
      user.role === 'PLAYER' ? ActorType.AGENT : ActorType.PLAYER;
    const res = await this.prisma.chatMessage.updateMany({
      where: { threadId, senderType: counterparty, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }

  private actorType(user: AuthUser): ActorType {
    return user.role === 'PLAYER' ? ActorType.PLAYER : ActorType.AGENT;
  }
}
