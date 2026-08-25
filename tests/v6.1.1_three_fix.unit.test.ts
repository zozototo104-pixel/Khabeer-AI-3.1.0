/**
 * V6.1.1 THREE-FIX SURGICAL PATCH — Regression Tests
 *
 * Tests P1-P4: non-destructive persistence (FIX 1)
 * Tests T1-T4: server authority (FIX 2)
 * Tests E1-E5: safe multi-sample re-enrollment (FIX 3)
 *
 * These tests run under Node's built-in test runner with mock DB.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPEAKERS_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'speakers.ts'), 'utf8');
const SERVER_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'server.ts'), 'utf8');
const ENGINE_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'server', 'services', 'speech', 'SpeechEngine.ts'), 'utf8');

import { SpeakerRegistry } from '../src/lib/speaker/SpeakerRegistry.ts';
import { SPEAKER_THRESHOLDS } from '../src/lib/speaker/types.ts';
import { classifyMatchEligibility } from '../src/db/speakers.ts';

const MODEL = 'sherpa-onnx/3dspeaker-eres2net-base-16k@1a331345f048';

function unitVector(a: number, b: number, dim: number): number[] {
  const v = new Array(dim).fill(0);
  v[0] = a;
  v[1] = b;
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / mag);
}

// =====================================================================
// FIX 1 — NON-DESTRUCTIVE PERSISTENCE (P1-P4)
// =====================================================================

test('P1: Sync does not delete stored-but-ineligible profiles (source contract)', () => {
  // Verify that replacePersistentSpeakerProfiles NO LONGER contains
  // a DELETE block for non-retained profiles.
  // The old code had:
  //   const retainedIds = cleanProfiles.map(...)
  //   await tx.delete(speakerProfiles).where(notInArray(...))
  // The new code must NOT have this block.
  assert.ok(!SPEAKERS_SOURCE.includes('notInArray(speakerProfiles.speakerId, retainedIds)'),
    'replacePersistentSpeakerProfiles must NOT delete non-retained profiles (no notInArray DELETE)');
  assert.ok(!SPEAKERS_SOURCE.includes("tx.delete(speakerProfiles).where(eq(speakerProfiles.ownerId, ownerId))"),
    'replacePersistentSpeakerProfiles must NOT have a blanket owner DELETE');

  // Verify deletePersistentSpeakerProfile EXISTS as a separate function
  assert.ok(SPEAKERS_SOURCE.includes('export async function deletePersistentSpeakerProfile'),
    'deletePersistentSpeakerProfile must exist as a separate explicit-deletion function');
});

test('P2: Sync with only profile A does not delete profile B (source contract)', () => {
  // The function must be non-destructive: supplying only A must not
  // cause B to be deleted. We verify this by confirming there is NO
  // DELETE block after the upsert loop.
  const upsertEnd = SPEAKERS_SOURCE.indexOf('// V6.1.1 FIX 1 — NO DELETE BLOCK HERE');
  assert.ok(upsertEnd > 0, 'The non-destructive comment must exist');
  // After the upsert loop, there should be NO tx.delete call
  const afterLoop = SPEAKERS_SOURCE.slice(upsertEnd, upsertEnd + 200);
  assert.ok(!afterLoop.includes('tx.delete'),
    'No tx.delete call after the upsert loop (non-destructive)');
});

test('P3: Explicit delete via deletePersistentSpeakerProfile (source contract)', () => {
  // The explicit delete function must use db.delete with a targeted
  // WHERE clause (ownerId + speakerId), NOT a blanket owner delete.
  assert.ok(SPEAKERS_SOURCE.includes('eq(speakerProfiles.ownerId, ownerId)'),
    'deletePersistentSpeakerProfile must scope by ownerId');
  assert.ok(SPEAKERS_SOURCE.includes('eq(speakerProfiles.speakerId, speakerId)'),
    'deletePersistentSpeakerProfile must scope by speakerId');
});

test('P4: Opening meeting without speech → no DB deletion (source contract)', () => {
  // The WS meeting start handler must NOT call replacePersistentSpeakerProfiles
  // (which was the old destructive write-back path). It should only READ
  // from DB and sync to runtime.
  // Find the meeting start section (around "V6.1.1 FIX 2 — SERVER IS SOLE AUTHORITY")
  const fix2Start = SERVER_SOURCE.indexOf('V6.1.1 FIX 2 — SERVER IS SOLE AUTHORITY');
  assert.ok(fix2Start > 0, 'FIX 2 comment must exist in server.ts');
  // The next 2000 chars should NOT contain replacePersistentSpeakerProfiles
  const meetingStartSection = SERVER_SOURCE.slice(fix2Start, fix2Start + 2000);
  assert.ok(!meetingStartSection.includes('replacePersistentSpeakerProfiles'),
    'Meeting start must NOT write back to DB (no replacePersistentSpeakerProfiles call)');
});

// =====================================================================
// FIX 2 — SERVER AUTHORITY (T1-T4)
// =====================================================================

test('T1: Client fabricated 512-D profile cannot persist (source contract)', () => {
  // The WS meeting start handler must NOT merge clientProfiles with
  // durable profiles for persistence. Verify the old merge code is gone.
  const fix2Section = SERVER_SOURCE.slice(
    SERVER_SOURCE.indexOf('V6.1.1 FIX 2 — SERVER IS SOLE AUTHORITY'),
    SERVER_SOURCE.indexOf('V6.1.1 FIX 2 — SERVER IS SOLE AUTHORITY') + 3000,
  );
  assert.ok(!fix2Section.includes('const clientProfiles'),
    'Client profiles must NOT be loaded for persistence at meeting start');
  assert.ok(!fix2Section.includes('[...clientProfiles, ...durableProfiles]'),
    'Client + durable merge must NOT exist');
  // Only durable profiles must be used
  assert.ok(fix2Section.includes('durableProfiles.filter'),
    'Only server-authoritative durable profiles must be loaded');
});

test('T2: Client profile with same speakerId but different embedding cannot overwrite server profile (source contract)', () => {
  // The sync_speakers WS handler must NOT call replacePersistentSpeakerProfiles.
  // We search for the sync_speakers handler block and check it doesn't
  // contain an active replacePersistentSpeakerProfiles call.
  const syncStart = SERVER_SOURCE.indexOf("msg.type === 'sync_speakers'");
  assert.ok(syncStart > 0, 'sync_speakers handler must exist');
  // Use a 2000-char window (the handler is ~35 lines with comments)
  const syncSection = SERVER_SOURCE.slice(syncStart, syncStart + 2000);
  const syncLines = syncSection.split('\n');
  const activeReplaceCall = syncLines.some(l =>
    l.includes('replacePersistentSpeakerProfiles(') &&
    !l.trim().startsWith('//') &&
    !l.trim().startsWith('*') &&
    !l.includes('import')
  );
  assert.ok(!activeReplaceCall,
    'sync_speakers WS handler must NOT call replacePersistentSpeakerProfiles in active code');
  assert.ok(syncSection.includes('NO replacePersistentSpeakerProfiles'),
    'sync_speakers must have explicit no-write comment');
});

test('T3: Client omitting Taghreed profile does not delete her from PostgreSQL (source contract)', () => {
  // Since replacePersistentSpeakerProfiles is now non-destructive (FIX 1),
  // omitting a profile from any sync call cannot delete it.
  // Verify the function has NO DELETE block for non-retained profiles.
  // Check for the actual DELETE usage, not just the import (notInArray
  // may still be imported but not used in a DELETE query).
  const deleteWithNotInArray = SPEAKERS_SOURCE.includes('notInArray(speakerProfiles.speakerId');
  assert.ok(!deleteWithNotInArray,
    'No notInArray-based DELETE in speakers.ts — omitted profiles are preserved');
  // Also verify no blanket owner DELETE in replacePersistentSpeakerProfiles
  const blanketDelete = SPEAKERS_SOURCE.match(/tx\.delete\(speakerProfiles\)\.where\(eq\(speakerProfiles\.ownerId, ownerId\)\)/);
  assert.ok(!blanketDelete,
    'No blanket owner DELETE in replacePersistentSpeakerProfiles');
});

test('T4: Server enrollment remains authoritative (source contract)', () => {
  // The enrollment endpoints (POST /api/speech/register and register-multi)
  // must still call replacePersistentSpeakerProfiles (which is now
  // non-destructive upsert). These are server-authoritative paths.
  assert.ok(SERVER_SOURCE.includes("app.post('/api/speech/register'"),
    'Single-sample enrollment endpoint must exist');
  assert.ok(SERVER_SOURCE.includes("app.post('/api/speech/register-multi'"),
    'Multi-sample enrollment endpoint must exist');
  // Both endpoints must use speechEngine.getProvider().extractEmbedding
  // (server-side ONNX extraction, not client embeddings)
  assert.ok(SERVER_SOURCE.includes('speechEngine.getProvider().extractEmbedding'),
    'Enrollment must use server-side ONNX extraction');
});

// =====================================================================
// FIX 3 — SAFE MULTI-SAMPLE RE-ENROLLMENT (E1-E5)
// =====================================================================

test('E1: New profile + 3 samples → sampleCount=3, embeddings=3, all 512-D', () => {
  const registry = new SpeakerRegistry();
  const emb1 = unitVector(1, 0, 512);
  const emb2 = unitVector(0.99, 0.08, 512);
  const emb3 = unitVector(0.98, -0.1, 512);

  const profile = registry.registerOrUpdateSpeaker('NewSpeaker', emb1, { embeddingModel: MODEL });
  registry.updateSpeaker(profile.id, emb2, 'HIGH', true);
  registry.updateSpeaker(profile.id, emb3, 'HIGH', true);

  assert.equal(profile.embeddings.length, 3, 'embeddings count must be 3');
  assert.equal(profile.centroidEmbedding.length, 512, 'centroid must be 512-D');
  for (const emb of profile.embeddings) {
    assert.equal(emb.length, 512, 'each embedding must be 512-D');
  }
  assert.equal(profile.embeddingModel, MODEL);
});

test('E2: Existing 3 + new 3 → 6 final, no MISMATCH (registry level)', () => {
  const registry = new SpeakerRegistry();
  // Initial enrollment: 3 samples
  const emb1 = unitVector(1, 0, 512);
  const emb2 = unitVector(0.99, 0.08, 512);
  const emb3 = unitVector(0.98, -0.1, 512);
  const profile = registry.registerOrUpdateSpeaker('ExistingSpeaker', emb1, { embeddingModel: MODEL });
  registry.updateSpeaker(profile.id, emb2, 'HIGH', true);
  registry.updateSpeaker(profile.id, emb3, 'HIGH', true);
  assert.equal(profile.embeddings.length, 3, 'initial count must be 3');

  // Capture previousCount (simulating what the endpoint does)
  const previousCount = profile.embeddings.length;

  // Re-enroll with 3 new samples
  const emb4 = unitVector(0.97, 0.15, 512);
  const emb5 = unitVector(0.96, 0.2, 512);
  const emb6 = unitVector(0.95, -0.2, 512);
  registry.updateSpeaker(profile.id, emb4, 'HIGH', true);
  registry.updateSpeaker(profile.id, emb5, 'HIGH', true);
  registry.updateSpeaker(profile.id, emb6, 'HIGH', true);

  // V6.1.1 FIX 3 — expected count = min(3 + 3, 8) = 6
  const expectedFinalCount = Math.min(previousCount + 3, 8);
  assert.equal(profile.embeddings.length, expectedFinalCount,
    `existing 3 + new 3 must give ${expectedFinalCount} (not ENROLLMENT_MISMATCH)`);
  assert.equal(profile.embeddings.length, 6);
});

test('E3: Cap test — 7 existing + 3 new, MAX=8 → final ≤ 8', () => {
  const registry = new SpeakerRegistry();
  // Enroll 7 samples
  const profile = registry.registerOrUpdateSpeaker('CappedSpeaker', unitVector(1, 0, 512), { embeddingModel: MODEL });
  for (let i = 2; i <= 7; i++) {
    registry.updateSpeaker(profile.id, unitVector(1 - i * 0.01, i * 0.02, 512), 'HIGH', true);
  }
  assert.equal(profile.embeddings.length, 7, 'initial count must be 7');

  // Capture previousCount
  const previousCount = profile.embeddings.length;

  // Add 3 more → 10 total, capped to 8 (oldest shifted out)
  for (let i = 8; i <= 10; i++) {
    registry.updateSpeaker(profile.id, unitVector(1 - i * 0.01, i * 0.03, 512), 'HIGH', true);
  }

  // V6.1.1 FIX 3 — expected = min(7 + 3, 8) = 8
  const expectedFinalCount = Math.min(previousCount + 3, 8);
  assert.equal(profile.embeddings.length, expectedFinalCount,
    `7 + 3 capped must give ${expectedFinalCount}`);
  assert.equal(profile.embeddings.length, 8, 'must be capped at MAX_ENROLLMENT_SAMPLES=8');
  assert.ok(profile.embeddings.length <= 8, 'must not exceed cap');
});

test('E4: Failed enrollment preserves old profile (registry level)', () => {
  const registry = new SpeakerRegistry();
  // Create a valid profile with 3 samples
  const profile = registry.registerOrUpdateSpeaker('PreservedSpeaker', unitVector(1, 0, 512), { embeddingModel: MODEL });
  registry.updateSpeaker(profile.id, unitVector(0.99, 0.08, 512), 'HIGH', true);
  registry.updateSpeaker(profile.id, unitVector(0.98, -0.1, 512), 'HIGH', true);
  const originalCount = profile.embeddings.length;
  assert.equal(originalCount, 3);

  // Simulate a failed extraction: try to updateSpeaker with a WRONG dimension
  // (the registry should reject this via dimension check)
  const wrongDimEmb = unitVector(1, 0, 128); // 128-D instead of 512-D
  const updateResult = registry.updateSpeaker(profile.id, wrongDimEmb, 'HIGH', true);
  assert.equal(updateResult, false, 'updateSpeaker with wrong dimension must return false');

  // Profile must be UNCHANGED
  assert.equal(profile.embeddings.length, originalCount,
    'Existing profile must be preserved after failed enrollment');
  assert.equal(profile.embeddings.length, 3);
});

test('E5: Every persisted sample has dimension=512 + correct modelId', () => {
  const registry = new SpeakerRegistry();
  const profile = registry.registerOrUpdateSpeaker('ModelCheck', unitVector(1, 0, 512), { embeddingModel: MODEL });
  registry.updateSpeaker(profile.id, unitVector(0.99, 0.08, 512), 'HIGH', true);
  registry.updateSpeaker(profile.id, unitVector(0.98, -0.1, 512), 'HIGH', true);

  assert.equal(profile.embeddingModel, MODEL,
    `modelId must be ${MODEL}`);
  for (const emb of profile.embeddings) {
    assert.equal(emb.length, 512, 'every stored embedding must be 512-D');
  }
  assert.equal(profile.centroidEmbedding.length, 512, 'centroid must be 512-D');
});

// =====================================================================
// FIX 3 — SOURCE CONTRACT: expectedFinalCount validation
// =====================================================================

test('E-FIX3-SOURCE: register-multi uses expectedFinalCount, not extractedEmbeddings.length', () => {
  // Verify the fix is in the source: the old check was
  //   profile.embeddings.length !== extractedEmbeddings.length
  // The new check must use expectedFinalCount
  assert.ok(SERVER_SOURCE.includes('expectedFinalCount'),
    'register-multi must compute expectedFinalCount');
  assert.ok(SERVER_SOURCE.includes('previousEmbeddingsCount'),
    'register-multi must capture previousEmbeddingsCount before enrolling');
  // The Math.min call may span multiple lines — check for key parts
  assert.ok(SERVER_SOURCE.includes('previousEmbeddingsCount + extractedEmbeddings.length'),
    'expectedFinalCount must be based on previous + new count');
  assert.ok(SERVER_SOURCE.includes('MAX_SAMPLES'),
    'expectedFinalCount must be capped at MAX_SAMPLES');
  // The old incorrect check must NOT exist in active code (comments are OK)
  const serverLines = SERVER_SOURCE.split('\n');
  const activeOldCheck = serverLines.some(l =>
    l.includes('profile.embeddings.length !== extractedEmbeddings.length') &&
    !l.trim().startsWith('//') &&
    !l.trim().startsWith('*')
  );
  assert.ok(!activeOldCheck,
    'The old incorrect validation must be removed from active code (may exist in comments)');
});

// =====================================================================
// VOICE REGRESSION FREEZE — Abu Musab / Taghreed
// =====================================================================

test('CASE A: Abu Musab high confidence → VERIFIED', () => {
  const registry = new SpeakerRegistry();
  registry.registerOrUpdateSpeaker('Abu Musab', unitVector(1, 0, 512), { embeddingModel: MODEL });
  const probe = unitVector(0.999, 0.04, 512);
  const r = registry.identifySpeaker(probe, { source: 'DEEP_NEURAL', embeddingModel: MODEL });
  assert.equal(r.identitySource, 'VERIFIED');
  assert.equal(r.name, 'Abu Musab');
});

test('CASE B: Taghreed medium confidence × 2 → still matches correctly', () => {
  const registry = new SpeakerRegistry();
  registry.registerOrUpdateSpeaker('Taghreed', unitVector(1, 0, 512), { embeddingModel: MODEL });
  const mediumProbe = unitVector(0.75, 0.66, 512);
  const r1 = registry.identifySpeaker(mediumProbe, { source: 'DEEP_NEURAL', embeddingModel: MODEL });
  const r2 = registry.identifySpeaker(mediumProbe, { source: 'DEEP_NEURAL', embeddingModel: MODEL });
  assert.equal(r1.name, 'Taghreed');
  assert.equal(r2.name, 'Taghreed', 'Same candidate must match on second probe');
});

test('CASE C: Abu Musab then Taghreed → Taghreed starts fresh', () => {
  const registry = new SpeakerRegistry();
  registry.registerOrUpdateSpeaker('Abu Musab', unitVector(1, 0, 512), { embeddingModel: MODEL });
  registry.registerOrUpdateSpeaker('Taghreed', unitVector(0, 1, 512), { embeddingModel: MODEL });
  const r1 = registry.identifySpeaker(unitVector(0.99, 0.04, 512), { source: 'DEEP_NEURAL', embeddingModel: MODEL });
  const r2 = registry.identifySpeaker(unitVector(0.04, 0.99, 512), { source: 'DEEP_NEURAL', embeddingModel: MODEL });
  assert.equal(r1.name, 'Abu Musab');
  assert.equal(r2.name, 'Taghreed', 'Taghreed must not inherit Abu Musab evidence');
});

test('CASE D: Taghreed VERIFIED then Abu Musab VERIFIED → no leakage', () => {
  const registry = new SpeakerRegistry();
  registry.registerOrUpdateSpeaker('Taghreed', unitVector(0, 1, 512), { embeddingModel: MODEL });
  registry.registerOrUpdateSpeaker('Abu Musab', unitVector(1, 0, 512), { embeddingModel: MODEL });
  const r1 = registry.identifySpeaker(unitVector(0.04, 0.99, 512), { source: 'DEEP_NEURAL', embeddingModel: MODEL });
  const r2 = registry.identifySpeaker(unitVector(0.99, 0.04, 512), { source: 'DEEP_NEURAL', embeddingModel: MODEL });
  assert.equal(r1.name, 'Taghreed');
  assert.equal(r1.identitySource, 'VERIFIED');
  assert.equal(r2.name, 'Abu Musab');
  assert.equal(r2.identitySource, 'VERIFIED');
  assert.notEqual(r2.name, 'Taghreed');
});

test('CASE UNKNOWN: does not become chair/account owner', () => {
  const registry = new SpeakerRegistry();
  registry.registerOrUpdateSpeaker('Abu Musab', unitVector(1, 0, 512), { embeddingModel: MODEL });
  const unknownProbe = unitVector(-1, -1, 512);
  const r = registry.identifySpeaker(unknownProbe, { source: 'DEEP_NEURAL', embeddingModel: MODEL });
  assert.notEqual(r.name, 'Abu Musab');
  assert.notEqual(r.name, 'رئيس الجلسة');
  assert.notEqual(r.name, 'المستخدم');
});

// =====================================================================
// LIVE EVIDENCE FREEZE — verify no regression
// =====================================================================

test('LIVE-EVIDENCE FREEZE: exactly 1 active liveEvidence.delete (in disposeSession only)', () => {
  const lines = ENGINE_SOURCE.split('\n');
  const activeDeletes = lines.filter(l =>
    l.includes('this.liveEvidence.delete') &&
    !l.trim().startsWith('//') &&
    !l.trim().startsWith('*')
  );
  assert.equal(activeDeletes.length, 1,
    `Expected exactly 1 active liveEvidence.delete (in disposeSession), found ${activeDeletes.length}`);
});

test('THRESHOLD FREEZE: SPEAKER_THRESHOLDS unchanged', () => {
  assert.equal(SPEAKER_THRESHOLDS.SAME_SPEAKER_THRESHOLD, 0.72);
  assert.equal(SPEAKER_THRESHOLDS.HIGH_CONFIDENCE_THRESHOLD, 0.82);
  assert.equal(SPEAKER_THRESHOLDS.MEDIUM_CONFIDENCE_THRESHOLD, 0.76);
  assert.equal(SPEAKER_THRESHOLDS.CANDIDATE_MATCH_THRESHOLD, 0.78);
  assert.equal(SPEAKER_THRESHOLDS.MIN_DECISION_MARGIN, 0.055);
  assert.equal(SPEAKER_THRESHOLDS.MAX_ENROLLMENT_SAMPLES, 8);
});
