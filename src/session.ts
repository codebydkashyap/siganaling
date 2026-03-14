// server/signaling/src/session.ts
// In-memory session registry mapping deviceId → WebSocket connection.

import { WebSocket } from 'ws';

export interface Session {
  deviceId: string;
  ws: WebSocket;
  connectedAt: Date;
}

class SessionRegistry {
  private sessions = new Map<string, Session>();

  register(deviceId: string, ws: WebSocket): void {
    this.sessions.set(deviceId, { deviceId, ws, connectedAt: new Date() });
    console.log(`[Registry] Registered: ${deviceId} (total: ${this.sessions.size})`);
  }

  unregister(deviceId: string): void {
    this.sessions.delete(deviceId);
    console.log(`[Registry] Unregistered: ${deviceId} (total: ${this.sessions.size})`);
  }

  get(deviceId: string): WebSocket | undefined {
    return this.sessions.get(deviceId)?.ws;
  }

  has(deviceId: string): boolean {
    return this.sessions.has(deviceId);
  }

  list(): Session[] {
    return Array.from(this.sessions.values());
  }
}

export const sessionRegistry = new SessionRegistry();
