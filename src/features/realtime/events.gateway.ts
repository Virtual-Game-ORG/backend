import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { AuthUser } from '../auth/auth.types';
import { SocketAuthService } from '../auth/socket-auth.service';
import { ChatService } from '../messaging/chat.service';
import { TRANSACTION_EVENTS } from '../transactions/transactions.events';
import type {
  TransactionClaimedEvent,
  TransactionCompletedEvent,
  TransactionCreatedEvent,
} from '../transactions/transactions.events';
import { CREDIT_REQUEST_EVENTS } from '../credit-requests/credit-requests.events';
import type {
  CreditRequestClaimedEvent,
  CreditRequestCompletedEvent,
  CreditRequestCreatedEvent,
} from '../credit-requests/credit-requests.events';
import { BET_EVENTS } from '../betting/betting.events';
import type {
  BetPlacedEvent,
  BetSettledEvent,
} from '../betting/betting.events';
import {
  AGENTS_QUEUE,
  OPERATORS_QUEUE,
  agentRoom,
  chatRoom,
  operatorRoom,
  playerRoom,
} from './rooms';

interface SocketWithUser extends Socket {
  data: { user?: AuthUser };
}

@WebSocketGateway()
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer() private readonly server: Server;
  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly socketAuth: SocketAuthService,
    private readonly chat: ChatService,
  ) {}

  // ---- Connection / auth ---------------------------------------------------

  async handleConnection(client: SocketWithUser): Promise<void> {
    try {
      const user = await this.socketAuth.verify(this.extractToken(client));
      client.data.user = user;
      // Targeted rooms for push, plus the shared queue room for agents.
      if (user.role === 'PLAYER') {
        await client.join(playerRoom(user.id));
      } else if (user.role === 'AGENT') {
        await client.join(agentRoom(user.id));
        await client.join(AGENTS_QUEUE);
      } else if (user.role === 'OPERATOR') {
        await client.join(operatorRoom(user.id));
        await client.join(OPERATORS_QUEUE);
      }
    } catch {
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;
    const header = client.handshake.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : '';
  }

  // ---- Domain event fan-out (post-commit, from TransactionsService) --------

  @OnEvent(TRANSACTION_EVENTS.CREATED)
  onCreated(payload: TransactionCreatedEvent): void {
    // A new PENDING request appears for every agent's queue.
    this.server.to(AGENTS_QUEUE).emit('queue:new', payload);
  }

  @OnEvent(TRANSACTION_EVENTS.CLAIMED)
  onClaimed(payload: TransactionClaimedEvent): void {
    // Other agents drop it from their NEW queue; the player is notified.
    this.server.to(AGENTS_QUEUE).emit('queue:claimed', {
      transactionId: payload.transactionId,
    });
    this.server
      .to(playerRoom(payload.playerId))
      .emit('transaction:claimed', payload);
  }

  @OnEvent(TRANSACTION_EVENTS.COMPLETED)
  onCompleted(payload: TransactionCompletedEvent): void {
    this.server
      .to(playerRoom(payload.playerId))
      .emit('transaction:completed', payload);
    // Relay a balance-changed signal; clients refetch the exact balance.
    this.server
      .to(playerRoom(payload.playerId))
      .emit('balance:changed', payload);
    this.server
      .to(agentRoom(payload.agentId))
      .emit('transaction:completed', payload);
  }

  // ---- Credit-request fan-out (Operator queue + agent float) ---------------

  @OnEvent(CREDIT_REQUEST_EVENTS.CREATED)
  onCreditCreated(payload: CreditRequestCreatedEvent): void {
    this.server.to(OPERATORS_QUEUE).emit('credit:new', payload);
  }

  @OnEvent(CREDIT_REQUEST_EVENTS.CLAIMED)
  onCreditClaimed(payload: CreditRequestClaimedEvent): void {
    this.server.to(OPERATORS_QUEUE).emit('credit:claimed', {
      requestId: payload.requestId,
    });
    this.server.to(agentRoom(payload.agentId)).emit('credit:claimed', payload);
  }

  @OnEvent(CREDIT_REQUEST_EVENTS.COMPLETED)
  onCreditCompleted(payload: CreditRequestCompletedEvent): void {
    this.server
      .to(agentRoom(payload.agentId))
      .emit('credit:completed', payload);
    // The agent's credit float changed → client refetches.
    this.server.to(agentRoom(payload.agentId)).emit('balance:changed', payload);
  }

  // ---- Bet fan-out (live results + balances) -------------------------------

  @OnEvent(BET_EVENTS.PLACED)
  onBetPlaced(payload: BetPlacedEvent): void {
    // Stake debited → the player's balance changed.
    this.server.to(playerRoom(payload.playerId)).emit('bet:placed', payload);
    this.server
      .to(playerRoom(payload.playerId))
      .emit('balance:changed', payload);
  }

  @OnEvent(BET_EVENTS.SETTLED)
  onBetSettled(payload: BetSettledEvent): void {
    this.server.to(playerRoom(payload.playerId)).emit('bet:settled', payload);
    this.server
      .to(playerRoom(payload.playerId))
      .emit('balance:changed', payload);
    // A loss bonus credited the agent's commission balance.
    if (payload.agentId && payload.lossCommission) {
      this.server
        .to(agentRoom(payload.agentId))
        .emit('commission:earned', payload);
      this.server
        .to(agentRoom(payload.agentId))
        .emit('balance:changed', payload);
    }
  }

  // ---- Chat ----------------------------------------------------------------

  @SubscribeMessage('chat:join')
  async chatJoin(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() body: { transactionId: string },
  ): Promise<void> {
    await this.guard(client, async (user) => {
      await this.chat.assertParticipant(user, body.transactionId);
      await client.join(chatRoom(body.transactionId));
    });
  }

  @SubscribeMessage('chat:send')
  async chatSend(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() body: { transactionId: string; body: string },
  ): Promise<void> {
    await this.guard(client, async (user) => {
      const message = await this.chat.sendMessage(
        user,
        body.transactionId,
        body.body,
      );
      this.server
        .to(chatRoom(body.transactionId))
        .emit('chat:message', message);
    });
  }

  @SubscribeMessage('chat:read')
  async chatRead(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() body: { transactionId: string },
  ): Promise<void> {
    await this.guard(client, async (user) => {
      const count = await this.chat.markRead(user, body.transactionId);
      this.server.to(chatRoom(body.transactionId)).emit('chat:read', {
        transactionId: body.transactionId,
        readerId: user.id,
        count,
      });
    });
  }

  /**
   * Run an authenticated handler, surfacing failures as an `error` event to the
   * caller instead of tearing down the socket.
   */
  private async guard(
    client: SocketWithUser,
    fn: (user: AuthUser) => Promise<void>,
  ): Promise<void> {
    const user = client.data.user;
    if (!user) {
      client.emit('error', { message: 'UNAUTHENTICATED' });
      return;
    }
    try {
      await fn(user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CHAT_ERROR';
      client.emit('error', { message });
    }
  }
}
