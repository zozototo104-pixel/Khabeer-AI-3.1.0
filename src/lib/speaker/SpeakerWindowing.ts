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

export interface ConsensusEmbeddingResult {
  consensus: number[];
  acceptedEmbeddings: number[][];
  rejectedCount: number;
  consistencyScores: number[];
}

/**
 * Robustly average embeddings while removing acoustically inconsistent windows
 * before they enter the persistent voiceprint gallery. The same filtering is
 * used by buildConsensusEmbedding() for backward compatibility.
 */
export function buildConsensusEmbeddingResult(embeddings: number[][]): ConsensusEmbeddingResult {
  const valid = embeddings.filter((embedding) => embedding.length > 0 && embedding.every(Number.isFinite));
  if (!valid.length) return { consensus: [], acceptedEmbeddings: [], rejectedCount: 0, consistencyScores: [] };
  if (valid.length === 1) {
    const normalized = Array.from(AudioFeatures.l2Normalize(valid[0]));
    return { consensus: normalized, acceptedEmbeddings: [normalized], rejectedCount: 0, consistencyScores: [1] };
  }

  const dimension = valid[0].length;
  const sameDimension = valid.filter((embedding) => embedding.length === dimension);
  if (!sameDimension.length) return { consensus: [], acceptedEmbeddings: [], rejectedCount: valid.length, consistencyScores: [] };

  const provisional = AudioFeatures.computeCentroid(sameDimension);
  const ranked = sameDimension
    .map((embedding) => ({
      embedding: Array.from(AudioFeatures.l2Normalize(embedding)),
      similarity: AudioFeatures.cosineSimilarity(embedding, provisional),
    }))
    .sort((a, b) => b.similarity - a.similarity);
  const best = ranked[0]?.similarity ?? 0;
  const consistent = ranked.filter((item) => item.similarity >= 0.60 && item.similarity >= best - 0.08);
  const accepted = (consistent.length ? consistent : [ranked[0]]).map((item) => item.embedding);

  return {
    consensus: AudioFeatures.computeCentroid(accepted),
    acceptedEmbeddings: accepted,
    rejectedCount: sameDimension.length - accepted.length,
    consistencyScores: ranked.map((item) => item.similarity),
  };
}

/** Robustly average embeddings while rejecting acoustically inconsistent windows. */
export function buildConsensusEmbedding(embeddings: number[][]): number[] {
  return buildConsensusEmbeddingResult(embeddings).consensus;
}
