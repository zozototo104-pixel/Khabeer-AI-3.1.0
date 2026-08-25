import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mic2, Users, AlertTriangle } from 'lucide-react';
import VoiceChat from './VoiceChat';

type InviteInfo = {
  sessionId: number;
  title: string;
  meetingType?: string;
  agenda?: string;
  participants?: unknown[];
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  location?: string | null;
  status?: string;
};

export default function GuestMeetingJoin({ inviteToken }: { inviteToken: string }) {
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);

  const safeToken = useMemo(() => String(inviteToken || '').trim(), [inviteToken]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/join/${encodeURIComponent(safeToken)}`);
        if (!res.ok) throw new Error('INVITE_INVALID');
        const data = await res.json();
        if (active) setInfo(data);
      } catch {
        if (active) setError('رابط الاجتماع غير صالح أو انتهت صلاحيته أو تم إلغاؤه.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [safeToken]);

  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center" dir="rtl"><Loader2 className="w-7 h-7 animate-spin" /></div>;
  }

  if (error || !info) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md w-full rounded-3xl border border-red-500/30 bg-slate-900 p-7 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">تعذر دخول الاجتماع</h1>
          <p className="text-sm text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-5" dir="rtl">
        <div className="max-w-lg w-full rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400"><Users className="w-6 h-6" /></div>
            <div>
              <div className="text-xs text-slate-500">دعوة محادثة جماعية</div>
              <h1 className="text-xl font-bold">{info.title}</h1>
            </div>
          </div>
          {info.agenda && <p className="text-sm text-slate-400 whitespace-pre-wrap mb-5">{info.agenda}</p>}
          <label className="block text-xs text-slate-300 mb-2">اسمك الذي سيظهر داخل الاجتماع</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="مثال: محمد"
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            disabled={!name.trim()}
            onClick={() => setJoined(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-bold"
          >
            <Mic2 className="w-4 h-4" /> دخول الاجتماع الصوتي
          </button>
          <p className="mt-4 text-[11px] leading-5 text-slate-500">هذا الرابط يمنح حق الدخول إلى هذه الجلسة فقط، ولا يمنح صلاحيات إدارة المؤسسة أو تعديل بياناتها.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950" dir="rtl">
      <VoiceChat
        token={null}
        sessionId={info.sessionId}
        guestInviteToken={safeToken}
        guestDisplayName={name.trim()}
      />
    </div>
  );
}
