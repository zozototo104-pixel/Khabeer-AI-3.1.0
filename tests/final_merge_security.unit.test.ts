import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../src/middleware/auth.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../src/db/schema.ts', import.meta.url), 'utf8');

 test('direct auth and legacy websocket auth are explicitly gated', () => {
  assert.match(server, /ALLOW_DEV_DIRECT_AUTH\s*!==\s*'true'/);
  assert.match(server, /ALLOW_LEGACY_DIRECT_AUTH\s*!==\s*'true'/);
  assert.match(auth, /ALLOW_LEGACY_DIRECT_AUTH\s*===\s*'true'/);
});

test('guest invite remains session-scoped while owner session ids are ownership checked', () => {
  assert.match(server, /resolveMeetingInvite\(String\(msg\.inviteToken\)\)/);
  assert.match(server, /if \(!invitedSession && msg\.sessionId\)/);
  assert.match(server, /ownedSessions\.some\(\(s: any\) => s && s\.id === candidateSessionId\)/);
});

test('security infrastructure and split migrations are present', () => {
  assert.match(schema, /export const orgMembers/);
  assert.match(schema, /export const revokedTokens/);
  assert.match(schema, /export const auditLog/);
  assert.match(schema, /export const rateLimitCounters/);
  assert.ok(existsSync(new URL('../migrations/004_meeting_crud_and_invites.sql', import.meta.url)));
  assert.ok(existsSync(new URL('../migrations/005_audit_org_members_revoked_tokens_soft_delete.sql', import.meta.url)));
});

test('knowledge ingestion keeps selected organization scope and JSON/quality protections', () => {
  assert.match(server, /resolveOwnedOrganization\(req\.user\.uid, req\.body\.orgId\)/);
  assert.match(server, /resolveOwnedOrganization\(req\.user\.uid, requestedOrgId\)/);
  assert.match(server, /'\.json'/);
  assert.match(server, /DOCUMENT_TEXT_QUALITY_FAILED/);
  assert.match(server, /FILE_TOO_LARGE/);
});

test('meeting deletion is transactional and removes invite tokens first', () => {
  const chat = readFileSync(new URL('../src/db/chat.ts', import.meta.url), 'utf8');
  assert.match(chat, /db\.transaction\(async \(tx\)/);
  assert.match(chat, /tx\.delete\(meetingInvites\)/);
});
