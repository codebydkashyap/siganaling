// server/signaling/src/auth.ts
// JWT-based device authentication + pairing code validation.

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const JWT_EXPIRY  = '24h';

export interface TokenClaims {
  deviceId: string;
  iat?: number;
  exp?: number;
}

/**
 * Issue a new JWT for a device.
 */
export function issueToken(deviceId: string): string {
  return jwt.sign({ deviceId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify a JWT. Returns claims on success, null on failure.
 */
export function verifyToken(token: string): TokenClaims | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenClaims;
  } catch {
    return null;
  }
}

// ─── In-memory pairing code store ─────────────────────────────────────────

const pairingCodes = new Map<string, { code: string; expiresAt: number }>();

/**
 * Register a pairing code for a host device (valid for 5 minutes).
 */
export function registerPairingCode(deviceId: string, code: string): void {
  pairingCodes.set(deviceId, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

/**
 * Validate a pairing code for a device. Removes the code after one use.
 */
export function validatePairingCode(deviceId: string, code: string): boolean {
  const entry = pairingCodes.get(deviceId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    pairingCodes.delete(deviceId);
    return false;
  }
  if (entry.code !== code) return false;
  pairingCodes.delete(deviceId); // single-use
  return true;
}
