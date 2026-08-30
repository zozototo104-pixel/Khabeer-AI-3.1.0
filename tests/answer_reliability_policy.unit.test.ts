import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnswerReliabilityInstruction,
  buildAnswerReliabilityProfile,
  detectExpertAnswerDomain,
  extractInternalCitationHints,
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

test('extracts citation hints from RAG evidence blocks', () => {
  const hints = extractInternalCitationHints(`
📌 [دليل مسترجع من: لائحة الاختبار، الصفحة 12 | score=91]
نص تنظيمي واضح
---
📜 [📌 نص رسمي للمادة (7) من لائحة العقوبات]
نص المادة
`);
  assert.equal(hints.length, 2);
  assert.deepEqual(hints[0], {
    id: 'م1',
    title: 'لائحة الاختبار',
    page: '12',
    score: '91',
    kind: 'EVIDENCE',
  });
  assert.equal(hints[1].id, 'م2');
  assert.equal(hints[1].kind, 'ARTICLE');
  assert.match(hints[1].title, /لائحة العقوبات/);
});

test('requires internal/source separation, citation use, and conflict handling when evidence exists', () => {
  const instruction = buildAnswerReliabilityInstruction(
    'ما رأيك باللائحة الخاصة بنا من ناحية قانونية؟',
    '📌 [دليل مسترجع من: لائحة الاختبار، الصفحة 12 | score=91]\nنص تنظيمي واضح'.repeat(8),
  );
  assert.match(instruction, /حسب ملفاتك الداخلية/);
  assert.match(instruction, /من الناحية العامة أو التخصصية/);
  assert.match(instruction, /التعارضات أو القيود/);
  assert.match(instruction, /الأولوية للملفات الداخلية/);
  assert.match(instruction, /\[م1\] دليل مسترجع: لائحة الاختبار، الصفحة 12، score=91/);
  assert.match(instruction, /وفق \[م1\]/);
  assert.match(instruction, /التوصية العملية: اكتب هذا العنوان صراحة/);
  assert.match(instruction, /درجة الثقة: اكتب هذا العنوان صراحة/);
  assert.match(instruction, /لا تعتبر الإجابة القانونية\/الهندسية\/الرقابية\/المالية مكتملة/);
});
