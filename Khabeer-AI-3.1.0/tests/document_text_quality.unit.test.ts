import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDocumentTextQuality, buildPdfPageRanges } from '../server/services/knowledge/DocumentTextQuality.ts';

test('accepts normal Arabic and English business text', () => {
  const arabic = assessDocumentTextQuality('هذه لائحة داخلية سليمة تحتوي على مواد وبنود واضحة ورقم 12.');
  assert.equal(arabic.usable, true);

  const english = assessDocumentTextQuality('This is a valid English policy document with section 12 and clear text.');
  assert.equal(english.usable, true);
});

test('rejects classic mojibake and replacement characters', () => {
  assert.equal(assessDocumentTextQuality('Ø§Ù„Ù„Ø§Ø¦Ø­Ø© Ã˜Â§Ã™Â„Ã˜Â¯Ã˜Â§Ã˜Â®Ã™Â„Ã™ÂŠÃ˜Â©').usable, false);
  assert.equal(assessDocumentTextQuality('النص � غير صالح � للاعتماد').usable, false);
});

test('rejects broken Arabic font-map script transitions', () => {
  const broken = 'المادة Hالسابعة yمن Gاللائحة Hالداخلية Hللمؤسسة وتفاصيل Hغير yمقروءة Gبشكل صحيح';
  const result = assessDocumentTextQuality(broken);
  assert.equal(result.usable, false);
  assert.match(result.reason, /font|mixed|mojibake|symbols/);
});

test('buildPdfPageRanges validates chunking', () => {
  assert.deepEqual(buildPdfPageRanges(45, 20), [
    { start: 1, end: 20 },
    { start: 21, end: 40 },
    { start: 41, end: 45 },
  ]);
  assert.throws(() => buildPdfPageRanges(10, 0), RangeError);
});
