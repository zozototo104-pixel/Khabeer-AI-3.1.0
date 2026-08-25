import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Document, Packer, Paragraph } from 'docx';
import ExcelJS from 'exceljs';
import { extractNativeDocumentText } from '../server/services/knowledge/DocumentIngestionService.ts';

function makePdf(text: string): Buffer {
  const stream = `BT /F1 14 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('extracts the actual content of DOCX, XLSX, PDF, CSV and text files', async () => {
  const docxBuffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('WORD_UPLOAD_OK')] }] }));
  assert.match((await extractNativeDocumentText(docxBuffer, 'sample.docx')).text, /WORD_UPLOAD_OK/);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Audit');
  sheet.addRow(['EXCEL_UPLOAD_OK', 42]);
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
  assert.match((await extractNativeDocumentText(xlsx, 'sample.xlsx')).text, /EXCEL_UPLOAD_OK,42/);

  const pdf = await extractNativeDocumentText(makePdf('PDF_UPLOAD_OK'), 'sample.pdf', 'application/pdf');
  assert.match(pdf.text, /PDF_UPLOAD_OK/);
  assert.equal(pdf.pageCount, 1);

  assert.match((await extractNativeDocumentText(Buffer.from('CSV_UPLOAD_OK,7'), 'sample.csv')).text, /CSV_UPLOAD_OK,7/);
  assert.match((await extractNativeDocumentText(Buffer.from('TEXT_UPLOAD_OK'), 'sample.txt')).text, /TEXT_UPLOAD_OK/);
});

test('knowledge upload persists original bytes atomically with SHA-256 metadata', () => {
  const server = fs.readFileSync('server.ts', 'utf8');
  const migration = fs.readFileSync('migrations/006_original_knowledge_files.sql', 'utf8');
  assert.match(server, /db\.transaction\(async \(tx/);
  assert.match(server, /createHash\('sha256'\)\.update\(req\.file\.buffer\)/);
  assert.match(server, /app\.get\('\/api\/knowledge\/:id\/file'/);
  assert.match(migration, /data\s+BYTEA NOT NULL/);
  assert.match(migration, /REFERENCES knowledge\(id\) ON DELETE CASCADE/);
});
