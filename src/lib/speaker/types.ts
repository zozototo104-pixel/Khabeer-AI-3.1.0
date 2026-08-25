export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export type SpeakerIdentitySource = 'VERIFIED' | 'CANDIDATE' | 'UNKNOWN';

export type SpeakerIdentificationStatus =
  | 'SUCCESS'
  | 'UNKNOWN'
  | 'AMBIGUOUS'
  | 'LOW_AUDIO_QUALITY'
  | 'INSUFFICIENT_AUDIO'
  | 'ERROR';

export interface SpeakerProfile {
  id: string;
  name: string;
  embeddings: number[][];
  centroidEmbedding: number[];
  sampleCount: number;
  confidence: number;
  isCandidate: boolean;
  status: 'VALID' | 'CANDIDATE';
  createdAt: number;
  updatedAt: number;
  lastSeenAt?: number;
  embeddingModel?: string;
}

export interface SpeakerComparison {
  speakerId: string;
  name: string;
  similarity: number;
  finalSimilarity: number;
  eligible?: boolean;
  rejectionReason?: string;
  model?: string;
  dim?: number;
}

export interface SpeakerDebugInfo {
  segmentId?: number;
  embeddingMagnitude: number;
  embeddingDimension: number;
  comparedProfilesCount: number;
  bestDistance: number;
  bestSpeakerId?: string;
  bestSpeakerName?: string;
  secondBestSpeakerId?: string;
  secondBestSpeakerName?: string;
  secondBestSimilarity: number;
  margin: number;
  source: 'DEEP_NEURAL' | 'ACOUSTIC_FALLBACK' | 'UNKNOWN';
  latencyMs: number;
  speakerComparisons?: SpeakerComparison[];
  previousSpeakerId?: string | null;
  clusterId?: string;
  decisionReason?: string;
  reason?: string;
}

export interface SpeakerIdentificationResult {
  speakerId: string | null;
  name: string;
  similarity: number;
  confidence: ConfidenceLevel;
  status: SpeakerIdentificationStatus;
  isNewCandidate: boolean;
  identitySource: SpeakerIdentitySource;
  debugInfo: SpeakerDebugInfo;
}

export interface SpeechSegment {
  id: number;
  startTime: number;
  endTime: number;
  durationMs: number;
  speakerId: string;
  speakerName: string;
  confidence: ConfidenceLevel;
  similarity: number;
  identitySource: SpeakerIdentitySource;
  pcmData: Float32Array;
  embedding: number[];
}

export interface SpeakerEmbeddingProvider {
  extractEmbedding(pcmData: Float32Array): Promise<number[]>;
  getName(): string;
  getDimension(): number;
  getModelId(): string;
}

export interface SpeakerDiarizerCallbacks {
  onSpeakerChanged?: (newSpeakerId: string, newSpeakerName: string, previousSpeakerId: string | null) => void;
  onSpeakerIdentified?: (result: SpeakerIdentificationResult, segment: SpeechSegment) => void;
  onSegmentComplete?: (segment: SpeechSegment) => void;
  onDebugLog?: (message: string, details?: { segment?: SpeechSegment; result?: SpeakerIdentificationResult }) => void;
}

export const SPEAKER_THRESHOLDS = {
  SAMPLE_RATE: 16000,
  // Used by the deterministic acoustic fallback. Neural models may return a
  // different dimension; the registry deliberately accepts any sane size.
  EMBEDDING_DIM: 128,
  MIN_AUDIO_DURATION_SEC: 0.65,
  PROBE_AUDIO_DURATION_SEC: 0.9,
  MAX_SEGMENT_DURATION_SEC: 30,
  // Conservative initial ERes2Net thresholds; recalibrate with representative
  // Arabic meeting audio before high-stakes identity use.
  SAME_SPEAKER_THRESHOLD: 0.72,
  HIGH_CONFIDENCE_THRESHOLD: 0.82,
  MEDIUM_CONFIDENCE_THRESHOLD: 0.76,
  CANDIDATE_MATCH_THRESHOLD: 0.78,
  MIN_DECISION_MARGIN: 0.055,
  MAX_ENROLLMENT_SAMPLES: 8,
} as const;
