import { SpeakerRegistry } from '../../../src/lib/speaker/SpeakerRegistry.ts';
import { SpeakerDiarizer } from '../../../src/lib/speaker/SpeakerDiarizer.ts';
import { SPEAKER_THRESHOLDS } from '../../../src/lib/speaker/types.ts';
import type {
  SpeakerProfile,
  SpeakerIdentificationResult,
  SpeechSegment,
  ConfidenceLevel,
  SpeakerEmbeddingProvider,
} from '../../../src/lib/speaker/types.ts';
import {
  speakerRecognitionService,
  type SpeakerRecognitionService,
} from '../speaker/SpeakerRecognitionService.ts';

/**
 * Server-side Speaker Embedding Provider
 * Bridges the SpeakerDiarizer with the ONNX-based SpeakerRecognitionService
 */
class ServerSpeakerEmbeddingProvider implements SpeakerEmbeddingProvider {
  private service: SpeakerRecognitionService;

  constructor() {
    // Share one native ONNX session between health checks and live meetings.
    this.service = speakerRecognitionService;
  }

  async extractEmbedding(pcmData: Float32Array): Promise<number[]> {
    return this.service.getEmbedding(pcmData);
  }

  getName(): string {
    return this.service.getMode() === 'NEURAL'
      ? 'Neural Speaker Embedding (Server/ONNX)'
      : 'Acoustic Fallback Embedding (Server)';
  }

  getDimension(): number {
    return this.service.getEmbeddingDimension();
  }

  getModelId(): string {
    return this.service.getModelId();
  }

  checkHealth(): Promise<Record<string, unknown>> {
    return this.service.checkHealth();
  }
}

/**
 * SpeechEngine
 *
 * Full-fledged server-side Speaker Recognition & Diarization Engine.
 * Extracts neural embeddings when a model is installed, otherwise explicit
 * acoustic fallback embeddings, from PCM audio streams,
 * compares against enrolled speaker prototypes with Cosine Similarity,
 * prevents identity drift, and maintains session-isolated speaker registries.
 */
export class SpeechEngine {
  private sessionRegistries: Map<string, SpeakerRegistry> = new Map();
  private sessionDiarizers: Map<string, SpeakerDiarizer> = new Map();
  private globalRegistry: SpeakerRegistry;
  private provider: ServerSpeakerEmbeddingProvider;
  private probeInFlight: Map<string, Promise<SpeakerIdentificationResult | null>> = new Map();
  private lastProbeAt: Map<string, number> = new Map();
  private activeSpeechSessions: Set<string> = new Set();
  private liveEvidence: Map<string, { speakerId: string; hits: number; scoreSum: number; lastAt: number }> = new Map();

  constructor() {
    this.globalRegistry = new SpeakerRegistry();
    this.provider = new ServerSpeakerEmbeddingProvider();
  }

  public checkHealth(): Promise<Record<string, unknown>> {
    return this.provider.checkHealth();
  }

  // V6.1 SURGICAL FIX 3 — expose the provider so the multi-sample
  // enrollment endpoint can call extractEmbedding() on each raw PCM
  // sample independently. This is the SAME provider used by live
  // recognition, so enrollment and live identification share the exact
  // same neural model path.
  public getProvider(): ServerSpeakerEmbeddingProvider {
    return this.provider;
  }


  /**
   * Fast/Final split inspired by WhoSpeaksLive: a very strong live probe may
   * light the speaker immediately, while medium evidence needs corroboration.
   * Final segment attribution remains authoritative.
   */
  private stabilizeLiveProbe(
    result: SpeakerIdentificationResult | null,
    sessionId: string,
  ): SpeakerIdentificationResult | null {
    if (!result || result.identitySource !== 'VERIFIED' || !result.speakerId) return null;
    const now = Date.now();
    const previous = this.liveEvidence.get(sessionId);
    const same = previous && previous.speakerId === result.speakerId && now - previous.lastAt <= 3500;
    const evidence = same
      ? { speakerId: result.speakerId, hits: previous.hits + 1, scoreSum: previous.scoreSum + result.similarity, lastAt: now }
      : { speakerId: result.speakerId, hits: 1, scoreSum: result.similarity, lastAt: now };
    this.liveEvidence.set(sessionId, evidence);

    const margin = Number(result.debugInfo?.margin || 0);
    const immediate = result.confidence === 'HIGH'
      && result.similarity >= SPEAKER_THRESHOLDS.HIGH_CONFIDENCE_THRESHOLD
      && margin >= SPEAKER_THRESHOLDS.MIN_DECISION_MARGIN * 1.5;
    const corroborated = evidence.hits >= 2
      && (evidence.scoreSum / evidence.hits) >= SPEAKER_THRESHOLDS.MEDIUM_CONFIDENCE_THRESHOLD
      && margin >= SPEAKER_THRESHOLDS.MIN_DECISION_MARGIN;

    return immediate || corroborated ? result : null;
  }

  /**
   * Retrieves or initializes a SpeakerRegistry for a specific session
   */
  public getSessionRegistry(sessionId: string = 'global'): SpeakerRegistry {
    if (!this.sessionRegistries.has(sessionId)) {
      this.sessionRegistries.set(sessionId, new SpeakerRegistry());
    }
    return this.sessionRegistries.get(sessionId)!;
  }

  /**
   * Retrieves or initializes a SpeakerDiarizer for a specific session
   */
  public getSessionDiarizer(sessionId: string = 'global'): SpeakerDiarizer {
    if (!this.sessionDiarizers.has(sessionId)) {
      const registry = this.getSessionRegistry(sessionId);
      const diarizer = new SpeakerDiarizer(registry, this.provider, {
        onDebugLog: (logMessage) => {
          console.log(`[SpeechEngine][${sessionId}] ${logMessage}`);
        }
      });
      this.sessionDiarizers.set(sessionId, diarizer);
    }
    return this.sessionDiarizers.get(sessionId)!;
  }

  /**
   * Detects the speaker identity directly from raw PCM audio
   */
  public async detectSpeaker(pcmData: Float32Array, sessionId: string = 'global'): Promise<SpeakerIdentificationResult> {
    const embedding = await this.provider.extractEmbedding(pcmData);
    const registry = this.getSessionRegistry(sessionId);
    return registry.identifySpeaker(embedding, {
      source: this.provider.getName().includes('Neural') ? 'DEEP_NEURAL' : 'ACOUSTIC_FALLBACK',
      embeddingModel: this.provider.getModelId(),
    });
  }

  /**
   * Matches a pre-extracted embedding against the speaker registry
   */
  public matchSpeaker(embedding: number[], sessionId: string = 'global'): SpeakerIdentificationResult {
    const registry = this.getSessionRegistry(sessionId);
    return registry.identifySpeaker(embedding, {
      source: this.provider.getName().includes('Neural') ? 'DEEP_NEURAL' : 'ACOUSTIC_FALLBACK',
      embeddingModel: this.provider.getModelId(),
    });
  }

  /**
   * Processes an incoming Base64 PCM 16-bit 16kHz audio chunk for real-time speaker tracking
   */
  public async processAudioChunk(
    base64Audio: string,
    sessionId: string = 'global',
    isSpeechEnd: boolean = false
  ): Promise<{
    speakerId: string | null;
    name: string | null;
    similarity: number;
    confidence: ConfidenceLevel | 'NONE';
    isNewCandidate: boolean;
    identitySource?: string;
    debugInfo?: any;
    segment?: SpeechSegment;
  } | null> {
    const diarizer = this.getSessionDiarizer(sessionId);
    
    if (base64Audio) {
      const pcm = this.base64ToPcm(base64Audio);
      diarizer.pushAudioChunk(pcm);

      if (!this.activeSpeechSessions.has(sessionId)) {
        diarizer.retainRecentSamples(Math.floor(SPEAKER_THRESHOLDS.SAMPLE_RATE * 0.4));
        return null;
      }

      const enoughAudio = diarizer.getBufferedSampleCount()
        >= SPEAKER_THRESHOLDS.SAMPLE_RATE * SPEAKER_THRESHOLDS.PROBE_AUDIO_DURATION_SEC;
      const lastProbe = this.lastProbeAt.get(sessionId) || 0;
      if (enoughAudio && Date.now() - lastProbe >= 1200 && !this.probeInFlight.has(sessionId)) {
        this.lastProbeAt.set(sessionId, Date.now());
        const probe = diarizer.probeActiveSegment().finally(() => this.probeInFlight.delete(sessionId));
        this.probeInFlight.set(sessionId, probe);
        const result = await probe;
        
        // Log the probe result for diagnostic purposes
        diarizer['callbacks']?.onDebugLog?.(`[Speaker:Probe] bestName=${result?.name} sim=${result?.similarity?.toFixed(3)} source=${result?.identitySource} prevId=${diarizer['currentSpeakerId']}`);
        
        const stableLive = this.stabilizeLiveProbe(result, sessionId);
        if (stableLive) {
          return {
            speakerId: stableLive.speakerId,
            name: stableLive.name,
            similarity: stableLive.similarity,
            confidence: stableLive.confidence,
            isNewCandidate: false,
            identitySource: stableLive.identitySource,
            debugInfo: { ...stableLive.debugInfo, decisionReason: `LIVE_${stableLive.debugInfo?.decisionReason || 'CORROBORATED'}` },
          };
        }
      }
    }

    if (isSpeechEnd) {
      if (!this.activeSpeechSessions.has(sessionId)) return null;
      try {
        const activeProbe = this.probeInFlight.get(sessionId);
        if (activeProbe) await activeProbe.catch(() => null);
        const segment = await diarizer.finalizeSegment();
        if (segment) {
          return {
            speakerId: segment.speakerId === 'speaker_unknown' ? null : segment.speakerId,
            name: segment.speakerName,
            similarity: segment.similarity,
            confidence: segment.confidence,
            isNewCandidate: segment.identitySource === 'CANDIDATE',
            identitySource: segment.identitySource,
            debugInfo: {
              segmentId: segment.id,
              embeddingDimension: segment.embedding.length,
            },
            segment
          };
        }
      } finally {
        // Always release the session state even when embedding inference fails.
        this.activeSpeechSessions.delete(sessionId);
        // V6.1 SURGICAL FIX (live evidence audit): previously this `finally`
        // block also called `this.liveEvidence.delete(sessionId)`, which
        // fires on EVERY `speech_end` (i.e. every VAD micro-pause between
        // sentences). That wiped the corroboration hit counter before the
        // next speech burst could reach hits >= 2 in stabilizeLiveProbe(),
        // preventing medium-confidence speakers from ever becoming VERIFIED.
        //
        // Behaviour we now preserve:
        //   Taghreed burst 1 → hits=1
        //   short natural VAD pause (speech_end → speech_start)
        //   Taghreed burst 2 (within 3500ms expiry window) → hits=2 → VERIFIED
        //
        // Evidence lifecycle is now governed solely by:
        //   1. The 3500ms expiry window in stabilizeLiveProbe() (line ~92)
        //   2. Candidate mismatch reset in stabilizeLiveProbe() (line ~93-95)
        //   3. disposeSession() — only when the entire meeting ends
        // NO deletion on per-breath speech_end.
      }
    }

    return null;
  }

  public syncSpeakers(profiles: SpeakerProfile[], sessionId: string = 'global'): void {
    const registry = this.getSessionRegistry(sessionId);
    registry.importProfiles(profiles);
    console.log(`[SpeechEngine][${sessionId}] Synced ${profiles.length} speaker profiles.`);
  }

  public beginSpeechSegment(sessionId: string = 'global'): void {
    const diarizer = this.getSessionDiarizer(sessionId);
    diarizer.retainRecentSamples(Math.floor(SPEAKER_THRESHOLDS.SAMPLE_RATE * 0.4));
    this.activeSpeechSessions.add(sessionId);
    this.lastProbeAt.set(sessionId, 0);
    // SECTION B FIX (regression): previously this called
    // `this.liveEvidence.delete(sessionId)` on every speech_start, which
    // also fires on VAD micro-pauses (breaths between sentences). That
    // wiped the candidate's hit counter before it could reach `hits >= 2`
    // in stabilizeLiveProbe(), preventing medium-confidence speakers from
    // ever becoming VERIFIED.
    //
    // The correct behaviour is Candidate-Aware evidence retention:
    //   - If the next probe is the SAME candidate within the 3500ms
    //     expiry window, hits must accumulate (probe1=Taghreed → hits=1,
    //     micro-pause, probe2=Taghreed → hits=2 → VERIFIED).
    //   - If the next probe is a DIFFERENT candidate, stabilizeLiveProbe()
    //     already resets hits to 1 with the new speakerId (line 92-95),
    //     so cross-speaker evidence is naturally isolated.
    //   - If the gap exceeds 3500ms, the same line's `now - previous.lastAt
    //     <= 3500` check fails and a fresh evidence record is created.
    //
    // So we no longer delete here. The expiry + candidate check inside
    // stabilizeLiveProbe() is the single source of truth for evidence
    // lifecycle.
  }

  /**
   * Register a new speaker profile with name and initial audio sample
   */
  public async registerSpeaker(
    name: string,
    initialPcmOrEmbedding?: Float32Array | number[],
    sessionId: string = 'global'
  ): Promise<SpeakerProfile> {
    const registry = this.getSessionRegistry(sessionId);
    let embedding: number[] | undefined;

    if (initialPcmOrEmbedding instanceof Float32Array) {
      embedding = await this.provider.extractEmbedding(initialPcmOrEmbedding);
    } else if (Array.isArray(initialPcmOrEmbedding)) {
      embedding = initialPcmOrEmbedding;
    }

    return registry.registerOrUpdateSpeaker(name, embedding, { embeddingModel: this.provider.getModelId() });
  }

  /**
   * Promotes an unknown candidate to a named confirmed speaker
   */
  public promoteCandidate(candidateId: string, name: string, sessionId: string = 'global'): SpeakerProfile | null {
    const registry = this.getSessionRegistry(sessionId);
    return registry.promoteCandidate(candidateId, name);
  }

  /**
   * Returns all active speaker profiles for a session
   */
  public getSpeakerProfiles(sessionId: string = 'global'): SpeakerProfile[] {
    const registry = this.getSessionRegistry(sessionId);
    return registry.getAllSpeakers();
  }

  public disposeSession(sessionId: string): void {
    this.sessionRegistries.delete(sessionId);
    this.sessionDiarizers.delete(sessionId);
    this.probeInFlight.delete(sessionId);
    this.lastProbeAt.delete(sessionId);
    this.activeSpeechSessions.delete(sessionId);
    this.liveEvidence.delete(sessionId);
  }

  /**
   * Decodes Base64 16-bit PCM to Float32Array (-1.0 to +1.0)
   */
  private base64ToPcm(base64: string): Float32Array {
    const binary = Buffer.from(base64, 'base64');
    const pcm = new Float32Array(binary.length / 2);
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = binary.readInt16LE(i * 2) / 32768;
    }
    return pcm;
  }
}

export const speechEngine = new SpeechEngine();
