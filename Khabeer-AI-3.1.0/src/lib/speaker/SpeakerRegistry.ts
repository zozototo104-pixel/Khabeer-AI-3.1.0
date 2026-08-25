import { AudioFeatures } from './AudioFeatures.ts';
import { SPEAKER_THRESHOLDS } from './types.ts';
import type {
  ConfidenceLevel,
  SpeakerDebugInfo,
  SpeakerIdentificationResult,
  SpeakerProfile,
} from './types.ts';

interface IdentifyOptions {
  segmentId?: number;
  latencyMs?: number;
  source?: SpeakerDebugInfo['source'];
  createCandidate?: boolean;
  embeddingModel?: string;
  previousSpeakerId?: string | null;
}

interface RegisterOptions {
  id?: string;
  isCandidate?: boolean;
  embeddingModel?: string;
}

const UNKNOWN_NAME = 'متحدث غير معروف';
const AMBIGUOUS_NAME = 'تداخل أصوات';

function cloneProfile(profile: SpeakerProfile): SpeakerProfile {
  return {
    ...profile,
    embeddings: profile.embeddings.map((embedding) => [...embedding]),
    centroidEmbedding: [...profile.centroidEmbedding],
  };
}

function isValidEmbedding(embedding: unknown): embedding is number[] {
  return Array.isArray(embedding)
    && embedding.length >= 64
    && embedding.length <= 2048
    && embedding.every(Number.isFinite);
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}


function robustProfileSimilarity(profile: SpeakerProfile, embedding: number[]): { centroid: number; strongest: number; corroborated: number; final: number } {
  const centroid = AudioFeatures.cosineSimilarity(embedding, profile.centroidEmbedding);
  const sampleScores = profile.embeddings
    .filter((sample) => sample.length === embedding.length)
    .map((sample) => AudioFeatures.cosineSimilarity(embedding, sample))
    .sort((a, b) => b - a);
  const strongest = sampleScores[0] ?? centroid;
  const corroborated = sampleScores.length >= 2
    ? (sampleScores[0] + sampleScores[1]) / 2
    : strongest;
  // WhoSpeaksLive-inspired gallery scoring: keep the centroid as the stable
  // anchor, while allowing independently enrolled samples (different rooms /
  // microphones) to contribute without letting one accidental maximum win.
  const galleryBlend = profile.embeddings.length >= 2
    ? (centroid * 0.62) + (corroborated * 0.38)
    : centroid;
  return { centroid, strongest, corroborated, final: Math.max(centroid, galleryBlend) };
}
function makeId(prefix: 'speaker' | 'unknown'): string {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export class SpeakerRegistry {
  private profiles = new Map<string, SpeakerProfile>();
  private orphanEmbeddings: number[][] = [];

  constructor(initialProfiles: SpeakerProfile[] = []) {
    this.importProfiles(initialProfiles);
  }

  public importProfiles(profiles: SpeakerProfile[] = []): void {
    this.profiles.clear();
    for (const raw of profiles) {
      if (!raw || !raw.id || !normalizeName(raw.name || '')) continue;

      const embeddings = (raw.embeddings || []).filter(isValidEmbedding).map((item) => [...item]);
      let centroid = isValidEmbedding(raw.centroidEmbedding) ? [...raw.centroidEmbedding] : [];
      if (!centroid.length && embeddings.length) centroid = AudioFeatures.computeCentroid(embeddings);
      if (!centroid.length) continue;

      const compatible = embeddings.every((embedding) => embedding.length === centroid.length);
      if (!compatible) continue;

      const isCandidate = Boolean(raw.isCandidate || raw.status === 'CANDIDATE' || raw.id.startsWith('candidate_') || raw.id.startsWith('unknown_'));
const normalizedName = normalizeName(raw.name);
const normalizedEmbeddings = embeddings.length ? embeddings : [centroid];
const embeddingModel = raw.embeddingModel;

// Merge only genuine duplicates:
// same normalized name + same model + same embedding dimension + not candidate.
if (!isCandidate) {
  const duplicate = [...this.profiles.values()].find((profile) =>
    !profile.isCandidate &&
    profile.name === normalizedName &&
    profile.centroidEmbedding.length === centroid.length &&
    (profile.embeddingModel || '') === (embeddingModel || '')
  );

  if (duplicate) {
    const mergedEmbeddings = [
      ...duplicate.embeddings,
      ...normalizedEmbeddings,
    ].slice(-SPEAKER_THRESHOLDS.MAX_ENROLLMENT_SAMPLES);

    duplicate.embeddings = mergedEmbeddings;
    duplicate.centroidEmbedding = AudioFeatures.computeCentroid(mergedEmbeddings);
    duplicate.sampleCount = mergedEmbeddings.length;
    duplicate.confidence = Math.max(
      duplicate.confidence,
      Math.max(0, Math.min(1, Number(raw.confidence) || 0.9))
    );
    duplicate.createdAt = Math.min(
      duplicate.createdAt,
      Number(raw.createdAt) || duplicate.createdAt
    );
    duplicate.updatedAt = Math.max(
      duplicate.updatedAt,
      Number(raw.updatedAt) || 0
    );

    if (raw.lastSeenAt) {
      duplicate.lastSeenAt = Math.max(
        duplicate.lastSeenAt || 0,
        Number(raw.lastSeenAt)
      );
    }

    if (!duplicate.embeddingModel && embeddingModel) {
      duplicate.embeddingModel = embeddingModel;
    }

    continue;
  }
}
      this.profiles.set(raw.id, {
        id: raw.id,
        name: normalizeName(raw.name),
        embeddings: embeddings.length ? embeddings : [centroid],
        centroidEmbedding: centroid,
        sampleCount: Math.max(1, raw.sampleCount || embeddings.length || 1),
        confidence: Math.max(0, Math.min(1, Number(raw.confidence) || (isCandidate ? 0.55 : 0.9))),
        isCandidate,
        status: isCandidate ? 'CANDIDATE' : 'VALID',
        createdAt: Number(raw.createdAt) || Date.now(),
        updatedAt: Number(raw.updatedAt) || Date.now(),
        lastSeenAt: raw.lastSeenAt ? Number(raw.lastSeenAt) : undefined,
        embeddingModel: raw.embeddingModel,
      });
    }
  }

  public registerSpeaker(name: string, embedding?: number[], options: RegisterOptions = {}): SpeakerProfile {
    const cleanName = normalizeName(name);
    if (!cleanName) throw new Error('SPEAKER_NAME_REQUIRED');
    if (!embedding || !isValidEmbedding(embedding)) throw new Error('VALID_SPEAKER_EMBEDDING_REQUIRED');

    const normalizedEmbedding = Array.from(AudioFeatures.l2Normalize(embedding));
    const isCandidate = Boolean(options.isCandidate);
    const now = Date.now();
    const profile: SpeakerProfile = {
      id: options.id || makeId(isCandidate ? 'unknown' : 'speaker'),
      name: cleanName,
      embeddings: [normalizedEmbedding],
      centroidEmbedding: normalizedEmbedding,
      sampleCount: 1,
      confidence: isCandidate ? 0.55 : 0.9,
      isCandidate,
      status: isCandidate ? 'CANDIDATE' : 'VALID',
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      embeddingModel: options.embeddingModel,
    };
    this.profiles.set(profile.id, profile);
    return profile;
  }

  /**
   * Explicit enrollment path. Repeated enrollment of the same named person
   * augments that person's voice gallery instead of creating duplicate
   * SpeakerProfiles. Profiles are merged only when embedding dimension and
   * model contract are compatible.
   */
  public registerOrUpdateSpeaker(name: string, embedding: number[], options: RegisterOptions = {}): SpeakerProfile {
    const cleanName = normalizeName(name);
    if (!cleanName) throw new Error('SPEAKER_NAME_REQUIRED');
    if (!isValidEmbedding(embedding)) throw new Error('VALID_SPEAKER_EMBEDDING_REQUIRED');

    if (!options.isCandidate) {
      const existing = [...this.profiles.values()].find((profile) => {
        if (profile.isCandidate || profile.name !== cleanName) return false;
        if (profile.centroidEmbedding.length !== embedding.length) return false;
        if (options.embeddingModel && profile.embeddingModel && options.embeddingModel !== profile.embeddingModel) return false;
        return true;
      });

      if (existing) {
        // This is an explicit user enrollment for an already-named person.
        // Treat the label as trusted evidence, while still enforcing the
        // model/dimension contract above.
        const updated = this.updateSpeaker(existing.id, embedding, 'HIGH', true);
        if (!updated) throw new Error('SPEAKER_SAMPLE_UPDATE_FAILED');
        if (!existing.embeddingModel && options.embeddingModel) existing.embeddingModel = options.embeddingModel;
        return existing;
      }
    }

    return this.registerSpeaker(cleanName, embedding, options);
  }

  public updateSpeaker(id: string, embedding: number[], confidence: ConfidenceLevel, force = false): boolean {
    const profile = this.profiles.get(id);
    if (!profile || !isValidEmbedding(embedding)) return false;
    if (profile.centroidEmbedding.length !== embedding.length) return false;

    const normalizedEmbedding = Array.from(AudioFeatures.l2Normalize(embedding));
    const similarity = AudioFeatures.cosineSimilarity(normalizedEmbedding, profile.centroidEmbedding);
    if (!force && similarity < SPEAKER_THRESHOLDS.SAME_SPEAKER_THRESHOLD) return false;

    profile.embeddings.push(normalizedEmbedding);
    if (profile.embeddings.length > SPEAKER_THRESHOLDS.MAX_ENROLLMENT_SAMPLES) profile.embeddings.shift();
    profile.centroidEmbedding = AudioFeatures.computeCentroid(profile.embeddings);
    profile.sampleCount += 1;
    profile.confidence = Math.min(0.99, profile.confidence + (confidence === 'HIGH' ? 0.025 : 0.01));
    profile.updatedAt = Date.now();
    profile.lastSeenAt = Date.now();
    return true;
  }

  public identifySpeaker(embedding: number[], options: IdentifyOptions = {}): SpeakerIdentificationResult {
    const source = options.source || 'UNKNOWN';
    const magnitude = Math.sqrt((embedding || []).reduce((sum, value) => sum + value * value, 0));
    
    const allComparisons = [...this.profiles.values()].filter(p => !p.isCandidate).map((profile) => {
      const isEligibleDim = profile.centroidEmbedding.length === embedding.length;
      const isEligibleModel = !options.embeddingModel || !profile.embeddingModel || options.embeddingModel === profile.embeddingModel;
      const isEligible = isEligibleDim && isEligibleModel;
      
      let rejectionReason = 'NONE';
      if (!isEligibleDim) rejectionReason = 'DIMENSION_MISMATCH';
      else if (!isEligibleModel) rejectionReason = 'MODEL_MISMATCH';

      const gallery = isEligibleDim
        ? robustProfileSimilarity(profile, embedding)
        : { centroid: 0, strongest: 0, corroborated: 0, final: 0 };
      const sampleBonus = isEligible ? Math.min(0.012, Math.log2(Math.max(1, profile.sampleCount)) * 0.003) : 0;
      
      return {
        speakerId: profile.id,
        name: profile.name,
        similarity: gallery.centroid,
        finalSimilarity: Math.min(1, gallery.final + sampleBonus),
        eligible: isEligible,
        rejectionReason,
        model: profile.embeddingModel || 'N/A',
        dim: profile.centroidEmbedding.length
      };
    });

    if (embedding && magnitude >= 0.5) {
      allComparisons.forEach(c => {
        console.log(`[SPEAKER_COMPARE] seg=${options.segmentId || 0} embeddingModel=${options.embeddingModel || 'N/A'} probeDim=${embedding.length} ` +
          `registeredSpeaker=${c.name}/${c.speakerId} model=${c.model} dim=${c.dim} ` +
          `similarity=${c.similarity.toFixed(4)} eligible=${c.eligible} rejectionReason=${c.rejectionReason}`);
      });
    }

    const comparisons = allComparisons.filter(c => c.eligible).sort((a, b) => b.finalSimilarity - a.finalSimilarity);

    const best = comparisons[0];
    const second = comparisons[1];
    const secondScore = second?.finalSimilarity || 0;
    const margin = best ? best.finalSimilarity - secondScore : 0;
    const debugInfo: SpeakerDebugInfo = {
      segmentId: options.segmentId,
      embeddingMagnitude: magnitude,
      embeddingDimension: embedding?.length || 0,
      comparedProfilesCount: comparisons.length,
      bestDistance: best ? 1 - best.finalSimilarity : 1,
      bestSpeakerId: best?.speakerId,
      bestSpeakerName: best?.name,
      secondBestSpeakerId: second?.speakerId,
      secondBestSpeakerName: second?.name,
      secondBestSimilarity: secondScore,
      margin,
      source,
      latencyMs: options.latencyMs || 0,
      speakerComparisons: allComparisons,
      previousSpeakerId: options.previousSpeakerId,
    };

    if (!isValidEmbedding(embedding) || magnitude < 0.5) {
      return this.unknownResult(debugInfo, 'INVALID_EMBEDDING');
    }

    // 1. Check Previous Speaker Continuity (Temporal Smoothing / Hysteresis)
    if (options.previousSpeakerId) {
      const prevProfile = this.profiles.get(options.previousSpeakerId);
      if (prevProfile && !prevProfile.isCandidate && prevProfile.status === 'VALID') {
        const prevComp = comparisons.find((c) => c.speakerId === options.previousSpeakerId);
        if (prevComp) {
          const hysteresisThreshold = SPEAKER_THRESHOLDS.SAME_SPEAKER_THRESHOLD - 0.04;
          // If the previous verified speaker is close and either is the best or best is a candidate
          const isBestOrCandidateLeading = !best || best.speakerId === options.previousSpeakerId || (this.profiles.get(best.speakerId)?.isCandidate && (best.finalSimilarity - prevComp.finalSimilarity < 0.05));
          if (prevComp.finalSimilarity >= hysteresisThreshold && isBestOrCandidateLeading) {
            prevProfile.lastSeenAt = Date.now();
            return {
              speakerId: prevProfile.id,
              name: prevProfile.name,
              similarity: prevComp.finalSimilarity,
              confidence: prevComp.finalSimilarity >= SPEAKER_THRESHOLDS.HIGH_CONFIDENCE_THRESHOLD ? 'HIGH' : 'MEDIUM',
              status: 'SUCCESS',
              isNewCandidate: false,
              identitySource: 'VERIFIED',
              debugInfo: { ...debugInfo, decisionReason: 'HYSTERESIS_MAINTAINED', clusterId: prevProfile.id },
            };
          }
        }
      }
    }

    if (best) {
      const profile = this.profiles.get(best.speakerId)!;
      let threshold: number = profile.isCandidate
        ? SPEAKER_THRESHOLDS.CANDIDATE_MATCH_THRESHOLD
        : SPEAKER_THRESHOLDS.SAME_SPEAKER_THRESHOLD;
      const acousticFallback = source === 'ACOUSTIC_FALLBACK';
      if (acousticFallback) {
        // A single explicitly named sample remains usable in degraded mode,
        // but requires a near-identical match until more enrollment samples
        // are collected. This avoids both a guaranteed "forgotten name" on
        // the next turn and a loose biometric claim.
        threshold = Math.max(threshold, profile.sampleCount >= 3 ? 0.92 : 0.97);
      }
      const isAmbiguous = Boolean(second)
        && best.finalSimilarity >= threshold
        && margin < SPEAKER_THRESHOLDS.MIN_DECISION_MARGIN;

      if (isAmbiguous) {
        return {
          speakerId: null,
          name: AMBIGUOUS_NAME,
          similarity: best.finalSimilarity,
          confidence: 'NONE',
          status: 'AMBIGUOUS',
          isNewCandidate: false,
          identitySource: 'UNKNOWN',
          debugInfo: { ...debugInfo, decisionReason: 'INSUFFICIENT_MARGIN', reason: 'INSUFFICIENT_MARGIN' },
        };
      }

      if (best.finalSimilarity >= threshold) {
        const calculatedConfidence: ConfidenceLevel = best.finalSimilarity >= Math.max(
          SPEAKER_THRESHOLDS.HIGH_CONFIDENCE_THRESHOLD,
          acousticFallback ? 0.95 : 0,
        )
          && margin >= SPEAKER_THRESHOLDS.MIN_DECISION_MARGIN * 1.5
          ? 'HIGH'
          : best.finalSimilarity >= SPEAKER_THRESHOLDS.MEDIUM_CONFIDENCE_THRESHOLD
            ? 'MEDIUM'
            : 'LOW';
        const confidence: ConfidenceLevel = acousticFallback && profile.sampleCount < 3
          ? 'LOW'
          : calculatedConfidence;
        profile.lastSeenAt = Date.now();
        return {
          speakerId: profile.id,
          name: profile.name,
          similarity: best.finalSimilarity,
          confidence,
          status: 'SUCCESS',
          isNewCandidate: profile.isCandidate,
          identitySource: profile.isCandidate ? 'CANDIDATE' : 'VERIFIED',
          debugInfo: { ...debugInfo, decisionReason: profile.isCandidate ? 'EXISTING_CANDIDATE_MATCH' : 'VERIFIED_MATCH', clusterId: profile.id },
        };
      }
    }

    if (options.createCandidate === false) return this.unknownResult(debugInfo, 'NO_VERIFIED_MATCH');

    // 2. Reuse Existing Candidate Cluster if similarity is reasonable
    const existingCandidates = [...this.profiles.values()].filter((p) => p.isCandidate && p.centroidEmbedding.length === embedding.length && (!options.embeddingModel || !p.embeddingModel || options.embeddingModel === p.embeddingModel));
    if (existingCandidates.length > 0) {
      const candidateComparisons = existingCandidates
        .map((profile) => {
          const gallery = robustProfileSimilarity(profile, embedding);
          return {
            speakerId: profile.id,
            name: profile.name,
            similarity: gallery.centroid,
            finalSimilarity: gallery.final,
          };
        })
        .sort((a, b) => b.finalSimilarity - a.finalSimilarity);
      const bestCandidateComp = candidateComparisons[0];
      if (bestCandidateComp && bestCandidateComp.finalSimilarity >= SPEAKER_THRESHOLDS.CANDIDATE_MATCH_THRESHOLD - 0.05) {
        const candidateProfile = this.profiles.get(bestCandidateComp.speakerId)!;
        this.updateSpeaker(candidateProfile.id, embedding, 'LOW', true);
        return {
          speakerId: candidateProfile.id,
          name: candidateProfile.name,
          similarity: bestCandidateComp.finalSimilarity,
          confidence: 'LOW',
          status: 'UNKNOWN',
          isNewCandidate: false,
          identitySource: 'CANDIDATE',
          debugInfo: { ...debugInfo, decisionReason: 'CANDIDATE_CLUSTER_REUSED', clusterId: candidateProfile.id },
        };
      }
    }

    // 3. Bound candidate pool creation (max 3 per session to prevent explosion)
    if (existingCandidates.length >= 3) {
      return this.unknownResult(debugInfo, 'CANDIDATE_POOL_FULL');
    }

    // 4. Require multiple consistent segments to create a new candidate
    const matchingOrphan = this.orphanEmbeddings.find((orphan) => 
      AudioFeatures.cosineSimilarity(embedding, orphan) >= SPEAKER_THRESHOLDS.CANDIDATE_MATCH_THRESHOLD - 0.05
    );

    if (!matchingOrphan) {
      this.orphanEmbeddings.push(embedding);
      if (this.orphanEmbeddings.length > 20) this.orphanEmbeddings.shift(); // Keep bounded
      return this.unknownResult(debugInfo, 'ORPHAN_SEGMENT_PENDING');
    }

    const candidate = this.registerSpeaker(
      `متحدث جديد ${existingCandidates.length + 1}`,
      matchingOrphan,
      { isCandidate: true, embeddingModel: options.embeddingModel },
    );
    this.updateSpeaker(candidate.id, embedding, 'LOW', true);
    
    // Clear orphans to avoid duplicate candidate creation from the same stream
    this.orphanEmbeddings = [];

    return {
      speakerId: candidate.id,
      name: candidate.name,
      similarity: best?.finalSimilarity || 0,
      confidence: 'LOW',
      status: 'UNKNOWN',
      isNewCandidate: true,
      identitySource: 'CANDIDATE',
      debugInfo: { ...debugInfo, decisionReason: 'NEW_CANDIDATE_CREATED', clusterId: candidate.id, reason: 'NEW_CANDIDATE_CREATED' },
    };
  }

  public promoteCandidate(candidateId: string, name: string): SpeakerProfile | null {
    const profile = this.profiles.get(candidateId);
    const cleanName = normalizeName(name);
    if (!profile || !cleanName) return null;
    if (!profile.isCandidate) return profile.name === cleanName ? profile : null;
    profile.name = cleanName;
    profile.isCandidate = false;
    profile.status = 'VALID';
    profile.confidence = Math.max(profile.confidence, 0.85);
    profile.updatedAt = Date.now();
    return profile;
  }

  public deleteSpeaker(id: string): boolean {
    return this.profiles.delete(id);
  }

  public getAllSpeakers(): SpeakerProfile[] {
    return [...this.profiles.values()].map(cloneProfile);
  }

  /**
   * P0-7 FIX: alias for deleteSpeaker used by the new
   * DELETE /api/speech/speakers/:id endpoint. The original deleteSpeaker()
   * already did the right thing — this alias just gives the HTTP layer a
   * clearly-named entry point so callers don't have to know about the
   * legacy name. Returns true if a profile was actually removed.
   */
  public removeProfile(speakerId: string): boolean {
    if (!speakerId || typeof speakerId !== 'string') return false;
    return this.deleteSpeaker(speakerId);
  }

  private unknownResult(debugInfo: SpeakerDebugInfo, reason: string): SpeakerIdentificationResult {
    return {
      speakerId: null,
      name: UNKNOWN_NAME,
      similarity: debugInfo.speakerComparisons?.[0]?.finalSimilarity || 0,
      confidence: 'NONE',
      status: 'UNKNOWN',
      isNewCandidate: false,
      identitySource: 'UNKNOWN',
      debugInfo: { ...debugInfo, reason },
    };
  }
}
