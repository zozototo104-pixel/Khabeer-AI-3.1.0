import { useState } from 'react';
import { 
  FileText, Download, Printer, Copy, Check, X, 
  Building2, Users, Target, CheckCircle2, AlertOctagon,
  Calendar, Clock, MapPin, Sparkles, Loader2, Edit3
} from 'lucide-react';
import { MeetingMinutesData, exportToWord, printOrSavePdf, generateFormattedMinutesText, formatMeetingTypeArabic } from '../utils/exportMinutes';
import { copyToClipboard } from '../utils/clipboard';

interface MeetingMinutesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: MeetingMinutesData;
  token?: string | null;
  sessionId?: number;
}

export default function MeetingMinutesModal({
  isOpen,
  onClose,
  initialData,
  token,
  sessionId
}: MeetingMinutesModalProps) {
  const [data, setData] = useState<MeetingMinutesData>(initialData);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');
  const [isEnhancing, setIsEnhancing] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    const text = generateFormattedMinutesText(data);
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleExportWord = () => {
    exportToWord(data);
  };

  const handlePrintPdf = () => {
    printOrSavePdf(data);
  };

  const handleEnhanceWithAI = async () => {
    if (!token || !sessionId) return;
    setIsEnhancing(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/generate-minutes`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ currentData: data })
      });
      if (res.ok) {
        const enriched = await res.json();
        if (enriched.minutes) {
          setData(prev => ({
            ...prev,
            summary: enriched.minutes.summary || prev.summary,
            agenda: enriched.minutes.agenda || prev.agenda,
            decisions: enriched.minutes.decisions || prev.decisions,
            tasks: enriched.minutes.tasks || prev.tasks,
            risks: enriched.minutes.risks || prev.risks,
            violations: enriched.minutes.violations || prev.violations || [],
            findings: enriched.minutes.findings || prev.findings || [],
          }));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200" dir="rtl">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl max-h-[92vh] rounded-3xl flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 bg-slate-800/80 border-b border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-2xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                محضر الاجتماع الرسمي والقرارات
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {formatMeetingTypeArabic(data.meetingType)}
                </span>
              </h2>
              <p className="text-xs text-slate-400">توليد وطباعة وتصدير محضر موثق بصيغة Word و PDF بضغطة زر</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab(activeTab === 'preview' ? 'edit' : 'preview')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-all ${
                activeTab === 'edit' 
                  ? 'bg-blue-600 text-white border-blue-500' 
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              {activeTab === 'edit' ? 'معاينة المستند' : 'تعديل المحتوى'}
            </button>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              {copied ? 'تم النسخ!' : 'نسخ النص'}
            </button>

            <button
              onClick={handleExportWord}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium shadow-lg shadow-blue-600/20 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              تصدير Word (.docx)
            </button>

            <button
              onClick={handlePrintPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow-lg shadow-indigo-600/20 transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              طباعة / PDF
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {activeTab === 'edit' ? (
            /* Editing View */
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">عنوان الاجتماع</label>
                  <input
                    type="text"
                    value={data.meetingTitle}
                    onChange={(e) => setData({ ...data, meetingTitle: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">اسم المؤسسة</label>
                  <input
                    type="text"
                    value={data.orgName}
                    onChange={(e) => setData({ ...data, orgName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">تاريخ الانعقاد</label>
                  <input
                    type="text"
                    value={data.meetingDate}
                    onChange={(e) => setData({ ...data, meetingDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">مقر الاجتماع</label>
                  <input
                    type="text"
                    value={data.location || ''}
                    placeholder="مثال: القاعة الرئيسية أو Google Meet"
                    onChange={(e) => setData({ ...data, location: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">رئيس الجلسة</label>
                  <input
                    type="text"
                    value={data.chairperson || ''}
                    placeholder="اسم رئيس مجلس الإدارة / المدير العام"
                    onChange={(e) => setData({ ...data, chairperson: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">أمين سر الجلسة (المقرر)</label>
                  <input
                    type="text"
                    value={data.secretary || ''}
                    placeholder="اسم مقرر الاجتماع"
                    onChange={(e) => setData({ ...data, secretary: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">جدول الأعمال والمحاور المطروحة</label>
                <textarea
                  value={data.agenda || ''}
                  rows={3}
                  onChange={(e) => setData({ ...data, agenda: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">ملخص المداولات والنقاشات</label>
                <textarea
                  value={data.summary || ''}
                  rows={4}
                  onChange={(e) => setData({ ...data, summary: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          ) : (
            /* Official Document Preview (Paper Style) */
            <div className="bg-white text-slate-900 p-8 sm:p-12 rounded-2xl shadow-xl max-w-4xl mx-auto space-y-8 font-sans border border-slate-200">
              
              {/* Doc Header */}
              <div className="flex items-center justify-between border-b-4 border-double border-blue-700 pb-6">
                <div>
                  <h3 className="text-base font-bold text-blue-900">{data.orgName || 'المؤسسة'}</h3>
                  <p className="text-xs text-slate-500">أمانة سر مجلس الإدارة</p>
                </div>
                <div className="text-center">
                  <h1 className="text-2xl font-black text-blue-950">محضر اجتماع رسمي</h1>
                  <p className="text-sm font-semibold text-blue-700 mt-1">{formatMeetingTypeArabic(data.meetingType)}</p>
                </div>
                <div className="text-left text-xs text-slate-600 space-y-1">
                  <div>رقم المحضر: <strong>{data.meetingNumber || 'MEET-2026-01'}</strong></div>
                  <div>التاريخ: <strong>{data.meetingDate}</strong></div>
                </div>
              </div>

              {/* Meta Grid */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="flex gap-2">
                  <span className="font-bold text-slate-600 min-w-[100px]">عنوان الاجتماع:</span>
                  <span className="font-semibold text-slate-900">{data.meetingTitle}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-slate-600 min-w-[100px]">مقر الانعقاد:</span>
                  <span className="text-slate-800">{data.location || 'المقر الرئيسي'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-slate-600 min-w-[100px]">رئيس الجلسة:</span>
                  <span className="text-slate-800">{data.chairperson || 'رئيس مجلس الإدارة'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-slate-600 min-w-[100px]">أمين سر الجلسة:</span>
                  <span className="text-slate-800">{data.secretary || 'مقرر الاجتماع'}</span>
                </div>
              </div>

              {/* Section 1: Attendees */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-blue-900 border-b border-slate-200 pb-1 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  أولاً: الحضور والمشاركون في الاجتماع
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-bold">
                        <th className="border border-slate-300 p-2 w-12 text-center">م</th>
                        <th className="border border-slate-300 p-2">الاسم الكامل</th>
                        <th className="border border-slate-300 p-2">المسمى / الدور</th>
                        <th className="border border-slate-300 p-2">الجهة / القسم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.participants.length > 0 ? (
                        data.participants.map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="border border-slate-300 p-2 text-center font-bold">{idx + 1}</td>
                            <td className="border border-slate-300 p-2 font-semibold">{p.name}</td>
                            <td className="border border-slate-300 p-2">{p.role || (p.isOrgEmployee ? 'موظف' : 'مشارك')}</td>
                            <td className="border border-slate-300 p-2">{p.department || (p.isOrgEmployee ? data.orgName : 'خارجي')}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="border border-slate-300 p-3 text-center text-slate-500">
                            لم تسجل أسماء مشاركين بشكل مفصل.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 2: Agenda */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-blue-900 border-b border-slate-200 pb-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  ثانياً: جدول الأعمال والمحاور المطروحة
                </h4>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs leading-relaxed whitespace-pre-wrap text-slate-800">
                  {data.agenda || '1. استعراض البنود الاستراتيجية.\n2. متابعة الموقف التنفيذي للمهام.\n3. رصد وتحليل المخاطر.'}
                </div>
              </div>

              {/* Section 3: Summary */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-blue-900 border-b border-slate-200 pb-1 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  ثالثاً: ملخص المداولات والنقاش
                </h4>
                <div className="bg-white border border-slate-200 p-3.5 rounded-lg text-xs leading-relaxed text-justify whitespace-pre-wrap text-slate-800">
                  {data.summary || 'ناقش السادة الأعضاء المحاور المطروحة بجدول الأعمال وتم الاتفاق على حزمة القرارات والتكليفات الموضحة في البنود التالية.'}
                </div>
              </div>

              {/* Section 4: Decisions */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-blue-900 border-b border-slate-200 pb-1 flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-600" />
                  رابعاً: القرارات الاستراتيجية المعتمدة
                </h4>
                <table className="w-full text-xs text-right border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold">
                      <th className="border border-slate-300 p-2 w-16 text-center">الرقم</th>
                      <th className="border border-slate-300 p-2 w-1/3">القرار / التوصية</th>
                      <th className="border border-slate-300 p-2">التفاصيل والمبررات</th>
                      <th className="border border-slate-300 p-2 w-20 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.decisions.length > 0 ? (
                      data.decisions.map((d, idx) => (
                        <tr key={idx}>
                          <td className="border border-slate-300 p-2 text-center font-bold text-blue-900">د-{idx + 1}</td>
                          <td className="border border-slate-300 p-2 font-bold text-blue-900">{d.title}</td>
                          <td className="border border-slate-300 p-2 text-slate-700">{d.description || 'معتمد'}</td>
                          <td className="border border-slate-300 p-2 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">
                              {d.status === 'APPROVED' ? 'معتمد' : d.status || 'معتمد'}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="border border-slate-300 p-3 text-center text-slate-500">
                          لا توجد قرارات جديدة مسجلة.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Section 5: Tasks */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-blue-900 border-b border-slate-200 pb-1 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  خامساً: خطة المهام والتكليفات التنفيذية
                </h4>
                <table className="w-full text-xs text-right border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold">
                      <th className="border border-slate-300 p-2 w-12 text-center">م</th>
                      <th className="border border-slate-300 p-2">المهمة التنفيذية</th>
                      <th className="border border-slate-300 p-2 w-1/4">المسؤول المكلف</th>
                      <th className="border border-slate-300 p-2 w-24 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tasks.length > 0 ? (
                      data.tasks.map((t, idx) => (
                        <tr key={idx}>
                          <td className="border border-slate-300 p-2 text-center font-bold">{idx + 1}</td>
                          <td className="border border-slate-300 p-2 font-medium">{t.title}</td>
                          <td className="border border-slate-300 p-2 font-bold text-slate-800">{t.assignee || 'الإدارة المعنية'}</td>
                          <td className="border border-slate-300 p-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {t.status === 'COMPLETED' ? 'مكتملة' : 'قيد التنفيذ'}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="border border-slate-300 p-3 text-center text-slate-500">
                          لا توجد تكليفات تنفيذية مسجلة.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Section 6: Risks */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-blue-900 border-b border-slate-200 pb-1 flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-red-600" />
                  سادساً: سجل المخاطر والتوجيهات الاستباقية
                </h4>
                <table className="w-full text-xs text-right border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold">
                      <th className="border border-slate-300 p-2 w-14 text-center">الرقم</th>
                      <th className="border border-slate-300 p-2 w-1/3">الخطر المرصود</th>
                      <th className="border border-slate-300 p-2">التوصية والمعالجة</th>
                      <th className="border border-slate-300 p-2 w-20 text-center">الخطورة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.risks.length > 0 ? (
                      data.risks.map((r, idx) => (
                        <tr key={idx}>
                          <td className="border border-slate-300 p-2 text-center font-bold text-red-700">خ-{idx + 1}</td>
                          <td className="border border-slate-300 p-2 font-bold text-red-800">{r.title}</td>
                          <td className="border border-slate-300 p-2 text-slate-700">{r.description || 'المتابعة المباشرة.'}</td>
                          <td className="border border-slate-300 p-2 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                              {r.severity === 'HIGH' ? 'حرج' : r.severity === 'MEDIUM' ? 'متوسط' : 'منخفض'}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="border border-slate-300 p-3 text-center text-slate-500">
                          لم ترصد مخاطر حرجة.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Signatures */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-blue-900 border-b border-slate-200 pb-1">سابعاً: سجل اشتباه المخالفات والمراجعة</h4>
                {(data.violations || []).length ? (data.violations || []).map((violation, index) => (
                  <div key={index} className="rounded border border-amber-200 bg-amber-50 p-3 text-xs">
                    <div className="flex justify-between gap-2"><strong>{violation.title}</strong><span>{violation.status || 'SUSPECTED'}</span></div>
                    <p className="mt-1">المرجع: {violation.regulationRef || 'غير مرفق'}</p>
                    <p className="mt-1">الدليل: {violation.factualEvidence || 'غير مرفق'}</p>
                  </div>
                )) : <p className="text-xs text-slate-500">لا توجد اشتباهات مخالفات مسجلة.</p>}
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-blue-900 border-b border-slate-200 pb-1">ثامناً: نتائج وملاحظات لوحة الخبراء</h4>
                {(data.findings || []).length ? (data.findings || []).map((finding, index) => (
                  <div key={index} className="rounded border border-indigo-200 bg-indigo-50 p-3 text-xs">
                    <div className="flex justify-between gap-2"><strong>{finding.title}</strong><span>{finding.findingType || 'OBSERVATION'}</span></div>
                    <p className="mt-1">الدليل: {finding.evidence || 'غير مرفق'}</p>
                  </div>
                )) : <p className="text-xs text-slate-500">لا توجد نتائج إضافية مسجلة.</p>}
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-center">
                <div className="space-y-6">
                  <div>
                    <h5 className="text-xs font-bold text-blue-900">مقرر وأمين سر الاجتماع</h5>
                    <p className="text-xs text-slate-600 mt-1">{data.secretary || 'أمين سر المجلس'}</p>
                  </div>
                  <div className="border-t border-dashed border-slate-400 w-3/4 mx-auto pt-2 text-[11px] font-semibold text-slate-500">
                    التوقيع والاعتماد
                  </div>
                </div>
                <div className="space-y-6">
                  <div>
                    <h5 className="text-xs font-bold text-blue-900">رئيس الجلسة الموقر</h5>
                    <p className="text-xs text-slate-600 mt-1">{data.chairperson || 'رئيس مجلس الإدارة'}</p>
                  </div>
                  <div className="border-t border-dashed border-slate-400 w-3/4 mx-auto pt-2 text-[11px] font-semibold text-slate-500">
                    التوقيع والاعتماد
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-800/80 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400">
          <div>جاهز للمشاركة والتصدير الرسمي</div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportWord}
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium"
            >
              <Download className="w-3.5 h-3.5" /> تحميل ملف Word (.docx)
            </button>
            <span>•</span>
            <button
              onClick={handlePrintPdf}
              className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium"
            >
              <Printer className="w-3.5 h-3.5" /> طباعة / PDF
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
