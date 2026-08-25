import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Target,
} from 'lucide-react';

interface DashboardProps {
  token: string | null;
}

interface Decision {
  id: number;
  title: string;
  description?: string;
  status?: string;
  createdAt?: string;
}

interface Task {
  id: number;
  title: string;
  assignee?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
}

interface Risk {
  id: number;
  title: string;
  description?: string;
  severity?: string;
  category?: string;
  status?: string;
  probability?: number;
  impact?: number;
  inherentScore?: number;
  riskLevel?: string;
}

interface Violation {
  id: number;
  title: string;
  status?: string;
  severity?: string;
  regulationRef?: string;
  factualEvidence?: string;
  quotedProvision?: string;
  confidence?: number;
}

interface Finding { id: number; title: string; findingType?: string; severity?: string; status?: string; evidence?: string; }

export default function Dashboard({ token }: DashboardProps) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const payload = await response.json();
      setDecisions(Array.isArray(payload.decisions) ? payload.decisions : []);
      setTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
      setRisks(Array.isArray(payload.risks) ? payload.risks : []);
      setViolations(Array.isArray(payload.violations) ? payload.violations : []);
      setFindings(Array.isArray(payload.findings) ? payload.findings : []);
    } catch (loadError) {
      console.error('Dashboard load failed:', loadError);
      setError('تعذر تحميل لوحة المتابعة. تحقق من الاتصال وقاعدة البيانات ثم أعد المحاولة.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const metrics = useMemo(() => {
    const completed = tasks.filter((task) => task.status === 'COMPLETED').length;
    const pending = tasks.length - completed;
    const criticalRisks = risks.filter((risk) => ['HIGH', 'CRITICAL'].includes(risk.severity || '') && risk.status !== 'CLOSED').length;
    const completionRate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
    const suspectedViolations = violations.filter((item) => ['SUSPECTED', 'UNDER_REVIEW'].includes(item.status || 'SUSPECTED')).length;
    return { completed, pending, criticalRisks, completionRate, suspectedViolations };
  }, [risks, tasks, violations]);

  const reviewViolation = async (violation: Violation, status: 'CONFIRMED' | 'DISMISSED' | 'UNDER_REVIEW') => {
    if (!token) return;
    const action = status === 'CONFIRMED' ? 'تأكيد' : status === 'DISMISSED' ? 'استبعاد' : 'إحالة للمراجعة';
    if (!window.confirm(`${action} هذا السجل؟ سيُحفظ اسم المراجع ووقت الإجراء في الأثر التدقيقي.`)) return;
    try {
      const response = await fetch(`/api/violations/${violation.id}/review`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'REVIEW_FAILED');
      await loadDashboard();
    } catch (reviewError: any) {
      setError(reviewError?.message === 'CONFIRMED_VIOLATION_REQUIRES_REFERENCE_EVIDENCE_AND_PROVISION'
        ? 'لا يمكن تأكيد المخالفة قبل وجود المرجع والنص النظامي والدليل الواقعي.'
        : 'تعذر حفظ المراجعة.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-400" dir="rtl">
        <Loader2 className="ml-2 h-5 w-5 animate-spin text-blue-400" />
        جارٍ تحميل سجل الاجتماع والمؤشرات…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-4 sm:p-6" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-white sm:text-2xl">لوحة المتابعة التنفيذية</h1>
            <p className="mt-1 text-xs text-slate-400">القرارات والمهام والمخاطر والمخالفات ونتائج لوحة الخبراء</p>
          </div>
          <button
            onClick={loadDashboard}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-blue-500/60 hover:text-blue-300"
          >
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MetricCard label="القرارات والتوصيات" value={decisions.length} icon={<Target className="h-5 w-5" />} color="blue" />
          <MetricCard label="المهام المعلقة" value={metrics.pending} icon={<ClipboardList className="h-5 w-5" />} color="amber" />
          <MetricCard label="المخاطر الحرجة" value={metrics.criticalRisks} icon={<ShieldAlert className="h-5 w-5" />} color="rose" />
          <MetricCard label="مخالفات بانتظار المراجعة" value={metrics.suspectedViolations} icon={<AlertTriangle className="h-5 w-5" />} color="amber" />
          <MetricCard label="نسبة الإنجاز" value={`${metrics.completionRate}%`} icon={<Gauge className="h-5 w-5" />} color="emerald" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="سجل القرارات والتوصيات" count={decisions.length} icon={<Target className="h-4 w-4 text-blue-400" />}>
            {decisions.length ? decisions.slice(0, 12).map((decision) => (
              <article key={decision.id} className="border-b border-slate-800 p-4 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-100">{decision.title}</h3>
                  <StatusBadge value={decision.status || 'APPROVED'} />
                </div>
                {decision.description && <p className="mt-2 text-xs leading-6 text-slate-400">{decision.description}</p>}
              </article>
            )) : <EmptyState text="لا توجد قرارات أو توصيات مسجلة بعد." />}
          </Panel>

          <Panel title="المهام والتكليفات" count={tasks.length} icon={<ClipboardList className="h-4 w-4 text-amber-400" />}>
            {tasks.length ? tasks.slice(0, 12).map((task) => (
              <article key={task.id} className="border-b border-slate-800 p-4 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-100">{task.title}</h3>
                  <StatusBadge value={task.status || 'PENDING'} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                  <span>المكلّف: <strong className="text-slate-300">{task.assignee || 'غير محدد'}</strong></span>
                  {task.dueDate && <span>الموعد: {new Date(task.dueDate).toLocaleDateString('ar-SA')}</span>}
                </div>
              </article>
            )) : <EmptyState text="لا توجد مهام مسجلة بعد." />}
          </Panel>

          <Panel title="سجل المخاطر" count={risks.length} icon={<ShieldAlert className="h-4 w-4 text-rose-400" />}>
            {risks.length ? risks.slice(0, 12).map((risk) => (
              <article key={risk.id} className="border-b border-slate-800 p-4 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-100">{risk.title}</h3>
                  <SeverityBadge value={risk.severity || 'HIGH'} />
                </div>
                {risk.description && <p className="mt-2 text-xs leading-6 text-slate-400">{risk.description}</p>}
                <p className="mt-2 text-[11px] text-slate-500">التصنيف: {risk.category || 'OTHER'} • الاحتمال {risk.probability || '—'}/5 • الأثر {risk.impact || '—'}/5 • الدرجة {risk.inherentScore || '—'}</p>
              </article>
            )) : <EmptyState text="لا توجد مخاطر مسجلة بعد." />}
          </Panel>

          <Panel title="سجل اشتباه المخالفات" count={violations.length} icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}>
            {violations.length ? violations.slice(0, 12).map((violation) => (
              <article key={violation.id} className="border-b border-slate-800 p-4 last:border-0">
                <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold text-slate-100">{violation.title}</h3><StatusBadge value={violation.status || 'SUSPECTED'} /></div>
                <p className="mt-2 text-[11px] text-slate-400">المرجع: {violation.regulationRef || 'غير مرفق'} • الثقة: {Math.round((violation.confidence || 0) * 100)}%</p>
                {violation.factualEvidence && <p className="mt-1 text-xs leading-6 text-slate-400">الدليل: {violation.factualEvidence}</p>}
                {['SUSPECTED', 'UNDER_REVIEW'].includes(violation.status || 'SUSPECTED') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => reviewViolation(violation, 'UNDER_REVIEW')} className="rounded-lg bg-blue-500/15 px-2 py-1 text-[10px] text-blue-300">إحالة للمراجعة</button>
                    <button onClick={() => reviewViolation(violation, 'CONFIRMED')} className="rounded-lg bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">تأكيد بشري</button>
                    <button onClick={() => reviewViolation(violation, 'DISMISSED')} className="rounded-lg bg-slate-700 px-2 py-1 text-[10px] text-slate-300">استبعاد</button>
                  </div>
                )}
              </article>
            )) : <EmptyState text="لا توجد اشتباهات مخالفات مسجلة بعد." />}
          </Panel>

          <Panel title="نتائج وملاحظات الخبراء" count={findings.length} icon={<ClipboardList className="h-4 w-4 text-indigo-400" />}>
            {findings.length ? findings.slice(0, 12).map((finding) => (
              <article key={finding.id} className="border-b border-slate-800 p-4 last:border-0">
                <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold text-slate-100">{finding.title}</h3><SeverityBadge value={finding.severity || 'INFO'} /></div>
                <p className="mt-2 text-[11px] text-slate-500">النوع: {finding.findingType || 'OBSERVATION'} • الحالة: {finding.status || 'OPEN'}</p>
                {finding.evidence && <p className="mt-1 text-xs leading-6 text-slate-400">الدليل: {finding.evidence}</p>}
              </article>
            )) : <EmptyState text="لا توجد نتائج مهنية مسجلة بعد." />}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, color }: { label: string; value: number | string; icon: ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: 'border-blue-500/20 bg-blue-950/20 text-blue-400',
    amber: 'border-amber-500/20 bg-amber-950/20 text-amber-400',
    rose: 'border-rose-500/20 bg-rose-950/20 text-rose-400',
    emerald: 'border-emerald-500/20 bg-emerald-950/20 text-emerald-400',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between gap-2">{icon}<span className="text-2xl font-black text-white">{value}</span></div>
      <p className="mt-2 text-[11px] font-semibold text-slate-400">{label}</p>
    </div>
  );
}

function Panel({ title, count, icon, children }: { title: string; count: number; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 p-4">
        <h2 className="flex items-center gap-2 text-sm font-black text-white">{icon}{title}</h2>
        <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-400">{count}</span>
      </header>
      <div className="max-h-[540px] overflow-y-auto">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-10 text-center text-xs text-slate-500"><CheckCircle2 className="mx-auto mb-2 h-8 w-8 opacity-30" />{text}</div>;
}

function StatusBadge({ value }: { value: string }) {
  const approved = value === 'APPROVED' || value === 'COMPLETED';
  return <span className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black ${approved ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{value}</span>;
}

function SeverityBadge({ value }: { value: string }) {
  const critical = value === 'CRITICAL' || value === 'HIGH';
  return <span className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black ${critical ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'}`}>{value}</span>;
}
