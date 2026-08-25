import assert from 'node:assert/strict';
import { speakerRecognitionService } from '../server/services/speaker/SpeakerRecognitionService.ts';

const health = await speakerRecognitionService.checkHealth();
assert.equal(health.neuralAvailable, true, String(health.warning || 'Neural model unavailable'));
assert.equal(health.mode, 'NEURAL');
assert.equal(health.embeddingDimension, 512);

const sampleRate = 16_000;
const pcm = new Float32Array(sampleRate * 2);
for (let index = 0; index < pcm.length; index++) {
  const envelope = 0.72 + 0.28 * Math.sin(2 * Math.PI * 3 * index / sampleRate);
  pcm[index] = envelope * (
    0.14 * Math.sin(2 * Math.PI * 180 * index / sampleRate)
    + 0.04 * Math.sin(2 * Math.PI * 430 * index / sampleRate)
  );
}

const embedding = await speakerRecognitionService.getEmbedding(pcm);
assert.equal(embedding.length, 512);
assert.ok(embedding.every(Number.isFinite));
const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
assert.ok(Math.abs(norm - 1) < 1e-5);

console.log(JSON.stringify({ ok: true, health, embeddingNorm: norm }, null, 2));
process.exit(0);