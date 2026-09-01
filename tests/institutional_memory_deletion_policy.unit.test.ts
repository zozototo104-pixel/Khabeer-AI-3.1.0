import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('normal session deletion archives durable memory before purging raw session data', () => {
  const chatDb = read('src/db/chat.ts');
  assert.match(chatDb, /async function archiveDurableSessionMemory/);
  assert.match(chatDb, /await archiveDurableSessionMemory\(tx, sId\)/);
  assert.match(chatDb, /await tx\.delete\(meetingInvites\)\.where\(eq\(meetingInvites\.sessionId, sId\)\)/);
  assert.match(chatDb, /await tx\.delete\(messages\)\.where\(eq\(messages\.sessionId, sId\)\)/);
  assert.match(chatDb, /await tx\.delete\(sessions\)\.where\(eq\(sessions\.id, sId\)\)/);
  assert.match(chatDb, /archivedBecauseSessionDeleted: true/);
});

test('session archive resolves an organization even when the session has no orgId', () => {
  const chatDb = read('src/db/chat.ts');
  assert.match(chatDb, /let archiveOrgId = Number\(session\.orgId \|\| 0\)/);
  assert.match(chatDb, /if \(!archiveOrgId && session\.userId\)/);
  assert.match(chatDb, /from\(users\)\.where\(eq\(users\.id, session\.userId\)\)/);
  assert.match(chatDb, /from\(organizations\)/);
  assert.match(chatDb, /orgId: archiveOrgId/);
});

test('durable institutional memory schema and migration exist', () => {
  const schema = read('src/db/schema.ts');
  const migration = read('migrations/009_institutional_memory_entries.sql');
  assert.match(schema, /export const institutionalMemoryEntries = pgTable\('institutional_memory_entries'/);
  assert.match(schema, /sourceSessionId: integer\('source_session_id'\)/);
  assert.match(schema, /memoryType: text\('memory_type'\)\.notNull\(\)\.default\('fact'\)/);
  assert.match(schema, /metadata: jsonb\('metadata'\)\.default\(\{\}\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS institutional_memory_entries/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_institutional_memory_org/);
});

test('expert memory payload includes open and historical records', () => {
  const memoryEngine = read('server/services/memory/MemoryEngine.ts');
  assert.match(memoryEngine, /getDurableInstitutionalMemories/);
  assert.match(memoryEngine, /getHistoricalTasks/);
  assert.match(memoryEngine, /getHistoricalClosedRisks/);
  assert.match(memoryEngine, /getHistoricalClosedViolations/);
  assert.match(memoryEngine, /=== سجل تاريخي مختصر للمهام المنجزة ===/);
  assert.match(memoryEngine, /=== سجل تاريخي للمخاطر والمخالفات المغلقة ===/);
  assert.match(memoryEngine, /=== ذاكرة مؤسسية طويلة الأمد من جلسات سابقة أو محذوفة ===/);
});

test('delete impact and permanent purge APIs are wired', () => {
  const server = read('server.ts');
  assert.match(server, /app\.get\('\/api\/sessions\/:id\/delete-impact'/);
  assert.match(server, /willDelete/);
  assert.match(server, /willPreserveAsDurableMemory/);
  assert.match(server, /app\.get\('\/api\/privacy\/memory-inventory'/);
  assert.match(server, /app\.post\('\/api\/privacy\/purge'/);
  assert.match(server, /confirmText !== 'حذف نهائي'/);
  assert.match(server, /dbInstitutionalMemoryEntries/);
});

test('red settings panel exposes permanent selectable deletion categories', () => {
  const settings = read('src/components/Settings.tsx');
  assert.match(settings, /حذف نهائي من ذاكرة الخبير وقاعدة البيانات/);
  assert.match(settings, /PURGE_CATEGORIES/);
  assert.match(settings, /sessions/);
  assert.match(settings, /durableMemory/);
  assert.match(settings, /speakerProfiles/);
  assert.match(settings, /runPermanentPurge/);
  assert.match(settings, /localStorage\.removeItem\('gemini_voice_footprints_v3'\)/);
});
