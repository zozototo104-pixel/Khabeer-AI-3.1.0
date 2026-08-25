import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioFeatures } from '../src/lib/speaker/AudioFeatures.ts';
import { buildConsensusEmbedding, selectSpeakerWindows } from '../src/lib/speaker/SpeakerWindowing.ts';

function voiced(seconds: number, amplitude = 0.12): Float32Array {
  const pcm = new Float32Array(Math.floor(16000 * seconds));
  for (let i = 0; i < pcm.length; i++) pcm[i] = amplitude * Math.sin(2 * Math.PI * 180 * i / 16000);
  return pcm;
}

test('speaker window selection uses several temporally distinct quality windows', () => {
  const windows = selectSpeakerWindows(voiced(7), 3);
  assert.equal(windows.length, 3);
  assert.ok(windows.every((window) => window.length === 32000));
});

test('speaker consensus rejects one inconsistent embedding outlier', () => {
  const a = Array.from(AudioFeatures.l2Normalize([1, 0, 0, 0]));
  const b = Array.from(AudioFeatures.l2Normalize([0.99, 0.05, 0, 0]));
  const outlier = Array.from(AudioFeatures.l2Normalize([0, 0, 1, 0]));
  const consensus = buildConsensusEmbedding([a, b, outlier]);
  assert.ok(AudioFeatures.cosineSimilarity(consensus, a) > 0.98);
  assert.ok(AudioFeatures.cosineSimilarity(consensus, outlier) < 0.2);
});
