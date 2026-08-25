export type ThinkingStyle = 'analytical' | 'visionary' | 'operational' | 'compliance';
export type RiskStance = 'conservative' | 'balanced' | 'aggressive';

export interface MemberProfile {
  id?: string;
  name: string;
  role?: string;
  department?: string;
  isOrgEmployee?: boolean;
  thinkingStyle?: ThinkingStyle;
  riskStance?: RiskStance;
  corePriorities?: string; // اهتمامات وأولويات جوهرية
  priorities?: string;
  persuasionTrigger?: string; // أسلوب الإقناع واللغة المفضلة
  persuasionKey?: string;
  biasesOrConcerns?: string; // تحفظات ومخاوف متكررة
  concerns?: string;
}

export const THINKING_STYLES: Record<ThinkingStyle, {
  label: string;
  title: string;
  iconName: string;
  color: string;
  badgeBg: string;
  description: string;
  persuasionAdvice: string;
}> = {
  analytical: {
    label: 'تحليلي / رقمي',
    title: 'محلل بيانات وأرقام',
    iconName: 'BarChart2',
    color: 'text-cyan-400 border-cyan-500/30 bg-cyan-950/40',
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    description: 'يركز على الأرقام، النسب، الإحصائيات، ولا يقتنع إلا ببيانات ودراسات جدوى مثبتة.',
    persuasionAdvice: 'قدّم له أرقاماً دقيقة، نسب عائد على الاستثمار (ROI)، ومقارنات إحصائية موثقة.'
  },
  visionary: {
    label: 'استراتيجي / رؤيوي',
    title: 'قائد استراتيجي',
    iconName: 'Compass',
    color: 'text-purple-400 border-purple-500/30 bg-purple-950/40',
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    description: 'يركز على الصورة الكبرى، الفرص المستقبلية، التوسع، والأثر بعيد المدى للمؤسسة.',
    persuasionAdvice: 'خاطبه بالرؤية المستقبلية، التميز التنافسي، والأثر الاستراتيجي المستدام.'
  },
  operational: {
    label: 'تنفيذي / تشغيلي',
    title: 'مدير تنفيذي عملي',
    iconName: 'Cpu',
    color: 'text-amber-400 border-amber-500/30 bg-amber-950/40',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    description: 'يركز على آلية التنفيذ، جاهزية الكوادر، سهولة التطبيق، وسرعة وسلاسة الإنجاز.',
    persuasionAdvice: 'وضّح له خطة العمل التنفيذية (Milestones)، المسؤوليات الواضحة، والجدول الزمني.'
  },
  compliance: {
    label: 'رقابي / حوكمة وامتثال',
    title: 'مستشار رقابي وحوكمة',
    iconName: 'ShieldAlert',
    color: 'text-rose-400 border-rose-500/30 bg-rose-950/40',
    badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    description: 'يركز على المواد القانونية واللوائح وضبط المخاطر والنزاهة والشفافية التامة.',
    persuasionAdvice: 'استند للمواد القانونية واللوائح الداخلية، وأبرز كيف يحمي القرار المؤسسة من المخاطر.'
  }
};

export const RISK_STANCES: Record<RiskStance, {
  label: string;
  badgeBg: string;
  description: string;
}> = {
  conservative: {
    label: 'متحفظ جداً (Zero/Low Risk)',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    description: 'يفضل ضبط الميزانيات وتجنب أي مخاطرة أو توسع غير مضمون.'
  },
  balanced: {
    label: 'متوازن (Calculated Risk)',
    badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    description: 'يزن بين العوائد المتوقعة والمخاطر المحسوبة.'
  },
  aggressive: {
    label: 'مبادر / جريء (High Growth)',
    badgeBg: 'bg-red-500/20 text-red-300 border-red-500/30',
    description: 'يدعم التغييرات الجذرية والمبادرات الجريئة حتى مع وجود مخاطر.'
  }
};
