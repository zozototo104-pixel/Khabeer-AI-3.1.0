import { and, eq } from 'drizzle-orm';
import { db } from '../../../src/db/index.ts';
import { expertFindings, meetingEvents, risks, violations } from '../../../src/db/schema.ts';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type ViolationStatus = 'SUSPECTED' | 'UNDER_REVIEW' | 'CONFIRMED' | 'DISMISSED' | 'REMEDIATED';

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};
const dateOrNull = (value: unknown) => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export function scoreRisk(probability: unknown, impact: unknown): { probability: number; impact: number; score: number; level: RiskLevel } {
  const p = Math.round(clamp(probability, 1, 5, 3));
  const i = Math.round(clamp(impact, 1, 5, 3));
  const score = p * i;
  const level: RiskLevel = score >= 20 ? 'CRITICAL' : score >= 12 ? 'HIGH' : score >= 5 ? 'MODERATE' : 'LOW';
  return { probability: p, impact: i, score, level };
}

export function validateViolationInput(input: any, requestedStatus: ViolationStatus = 'SUSPECTED') {
  const title = clean(input?.title, 240);
  if (!title) throw new Error('VIOLATION_TITLE_REQUIRED');
  const regulationRef = clean(input?.regulationRef, 600);
  const factualEvidence = clean(input?.factualEvidence || input?.evidence, 6000);
  const quotedProvision = clean(input?.quotedProvision, 4000);
  if (requestedStatus === 'CONFIRMED' && (!regulationRef || !factualEvidence || !quotedProvision)) {
    throw new Error('CONFIRMED_VIOLATION_REQUIRES_REFERENCE_EVIDENCE_AND_PROVISION');
  }
  return { title, regulationRef, factualEvidence, quotedProvision };
}

export class RiskViolationService {
  async recordRisk(input: any, orgId: number, sessionId: number) {
    const title = clean(input?.title, 240);
    if (!title) throw new Error('RISK_TITLE_REQUIRED');
    const existing = await db.select({ id: risks.id }).from(risks).where(and(
      eq(risks.orgId, orgId), eq(risks.meetingId, sessionId), eq(risks.title, title),
    )).limit(1);
    if (existing.length) return { type: 'RISK' as const, id: existing[0].id, duplicate: true };
    const scored = scoreRisk(input?.probability, input?.impact);
    const inserted = await db.insert(risks).values({
      orgId, meetingId: sessionId, title,
      description: clean(input?.description, 6000) || null,
      severity: scored.level === 'MODERATE' ? 'MEDIUM' : scored.level,
      category: clean(input?.category, 80) || 'OTHER',
      riskCode: clean(input?.riskCode, 80) || `R-${sessionId}-${Date.now().toString(36).toUpperCase()}`,
      probability: scored.probability, impact: scored.impact,
      inherentScore: scored.score,
      residualScore: input?.residualScore == null ? null : clamp(input.residualScore, 1, 25, scored.score),
      riskLevel: scored.level,
      evidence: clean(input?.evidence, 4000) || null,
      regulationRef: clean(input?.regulationRef, 600) || null,
      controls: Array.isArray(input?.controls) ? input.controls.slice(0, 30).map((v: unknown) => clean(v, 500)).filter(Boolean) : [],
      owner: clean(input?.owner || input?.assignee, 240) || null,
      dueDate: dateOrNull(input?.dueDate),
      detectedByExpertId: clean(input?.expertId, 100) || null,
      status: 'OPEN',
    }).returning({ id: risks.id });
    await db.insert(meetingEvents).values({ orgId, sessionId, eventType: 'RISK', title, payload: { recordId: inserted[0]?.id, ...scored, category: input?.category || 'OTHER' }, speakerId: clean(input?.speakerId, 160) || null, speakerName: clean(input?.speakerName, 240) || null });
    return { type: 'RISK' as const, id: inserted[0]?.id, duplicate: false, assessment: scored };
  }

  async recordViolation(input: any, orgId: number, sessionId: number) {
    const valid = validateViolationInput(input, 'SUSPECTED');
    const existing = await db.select({ id: violations.id }).from(violations).where(and(
      eq(violations.orgId, orgId), eq(violations.sessionId, sessionId), eq(violations.title, valid.title),
    )).limit(1);
    if (existing.length) return { type: 'VIOLATION' as const, id: existing[0].id, duplicate: true, status: 'SUSPECTED' as const };
    const violationCode = clean(input?.violationCode, 80) || `V-${sessionId}-${Date.now().toString(36).toUpperCase()}`;
    const inserted = await db.insert(violations).values({
      orgId, sessionId, violationCode, title: valid.title,
      description: clean(input?.description, 6000) || null,
      domain: clean(input?.domain || input?.category, 80) || 'COMPLIANCE',
      regulationTitle: clean(input?.regulationTitle, 500) || null,
      regulationRef: valid.regulationRef || null,
      articleNumber: clean(input?.articleNumber, 100) || null,
      quotedProvision: valid.quotedProvision || null,
      factualEvidence: valid.factualEvidence || null,
      professionalAnalysis: clean(input?.professionalAnalysis, 6000) || null,
      severity: clean(input?.severity, 20) || 'MEDIUM',
      confidence: clamp(input?.confidence, 0, 1, 0.5),
      status: 'SUSPECTED',
      responsibleParty: clean(input?.responsibleParty, 240) || null,
      correctiveAction: clean(input?.correctiveAction, 4000) || null,
      owner: clean(input?.owner || input?.assignee, 240) || null,
      dueDate: dateOrNull(input?.dueDate),
      detectedByExpertId: clean(input?.expertId, 100) || null,
      speakerId: clean(input?.speakerId, 160) || null,
      speakerName: clean(input?.speakerName, 240) || null,
    }).returning({ id: violations.id });
    await db.insert(meetingEvents).values({ orgId, sessionId, eventType: 'VIOLATION_SUSPECTED', title: valid.title, payload: { recordId: inserted[0]?.id, violationCode, status: 'SUSPECTED', regulationRef: valid.regulationRef || null, confidence: clamp(input?.confidence, 0, 1, 0.5) }, speakerId: clean(input?.speakerId, 160) || null, speakerName: clean(input?.speakerName, 240) || null });
    return { type: 'VIOLATION' as const, id: inserted[0]?.id, duplicate: false, status: 'SUSPECTED' as const };
  }

  async recordFinding(input: any, orgId: number, sessionId: number) {
    const title = clean(input?.title, 240);
    if (!title) throw new Error('FINDING_TITLE_REQUIRED');
    const inserted = await db.insert(expertFindings).values({
      orgId, sessionId, findingType: clean(input?.findingType, 80) || 'OBSERVATION', title,
      description: clean(input?.description, 6000) || null,
      evidence: clean(input?.evidence, 4000) || null,
      severity: clean(input?.severity, 20) || 'INFO', confidence: clamp(input?.confidence, 0, 1, 0.5),
      status: 'OPEN', expertId: clean(input?.expertId, 100) || null,
      speakerId: clean(input?.speakerId, 160) || null, speakerName: clean(input?.speakerName, 240) || null,
      metadata: typeof input?.metadata === 'object' && input.metadata ? input.metadata : {},
    }).returning({ id: expertFindings.id });
    await db.insert(meetingEvents).values({ orgId, sessionId, eventType: 'EXPERT_FINDING', title, payload: { recordId: inserted[0]?.id, findingType: input?.findingType || 'OBSERVATION', expertId: input?.expertId || null } });
    return { type: 'FINDING' as const, id: inserted[0]?.id, duplicate: false };
  }
}

export const riskViolationService = new RiskViolationService();
