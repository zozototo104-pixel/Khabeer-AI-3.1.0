import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Document, Packer, Paragraph } from 'docx';
import ExcelJS from 'exceljs';
import {
  extractNativeDocumentText,
  KnowledgeDocumentError,
} from '../server/services/knowledge/DocumentIngestionService.ts';
import {
  prepareKnowledgeDocument,
  runKnowledgeIngestion,
} from '../server/services/knowledge/KnowledgeIngestionPipeline.ts';

function makePdf(text: string, binaryComment = false): Buffer {
  const stream = `BT /F1 14 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = `%PDF-1.4\n${binaryComment ? '%\x80\x81\x82\x83\n' : ''}`;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function createArabicOfficeFixtures() {
  const docx = await Packer.toBuffer(new Document({
    sections: [{ children: [new Paragraph('سياسة المشتريات العربية المعتمدة للمؤسسة')] }],
  }));
  const workbook = new ExcelJS.Workbook();
  const populated = workbook.addWorksheet('الموازنة');
  populated.addRow(['البند المالي', 'القيمة', 'الملاحظات']);
  populated.addRow(['المصروفات التشغيلية', 4200, 'معتمد']);
  workbook.addWorksheet('فارغ');
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
  return { docx, xlsx };
}

test('K1: valid Arabic XLSX extracts Arabic cells and ignores empty sheets/cells', async () => {
  const { xlsx } = await createArabicOfficeFixtures();
  const result = await prepareKnowledgeDocument({
    buffer: xlsx,
    fileName: 'موازنة.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  assert.match(result.content, /البند المالي\tالقيمة\tالملاحظات/);
  assert.match(result.content, /المصروفات التشغيلية\t4200\tمعتمد/);
  assert.doesNotMatch(result.content, /=== جدول: فارغ ===/);
});

test('K2: valid Arabic DOCX returns non-empty extracted text', async () => {
  const { docx } = await createArabicOfficeFixtures();
  const result = await prepareKnowledgeDocument({
    buffer: docx,
    fileName: 'سياسة.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  assert.match(result.content, /سياسة المشتريات العربية/);
  assert.ok(result.content.length > 20);
});

test('K3: valid text-based PDF extracts searchable text', async () => {
  const result = await prepareKnowledgeDocument({
    buffer: makePdf('PDF_UPLOAD_TEXT_IS_SEARCHABLE'),
    fileName: 'policy.pdf',
    mimeType: 'application/pdf',
  });
  assert.match(result.content, /PDF_UPLOAD_TEXT_IS_SEARCHABLE/);
  assert.equal(result.pageCount, 1);
  assert.equal(result.extractionMethod, 'NATIVE_TEXT');
});

test('K4: binary OOXML/PDF bytes are parsed and never subjected to raw UTF-8 validation', async () => {
  const { docx, xlsx } = await createArabicOfficeFixtures();
  assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(docx));
  assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(xlsx));
  assert.match((await extractNativeDocumentText(docx, 'safe.docx')).text, /المشتريات/);
  assert.match((await extractNativeDocumentText(xlsx, 'safe.xlsx')).text, /الموازنة/);

  const binaryPdf = makePdf('BINARY_PDF_TEXT_OK', true);
  assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(binaryPdf));
  assert.match((await extractNativeDocumentText(binaryPdf, 'safe.pdf', 'application/pdf')).text, /BINARY_PDF_TEXT_OK/);
});

test('K5: malformed binary files return a controlled 4xx error code', async () => {
  for (const [fileName, mimeType, expectedCode] of [
    ['bad.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'MALFORMED_XLSX'],
    ['bad.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'MALFORMED_DOCX'],
    ['bad.pdf', 'application/pdf', 'MALFORMED_PDF'],
  ] as const) {
    await assert.rejects(
      prepareKnowledgeDocument({ buffer: Buffer.from('not-a-valid-file'), fileName, mimeType }),
      (error: unknown) => error instanceof KnowledgeDocumentError
        && error.code === expectedCode
        && error.status >= 400
        && error.status < 500,
    );
  }
});

test('K6: persistence runs only after successful extraction and validation', async () => {
  let persistCalls = 0;
  await assert.rejects(runKnowledgeIngestion({
    buffer: Buffer.from('broken'),
    fileName: 'broken.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }, {
    persist: async () => { persistCalls += 1; return { id: 1 }; },
  }), KnowledgeDocumentError);
  assert.equal(persistCalls, 0);

  const result = await runKnowledgeIngestion({
    buffer: Buffer.from('نص عربي صالح وكافٍ للفهرسة في قاعدة المعرفة', 'utf8'),
    fileName: 'valid.txt',
    mimeType: 'text/plain',
  }, {
    persist: async (prepared) => {
      persistCalls += 1;
      assert.match(prepared.content, /قاعدة المعرفة/);
      return { id: 9 };
    },
  });
  assert.equal(persistCalls, 1);
  assert.equal(result.persisted.id, 9);
});

test('K7: existing UTF-8 TXT and CSV behavior remains working with Arabic', async () => {
  const txt = await prepareKnowledgeDocument({
    buffer: Buffer.from('هذا نص عربي سليم لملف نصي في قاعدة المعرفة', 'utf8'),
    fileName: 'notes.txt',
    mimeType: 'text/plain',
  });
  const csv = await prepareKnowledgeDocument({
    buffer: Buffer.from('البند,القيمة\nالموازنة,1200\nالمشتريات,300', 'utf8'),
    fileName: 'budget.csv',
    mimeType: 'text/csv',
  });
  assert.match(txt.content, /نص عربي سليم/);
  assert.match(csv.content, /الموازنة,1200/);
});

test('knowledge upload keeps original bytes atomic and emits all required stage logs', () => {
  const server = fs.readFileSync('server.ts', 'utf8');
  const migration = fs.readFileSync('migrations/006_original_knowledge_files.sql', 'utf8');
  assert.match(server, /runKnowledgeIngestion/);
  assert.match(server, /db\.transaction\(async \(tx/);
  assert.match(server, /createHash\('sha256'\)\.update\(req\.file\.buffer\)/);
  assert.match(server, /app\.get\('\/api\/knowledge\/:id\/file'/);
  for (const label of [
    'KnowledgeUpload:START',
    'KnowledgeUpload:RECEIVED',
    'KnowledgeExtract:START',
    'KnowledgeExtract:DONE',
    'KnowledgeNormalize:DONE',
    'KnowledgeIndex:START',
    'KnowledgeIndex:DONE',
    'KnowledgeUpload:SUCCESS',
    'KnowledgeUpload:ERROR',
  ]) assert.match(server, new RegExp(label));
  assert.match(migration, /data\s+BYTEA NOT NULL/);
  assert.match(migration, /REFERENCES knowledge\(id\) ON DELETE CASCADE/);
});
