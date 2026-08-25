import { AudioFeatures } from './AudioFeatures.ts';
import { SPEAKER_THRESHOLDS } from './types.ts';

interface ScoredWindow {
  pcm: Float32Array;
  start: number;
  score: number;
}

/** Select several high-quality, temporally diverse speech windows. */
export function selectSpeakerWindows(pcm: Float32Array, maxWindows = 3): Float32Array[] {
  if (!pcm?.length || maxWindows <= 0) return [];
  const sampleRate = SPEAKER_THRESHOLDS.SAMPLE_RATE;
  const targetSamples = Math.min(pcm.length, Math.floor(sampleRate * 2.0));
  if (pcm.length <= targetSamples) return [new Float32Array(pcm)];

  const stepSamples = Math.max(1, Math.floor(sampleRate * 0.5));
  const scored: ScoredWindow[] = [];
  for (let start = 0; start + targetSamples <= pcm.length; start += stepSamples) {
    const window = pcm.slice(start, start + targetSamples);
    const quality = AudioFeatures.checkAudioQuality(window);
    if (!quality.isValid) continue;
    let clipped = 0;
    for (let i = 0; i < window.length; i++) {
      if (Math.abs(window[i]) >= 0.98) clipped += 1;
    }
    const clippingRatio = clipped / window.length;
    const score = quality.rms * (1 - Math.min(0.9, clippingRatio * 12));
    scored.push({ pcm: window, start, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const selected: ScoredWindow[] = [];
  for (const candidate of scored) {
    const sufficientlyDistinct = selected.every((chosen) =>
      Math.abs(candidate.start - chosen.start) >= Math.floor(targetSamples * 0.55),
    );
    if (sufficientlyDistinct) selected.push(candidate);
    if (selected.length >= maxWindows) break;
  }
  return (selected.length ? selected : [{ pcm: pcm.slice(0, targetSamples), start: 0, score: 0 }])
    .map((entry) => entry.pcm);
}

/** Robustly average embeddings while rejecting one acoustically inconsistent window. */
export function buildConsensusEmbedding(embeddings: number[][]): number[] {
  const valid = embeddings.filter((embedding) => embedding.length > 0 && embedding.every(Number.isFinite));
  if (!valid.length) return [];
  if (valid.length === 1) return Array.from(AudioFeatures.l2Normalize(valid[0]));
  const dimension = valid[0].length;
  const sameDimension = valid.filter((embedding) => embedding.length === dimension);
  const provisional = AudioFeatures.computeCentroid(sameDimension);
  const ranked = sameDimension
    .map((embedding) => ({ embedding, similarity: AudioFeatures.cosineSimilarity(embedding, provisional) }))
    .sort((a, b) => b.similarity - a.similarity);
  const best = ranked[0]?.similarity ?? 0;
  const consistent = ranked
    .filter((item) => item.similarity >= 0.60 && item.similarity >= best - 0.08)
    .map((item) => item.embedding);
  return AudioFeatures.computeCentroid(consistent.length ? consistent : [ranked[0].embedding]);
}
