import crypto from 'node:crypto';

interface DirectSessionPayload {
  uid: string;
  email: string;
  exp: number;
}

function secret(): string {
  const value = process.env.DIRECT_AUTH_SECRET || '';
  if (value.length < 32) throw new Error('DIRECT_AUTH_SECRET must contain at least 32 characters');
  return value;
}

function signature(encodedPayload: string): string {
  return crypto.createHmac('sha256', secret()).update(encodedPayload).digest('base64url');
}

export function createDirectSessionToken(uid: string, email: string, ttlSeconds = 7 * 24 * 60 * 60): string {
  const payload: DirectSessionPayload = {
    uid,
    email,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `direct.${encoded}.${signature(encoded)}`;
}

export function verifyDirectSessionToken(token: string): DirectSessionPayload {
  const [prefix, encoded, providedSignature] = token.split('.');
  if (prefix !== 'direct' || !encoded || !providedSignature) throw new Error('INVALID_DIRECT_TOKEN');
  const expectedSignature = signature(encoded);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) throw new Error('INVALID_DIRECT_SIGNATURE');

  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as DirectSessionPayload;
  if (!payload.uid || !payload.email || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('EXPIRED_DIRECT_TOKEN');
  return payload;
}
