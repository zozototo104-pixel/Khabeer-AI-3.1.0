import { useState } from 'react';
import { 
  Calendar as CalendarIcon, Clock, MapPin, Users, Link2, 
  Download, ExternalLink, Share2, Check, X, Building2, 
  Send, Sparkles, Video, Globe, Brain, PieChart, ShieldAlert
} from 'lucide-react';
import { 
  generateGoogleCalendarUrl, 
  downloadICSFile, 
  generateMeetingInviteText, 
  CalendarEventDetails 
} from '../utils/calendarIntegration';
import { copyToClipboard } from '../utils/clipboard';
import MemberPersonaModal from './MemberPersonaModal';
import { MemberProfile, THINKING_STYLES, RISK_STANCES } from '../types';

interface ScheduleMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgName: string;
  employees: Array<MemberProfile>;
  onSaveSchedule?: (meeting: any) => void | Promise<void>;
}

export default function ScheduleMeetingModal({
  isOpen,
  onClose,
  orgName,
  employees,
  onSaveSchedule
}: ScheduleMeetingModalProps) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const [title, setTitle] = useState('اجتماع مجلس الإدارة الدوري');
  const [meetingType, setMeetingType] = useState('BOARD');
  const [dateStr, setDateStr] = useState(tomorrow.toISOString().slice(0, 10));
  const [timeStr, setTimeStr] = useState('10:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [locationType, setLocationType] = useState<'onsite' | 'remote' | 'hybrid'>('remote');
  const [location, setLocation] = useState('Google Meet / القاعة الرئيسية');
  const [meetingLink, setMeetingLink] = useState('https://meet.google.com/new');
  const [agenda, setAgenda] = useState('1. مناقشة ومراجعة الأداء الاستراتيجي والمالي.\n2. تقييم خطة المخاطر المحدثة.\n3. اعتماد مخرجات وتوصيات الجلسة السابقة.');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    employees.slice(0, 4).map(e => e.name)
  );
  const [customAttendee, setCustomAttendee] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  if (!isOpen) return null;

  const startDateTime = new Date(`${dateStr}T${timeStr}:00`);

  const eventDetails: CalendarEventDetails = {
    title: `${title} - ${orgName}`,
    description: `اجتماع رسمي لمنظمة ${orgName}\n\nنوع الاجتماع: ${meetingType}\n\nجدول الأعمال:\n${agenda}\n\nالمشاركون: ${selectedParticipants.join('، ')}`,
    location: location,
    startDate: startDateTime,
    durationMinutes: durationMinutes,
    attendees: [],
    meetingLink: meetingLink
  };

  const handleGoogleCalendar = () => {
    const url = generateGoogleCalendarUrl(eventDetails);
    window.open(url, '_blank');
  };

  const handleDownloadICS = () => {
    downloadICSFile(eventDetails, `دعوة_اجتماع_${title.replace(/\s+/g, '_')}.ics`);
  };

  const handleCopyInvite = async () => {
    const inviteText = generateMeetingInviteText({
      ...eventDetails,
      orgName: orgName,
      agenda: agenda
    });
    await copyToClipboard(inviteText);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  };

  const handleSave = async () => {
    if (!onSaveSchedule || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSaveSchedule({
        title,
        meetingType,
        date: dateStr,
        time: timeStr,
        durationMinutes,
        location,
        meetingLink,
        agenda,
        participants: selectedParticipants
      });
      onClose();
    } catch (error) {
      console.error('Schedule save failed:', error);
      setSaveError('تعذر حفظ الاجتماع المجدول في قاعدة البيانات. لم يتم إغلاق النافذة حتى لا تضيع البيانات.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200" dir="rtl">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-6 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-2xl">
              <CalendarIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                جدولة وتكامل التقويم للاجتماع
              </h2>
              <p className="text-xs text-slate-400">ربط الاجتماع مع تقويم Google Calendar وتصدير دعوات الحضور</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">عنوان وموضوع الاجتماع</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="عنوان الاجتماع..."
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">نوع الاجتماع</label>
              <select
                value={meetingType}
                onChange={(e) => setMeetingType(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="BOARD">مجلس إدارة (قرارات استراتيجية)</option>
                <option value="EXECUTIVE">إدارة تنفيذية (متابعة وتشغيل)</option>
                <option value="QUARTERLY">مراجعة ربع سنوية (KPIs & Financials)</option>
                <option value="BRAINSTORMING">عصف ذهني وابتكار</option>
                <option value="CRISIS">إدارة أزمات وطوارئ</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-blue-400" /> تاريخ الانعقاد
              </label>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" /> وقت البدء
                </label>
                <input
                  type="time"
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">المدة</label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value={30}>30 دقيقة</option>
                  <option value={45}>45 دقيقة</option>
                  <option value={60}>ساعة واحدة</option>
                  <option value={90}>ساعة ونصف</option>
                  <option value={120}>ساعتان</option>
                </select>
              </div>
            </div>
          </div>

          {/* Location & Remote Link */}
          <div className="p-4 bg-slate-800/60 border border-slate-700/80 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-400" /> طبيعة ومقر الانعقاد
              </label>
              <div className="flex gap-2 bg-slate-900 p-1 rounded-xl border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => { setLocationType('remote'); setLocation('اجتماع افتراضي (Google Meet / Zoom)'); }}
                  className={`px-3 py-1 rounded-lg transition-all ${locationType === 'remote' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
                >
                  عن بُعد (افتراضي)
                </button>
                <button
                  type="button"
                  onClick={() => { setLocationType('onsite'); setLocation('قاعة اجتماعات مجلس الإدارة - المقر الرئيسي'); }}
                  className={`px-3 py-1 rounded-lg transition-all ${locationType === 'onsite' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
                >
                  حضوري
                </button>
                <button
                  type="button"
                  onClick={() => { setLocationType('hybrid'); setLocation('مختلط (قاعة الاجتماعات + رابط افتراضي)'); }}
                  className={`px-3 py-1 rounded-lg transition-all ${locationType === 'hybrid' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
                >
                  مختلط (Hybrid)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">الموقع أو المنصة</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                  <Link2 className="w-3 h-3 text-indigo-400" /> رابط الانضمام المباشر (Google Meet / Teams)
                </label>
                <input
                  type="text"
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Agenda */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">جدول الأعمال والمحاور المطروحة</label>
            <textarea
              value={agenda}
              rows={3}
              onChange={(e) => setAgenda(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed"
            />
          </div>

          {/* Attendees with Cognitive Profiling */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-400" /> قائمة المدعوين للحضور والتأثير الإدراكي ({selectedParticipants.length})
              </label>
              <span className="text-[11px] text-indigo-300 flex items-center gap-1">
                <Brain className="w-3 h-3 text-indigo-400" /> مدمج بالذكاء الإدراكي
              </span>
            </div>

            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 max-h-44 overflow-y-auto space-y-2">
              {employees.length > 0 ? (
                employees.map((emp, idx) => {
                  const isChecked = selectedParticipants.includes(emp.name);
                  const currentStyle = emp.thinkingStyle ? THINKING_STYLES[emp.thinkingStyle as keyof typeof THINKING_STYLES] : null;
                  return (
                    <div key={idx} className="flex items-center justify-between p-2 hover:bg-slate-700/50 rounded-xl text-xs transition-colors border border-transparent hover:border-slate-600/50">
                      <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedParticipants(prev => [...prev, emp.name]);
                            } else {
                              setSelectedParticipants(prev => prev.filter(n => n !== emp.name));
                            }
                          }}
                          className="rounded border-slate-600 text-blue-500 focus:ring-blue-500 bg-slate-700"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-white truncate">{emp.name}</span>
                          <span className="text-slate-400 text-[11px] truncate">{emp.role || 'عضو'} {emp.department ? `• ${emp.department}` : ''}</span>
                        </div>
                      </label>

                      {/* Cognitive Badge */}
                      {currentStyle && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-[10px] shrink-0 font-medium mr-2">
                          <Brain className="w-2.5 h-2.5" />
                          <span>{currentStyle.label}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-slate-400 py-1 text-center">لا يوجد موظفون مسجلون في المؤسسة حالياً.</div>
              )}
            </div>
          </div>

          {/* 1-Click Integration Actions */}
          <div className="p-4 bg-gradient-to-r from-blue-950/40 via-indigo-950/40 to-slate-900 border border-blue-500/30 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-blue-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" /> خيارات التكامل والإرسال الفوري
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Google Calendar Direct Sync */}
              <button
                type="button"
                onClick={handleGoogleCalendar}
                className="flex items-center justify-center gap-2 p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02]"
              >
                <ExternalLink className="w-4 h-4" />
                إضافة إلى تقويم Google
              </button>

              {/* ICS File Download for Outlook / Apple */}
              <button
                type="button"
                onClick={handleDownloadICS}
                className="flex items-center justify-center gap-2 p-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-bold transition-all hover:scale-[1.02]"
              >
                <Download className="w-4 h-4 text-indigo-400" />
                تحميل ملف التقويم (.ics)
              </button>

              {/* Share formatted invite */}
              <button
                type="button"
                onClick={handleCopyInvite}
                className="flex items-center justify-center gap-2 p-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all hover:scale-[1.02]"
              >
                {copiedInvite ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4 text-indigo-400" />}
                {copiedInvite ? 'تم نسخ الدعوة!' : 'نسخ دعوة الحضور'}
              </button>
            </div>
          </div>

        </div>

        {saveError && (
          <div className="mx-5 mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
            {saveError}
          </div>
        )}

        {/* Footer */}
        <div className="p-5 bg-slate-800/80 border-t border-slate-700 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-all"
          >
            إغلاق
          </button>
          
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 transition-all"
          >
            {saving ? 'جارٍ حفظ الجدولة...' : 'حفظ الجدولة وتثبيت الموعد'}
          </button>
        </div>

      </div>
    </div>
  );
}
