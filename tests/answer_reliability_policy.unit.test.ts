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
  assert.match(instruction, /مدقق داخلي صامت قبل الجواب النهائي/);
});

test('detects professional deliverable templates and requires structured output', () => {
  const profile = buildAnswerReliabilityProfile('اكتب لي تقرير مخالفة وفق اللائحة', '');
  assert.equal(profile.deliverableTemplate, 'VIOLATION_REPORT');
  assert.equal(profile.depth, 'ANALYTICAL');
  assert.equal(profile.requiresInternalEvidence, true);

  const instruction = buildAnswerReliabilityInstruction('اكتب لي تقرير مخالفة وفق اللائحة', '');
  assert.match(instruction, /قالب تقرير مخالفة/);
  assert.match(instruction, /ملخص تنفيذي للمخالفة/);
  assert.match(instruction, /التكليفات: المسؤول، المهمة، تاريخ الاستحقاق/);
  assert.match(instruction, /درجة الثقة وحاجة المراجعة البشرية/);
});

test('meeting minutes template captures named assignments scientifically', () => {
  const profile = buildAnswerReliabilityProfile('أعد محضر اجتماع واذكر أن محمد مكلف بمتابعة العقد', '');
  assert.equal(profile.deliverableTemplate, 'MEETING_MINUTES');
  const instruction = buildAnswerReliabilityInstruction('أعد محضر اجتماع واذكر أن محمد مكلف بمتابعة العقد', '');
  assert.match(instruction, /قالب محضر اجتماع علمي قابل للتنفيذ/);
  assert.match(instruction, /التكليفات والمهام في جدول إلزامي/);
  assert.match(instruction, /إذا قيل "محمد مكلف بكذا"/);
  assert.match(instruction, /مستنتج من السياق/);
});

test('regulatory audit report template requires SWOT KPIs compliance matrix and charts', () => {
  const profile = buildAnswerReliabilityProfile('أريد تقرير رقابي مفصل عن التقرير الشهري وفق اللائحة والخطة', '');
  assert.equal(profile.deliverableTemplate, 'REGULATORY_AUDIT_REPORT');
  assert.equal(profile.depth, 'ANALYTICAL');
  const instruction = buildAnswerReliabilityInstruction('أريد تقرير رقابي مفصل عن التقرير الشهري وفق اللائحة والخطة', '');
  assert.match(instruction, /قالب تقرير رقابي\/شهري تفصيلي علمي/);
  assert.match(instruction, /مصفوفة الامتثال/);
  assert.match(instruction, /تحليل الأداء ومؤشرات KPI/);
  assert.match(instruction, /تحليل SWOT منظم/);
  assert.match(instruction, /الرسوم والجداول/);
  assert.match(instruction, /وفق اللائحة كذا والخطة كذا/);
});
