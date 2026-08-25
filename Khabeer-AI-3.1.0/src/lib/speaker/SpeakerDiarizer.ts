import { AudioFeatures } from './AudioFeatures.ts';
import { SpeakerRegistry } from './SpeakerRegistry.ts';
import { SPEAKER_THRESHOLDS } from './types.ts';
import { buildConsensusEmbedding, selectSpeakerWindows } from './SpeakerWindowing.ts';
import type {
  SpeakerDiarizerCallbacks,
  SpeakerEmbeddingProvider,
  SpeakerIdentificationResult,
  SpeechSegment,
} from './types.ts';

export class SpeakerDiarizer {
  private activeBuffer: Float32Array[] = [];
  private totalBufferedSamples = 0;
  private segmentStartTime = Date.now();
  private segmentCounter = 0;
  private currentSpeakerId: string | null = null;
  private currentSpeakerName: string | null = null;

  constructor(
    private readonly registry: SpeakerRegistry,
    private readonly provider: SpeakerEmbeddingProvider,
    private readonly callbacks: SpeakerDiarizerCallbacks = {},
  ) {}

  public pushAudioChunk(chunk: Float32Array): void {
    if (!chunk?.length) return;
    if (this.totalBufferedSamples === 0) this.segmentStartTime = Date.now();
    this.activeBuffer.push(new Float32Array(chunk));
    this.totalBufferedSamples += chunk.length;

    const maxSamples = SPEAKER_THRESHOLDS.SAMPLE_RATE * SPEAKER_THRESHOLDS.MAX_SEGMENT_DURATION_SEC;
    while (this.totalBufferedSamples > maxSamples && this.activeBuffer.length > 1) {
      const removed = this.activeBuffer.shift();
      this.totalBufferedSamples -= removed?.length || 0;
    }
  }

  public getBufferedSampleCount(): number {
    return this.totalBufferedSamples;
  }

  public retainRecentSamples(maxSamples: number): void {
    const limit = Math.max(0, Math.floor(maxSamples));
    while (this.totalBufferedSamples > limit && this.activeBuffer.length) {
      const first = this.activeBuffer[0];
      const excess = this.totalBufferedSamples - limit;
      if (excess >= first.length) {
        this.activeBuffer.shift();
        this.totalBufferedSamples -= first.length;
      } else {
        this.activeBuffer[0] = first.slice(excess);
        this.totalBufferedSamples -= excess;
      }
    }
    this.segmentStartTime = Date.now() - Math.round((this.totalBufferedSamples / SPEAKER_THRESHOLDS.SAMPLE_RATE) * 1000);
  }

  public async probeActiveSegment(): Promise<SpeakerIdentificationResult | null> {
    const minSamples = SPEAKER_THRESHOLDS.SAMPLE_RATE * SPEAKER_THRESHOLDS.PROBE_AUDIO_DURATION_SEC;
    if (this.totalBufferedSamples < minSamples) return null;

    const pcm = this.concatenateBuffer();
    const embeddingPcm = selectSpeakerWindows(pcm, 1)[0] || pcm;
    const probeDurationSec = embeddingPcm.length / SPEAKER_THRESHOLDS.SAMPLE_RATE;
    let probeSumSq = 0;
    let probePeak = 0;

    for (let i = 0; i < embeddingPcm.length; i++) {
      const v = embeddingPcm[i];
      probeSumSq += v * v;
      const a = Math.abs(v);
      if (a > probePeak) probePeak = a;
    }

    const probeRms = Math.sqrt(probeSumSq / Math.max(1, embeddingPcm.length));
    this.callbacks.onDebugLog?.(
      `[Speaker:ProbeAudio] duration=${probeDurationSec.toFixed(3)}s samples=${embeddingPcm.length} rms=${probeRms.toFixed(5)} peak=${probePeak.toFixed(5)}`
    );
    const quality = AudioFeatures.checkAudioQuality(pcm);
    if (!quality.isValid) return null;

    const startedAt = Date.now();
    let embedding: number[] = [];
    try {
      // 5-second hard timeout for the neural model to prevent pipeline freeze
      embedding = await Promise.race([
        this.provider.extractEmbedding(embeddingPcm),
        new Promise<number[]>((_, reject) => setTimeout(() => reject(new Error('EMBEDDING_TIMEOUT')), 5000))
      ]);
    } catch (error) {
      this.callbacks.onDebugLog?.(`[Speaker] probe embedding failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    
    const result = this.registry.identifySpeaker(embedding, {
      segmentId: this.segmentCounter + 1,
      latencyMs: Date.now() - startedAt,
      source: this.provider.getName().includes('Neural') ? 'DEEP_NEURAL' : 'ACOUSTIC_FALLBACK',
      embeddingModel: this.provider.getModelId(),
      createCandidate: false,
      previousSpeakerId: this.currentSpeakerId,
    });
    
    if (result.status === 'SUCCESS' && result.speakerId && result.confidence !== 'LOW') {
      if (this.currentSpeakerId !== result.speakerId) {
         this.currentSpeakerId = result.speakerId;
         this.currentSpeakerName = result.name;
      }
    }
    
    return result;
  }

  public async finalizeSegment(): Promise<SpeechSegment | null> {
    const minSamples = SPEAKER_THRESHOLDS.SAMPLE_RATE * SPEAKER_THRESHOLDS.MIN_AUDIO_DURATION_SEC;
    if (this.totalBufferedSamples < minSamples) {
      this.clearBuffer();
      return null;
    }

    const pcm = this.concatenateBuffer();
    const embeddingWindows = selectSpeakerWindows(pcm, 3);
    const embeddingPcm = embeddingWindows[0] || pcm;
    const finalDurationSec = embeddingPcm.length / SPEAKER_THRESHOLDS.SAMPLE_RATE;
    let finalSumSq = 0;
    let finalPeak = 0;

    for (let i = 0; i < embeddingPcm.length; i++) {
      const v = embeddingPcm[i];
      finalSumSq += v * v;
      const a = Math.abs(v);
      if (a > finalPeak) finalPeak = a;
    }

    const finalRms = Math.sqrt(finalSumSq / Math.max(1, embeddingPcm.length));
    this.callbacks.onDebugLog?.(
      `[Speaker:FinalAudio] duration=${finalDurationSec.toFixed(3)}s samples=${embeddingPcm.length} rms=${finalRms.toFixed(5)} peak=${finalPeak.toFixed(5)}`
    );
    const endTime = Date.now();
    const quality = AudioFeatures.checkAudioQuality(pcm);
    if (!quality.isValid) {
      this.clearBuffer();
      this.callbacks.onDebugLog?.(`[Speaker] dropped segment: ${quality.reason}`);
      return null;
    }

    const segmentId = ++this.segmentCounter;
    const startedAt = Date.now();
    let result: SpeakerIdentificationResult;
    let embedding: number[] = [];
    try {
      // 5-second hard timeout for finalize as well
      embedding = await Promise.race([
        Promise.all(embeddingWindows.map((window) => this.provider.extractEmbedding(window)))
          .then(buildConsensusEmbedding),
        new Promise<number[]>((_, reject) => setTimeout(() => reject(new Error('EMBEDDING_TIMEOUT')), 5000))
      ]);
      result = this.registry.identifySpeaker(embedding, {
        segmentId,
        latencyMs: Date.now() - startedAt,
        source: this.provider.getName().includes('Neural') ? 'DEEP_NEURAL' : 'ACOUSTIC_FALLBACK',
        embeddingModel: this.provider.getModelId(),
        createCandidate: true,
        previousSpeakerId: this.currentSpeakerId,
      });
    } catch (error: any) {
      this.clearBuffer();
      this.callbacks.onDebugLog?.(`[Speaker] embedding failed: ${error?.message || error}`);
      return null;
    }

    const segment: SpeechSegment = {
      id: segmentId,
      startTime: this.segmentStartTime,
      endTime,
      durationMs: endTime - this.segmentStartTime,
      speakerId: result.speakerId || 'speaker_unknown',
      speakerName: result.name,
      confidence: result.confidence,
      similarity: result.similarity,
      identitySource: result.identitySource,
      pcmData: pcm,
      embedding,
    };

    if (result.status === 'SUCCESS' && result.speakerId && result.confidence !== 'LOW') {
      const previous = this.currentSpeakerId;
      if (previous !== result.speakerId) {
        this.currentSpeakerId = result.speakerId;
        this.currentSpeakerName = result.name;
        this.callbacks.onSpeakerChanged?.(result.speakerId, result.name, previous);
      }

      // Safe continued learning: only a strong FINAL neural match may enrich a
      // durable profile. This creates a small multi-condition voice gallery
      // without teaching from weak/ambiguous probes, echo, or fallback space.
      const safeToLearn = this.provider.getName().includes('Neural')
        && result.identitySource === 'VERIFIED'
        && result.confidence === 'HIGH'
        && segment.durationMs >= 1200
        && result.debugInfo.margin >= SPEAKER_THRESHOLDS.MIN_DECISION_MARGIN * 1.5;
      if (safeToLearn) {
        const learned = this.registry.updateSpeaker(result.speakerId, embedding, 'HIGH');
        if (learned) {
          this.callbacks.onDebugLog?.(`[Speaker:Learning] enriched verified profile=${result.name}/${result.speakerId} duration=${segment.durationMs}ms margin=${result.debugInfo.margin.toFixed(3)}`);
        }
      }
    }

    this.callbacks.onSpeakerIdentified?.(result, segment);
    this.callbacks.onSegmentComplete?.(segment);
    const embNorm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)).toFixed(3);
    this.callbacks.onDebugLog?.(
      `[Speaker:FinalSegment] segment=${segmentId} duration=${segment.durationMs}ms embNorm=${embNorm} bestId=${result.debugInfo.bestSpeakerId} bestName=${result.name} sim=${result.similarity.toFixed(3)} secondSim=${result.debugInfo.secondBestSimilarity.toFixed(3)} margin=${result.debugInfo.margin.toFixed(3)} prevId=${this.currentSpeakerId} clusterId=${result.debugInfo.clusterId || 'NONE'} decisionReason=${result.debugInfo.decisionReason || result.debugInfo.reason || 'UNKNOWN'}`,
      { segment, result },
    );
    this.clearBuffer();
    return segment;
  }

  public async enrollSpeakerWithSamples(name: string, samples: Float32Array[]): Promise<ReturnType<SpeakerRegistry['registerSpeaker']>> {
    if (!samples.length) throw new Error('SPEAKER_SAMPLES_REQUIRED');
    const embeddings = await Promise.all(samples.map((sample) => this.provider.extractEmbedding(sample)));
    const profile = this.registry.registerOrUpdateSpeaker(name, embeddings[0], { embeddingModel: this.provider.getModelId() });
    for (const embedding of embeddings.slice(1)) this.registry.updateSpeaker(profile.id, embedding, 'HIGH', true);
    return profile;
  }

  private concatenateBuffer(): Float32Array {
    const output = new Float32Array(this.totalBufferedSamples);
    let offset = 0;
    for (const chunk of this.activeBuffer) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }
  private clearBuffer(): void {
    this.activeBuffer = [];
    this.totalBufferedSamples = 0;
    this.segmentStartTime = Date.now();
  }
}
