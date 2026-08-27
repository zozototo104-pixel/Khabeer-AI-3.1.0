import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const SUPPORTED_KNOWLEDGE_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.md', '.json'] as const;

export type KnowledgeFormat = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'md' | 'json';

export class KnowledgeDocumentError extends Error {
  readonly code: string;
  readonly status: number;
  readonly userMessage: string;
  readonly cause?: unknown;

  constructor(code: string, userMessage: string, status = 422, cause?: unknown) {
    super(code);
    this.name = 'KnowledgeDocumentError';
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

export function getKnowledgeFormat(fileName: string): KnowledgeFormat | null {
  const lower = String(fileName || '').toLowerCase();
  const extension = SUPPORTED_KNOWLEDGE_EXTENSIONS.find((value) => lower.endsWith(value));
  return extension ? extension.slice(1) as KnowledgeFormat : null;
}

export function isSupportedKnowledgeFile(fileName: string): boolean {
  return getKnowledgeFormat(fileName) !== null;
}

const MIME_BY_FORMAT: Record<KnowledgeFormat, ReadonlySet<string>> = {
  pdf: new Set(['application/pdf']),
  docx: new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
  ]),
  xlsx: new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
  ]),
  csv: new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain']),
  txt: new Set(['text/plain']),
  md: new Set(['text/markdown', 'text/plain']),
  json: new Set(['application/json', 'text/json', 'text/plain']),
};

const GENERIC_UPLOAD_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

function hasZipSignature(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer[0] === 0x50 && buffer[1] === 0x4b && (
    (buffer[2] === 0x03 && buffer[3] === 0x04)
    || (buffer[2] === 0x05 && buffer[3] === 0x06)
    || (buffer[2] === 0x07 && buffer[3] === 0x08)
  );
}

export function validateKnowledgeFileType(buffer: Buffer, fileName: string, mimeType = ''): KnowledgeFormat {
  const format = getKnowledgeFormat(fileName);
  if (!format) {
    throw new KnowledgeDocumentError(
      'UNSUPPORTED_KNOWLEDGE_FILE',
      'نوع الملف غير مدعوم. استخدم PDF أو DOCX أو XLSX أو CSV أو TXT.',
      415,
    );
  }

  const normalizedMime = String(mimeType || '').split(';', 1)[0].trim().toLowerCase();
  const zipSignature = hasZipSignature(buffer);
  // Browsers (notably mobile Safari and document providers) can report an
  // arbitrary MIME for XLSX. A .xlsx extension plus an OOXML ZIP signature is
  // stronger evidence than that client-supplied MIME, so let ExcelJS perform
  // the authoritative workbook parse. Other formats retain strict MIME rules.
  const trustedXlsxContainer = format === 'xlsx' && zipSignature;
  if (
    !trustedXlsxContainer
    && !GENERIC_UPLOAD_MIMES.has(normalizedMime)
    && !MIME_BY_FORMAT[format].has(normalizedMime)
  ) {
    throw new KnowledgeDocumentError(
      'FILE_TYPE_MISMATCH',
      'امتداد الملف لا يطابق نوعه الفعلي. أعد تصدير الملف بصيغته الصحيحة ثم ارفعه مجددًا.',
      415,
    );
  }

  if (format === 'pdf' && !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new KnowledgeDocumentError('MALFORMED_PDF', 'ملف PDF غير صالح أو غير مكتمل.', 422);
  }
  if ((format === 'docx' || format === 'xlsx') && !zipSignature) {
    throw new KnowledgeDocumentError(
      format === 'docx' ? 'MALFORMED_DOCX' : 'XLSX_SIGNATURE_MISMATCH',
      format === 'docx'
        ? 'ملف DOCX غير صالح أو غير مكتمل.'
        : 'بنية الملف لا تطابق صيغة XLSX. تأكد من امتداد الملف وأعد تصديره بصيغة Excel XLSX.',
      422,
    );
  }
  return format;
}

export function normalizeExtractedDocumentText(input: unknown): string {
  const text = typeof input === 'string' ? input : String(input ?? '');
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .split('\n')
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join('\n')
    .trim();
}

function decodeUtf8Text(buffer: Buffer, format: 'csv' | 'txt' | 'md' | 'json'): string {
  try {
    // Raw UTF-8 decoding is intentionally limited to actual text formats.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch (error) {
    throw new KnowledgeDocumentError(
      'TEXT_ENCODING_INVALID',
      `تعذر قراءة ملف ${format.toUpperCase()} بترميز UTF-8. أعد حفظه بترميز UTF-8 ثم ارفعه مجددًا.`,
      422,
      error,
    );
  }
}

export interface NativeDocumentExtraction {
  text: string;
  pageCount: number;
  isPdf: boolean;
  format: KnowledgeFormat;
}

/**
 * Extract searchable text without changing or truncating the source bytes.
 * Binary PDF/OOXML bytes are sent only to their format parser and are never
 * decoded or validated as UTF-8. The original buffer is persisted separately.
 */
export async function extractNativeDocumentText(
  buffer: Buffer,
  fileName: string,
  mimeType = '',
): Promise<NativeDocumentExtraction> {
  const format = validateKnowledgeFileType(buffer, fileName, mimeType);

  try {
    if (format === 'docx') {
      const mammothModule: any = await import('mammoth');
      const mammoth = mammothModule.default || mammothModule;
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value || '', pageCount: 0, isPdf: false, format };
    }

    if (format === 'xlsx') {
      const excelJsModule: any = await import('exceljs');
      const ExcelJS = excelJsModule.default || excelJsModule;
      const workbook = new ExcelJS.Workbook();
      try {
        // Knowledge ingestion needs cell values, not worksheet merge layout.
        // Ignore mergeCells on the first parse so valid workbooks with huge or
        // malformed merge metadata cannot stall/fail before text extraction.
        // The original XLSX Buffer is passed directly and remains untouched.
        await workbook.xlsx.load(buffer, { ignoreNodes: ['mergeCells'] });
      } catch (error) {
        throw new KnowledgeDocumentError(
          'XLSX_PARSE_FAILED',
          'تعذر على قارئ Excel فتح ملف XLSX. قد يستخدم الملف ميزة غير مدعومة أو تكون بنيته الداخلية غير قابلة للقراءة. أعد حفظه كملف XLSX جديد ثم حاول مجددًا.',
          422,
          error,
        );
      }
      const sections: string[] = [];

      workbook.eachSheet((worksheet: any) => {
        const rows: string[] = [];
        worksheet.eachRow({ includeEmpty: false }, (row: any) => {
          const values: string[] = [];
          row.eachCell({ includeEmpty: false }, (cell: any) => {
            const value = normalizeExtractedDocumentText(cell.text || '');
            if (value) values.push(value.replace(/[\r\n]+/g, ' '));
          });
          if (values.length) rows.push(values.join('\t'));
        });

        if (rows.length) {
          const sheetName = normalizeExtractedDocumentText(worksheet.name || 'Sheet');
          sections.push(`=== جدول: ${sheetName} ===\n${rows.join('\n')}`);
        }
      });

      return { text: sections.join('\n\n').slice(0, 5_000_000), pageCount: 0, isPdf: false, format };
    }

    if (format === 'csv' || format === 'txt' || format === 'md' || format === 'json') {
      return {
        text: decodeUtf8Text(buffer, format).slice(0, 5_000_000),
        pageCount: 0,
        isPdf: false,
        format,
      };
    }

    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return {
        text: result.text || '',
        pageCount: Number(result.total || result.pages?.length || 0),
        isPdf: true,
        format,
      };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof KnowledgeDocumentError) throw error;
    const code = format === 'docx'
      ? 'DOCX_PARSE_FAILED'
      : format === 'xlsx'
        ? 'XLSX_PARSE_FAILED'
        : format === 'pdf'
          ? 'PDF_PARSE_FAILED'
          : 'TEXT_PARSE_FAILED';
    const label = format.toUpperCase();
    throw new KnowledgeDocumentError(
      code,
      format === 'xlsx'
        ? 'تعذر استخراج النص من ملف XLSX بسبب خطأ في قراءة المصنف.'
        : `تعذر استخراج النص من ملف ${label}. قد يكون الملف تالفًا أو غير مكتمل.`,
      422,
      error,
    );
  }
}
