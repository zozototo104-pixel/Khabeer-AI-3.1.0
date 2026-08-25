import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioFeatures } from '../src/lib/speaker/AudioFeatures.ts';
import { SpeakerRegistry } from '../src/lib/speaker/SpeakerRegistry.ts';

function unitVector(first: number, second = 0, dimension = 128): number[] {
  const values = new Array(dimension).fill(0);
  values[0] = first;
  values[1] = second;
  return Array.from(AudioFeatures.l2Normalize(values));
}

test('recognizes a verified enrolled speaker without identity drift', () => {
  const registry = new SpeakerRegistry();
  const ahmed = registry.registerSpeaker('أحمد', unitVector(1));
  registry.registerSpeaker('خليل', unitVector(0, 1));

  const result = registry.identifySpeaker(unitVector(0.999, 0.02), { createCandidate: false });
  assert.equal(result.speakerId, ahmed.id);
  assert.equal(result.name, 'أحمد');
  assert.equal(result.identitySource, 'VERIFIED');
});

test('does not force an unknown voice onto the closest enrolled person', () => {
  const registry = new SpeakerRegistry();
  registry.registerSpeaker('أحمد', unitVector(1));
  registry.registerSpeaker('خليل', unitVector(0, 1));

  const unknown = unitVector(0, 0, 128).map((_, index) => index === 2 ? 1 : 0);
  
  // First time it's UNKNOWN (Orphan Pending)
  const result1 = registry.identifySpeaker(unknown, { createCandidate: true });
  assert.equal(result1.identitySource, 'UNKNOWN');
  
  // Second time it becomes a CANDIDATE
  const result2 = registry.identifySpeaker(unknown, { createCandidate: true });
  assert.equal(result2.identitySource, 'CANDIDATE');
  assert.equal(result2.isNewCandidate, true);
  assert.match(result2.speakerId || '', /^unknown_/);
});

test('rejects ambiguous matches instead of guessing a name', () => {
  const registry = new SpeakerRegistry();
  const a = unitVector(1, 0);
  const b = unitVector(0.9, 0.435889894);
  registry.registerSpeaker('أحمد', a);
  registry.registerSpeaker('خليل', b);
  const midway = AudioFeatures.computeCentroid([a, b]);

  const result = registry.identifySpeaker(midway, { createCandidate: false });
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(result.speakerId, null);
});

test('validates dimensions and protects enrollment centroid from unrelated audio', () => {
  const registry = new SpeakerRegistry();
  const profile = registry.registerSpeaker('أحمد', unitVector(1));

  assert.equal(registry.updateSpeaker(profile.id, unitVector(0, 1), 'HIGH'), false);
  assert.equal(registry.updateSpeaker(profile.id, new Array(64).fill(0.1), 'HIGH'), false);
  assert.equal(registry.getAllSpeakers()[0].sampleCount, 1);
});

test('remembers an explicitly named fallback profile only at a near-identical score', () => {
  const registry = new SpeakerRegistry();
  const profile = registry.registerSpeaker('أحمد', unitVector(128, 6));
  const exact = registry.identifySpeaker(unitVector(128, 6), {
    source: 'ACOUSTIC_FALLBACK',
    createCandidate: false,
  });
  assert.equal(exact.speakerId, profile.id);
  assert.equal(exact.identitySource, 'VERIFIED');
  assert.equal(exact.confidence, 'LOW');

  const different = registry.identifySpeaker(unitVector(128, 60), {
    source: 'ACOUSTIC_FALLBACK',
    createCandidate: false,
  });
  assert.equal(different.speakerId, null);
});

test('never compares embeddings produced by different neural model versions', () => {
  const registry = new SpeakerRegistry();
  registry.registerSpeaker('أحمد', unitVector(1), { embeddingModel: 'eres2net-v1' });

  const result = registry.identifySpeaker(unitVector(1), {
    source: 'DEEP_NEURAL',
    embeddingModel: 'eres2net-v2',
    createCandidate: false,
  });

  assert.equal(result.speakerId, null);
  assert.notEqual(result.identitySource, 'VERIFIED');
});

test('uses multiple enrolled samples without letting one gallery outlier force identity', () => {
  const registry = new SpeakerRegistry();
  const profile = registry.registerSpeaker('محمد', unitVector(1, 0));
  assert.equal(registry.updateSpeaker(profile.id, unitVector(0.98, 0.2), 'HIGH', true), true);
  assert.equal(registry.updateSpeaker(profile.id, unitVector(0.96, -0.28), 'HIGH', true), true);

  const result = registry.identifySpeaker(unitVector(0.97, 0.18), { createCandidate: false });
  assert.equal(result.speakerId, profile.id);
  assert.equal(result.identitySource, 'VERIFIED');
});

test('reuses an existing candidate cluster instead of creating duplicate unknown speakers', () => {
  const registry = new SpeakerRegistry();
  const unknown = unitVector(0, 0, 128).map((_, index) => index === 3 ? 1 : 0);
  registry.identifySpeaker(unknown, { createCandidate: true });
  const created = registry.identifySpeaker(unknown, { createCandidate: true });
  assert.equal(created.identitySource, 'CANDIDATE');
  const reused = registry.identifySpeaker(unknown, { createCandidate: true });
  assert.equal(reused.identitySource, 'CANDIDATE');
  assert.equal(reused.speakerId, created.speakerId);
  assert.equal(reused.isNewCandidate, false);
});

test('repeated explicit enrollment augments one named profile instead of creating duplicates', () => {
  const registry = new SpeakerRegistry();
  const model = 'eres2net-v1';

  const first = registry.registerOrUpdateSpeaker('محمد', unitVector(1, 0, 512), { embeddingModel: model });
  const second = registry.registerOrUpdateSpeaker('  محمد  ', unitVector(0.99, 0.08, 512), { embeddingModel: model });
  const third = registry.registerOrUpdateSpeaker('محمد', unitVector(0.98, -0.1, 512), { embeddingModel: model });

  assert.equal(first.id, second.id);
  assert.equal(second.id, third.id);
  const speakers = registry.getAllSpeakers();
  assert.equal(speakers.length, 1);
  assert.equal(speakers[0].name, 'محمد');
  assert.equal(speakers[0].sampleCount, 3);
  assert.equal(speakers[0].embeddings.length, 3);
  assert.equal(speakers[0].centroidEmbedding.length, 512);
});

test('explicit enrollment never merges same-name profiles across incompatible neural model contracts', () => {
  const registry = new SpeakerRegistry();
  registry.registerOrUpdateSpeaker('محمد', unitVector(1, 0, 512), { embeddingModel: 'eres2net-v1' });
  registry.registerOrUpdateSpeaker('محمد', unitVector(1, 0, 512), { embeddingModel: 'eres2net-v2' });

  const speakers = registry.getAllSpeakers();
  assert.equal(speakers.length, 2);
  assert.equal(speakers[0].sampleCount, 1);
  assert.equal(speakers[1].sampleCount, 1);
  assert.notEqual(speakers[0].embeddingModel, speakers[1].embeddingModel);
});
