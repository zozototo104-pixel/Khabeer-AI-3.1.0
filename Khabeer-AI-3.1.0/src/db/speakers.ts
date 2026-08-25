import { and, eq, notInArray } from 'drizzle-orm';
import { db } from './index.ts';
import { speakerProfiles } from './schema.ts';
import type { SpeakerProfile } from '../lib/speaker/types.ts';

function asTimestamp(value?: number): Date | null {
  return value && Number.isFinite(value) ? new Date(value) : null;
}

// V6.1 SURGICAL FIX 2A — READ-SIDE PROFILE INTEGRITY
// Active neural model id (must match SpeakerRecognitionService.OFFICIAL_MODEL_ID).
// Profiles stored with a different model (e.g. 'legacy-unknown' or 'eres2net-v2')
// are kept in DB but marked as MATCH_INELIGIBLE so they never participate
// in live identification. This prevents MODEL_MISMATCH from silently
// degrading matching quality and prevents 128-D legacy vectors from
// competing with 512-D ERes2Net vectors.
const ACTIVE_NEURAL_MODEL_ID = 'sherpa-onnx/3dspeaker-eres2net-base-16k@1a331345f048';
const REQUIRED_EMBEDDING_DIM = 512;

export interface PersistentSpeakerProfile extends SpeakerProfile {
  matchEligible: boolean;
  ineligibleReason?: string;
}

export function classifyMatchEligibility(profile: SpeakerProfile): {
  matchEligible: boolean;
  ineligibleReason?: string;
} {
  // CANDIDATE / unknown_* profiles are never match-eligible
  if (profile.isCandidate || profile.status === 'CANDIDATE') {
    return { matchEligible: false, ineligibleReason: 'CANDIDATE' };
  }
  if (String(profile.id).startsWith('candidate_')) {
    return { matchEligible: false, ineligibleReason: 'CANDIDATE' };
  }
  if (String(profile.id).startsWith('unknown_')) {
    return { matchEligible: false, ineligibleReason: 'CANDIDATE' };
  }
  // Dimension check — 128-D legacy vectors are NOT eligible against 512-D probes
  if (!Array.isArray(profile.centroidEmbedding) || profile.centroidEmbedding.length !== REQUIRED_EMBEDDING_DIM) {
    return { matchEligible: false, ineligibleReason: 'DIMENSION_MISMATCH' };
  }
  // Model contract check — legacy-unknown or incompatible model IDs are not eligible
  if (profile.embeddingModel && profile.embeddingModel !== ACTIVE_NEURAL_MODEL_ID) {
    return { matchEligible: false, ineligibleReason: 'MODEL_MISMATCH' };
  }
  // Malformed embeddings
  if (!Array.isArray(profile.embeddings) || profile.embeddings.length === 0) {
    return { matchEligible: false, ineligibleReason: 'CORRUPTED' };
  }
  for (const emb of profile.embeddings) {
    if (!Array.isArray(emb) || emb.length !== REQUIRED_EMBEDDING_DIM) {
      return { matchEligible: false, ineligibleReason: 'DIMENSION_MISMATCH' };
    }
  }
  return { matchEligible: true };
}

export async function getPersistentSpeakerProfiles(ownerId: string): Promise<PersistentSpeakerProfile[]> {
  if (!ownerId) return [];
  const rows = await db.select().from(speakerProfiles).where(eq(speakerProfiles.ownerId, ownerId));
  // V6.1 SURGICAL FIX 2A — classify each profile as match-eligible or not.
  // ALL stored profiles are returned (no deletion), but each carries a
  // `matchEligible` flag + `ineligibleReason` so callers can decide
  // whether to load them into the active matching registry.
  return rows.map((row) => {
    const base: SpeakerProfile = {
      id: row.speakerId,
      name: row.name,
      embeddings: Array.isArray(row.embeddings) ? row.embeddings as number[][] : [],
      centroidEmbedding: Array.isArray(row.centroidEmbedding) ? row.centroidEmbedding as number[] : [],
      sampleCount: row.sampleCount,
      confidence: row.confidence,
      isCandidate: row.isCandidate,
      status: row.status as SpeakerProfile['status'],
      createdAt: row.createdAt?.getTime() || Date.now(),
      updatedAt: row.updatedAt?.getTime() || Date.now(),
      lastSeenAt: row.lastSeenAt?.getTime(),
      embeddingModel: row.embeddingModel,
    };
    const classification = classifyMatchEligibility(base);
    return { ...base, ...classification };
  });
}

export async function replacePersistentSpeakerProfiles(ownerId: string, profiles: SpeakerProfile[]): Promise<void> {
  if (!ownerId) return;
  // V6.1.1 FIX 1 — NON-DESTRUCTIVE PERSISTENCE
  // Previously this function did a full-state replacement: after upserting
  // the supplied profiles, it DELETED every other profile belonging to the
  // owner that was NOT in the supplied list. This was destructive because:
  //
  //   - Profiles excluded from runtime matching (LEGACY 128-D, MODEL_MISMATCH,
  //     CANDIDATE, corrupted metadata) would be silently deleted from
  //     PostgreSQL on the next sync, even though the user never asked to
  //     delete them.
  //   - Opening a meeting with a filtered runtime registry would delete
  //     stored-but-ineligible profiles as a side effect.
  //
  // Now this function is NON-DESTRUCTIVE: it only INSERTs/UPDATEs the
  // supplied profiles. Profiles not supplied are left untouched in DB.
  // Explicit deletion is handled by `deletePersistentSpeakerProfile()`.
  //
  // The CANDIDATE/unknown_* filter at the top is KEPT (prevents writing
  // phantom profiles TO the DB), but the DELETE block at the bottom is
  // REMOVED (prevents deleting existing profiles FROM the DB).
  const cleanProfiles = profiles.filter((profile) =>
    profile?.id
    && profile?.name?.trim()
    && Array.isArray(profile.centroidEmbedding)
    && profile.centroidEmbedding.length >= 64
    && !profile.isCandidate
    && profile.status !== 'CANDIDATE'
    && !String(profile.id).startsWith('candidate_')
    && !String(profile.id).startsWith('unknown_'),
  );

  await db.transaction(async (tx) => {
    for (const profile of cleanProfiles) {
      await tx.insert(speakerProfiles).values({
        ownerId,
        speakerId: profile.id,
        name: profile.name.trim(),
        embeddings: profile.embeddings,
        centroidEmbedding: profile.centroidEmbedding,
        sampleCount: Math.max(1, profile.sampleCount || 1),
        confidence: Math.max(0, Math.min(1, profile.confidence || 0)),
        isCandidate: Boolean(profile.isCandidate),
        status: profile.status || (profile.isCandidate ? 'CANDIDATE' : 'VALID'),
        embeddingModel: profile.embeddingModel || 'legacy-unknown',
        createdAt: asTimestamp(profile.createdAt) || new Date(),
        updatedAt: new Date(),
        lastSeenAt: asTimestamp(profile.lastSeenAt),
      }).onConflictDoUpdate({
        target: [speakerProfiles.ownerId, speakerProfiles.speakerId],
        set: {
          name: profile.name.trim(),
          embeddings: profile.embeddings,
          centroidEmbedding: profile.centroidEmbedding,
          sampleCount: Math.max(1, profile.sampleCount || 1),
          confidence: Math.max(0, Math.min(1, profile.confidence || 0)),
          isCandidate: Boolean(profile.isCandidate),
          status: profile.status || (profile.isCandidate ? 'CANDIDATE' : 'VALID'),
          embeddingModel: profile.embeddingModel || 'legacy-unknown',
          updatedAt: new Date(),
          lastSeenAt: asTimestamp(profile.lastSeenAt),
        },
      });
    }
    // V6.1.1 FIX 1 — NO DELETE BLOCK HERE.
    // Profiles not supplied in `profiles` are left untouched in DB.
    // Only `deletePersistentSpeakerProfile()` can remove a profile.
  });
}

// V6.1.1 FIX 1 — EXPLICIT SINGLE-PROFILE DELETION
// This is the ONLY function that can delete a speaker profile from
// PostgreSQL. It is called exclusively by the DELETE
// /api/speech/speakers/:id endpoint (user-initiated action).
export async function deletePersistentSpeakerProfile(ownerId: string, speakerId: string): Promise<boolean> {
  if (!ownerId || !speakerId) return false;
  const result = await db.delete(speakerProfiles).where(and(
    eq(speakerProfiles.ownerId, ownerId),
    eq(speakerProfiles.speakerId, speakerId),
  )).returning({ id: speakerProfiles.id });
  return Array.isArray(result) && result.length > 0;
}
