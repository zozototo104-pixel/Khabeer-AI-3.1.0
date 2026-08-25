import { useEffect, useState } from 'react';

export interface AssistantSettings {
  userName: string;
  assistantName: string;
  relationship: string;
  expertRole: string;
  personality: string[];
  addressUserAs: string;
  customInstructions: string;
}

const STORAGE_KEY = 'smart_expert_assistant_settings';

const DEFAULT_SETTINGS: AssistantSettings = {
  userName: '',
  assistantName: 'الخبير الذكي',
  relationship: '',
  expertRole: 'general',
  personality: ['friendly'],
  addressUserAs: '',
  customInstructions: '',
};

const EXPERT_ROLES = [
  { value: 'general', label: '🧠 خبير عام متعدد التخصصات' },

  { value: 'governance', label: '🏛️ الحوكمة والرقابة' },
  { value: 'legal', label: '⚖️ قانوني وتنظيمي' },
  { value: 'administrative', label: '📋 إداري وتنظيم مؤسسي' },
  { value: 'strategy', label: '🎯 التخطيط والاستراتيجية' },
  { value: 'projects', label: '📊 إدارة المشاريع والبرامج' },
  { value: 'finance', label: '💰 مالي ومحاسبي' },
  { value: 'audit', label: '🔎 تدقيق ورقابة داخلية' },
  { value: 'risk', label: '🛡️ إدارة المخاطر' },
  { value: 'operations', label: '⚙️ العمليات والتشغيل' },
  { value: 'procurement', label: '📑 المشتريات والعقود' },
  { value: 'quality', label: '✅ الجودة والتميز المؤسسي' },

  { value: 'engineering-general', label: '🛠️ هندسي عام' },
  { value: 'civil', label: '🏗️ هندسة مدنية' },
  { value: 'architecture', label: '🏢 هندسة معمارية' },
  { value: 'structural', label: '🌉 هندسة إنشائية' },
  { value: 'electrical', label: '⚡ هندسة كهربائية' },
  { value: 'mechanical', label: '⚙️ هندسة ميكانيكية' },
  { value: 'industrial', label: '🏭 هندسة صناعية' },
  { value: 'chemical', label: '🧪 هندسة كيميائية' },
  { value: 'environmental', label: '🌱 هندسة بيئية' },
  { value: 'energy', label: '🔋 هندسة الطاقة' },
  { value: 'communications', label: '📡 هندسة اتصالات' },
  { value: 'electronics', label: '🔌 هندسة إلكترونيات' },
  { value: 'computer', label: '💻 هندسة حاسوب' },
  { value: 'software', label: '👨‍💻 هندسة برمجيات' },
  { value: 'ai', label: '🤖 ذكاء اصطناعي وتعلم آلي' },
  { value: 'networks', label: '🌐 شبكات وأنظمة' },
  { value: 'cybersecurity', label: '🔐 أمن سيبراني' },
  { value: 'data', label: '📈 بيانات وتحليلات' },
];

const PERSONALITIES = [
  { value: 'friendly', label: '😊 ودودة' },
  { value: 'funny', label: '😄 مرحة' },
  { value: 'romantic', label: '❤️ رومانسية' },
  { value: 'serious', label: '🎯 جدية' },
  { value: 'calm', label: '🌿 هادئة' },
  { value: 'formal', label: '👔 رسمية' },
  { value: 'warm', label: '🤗 حنونة ودافئة' },
  { value: 'supportive', label: '💙 داعمة' },
  { value: 'direct', label: '⚡ مباشرة' },
  { value: 'firm', label: '🛡️ حازمة' },
  { value: 'analytical', label: '🧠 تحليلية' },
  { value: 'creative', label: '✨ إبداعية' },
];

export function loadAssistantSettings(): AssistantSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      personality: Array.isArray(parsed.personality)
        ? parsed.personality
        : DEFAULT_SETTINGS.personality,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function Settings() {
  const [settings, setSettings] =
    useState<AssistantSettings>(DEFAULT_SETTINGS);

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadAssistantSettings());
  }, []);

  const update = (
    field: keyof AssistantSettings,
    value: string | string[]
  ) => {
    setSettings(prev => ({
      ...prev,
      [field]: value,
    }));

    setSaved(false);
  };

  const togglePersonality = (value: string) => {
    setSettings(prev => {
      const exists = prev.personality.includes(value);

      return {
        ...prev,
        personality: exists
          ? prev.personality.filter(item => item !== value)
          : [...prev.personality, value],
      };
    });

    setSaved(false);
  };

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);

    window.dispatchEvent(
      new CustomEvent('assistant-settings-updated', {
        detail: settings,
      })
    );
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
    setSaved(false);
  };

  return (
    <div
      dir="rtl"
      className="w-full max-w-4xl mx-auto p-4 sm:p-6 text-white"
    >
      <div className="mb-6">
        <h1 className="text-2xl font-black mb-2">
          ⚙️ إعدادات الخبير الذكي
        </h1>

        <p className="text-sm text-slate-400 leading-6">
          خصّص هوية الخبير، تخصصه، شخصيته، وطريقة تعامله معك.
        </p>
      </div>

      <div className="space-y-5">

        {/* Identity */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h2 className="font-bold text-lg mb-4">
            👤 الهوية والعلاقة
          </h2>

          <div className="space-y-4">

            <div>
              <label className="block text-sm text-slate-300 mb-2">
                اسمك
              </label>

              <input
                value={settings.userName}
                onChange={e => update('userName', e.target.value)}
                placeholder="مثال: أبو مصعب"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-2">
                كيف تريد أن يناديك؟
              </label>

              <input
                value={settings.addressUserAs}
                onChange={e =>
                  update('addressUserAs', e.target.value)
                }
                placeholder="مثال: أبو مصعب، حبيبي، أستاذ..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-2">
                اسم شخصية المساعد
              </label>

              <input
                value={settings.assistantName}
                onChange={e =>
                  update('assistantName', e.target.value)
                }
                placeholder="مثال: تغريد"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-2">
                وصف العلاقة بينكما
              </label>

              <input
                value={settings.relationship}
                onChange={e =>
                  update('relationship', e.target.value)
                }
                placeholder="مثال: زوجتي، صديقتي، مساعدتي، مستشارتي..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 outline-none focus:border-blue-500"
              />

              <p className="text-xs text-slate-500 mt-2 leading-5">
                مثال: إذا كان الاسم «تغريد» والعلاقة «زوجتي»،
                سيُستخدم ذلك لاحقًا في سياق الشخصية وطريقة مخاطبتك.
              </p>
            </div>

          </div>
        </section>

        {/* Expert Role */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h2 className="font-bold text-lg mb-4">
            🎓 التخصص المهني
          </h2>

          <select
            value={settings.expertRole}
            onChange={e =>
              update('expertRole', e.target.value)
            }
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-blue-500"
          >
            {EXPERT_ROLES.map(role => (
              <option
                key={role.value}
                value={role.value}
                className="bg-slate-900"
              >
                {role.label}
              </option>
            ))}
          </select>

          <p className="text-xs text-slate-500 mt-3 leading-5">
            يمكن تغيير الخبير في أي وقت دون حذف الاسم أو الشخصية.
          </p>
        </section>

        {/* Personality */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h2 className="font-bold text-lg mb-2">
            🎭 الشخصية وطريقة الحديث
          </h2>

          <p className="text-xs text-slate-500 mb-4">
            يمكنك اختيار أكثر من صفة في نفس الوقت.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PERSONALITIES.map(item => {
              const active =
                settings.personality.includes(item.value);

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() =>
                    togglePersonality(item.value)
                  }
                  className={`p-3 rounded-xl text-sm font-semibold border transition-all ${
                    active
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-slate-950 border-slate-700 text-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Custom instructions */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h2 className="font-bold text-lg mb-4">
            ✍️ تعليمات إضافية للشخصية
          </h2>

          <textarea
            value={settings.customInstructions}
            onChange={e =>
              update('customInstructions', e.target.value)
            }
            rows={5}
            placeholder="مثال: تحدثي معي باللهجة الفلسطينية، كوني طبيعية، ناقشيني إذا كنت مخطئاً، لا توافقي على كل شيء، واستخدمي اسمي أثناء الحديث..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 resize-none outline-none focus:border-blue-500"
          />
        </section>

        {/* Preview */}
        <section className="bg-blue-950/30 border border-blue-800/50 rounded-2xl p-4">
          <h2 className="font-bold mb-3">
            👁️ معاينة الهوية
          </h2>

          <div className="text-sm text-slate-300 space-y-2">
            <p>
              <strong>اسم المستخدم:</strong>{' '}
              {settings.userName || 'غير محدد'}
            </p>

            <p>
              <strong>اسم المساعد:</strong>{' '}
              {settings.assistantName || 'غير محدد'}
            </p>

            <p>
              <strong>العلاقة:</strong>{' '}
              {settings.relationship || 'غير محددة'}
            </p>

            <p>
              <strong>الشخصية:</strong>{' '}
              {settings.personality.length
                ? PERSONALITIES
                    .filter(p =>
                      settings.personality.includes(p.value)
                    )
                    .map(p => p.label)
                    .join(' + ')
                : 'افتراضية'}
            </p>
          </div>
        </section>

        {/* Save */}
        <div className="flex gap-3 pb-8">
          <button
            onClick={saveSettings}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-xl p-3 font-bold"
          >
            💾 حفظ الإعدادات
          </button>

          <button
            onClick={resetSettings}
            className="bg-slate-800 hover:bg-slate-700 rounded-xl px-4 font-bold"
          >
            إعادة ضبط
          </button>
        </div>

        {saved && (
          <div className="text-center text-emerald-400 font-bold pb-6">
            ✓ تم حفظ إعدادات الشخصية
          </div>
        )}

      </div>
    </div>
  );
}