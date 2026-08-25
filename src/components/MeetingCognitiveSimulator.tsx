import React from 'react';
import { 
  Users, Brain, Compass, Cpu, BarChart2, ShieldAlert, Sparkles, 
  AlertTriangle, CheckCircle2, MessageSquare, ArrowLeft, Target, 
  Lightbulb, Scale, ShieldCheck
} from 'lucide-react';
import { MemberProfile, ThinkingStyle, THINKING_STYLES, RISK_STANCES } from '../types';

interface MeetingCognitiveSimulatorProps {
  participants?: MemberProfile[];
  members?: MemberProfile[];
  agenda?: string;
  agendaTopic?: string;
  meetingTitle?: string;
  onClose?: () => void;
  onAskAIAboutMember?: (memberName: string, query: string) => void;
}

export default function MeetingCognitiveSimulator({
  participants,
  members,
  agenda,
  agendaTopic,
  meetingTitle,
  onClose,
  onAskAIAboutMember
}: MeetingCognitiveSimulatorProps) {
  const actualParticipants = participants || members || [];
  const actualAgenda = agenda || agendaTopic || '';
  const actualTitle = meetingTitle || '';

  if (!actualParticipants || actualParticipants.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400 space-y-2">
        <div className="text-sm font-semibold text-slate-300">لم يتم تحديد أعضاء للاجتماع بعد</div>
        <p>يرجى اختيار المشاركين وتحديد ملفاتهم السلوكية لعرض محاكي التوافق ومصفوفة توازن الفريق.</p>
        {onClose && (
          <button 
            type="button"
            onClick={onClose}
            className="mt-3 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
          >
            إغلاق
          </button>
        )}
      </div>
    );
  }

  // Count styles
  const styleCounts: Record<ThinkingStyle, number> = {
    analytical: 0,
    visionary: 0,
    operational: 0,
    compliance: 0
  };

  let conservativeCount = 0;
  let aggressiveCount = 0;
  let balancedCount = 0;

  actualParticipants.forEach(p => {
    const s = (p.thinkingStyle || 'analytical') as ThinkingStyle;
    styleCounts[s] = (styleCounts[s] || 0) + 1;

    const r = p.riskStance || 'balanced';
    if (r === 'conservative') conservativeCount++;
    else if (r === 'aggressive') aggressiveCount++;
    else balancedCount++;
  });

  const total = actualParticipants.length;

  // Analysis of Friction & Consensus
  const hasCompliance = styleCounts.compliance > 0;
  const hasVisionary = styleCounts.visionary > 0;
  const hasAnalytical = styleCounts.analytical > 0;
  const hasOperational = styleCounts.operational > 0;

  // Potential Friction Scenarios
  const frictionPoints: Array<{ title: string; risk: string; advice: string }> = [];

  if (styleCounts.visionary > 0 && styleCounts.compliance > 0) {
    frictionPoints.push({
      title: 'جدل متوقع: الطموح الاستراتيجي vs القيود الرقابية',
      risk: 'قد يرى الأعضاء الرؤيويون أن الشروط الرقابية تعيق السرعة، بينما يرى مسؤولو الحوكمة أن تجاوز الضوابط يشكل خطراً كبيراً.',
      advice: 'ابدأ بتأكيد الضوابط القانونية (مادة 43/44) كإطار حماية للمشروع الاستراتيجي، وليس كمعطل.'
    });
  }

  if (aggressiveCount > 0 && conservativeCount > 0) {
    frictionPoints.push({
      title: 'نقاش مالي حاد: التوسع الجريء vs التحفظ المالي',
      risk: 'تباين حاد بين التوجه لضخ الميزانيات وتخفيض التكاليف.',
      advice: 'اقترح تنفيذ المشروع على مراحل تجريبية (Phased Rollout) مع ربط كل مرحلة بنسبة إنجاز وعائد مثبت.'
    });
  }

  if (styleCounts.visionary > 0 && styleCounts.operational > 0 && !hasAnalytical) {
    frictionPoints.push({
      title: 'فجوة في القياس: الرؤية والتنفيذ بدون مؤشرات دقيقة',
      risk: 'قد يوافق الجميع على الفكرة والبدء بالتنفيذ دون تحديد معايير قياس رقمية كافية (KPIs).',
      advice: 'اطلب صياغة 3 مؤشرات قياس أداء رقمية محددة قبل رفع الجلسة.'
    });
  }

  // If balanced
  if (frictionPoints.length === 0) {
    frictionPoints.push({
      title: 'توافق عام متوقع مع الحاجة لإثراء النقاش',
      risk: 'توجهات الأعضاء متقاربة مما قد يقلل من النقد البناء وتحدي الافتراضات.',
      advice: 'شجّع الأعضاء على طرح أسئلة استقصائية حول السيناريو الأسوأ وتحديات التنفيذ.'
    });
  }

  return (
    <div className="bg-slate-900 border border-indigo-500/20 rounded-3xl p-5 md:p-6 space-y-6 shadow-xl" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-2xl shadow-lg shadow-indigo-600/30">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              محاكي التوافق السلوكي ومصفوفة توازن الفريق
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                AI Cognitive Matrix
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              تحليل استباقي لتوزيع عقول الأعضاء، نقاط الاحتكاك المحتملة، واستراتيجيات الإقناع
            </p>
          </div>
        </div>
      </div>

      {/* Diversity Distribution Bars */}
      <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Scale className="w-4 h-4 text-indigo-400" /> مؤشر التنوع الفكري للأعضاء المشاركين ({total} أعضاء)
          </span>
          <span className="text-[11px] text-indigo-300">
            {hasCompliance && hasVisionary && hasAnalytical && hasOperational ? '🔥 تنوع قيادي متكامل وممتاز' : '💡 تشكيلة جيدة'}
          </span>
        </div>

        {/* Progress Bar of Styles */}
        <div className="w-full h-3.5 bg-slate-800 rounded-full overflow-hidden flex gap-0.5 p-0.5">
          {styleCounts.analytical > 0 && (
            <div 
              style={{ width: `${(styleCounts.analytical / total) * 100}%` }} 
              className="bg-cyan-500 h-full rounded-sm" 
              title={`تحليلي: ${styleCounts.analytical}`}
            />
          )}
          {styleCounts.visionary > 0 && (
            <div 
              style={{ width: `${(styleCounts.visionary / total) * 100}%` }} 
              className="bg-purple-500 h-full rounded-sm" 
              title={`استراتيجي: ${styleCounts.visionary}`}
            />
          )}
          {styleCounts.operational > 0 && (
            <div 
              style={{ width: `${(styleCounts.operational / total) * 100}%` }} 
              className="bg-amber-500 h-full rounded-sm" 
              title={`تنفيذي: ${styleCounts.operational}`}
            />
          )}
          {styleCounts.compliance > 0 && (
            <div 
              style={{ width: `${(styleCounts.compliance / total) * 100}%` }} 
              className="bg-rose-500 h-full rounded-sm" 
              title={`رقابي وامتثال: ${styleCounts.compliance}`}
            />
          )}
        </div>

        {/* Legend Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
            <span>تحليلي ({styleCounts.analytical})</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <div className="w-2.5 h-2.5 rounded-full bg-purple-400"></div>
            <span>استراتيجي ({styleCounts.visionary})</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
            <span>تنفيذي ({styleCounts.operational})</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-400"></div>
            <span>رقابي ({styleCounts.compliance})</span>
          </div>
        </div>
      </div>

      {/* Predicted Friction & Consensus Box */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" /> نقاط الاحتكاك والنقاش الساخن المتوقعة في الجلسة:
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {frictionPoints.map((item, idx) => (
            <div key={idx} className="bg-slate-800/60 border border-slate-700/80 p-3.5 rounded-2xl space-y-2">
              <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                {item.title}
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {item.risk}
              </p>
              <div className="p-2 bg-indigo-950/40 border border-indigo-500/20 rounded-xl text-[11px] text-indigo-300 flex items-start gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span><strong className="text-white">الصيغة التوفيقية لرئيس الجلسة:</strong> {item.advice}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Member Persuasion Matrix Cards */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" /> مفاتيح الإقناع والتفاعل الفردي مع كل عضو:
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {actualParticipants.map((member, idx) => {
            const style = THINKING_STYLES[member.thinkingStyle || 'analytical'];
            const risk = RISK_STANCES[member.riskStance || 'balanced'];
            return (
              <div 
                key={idx} 
                className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3.5 flex flex-col justify-between space-y-2.5 hover:border-indigo-500/40 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white">{member.name}</div>
                      <div className="text-[10px] text-slate-400">{member.role || 'عضو مجلس / مشارك'}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${style.badgeBg}`}>
                      {style.label}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="text-slate-400">
                      <span className="text-slate-300 font-medium">الاهتمام الرئيسي: </span>
                      {member.corePriorities || style.description.slice(0, 45) + '...'}
                    </div>
                    <div className="text-indigo-300 bg-indigo-950/30 p-1.5 rounded-lg border border-indigo-500/20 text-[10px] mt-1.5">
                      <strong>🔑 مفتاح إقناعه:</strong> {member.persuasionTrigger || style.persuasionAdvice}
                    </div>
                  </div>
                </div>

                {onAskAIAboutMember && (
                  <button
                    type="button"
                    onClick={() => onAskAIAboutMember(member.name, `كيف أقنع ${member.name} (${member.role || 'عضو'}) بالموافقة على قرارات الاجتماع وتجنب أي تحفظات لديه؟`)}
                    className="w-full py-1.5 px-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                  >
                    <MessageSquare className="w-3 h-3" />
                    استشر الذكاء لإقناع {member.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
