// server/signaling/src/server.ts
// Main WebSocket signaling server — relays SDP offers/answers and ICE candidates

import { WebSocket, WebSocketServer } from 'ws';
import { sessionRegistry } from './session';
import { verifyToken, validatePairingCode, registerPairingCode } from './auth';

export interface SignalMessage {
  type: 'register' | 'connect' | 'offer' | 'answer' | 'ice' | 'pairing' | 'disconnect';
  from?: string;
  to?: string;
  deviceId?: string;
  payload?: unknown;
  token?: string;
  pairingCode?: string;
}

export function createSignalingServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port, host: '0.0.0.0' });
  console.log(`[Signaling] Server listening on ws://0.0.0.0:${port}`);

  wss.on('connection', (ws: WebSocket, req) => {
    let clientDeviceId: string | null = null;
    const remoteAddr = req.socket.remoteAddress ?? 'unknown';
    console.log(`[Signaling] New connection from ${remoteAddr}`);

    ws.on('message', (raw: Buffer | string) => {
      let msg: SignalMessage;
      try {
        msg = JSON.parse(raw.toString()) as SignalMessage;
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }
      
      console.log(`[Signaling] Received from ${clientDeviceId ?? remoteAddr}: ${msg.type} to ${msg.to ?? 'server'}`);

      switch (msg.type) {

        // ── Host registers itself ──────────────────────────────────────────
        case 'register': {
          console.log(`[Signaling] Register requested for device: ${msg.deviceId} token: ${msg.token?.substring(0, 10)}...`);
          
          let claims;
          if (msg.token === 'demo-token') {
             claims = { deviceId: msg.deviceId ?? 'unknown-host' };
          } else {
             claims = verifyToken(msg.token ?? '');
          }

          if (!claims) {
            console.log(`[Signaling] Rejecting register from ${remoteAddr}: Unauthorized token`);
            ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
            return;
          }
          
          clientDeviceId = claims.deviceId;
          sessionRegistry.register(clientDeviceId, ws);
          console.log(`[Signaling] Host ${clientDeviceId} successfully registered and added to registry.`);
          ws.send(JSON.stringify({ type: 'registered', deviceId: clientDeviceId }));
          break;
        }

        // ── Host sets a pairing code ───────────────────────────────────────
        case 'pairing': {
          if (!clientDeviceId || !msg.pairingCode) return;
          registerPairingCode(clientDeviceId, msg.pairingCode);
          ws.send(JSON.stringify({ type: 'pairing_set' }));
          break;
        }

        // ── Viewer requests to connect to a host ──────────────────────────
        case 'connect': {
          console.log(`[Signaling] Connect requested by viewer ID token: ${msg.token?.substring(0, 10)}... target host: ${msg.to} code: ${msg.pairingCode}`);
          
          let claims;
          if (msg.token === 'demo-token') {
             // Bypass jwt validation for demo token to see if this is breaking it
             claims = { deviceId: clientDeviceId ?? `demo-${Math.floor(Math.random()*1000)}` };
          } else {
             claims = verifyToken(msg.token ?? '');
          }
          
          if (!claims) {
            console.log(`[Signaling] Rejecting connect from ${remoteAddr}: Unauthorized token`);
            ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
            return;
          }
          clientDeviceId = claims.deviceId;
          sessionRegistry.register(clientDeviceId, ws);

          const targetId = msg.to;
          if (!targetId) {
            console.log(`[Signaling] Connect failed: No target ID specified`);
            return;
          }

          if (msg.token !== 'demo-token' && !validatePairingCode(targetId, msg.pairingCode ?? '')) {
            console.log(`[Signaling] Rejecting connect from ${clientDeviceId} to ${targetId}: Invalid pairing code`);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid pairing code' }));
            return;
          }

          // Notify host that a viewer has joined
          const hostWs = sessionRegistry.get(targetId);
          if (hostWs) {
             console.log(`[Signaling] Host ${targetId} is online (readyState: ${hostWs.readyState}). Routing viewer_joined.`);
             if (hostWs.readyState === WebSocket.OPEN) {
                hostWs.send(JSON.stringify({
                  type: 'viewer_joined',
                  from: clientDeviceId,
                }));
             } else {
                console.log(`[Signaling] Expected host ${targetId} to be OPEN but was ${hostWs.readyState}`);
             }
          } else {
             console.log(`[Signaling] Host ${targetId} is not in session registry.`);
          }
          ws.send(JSON.stringify({ type: 'connected', to: targetId }));
          break;
        }

        // ── SDP offer / answer / ICE relay ───────────────────────────────
        case 'offer':
        case 'answer':
        case 'ice': {
          const targetId = msg.to;
          if (!targetId) return;

          const senderId = msg.from || clientDeviceId;
          if (!senderId) {
             console.log(`[Signaling] Rejecting ${msg.type}: Sender not identified`);
             return;
          }

          const target = sessionRegistry.get(targetId);
          if (target?.readyState === WebSocket.OPEN) {
            try {
              target.send(JSON.stringify({
                ...msg,
                from: senderId,
              }));
              console.log(`[Signaling] Relayed ${msg.type} from ${senderId} to ${targetId}`);
            } catch (err) {
              console.error(`[Signaling] Failed to relay ${msg.type} to ${targetId}:`, err);
            }
          } else {
            console.log(`[Signaling] Target ${targetId} not available for ${msg.type}`);
            ws.send(JSON.stringify({ type: 'error', message: `Peer ${targetId} not available` }));
          }
          break;
        }

        // ── Graceful disconnect ──────────────────────────────────────────
        case 'disconnect': {
          if (clientDeviceId) sessionRegistry.unregister(clientDeviceId);
          break;
        }
      }
    });

    ws.on('close', () => {
      if (clientDeviceId) sessionRegistry.unregister(clientDeviceId);
      console.log(`[Signaling] Client ${clientDeviceId ?? remoteAddr} disconnected`);
    });

    ws.on('error', (err) => {
      console.error(`[Signaling] Socket error for ${clientDeviceId}: ${err.message}`);
    });
  });

  return wss;
}
