import assert from 'node:assert/strict';
import test from 'node:test';
import { createExpertDeliverable } from '../server/services/expert/DeliverableService.ts';

test('offline deliverables stay drafts and never fabricate missing facts', async () => {
  const output = await createExpertDeliverable({
    title: 'تقرير متابعة الامتثال',
    deliverableType: 'REPORT',
    orgName: 'المؤسسة التجريبية',
  }, async () => {
    throw new Error('MODEL_OFFLINE');
  });

  assert.match(output, /مسودة للمراجعة والاعتماد/);
  assert.match(output, /\[يحتاج استكمال/);
  assert.doesNotMatch(output, /معتمد آلياً|مادة \d+|تم إثبات/);
});

test('generator prompt explicitly prohibits invented regulations and facts', async () => {
  let capturedPrompt = '';
  await createExpertDeliverable({
    title: 'مسودة سياسة',
    deliverableType: 'POLICY',
    approvedKnowledge: 'المصدر المعتمد: سياسة الاختبار فقط.',
  }, async (prompt) => {
    capturedPrompt = prompt;
    return '# مسودة للمراجعة والاعتماد';
  });

  assert.match(capturedPrompt, /لا تخترع مادة أو قانوناً أو رقماً أو واقعة/);
  assert.match(capturedPrompt, /سياسة الاختبار فقط/);
});
