import { Mic2, Folder, Database, BarChart3, Clock, AlertTriangle, TrendingUp } from 'lucide-react';

interface HomeProps {
  onNavigate: (tab: 'chat' | 'dashboard' | 'knowledge' | 'organization' | 'meetings') => void;
}

export default function Home({ onNavigate }: HomeProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-950 text-white" dir="rtl">
      <div className="max-w-4xl w-full text-center space-y-4 mb-16">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-500">
          الخبير الإداري الذكي
        </h1>
        <p className="text-xl md:text-2xl text-slate-400 font-medium">
          عضو ذكي في كل اجتماع.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl w-full">
        <button
          onClick={() => onNavigate('meetings')}
          className="col-span-1 md:col-span-2 lg:col-span-3 group relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900/40 to-slate-900 p-8 border border-emerald-500/20 hover:border-emerald-500/50 transition-all duration-300 shadow-2xl hover:shadow-emerald-900/20 text-right flex items-center justify-between"
        >
          <div className="absolute inset-0 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors"></div>
          <div>
            <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <span className="text-emerald-400 text-4xl">🎙️</span> ابدأ اجتماعًا
            </h2>
            <p className="text-emerald-200/70 text-lg">أضف اجتماعاً جديداً للتواصل مع المستشار الذكي.</p>
          </div>
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 group-hover:scale-110 transition-transform">
            <Mic2 className="w-8 h-8 text-emerald-400" />
          </div>
        </button>

        <button
          onClick={() => onNavigate('organization')}
          className="group rounded-3xl bg-slate-900 p-6 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/50 transition-all text-right shadow-lg"
        >
          <span className="text-3xl mb-4 block">🏢</span>
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">إعداد المؤسسة</h3>
          <p className="text-slate-400 text-sm">هيكلة المؤسسة، الرؤية، والمشاركين الدائمين.</p>
        </button>

        <button
          onClick={() => onNavigate('knowledge')}
          className="group rounded-3xl bg-slate-900 p-6 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-800/50 transition-all text-right shadow-lg"
        >
          <span className="text-3xl mb-4 block">🧠</span>
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">ذاكرة المؤسسة</h3>
          <p className="text-slate-400 text-sm">البحث في الوثائق، اللوائح، والسياسات.</p>
        </button>

        <button
          onClick={() => onNavigate('dashboard')}
          className="group rounded-3xl bg-slate-900 p-6 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-800/50 transition-all text-right shadow-lg"
        >
          <span className="text-3xl mb-4 block">📊</span>
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-amber-400 transition-colors">لوحة القرارات</h3>
          <p className="text-slate-400 text-sm">تتبع وتحليل القرارات الاستراتيجية المتخذة.</p>
        </button>

        <button
          onClick={() => onNavigate('dashboard')}
          className="group rounded-3xl bg-slate-900 p-6 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/50 transition-all text-right shadow-lg"
        >
          <span className="text-3xl mb-4 block">📋</span>
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">الاجتماعات السابقة</h3>
          <p className="text-slate-400 text-sm">مراجعة المحاضر والملخصات للاجتماعات المنتهية.</p>
        </button>

        <button
          onClick={() => onNavigate('dashboard')}
          className="group rounded-3xl bg-slate-900 p-6 border border-slate-800 hover:border-rose-500/50 hover:bg-slate-800/50 transition-all text-right shadow-lg"
        >
          <span className="text-3xl mb-4 block">⚠️</span>
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-rose-400 transition-colors">المخاطر</h3>
          <p className="text-slate-400 text-sm">مؤشرات المخاطر الحالية والتحذيرات الاستباقية.</p>
        </button>

        <button
          onClick={() => onNavigate('dashboard')}
          className="group rounded-3xl bg-slate-900 p-6 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/50 transition-all text-right shadow-lg"
        >
          <span className="text-3xl mb-4 block">📈</span>
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">التوصيات</h3>
          <p className="text-slate-400 text-sm">مقترحات الذكاء الاصطناعي لتحسين الأداء.</p>
        </button>
      </div>
    </div>
  );
}
