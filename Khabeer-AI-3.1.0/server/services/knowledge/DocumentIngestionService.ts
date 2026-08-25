export const SUPPORTED_KNOWLEDGE_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.md', '.json'] as const;

export function isSupportedKnowledgeFile(fileName: string): boolean {
  const lower = String(fileName || '').toLowerCase();
  return SUPPORTED_KNOWLEDGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export interface NativeDocumentExtraction {
  text: string;
  pageCount: number;
  isPdf: boolean;
}

/**
 * Extract searchable text without changing or truncating the source bytes.
 * The original buffer is persisted separately by the route.
 */
export async function extractNativeDocumentText(
  buffer: Buffer,
  fileName: string,
  mimeType = '',
): Promise<NativeDocumentExtraction> {
  const lower = String(fileName || '').toLowerCase();
  const isPdf = lower.endsWith('.pdf') || mimeType === 'application/pdf';

  if (lower.endsWith('.docx')) {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value || '', pageCount: 0, isPdf: false };
  }

  if (lower.endsWith('.csv')) {
    return { text: buffer.toString('utf8').slice(0, 5_000_000), pageCount: 0, isPdf: false };
  }

  if (lower.endsWith('.xlsx')) {
    const excelJsModule: any = await import('exceljs');
    const ExcelJS = excelJsModule.default || excelJsModule;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sections: string[] = [];
    workbook.eachSheet((worksheet: any) => {
      const rows: string[] = [];
      worksheet.eachRow((row: any) => {
        const values: string[] = [];
        for (let column = 1; column <= row.cellCount; column++) {
          values.push(String(row.getCell(column).text || '').replace(/[\r\n]+/g, ' ').trim());
        }
        rows.push(values.join(','));
      });
      sections.push(`=== جدول: ${worksheet.name} ===\n${rows.join('\n')}`);
    });
    return { text: sections.join('\n\n').slice(0, 5_000_000), pageCount: 0, isPdf: false };
  }

  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.json')) {
    return { text: buffer.toString('utf8'), pageCount: 0, isPdf: false };
  }

  if (isPdf) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return {
        text: result.text || '',
        pageCount: Number(result.total || result.pages?.length || 0),
        isPdf: true,
      };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  throw new Error('UNSUPPORTED_KNOWLEDGE_FILE');
}
