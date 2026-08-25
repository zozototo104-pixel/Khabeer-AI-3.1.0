import React, { useState } from 'react';
import { 
  User, Shield, BarChart2, Compass, Cpu, ShieldAlert, Sparkles, 
  Brain, HelpCircle, ChevronDown, ChevronUp, Check, AlertCircle, 
  Flame, Target, ArrowRight
} from 'lucide-react';
import { MemberProfile, ThinkingStyle, RiskStance, THINKING_STYLES, RISK_STANCES } from '../types';

interface MemberPersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberProfile;
  onSave: (updated: MemberProfile) => void;
}

export default function MemberPersonaModal({
  isOpen,
  onClose,
  member,
  onSave
}: MemberPersonaModalProps) {
  const [profile, setProfile] = useState<MemberProfile>({
    ...member,
    thinkingStyle: member.thinkingStyle || 'analytical',
    riskStance: member.riskStance || 'balanced',
    corePriorities: member.corePriorities || '',
    persuasionTrigger: member.persuasionTrigger || '',
    biasesOrConcerns: member.biasesOrConcerns || ''
  });

  if (!isOpen) return null;

  const currentThinking = THINKING_STYLES[profile.thinkingStyle || 'analytical'];

  const quickPresets = [
    {
      name: 'رئيس المجلس / مستشار حوكمة',
      thinking: 'compliance' as ThinkingStyle,
      risk: 'conservative' as RiskStance,
      priorities: 'الحوكمة الرشيدة، الالتزام باللوائح والأنظمة، الشفافية',
      trigger: 'الاستشهاد بالمواد القانونية وحماية السمعة المؤسسية'
    },
    {
      name: 'مدير مالي / خبير تدقيق',
      thinking: 'analytical' as ThinkingStyle,
      risk: 'conservative' as RiskStance,
      priorities: 'ضبط النفقات، ترشيد الهدر المالي، العائد المالي المؤكد',
      trigger: 'تقديم جداول أرقام مفصلة، مؤشرات ROI، وتوقعات تدفق نقدي'
    },
    {
      name: 'مدير تنفيذي / مدير مشاريع',
      thinking: 'operational' as ThinkingStyle,
      risk: 'balanced' as RiskStance,
      priorities: 'جاهزية الكوادر، سهولة التنفيذ، سرعة التسليم',
      trigger: 'عرض خطة طريق عملية ومسؤوليات واضحة ومواعيد إنجاز'
    },
    {
      name: 'قائد استراتيجي وتطوير',
      thinking: 'visionary' as ThinkingStyle,
      risk: 'aggressive' as RiskStance,
      priorities: 'الابتكار، التوسع، الأثر طويل المدى، الريادة',
      trigger: 'التركيز على الفرص المستقبلية وبناء الميزة التنافسية'
    }
  ];

  return (
    <div 
      className="fixed inset-0 z-[105] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      dir="rtl"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700/80 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-2xl">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                الملف السلوكي والفكري: <span className="text-indigo-300">{profile.name || 'العضو'}</span>
              </h2>
              <p className="text-xs text-slate-400">
                توجيه الذكاء الاصطناعي لفهم نمط تفكير العضو، أولوياته، وتفضيلاته لإقناعه وتوقع ردود أفعاله
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition-all"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Quick Presets */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> نماذج شخصيات استرشادية سريعة:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {quickPresets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setProfile(prev => ({
                      ...prev,
                      thinkingStyle: preset.thinking,
                      riskStance: preset.risk,
                      corePriorities: preset.priorities,
                      persuasionTrigger: preset.trigger
                    }));
                  }}
                  className="p-2.5 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 hover:border-indigo-500/40 rounded-xl text-right transition-all group cursor-pointer"
                >
                  <div className="text-[11px] font-bold text-slate-200 group-hover:text-indigo-300 truncate">
                    {preset.name}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {THINKING_STYLES[preset.thinking].label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 1. Thinking Style Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-indigo-400" /> 1. نمط التفكير والقيادة الرئيسي (Cognitive Style)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(THINKING_STYLES) as ThinkingStyle[]).map((styleKey) => {
                const style = THINKING_STYLES[styleKey];
                const isSelected = profile.thinkingStyle === styleKey;
                return (
                  <div
                    key={styleKey}
                    onClick={() => setProfile(prev => ({ ...prev, thinkingStyle: styleKey }))}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? `${style.color} ring-2 ring-indigo-500/40 shadow-lg shadow-indigo-950/50`
                        : 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {styleKey === 'analytical' && <BarChart2 className="w-4 h-4 text-cyan-400" />}
                        {styleKey === 'visionary' && <Compass className="w-4 h-4 text-purple-400" />}
                        {styleKey === 'operational' && <Cpu className="w-4 h-4 text-amber-400" />}
                        {styleKey === 'compliance' && <ShieldAlert className="w-4 h-4 text-rose-400" />}
                        <span className="text-xs font-bold">{style.label}</span>
                      </div>
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px]">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {style.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Risk & Financial Stance */}
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" /> 2. التوجه نحو المخاطر والميزانيات (Risk Stance)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(Object.keys(RISK_STANCES) as RiskStance[]).map((riskKey) => {
                const risk = RISK_STANCES[riskKey];
                const isSelected = profile.riskStance === riskKey;
                return (
                  <button
                    key={riskKey}
                    type="button"
                    onClick={() => setProfile(prev => ({ ...prev, riskStance: riskKey }))}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                      isSelected
                        ? `${risk.badgeBg} ring-2 ring-blue-500/50 shadow-md font-bold`
                        : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <div className="text-xs font-bold mb-1">{risk.label}</div>
                    <div className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{risk.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Core Priorities & Persuasion */}
          <div className="space-y-4 pt-2 border-t border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-emerald-400" /> الأولويات والاهتمامات الجوهرية
              </label>
              <input
                type="text"
                value={profile.corePriorities || ''}
                onChange={(e) => setProfile(prev => ({ ...prev, corePriorities: e.target.value }))}
                placeholder="مثال: يركز بشدة على رضا المستفيدين، عدم المساس برواتب الكادر، وضمان الاستدامة"
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-indigo-400" /> المفتاح الأفضل للإقناع (Persuasion Trigger)
              </label>
              <input
                type="text"
                value={profile.persuasionTrigger || ''}
                onChange={(e) => setProfile(prev => ({ ...prev, persuasionTrigger: e.target.value }))}
                placeholder={`نصيحة تلقائية: ${currentThinking.persuasionAdvice}`}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <p className="text-[10px] text-indigo-300/80 mt-1">
                💡 نصيحة مقترحة لهذا النمط: {currentThinking.persuasionAdvice}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> التحفظات والمخاوف المتكررة (إن وجدت)
              </label>
              <input
                type="text"
                value={profile.biasesOrConcerns || ''}
                onChange={(e) => setProfile(prev => ({ ...prev, biasesOrConcerns: e.target.value }))}
                placeholder="مثال: يتحفظ على التعاقد مع شركات خارجية جديدة، يرفض المهل الزمنية غير الواقعية"
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-800/90 border-t border-slate-700 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-all cursor-pointer"
          >
            إلغاء
          </button>
          
          <button
            type="button"
            onClick={() => {
              onSave(profile);
              onClose();
            }}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            حفظ الملف السلوكي للعضو
          </button>
        </div>

      </div>
    </div>
  );
}
