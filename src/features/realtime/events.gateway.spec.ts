import { AuthUser } from '../auth/auth.types';
import { ChatService } from '../messaging/chat.service';

// jwks-rsa (transitively via SocketAuthService) pulls in `jose` (ESM); mock it
// so the gateway module loads under ts-jest.
jest.mock('jwks-rsa', () => ({ JwksClient: jest.fn() }));

import { SocketAuthService } from '../auth/socket-auth.service';
import { EventsGateway } from './events.gateway';

interface Emit {
  room: string;
  event: string;
  payload: unknown;
}

function buildServer() {
  const emits: Emit[] = [];
  const server = {
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) =>
        emits.push({ room, event, payload }),
    })),
  };
  return { server, emits };
}

const AGENT: AuthUser = {
  supabaseId: 's',
  email: 'a',
  role: 'AGENT',
  id: 'a1',
};

function build() {
  const socketAuth = {
    verify: jest.fn(),
  } as unknown as jest.Mocked<SocketAuthService>;
  const chat = {
    assertParticipant: jest.fn().mockResolvedValue({ threadId: 'th1' }),
    sendMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
    markRead: jest.fn().mockResolvedValue(1),
  } as unknown as jest.Mocked<ChatService>;
  const gateway = new EventsGateway(socketAuth, chat);
  const { server, emits } = buildServer();
  (gateway as unknown as { server: unknown }).server = server;
  return { gateway, socketAuth, chat, server, emits };
}

describe('EventsGateway', () => {
  describe('event fan-out', () => {
    it('routes transaction.created to the agents queue', () => {
      const { gateway, emits } = build();
      gateway.onCreated({
        transactionId: 't1',
        type: 'DEPOSIT',
        playerId: 'p1',
        amount: '100',
      } as never);
      expect(emits).toContainEqual(
        expect.objectContaining({ room: 'agents:queue', event: 'queue:new' }),
      );
    });

    it('routes transaction.claimed to queue + player', () => {
      const { gateway, emits } = build();
      gateway.onClaimed({ transactionId: 't1', agentId: 'a1', playerId: 'p1' });
      expect(emits.map((e) => e.event)).toEqual(
        expect.arrayContaining(['queue:claimed', 'transaction:claimed']),
      );
      expect(emits).toContainEqual(
        expect.objectContaining({
          room: 'player:p1',
          event: 'transaction:claimed',
        }),
      );
    });

    it('routes transaction.completed to player (+balance) and agent', () => {
      const { gateway, emits } = build();
      gateway.onCompleted({
        transactionId: 't1',
        type: 'DEPOSIT',
        agentId: 'a1',
        playerId: 'p1',
        amount: '100',
      } as never);
      expect(emits).toContainEqual(
        expect.objectContaining({
          room: 'player:p1',
          event: 'balance:changed',
        }),
      );
      expect(emits).toContainEqual(
        expect.objectContaining({
          room: 'agent:a1',
          event: 'transaction:completed',
        }),
      );
    });
  });

  describe('handleConnection', () => {
    it('joins role rooms for a valid agent token', async () => {
      const { gateway, socketAuth } = build();
      socketAuth.verify.mockResolvedValue(AGENT);
      const client = {
        handshake: { auth: { token: 'good' }, headers: {} },
        data: {} as { user?: AuthUser },
        join: jest.fn(),
        disconnect: jest.fn(),
      };
      await gateway.handleConnection(client as never);
      expect(client.data.user).toEqual(AGENT);
      expect(client.join).toHaveBeenCalledWith('agent:a1');
      expect(client.join).toHaveBeenCalledWith('agents:queue');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects on an invalid token', async () => {
      const { gateway, socketAuth } = build();
      socketAuth.verify.mockRejectedValue(new Error('bad'));
      const client = {
        handshake: { auth: { token: 'bad' }, headers: {} },
        data: {},
        join: jest.fn(),
        disconnect: jest.fn(),
      };
      await gateway.handleConnection(client as never);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('joins the operators queue for a valid operator token', async () => {
      const { gateway, socketAuth } = build();
      socketAuth.verify.mockResolvedValue({
        supabaseId: 's',
        email: 'o',
        role: 'OPERATOR',
        id: 'op1',
      });
      const client = {
        handshake: { auth: { token: 'good' }, headers: {} },
        data: {} as { user?: AuthUser },
        join: jest.fn(),
        disconnect: jest.fn(),
      };
      await gateway.handleConnection(client as never);
      expect(client.join).toHaveBeenCalledWith('operator:op1');
      expect(client.join).toHaveBeenCalledWith('operators:queue');
    });
  });

  describe('credit-request fan-out', () => {
    it('routes credit_request.created to the operators queue', () => {
      const { gateway, emits } = build();
      gateway.onCreditCreated({
        requestId: 'cr1',
        agentId: 'a1',
        amount: '500',
      });
      expect(emits).toContainEqual(
        expect.objectContaining({
          room: 'operators:queue',
          event: 'credit:new',
        }),
      );
    });

    it('routes credit_request.claimed to the queue + agent', () => {
      const { gateway, emits } = build();
      gateway.onCreditClaimed({
        requestId: 'cr1',
        agentId: 'a1',
        operatorId: 'op1',
      });
      expect(emits).toContainEqual(
        expect.objectContaining({
          room: 'operators:queue',
          event: 'credit:claimed',
        }),
      );
      expect(emits).toContainEqual(
        expect.objectContaining({ room: 'agent:a1', event: 'credit:claimed' }),
      );
    });

    it('routes credit_request.completed to the agent (+balance)', () => {
      const { gateway, emits } = build();
      gateway.onCreditCompleted({
        requestId: 'cr1',
        agentId: 'a1',
        operatorId: 'op1',
        amount: '500',
      });
      expect(emits).toContainEqual(
        expect.objectContaining({
          room: 'agent:a1',
          event: 'credit:completed',
        }),
      );
      expect(emits).toContainEqual(
        expect.objectContaining({ room: 'agent:a1', event: 'balance:changed' }),
      );
    });
  });

  describe('bet fan-out', () => {
    it('routes bet.settled to the player (+balance)', () => {
      const { gateway, emits } = build();
      gateway.onBetSettled({
        betId: 'b1',
        playerId: 'p1',
        status: 'LOST',
        payout: '0.00',
      });
      expect(emits).toContainEqual(
        expect.objectContaining({ room: 'player:p1', event: 'bet:settled' }),
      );
      expect(emits).toContainEqual(
        expect.objectContaining({
          room: 'player:p1',
          event: 'balance:changed',
        }),
      );
    });

    it('also notifies the agent when a loss booked commission', () => {
      const { gateway, emits } = build();
      gateway.onBetSettled({
        betId: 'b1',
        playerId: 'p1',
        status: 'LOST',
        payout: '0.00',
        agentId: 'ag1',
        lossCommission: '25.00',
      });
      expect(emits).toContainEqual(
        expect.objectContaining({
          room: 'agent:ag1',
          event: 'commission:earned',
        }),
      );
    });

    it('does not notify an agent when no commission was booked', () => {
      const { gateway, emits } = build();
      gateway.onBetSettled({
        betId: 'b1',
        playerId: 'p1',
        status: 'WON',
        payout: '1000.00',
      });
      expect(emits.some((e) => e.event === 'commission:earned')).toBe(false);
    });
  });

  describe('chat:send', () => {
    it('authorizes then broadcasts to the chat room', async () => {
      const { gateway, chat, emits } = build();
      const client = {
        data: { user: AGENT },
        emit: jest.fn(),
        join: jest.fn(),
      };
      await gateway.chatSend(client as never, {
        transactionId: 't1',
        body: 'hi',
      });
      expect(chat.sendMessage).toHaveBeenCalledWith(AGENT, 't1', 'hi');
      expect(emits).toContainEqual(
        expect.objectContaining({ room: 'chat:t1', event: 'chat:message' }),
      );
    });

    it('emits an error event when not a participant', async () => {
      const { gateway, chat } = build();
      (chat.sendMessage as jest.Mock).mockRejectedValue(
        new Error('FORBIDDEN_NOT_PARTICIPANT'),
      );
      const client = {
        data: { user: AGENT },
        emit: jest.fn(),
        join: jest.fn(),
      };
      await gateway.chatSend(client as never, {
        transactionId: 't1',
        body: 'hi',
      });
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'FORBIDDEN_NOT_PARTICIPANT',
      });
    });
  });
});
