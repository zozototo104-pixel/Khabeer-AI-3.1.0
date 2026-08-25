import { useState, useEffect } from 'react';
import { 
  Calendar, Plus, Users, Clock, Loader2, ArrowLeft, 
  Mic, Trash2, AlertCircle, FileText, Download, Share2,
  CalendarCheck, AlertTriangle, Brain, Sparkles, Sliders, Edit2, Link2, Unlink2, Check
} from 'lucide-react';
import { getAuthToken } from '../lib/firebase';
import MeetingMinutesModal from './MeetingMinutesModal';
import ScheduleMeetingModal from './ScheduleMeetingModal';
import ConfirmModal from './ConfirmModal';
import MemberPersonaModal from './MemberPersonaModal';
import MeetingCognitiveSimulator from './MeetingCognitiveSimulator';
import { MeetingMinutesData } from '../utils/exportMinutes';
import { MemberProfile, THINKING_STYLES, RISK_STANCES } from '../types';
import { copyToClipboard } from '../utils/clipboard';

interface MeetingsListProps {
  userId: string;
  token: string | null;
  onStartMeeting: (sessionId: number) => void;
  onMeetingDeleted?: (sessionId: number) => void;
}

export default function MeetingsList({ userId, token, onStartMeeting, onMeetingDeleted }: MeetingsListProps) {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState<number | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<number | null>(null);
  const [exportingMeeting, setExportingMeeting] = useState<any | null>(null);
  
  // Cognitive profiling & simulation state
  const [selectedMemberForPersona, setSelectedMemberForPersona] = useState<{ member: MemberProfile; index: number; isOrg: boolean } | null>(null);
  const [showCognitiveSimulator, setShowCognitiveSimulator] = useState(false);

  // Deletion state
  const [meetingToDelete, setMeetingToDelete] = useState<{ id: number; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    type: 'BOARD',
    agenda: '',
    participants: [] as any[]
  });

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const activeToken = token || await getAuthToken();
        if (!activeToken) {
          if (isMounted) setLoading(false);
          return;
        }

        // Fetch sessions
        const resSessions = await fetch('/api/sessions', {
          headers: { Authorization: `Bearer ${activeToken}` }
        });
        if (resSessions.ok && isMounted) {
          const data = await resSessions.json();
          setMeetings(data);
        }

        // Fetch organizations
        const resOrgs = await fetch('/api/organization', {
          headers: { Authorization: `Bearer ${activeToken}` }
        });
        if (resOrgs.ok && isMounted) {
          const data = await resOrgs.json();
          const orgs = Array.isArray(data) ? data : (data ? [data] : []);
          setOrganizations(orgs);
          if (orgs.length > 0) {
            setSelectedOrgId(String(orgs[0].id));
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const confirmDeleteMeeting = async () => {
    const activeToken = token || await getAuthToken();
    if (!meetingToDelete || !activeToken) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/sessions/${meetingToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const deletedId = meetingToDelete.id;
        setMeetings(prev => prev.filter(m => m.id !== deletedId));
        if (onMeetingDeleted) {
          onMeetingDeleted(deletedId);
        }
        setMeetingToDelete(null);
      } else {
        setErrorMessage('تعذر حذف الاجتماع من الخادم، يرجى المحاولة مرة أخرى.');
      }
    } catch(e) {
      console.error(e);
      setErrorMessage('حدث خطأ أثناء محاولة حذف الاجتماع.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateMeeting = async () => {
    const activeToken = token || await getAuthToken();
    // FIX (V4): validate title + token before sending
    if (!formData.title.trim()) {
      setErrorMessage('يرجى إدخال عنوان الاجتماع قبل الحفظ.');
      return;
    }
    if (!activeToken) {
      setErrorMessage('انتهت الجلسة. يرجى إعادة تسجيل الدخول.');
      return;
    }

    setCreating(true);
    setErrorMessage(null);
    try {
      const selectedOrg = organizations.find(o => Number(o.id) === Number(selectedOrgId));
      const payload = {
        title: formData.title.trim(),
        orgId: selectedOrg ? Number(selectedOrg.id) : null,
        meetingType: formData.type,
        agenda: formData.agenda,
        participants: formData.participants,
        status: 'ACTIVE',
      };
      const res = await fetch(editingMeetingId ? `/api/sessions/${editingMeetingId}` : '/api/sessions', {
        method: editingMeetingId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // FIX (V4): surface the actual server error message to the user
        const errBody = await res.json().catch(() => ({}));
        const errMsg = errBody?.error || errBody?.details || `MEETING_SAVE_FAILED (HTTP ${res.status})`;
        throw new Error(errMsg);
      }
      const response = await res.json();
      // FIX (V4): server now returns {success, session, id} envelope for POST
      // and {success, session} for PATCH. Extract the saved session object.
      const saved = response.session || response;
      if (!saved || !saved.id) {
        throw new Error('الخادم لم يرجع بيانات الاجتماع المحفوظ. تحقق من قاعدة البيانات.');
      }
      // FIX (V4): verify the saved title matches what we sent — if not, the
      // DB likely has a stale schema or the title column was renamed.
      if (saved.title && saved.title !== payload.title) {
        console.warn(`[MeetingsList] saved title "${saved.title}" differs from sent "${payload.title}" — possible DB schema mismatch.`);
      }
      setMeetings(prev => editingMeetingId
        ? prev.map(m => m.id === editingMeetingId ? { ...m, ...saved, ...payload } : m)
        : [saved, ...prev]);

      // Compatibility only: VoiceChat still reads these values for display,
      // while the database is now the authoritative source.
      localStorage.setItem('gemini_meeting_type', payload.meetingType);
      localStorage.setItem('gemini_meeting_participants', JSON.stringify(payload.participants));
      localStorage.setItem('gemini_meeting_title', payload.title);
      localStorage.setItem('gemini_meeting_agenda', payload.agenda);
      if (selectedOrg) {
        localStorage.setItem('gemini_meeting_org_name', selectedOrg.name || 'بدون اسم');
        localStorage.setItem('gemini_meeting_org_id', String(selectedOrg.id));
      }

      setShowNewMeeting(false);
      setEditingMeetingId(null);
      if (!editingMeetingId) onStartMeeting(saved.id);
    } catch (e: any) {
      console.error('Meeting save failed:', e);
      setErrorMessage(`تعذر حفظ الاجتماع: ${e?.message || 'خطأ غير معروف. تحقق من قاعدة البيانات والمهاجرات.'}`);
    } finally {
      setCreating(false);
    }
  };

  const startEditMeeting = (meeting: any) => {
    setEditingMeetingId(meeting.id);
    setSelectedOrgId(meeting.orgId ? String(meeting.orgId) : selectedOrgId);
    setFormData({
      title: meeting.title || '',
      type: meeting.meetingType || 'BOARD',
      agenda: meeting.agenda || '',
      participants: Array.isArray(meeting.participants) ? meeting.participants : [],
    });
    setShowNewMeeting(true);
  };

  const createInternalInvite = async (meetingId: number) => {
    const activeToken = token || await getAuthToken();
    if (!activeToken) return;
    try {
      const res = await fetch(`/api/sessions/${meetingId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({ expiresInDays: 14 }),
      });
      if (!res.ok) throw new Error('INVITE_CREATE_FAILED');
      const data = await res.json();
      await copyToClipboard(data.joinUrl);
      setCopiedInviteId(meetingId);
      setTimeout(() => setCopiedInviteId(null), 2500);
    } catch (e) {
      console.error(e);
      setErrorMessage('تعذر إنشاء رابط المحادثة الجماعية.');
    }
  };


  const revokeInternalInvites = async (meetingId: number) => {
    const activeToken = token || await getAuthToken();
    if (!activeToken) return;
    try {
      const res = await fetch(`/api/sessions/${meetingId}/invites`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (!res.ok) throw new Error('INVITE_REVOKE_FAILED');
      setCopiedInviteId(null);
      setErrorMessage(null);
    } catch (e) {
      console.error(e);
      setErrorMessage('تعذر إلغاء روابط الدعوة النشطة لهذا الاجتماع.');
    }
  };

  const handleSaveSchedule = async (scheduled: any) => {
    const activeToken = token || await getAuthToken();
    if (!activeToken) throw new Error('AUTH_REQUIRED');
    const selectedOrg = organizations.find(o => Number(o.id) === Number(selectedOrgId));
    const scheduledAt = new Date(`${scheduled.date}T${scheduled.time}:00`);
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
      body: JSON.stringify({
        title: scheduled.title,
        orgId: selectedOrg ? Number(selectedOrg.id) : null,
        meetingType: scheduled.meetingType,
        agenda: scheduled.agenda,
        participants: (scheduled.participants || []).map((name: string) => ({ name })),
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: scheduled.durationMinutes,
        location: scheduled.location,
        meetingLink: scheduled.meetingLink || null,
        status: 'SCHEDULED',
      }),
    });
    if (!res.ok) throw new Error('SCHEDULE_SAVE_FAILED');
    const response = await res.json();
    const saved = response.session || response;
    if (!saved?.id) throw new Error('SCHEDULE_RESPONSE_INVALID');
    setMeetings(prev => [saved, ...prev]);
    const inviteRes = await fetch(`/api/sessions/${saved.id}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
      body: JSON.stringify({ expiresInDays: 14 }),
    });
    if (inviteRes.ok) {
      const invite = await inviteRes.json();
      await copyToClipboard(invite.joinUrl);
      setCopiedInviteId(saved.id);
    }
  };

  const openMeeting = async (meeting: any) => {
    const activeToken = token || await getAuthToken();
    if (!activeToken) {
      setErrorMessage('انتهت الجلسة. يرجى إعادة تسجيل الدخول.');
      return;
    }
    try {
      let opened = meeting;
      if (meeting.status === 'SCHEDULED') {
        const res = await fetch(`/api/sessions/${meeting.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
          body: JSON.stringify({ status: 'ACTIVE' }),
        });
        const response = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(response.error || 'تعذر بدء الاجتماع المجدول');
        opened = response.session || { ...meeting, status: 'ACTIVE' };
        setMeetings(prev => prev.map(item => item.id === meeting.id ? opened : item));
      }
      onStartMeeting(opened.id);
    } catch (e: any) {
      setErrorMessage(e.message || 'تعذر فتح الاجتماع.');
    }
  };

  const selectedOrg = organizations.find(o => Number(o.id) === Number(selectedOrgId));
  const orgName = selectedOrg?.name || 'المؤسسة';

  const prepareMinutesForMeeting = (meeting: any): MeetingMinutesData => {
    return {
      orgName: orgName,
      meetingTitle: meeting.title || `محضر جلسة رقم ${meeting.id}`,
      meetingNumber: `MEET-${meeting.id}`,
      meetingType: meeting.meetingType || 'GENERAL',
      meetingDate: meeting.scheduledAt || meeting.createdAt ? new Date(meeting.scheduledAt || meeting.createdAt).toLocaleDateString('ar-SA') : new Date().toLocaleDateString('ar-SA'),
      location: meeting.location || 'غير محدد',
      chairperson: 'غير محدد',
      secretary: 'غير محدد',
      agenda: meeting.agenda || 'غير محدد',
      participants: Array.isArray(meeting.participants) ? meeting.participants : [],
      summary: meeting.summary || '',
      decisions: [],
      tasks: [],
      risks: []
    };
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="w-full h-full p-4 md:p-8 overflow-y-auto" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Calendar className="w-8 h-8 text-blue-400" />
              إدارة وجدولة الاجتماعات
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm">
              إنشاء جلسات تفاعلية، تصدير محاضر رسمية، ومزامنة الدعوات مع تقويم Google
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowScheduleModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-2xl text-xs font-bold transition-all shadow-md"
            >
              <CalendarCheck className="w-4 h-4" />
              جدولة وتقويم Google
            </button>

            <button
              onClick={() => {
                if (organizations.length === 0) {
                  setErrorMessage("يرجى إعداد أو اختيار جهة/مؤسسة أولاً من تبويب 'إعداد المنظمة' قبل إنشاء جلسة اجتماع.");
                  return;
                }
                setErrorMessage(null);
                setShowNewMeeting(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-blue-900/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              جلسة اجتماع جديدة
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center justify-between gap-3 text-red-400 text-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button 
              onClick={() => setErrorMessage(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              ✕
            </button>
          </div>
        )}

        {/* New Meeting Form Panel */}
        {showNewMeeting && (
          <div className="bg-slate-900 border border-blue-500/30 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl animate-in fade-in duration-300">
            <h3 className="text-xl font-bold text-white mb-4">تفاصيل وتجهيز الاجتماع الجديد</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                {organizations.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-2">المؤسسة / الجهة</label>
                    <select
                      value={selectedOrgId}
                      onChange={(e) => setSelectedOrgId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                    >
                      {organizations.map(org => (
                        <option key={org.id} value={org.id}>{org.name || 'مؤسسة بدون اسم'}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">عنوان الاجتماع</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="مثال: اجتماع مناقشة الميزانية الربعية..."
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">نوع الاجتماع</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                  >
                    <option value="BOARD">مجلس إدارة (قرارات استراتيجية)</option>
                    <option value="EXECUTIVE">إدارة تنفيذية (عمليات ومتابعة)</option>
                    <option value="BRAINSTORMING">عصف ذهني (توليد أفكار وإبداع)</option>
                    <option value="CRISIS">إدارة أزمات (تحليل مخاطر وحلول سريعة)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">محاور الاجتماع (الأجندة)</label>
                  <textarea
                    value={formData.agenda}
                    onChange={(e) => setFormData({ ...formData, agenda: e.target.value })}
                    placeholder="أدخل محاور وأجندة الاجتماع هنا..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all leading-relaxed"
                  />
                </div>
              </div>
              
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-slate-300 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" /> الحضور والتأثير الإدراكي ({formData.participants.length})
                  </label>
                  <div className="flex items-center gap-2">
                    {formData.participants.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowCognitiveSimulator(true)}
                        className="text-xs flex items-center gap-1.5 text-indigo-300 hover:text-indigo-200 bg-indigo-900/40 hover:bg-indigo-900/60 border border-indigo-500/30 px-2.5 py-1 rounded-lg transition-all"
                        title="محاكاة التوافق والاحتكاك الفكري بين الأعضاء"
                      >
                        <Brain className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="hidden sm:inline">محاكاة التوافق والاحتكاك</span>
                      </button>
                    )}
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, participants: [...prev.participants, { name: '', role: '', department: '' }] }))}
                      className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-2 py-1 rounded-md"
                    >
                      <Plus className="w-3 h-3" /> ضيف جديد
                    </button>
                  </div>
                </div>
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-y-auto max-h-[360px]">
                  
                  {/* Employees from selected org */}
                  {selectedOrgId && organizations.find(o => Number(o.id) === Number(selectedOrgId))?.employees?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider">موظفو المؤسسة</h4>
                      <div className="space-y-1.5">
                        {organizations.find(o => Number(o.id) === Number(selectedOrgId))?.employees.map((emp: any, idx: number) => {
                          const isSelected = formData.participants.some(p => p.name === emp.name && p.isOrgEmployee);
                          const currentStyle = emp.thinkingStyle ? THINKING_STYLES[emp.thinkingStyle as keyof typeof THINKING_STYLES] : null;
                          return (
                            <div key={idx} className="flex items-center justify-between p-2 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700 text-xs">
                              <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                                <input 
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData(prev => ({
                                        ...prev,
                                        participants: [...prev.participants, { ...emp, isOrgEmployee: true }]
                                      }));
                                    } else {
                                      setFormData(prev => ({
                                        ...prev,
                                        participants: prev.participants.filter(p => !(p.name === emp.name && p.isOrgEmployee))
                                      }));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 bg-slate-700"
                                />
                                <div className="flex flex-col min-w-0">
                                  <span className="font-semibold text-white truncate">{emp.name}</span>
                                  <span className="text-slate-400 text-[11px] truncate">{emp.role || 'موظف'} {emp.department ? `• ${emp.department}` : ''}</span>
                                </div>
                              </label>

                              {/* Cognitive Profile Trigger */}
                              <button
                                type="button"
                                onClick={() => setSelectedMemberForPersona({ member: emp, index: idx, isOrg: true })}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 text-[10px] font-medium transition-colors shrink-0 ml-2"
                                title="تعديل نمط التفكير وتوجهات هذا العضو"
                              >
                                <Brain className="w-3 h-3 text-indigo-400" />
                                <span>{currentStyle ? currentStyle.label : 'تحديد النمط'}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Manually added guests */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">ضيوف خارجيين</h4>
                    {formData.participants.filter(p => !p.isOrgEmployee).map((participant: any, idx: number) => {
                      const currentStyle = participant.thinkingStyle ? THINKING_STYLES[participant.thinkingStyle as keyof typeof THINKING_STYLES] : null;
                      return (
                        <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start bg-slate-800 p-2.5 rounded-xl border border-slate-700 relative">
                          <div className="grid grid-cols-2 gap-2 flex-1 w-full">
                            <input
                              type="text"
                              placeholder="الاسم"
                              value={participant.name || ''}
                              onChange={(e) => {
                                const guests = formData.participants.filter(p => !p.isOrgEmployee);
                                const orgEmps = formData.participants.filter(p => p.isOrgEmployee);
                                guests[idx].name = e.target.value;
                                setFormData({ ...formData, participants: [...orgEmps, ...guests] });
                              }}
                              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                            />
                            <input
                              type="text"
                              placeholder="الدور / الصفة"
                              value={participant.role || ''}
                              onChange={(e) => {
                                const guests = formData.participants.filter(p => !p.isOrgEmployee);
                                const orgEmps = formData.participants.filter(p => p.isOrgEmployee);
                                guests[idx].role = e.target.value;
                                setFormData({ ...formData, participants: [...orgEmps, ...guests] });
                              }}
                              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                            />
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            <button
                              type="button"
                              onClick={() => setSelectedMemberForPersona({ member: participant, index: idx, isOrg: false })}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 text-[10px] font-medium transition-colors"
                              title="تحديد وتعديل نمط تفكير الضيف"
                            >
                              <Brain className="w-3 h-3 text-indigo-400" />
                              <span>{currentStyle ? currentStyle.label : 'نمط التفكير'}</span>
                            </button>

                            <button
                              onClick={() => {
                                const guests = formData.participants.filter(p => !p.isOrgEmployee);
                                const orgEmps = formData.participants.filter(p => p.isOrgEmployee);
                                guests.splice(idx, 1);
                                setFormData({ ...formData, participants: [...orgEmps, ...guests] });
                              }}
                              className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {formData.participants.filter(p => !p.isOrgEmployee).length === 0 && (
                      <div className="text-center p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 border-dashed text-slate-500 text-xs">
                        لم يتم إضافة ضيوف من خارج المؤسسة.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowNewMeeting(false); setEditingMeetingId(null); }}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreateMeeting}
                disabled={creating || !formData.title.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                {editingMeetingId ? 'حفظ التعديلات' : 'بدء الجلسة التفاعلية'}
              </button>
            </div>
          </div>
        )}

        {/* Meetings List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              أرشيف ومحاضر الجلسات ({meetings.length})
            </h3>
          </div>

          {meetings.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed">
              <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium text-sm">لا توجد اجتماعات مسجلة حتى الآن.</p>
              <p className="text-slate-500 text-xs mt-1">ابدأ جلسة جديدة أو جدول موعداً للاستفادة من المساعد الذكي.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {meetings.map((meeting) => (
                <div key={meeting.id} className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex flex-col justify-between hover:border-slate-700 transition-all shadow-lg group">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        جلسة #{meeting.id}
                      </span>
                      {meeting.createdAt && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(meeting.createdAt).toLocaleDateString('ar-SA')}
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
                      {meeting.title || `جلسة رقم ${meeting.id}`}
                    </h4>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800">
                    <button 
                      onClick={() => void openMeeting(meeting)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> فتح الجلسة
                    </button>
                    
                    <button 
                      onClick={() => setExportingMeeting(meeting)}
                      className="flex items-center justify-center gap-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 rounded-xl text-xs font-semibold transition-all"
                      title="تصدير محضر الاجتماع الرسمي"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      تصدير المحضر
                    </button>

                    <button
                      onClick={() => startEditMeeting(meeting)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition-all"
                      title="تعديل بيانات الاجتماع"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => createInternalInvite(meeting.id)}
                      className="p-2 bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 border border-slate-700 rounded-xl transition-all"
                      title="إنشاء ونسخ رابط المحادثة الجماعية"
                    >
                      {copiedInviteId === meeting.id ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                    </button>


                    <button
                      onClick={() => revokeInternalInvites(meeting.id)}
                      className="p-2 bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700 rounded-xl transition-all"
                      title="إلغاء جميع روابط الدعوة النشطة"
                    >
                      <Unlink2 className="w-4 h-4" />
                    </button>

                    <button 
                      onClick={() => setMeetingToDelete({ id: meeting.id, title: meeting.title || `جلسة رقم ${meeting.id}` })}
                      className="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 rounded-xl transition-all cursor-pointer"
                      title="حذف الاجتماع"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Delete Meeting Confirmation Modal */}
      <ConfirmModal
        isOpen={!!meetingToDelete}
        title="حذف الجلسة الرقابية / الاجتماع"
        message={`هل أنت متأكد من رغبتك في حذف "${meetingToDelete?.title}" نهائياً؟ سيتم حذف كافة السجلات والقرارات والمخاطر المرتبطة بهذه الجلسة بشكل لا رجعة فيه.`}
        confirmText="تأكيد الحذف النهائي"
        cancelText="إلغاء"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={confirmDeleteMeeting}
        onClose={() => {
          if (!isDeleting) setMeetingToDelete(null);
        }}
      />

      {/* Export Minutes Modal */}
      {exportingMeeting && (
        <MeetingMinutesModal
          isOpen={!!exportingMeeting}
          onClose={() => setExportingMeeting(null)}
          initialData={prepareMinutesForMeeting(exportingMeeting)}
          token={token}
          sessionId={exportingMeeting.id}
        />
      )}

      {/* Schedule Meeting Modal */}
      <ScheduleMeetingModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        orgName={orgName}
        employees={selectedOrg?.employees || []}
        onSaveSchedule={handleSaveSchedule}
      />

      {/* Cognitive Profile Modal */}
      {selectedMemberForPersona && (
        <MemberPersonaModal
          isOpen={!!selectedMemberForPersona}
          onClose={() => setSelectedMemberForPersona(null)}
          member={selectedMemberForPersona.member}
          onSave={(updatedMember) => {
            if (selectedMemberForPersona.isOrg) {
              // Update in selected org's employees list in state
              const updatedOrgs = organizations.map(o => {
                if (Number(o.id) === Number(selectedOrgId)) {
                  const newEmps = [...(o.employees || [])];
                  newEmps[selectedMemberForPersona.index] = updatedMember;
                  return { ...o, employees: newEmps };
                }
                return o;
              });
              setOrganizations(updatedOrgs);

              // Update in selected participants if checked
              setFormData(prev => ({
                ...prev,
                participants: prev.participants.map(p => 
                  p.name === updatedMember.name && p.isOrgEmployee ? { ...updatedMember, isOrgEmployee: true } : p
                )
              }));
            } else {
              // Update guest in participants
              const guests = formData.participants.filter(p => !p.isOrgEmployee);
              const orgEmps = formData.participants.filter(p => p.isOrgEmployee);
              guests[selectedMemberForPersona.index] = updatedMember;
              setFormData({ ...formData, participants: [...orgEmps, ...guests] });
            }
            setSelectedMemberForPersona(null);
          }}
        />
      )}

      {/* Cognitive Diversity & Friction Simulator Modal */}
      {showCognitiveSimulator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl relative">
            <button
              onClick={() => setShowCognitiveSimulator(false)}
              className="absolute top-5 left-5 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              ✕
            </button>
            <MeetingCognitiveSimulator
              members={formData.participants}
              agendaTopic={formData.agenda || formData.title}
              onClose={() => setShowCognitiveSimulator(false)}
            />
          </div>
        </div>
      )}

    </div>
  );
}
