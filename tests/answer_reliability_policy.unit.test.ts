import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnswerReliabilityInstruction,
  buildAnswerReliabilityProfile,
  detectExpertAnswerDomain,
} from '../server/services/expert/AnswerReliabilityPolicy.ts';

test('detects legal and internal-review questions', () => {
  assert.equal(detectExpertAnswerDomain('ما رأيك باللائحة الخاصة بنا من ناحية قانونية؟'), 'LEGAL');
  const profile = buildAnswerReliabilityProfile('ما رأيك باللائحة الخاصة بنا من ناحية قانونية؟', '');
  assert.equal(profile.depth, 'ANALYTICAL');
  assert.equal(profile.requiresInternalEvidence, true);
  assert.equal(profile.asksForInternalReview, true);
  assert.equal(profile.confidenceHint, 'MEDIUM');
});

test('requires explicit missing-source disclosure when internal evidence is absent', () => {
  const instruction = buildAnswerReliabilityInstruction('قيّم اللائحة الخاصة بنا قانونياً', '');
  assert.match(instruction, /لا يوجد دليل داخلي كافٍ/);
  assert.match(instruction, /لا تخترع أرقام مواد أو بنود أو صفحات/);
  assert.match(instruction, /درجة الثقة/);
});

test('requires internal/source separation and conflict handling when evidence exists', () => {
  const instruction = buildAnswerReliabilityInstruction(
    'ما رأيك باللائحة الخاصة بنا من ناحية قانونية؟',
    'دليل مسترجع من الوثيقة: لائحة الاختبار الصفحة 12 score=0.91 نص تنظيمي واضح'.repeat(8),
  );
  assert.match(instruction, /حسب ملفاتك الداخلية/);
  assert.match(instruction, /من الناحية العامة أو التخصصية/);
  assert.match(instruction, /التعارضات أو القيود/);
  assert.match(instruction, /الأولوية للملفات الداخلية/);
});
