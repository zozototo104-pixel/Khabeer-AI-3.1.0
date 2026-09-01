import { lazy, Suspense, useState, useEffect } from 'react';
import { signInWithPopup, User } from 'firebase/auth';
import { auth, googleAuthProvider } from './lib/firebase';
import { Loader2, MessageSquare, Plus, Menu, X, LayoutDashboard, Database, Mic2, Building2, Calendar, Trash2, Clock, Sparkles, CheckSquare, Zap, ShieldCheck, Mail } from 'lucide-react';
const VoiceChat = lazy(() => import('./components/VoiceChat'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const KnowledgeBase = lazy(() => import('./components/KnowledgeBase'));
const OrganizationSetup = lazy(() => import('./components/OrganizationSetup'));
const MeetingsList = lazy(() => import('./components/MeetingsList'));
import NotificationCenter from './components/NotificationCenter';
import ConfirmModal from './components/ConfirmModal';
const AITasksManager = lazy(() => import('./components/AITasksManager'));
import VoiceReminderWidget from './components/VoiceReminderWidget';
import PWAInstallBanner from './components/PWAInstallBanner';
import ErrorBoundary from './components/ErrorBoundary';
const GuestMeetingJoin = lazy(() => import('./components/GuestMeetingJoin'));
import { useVoiceReminder } from './hooks/useVoiceReminder';
const Settings = lazy(() => import('./components/Settings'));
function MainApp() {
  const allowDevDirectAuth = import.meta.env.VITE_ALLOW_DEV_DIRECT_AUTH === 'true';
  const [user, setUser] = useState<User | any | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<string | number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
const [currentTab, setCurrentTab] = useState<'chat' | 'dashboard' | 'knowledge' | 'organization' | 'meetings' | 'ai_tasks' | 'settings'>('dashboard');

  // Deletion modal state for sidebar
  const [sessionToDelete, setSessionToDelete] = useState<{ id: number; title: string } | null>(null);
  const [sessionDeleteImpact, setSessionDeleteImpact] = useState<any | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  // Notifications state
  const [tasks, setTasks] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);

  // Login & auth state
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isDirectLoggingIn, setIsDirectLoggingIn] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [customEmail, setCustomEmail] = useState('');

  // Voice Reminder Hook
  const {
    settings: voiceSettings,
    updateSettings: updateVoiceSettings,
    isSpeaking,
    speakText,
    stopSpeaking,
    announceAllPendingTasks,
    announceDeliverableCompleted,
    playChimeSound
  } = useVoiceReminder(tasks);

  useEffect(() => {
    let directSessionValid = false;
    // Check if user already logged in via direct session
    const savedDirect = allowDevDirectAuth ? localStorage.getItem('direct_user_session') : null;
    if (!allowDevDirectAuth) localStorage.removeItem('direct_user_session');
    if (savedDirect) {
      try {
        const parsed = JSON.parse(savedDirect);
        if (parsed && parsed.token && parsed.user) {
          setUser(parsed.user);
          setToken(parsed.token);
          fetchSessions(parsed.token);
          fetchNotificationsData(parsed.token);
          setLoading(false);
          directSessionValid = true;
        }
      } catch (e) {
        console.warn('Failed to parse saved direct session', e);
      }
    }

    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        const t = await u.getIdToken();
        setToken(t);
        fetchSessions(t);
        fetchNotificationsData(t);
        setLoading(false);
      } else {
        // If not authenticated in Firebase and no valid local direct session
        if (!directSessionValid) {
          setUser(null);
          setToken(null);
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchSessions = async (t: string) => {
    try {
      const res = await fetch('/api/sessions', {
        headers: {
          Authorization: `Bearer ${t}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (e) {
      console.error('Error fetching sessions:', e);
    }
  };

  const fetchNotificationsData = async (t: string) => {
    try {
      const res = await fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
        setRisks(data.risks || []);
        setDecisions(data.decisions || []);
      }
    } catch (e) {
      console.error('Error fetching notification data:', e);
    }
  };

  const handleCreateNewSession = async () => {
    if (!token) {
      setActiveSession(null);
      setCurrentTab('chat');
      setIsSidebarOpen(false);
      return;
    }

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'محادثة رقابية جديدة' })
      });
      if (res.ok) {
        const response = await res.json();
        const newSession = response.session || response;
        if (!newSession?.id) throw new Error('SESSION_RESPONSE_INVALID');
        setSessions(prev => [newSession, ...prev]);
        setActiveSession(newSession.id);
        setCurrentTab('chat');
        setIsSidebarOpen(false);
      }
    } catch (e) {
      console.error('Error creating new session:', e);
      setActiveSession(null);
      setCurrentTab('chat');
      setIsSidebarOpen(false);
    }
  };

  const requestDeleteSession = async (session: { id: number; title: string }) => {
    setSessionToDelete(session);
    setSessionDeleteImpact(null);
    if (!token) return;
    try {
      const res = await fetch(`/api/sessions/${session.id}/delete-impact`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSessionDeleteImpact(await res.json());
      }
    } catch (e) {
      console.warn('Failed to load session delete impact:', e);
    }
  };

  const buildSessionDeleteMessage = () => {
    const title = sessionToDelete?.title || '';
    const willDelete = sessionDeleteImpact?.willDelete || {};
    const preserved = sessionDeleteImpact?.willPreserveAsDurableMemory || {};
    return [
      `هل تريد تأكيد حذف الجلسة "${title}"؟`,
      '',
      'سيتم حذف ذاكرة الجلسة الخام وما يرتبط بها:',
      `- الرسائل: ${willDelete.messages ?? '...'}`,
      `- المحضر وجدول الأعمال: ${(willDelete.minutes ?? 0) + (willDelete.agenda ?? 0)}`,
      `- القرارات: ${willDelete.decisions ?? '...'}`,
      `- التوصيات: ${willDelete.recommendations ?? '...'}`,
      `- المهام والتكليفات: ${willDelete.tasks ?? '...'}`,
      `- المخاطر: ${willDelete.risks ?? '...'}`,
      `- المخالفات: ${willDelete.violations ?? '...'}`,
      `- ملاحظات الخبراء: ${willDelete.expertFindings ?? '...'}`,
      `- الحضور/المشاركون: ${willDelete.participants ?? '...'}`,
      '',
      'وسيتم حفظ ذاكرة مؤسسية مختصرة للأمور المهمة قبل الحذف:',
      `- المهام المنجزة: ${preserved.completedTasks ?? '...'}`,
      `- القرارات والتوصيات المهمة: ${preserved.decisionsAndRecommendations ?? '...'}`,
      `- المخاطر/المخالفات المغلقة: ${(preserved.closedRisks ?? 0) + (preserved.closedViolations ?? 0)}`,
      '- حقائق مهمة مثل الأشخاص/الأدوار/الأسعار عند اكتشافها.',
      '',
      'للحذف النهائي من ذاكرة الخبير بالكامل استخدم الزر الأحمر في الإعدادات.',
    ].join('\n');
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete || !token) return;
    setIsDeletingSession(true);
    const sessionId = sessionToDelete.id;

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (activeSession === sessionId) {
          const remaining = sessions.filter(s => s.id !== sessionId);
          setActiveSession(remaining.length > 0 ? remaining[0].id : null);
        }
        setSessionToDelete(null);
      }
    } catch (e) {
      console.error('Error deleting session:', e);
    } finally {
      setIsDeletingSession(false);
    }
  };

  const handleSessionUpdated = (sessionId: number, title: string) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
  };

  const handleCompleteTask = async (taskId: number) => {
    if (!token) return;
    try {
      setTasks(prev => prev.map(task => task.id === taskId ? { ...task, status: 'COMPLETED' } : task));
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'COMPLETED' })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const loginWithGoogle = async () => {
    setLoginError(null);
    try {
      googleAuthProvider.setCustomParameters({
        prompt: 'select_account'
      });
      await signInWithPopup(auth, googleAuthProvider);
    } catch (e: any) {
      const code = e?.code || '';
      if (e.code === 'auth/cancelled-popup-request' || e.code === 'auth/popup-closed-by-user') {
        setLoginError('أُغلقت نافذة Google قبل اكتمال الدخول. اضغط الزر مرة أخرى وأكمل اختيار الحساب.');
      } else {
        console.error("Login error:", e);
        const errorMessages: Record<string, string> = {
          'auth/unauthorized-domain': 'نطاق البرنامج غير مصرح به في Firebase. راجع قائمة Authorized domains.',
          'auth/operation-not-allowed': 'تسجيل الدخول باستخدام Google غير مفعّل في مشروع Firebase.',
          'auth/popup-blocked': 'حظر المتصفح نافذة Google. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.',
          'auth/network-request-failed': 'تعذر الاتصال بخدمة Google. تحقق من الإنترنت ثم أعد المحاولة.',
          'auth/invalid-api-key': 'إعداد Firebase غير صحيح. يلزم التحقق من مفتاح تطبيق الويب.',
          'auth/app-deleted': 'تطبيق Firebase المرتبط غير موجود أو تم حذفه.'
        };
        setLoginError(
          errorMessages[code] ||
          `تعذر تسجيل الدخول باستخدام Google${code ? ` (${code})` : ''}. أعد المحاولة، وإذا استمر الخطأ أرسل صورة الرسالة.`
        );
      }
    }
  };

  const loginDirectly = async (emailToUse?: string) => {
    setLoginError(null);
    setIsDirectLoggingIn(true);
    try {
      const email = emailToUse || (customEmail.trim() ? customEmail.trim() : 'developer@example.invalid');
      const res = await fetch('/api/auth/direct-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          displayName: email.includes('@') ? email.split('@')[0] : 'مسؤول الرقابة والحوكمة'
        })
      });

      if (!res.ok) throw new Error('فشل تسجيل الدخول المباشر');
      const data = await res.json();

      let directUser: any = {
        uid: data.uid,
        email: data.email,
        displayName: data.displayName || 'مسؤول الرقابة والحوكمة',
        photoURL: 'https://api.dicebear.com/7.x/bottts/svg?seed=' + data.uid
      };

      const activeToken = data.directToken || `${data.uid}:${data.email}`;

      // Save session locally
      localStorage.setItem('direct_user_session', JSON.stringify({
        user: directUser,
        token: activeToken
      }));

      setUser(directUser);
      setToken(activeToken);
      fetchSessions(activeToken);
      fetchNotificationsData(activeToken);
    } catch (err: any) {
      console.error('Direct login error:', err);
      setLoginError('حدث خطأ أثناء الدخول المباشر، يرجى المحاولة ثانية.');
    } finally {
      setIsDirectLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('direct_user_session');
      await auth.signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
    setUser(null);
    setToken(null);
    setSessions([]);
    setActiveSession(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-slate-900 p-8 rounded-3xl shadow-2xl text-center max-w-sm w-full border border-slate-800">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/30 shadow-lg shadow-blue-600/30">
            <Mic2 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1.5">الخبير الذكي</h1>
          <p className="text-slate-400 text-xs mb-6 leading-relaxed">
            منصة الرقابة والحوكمة الذكية وإدارة الاجتماعات الرسمية
          </p>

          {/* Primary Action 1: Google Sign In */}
          <button 
            onClick={loginWithGoogle}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-2xl shadow-lg shadow-blue-600/25 transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer mb-2.5 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>تسجيل الدخول باستخدام Google</span>
          </button>

          {allowDevDirectAuth && <>
            <button 
              onClick={() => loginDirectly()}
              disabled={isDirectLoggingIn}
              className="w-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold py-3 px-4 rounded-2xl border border-emerald-500/50 hover:border-emerald-400 shadow-lg shadow-emerald-950/40 transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer mb-3 hover:scale-[1.02] active:scale-[0.98]"
            >
              {isDirectLoggingIn ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              ) : (
                <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
              )}
              <span>⚡ الدخول المباشر الفوري (تخطي قيود النطاق)</span>
            </button>

            {!showEmailInput ? (
            <button
              onClick={() => setShowEmailInput(true)}
              className="text-[11px] text-slate-400 hover:text-blue-400 underline transition-colors mb-4 block mx-auto cursor-pointer"
            >
              تسجيل بإيميل محدد يدوياً؟
            </button>
          ) : (
            <div className="mb-4 p-3 bg-slate-950/60 rounded-2xl border border-slate-800 text-right animate-in fade-in">
              <label className="text-[11px] font-semibold text-slate-300 mb-1.5 block">
                أدخل بريدك الإلكتروني:
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => loginDirectly(customEmail)}
                  disabled={!customEmail.trim() || isDirectLoggingIn}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  دخول
                </button>
              </div>
            </div>
            )}
          </>}

          {loginError && (
            <div className="mb-4 p-3 bg-rose-950/50 border border-rose-500/50 rounded-2xl text-[11px] text-rose-200 text-right leading-relaxed animate-in fade-in space-y-2">
              <div className="flex items-start gap-1.5">
                <span>⚠️</span>
                <span className="flex-1">{loginError}</span>
              </div>
              <button
                type="button"
                onClick={() => loginDirectly()}
                disabled={isDirectLoggingIn}
                className="w-full mt-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/50 transition-all cursor-pointer"
              >
                {isDirectLoggingIn ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 fill-current" />
                )}
                <span>اضغط هنا للدخول الفوري وتجاوز الخطأ</span>
              </button>
            </div>
          )}

          <div className="pt-3 border-t border-slate-800/80 flex justify-center">
            <PWAInstallBanner />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex" dir="rtl">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 right-0 z-50 w-64 bg-slate-900 border-l border-slate-800 flex flex-col transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <h2 className="font-bold text-white text-sm">محادثاتي وجلساتي</h2>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* New Chat Button */}
        <div className="p-3">
          <button 
            onClick={handleCreateNewSession}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-blue-600/20 transition-all text-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" /> محادثة ذكية جديدة
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5 scrollbar-thin">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              لا توجد محادثات سابقة.
              <br />
              <button 
                onClick={handleCreateNewSession}
                className="mt-2 text-blue-400 hover:underline text-[11px]"
              >
                ابدأ محادثة جديدة الآن
              </button>
            </div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                onClick={() => { setActiveSession(s.id); setCurrentTab('chat'); setIsSidebarOpen(false); }}
                className={`group w-full text-right p-2.5 rounded-xl transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  activeSession === s.id && currentTab === 'chat' 
                    ? 'bg-slate-800 text-blue-400 font-semibold border border-blue-500/30' 
                    : 'hover:bg-slate-800/60 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${activeSession === s.id && currentTab === 'chat' ? 'text-blue-400' : 'text-slate-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs leading-tight text-slate-200 group-hover:text-white">
                      {s.title || `جلسة رقم #${s.id}`}
                    </p>
                    <span className="text-[10px] text-slate-500">
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString('ar-SA') : ''}
                    </span>
                  </div>
                </div>

                {/* Delete Button on Hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    requestDeleteSession({ id: s.id, title: s.title || `جلسة رقم #${s.id}` });
                  }}
                  className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
                  title="حذف المحادثة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
        
        {/* User Info Bottom Footer */}
        <div className="p-3.5 border-t border-slate-800 flex items-center gap-3 bg-slate-900/60">
          <img src={user.photoURL || ''} alt="User" className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{user.displayName || user.email || 'مسؤول الحوكمة'}</p>
            <button onClick={handleLogout} className="text-[11px] text-red-400 font-medium hover:underline cursor-pointer">تسجيل خروج</button>
          </div>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen relative overflow-hidden bg-slate-950">
        
        {/* Top Navbar */}
        <div className="p-3.5 sm:p-4 flex items-center justify-between border-b border-slate-800 bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-slate-400 hover:text-white rounded-lg md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            {/* Unified Navigation Dropdown & Quick AI Tasks Switcher */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-800 rounded-xl px-3 py-1.5 border border-slate-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                <select
                  value={currentTab}
                  onChange={(e) => setCurrentTab(e.target.value as any)}
                  className="bg-transparent text-white text-xs sm:text-sm font-semibold outline-none cursor-pointer appearance-none pr-7 pl-2 py-0.5"
                  style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.2rem center', backgroundSize: '0.65em auto' }}
                >
                  <option value="dashboard" className="bg-slate-900">📊 لوحة القيادة والمؤشرات</option>
                  <option value="ai_tasks" className="bg-slate-900">🤖 مهام وتكليفات الذكاء (SOPs والأدلة)</option>
<option value="settings" className="bg-slate-900">⚙️ الإعدادات</option>
                  <option value="meetings" className="bg-slate-900">📅 إدارة وجدولة الاجتماعات</option>
                  <option value="chat" className="bg-slate-900">🎙️ المستشار الذكي (صوتي وتفاعلي)</option>
                  <option value="organization" className="bg-slate-900">🏢 إعداد وهيكل المؤسسة</option>
                  <option value="knowledge" className="bg-slate-900">🧠 قاعدة المعرفة والذكاء المؤسسي</option>
                </select>
              </div>

              {/* Quick AI Tasks Pill button on navbar */}
              <button
                onClick={() => setCurrentTab('ai_tasks')}
                className={`hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  currentTab === 'ai_tasks'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
                    : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:bg-slate-750'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                مهام وتكليفات الذكاء
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* PWA Install Button */}
            <PWAInstallBanner />

            {/* Voice Reminder Audio Widget */}
            <VoiceReminderWidget
              settings={voiceSettings}
              isSpeaking={isSpeaking}
              pendingTasksCount={tasks.filter(t => t.status !== 'COMPLETED').length}
              onUpdateSettings={updateVoiceSettings}
              onAnnounceAllPending={announceAllPendingTasks}
              onStopSpeaking={stopSpeaking}
              onTestChime={playChimeSound}
            />

            {/* Interactive Notification Center */}
            <NotificationCenter
              tasks={tasks}
              risks={risks}
              decisions={decisions}
              meetings={sessions}
              onCompleteTask={handleCompleteTask}
              onNavigateToTab={(tab) => setCurrentTab(tab as any)}
            />

            <span className="text-xs font-semibold text-slate-300 hidden sm:block">{user.displayName || user.email || 'مسؤول الحوكمة'}</span>
            <img src={user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid || 'user'}`} alt="User" className="w-8 h-8 rounded-full border border-slate-700 bg-slate-800" />
          </div>
        </div>
        
        {/* Main Tab View */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-0 md:p-6 flex items-start justify-center">
          <ErrorBoundary fallbackTitle="حدث تنبيه في تحميل وحدة النظام">
            {currentTab === 'organization' && <OrganizationSetup userId={user.uid} token={token} />}
            {currentTab === 'ai_tasks' && (
              <AITasksManager
                token={token}
                userId={user.uid}
                onAnnounceTask={(title) => speakText(`تنبيه صوتي رقابي: نود تذكيركم بمتابعة إنجاز المهمة "${title}"`)}
                onTaskDeliverableCreated={(title) => {
                  announceDeliverableCompleted(title);
                  if (token) fetchNotificationsData(token);
                }}
              />
            )}
            {currentTab === 'meetings' && (
              <MeetingsList 
                userId={user.uid} 
                token={token} 
                onStartMeeting={(id) => { 
                  setActiveSession(id); 
                  setCurrentTab('chat');
                  if (token) fetchSessions(token);
                }}
                onMeetingDeleted={(id) => {
                  setSessions(prev => prev.filter(s => s.id !== id));
                  if (activeSession === id) setActiveSession(null);
                }}
              />
            )}
            {currentTab === 'chat' && (
              <VoiceChat 
                token={token} 
                sessionId={activeSession}
                onSessionCreated={(id, title) => {
                  setActiveSession(id);
                  if (token) fetchSessions(token);
                }}
                onSessionDeleted={(id) => {
                  setSessions(prev => prev.filter(s => s.id !== id));
                  if (activeSession === id) setActiveSession(null);
                }}
                onSessionUpdated={handleSessionUpdated}
              />
            )}
            {currentTab === 'dashboard' && <Dashboard token={token} />}
{currentTab === 'settings' && <Settings />}
            {currentTab === 'knowledge' && <KnowledgeBase token={token} />}
          </ErrorBoundary>
        </div>
      </div>

      {/* Delete Sidebar Session Modal */}
      <ConfirmModal
        isOpen={!!sessionToDelete}
        title="حذف المحادثة / الجلسة"
        message={buildSessionDeleteMessage()}
        confirmText="تأكيد الحذف"
        cancelText="إلغاء"
        isDestructive={true}
        isLoading={isDeletingSession}
        onConfirm={confirmDeleteSession}
        onClose={() => {
          if (!isDeletingSession) setSessionToDelete(null);
        }}
      />
    </div>
  );
}

export default function App() {
  const inviteMatch = window.location.pathname.match(/^\/join\/([^/]+)$/);
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>}>
      {inviteMatch ? <GuestMeetingJoin inviteToken={decodeURIComponent(inviteMatch[1])} /> : <MainApp />}
    </Suspense>
  );
}
