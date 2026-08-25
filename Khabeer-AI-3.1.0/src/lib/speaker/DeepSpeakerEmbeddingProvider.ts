import { pcmToBase64 } from '../audio.ts';
import { getAuthToken } from '../firebase.ts';
import { AudioFeatures } from './AudioFeatures.ts';
import { SPEAKER_THRESHOLDS } from './types.ts';
import type { SpeakerEmbeddingProvider } from './types.ts';

/**
 * Browser provider. The ONNX model stays on the server; this prevents the UI
 * thread from running a second inference pass while a meeting is in progress.
 * Identity enrollment fails closed when the neural model is unavailable. A
 * lightweight acoustic signature must never be presented as a reliable human
 * identity profile.
 */
export class DeepSpeakerEmbeddingProvider implements SpeakerEmbeddingProvider {
  private dimension = 512;
  private mode: 'Neural' | 'Unavailable' = 'Neural';
  private modelId = 'unknown';

  async extractEmbedding(pcmData: Float32Array): Promise<number[]> {
    const quality = AudioFeatures.checkAudioQuality(pcmData);
    if (!quality.isValid) throw new Error(`LOW_AUDIO_QUALITY:${quality.reason}`);

    try {
      const token = await getAuthToken();
      if (!token) throw new Error('AUTH_REQUIRED');
      const response = await fetch('/api/speaker/embedding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ pcmData: pcmToBase64(pcmData), isBase64: true, isPcm16: true }),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.embedding) || payload.embedding.length !== 512) {
        throw new Error(`UNEXPECTED_EMBEDDING_DIM: got ${Array.isArray(payload.embedding) ? payload.embedding.length : 0}, expected 512`);
      }
      this.dimension = 512;
      if (payload.mode !== 'NEURAL') throw new Error('NEURAL_SPEAKER_MODEL_UNAVAILABLE');
      this.mode = 'Neural';
      this.modelId = String(payload.modelId || 'server-neural-unknown');
      return payload.embedding;
    } catch (error) {
      console.warn('[Speaker] neural embedding unavailable; enrollment rejected', error);
      this.mode = 'Unavailable';
      this.modelId = 'unavailable';
      throw new Error('NEURAL_SPEAKER_MODEL_UNAVAILABLE');
    }
  }

  getName(): string {
    return this.mode === 'Neural' ? 'Server Neural Speaker Embedding' : 'Neural Speaker Embedding Unavailable';
  }

  getDimension(): number {
    return this.dimension;
  }

  getModelId(): string {
    return this.modelId;
  }
}
