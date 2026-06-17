// Socket.IO room-name helpers. Centralized so the gateway and any future
// emitters agree on the exact strings.

export const AGENTS_QUEUE = 'agents:queue';
export const OPERATORS_QUEUE = 'operators:queue';

export const playerRoom = (id: string) => `player:${id}`;
export const agentRoom = (id: string) => `agent:${id}`;
export const operatorRoom = (id: string) => `operator:${id}`;
export const chatRoom = (transactionId: string) => `chat:${transactionId}`;
