import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDocumentTextQuality } from '../server/services/knowledge/DocumentTextQuality.ts';

test('rejects repeated Scanner Pro watermark text as unusable PDF extraction', () => {
  const text = [
    'Created in Scanner Pro',
    'Created in Scanner Pro',
    'Created in Scanner Pro',
    '-- of 5 4 --',
    'Created in Scanner Pro',
    'Created in Scanner Pro',
  ].join('\n\n');
  const result = assessDocumentTextQuality(text, { pageCount: 5 });
  assert.equal(result.usable, false);
  assert.equal(result.reason, 'scanner_watermark_text_artifact');
  assert.ok(result.metrics.scannerArtifactMarkers >= 2);
});

test('does not reject legitimate text that only mentions Scanner Pro once', () => {
  const text = 'تم استلام تقرير رقابي مكون من خمس صفحات. ملاحظة تقنية: تم المسح باستخدام Scanner Pro مرة واحدة فقط. يحتوي التقرير على توصيات ومخاطر وملاحظات قابلة للبحث.';
  const result = assessDocumentTextQuality(text, { pageCount: 1 });
  assert.equal(result.usable, true);
  assert.equal(result.reason, 'ok');
});
