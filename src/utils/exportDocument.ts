import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  convertInchesToTwip,
  Header,
  Footer,
  PageNumber,
  NumberFormat
} from 'docx';

/**
 * Document Export Utility for Modern Microsoft Word (.docx - Office 2016-2024 / 365) 
 * and Printable PDF formatting.
 * Full RTL Arabic typography, official letterheads, tables, and signature blocks.
 */

export interface ExportDocumentOptions {
  title: string;
  content: string; // Markdown or plain text
  orgName?: string;
  deliverableType?: string;
  documentNumber?: string;
  authorName?: string;
  date?: string;
}

/**
 * Helper to split and parse formatted text runs (supports **bold**, *italic*, ***bold italic***)
 */
function parseFormattedRuns(
  text: string,
  options: {
    bold?: boolean;
    italics?: boolean;
    color?: string;
    size?: number;
    font?: string;
  } = {}
): TextRun[] {
  const defaultFont = options.font || 'Segoe UI';
  const defaultSize = options.size || 22; // 11pt
  const defaultColor = options.color || '1E293B';
  const runs: TextRun[] = [];

  if (!text) {
    return [new TextRun({ text: ' ', font: defaultFont, size: defaultSize, rightToLeft: true })];
  }

  const tokenRegex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const normal = text.substring(lastIndex, match.index);
      if (normal) {
        runs.push(
          new TextRun({
            text: normal,
            font: defaultFont,
            size: defaultSize,
            color: defaultColor,
            bold: options.bold || false,
            italics: options.italics || false,
            rightToLeft: true
          })
        );
      }
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith('***') && matchedStr.endsWith('***')) {
      runs.push(
        new TextRun({
          text: matchedStr.slice(3, -3),
          font: defaultFont,
          size: defaultSize,
          color: defaultColor,
          bold: true,
          italics: true,
          rightToLeft: true
        })
      );
    } else if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
      runs.push(
        new TextRun({
          text: matchedStr.slice(2, -2),
          font: defaultFont,
          size: defaultSize,
          color: defaultColor,
          bold: true,
          italics: options.italics || false,
          rightToLeft: true
        })
      );
    } else if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
      runs.push(
        new TextRun({
          text: matchedStr.slice(1, -1),
          font: defaultFont,
          size: defaultSize,
          color: defaultColor,
          bold: options.bold || false,
          italics: true,
          rightToLeft: true
        })
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    const remainder = text.substring(lastIndex);
    if (remainder) {
      runs.push(
        new TextRun({
          text: remainder,
          font: defaultFont,
          size: defaultSize,
          color: defaultColor,
          bold: options.bold || false,
          italics: options.italics || false,
          rightToLeft: true
        })
      );
    }
  }

  if (runs.length === 0) {
    runs.push(
      new TextRun({
        text: text,
        font: defaultFont,
        size: defaultSize,
        color: defaultColor,
        bold: options.bold || false,
        italics: options.italics || false,
        rightToLeft: true
      })
    );
  }

  return runs;
}

/**
 * Converts Markdown text into native DOCX Elements (Paragraphs, Tables, Callouts)
 */
function convertMarkdownToDocxElements(md: string): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  if (!md) return elements;

  const rawLines = md.split('\n');
  let inTable = false;
  let tableRowsData: string[][] = [];

  const flushTable = () => {
    if (tableRowsData.length > 0) {
      const isHeaderRow = true;
      const numCols = Math.max(...tableRowsData.map(r => r.length));
      const colWidthPercent = Math.floor(100 / (numCols || 1));

      const docxRows = tableRowsData.map((rowCells, rowIdx) => {
        const isHeader = rowIdx === 0;
        return new TableRow({
          tableHeader: isHeader,
          children: rowCells.map(cellText => {
            return new TableCell({
              width: {
                size: colWidthPercent,
                type: WidthType.PERCENTAGE
              },
              shading: isHeader
                ? { fill: 'F1F5F9', type: ShadingType.CLEAR }
                : rowIdx % 2 === 1
                ? { fill: 'FAFAFA', type: ShadingType.CLEAR }
                : undefined,
              margins: {
                top: 140,
                bottom: 140,
                left: 140,
                right: 140
              },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
              },
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.RIGHT,
                  children: parseFormattedRuns(cellText, {
                    bold: isHeader,
                    color: isHeader ? '0F172A' : '334155',
                    size: 20 // 10pt
                  })
                })
              ]
            });
          })
        });
      });

      elements.push(
        new Table({
          width: {
            size: 100,
            type: WidthType.PERCENTAGE
          },
          rows: docxRows
        })
      );

      // Spacer after table
      elements.push(
        new Paragraph({
          spacing: { before: 80, after: 80 },
          children: []
        })
      );

      tableRowsData = [];
    }
    inTable = false;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    // Check for Table Row
    if (line.startsWith('|') && line.endsWith('|')) {
      // Ignore separator row e.g. |---|---|
      if (/^\|[\s\-:|]+\|$/.test(line)) {
        continue;
      }
      inTable = true;
      const cells = line
        .split('|')
        .slice(1, -1)
        .map(c => c.trim());
      tableRowsData.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (!line) {
      // Empty line -> small paragraph space
      continue;
    }

    // Heading 1
    if (line.startsWith('# ')) {
      const headingText = line.replace(/^#\s+/, '');
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { before: 240, after: 120 },
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 12,
              color: '2563EB'
            }
          },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              size: 32, // 16pt
              color: '1E3A8A',
              font: 'Traditional Arabic',
              rightToLeft: true
            })
          ]
        })
      );
      continue;
    }

    // Heading 2
    if (line.startsWith('## ')) {
      const headingText = line.replace(/^##\s+/, '');
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { before: 200, after: 100 },
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 6,
              color: 'CBD5E1'
            }
          },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              size: 28, // 14pt
              color: '1E40AF',
              font: 'Traditional Arabic',
              rightToLeft: true
            })
          ]
        })
      );
      continue;
    }

    // Heading 3
    if (line.startsWith('### ')) {
      const headingText = line.replace(/^###\s+/, '');
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { before: 160, after: 80 },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              size: 24, // 12pt
              color: '334155',
              font: 'Segoe UI',
              rightToLeft: true
            })
          ]
        })
      );
      continue;
    }

    // Heading 4
    if (line.startsWith('#### ')) {
      const headingText = line.replace(/^####\s+/, '');
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_4,
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              size: 22, // 11pt
              color: '475569',
              font: 'Segoe UI',
              rightToLeft: true
            })
          ]
        })
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteText = line.replace(/^>\s+/, '');
      elements.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { before: 120, after: 120 },
          shading: {
            fill: 'F1F5F9',
            type: ShadingType.CLEAR
          },
          border: {
            right: {
              style: BorderStyle.SINGLE,
              size: 24,
              color: '3B82F6'
            }
          },
          children: [
            new TextRun({
              text: '   ' + quoteText,
              font: 'Segoe UI',
              size: 20, // 10pt
              color: '334155',
              italics: true,
              rightToLeft: true
            })
          ]
        })
      );
      continue;
    }

    // Checkbox lists
    if (line.startsWith('- [x] ') || line.startsWith('- [ ] ')) {
      const isChecked = line.startsWith('- [x] ');
      const checkText = line.replace(/^- \[(x|\s)\]\s+/, '');
      elements.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { before: 40, after: 40 },
          children: [
            new TextRun({
              text: isChecked ? ' [✓] ' : ' [   ] ',
              bold: true,
              color: isChecked ? '16A34A' : '64748B',
              size: 22,
              font: 'Segoe UI',
              rightToLeft: true
            }),
            ...parseFormattedRuns(checkText, {
              color: isChecked ? '166534' : '334155',
              size: 22
            })
          ]
        })
      );
      continue;
    }

    // Bullet item
    if (line.startsWith('* ') || line.startsWith('- ') || line.startsWith('• ')) {
      const itemText = line.replace(/^([*\-•])\s+/, '');
      elements.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          bullet: {
            level: 0
          },
          spacing: { before: 40, after: 40 },
          children: parseFormattedRuns(itemText, {
            size: 22,
            color: '334155'
          })
        })
      );
      continue;
    }

    // Horizontal Rule
    if (line === '---' || line === '***' || line === '___') {
      elements.push(
        new Paragraph({
          spacing: { before: 140, after: 140 },
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 6,
              color: 'E2E8F0'
            }
          },
          children: []
        })
      );
      continue;
    }

    // Standard body paragraph
    elements.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { before: 60, after: 60, line: 360 }, // 1.5 line spacing
        children: parseFormattedRuns(line, {
          size: 22, // 11pt
          color: '1E293B'
        })
      })
    );
  }

  if (inTable) {
    flushTable();
  }

  return elements;
}

/**
 * Downloads formatted document as true Microsoft Word Office Open XML file (.docx)
 * Compatible with Microsoft Word 2016, 2019, 2021, Office 365, Word Online, Google Docs.
 */
export async function exportToWord(options: ExportDocumentOptions): Promise<void> {
  const {
    title,
    content,
    orgName = 'المؤسسة',
    deliverableType = 'دليل إجراءات تشغيلي (SOP)',
    documentNumber = `DOC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    authorName = 'المستشار الرقابي الذكي',
    date = new Date().toLocaleDateString('ar-SA')
  } = options;

  try {
    // Generate Header Table inside document
    const headerTable = new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE
      },
      rows: [
        new TableRow({
          children: [
            // Left box (Document status / accreditation badge)
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: 'EFF6FF', type: ShadingType.CLEAR },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 6, color: '3B82F6' },
                bottom: { style: BorderStyle.SINGLE, size: 6, color: '3B82F6' },
                left: { style: BorderStyle.SINGLE, size: 6, color: '3B82F6' },
                right: { style: BorderStyle.SINGLE, size: 6, color: '3B82F6' }
              },
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'وثيقة رسمية معتمدة',
                      bold: true,
                      color: '1D4ED8',
                      size: 20,
                      font: 'Traditional Arabic',
                      rightToLeft: true
                    }),
                    new TextRun({
                      text: '\nإنجاز الذكاء الاصطناعي الرقابي',
                      color: '64748B',
                      size: 16,
                      font: 'Segoe UI',
                      rightToLeft: true
                    })
                  ]
                })
              ]
            }),
            // Right box (Organization titles and document metadata)
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: orgName,
                      bold: true,
                      size: 28,
                      color: '1E3A8A',
                      font: 'Traditional Arabic',
                      rightToLeft: true
                    })
                  ]
                }),
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 40, after: 40 },
                  children: [
                    new TextRun({
                      text: 'منظومة الرقابة والامتثال والحوكمة الذكية',
                      bold: true,
                      size: 20,
                      color: '2563EB',
                      font: 'Segoe UI',
                      rightToLeft: true
                    })
                  ]
                }),
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: `نوع الوثيقة: ${deliverableType}  |  رقم الوثيقة: ${documentNumber}  |  التاريخ: ${date}`,
                      color: '64748B',
                      size: 18,
                      font: 'Segoe UI',
                      rightToLeft: true
                    })
                  ]
                })
              ]
            })
          ]
        })
      ]
    });

    const dividerParagraph = new Paragraph({
      spacing: { before: 120, after: 180 },
      border: {
        bottom: {
          style: BorderStyle.DOUBLE,
          size: 12,
          color: '1E3A8A'
        }
      },
      children: []
    });

    // Parse Body Content from Markdown
    const bodyElements = convertMarkdownToDocxElements(content);

    // Signatures / Closing footer table
    const signatureTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 200 },
                  children: [
                    new TextRun({
                      text: 'إدارة الرقابة والتدقيق الداخلي',
                      bold: true,
                      size: 22,
                      color: '1E3A8A',
                      font: 'Traditional Arabic',
                      rightToLeft: true
                    }),
                    new TextRun({
                      text: '\n\n............................................\nختم واعتماد الإدارة',
                      size: 18,
                      color: '64748B',
                      rightToLeft: true
                    })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 200 },
                  children: [
                    new TextRun({
                      text: 'المستشار الرقابي الذكي',
                      bold: true,
                      size: 22,
                      color: '1E3A8A',
                      font: 'Traditional Arabic',
                      rightToLeft: true
                    }),
                    new TextRun({
                      text: `\n\n............................................\nتاريخ الصدور: ${date}`,
                      size: 18,
                      color: '64748B',
                      rightToLeft: true
                    })
                  ]
                })
              ]
            })
          ]
        })
      ]
    });

    const footerNote = new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 60 },
      border: {
        top: {
          style: BorderStyle.SINGLE,
          size: 4,
          color: 'CBD5E1'
        }
      },
      children: [
        new TextRun({
          text: 'تم إعداد وتوليد هذه الوثيقة آلياً وفق المعايير واللوائح الرقابية السارية — صالحة للاستخدام والتنفيذ الرسمي.',
          color: '94A3B8',
          size: 16, // 8pt
          font: 'Segoe UI',
          italics: true,
          rightToLeft: true
        })
      ]
    });

    // Construct Document
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(0.9),
                bottom: convertInchesToTwip(0.9),
                left: convertInchesToTwip(0.8),
                right: convertInchesToTwip(0.8)
              }
            }
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: `${orgName} | ${title}`,
                      size: 16,
                      color: '94A3B8',
                      font: 'Segoe UI',
                      rightToLeft: true
                    })
                  ]
                })
              ]
            })
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'صفحة ',
                      size: 16,
                      color: '94A3B8',
                      rightToLeft: true
                    }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      size: 16,
                      color: '94A3B8'
                    }),
                    new TextRun({
                      text: ' من ',
                      size: 16,
                      color: '94A3B8',
                      rightToLeft: true
                    }),
                    new TextRun({
                      children: [PageNumber.TOTAL_PAGES],
                      size: 16,
                      color: '94A3B8'
                    })
                  ]
                })
              ]
            })
          },
          children: [
            headerTable,
            dividerParagraph,
            ...bodyElements,
            signatureTable,
            footerNote
          ]
        }
      ]
    });

    // Pack as .docx binary blob
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanFileName = (title || 'وثيقة_رقابية').replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g, '_');
    link.download = `${cleanFileName}_${date.replace(/\//g, '-')}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating .docx file:', error);
    alert('حدث خطأ أثناء إنشاء ملف Word (.docx).');
  }
}

/**
 * Triggers Print & PDF export preview
 */
export function exportToPrintablePdf(options: ExportDocumentOptions) {
  const {
    title,
    content,
    orgName = 'المؤسسة',
    deliverableType = 'دليل إجراءات رسمي',
    documentNumber = `DOC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    date = new Date().toLocaleDateString('ar-SA')
  } = options;

  const htmlContent = markdownToHtml(content);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لطباعة المستند أو تصديره إلى PDF.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>${title} - ${orgName}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
        
        * {
          box-sizing: border-box;
        }
        body {
          font-family: 'Tajawal', Arial, sans-serif;
          margin: 0;
          padding: 2.5cm 2cm;
          color: #0f172a;
          background: #ffffff;
          direction: rtl;
          text-align: right;
          font-size: 11pt;
          line-height: 1.7;
        }
        .header {
          border-bottom: 2px solid #1e3a8a;
          padding-bottom: 15px;
          margin-bottom: 25px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .header h1 {
          font-size: 16pt;
          color: #1e3a8a;
          margin: 0 0 5px 0;
        }
        .header p {
          margin: 0;
          font-size: 9pt;
          color: #64748b;
        }
        .badge {
          border: 1.5px solid #2563eb;
          padding: 6px 12px;
          border-radius: 8px;
          text-align: center;
          font-weight: bold;
          font-size: 9pt;
          color: #1d4ed8;
          background: #eff6ff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
          page-break-inside: avoid;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 8px 10px;
          text-align: right;
          font-size: 10pt;
        }
        th {
          background-color: #f8fafc;
          font-weight: bold;
          color: #0f172a;
        }
        .footer {
          margin-top: 40px;
          border-top: 1px solid #e2e8f0;
          padding-top: 10px;
          font-size: 8pt;
          color: #94a3b8;
          text-align: center;
        }
        @media print {
          body {
            padding: 1.5cm 1cm;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4;
            margin: 1.5cm;
          }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="background:#1e293b; color:#fff; padding:12px 20px; border-radius:12px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="font-size:13pt;">معاينة الطباعة والحفظ بصيغة PDF</strong>
          <p style="margin:2px 0 0; font-size:9pt; color:#94a3b8;">اضغط على زر الطباعة أدناه، ثم اختر "Save as PDF" أو حدد الطابعة المطلوبة.</p>
        </div>
        <button onclick="window.print()" style="background:#2563eb; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:11pt; font-family:'Tajawal', sans-serif;">
          🖨️ طباعة / حفظ PDF
        </button>
      </div>

      <div class="header">
        <div>
          <h1>${orgName}</h1>
          <p>الإدارة العامة للرقابة والتفتيش والحوكمة الرقابية الذكية</p>
          <p>نوع المخرج: ${deliverableType} | رقم الوثيقة: ${documentNumber} | التاريخ: ${date}</p>
        </div>
        <div class="badge">
          وثيقة رقابية معتمدة<br/>
          <small style="font-weight:normal;">منجز الذكاء الاصطناعي</small>
        </div>
      </div>

      <div class="content">
        ${htmlContent}
      </div>

      <div class="footer">
        منصة الرقابة الذكية — تم توليد الوثيقة ومراجعتها وفق الأنظمة الرقابية السارية.
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 400);
        };
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}

/**
 * Utility for converting Markdown to HTML string for print previews
 */
export function markdownToHtml(md: string): string {
  if (!md) return '';
  
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/^# (.*$)/gim, '<h1 style="color:#0f172a; font-size:20pt; margin-bottom:12pt; font-weight:bold; border-bottom:2px solid #2563eb; padding-bottom:6pt;">$1</h1>');
  html = html.replace(/^## (.*$)/gim, '<h2 style="color:#1e293b; font-size:15pt; margin-top:16pt; margin-bottom:8pt; font-weight:bold; border-bottom:1px solid #cbd5e1; padding-bottom:4pt;">$1</h2>');
  html = html.replace(/^### (.*$)/gim, '<h3 style="color:#334155; font-size:12.5pt; margin-top:12pt; margin-bottom:6pt; font-weight:bold;">$1</h3>');
  html = html.replace(/^#### (.*$)/gim, '<h4 style="color:#475569; font-size:11pt; margin-top:10pt; margin-bottom:4pt; font-weight:bold;">$1</h4>');

  html = html.replace(/^\> (.*$)/gim, '<blockquote style="background:#f1f5f9; border-right:4px solid #3b82f6; padding:8pt 12pt; margin:8pt 0; color:#334155; font-size:10pt;">$1</blockquote>');

  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<b><i>$1</i></b>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong style="color:#0f172a;">$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<i>$1</i>');

  html = html.replace(/- \[\s\] (.*$)/gim, '<div style="margin:4pt 0; padding-right:16pt; color:#334155;"><span style="display:inline-block; width:12pt; height:12pt; border:1px solid #64748b; margin-left:6pt; border-radius:2px; vertical-align:middle;"></span> $1</div>');
  html = html.replace(/- \[x\] (.*$)/gim, '<div style="margin:4pt 0; padding-right:16pt; color:#16a34a;"><span style="display:inline-block; width:12pt; height:12pt; background:#16a34a; color:#fff; text-align:center; line-height:12pt; font-size:9pt; margin-left:6pt; border-radius:2px; vertical-align:middle;">✓</span> $1</div>');

  html = html.replace(/^[*-] (.*$)/gim, '<li style="margin-bottom:4pt; color:#334155; line-height:1.6;">$1</li>');

  const lines = html.split('\n');
  let inTable = false;
  let tableHtml = '';
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHtml = '<table style="width:100%; border-collapse:collapse; margin:12pt 0; font-size:10pt;" border="1" cellpadding="6" cellspacing="0">';
      }
      
      if (/^\|[\s\-:|]+\|$/.test(line)) {
        continue;
      }

      const cells = line.split('|').slice(1, -1);
      const isHeader = !tableHtml.includes('<tbody>') && !tableHtml.includes('</td>');

      tableHtml += '<tr>';
      cells.forEach(cell => {
        const cleanCell = cell.trim();
        if (isHeader) {
          tableHtml += `<th style="background:#f8fafc; color:#0f172a; font-weight:bold; border:1px solid #cbd5e1; padding:8pt; text-align:right;">${cleanCell}</th>`;
        } else {
          tableHtml += `<td style="border:1px solid #cbd5e1; padding:6pt 8pt; color:#334155; text-align:right;">${cleanCell}</td>`;
        }
      });
      tableHtml += '</tr>';
    } else {
      if (inTable) {
        tableHtml += '</table>';
        processedLines.push(tableHtml);
        inTable = false;
        tableHtml = '';
      }
      processedLines.push(lines[i]);
    }
  }

  if (inTable) {
    tableHtml += '</table>';
    processedLines.push(tableHtml);
  }

  html = processedLines.join('\n');
  html = html.replace(/^---$/gim, '<hr style="border:0; border-top:1px solid #e2e8f0; margin:16pt 0;" />');

  html = html.split('\n\n').map(para => {
    para = para.trim();
    if (!para) return '';
    if (para.startsWith('<h') || para.startsWith('<table') || para.startsWith('<blockquote') || para.startsWith('<hr') || para.startsWith('<div')) {
      return para;
    }
    return `<p style="margin:6pt 0; line-height:1.7; color:#334155; font-size:11pt;">${para.replace(/\n/g, '<br />')}</p>`;
  }).join('\n');

  return html;
}
