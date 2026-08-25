import assert from 'node:assert/strict';
import test from 'node:test';
import { EXPERT_CATALOG, buildExpertPanelPrompt, recommendExpertProfiles, validateExpertPanel } from '../server/services/expert/ExpertCatalog.ts';
import { scoreRisk, validateViolationInput } from '../server/services/risk/RiskViolationService.ts';
import { issueConsultationToken, pcm24kBase64ToTwilioMuLaw8k, twilioMuLaw8kToPcm16kBase64, verifyConsultationToken } from '../server/services/integrations/ConsultationChannelService.ts';

test('expert catalog is broad, unique and panel is capped at four members', () => {
  assert.ok(EXPERT_CATALOG.length >= 25);
  assert.equal(new Set(EXPERT_CATALOG.map((profile) => profile.id)).size, EXPERT_CATALOG.length);
  const requested = EXPERT_CATALOG.slice(0, 8).map((profile) => profile.id);
  const panel = validateExpertPanel(requested, requested[5]);
  assert.equal(panel.selectedIds.length, 4);
  assert.equal(panel.leadId, requested[5]);
  assert.ok(panel.selectedIds.includes(requested[5]));
  assert.match(buildExpertPanelPrompt(panel.selectedIds, panel.leadId), /لوحة الخبراء متعددة التخصصات/);
});

test('domain recommender routes engineering and AI context to relevant experts', () => {
  const recommendations = recommendExpertProfiles('نحتاج مراجعة معمارية لنظام ذكاء اصطناعي وأمن سيبراني وشبكات');
  const ids = recommendations.map((profile) => profile.id);
  assert.ok(ids.some((id) => ['ai_data_expert', 'software_architect', 'cybersecurity_expert', 'computer_networks'].includes(id)));
});

test('risk scoring uses deterministic 5x5 levels and clamps invalid values', () => {
  assert.deepEqual(scoreRisk(5, 5), { probability: 5, impact: 5, score: 25, level: 'CRITICAL' });
  assert.equal(scoreRisk(3, 4).level, 'HIGH');
  assert.equal(scoreRisk(1, 1).level, 'LOW');
  assert.equal(scoreRisk(99, -3).score, 5);
});

test('confirmed violation requires reference, quoted provision and factual evidence', () => {
  assert.throws(() => validateViolationInput({ title: 'مخالفة محتملة' }, 'CONFIRMED'), /REQUIRES_REFERENCE_EVIDENCE_AND_PROVISION/);
  const valid = validateViolationInput({ title: 'مخالفة محتملة', regulationRef: 'اللائحة/مادة 4', quotedProvision: 'النص المختصر', factualEvidence: 'سجل المعاملة رقم 7' }, 'CONFIRMED');
  assert.equal(valid.regulationRef, 'اللائحة/مادة 4');
});

test('external call tokens are signed and audio codecs return expected frame sizes', () => {
  const secret = 'test-secret-is-more-than-thirty-two-characters-long';
  const token = issueConsultationToken({ callId: 1, orgId: 2, sessionId: 3, ownerUid: 'owner', expertIds: ['governance_advisor'], leadExpertId: 'governance_advisor', consentRecorded: true }, secret);
  assert.equal(verifyConsultationToken(token, secret).sessionId, 3);
  assert.throws(() => verifyConsultationToken(`${token}x`, secret), /INVALID_CONSULTATION_TOKEN/);

  const mulaw = Buffer.alloc(160, 0xff).toString('base64');
  const pcm16k = twilioMuLaw8kToPcm16kBase64(mulaw);
  assert.equal(Buffer.from(pcm16k, 'base64').length, 640);
  const pcm24k = Buffer.alloc(480 * 2, 0).toString('base64');
  assert.equal(Buffer.from(pcm24kBase64ToTwilioMuLaw8k(pcm24k), 'base64').length, 160);
});
