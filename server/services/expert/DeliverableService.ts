export interface ExpertDeliverableRequest {
  title: string;
  description?: string;
  deliverableType?: string;
  orgName?: string;
  customInstructions?: string;
  approvedKnowledge?: string;
}

export type ExpertTextGenerator = (prompt: string) => Promise<string>;

const TYPE_LABELS: Record<string, string> = {
  SWOT_ANALYSIS: 'تحليل SWOT',
  PROCEDURE_MANUAL: 'دليل إجراءات تشغيلي',
  POLICY: 'مسودة سياسة أو لائحة حوكمة',
  REPORT: 'تقرير رقابي وتحليلي',
  CHECKLIST: 'قائمة تدقيق قابلة للتنفيذ',
  PLAN: 'خطة عمل تنفيذية',
  MEETING_MINUTES: 'مسودة محضر اجتماع',
  DECISION_DRAFT: 'مسودة قرار',
};

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function createExpertDeliverable(
  request: ExpertDeliverableRequest,
  generate: ExpertTextGenerator,
): Promise<string> {
  const title = clean(request.title, 240);
  if (!title) throw new Error('DELIVERABLE_TITLE_REQUIRED');
  const type = clean(request.deliverableType, 80) || 'REPORT';
  const typeLabel = TYPE_LABELS[type] || 'مخرج مهني';
  const approvedKnowledge = clean(request.approvedKnowledge, 16_000);

  const prompt = `أنت مستشار مؤسسي عربي دقيق. أعد ${typeLabel} بعنوان: ${title}.

المؤسسة: ${clean(request.orgName, 240) || 'المؤسسة'}
النطاق: ${clean(request.description, 5000) || 'كما ورد في التكليف'}
تعليمات خاصة: ${clean(request.customInstructions, 4000) || 'لا توجد'}

المصادر المؤسسية المعتمدة المتاحة:
${approvedKnowledge || '[لا توجد مصادر مؤسسية مسترجعة لهذا التكليف]'}

قواعد إلزامية:
1. اكتب "مسودة للمراجعة والاعتماد"؛ لا تصف المخرج بأنه معتمد أو نافذ.
2. لا تخترع مادة أو قانوناً أو رقماً أو واقعة أو نتيجة فحص أو ميزانية أو اسم مسؤول.
3. لا تنسب ادعاءً للائحة إلا إذا ورد نصه في المصادر أعلاه، واذكر المرجع المتاح معه.
4. ضع [يحتاج استكمال] أمام كل معلومة لازمة لم تُذكر.
5. افصل بوضوح بين الحقائق، والتحليل المهني، والتوصيات المقترحة.
6. اجعل المخرج عملياً: نطاق، مسؤوليات، خطوات، مخاطر، ضوابط، مؤشرات، ومصفوفة متابعة بحسب نوعه.
7. أعد Markdown عربي منسقاً وجاهزاً للمراجعة البشرية.`;

  try {
    const generated = clean(await generate(prompt), 120_000);
    if (generated) return generated;
  } catch (error) {
    console.warn('[DeliverableService] AI generation unavailable:', error);
  }

  const date = new Date().toISOString().slice(0, 10);
  return `# ${typeLabel}: ${title}

> **الحالة:** مسودة للمراجعة والاعتماد  
> **المؤسسة:** ${clean(request.orgName, 240) || '[يحتاج استكمال]'}  
> **التاريخ:** ${date}

## 1. الهدف والنطاق

${clean(request.description, 5000) || '[يحتاج استكمال: وصف الهدف والنطاق]'}

## 2. الحقائق والمصادر

${approvedKnowledge ? 'تعذر توليد الصياغة الآلية؛ راجع المصادر المؤسسية المرتبطة بالمهمة داخل قاعدة المعرفة.' : '[يحتاج استكمال: لا توجد مصادر مؤسسية مسترجعة]'}

## 3. المسؤوليات

- المسؤول التنفيذي: [يحتاج استكمال]
- جهة الاعتماد: [يحتاج استكمال]
- الجهات المستشارة: [يحتاج استكمال]

## 4. خطوات التنفيذ

1. [يحتاج استكمال]
2. [يحتاج استكمال]
3. [يحتاج استكمال]

## 5. المخاطر والضوابط

| الخطر | الاحتمال | الأثر | الضابط | المسؤول |
|---|---|---|---|---|
| [يحتاج استكمال] | [يحتاج استكمال] | [يحتاج استكمال] | [يحتاج استكمال] | [يحتاج استكمال] |

## 6. مؤشرات الإنجاز

- [يحتاج استكمال]

## 7. المراجعة والاعتماد

هذه مسودة غير معتمدة وتتطلب مراجعة صاحب الصلاحية والتحقق من جميع المراجع قبل التنفيذ.`;
}
