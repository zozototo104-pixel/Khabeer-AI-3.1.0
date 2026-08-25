import { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, BellRing, Settings, Sparkles, Play, Square, Clock } from 'lucide-react';
import { VoiceReminderSettings } from '../hooks/useVoiceReminder';

interface VoiceReminderWidgetProps {
  settings: VoiceReminderSettings;
  isSpeaking: boolean;
  pendingTasksCount: number;
  onUpdateSettings: (newSettings: Partial<VoiceReminderSettings>) => void;
  onAnnounceAllPending: () => void;
  onStopSpeaking: () => void;
  onTestChime: () => void;
}

export default function VoiceReminderWidget({
  settings,
  isSpeaking,
  pendingTasksCount,
  onUpdateSettings,
  onAnnounceAllPending,
  onStopSpeaking,
  onTestChime
}: VoiceReminderWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef} dir="rtl">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
          settings.enabled 
            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20' 
            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
        }`}
        title="إعدادات التذكير الصوتي الدائم بالمهام"
      >
        {isSpeaking ? (
          <div className="flex items-center gap-1">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <Volume2 className="w-4 h-4 text-amber-400 animate-pulse" />
          </div>
        ) : settings.enabled ? (
          <Volume2 className="w-4 h-4 text-amber-400" />
        ) : (
          <VolumeX className="w-4 h-4 text-slate-500" />
        )}
        
        <span className="hidden lg:inline text-[11px]">
          {isSpeaking ? 'جاري التنبيه...' : settings.enabled ? `تذكير صوتي (كل ${settings.intervalMinutes} د)` : 'التذكير الصوتي'}
        </span>
      </button>

      {/* Settings Dropdown Panel */}
      {isOpen && (
        <div className="absolute left-0 sm:right-auto mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                <BellRing className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">التذكير الصوتي الدائم بالمهام</h4>
                <p className="text-[10px] text-slate-400">تنبيهات صوتية دورية بالمهام المستحقة</p>
              </div>
            </div>
            {isSpeaking && (
              <button
                onClick={onStopSpeaking}
                className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                title="إيقاف الصوت الحالي"
              >
                <Square className="w-2.5 h-2.5 fill-current" /> إيقاف
              </button>
            )}
          </div>

          <div className="space-y-3.5">
            {/* Toggle Enable */}
            <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
              <span className="text-xs font-medium text-slate-200">تفعيل التذكير الصوتي التلقائي</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => onUpdateSettings({ enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {/* Interval Setting */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" /> وتيرة التذكير الصوتي:
              </label>
              <select
                value={settings.intervalMinutes}
                onChange={(e) => onUpdateSettings({ intervalMinutes: parseInt(e.target.value) })}
                disabled={!settings.enabled}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white text-xs rounded-xl outline-none focus:border-amber-500 disabled:opacity-50"
              >
                <option value={1}>كل دقيقة واحدة (متابعة مكثفة)</option>
                <option value={2}>كل دقيقتين</option>
                <option value={3}>كل 3 دقائق</option>
                <option value={5}>كل 5 دقائق (موصى به)</option>
                <option value={10}>كل 10 دقائق</option>
                <option value={15}>كل 15 دقيقة</option>
              </select>
            </div>

            {/* Announce AI completions toggle */}
            <div className="flex items-center justify-between p-2 bg-slate-800/40 rounded-xl border border-slate-700/40">
              <span className="text-[11px] text-slate-300">إشعار صوتي عند إنجاز مخرجات الذكاء</span>
              <input
                type="checkbox"
                checked={settings.announceAiCompletions}
                onChange={(e) => onUpdateSettings({ announceAiCompletions: e.target.checked })}
                className="rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-slate-700"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
              <button
                onClick={onAnnounceAllPending}
                className="w-full py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                تذكير صوتي فوري بالمهام المعلقة ({pendingTasksCount})
              </button>

              <button
                onClick={onTestChime}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium rounded-xl transition-colors text-center"
              >
                🔔 تجربة نغمة الإشعار الصوتي
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
