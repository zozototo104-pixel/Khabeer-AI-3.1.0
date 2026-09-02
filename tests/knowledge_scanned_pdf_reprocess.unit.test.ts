import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('knowledge list wakes durable OCR worker for pending scanned PDFs', () => {
  const server = read('server.ts');
  assert.match(server, /const hasPendingPdfJobs = docs\.some/);
  assert.match(server, /scheduleKnowledgeWorker\(250\)/);
  assert.match(server, /document_processing_pending/);
  assert.match(server, /scanner_watermark_text_artifact/);
  assert.match(server, /scanner_watermark_text_artifact_requeued_for_ocr/);
  assert.match(server, /requeuedScannerArtifactIds/);
  assert.match(server, /content: isProcessingPlaceholder \? '' : doc\.content/);
});

test('manual PDF OCR reprocess endpoint resets document and schedules worker', () => {
  const server = read('server.ts');
  assert.match(server, /app\.post\('\/api\/knowledge\/:id\/reprocess'/);
  assert.match(server, /OCR reprocessing is available only for PDF documents/);
  assert.match(server, /content: '\[\[PROCESSING_DOCUMENT\]\]'/);
  assert.match(server, /processingStatus: 'PENDING'/);
  assert.match(server, /processedPages: 0/);
  assert.match(server, /ragEngine\.invalidateOrganization\(org\.id\)/);
  assert.match(server, /scheduleKnowledgeWorker\(250\)/);
});

test('knowledge base UI exposes OCR retry instead of asking for delete and reupload', () => {
  const ui = read('src/components/KnowledgeBase.tsx');
  assert.match(ui, /const \[reprocessingDocId, setReprocessingDocId\]/);
  assert.match(ui, /const reprocessOcr = async \(doc: KnowledgeDoc\)/);
  assert.match(ui, /\/api\/knowledge\/\$\{doc\.id\}\/reprocess/);
  assert.match(ui, /إعادة OCR/);
  assert.match(ui, /إعادة OCR من الملف الأصلي/);
  assert.match(ui, /المحتوى النصي لم يكتمل بعد/);
});
