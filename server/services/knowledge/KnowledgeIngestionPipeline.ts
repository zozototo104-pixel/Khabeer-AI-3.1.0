import { assessDocumentTextQuality } from './DocumentTextQuality.ts';
import {
  extractNativeDocumentText,
  KnowledgeDocumentError,
  normalizeExtractedDocumentText,
  type KnowledgeFormat,
} from './DocumentIngestionService.ts';

export interface KnowledgeUploadSource {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface PreparedKnowledgeDocument {
  content: string;
  pageCount: number;
  isPdf: boolean;
  format: KnowledgeFormat;
  extractionMethod: 'VERIFIED_OCR' | 'NATIVE_TEXT';
}

export type KnowledgeStage =
  | 'extract_start'
  | 'extract_done'
  | 'normalize_done'
  | 'index_start'
  | 'index_done';

export interface KnowledgeIngestionDependencies<T> {
  ocrPdf?: (buffer: Buffer, fileName: string, pageCount: number) => Promise<string>;
  persist: (document: PreparedKnowledgeDocument) => Promise<T>;
  onStage?: (stage: KnowledgeStage) => void;
}

export async function prepareKnowledgeDocument(
  source: KnowledgeUploadSource,
  options: Pick<KnowledgeIngestionDependencies<unknown>, 'ocrPdf' | 'onStage'> = {},
): Promise<PreparedKnowledgeDocument> {
  options.onStage?.('extract_start');
  const native = await extractNativeDocumentText(source.buffer, source.fileName, source.mimeType);

  let content = normalizeExtractedDocumentText(native.text);
  let extractionMethod: PreparedKnowledgeDocument['extractionMethod'] = 'NATIVE_TEXT';
  let quality = assessDocumentTextQuality(content);

  if (native.isPdf && !quality.usable) {
    if (!options.ocrPdf) {
      throw new KnowledgeDocumentError(
        'PDF_TEXT_EXTRACTION_FAILED',
        'تعذر استخراج نص موثوق من ملف PDF، ولا تتوفر معالجة OCR لهذا الطلب.',
        422,
      );
    }
    try {
      const ocrText = await options.ocrPdf(source.buffer, source.fileName, native.pageCount);
      content = normalizeExtractedDocumentText(ocrText);
      quality = assessDocumentTextQuality(content);
      extractionMethod = 'VERIFIED_OCR';
    } catch (error) {
      if (error instanceof KnowledgeDocumentError) throw error;
      throw new KnowledgeDocumentError(
        'PDF_TEXT_EXTRACTION_FAILED',
        'تعذر استخراج نص عربي موثوق من ملف PDF. جرّب نسخة قابلة للبحث أو قسّم الملف إلى أجزاء أصغر.',
        422,
        error,
      );
    }
  }

  if (!content || quality.reason === 'text_too_short_or_empty') {
    throw new KnowledgeDocumentError(
      'DOCUMENT_TEXT_EXTRACTION_EMPTY',
      'تعذر استخراج نص قابل للفهرسة من المستند. تأكد أن الملف يحتوي نصًا فعليًا وليس صفحات أو خلايا فارغة.',
      422,
    );
  }

  if (!quality.usable) {
    throw new KnowledgeDocumentError(
      'DOCUMENT_TEXT_QUALITY_FAILED',
      'النص المستخرج يحتوي ترميزًا أو محارف غير صالحة للفهرسة. أعد تصدير نسخة سليمة من الملف.',
      422,
    );
  }

  if (extractionMethod === 'VERIFIED_OCR') {
    content = `[تنبيه: نص مستخرج آلياً من المستند ويحتاج مطابقة بشرية مع الأصل قبل الاستناد النظامي]\n\n${content}`;
  }

  options.onStage?.('extract_done');
  options.onStage?.('normalize_done');

  return {
    content,
    pageCount: native.pageCount,
    isPdf: native.isPdf,
    format: native.format,
    extractionMethod,
  };
}

/** Extraction and validation must finish before the persistence callback runs. */
export async function runKnowledgeIngestion<T>(
  source: KnowledgeUploadSource,
  dependencies: KnowledgeIngestionDependencies<T>,
): Promise<{ prepared: PreparedKnowledgeDocument; persisted: T }> {
  const prepared = await prepareKnowledgeDocument(source, dependencies);
  dependencies.onStage?.('index_start');
  const persisted = await dependencies.persist(prepared);
  dependencies.onStage?.('index_done');
  return { prepared, persisted };
}
