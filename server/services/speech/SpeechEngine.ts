import { SpeakerRegistry } from '../../../src/lib/speaker/SpeakerRegistry.ts';
import { SpeakerDiarizer } from '../../../src/lib/speaker/SpeakerDiarizer.ts';
import { buildConsensusEmbeddingResult, selectSpeakerWindows } from '../../../src/lib/speaker/SpeakerWindowing.ts';
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
import { sortformerDiarizationService } from '../speaker/SortformerDiarizationService.ts';

// sherpa-onnx's speaker-identification examples use manager.search({ threshold: 0.5 })
// and recommend addMulti() for multi-utterance enrollment. Keep the global
// application thresholds unchanged, but use this official floor only as a
// corroboration gate across multiple live segments for already-registered speakers.
const SHERPA_OFFICIAL_SEARCH_FLOOR = 0.50;

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

  async extractEmbedding(pcmData: Float32Array, options: { label?: string; bypassVad?: boolean } = {}): Promise<number[]> {
    return this.service.getEmbedding(pcmData, options);
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

  private cosineSimilaritySafe(a: number[], b: number[]): number {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i];
      const bv = b[i];
      if (!Number.isFinite(av) || !Number.isFinite(bv)) return 0;
      dot += av * bv;
      normA += av * av;
      normB += bv * bv;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 1e-12 ? dot / denom : 0;
  }

  private concatenatePcm(chunks: Float32Array[]): Float32Array {
    const total = chunks.reduce((sum, chunk) => sum + (chunk?.length || 0), 0);
    const output = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      if (!chunk?.length) continue;
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }
  private liveEvidence: Map<string, { speakerId: string; hits: number; scoreSum: number; lastAt: number }> = new Map();
  private nearRegisteredEvidence: Map<string, { speakerId: string; name: string; hits: number; scoreSum: number; lastAt: number }> = new Map();

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


  private corroborateNearRegisteredMatch(
    result: SpeakerIdentificationResult | null,
    sessionId: string,
  ): SpeakerIdentificationResult | null {
    if (!result || result.identitySource === 'VERIFIED') return result;
    const bestSpeakerId = result.debugInfo?.bestSpeakerId;
    const bestSpeakerName = result.debugInfo?.bestSpeakerName;
    const comparisons = Array.isArray(result.debugInfo?.speakerComparisons) ? result.debugInfo.speakerComparisons : [];
    const bestComparison = comparisons.find((comparison) => comparison.speakerId === bestSpeakerId && comparison.eligible !== false);
    const bestScore = bestComparison?.finalSimilarity ?? result.similarity ?? 0;
    if (!bestSpeakerId || !bestSpeakerName || bestScore < SHERPA_OFFICIAL_SEARCH_FLOOR) return null;

    const now = Date.now();
    const previous = this.nearRegisteredEvidence.get(sessionId);
    const same = previous && previous.speakerId === bestSpeakerId && now - previous.lastAt <= 12_000;
    const evidence = same
      ? { speakerId: bestSpeakerId, name: bestSpeakerName, hits: previous.hits + 1, scoreSum: previous.scoreSum + bestScore, lastAt: now }
      : { speakerId: bestSpeakerId, name: bestSpeakerName, hits: 1, scoreSum: bestScore, lastAt: now };
    this.nearRegisteredEvidence.set(sessionId, evidence);

    const average = evidence.scoreSum / evidence.hits;
    const margin = Number(result.debugInfo?.margin || 0);
    const competingProfiles = comparisons.filter((comparison) => comparison.speakerId !== bestSpeakerId && comparison.eligible !== false);
    const enoughMargin = competingProfiles.length <= 0 || margin >= SPEAKER_THRESHOLDS.MIN_DECISION_MARGIN;
    if (evidence.hits < 2 || average < SHERPA_OFFICIAL_SEARCH_FLOOR || !enoughMargin) {
      console.warn(`[SpeechEngine][${sessionId}] NEAR_REGISTERED_PENDING speaker=${bestSpeakerName} score=${bestScore.toFixed(4)} hits=${evidence.hits} avg=${average.toFixed(4)} margin=${margin.toFixed(4)}`);
      return null;
    }

    console.warn(`[SpeechEngine][${sessionId}] NEAR_REGISTERED_CORROBORATED speaker=${bestSpeakerName} score=${bestScore.toFixed(4)} hits=${evidence.hits} avg=${average.toFixed(4)} margin=${margin.toFixed(4)}`);
    return {
      ...result,
      speakerId: bestSpeakerId,
      name: bestSpeakerName,
      similarity: average,
      confidence: average >= SPEAKER_THRESHOLDS.MEDIUM_CONFIDENCE_THRESHOLD ? 'MEDIUM' : 'LOW',
      status: 'SUCCESS',
      isNewCandidate: false,
      identitySource: 'VERIFIED',
      debugInfo: {
        ...result.debugInfo,
        decisionReason: 'CORROBORATED_REGISTERED_MATCH',
        clusterId: bestSpeakerId,
      },
    };
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
    const embedding = await this.provider.extractEmbedding(pcmData, { label: `detect:${sessionId}` });
    const registry = this.getSessionRegistry(sessionId);
    const result = registry.identifySpeaker(embedding, {
      source: this.provider.getName().includes('Neural') ? 'DEEP_NEURAL' : 'ACOUSTIC_FALLBACK',
      embeddingModel: this.provider.getModelId(),
    });
    const modelId = this.provider.getModelId();
    const candidates = registry.getAllSpeakers()
      .filter((profile) => !profile.isCandidate && profile.embeddingModel === modelId)
      .map((profile) => ({
        id: profile.id,
        name: profile.name,
        samples: Array.isArray(profile.embeddings) ? profile.embeddings.length : 0,
        similarity: Math.max(
          profile.confidence || 0,
          ...(Array.isArray(profile.embeddings) ? profile.embeddings.map((sample) => this.cosineSimilaritySafe(embedding, sample)) : []),
        ),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
    const corroborated = this.corroborateNearRegisteredMatch(result, sessionId) || result;
    const resultSimilarity = Number.isFinite(corroborated.similarity) ? corroborated.similarity.toFixed(4) : '0.0000';
    console.log(`[SpeechEngine][${sessionId}] IDENT_DIAG result=${corroborated.name || 'UNKNOWN'} similarity=${resultSimilarity} confidence=${corroborated.confidence} status=${corroborated.status} identitySource=${corroborated.identitySource} candidates=${JSON.stringify(candidates)}`);
    return corroborated;
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
        
        const corroboratedProbe = this.corroborateNearRegisteredMatch(result, sessionId) || result;
        // Log the probe result for diagnostic purposes
        diarizer['callbacks']?.onDebugLog?.(`[Speaker:Probe] bestName=${corroboratedProbe?.name} sim=${corroboratedProbe?.similarity?.toFixed(3)} source=${corroboratedProbe?.identitySource} prevId=${diarizer['currentSpeakerId']}`);
        
        const stableLive = corroboratedProbe?.identitySource === 'VERIFIED'
          ? corroboratedProbe
          : this.stabilizeLiveProbe(corroboratedProbe, sessionId);
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
        let segment: SpeechSegment | null = null;
        try {
          // The accumulated PCM for this speech turn lives in the diarizer;
          // Sortformer must receive that complete turn, not an undefined local.
          const turnPcm = diarizer.getBufferedPcm();
          const regions = await sortformerDiarizationService.diarize(turnPcm);
          const registry = this.getSessionRegistry(sessionId);
          const registeredProfiles = registry.getAllSpeakers().filter((profile) => !profile.isCandidate && profile.status === 'VALID' && profile.embeddingModel === this.provider.getModelId());
          const nearRegisteredSuppression = registeredProfiles.length > 0 ? SHERPA_OFFICIAL_SEARCH_FLOOR : undefined;
          const tracks = new Map<string, Float32Array[]>();
          for (const region of regions) {
            if (!region.pcm?.length) continue;
            if (!tracks.has(region.speaker)) tracks.set(region.speaker, []);
            tracks.get(region.speaker)!.push(region.pcm);
          }

          let best: {
            speaker: string;
            pcm: Float32Array;
            embedding: number[];
            result: ReturnType<SpeakerRegistry['identifySpeaker']>;
            windows: number;
            acceptedEmbeddings: number;
            rejectedEmbeddings: number;
          } | null = null;
          const trackDiagnostics: Array<Record<string, unknown>> = [];

          for (const [speaker, parts] of tracks.entries()) {
            const trackPcm = this.concatenatePcm(parts);
            const windows = selectSpeakerWindows(trackPcm, 5);
            const candidateWindows = windows.length ? windows : [trackPcm];
            const embeddings: number[][] = [];
            for (let windowIndex = 0; windowIndex < candidateWindows.length; windowIndex++) {
              const window = candidateWindows[windowIndex];
              if (window.length < SPEAKER_THRESHOLDS.SAMPLE_RATE) continue;
              try {
                embeddings.push(await this.provider.extractEmbedding(window, { label: `sortformer-track:${sessionId}:${speaker}:w${windowIndex}` }));
              } catch (error) {
                console.warn(`[Sortformer] embedding failed session=${sessionId} speaker=${speaker} window=${windowIndex}:`, error);
              }
            }
            const consensus = buildConsensusEmbeddingResult(embeddings);
            if (!Array.isArray(consensus.consensus) || consensus.consensus.length !== 512) {
              trackDiagnostics.push({ speaker, samples: trackPcm.length, windows: candidateWindows.length, accepted: 0, rejected: embeddings.length, identity: 'NO_VALID_EMBEDDING' });
              continue;
            }
            const rawResult = registry.identifySpeaker(consensus.consensus, {
              source: 'DEEP_NEURAL',
              embeddingModel: this.provider.getModelId(),
              createCandidate: true,
              suppressCandidateIfNearRegistered: nearRegisteredSuppression,
            });
            const result = this.corroborateNearRegisteredMatch(rawResult, sessionId) || rawResult;
            trackDiagnostics.push({
              speaker,
              samples: trackPcm.length,
              seconds: Number((trackPcm.length / SPEAKER_THRESHOLDS.SAMPLE_RATE).toFixed(2)),
              windows: candidateWindows.length,
              accepted: consensus.acceptedEmbeddings.length,
              rejected: consensus.rejectedCount,
              identity: result.name,
              source: result.identitySource,
              similarity: Number(result.similarity.toFixed(4)),
            });
            if (!best || result.similarity > best.result.similarity) {
              best = {
                speaker,
                pcm: trackPcm,
                embedding: consensus.consensus,
                result,
                windows: candidateWindows.length,
                acceptedEmbeddings: consensus.acceptedEmbeddings.length,
                rejectedEmbeddings: consensus.rejectedCount,
              };
            }
          }

          console.log(`[Sortformer] session=${sessionId} speakers=${tracks.size} regions=${regions.length} tracks=${JSON.stringify(trackDiagnostics)}`);
          if (best && best.result.identitySource !== 'UNKNOWN') {
            segment = {
              id: Date.now(),
              startTime: Date.now() - Math.round((best.pcm.length / SPEAKER_THRESHOLDS.SAMPLE_RATE) * 1000),
              endTime: Date.now(),
              durationMs: Math.round((best.pcm.length / SPEAKER_THRESHOLDS.SAMPLE_RATE) * 1000),
              speakerId: best.result.speakerId || 'speaker_unknown',
              speakerName: best.result.name,
              confidence: best.result.confidence,
              similarity: best.result.similarity,
              identitySource: best.result.identitySource,
              pcmData: best.pcm,
              embedding: best.embedding,
            };
            console.log(`[Sortformer] session=${sessionId} selected=${best.speaker} identity=${best.result.name} source=${best.result.identitySource} similarity=${best.result.similarity.toFixed(3)} windows=${best.windows} accepted=${best.acceptedEmbeddings} rejected=${best.rejectedEmbeddings}`);
          } else if (best) {
            console.warn(`[Sortformer] session=${sessionId} best track remained UNKNOWN similarity=${best.result.similarity.toFixed(3)}; falling back to full-turn legacy finalization.`);
          }
        } catch (error) {
          console.warn('[Sortformer] Native diarization failed; falling back to legacy diarizer:', error);
        }
        if (!segment) segment = await diarizer.finalizeSegment();
        if (segment) {
          const registry = this.getSessionRegistry(sessionId);
          const finalCheck = registry.identifySpeaker(segment.embedding, {
            segmentId: segment.id,
            source: this.provider.getName().includes('Neural') ? 'DEEP_NEURAL' : 'ACOUSTIC_FALLBACK',
            embeddingModel: this.provider.getModelId(),
            createCandidate: false,
          });
          const corroborated = this.corroborateNearRegisteredMatch(finalCheck, sessionId) || (finalCheck.identitySource === 'VERIFIED' ? finalCheck : null);
          if (corroborated) {
            segment = {
              ...segment,
              speakerId: corroborated.speakerId || 'speaker_unknown',
              speakerName: corroborated.name,
              confidence: corroborated.confidence,
              similarity: corroborated.similarity,
              identitySource: corroborated.identitySource,
            };
          }
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
              decisionReason: corroborated?.debugInfo?.decisionReason,
              bestSpeakerId: finalCheck.debugInfo?.bestSpeakerId,
              bestSpeakerName: finalCheck.debugInfo?.bestSpeakerName,
              bestSimilarity: finalCheck.similarity,
              margin: finalCheck.debugInfo?.margin,
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
      // Build a small voice gallery even from a single enrollment recording.
      // One long embedding is fragile across microphone distance, room noise
      // and speaking style. Reuse the same quality-window selector as live
      // diarization so enrollment and recognition see acoustically comparable
      // 2-second windows from the exact same neural model.
      const windows = selectSpeakerWindows(initialPcmOrEmbedding, 3);
      // Run enrollment sequentially. On small Render CPU instances, launching
      // three ONNX requests concurrently queues them behind one worker and can
      // make later requests hit the worker timeout even though inference is healthy.
      const enrollmentEmbeddings: number[][] = [];
      let windowIndex = 0;
      for (const window of windows.length ? windows : [initialPcmOrEmbedding]) {
        try {
          enrollmentEmbeddings.push(await this.provider.extractEmbedding(window, { label: `enroll:${sessionId}:${name}:${windowIndex}` }));
        } catch (error) {
          console.warn(`[SpeechEngine][${sessionId}] Enrollment window ${windowIndex} rejected:`, error);
        }
        windowIndex += 1;
      }
      if (!enrollmentEmbeddings.length) {
        throw new Error('SPEAKER_ENROLLMENT_NO_VALID_EMBEDDING');
      }
      // Register a single robust centroid first, then retain only the
      // acoustically consistent gallery exemplars. Persisting every window can
      // pollute the centroid with noisy/misaligned enrollment fragments and
      // lower same-speaker scores later in the same room.
      const consensusResult = buildConsensusEmbeddingResult(enrollmentEmbeddings);
      const profile = registry.registerOrUpdateSpeaker(name, consensusResult.consensus, { embeddingModel: this.provider.getModelId() });
      for (const sampleEmbedding of consensusResult.acceptedEmbeddings) {
        registry.updateSpeaker(profile.id, sampleEmbedding, 'HIGH', true);
      }
      console.log(`[SpeechEngine][${sessionId}] Enrolled ${name} windows=${enrollmentEmbeddings.length} accepted=${consensusResult.acceptedEmbeddings.length} rejected=${consensusResult.rejectedCount} consistency=${JSON.stringify(consensusResult.consistencyScores.slice(0, 8))}`);
      return profile;
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
    this.nearRegisteredEvidence.delete(sessionId);
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
