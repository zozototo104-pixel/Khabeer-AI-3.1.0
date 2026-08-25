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
  PageNumber
} from 'docx';

export interface MeetingMinutesData {
  orgName: string;
  meetingTitle: string;
  meetingNumber?: string | number;
  meetingType: string;
  meetingDate: string;
  meetingTime?: string;
  location?: string;
  chairperson?: string;
  secretary?: string;
  agenda?: string;
  participants: Array<{ name: string; role?: string; department?: string; isOrgEmployee?: boolean }>;
  summary?: string;
  decisions: Array<{ id?: number | string; title: string; description?: string; status?: string }>;
  tasks: Array<{ id?: number | string; title: string; assignee?: string; dueDate?: string; status?: string }>;
  risks: Array<{ id?: number | string; title: string; description?: string; severity?: string; category?: string }>;
  violations?: Array<{ id?: number | string; title: string; status?: string; severity?: string; regulationRef?: string; factualEvidence?: string; confidence?: number }>;
  findings?: Array<{ id?: number | string; title: string; description?: string; findingType?: string; status?: string; evidence?: string; severity?: string }>;
}

export function formatMeetingTypeArabic(type: string): string {
  switch (type) {
    case 'BOARD': return 'اجتماع مجلس الإدارة';
    case 'EXECUTIVE': return 'اجتماع الإدارة التنفيذية';
    case 'BRAINSTORMING': return 'جلسة عصف ذهني وابتكار';
    case 'CRISIS': return 'اجتماع إدارة أزمات وطوارئ';
    case 'QUARTERLY': return 'اجتماع المراجعة الربعية';
    default: return type || 'اجتماع رسمي';
  }
}

export function formatSeverityArabic(sev: string): { label: string; color: string; hex: string } {
  switch (sev?.toUpperCase()) {
    case 'HIGH': return { label: 'حرج جداً', color: '#ef4444', hex: 'DC2626' };
    case 'MEDIUM': return { label: 'متوسط', color: '#f59e0b', hex: 'D97706' };
    case 'LOW': return { label: 'منخفض', color: '#10b981', hex: '16A34A' };
    default: return { label: sev || 'عادي', color: '#6b7280', hex: '475569' };
  }
}

export function generateFormattedMinutesText(data: MeetingMinutesData): string {
  return `
=========================================
محضر اجتماع رسمي: ${data.meetingTitle}
المؤسسة: ${data.orgName}
النوع: ${formatMeetingTypeArabic(data.meetingType)}
التاريخ: ${data.meetingDate} ${data.meetingTime ? `| الوقت: ${data.meetingTime}` : ''}
المكان: ${data.location || 'المقر الرئيسي'}
=========================================

1. الحضور والمشاركون:
${data.participants.length > 0 
  ? data.participants.map((p, i) => `   ${i + 1}. ${p.name} (${p.role || 'عضو'}${p.department ? ` - ${p.department}` : ''})`).join('\n') 
  : '   - لم يتم تسجيل حضور محدد.'}

2. محاور وأجندة الاجتماع:
${data.agenda || '   - مناقشة الموضوعات المدرجة في جدول الأعمال.'}

3. ملخص المداولات والنقاش:
${data.summary || '   - تم التباحث حول البنود المدرجة واتخاذ القرارات والتوصيات اللازمة.'}

4. القرارات الاستراتيجية المعتمدة:
${data.decisions.length > 0
  ? data.decisions.map((d, i) => `   [قرار ${i + 1}] ${d.title}\n   التفاصيل: ${d.description || 'معتمد'}\n   الحالة: ${d.status === 'APPROVED' ? 'معتمد' : d.status || 'معتمد'}\n`).join('\n')
  : '   - لم تسجل قرارات جديدة.'}

5. المهام والتكليفات التنفيذية:
${data.tasks.length > 0
  ? data.tasks.map((t, i) => `   [مهمة ${i + 1}] ${t.title} | المسؤول: ${t.assignee || 'غير محدد'} | الحالة: ${t.status === 'COMPLETED' ? 'مكتملة' : 'قيد التنفيذ'}`).join('\n')
  : '   - لا توجد مهام معلقة.'}

6. سجل المخاطر والتوصيات الاستباقية:
${data.risks.length > 0
  ? data.risks.map((r, i) => `   [خطر ${i + 1}] (${formatSeverityArabic(r.severity || 'HIGH').label}) ${r.title}\n   الوصف: ${r.description || ''}`).join('\n')
  : '   - لا توجد مخاطر مرصودة.'}

7. سجل اشتباه المخالفات والمراجعة:
${(data.violations || []).length > 0
  ? (data.violations || []).map((v, i) => `   [مخالفة ${i + 1}] ${v.title}\n   الحالة: ${v.status || 'SUSPECTED'} | المرجع: ${v.regulationRef || 'غير مرفق'}\n   الدليل: ${v.factualEvidence || 'غير مرفق'}`).join('\n')
  : '   - لا توجد اشتباهات مخالفات مسجلة.'}

8. نتائج وملاحظات لوحة الخبراء:
${(data.findings || []).length > 0
  ? (data.findings || []).map((f, i) => `   [نتيجة ${i + 1}] ${f.title} | النوع: ${f.findingType || 'OBSERVATION'} | الحالة: ${f.status || 'OPEN'}\n   الدليل: ${f.evidence || 'غير مرفق'}`).join('\n')
  : '   - لا توجد نتائج إضافية مسجلة.'}

=========================================
رئيس الجلسة: ${data.chairperson || '....................'}
مقرر الاجتماع: ${data.secretary || '....................'}
=========================================
`.trim();
}

/**
 * Creates section header paragraph for Word document
 */
function createDocSectionHeader(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 240, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' }
    },
    children: [
      new TextRun({
        text: title,
        bold: true,
        size: 26, // 13pt
        color: '1E3A8A',
        font: 'Traditional Arabic',
        rightToLeft: true
      })
    ]
  });
}

/**
 * Creates clean table cell for data tables
 */
function createDocCell(
  text: string,
  options: {
    isHeader?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    widthPercent?: number;
    bold?: boolean;
    color?: string;
    bgColor?: string;
    size?: number;
  } = {}
): TableCell {
  const isHeader = options.isHeader || false;
  const fontColor = options.color || (isHeader ? '0F172A' : '334155');
  const bgColor = options.bgColor || (isHeader ? 'F1F5F9' : undefined);

  return new TableCell({
    width: options.widthPercent ? { size: options.widthPercent, type: WidthType.PERCENTAGE } : undefined,
    shading: bgColor ? { fill: bgColor, type: ShadingType.CLEAR } : undefined,
    margins: { top: 120, bottom: 120, left: 130, right: 130 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
    },
    children: [
      new Paragraph({
        bidirectional: true,
        alignment: options.align || AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: text || '-',
            bold: isHeader || options.bold || false,
            color: fontColor,
            size: options.size || (isHeader ? 22 : 20),
            font: 'Segoe UI',
            rightToLeft: true
          })
        ]
      })
    ]
  });
}

/**
 * Exports Meeting Minutes into standard Microsoft Word (.docx) Office Open XML format
 */
export async function exportToWord(data: MeetingMinutesData, customFileName?: string): Promise<void> {
  try {
    const meetingTypeArabic = formatMeetingTypeArabic(data.meetingType);
    const meetingNum = data.meetingNumber || `MEET-${new Date().getFullYear()}-01`;

    // 1. Header Box Table
    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: data.orgName || 'المؤسسة',
                      bold: true,
                      size: 24,
                      color: '1E3A8A',
                      font: 'Traditional Arabic',
                      rightToLeft: true
                    }),
                    new TextRun({
                      text: '\nأمانة سر مجلس الإدارة',
                      size: 18,
                      color: '64748B',
                      font: 'Segoe UI',
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
                  children: [
                    new TextRun({
                      text: 'محضر اجتماع رسمي',
                      bold: true,
                      size: 32,
                      color: '1E3A8A',
                      font: 'Traditional Arabic',
                      rightToLeft: true
                    }),
                    new TextRun({
                      text: `\n${meetingTypeArabic}`,
                      bold: true,
                      size: 22,
                      color: '2563EB',
                      font: 'Segoe UI',
                      rightToLeft: true
                    })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.LEFT,
                  children: [
                    new TextRun({
                      text: `رقم المحضر: ${meetingNum}\nالتاريخ: ${data.meetingDate}`,
                      size: 18,
                      color: '64748B',
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
      spacing: { before: 100, after: 160 },
      border: {
        bottom: {
          style: BorderStyle.DOUBLE,
          size: 12,
          color: '2563EB'
        }
      },
      children: []
    });

    // 2. Metadata Grid Table
    const metaGridTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createDocCell('عنوان الاجتماع:', { isHeader: true, widthPercent: 18, color: '1E3A8A' }),
            createDocCell(data.meetingTitle, { widthPercent: 32, bold: true, color: '0F172A' }),
            createDocCell('مقر الانعقاد:', { isHeader: true, widthPercent: 18, color: '1E3A8A' }),
            createDocCell(data.location || 'المقر الرئيسي للمؤسسة', { widthPercent: 32 })
          ]
        }),
        new TableRow({
          children: [
            createDocCell('تاريخ ووقت الجلسة:', { isHeader: true, widthPercent: 18, color: '1E3A8A' }),
            createDocCell(`${data.meetingDate} ${data.meetingTime ? ` الساعة ${data.meetingTime}` : ''}`, { widthPercent: 32 }),
            createDocCell('نوع الجلسة:', { isHeader: true, widthPercent: 18, color: '1E3A8A' }),
            createDocCell(meetingTypeArabic, { widthPercent: 32 })
          ]
        }),
        new TableRow({
          children: [
            createDocCell('رئيس الجلسة:', { isHeader: true, widthPercent: 18, color: '1E3A8A' }),
            createDocCell(data.chairperson || 'رئيس مجلس الإدارة', { widthPercent: 32 }),
            createDocCell('أمين سر الجلسة:', { isHeader: true, widthPercent: 18, color: '1E3A8A' }),
            createDocCell(data.secretary || 'مقرر الاجتماع', { widthPercent: 32 })
          ]
        })
      ]
    });

    // 3. Attendees Table
    const attendeesRows = [
      new TableRow({
        tableHeader: true,
        children: [
          createDocCell('م', { isHeader: true, widthPercent: 8, align: AlignmentType.CENTER }),
          createDocCell('الاسم الكامل', { isHeader: true, widthPercent: 35 }),
          createDocCell('المسمى الوظيفي / الدور', { isHeader: true, widthPercent: 30 }),
          createDocCell('الإدارة / الجهة', { isHeader: true, widthPercent: 27 })
        ]
      })
    ];

    if (data.participants && data.participants.length > 0) {
      data.participants.forEach((p, idx) => {
        attendeesRows.push(
          new TableRow({
            children: [
              createDocCell(String(idx + 1), { align: AlignmentType.CENTER, widthPercent: 8, bold: true }),
              createDocCell(p.name, { widthPercent: 35, bold: true }),
              createDocCell(p.role || (p.isOrgEmployee ? 'موظف' : 'مشارك خارجي'), { widthPercent: 30 }),
              createDocCell(p.department || (p.isOrgEmployee ? data.orgName : 'خارجي'), { widthPercent: 27 })
            ]
          })
        );
      });
    } else {
      attendeesRows.push(
        new TableRow({
          children: [
            createDocCell('-', { align: AlignmentType.CENTER, widthPercent: 8 }),
            createDocCell('لم تسجل أسماء مشاركين بشكل تفصيلي.', { widthPercent: 92 })
          ]
        })
      );
    }

    const attendeesTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: attendeesRows
    });

    // 4. Agenda Box
    const agendaParagraph = new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100, after: 100 },
      shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
      border: {
        right: { style: BorderStyle.SINGLE, size: 18, color: '2563EB' },
        top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
      },
      children: [
        new TextRun({
          text: data.agenda || '1. استعراض البنود الاستراتيجية.\n2. متابعة الموقف التنفيذي للمشاريع.\n3. تقييم المخاطر واعتماد التوصيات.',
          size: 22,
          color: '1E293B',
          font: 'Segoe UI',
          rightToLeft: true
        })
      ]
    });

    // 5. Summary Box
    const summaryParagraph = new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100, after: 100, line: 360 },
      shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
      border: {
        right: { style: BorderStyle.SINGLE, size: 18, color: '10B981' },
        top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
      },
      children: [
        new TextRun({
          text: data.summary || 'ناقش السادة الأعضاء المحاور المطروحة بجدول الأعمال والوقوف على حالة المهام وسجل المخاطر، وتم الاتفاق على حزمة القرارات والتكليفات الموضحة في البنود التالية.',
          size: 22,
          color: '1E293B',
          font: 'Segoe UI',
          rightToLeft: true
        })
      ]
    });

    // 6. Decisions Table
    const decisionsRows = [
      new TableRow({
        tableHeader: true,
        children: [
          createDocCell('الرقم', { isHeader: true, widthPercent: 10, align: AlignmentType.CENTER }),
          createDocCell('القرار / التوصية الاستراتيجية', { isHeader: true, widthPercent: 38 }),
          createDocCell('التفاصيل ومبررات الاعتماد', { isHeader: true, widthPercent: 38 }),
          createDocCell('الحالة', { isHeader: true, widthPercent: 14, align: AlignmentType.CENTER })
        ]
      })
    ];

    if (data.decisions && data.decisions.length > 0) {
      data.decisions.forEach((d, idx) => {
        decisionsRows.push(
          new TableRow({
            children: [
              createDocCell(`د-${idx + 1}`, { align: AlignmentType.CENTER, widthPercent: 10, bold: true, color: '1E3A8A' }),
              createDocCell(d.title, { widthPercent: 38, bold: true, color: '1E3A8A' }),
              createDocCell(d.description || 'معتمد بالإجماع من قبل المجلس.', { widthPercent: 38 }),
              createDocCell(d.status === 'APPROVED' ? 'معتمد' : d.status || 'معتمد', {
                align: AlignmentType.CENTER,
                widthPercent: 14,
                bold: true,
                color: '15803D',
                bgColor: 'DCFCE7'
              })
            ]
          })
        );
      });
    } else {
      decisionsRows.push(
        new TableRow({
          children: [
            createDocCell('-', { align: AlignmentType.CENTER, widthPercent: 10 }),
            createDocCell('لا توجد قرارات جديدة مسجلة في هذا الاجتماع.', { widthPercent: 90 })
          ]
        })
      );
    }

    const decisionsTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: decisionsRows
    });

    // 7. Tasks Table
    const tasksRows = [
      new TableRow({
        tableHeader: true,
        children: [
          createDocCell('م', { isHeader: true, widthPercent: 8, align: AlignmentType.CENTER }),
          createDocCell('المهمة التنفيذية المكلفة', { isHeader: true, widthPercent: 42 }),
          createDocCell('المسؤول المكلف', { isHeader: true, widthPercent: 25 }),
          createDocCell('تاريخ الاستحقاق', { isHeader: true, widthPercent: 13, align: AlignmentType.CENTER }),
          createDocCell('الحالة', { isHeader: true, widthPercent: 12, align: AlignmentType.CENTER })
        ]
      })
    ];

    if (data.tasks && data.tasks.length > 0) {
      data.tasks.forEach((t, idx) => {
        const isComp = t.status === 'COMPLETED';
        tasksRows.push(
          new TableRow({
            children: [
              createDocCell(String(idx + 1), { align: AlignmentType.CENTER, widthPercent: 8, bold: true }),
              createDocCell(t.title, { widthPercent: 42, bold: true }),
              createDocCell(t.assignee || 'الإدارة المعنية', { widthPercent: 25 }),
              createDocCell(t.dueDate || 'أسبوعين', { widthPercent: 13, align: AlignmentType.CENTER }),
              createDocCell(isComp ? 'مكتملة' : 'قيد التنفيذ', {
                align: AlignmentType.CENTER,
                widthPercent: 12,
                bold: true,
                color: isComp ? '15803D' : 'B45309',
                bgColor: isComp ? 'DCFCE7' : 'FEF3C7'
              })
            ]
          })
        );
      });
    } else {
      tasksRows.push(
        new TableRow({
          children: [
            createDocCell('-', { align: AlignmentType.CENTER, widthPercent: 8 }),
            createDocCell('لا توجد مهام معلقة مسجلة.', { widthPercent: 92 })
          ]
        })
      );
    }

    const tasksTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tasksRows
    });

    // 8. Risks Table
    const risksRows = [
      new TableRow({
        tableHeader: true,
        children: [
          createDocCell('الرقم', { isHeader: true, widthPercent: 10, align: AlignmentType.CENTER }),
          createDocCell('الخطر المرصود', { isHeader: true, widthPercent: 35 }),
          createDocCell('التوصية والمعالجة الاستباقية', { isHeader: true, widthPercent: 40 }),
          createDocCell('مستوى الخطر', { isHeader: true, widthPercent: 15, align: AlignmentType.CENTER })
        ]
      })
    ];

    if (data.risks && data.risks.length > 0) {
      data.risks.forEach((r, idx) => {
        const sev = formatSeverityArabic(r.severity || 'HIGH');
        risksRows.push(
          new TableRow({
            children: [
              createDocCell(`خ-${idx + 1}`, { align: AlignmentType.CENTER, widthPercent: 10, bold: true, color: 'DC2626' }),
              createDocCell(r.title, { widthPercent: 35, bold: true, color: '991B1B' }),
              createDocCell(r.description || 'المتابعة المباشرة وتطبيق ضوابط التحوط اللازمة.', { widthPercent: 40 }),
              createDocCell(sev.label, {
                align: AlignmentType.CENTER,
                widthPercent: 15,
                bold: true,
                color: sev.hex === 'DC2626' ? '991B1B' : sev.hex === 'D97706' ? 'B45309' : '15803D',
                bgColor: sev.hex === 'DC2626' ? 'FEE2E2' : sev.hex === 'D97706' ? 'FEF3C7' : 'DCFCE7'
              })
            ]
          })
        );
      });
    } else {
      risksRows.push(
        new TableRow({
          children: [
            createDocCell('-', { align: AlignmentType.CENTER, widthPercent: 10 }),
            createDocCell('لم يتم رصد مخاطر حرجة خلال هذه الجلسة.', { widthPercent: 90 })
          ]
        })
      );
    }

    const risksTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: risksRows
    });

    const violationsRows = [
      new TableRow({ tableHeader: true, children: [
        createDocCell('العنوان', { isHeader: true, widthPercent: 30 }),
        createDocCell('الحالة', { isHeader: true, widthPercent: 15, align: AlignmentType.CENTER }),
        createDocCell('المرجع', { isHeader: true, widthPercent: 25 }),
        createDocCell('الدليل الواقعي', { isHeader: true, widthPercent: 30 }),
      ] }),
      ...((data.violations || []).length ? (data.violations || []).map((v) => new TableRow({ children: [
        createDocCell(v.title, { widthPercent: 30, bold: true }),
        createDocCell(v.status || 'SUSPECTED', { widthPercent: 15, align: AlignmentType.CENTER }),
        createDocCell(v.regulationRef || 'غير مرفق', { widthPercent: 25 }),
        createDocCell(v.factualEvidence || 'غير مرفق', { widthPercent: 30 }),
      ] })) : [new TableRow({ children: [createDocCell('لا توجد اشتباهات مخالفات مسجلة.', { widthPercent: 100 })] })]),
    ];
    const violationsTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: violationsRows });

    const findingsRows = [
      new TableRow({ tableHeader: true, children: [
        createDocCell('النتيجة', { isHeader: true, widthPercent: 40 }),
        createDocCell('النوع', { isHeader: true, widthPercent: 20 }),
        createDocCell('الدليل', { isHeader: true, widthPercent: 40 }),
      ] }),
      ...((data.findings || []).length ? (data.findings || []).map((f) => new TableRow({ children: [
        createDocCell(f.title, { widthPercent: 40, bold: true }),
        createDocCell(f.findingType || 'OBSERVATION', { widthPercent: 20 }),
        createDocCell(f.evidence || 'غير مرفق', { widthPercent: 40 }),
      ] })) : [new TableRow({ children: [createDocCell('لا توجد نتائج إضافية مسجلة.', { widthPercent: 100 })] })]),
    ];
    const findingsTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: findingsRows });

    // 9. Signatures Block
    const signaturesTable = new Table({
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
                  spacing: { before: 240 },
                  children: [
                    new TextRun({
                      text: 'مقرر وأمين سر الاجتماع',
                      bold: true,
                      size: 22,
                      color: '1E3A8A',
                      font: 'Traditional Arabic',
                      rightToLeft: true
                    }),
                    new TextRun({
                      text: `\n${data.secretary || 'أمين سر المجلس'}\n\n............................................\nالتوقيع والاعتماد`,
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
                  spacing: { before: 240 },
                  children: [
                    new TextRun({
                      text: 'رئيس الجلسة الموقر',
                      bold: true,
                      size: 22,
                      color: '1E3A8A',
                      font: 'Traditional Arabic',
                      rightToLeft: true
                    }),
                    new TextRun({
                      text: `\n${data.chairperson || 'رئيس مجلس الإدارة'}\n\n............................................\nالتوقيع والاعتماد`,
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
        top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
      },
      children: [
        new TextRun({
          text: `وثيقة رسمية صادرة من منصة الرقابة والحوكمة الذكية — تم استخراج المحضر بتاريخ ${new Date().toLocaleDateString('ar-SA')}`,
          color: '94A3B8',
          size: 16,
          font: 'Segoe UI',
          italics: true,
          rightToLeft: true
        })
      ]
    });

    // Build the Document
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(0.8),
                bottom: convertInchesToTwip(0.8),
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
                      text: `${data.orgName} | محضر اجتماع رسمي (${meetingNum})`,
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
            metaGridTable,
            createDocSectionHeader('أولاً: الحضور والمشاركون في الاجتماع'),
            attendeesTable,
            createDocSectionHeader('ثانياً: جدول الأعمال والمحاور المطروحة'),
            agendaParagraph,
            createDocSectionHeader('ثالثاً: ملخص المداولات والنقاشات'),
            summaryParagraph,
            createDocSectionHeader('رابعاً: القرارات الاستراتيجية والتوصيات المعتمدة'),
            decisionsTable,
            createDocSectionHeader('خامساً: خطة المهام والتكليفات التنفيذية'),
            tasksTable,
            createDocSectionHeader('سادساً: سجل المخاطر والتوجيهات الاستباقية'),
            risksTable,
            createDocSectionHeader('سابعاً: سجل اشتباه المخالفات والمراجعة'),
            violationsTable,
            createDocSectionHeader('ثامناً: نتائج وملاحظات لوحة الخبراء'),
            findingsTable,
            signaturesTable,
            footerNote
          ]
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = (data.meetingTitle || 'محضر_اجتماع').replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g, '_');
    a.download = customFileName || `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to generate .docx minutes:', err);
    alert('حدث خطأ أثناء تصدير محضر الاجتماع إلى Word (.docx).');
  }
}

export function printOrSavePdf(data: MeetingMinutesData) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة للطباعة أو حفظ ملف PDF.');
    return;
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${data.meetingTitle} - محضر اجتماع</title>
  <style>
    @media print {
      @page {
        size: A4 portrait;
        margin: 15mm 15mm 15mm 15mm;
      }
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
      tr, table {
        page-break-inside: avoid;
      }
    }
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Traditional Arabic', Tahoma, sans-serif;
      margin: 0;
      padding: 24px;
      color: #0f172a;
      background: #ffffff;
      direction: rtl;
      font-size: 13px;
      line-height: 1.6;
    }
    .print-bar {
      background: #1e293b;
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .print-btn {
      background: #2563eb;
      color: white;
      border: none;
      padding: 8px 18px;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
      font-size: 14px;
    }
    .print-btn:hover {
      background: #1d4ed8;
    }
    .header-box {
      border-bottom: 3px double #2563eb;
      padding-bottom: 16px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-box h1 {
      margin: 0;
      font-size: 22px;
      color: #1e3a8a;
      text-align: center;
    }
    .header-box p {
      margin: 4px 0 0 0;
      color: #475569;
      font-size: 13px;
      text-align: center;
    }
    .info-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 20px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      font-size: 12.5px;
    }
    .info-item {
      display: flex;
      gap: 8px;
    }
    .info-label {
      font-weight: bold;
      color: #475569;
      min-width: 100px;
    }
    .section-title {
      font-size: 15px;
      font-weight: bold;
      color: #1e40af;
      margin-top: 24px;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 2px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 8px 10px;
      text-align: right;
    }
    th {
      background-color: #f1f5f9;
      color: #1e293b;
      font-weight: 700;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
    }
    .badge-approved { background-color: #dcfce7; color: #15803d; }
    .badge-pending { background-color: #fef3c7; color: #b45309; }
    .badge-high { background-color: #fee2e2; color: #b91c1c; }
    .badge-medium { background-color: #fef3c7; color: #b45309; }
    .badge-low { background-color: #dcfce7; color: #15803d; }
    .content-box {
      background: #fafafa;
      border: 1px solid #e2e8f0;
      padding: 12px;
      border-radius: 6px;
      white-space: pre-wrap;
      line-height: 1.7;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      margin-top: 40px;
      gap: 20px;
      text-align: center;
    }
    .sig-box {
      padding: 10px;
    }
    .sig-line {
      border-top: 1px dashed #94a3b8;
      margin-top: 45px;
      padding-top: 6px;
      font-weight: bold;
      color: #334155;
    }
    .footer-bar {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 11px;
    }
  </style>
</head>
<body>

  <div class="print-bar no-print">
    <div><strong>جاهز للطباعة أو الحفظ كملف PDF</strong> — انقر على زر الطباعة أدناه.</div>
    <button class="print-btn" onclick="window.print()">🖨️ طباعة / حفظ كـ PDF</button>
  </div>

  <div class="header-box">
    <div style="text-align: right; width: 30%;">
      <div style="font-size: 15px; font-weight: bold; color: #1e3a8a;">${data.orgName}</div>
      <div style="font-size: 11px; color: #64748b;">أمانة سر مجلس الإدارة</div>
    </div>
    <div style="text-align: center; width: 40%;">
      <h1>محضر اجتماع رسمي</h1>
      <p>${formatMeetingTypeArabic(data.meetingType)}</p>
    </div>
    <div style="text-align: left; width: 30%;">
      <div style="font-size: 11px; color: #475569;">رقم المحضر: <strong>${data.meetingNumber || 'MEET-' + new Date().getFullYear() + '-01'}</strong></div>
      <div style="font-size: 11px; color: #475569;">التاريخ: <strong>${data.meetingDate}</strong></div>
    </div>
  </div>

  <div class="info-card">
    <div class="info-item">
      <span class="info-label">عنوان الاجتماع:</span>
      <span style="font-weight: bold;">${data.meetingTitle}</span>
    </div>
    <div class="info-item">
      <span class="info-label">نوع الاجتماع:</span>
      <span>${formatMeetingTypeArabic(data.meetingType)}</span>
    </div>
    <div class="info-item">
      <span class="info-label">تاريخ ووقت الانعقاد:</span>
      <span>${data.meetingDate} ${data.meetingTime ? ` الساعة ${data.meetingTime}` : ''}</span>
    </div>
    <div class="info-item">
      <span class="info-label">مقر الانعقاد:</span>
      <span>${data.location || 'المقر الرئيسي للمؤسسة'}</span>
    </div>
    <div class="info-item">
      <span class="info-label">رئيس الجلسة:</span>
      <span>${data.chairperson || 'رئيس مجلس الإدارة'}</span>
    </div>
    <div class="info-item">
      <span class="info-label">مقرر الاجتماع:</span>
      <span>${data.secretary || 'مقرر الجلسة'}</span>
    </div>
  </div>

  <div class="section-title">1. الحضور والمشاركون</div>
  <table>
    <thead>
      <tr>
        <th style="width: 8%;">م</th>
        <th style="width: 35%;">الاسم الكامل</th>
        <th style="width: 32%;">المسمى الوظيفي / الدور</th>
        <th style="width: 25%;">الإدارة / الجهة</th>
      </tr>
    </thead>
    <tbody>
      ${data.participants.length > 0 ? data.participants.map((p, idx) => `
        <tr>
          <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
          <td style="font-weight: bold;">${p.name || 'عضو'}</td>
          <td>${p.role || (p.isOrgEmployee ? 'موظف' : 'مشارك')}</td>
          <td>${p.department || (p.isOrgEmployee ? data.orgName : 'خارجي')}</td>
        </tr>
      `).join('') : `
        <tr><td colspan="4" style="text-align: center; color: #64748b;">لم تسجل أسماء مشاركين.</td></tr>
      `}
    </tbody>
  </table>

  <div class="section-title">2. جدول الأعمال والمحاور المطروحة</div>
  <div class="content-box">${data.agenda || '1. استعراض البنود الاستراتيجية.\n2. متابعة الموقف التنفيذي للمهام القائمة.\n3. تقييم المخاطر واتخاذ القرارات اللازمة.'}</div>

  <div class="section-title">3. ملخص المداولات والنقاشات</div>
  <div class="content-box">${data.summary || 'تم التباحث بين الأعضاء حول البنود المدرجة، وتم التوافق على القرارات والتكليفات الموضحة أدناه.'}</div>

  <div class="section-title">4. القرارات الاستراتيجية المعتمدة</div>
  <table>
    <thead>
      <tr>
        <th style="width: 10%;">الرقم</th>
        <th style="width: 35%;">عنوان القرار</th>
        <th style="width: 40%;">التفاصيل والمبررات</th>
        <th style="width: 15%; text-align: center;">الحالة</th>
      </tr>
    </thead>
    <tbody>
      ${data.decisions.length > 0 ? data.decisions.map((d, idx) => `
        <tr>
          <td style="text-align: center; font-weight: bold;">د-${idx + 1}</td>
          <td style="font-weight: bold; color: #1e3a8a;">${d.title}</td>
          <td>${d.description || 'معتمد بالإجماع.'}</td>
          <td style="text-align: center;">
            <span class="badge badge-approved">${d.status === 'APPROVED' ? 'معتمد' : d.status || 'معتمد'}</span>
          </td>
        </tr>
      `).join('') : `
        <tr><td colspan="4" style="text-align: center; color: #64748b;">لا توجد قرارات جديدة مسجلة.</td></tr>
      `}
    </tbody>
  </table>

  <div class="section-title">5. خطة المهام والتكليفات التنفيذية</div>
  <table>
    <thead>
      <tr>
        <th style="width: 8%;">م</th>
        <th style="width: 42%;">المهمة التنفيذية</th>
        <th style="width: 25%;">المسؤول المكلف</th>
        <th style="width: 15%; text-align: center;">تاريخ الاستحقاق</th>
        <th style="width: 10%; text-align: center;">الحالة</th>
      </tr>
    </thead>
    <tbody>
      ${data.tasks.length > 0 ? data.tasks.map((t, idx) => `
        <tr>
          <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
          <td style="font-weight: 500;">${t.title}</td>
          <td style="font-weight: bold; color: #334155;">${t.assignee || 'الإدارة المعنية'}</td>
          <td style="text-align: center; font-size: 11px;">${t.dueDate || 'أسبوعين'}</td>
          <td style="text-align: center;">
            <span class="badge ${t.status === 'COMPLETED' ? 'badge-approved' : 'badge-pending'}">
              ${t.status === 'COMPLETED' ? 'مكتملة' : 'قيد التنفيذ'}
            </span>
          </td>
        </tr>
      `).join('') : `
        <tr><td colspan="5" style="text-align: center; color: #64748b;">لا توجد تكليفات تنفيذية مسجلة.</td></tr>
      `}
    </tbody>
  </table>

  <div class="section-title">6. سجل المخاطر والتوجيهات الاستباقية</div>
  <table>
    <thead>
      <tr>
        <th style="width: 10%;">الرقم</th>
        <th style="width: 35%;">الخطر المرصود</th>
        <th style="width: 40%;">التوصية والمعالجة الاستباقية</th>
        <th style="width: 15%; text-align: center;">مستوى الخطر</th>
      </tr>
    </thead>
    <tbody>
      ${data.risks.length > 0 ? data.risks.map((r, idx) => {
        const sev = formatSeverityArabic(r.severity || 'HIGH');
        return `
        <tr>
          <td style="text-align: center; font-weight: bold;">خ-${idx + 1}</td>
          <td style="font-weight: bold; color: #991b1b;">${r.title}</td>
          <td>${r.description || 'المتابعة المباشرة وضبط التحوط.'}</td>
          <td style="text-align: center;">
            <span class="badge ${r.severity === 'HIGH' ? 'badge-high' : r.severity === 'MEDIUM' ? 'badge-medium' : 'badge-low'}">
              ${sev.label}
            </span>
          </td>
        </tr>
        `;
      }).join('') : `
        <tr><td colspan="4" style="text-align: center; color: #64748b;">لم ترصد مخاطر حرجة.</td></tr>
      `}
    </tbody>
  </table>

  <div class="section-title">7. سجل اشتباه المخالفات والمراجعة</div>
  <table>
    <thead><tr><th>العنوان</th><th>الحالة</th><th>المرجع</th><th>الدليل الواقعي</th></tr></thead>
    <tbody>
      ${(data.violations || []).length ? (data.violations || []).map((v) => `<tr><td style="font-weight:bold">${v.title}</td><td>${v.status || 'SUSPECTED'}</td><td>${v.regulationRef || 'غير مرفق'}</td><td>${v.factualEvidence || 'غير مرفق'}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:#64748b">لا توجد اشتباهات مخالفات مسجلة.</td></tr>'}
    </tbody>
  </table>

  <div class="section-title">8. نتائج وملاحظات لوحة الخبراء</div>
  <table>
    <thead><tr><th>النتيجة</th><th>النوع</th><th>الدليل</th></tr></thead>
    <tbody>
      ${(data.findings || []).length ? (data.findings || []).map((f) => `<tr><td style="font-weight:bold">${f.title}</td><td>${f.findingType || 'OBSERVATION'}</td><td>${f.evidence || 'غير مرفق'}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:#64748b">لا توجد نتائج إضافية مسجلة.</td></tr>'}
    </tbody>
  </table>

  <div class="sig-grid">
    <div class="sig-box">
      <div style="font-size: 13px; font-weight: bold; color: #1e3a8a;">مقرر وأمين سر الاجتماع</div>
      <div style="font-size: 12px; color: #475569; margin-top: 4px;">${data.secretary || 'أمين سر المجلس'}</div>
      <div class="sig-line">التوقيع والاعتماد</div>
    </div>
    <div class="sig-box">
      <div style="font-size: 13px; font-weight: bold; color: #1e3a8a;">رئيس الجلسة الموقر</div>
      <div style="font-size: 12px; color: #475569; margin-top: 4px;">${data.chairperson || 'رئيس مجلس الإدارة'}</div>
      <div class="sig-line">التوقيع والاعتماد</div>
    </div>
  </div>

  <div class="footer-bar">
    وثيقة رسمية صادرة من نظام المستشار الإداري الذكي — طُبعت بتاريخ ${new Date().toLocaleDateString('ar-SA')}
  </div>

</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
