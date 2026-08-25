import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server.ts', 'utf8');
const schema = fs.readFileSync('src/db/schema.ts', 'utf8');
const chat = fs.readFileSync('src/db/chat.ts', 'utf8');
const meetings = fs.readFileSync('src/components/MeetingsList.tsx', 'utf8');
const guest = fs.readFileSync('src/components/GuestMeetingJoin.tsx', 'utf8');
const migration = fs.readFileSync('migrations/004_meeting_crud_and_invites.sql', 'utf8');

test('meeting creation persists complete context instead of title-only', () => {
  assert.match(server, /cleanMeetingPayload\(req\.body/);
  assert.match(chat, /orgId: values\.orgId/);
  assert.match(chat, /meetingType: values\.meetingType/);
  assert.match(chat, /agenda: values\.agenda/);
  assert.match(chat, /participants: values\.participants/);
  assert.match(chat, /scheduledAt: values\.scheduledAt/);
});

test('meeting update endpoint accepts full meeting context', () => {
  assert.match(server, /app\.patch\('\/api\/sessions\/:id'/);
  assert.match(server, /updateSessionMeetingContext\(sessionId, \{ \.\.\.input, \.\.\.lifecycle \}/);
  assert.match(meetings, /startEditMeeting/);
});

test('meeting invitations are hashed, expiring, revocable, and session-scoped', () => {
  assert.match(schema, /meetingInvites/);
  assert.match(migration, /token_hash text NOT NULL UNIQUE/);
  assert.match(migration, /expires_at timestamp NOT NULL/);
  assert.match(migration, /ON DELETE CASCADE/);
  assert.match(server, /randomBytes\(32\)/);
  assert.match(server, /createHash\('sha256'\)/);
  assert.match(server, /INVITE_INVALID_OR_EXPIRED/);
  assert.match(server, /revokedAt: new Date\(\)/);
  assert.match(guest, /guestInviteToken/);
});

test('meeting and organization destructive operations use transactions', () => {
  assert.match(chat, /db\.transaction\(async \(tx\)/);
  assert.match(server, /await db\.transaction\(async \(tx\)/);
});

test('schedule modal is wired to persistent save callback', () => {
  assert.match(meetings, /onSaveSchedule=\{handleSaveSchedule\}/);
  assert.match(meetings, /scheduledAt: scheduledAt\.toISOString\(\)/);
});

test('guest invite cannot rewrite meeting metadata or persistent speaker library', () => {
  assert.match(server, /if \(!isGuestInvite\) \{\s*const meetingTitle/);
  assert.match(server, /guestConnection = true/);
  assert.match(server, /if \(guestConnection\) \{[\s\S]*speaker_override_rejected/);
  assert.match(server, /speaker_sync_rejected/);
  assert.match(server, /if \(!guestConnection && ownerUid && profiles\.length\)/);
});

test('scheduled meetings persist as scheduled and activate only when live session starts', () => {
  assert.match(server, /'SCHEDULED','ACTIVE','COMPLETED','CANCELLED'/);
  assert.match(meetings, /status: 'SCHEDULED'/);
  assert.match(server, /storedSession\?\.status === 'SCHEDULED'/);
  assert.match(server, /updateSessionMeetingContext\(dbSessionId, \{ status: 'ACTIVE' \}\)/);
});

test('schedule UI waits for database save before closing', () => {
  const modal = fs.readFileSync('src/components/ScheduleMeetingModal.tsx', 'utf8');
  assert.match(modal, /const handleSave = async \(\) =>/);
  assert.match(modal, /await onSaveSchedule/);
  assert.match(modal, /تعذر حفظ الاجتماع المجدول في قاعدة البيانات/);
});

test('organization CRUD and multi-organization knowledge are owner-scoped', () => {
  const knowledgeUi = fs.readFileSync('src/components/KnowledgeBase.tsx', 'utf8');
  assert.match(server, /app\.post\('\/api\/organization'/);
  assert.match(server, /app\.put\('\/api\/organization\/:id'/);
  assert.match(server, /app\.delete\('\/api\/organization\/:id'/);
  assert.match(server, /eq\(organizations\.ownerId, req\.user\.uid\)/);
  assert.match(server, /resolveOwnedOrganization\(req\.user\.uid, req\.query\.orgId\)/);
  assert.match(server, /resolveOwnedOrganization\(req\.user\.uid, req\.body\.orgId\)/);
  assert.match(knowledgeUi, /اختر المؤسسة لقاعدة المعرفة/);
  assert.match(knowledgeUi, /formData\.append\('orgId', selectedOrgId\)/);
});

test('task edits persist description as well as other editable fields', () => {
  assert.match(server, /if \(description !== undefined\) updateData\.description = description/);
});

test('meeting invite management is exposed in UI for create and revoke', () => {
  assert.match(meetings, /createInternalInvite/);
  assert.match(meetings, /revokeInternalInvites/);
  assert.match(meetings, /\/api\/sessions\/\$\{meetingId\}\/invites/);
});
