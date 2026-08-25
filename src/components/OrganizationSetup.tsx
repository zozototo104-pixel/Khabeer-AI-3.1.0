import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Building2, Plus, Save, Target, Trash2, Loader2, CheckCircle2, Briefcase, Folders, History, FileUp, Sparkles, UploadCloud, Brain, UserCheck } from 'lucide-react';
import { auth, getAuthToken } from '../lib/firebase';
import MemberPersonaModal from './MemberPersonaModal';
import { MemberProfile, THINKING_STYLES, RISK_STANCES } from '../types';

interface OrganizationSetupProps {
  userId: string;
  token?: string | null;
}

export default function OrganizationSetup({ userId, token }: OrganizationSetupProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [orgId, setOrgId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list');
  
  const [activeTab, setActiveTab] = useState<'basics' | 'strategy' | 'operations' | 'history' | 'upload'>('basics');
  const [extracting, setExtracting] = useState(false);
  const [extractSuccess, setExtractSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persona Modal State
  const [selectedMemberForPersona, setSelectedMemberForPersona] = useState<{ member: MemberProfile; index: number } | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    structure: '',
    goals: '',
    strategy: '',
    budget: '',
    policies: '',
    procedures: '',
    projects: '',
    employees: [] as any[],
    kpis: '',
    pastDecisions: '',
    pastMeetings: ''
  });

  useEffect(() => {
    let isMounted = true;
    const fetchOrg = async () => {
      try {
        const t = token || await getAuthToken();
        if (!t) {
          if (isMounted) setLoading(false);
          return;
        }
        const res = await fetch('/api/organization', {
          headers: { 'Authorization': `Bearer ${t}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && isMounted) {
            setOrganizations(Array.isArray(data) ? data : (data ? [data] : []));
            if (Array.isArray(data) && data.length === 1) {
              handleEdit(data[0]);
            }
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchOrg();
    
    const timer = setTimeout(() => {
      if (isMounted && loading) {
        setLoading(false);
      }
    }, 1500);
    
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [userId, token]);


  const handleEdit = (org: any) => {
    setOrgId(org.id);
    setFormData({
      name: org.name || '',
      industry: org.industry || '',
      structure: org.structure || '',
      goals: org.goals || '',
      strategy: org.strategy || '',
      budget: org.budget || '',
      policies: org.policies || '',
      procedures: org.procedures || '',
      projects: org.projects || '',
      employees: Array.isArray(org.employees) ? org.employees : (typeof org.employees === 'string' && org.employees ? [{ name: org.employees, role: '', department: '' }] : []),
      kpis: org.kpis || '',
      pastDecisions: org.pastDecisions || '',
      pastMeetings: org.pastMeetings || ''
    });
    setViewMode('edit');
  };

  
  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذه المؤسسة نهائياً؟ ستفقد كافة البيانات والمهام المرتبطة بها.')) return;
    
    try {
      const t = token || await getAuthToken();
      if (!t) throw new Error("No token");
      const res = await fetch(`/api/organization/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.ok) {
        setOrganizations(prev => prev.filter(org => org.id !== id));
        setViewMode('list');
      } else {
        alert('حدث خطأ أثناء حذف المؤسسة.');
      }
    } catch (e) {
      console.error(e);
      alert('حدث خطأ أثناء حذف المؤسسة.');
    }
  };

  const handleCreateNew = () => {
    setOrgId(null);
    setFormData({
      name: '', industry: '', structure: '', goals: '', strategy: '', budget: '', policies: '', procedures: '', projects: '', employees: [], kpis: '', pastDecisions: '', pastMeetings: ''
    });
    setViewMode('edit');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const t = token || await getAuthToken();
      if (!t) throw new Error("No token");
      // FIX (V4): client-side validation — don't send empty name
      if (!formData.name || !formData.name.trim()) {
        alert('يرجى إدخال اسم المؤسسة قبل الحفظ.');
        setSaving(false);
        return;
      }
      const res = await fetch(orgId ? `/api/organization/${orgId}` : '/api/organization', {
        method: orgId ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${t}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      if (!res.ok) {
        // FIX (V4): surface the server error message to the user
        const errorData = await res.json().catch(() => ({}));
        const errMsg = errorData?.error || `فشل الحفظ (HTTP ${res.status})`;
        throw new Error(errMsg);
      }
      const data = await res.json();
      // FIX (V4): the server now returns the FULL object (not just {id}).
      // Use that to update the form/local state immediately so the UI shows
      // the saved name even if the GET refresh below fails.
      if (data && data.id) {
        setOrgId(String(data.id));
        if (data.name) {
          setFormData(prev => ({ ...prev, name: data.name }));
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);

      // Refresh list
      const refreshRes = await fetch('/api/organization', { headers: { 'Authorization': `Bearer ${t}` } });
      if (refreshRes.ok) {
          const refreshed = await refreshRes.json();
          if (Array.isArray(refreshed)) {
            setOrganizations(refreshed);
            // FIX (V4): if only one org exists, auto-select it (existing
            // behavior) but also keep the current form data so the user
            // doesn't lose what they typed.
            if (refreshed.length === 1) {
              // Don't auto-overwrite the form if we just saved successfully
              // (the form already has the correct values).
            }
          }
      }
    } catch (e: any) {
      console.error('Organization save failed:', e);
      alert(`حدث خطأ أثناء الحفظ: ${e?.message || 'يرجى المحاولة مرة أخرى.'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setExtractSuccess(false);
    
    const formDataPayload = new FormData();
    const safeFilename = "upload_" + Date.now() + (file.name.substring(file.name.lastIndexOf('.')) || '');
    formDataPayload.append('file', file, safeFilename);
    formDataPayload.append('originalName', encodeURIComponent(file.name));
    
    try {
      const tokenAuth = token || await getAuthToken() || '';
      if (!tokenAuth) {
        throw new Error("لم يتم العثور على رمز التحقق، يرجى إعادة تسجيل الدخول.");
      }
      
      const response = await fetch('/api/extract-document', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenAuth}`
        },
        body: formDataPayload
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Upload failed");
      }
      const data = await response.json();

      setFormData(prev => {
        const updated = { ...prev };
        (Object.keys(data) as Array<keyof typeof formData>).forEach(key => {
          if (key === 'employees' && Array.isArray(data[key])) {
            updated.employees = [...(updated.employees || []), ...data[key]];
          } else if (data[key] && typeof data[key] === 'string') {
            // @ts-ignore
            updated[key] = updated[key] ? updated[key] + '\n\n' + data[key] : data[key];
          }
        });
        return updated;
      });
      setExtractSuccess(true);
      setTimeout(() => setExtractSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error extracting document", err);
      alert(`حدث خطأ أثناء تحليل المستند: ${err.message || 'يرجى المحاولة مرة أخرى.'}`);
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const tabs: { id: 'basics' | 'strategy' | 'operations' | 'history' | 'upload'; label: string; icon: any; highlight?: boolean }[] = [
    { id: 'basics', label: 'الأساسيات', icon: Briefcase },
    { id: 'strategy', label: 'الاستراتيجية', icon: Target },
    { id: 'operations', label: 'العمليات', icon: Folders },
    { id: 'history', label: 'السجل', icon: History },
    { id: 'upload', label: 'الرفع والتحليل الذكي', icon: Sparkles, highlight: true }
  ];

  return (
    <div className="w-full h-full p-4 md:p-8 overflow-y-auto" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-8 pb-20">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Building2 className="w-8 h-8 text-emerald-400" />
            إعداد بطاقة المؤسسة
          </h2>
          <p className="text-slate-400">
            أدخل تفاصيل المؤسسة أو قم برفع وثائق المؤسسة ليقوم الذكاء الاصطناعي باستخراجها وتكوين السياق الشامل للمستشار.
          </p>
        </div>

        {viewMode === 'list' ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 mt-8">
            <h3 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-3 flex items-center gap-2">
               <Building2 className="w-5 h-5 text-emerald-400" /> مؤسساتي المسجلة
            </h3>
            
            {organizations.length === 0 ? (
                <div className="text-center py-12">
                    <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400 mb-6">لم تقم بإضافة أي مؤسسة حتى الآن.</p>
                    <button
                        onClick={handleCreateNew}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg"
                    >
                        <Plus className="w-5 h-5" /> إنشاء مؤسسة جديدة
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {organizations.map(org => (
                            <div
                                key={org.id}
                                className="flex items-start justify-between p-6 bg-slate-800 border border-slate-700 hover:border-emerald-500 rounded-2xl transition-all shadow-sm hover:shadow-emerald-900/20 w-full group cursor-pointer"
                                onClick={() => handleEdit(org)}
                            >
                                <div className="text-right">
                                    <span className="text-lg font-bold text-white mb-2 block">{org.name || 'مؤسسة بدون اسم'}</span>
                                    <span className="text-sm text-slate-400 line-clamp-2 block">{org.industry || 'لم يتم تحديد النشاط'}</span>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDelete(org.id); }}
                                    className="text-slate-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-400/10 transition-colors z-10"
                                    title="حذف المؤسسة"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="pt-6 mt-6 border-t border-slate-800 flex justify-center">
                        <button
                            onClick={handleCreateNew}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl font-bold transition-all shadow-lg"
                        >
                            <Plus className="w-5 h-5 text-emerald-400" /> إضافة مؤسسة أخرى
                        </button>
                    </div>
                </div>
            )}
          </div>
        ) : (
          <>
            <div className="mb-2 flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                <button
                    onClick={() => setViewMode('list')}
                    className="text-slate-400 hover:text-white transition-colors text-sm font-medium flex items-center gap-2"
                >
                    &rarr; العودة لقائمة المؤسسات
                </button>
                <div className="flex items-center gap-4">
                    <span className="text-white font-bold text-sm">
                        {orgId ? 'تعديل بيانات المؤسسة' : 'إنشاء مؤسسة جديدة'}
                    </span>
                    {orgId && (
                        <button
                            onClick={() => handleDelete(orgId)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-lg transition-colors flex items-center gap-2 text-sm"
                        >
                            <Trash2 className="w-4 h-4" />
                            حذف
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-4 mt-6">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all ${
                      isActive 
                        ? ("highlight" in tab && tab.highlight) ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/20' : 'bg-slate-800 text-white shadow-md'
                        : ("highlight" in tab && tab.highlight) ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30' : 'bg-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive && ("highlight" in tab && tab.highlight) ? 'animate-pulse' : ''}`} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-6 mt-6">
              {activeTab === 'basics' && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-lg animate-in fade-in slide-in-from-bottom-4">
                  <h3 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-3 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-blue-400" /> البيانات الأساسية
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">اسم المؤسسة</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="مثال: شركة الابتكار التقني..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">النشاط ومجال العمل</label>
                      <input
                        type="text"
                        value={formData.industry}
                        onChange={(e) => handleChange('industry', e.target.value)}
                        placeholder="مثال: تطوير البرمجيات والذكاء الاصطناعي..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">الهيكل التنظيمي</label>
                    <textarea
                      value={formData.structure}
                      onChange={(e) => handleChange('structure', e.target.value)}
                      rows={3}
                      placeholder="صف الهيكل التنظيمي (مثال: مجلس إدارة، إدارة تنفيذية، قسم التقنية، قسم المبيعات...)"
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-slate-300">الموظفون والمشاركون</label>
                      <button
                        onClick={() => handleChange('employees', [...formData.employees, { name: '', role: '', department: '' }])}
                        className="text-xs flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> إضافة مشارك
                      </button>
                    </div>
                    <div className="space-y-3">
                      {formData.employees.map((emp, idx) => {
                        const currentStyle = emp.thinkingStyle ? THINKING_STYLES[emp.thinkingStyle as keyof typeof THINKING_STYLES] : null;
                        const currentRisk = emp.riskStance ? RISK_STANCES[emp.riskStance as keyof typeof RISK_STANCES] : null;
                        return (
                          <div key={idx} className="flex flex-col sm:flex-row gap-2.5 items-start bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/80 hover:border-slate-600 transition-all">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 w-full">
                              <input
                                type="text"
                                value={emp.name}
                                onChange={(e) => {
                                  const newEmp = [...formData.employees];
                                  newEmp[idx].name = e.target.value;
                                  handleChange('employees', newEmp);
                                }}
                                placeholder="الاسم"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                              />
                              <input
                                type="text"
                                value={emp.role}
                                onChange={(e) => {
                                  const newEmp = [...formData.employees];
                                  newEmp[idx].role = e.target.value;
                                  handleChange('employees', newEmp);
                                }}
                                placeholder="الصفة / المنصب"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                              />
                              <input
                                type="text"
                                value={emp.department}
                                onChange={(e) => {
                                  const newEmp = [...formData.employees];
                                  newEmp[idx].department = e.target.value;
                                  handleChange('employees', newEmp);
                                }}
                                placeholder="القسم"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                              />
                            </div>

                            {/* Cognitive Persona Trigger & Badges */}
                            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0 pt-1 sm:pt-0">
                              <button
                                type="button"
                                onClick={() => setSelectedMemberForPersona({ member: emp, index: idx })}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                                title="تحديد نمط تفكير العضو وتوجهاته وطرق إقناعه للذكاء الاصطناعي"
                              >
                                <Brain className="w-3.5 h-3.5 text-indigo-400" />
                                {currentStyle ? (
                                  <span className="truncate max-w-[120px]">{currentStyle.label}</span>
                                ) : (
                                  <span>تحديد نمط التفكير</span>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const newEmp = [...formData.employees];
                                  newEmp.splice(idx, 1);
                                  handleChange('employees', newEmp);
                                }}
                                className="text-slate-500 hover:text-red-400 p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer"
                                title="حذف العضو"
                              >
                                &times;
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {formData.employees.length === 0 && (
                        <div className="text-center py-4 bg-slate-800/30 border border-slate-700/50 rounded-xl text-slate-500 text-sm">
                          لم يتم إضافة أي مشاركين بعد
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'strategy' && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-lg animate-in fade-in slide-in-from-bottom-4">
                  <h3 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-3 flex items-center gap-2">
                    <Target className="w-5 h-5 text-indigo-400" /> الاستراتيجية والأهداف
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">الأهداف الاستراتيجية (Goals)</label>
                    <textarea
                      value={formData.goals}
                      onChange={(e) => handleChange('goals', e.target.value)}
                      rows={3}
                      placeholder="ما هي الأهداف الرئيسية التي تسعى المؤسسة لتحقيقها؟..."
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">الاستراتيجية المتبعة (Strategy)</label>
                    <textarea
                      value={formData.strategy}
                      onChange={(e) => handleChange('strategy', e.target.value)}
                      rows={4}
                      placeholder="كيف سيتم تحقيق هذه الأهداف؟ ما هي الخطوط العريضة؟..."
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">مؤشرات الأداء (KPIs)</label>
                    <textarea
                      value={formData.kpis}
                      onChange={(e) => handleChange('kpis', e.target.value)}
                      rows={3}
                      placeholder="كيف تقيس المؤسسة نجاحها؟ (مثال: نمو الإيرادات 20%، نسبة رضا العملاء 90%)..."
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'operations' && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-lg animate-in fade-in slide-in-from-bottom-4">
                  <h3 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-3 flex items-center gap-2">
                    <Folders className="w-5 h-5 text-emerald-400" /> العمليات والموارد
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">الميزانية والموارد</label>
                      <textarea
                        value={formData.budget}
                        onChange={(e) => handleChange('budget', e.target.value)}
                        rows={4}
                        placeholder="معلومات عن الميزانية المتاحة وتوزيع الموارد..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">المشاريع الحالية</label>
                      <textarea
                        value={formData.projects}
                        onChange={(e) => handleChange('projects', e.target.value)}
                        rows={4}
                        placeholder="أهم المشاريع والمبادرات الجاري العمل عليها حالياً..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">السياسات الحاكمة (Policies)</label>
                      <textarea
                        value={formData.policies}
                        onChange={(e) => handleChange('policies', e.target.value)}
                        rows={4}
                        placeholder="أهم السياسات (مثل سياسة التسعير، التوظيف، الخصوصية)..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">الإجراءات (Procedures)</label>
                      <textarea
                        value={formData.procedures}
                        onChange={(e) => handleChange('procedures', e.target.value)}
                        rows={4}
                        placeholder="كيف تتم العمليات الحساسة (مثل اعتماد المشتريات، التوظيف)..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-lg animate-in fade-in slide-in-from-bottom-4">
                  <h3 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-3 flex items-center gap-2">
                    <History className="w-5 h-5 text-purple-400" /> السجل التاريخي الأولي
                  </h3>
                  <p className="text-sm text-slate-400 mb-4">
                    يمكنك إضافة ملخص لأهم القرارات والاجتماعات السابقة ليكون الخبير على دراية بالقرارات المتخذة مسبقاً.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">قرارات سابقة بارزة</label>
                      <textarea
                        value={formData.pastDecisions}
                        onChange={(e) => handleChange('pastDecisions', e.target.value)}
                        rows={5}
                        placeholder="أهم القرارات الاستراتيجية التي تم اتخاذها في الماضي القريب..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">ملخص اجتماعات سابقة</label>
                      <textarea
                        value={formData.pastMeetings}
                        onChange={(e) => handleChange('pastMeetings', e.target.value)}
                        rows={5}
                        placeholder="ملخص لما تم مناقشته في آخر اجتماعات مجلس الإدارة..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'upload' && (
                <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-purple-500/30 rounded-3xl p-6 md:p-10 space-y-8 shadow-xl animate-in fade-in slide-in-from-bottom-4 text-center">
                  <div className="max-w-xl mx-auto space-y-4">
                    <div className="w-16 h-16 bg-purple-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <Sparkles className="w-8 h-8 text-purple-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">محلل الوثائق الذكي</h3>
                    <p className="text-slate-300 leading-relaxed">
                      هل لديك ملف تعريفي للشركة (PDF, Word, Text) يحتوي على الهيكل التنظيمي، الأهداف، والسياسات؟ 
                      قم برفعه هنا وسيقوم الذكاء الاصطناعي بقراءته وتفريغ محتواه في الخانات المناسبة تلقائياً لتوفير وقتك!
                    </p>
                  </div>
                  <div className="max-w-md mx-auto">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden"
                      accept=".pdf,.txt,.md,.json,.docx,.xlsx,.csv"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={extracting}
                      className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-bold text-lg transition-all shadow-lg shadow-purple-900/30 disabled:opacity-50"
                    >
                      {extracting ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" />
                          جاري تحليل المستند واستخراج البيانات...
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-6 h-6" />
                          اختر ملفاً لرفعه وتحليله
                        </>
                      )}
                    </button>
                    <p className="text-xs text-slate-400 mt-4">يدعم ملفات PDF، والنصوص (TXT).</p>
                  </div>
                  {extractSuccess && (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 font-medium max-w-md mx-auto animate-in zoom-in">
                      🎉 تم تحليل المستند وتفريغ البيانات في التبويبات بنجاح! راجعها وقم بحفظها.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="sticky bottom-6 bg-slate-800/90 backdrop-blur-md border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between shadow-2xl z-10 mt-8">
              <div className="text-sm">
                {saved && (
                  <span className="flex items-center gap-2 text-emerald-400 font-medium animate-in fade-in">
                    <CheckCircle2 className="w-5 h-5" />
                    تم حفظ بيانات المؤسسة بنجاح!
                  </span>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving || extracting}
                className="flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/20"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                حفظ وتحديث البطاقة
              </button>
            </div>
          </>
        )}
      </div>

      {/* Member Cognitive Profile Modal */}
      {selectedMemberForPersona && (
        <MemberPersonaModal
          isOpen={!!selectedMemberForPersona}
          onClose={() => setSelectedMemberForPersona(null)}
          member={selectedMemberForPersona.member}
          onSave={(updatedMember) => {
            const newEmployees = [...formData.employees];
            newEmployees[selectedMemberForPersona.index] = updatedMember;
            handleChange('employees', newEmployees);
            setSelectedMemberForPersona(null);
          }}
        />
      )}
    </div>
  );
}
