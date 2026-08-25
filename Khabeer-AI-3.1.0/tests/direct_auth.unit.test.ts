import assert from 'node:assert/strict';
import test from 'node:test';
import { createDirectSessionToken, verifyDirectSessionToken } from '../src/lib/direct-auth.ts';

process.env.DIRECT_AUTH_SECRET = 'unit-test-secret-that-is-longer-than-thirty-two-characters';

test('signed direct sessions round-trip and reject tampering', () => {
  const token = createDirectSessionToken('usr_123', 'person@example.com');
  const payload = verifyDirectSessionToken(token);
  assert.equal(payload.uid, 'usr_123');
  assert.equal(payload.email, 'person@example.com');

  const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  assert.throws(() => verifyDirectSessionToken(tampered), /INVALID_DIRECT_SIGNATURE/);
});
