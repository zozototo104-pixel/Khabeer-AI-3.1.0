import { useState, useEffect, useRef, ChangeEvent, DragEvent } from 'react';
import { 
  UploadCloud, FileText, Database, Shield, Layout, FileSpreadsheet, 
  FileIcon, Trash2, CheckCircle2, Search, Eye, AlertCircle, 
  Loader2, RefreshCw, Layers, Sparkles, Download
} from 'lucide-react';
import { getAuthToken } from '../lib/firebase';
import ConfirmModal from './ConfirmModal';

interface KnowledgeDoc {
  id: number;
  orgId: number;
  title: string;
  content: string;
  createdAt: string;
  textQuality?: {
    usable: boolean;
    reason: string;
  };
  extractionMethod?: 'VERIFIED_OCR' | 'NATIVE_TEXT';
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  sha256?: string;
  hasOriginalFile?: boolean;
  processingStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED' | null;
  processingError?: string | null;
  processedPages?: number | null;
  pageCount?: number | null;
}

interface KnowledgeBaseProps {
  token?: string | null;
}

export default function KnowledgeBase({ token: propToken }: KnowledgeBaseProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadingDocId, setDownloadingDocId] = useState<number | null>(null);
  const [reprocessingDocId, setReprocessingDocId] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [organizations, setOrganizations] = useState<Array<{ id: number; name?: string }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Modals state
  const [docToDelete, setDocToDelete] = useState<KnowledgeDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<KnowledgeDoc | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const activeToken = await getAuthToken() || propToken;
        if (!activeToken) return;
        const res = await fetch('/api/organization', { headers: { Authorization: `Bearer ${activeToken}` } });
        if (!res.ok) return;
        const orgs = await res.json();
        if (!active || !Array.isArray(orgs)) return;
        setOrganizations(orgs);
        setSelectedOrgId(prev => prev || (orgs[0]?.id ? String(orgs[0].id) : ''));
      } catch (e) {
        console.error('Error fetching organizations for knowledge base:', e);
      }
    })();
    return () => { active = false; };
  }, [propToken]);

  useEffect(() => {
    if (selectedOrgId) fetchDocuments();
    else {
      setDocuments([]);
      setIsLoading(false);
    }
  }, [propToken, selectedOrgId]);

  useEffect(() => {
    if (!selectedOrgId) return;
    const hasProcessingDocs = documents.some((doc) => doc.processingStatus === 'PENDING' || doc.processingStatus === 'PROCESSING');
    if (!hasProcessingDocs) return;
    const timer = window.setInterval(() => {
      void fetchDocuments();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [documents, selectedOrgId, propToken]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const activeToken = await getAuthToken() || propToken;
      if (!activeToken) {
        setIsLoading(false);
        return;
      }
      
      const res = await fetch(`/api/knowledge?orgId=${encodeURIComponent(selectedOrgId)}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر تحميل المستندات المرجعية');
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setDocuments(data);
      }
    } catch (e) {
      console.error('Error fetching knowledge docs:', e);
      setStatusMessage({ type: 'error', text: e instanceof Error ? e.message : 'تعذر تحميل المستندات المرجعية.' });
    } finally {
      setIsLoading(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setStatusMessage(null);
    try {
      // Prefer a freshly resolved Firebase ID token for long-lived mobile/PWA
      // sessions. propToken may have been captured at sign-in and can expire
      // while the Knowledge Base page stays open for an extended period.
      const activeToken = await getAuthToken() || propToken;
      if (!activeToken) {
        throw new Error('يرجى التحقق من تسجيل الدخول أولاً');
      }

      const formData = new FormData();
      // Pass original file directly to FormData (fixes Safari regex/pattern constructor bug)
      formData.append('originalName', encodeURIComponent(file.name));
      if (selectedOrgId) formData.append('orgId', selectedOrgId);
      // Keep metadata before the binary part so multer can report the filename
      // even when the file itself is rejected by the size/count limits.
      formData.append('file', file);

      setUploadProgress(0);
      const data = await new Promise<any>((resolve, reject) => {
        const request = new XMLHttpRequest();
        let uploadInactivityTimer: number | null = null;
        let processingTimer: number | null = null;
        let clientTimeoutMessage = '';
        const clearTimers = () => {
          if (uploadInactivityTimer !== null) window.clearTimeout(uploadInactivityTimer);
          if (processingTimer !== null) window.clearTimeout(processingTimer);
          uploadInactivityTimer = null;
          processingTimer = null;
        };
        const abortForTimeout = (message: string) => {
          clientTimeoutMessage = message;
          request.abort();
        };
        const armUploadInactivityTimer = () => {
          if (uploadInactivityTimer !== null) window.clearTimeout(uploadInactivityTimer);
          uploadInactivityTimer = window.setTimeout(() => {
            abortForTimeout('توقف إرسال الملف لمدة 3 دقائق. افحص الاتصال ثم أعد المحاولة؛ لم يتم تسجيل رفع ناقص.');
          }, 180_000);
        };
        request.open('POST', `/api/knowledge?orgId=${encodeURIComponent(selectedOrgId)}`);
        request.setRequestHeader('Authorization', `Bearer ${activeToken}`);
        // Do not let slow upload time consume the server-processing allowance.
        // The two phase-specific watchdogs distinguish network stalls from PDF OCR.
        request.timeout = 0;
        armUploadInactivityTimer();
        request.upload.onprogress = (event) => {
          armUploadInactivityTimer();
          if (event.lengthComputable) setUploadProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        };
        request.upload.onload = () => {
          if (uploadInactivityTimer !== null) window.clearTimeout(uploadInactivityTimer);
          uploadInactivityTimer = null;
          setUploadProgress(99);
          const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
          processingTimer = window.setTimeout(() => {
            abortForTimeout(isPdf
              ? 'اكتمل إرسال PDF لكن الخادم لم يُنهِ الاستخراج خلال 15 دقيقة. راجع سجل KnowledgeUpload لمعرفة المرحلة المتوقفة.'
              : 'اكتمل إرسال الملف لكن الخادم لم يُنهِ الاستخراج والحفظ خلال 4 دقائق. راجع سجل KnowledgeUpload لمعرفة المرحلة المتوقفة.');
          }, isPdf ? 900_000 : 240_000);
        };
        request.onload = () => {
          clearTimers();
          let body: any = {};
          try { body = JSON.parse(request.responseText || '{}'); } catch {}
          if (request.status >= 200 && request.status < 300) resolve(body);
          else reject(new Error(body.error || `${body.code ? `[${body.code}] ` : ''}فشل رفع المستند (HTTP ${request.status})`));
        };
        request.onerror = () => {
          clearTimers();
          reject(new Error('انقطع الاتصال أثناء إرسال الملف أو انتظار استجابة الخادم. لم يتم تسجيل رفع ناقص.'));
        };
        request.ontimeout = () => {
          clearTimers();
          reject(new Error('انتهت مهلة اتصال المتصفح بالخادم.'));
        };
        request.onabort = () => {
          clearTimers();
          reject(new Error(clientTimeoutMessage || 'تم إلغاء رفع الملف.'));
        };
        request.send(formData);
      });
      if (data && data.id) {
        setShowSuccess(true);
        setDocuments(prev => [data, ...prev]);
        const extractionLabel = data.extractionMethod === 'VERIFIED_OCR'
          ? ' بعد تشغيل OCR موثق'
          : '';
        const isBackgroundProcessing = data.processingStatus === 'PENDING' || data.processingStatus === 'PROCESSING' || data.extractionMethod === 'BACKGROUND_PDF';
        setStatusMessage({
          type: 'success',
          text: isBackgroundProcessing
            ? `تم حفظ الملف الأصلي "${data.title || file.name}" وبدأت معالجته في الخلفية. ستظهر الصفحات المعالجة تلقائيًا في القائمة.`
            : `تم رفع وفهرسة المستند "${data.title || file.name}" بنجاح${extractionLabel} في قاعدة المعرفة.`,
        });
        setTimeout(() => setShowSuccess(false), 4000);
      } else {
        throw new Error('لم يؤكد الخادم اكتمال حفظ الملف. لم تتم إضافته إلى القائمة.');
      }
    } catch (e: any) {
      console.error('Upload error:', e);
      setStatusMessage({ type: 'error', text: e.message || 'حدث خطأ أثناء معالجة الملف. يرجى المحاولة مجدداً.' });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const reprocessOcr = async (doc: KnowledgeDoc) => {
    if (!doc.hasOriginalFile) return;
    setReprocessingDocId(doc.id);
    setStatusMessage(null);
    try {
      const activeToken = await getAuthToken() || propToken;
      if (!activeToken) throw new Error('يرجى تسجيل الدخول أولاً');
      const res = await fetch(`/api/knowledge/${doc.id}/reprocess?orgId=${encodeURIComponent(selectedOrgId)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذر إعادة تشغيل OCR لهذا المستند');
      setDocuments(prev => prev.map((item) => item.id === doc.id
        ? {
          ...item,
          content: '',
          processingStatus: 'PENDING',
          processingError: null,
          processedPages: 0,
          pageCount: null,
          textQuality: { usable: false, reason: 'document_processing_pending' },
        }
        : item));
      if (previewDoc?.id === doc.id) {
        setPreviewDoc({
          ...previewDoc,
          content: '',
          processingStatus: 'PENDING',
          processingError: null,
          processedPages: 0,
          pageCount: null,
          textQuality: { usable: false, reason: 'document_processing_pending' },
        });
      }
      setStatusMessage({ type: 'success', text: data.message || 'تمت إعادة تشغيل OCR وسيتم تحديث المحتوى تلقائيًا.' });
      void fetchDocuments();
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'تعذر إعادة تشغيل OCR.' });
    } finally {
      setReprocessingDocId(null);
    }
  };

  const downloadOriginal = async (doc: KnowledgeDoc) => {
    if (!doc.hasOriginalFile) return;
    setDownloadingDocId(doc.id);
    try {
      const activeToken = await getAuthToken() || propToken;
      if (!activeToken) throw new Error('يرجى تسجيل الدخول أولاً');
      const res = await fetch(`/api/knowledge/${doc.id}/file?orgId=${encodeURIComponent(selectedOrgId)}`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر تنزيل الملف الأصلي');
      }
      const blob = await res.blob();
      if (doc.fileSize != null && blob.size !== doc.fileSize) {
        throw new Error('فشل التحقق من اكتمال الملف الذي تم تنزيله');
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.fileName || doc.title || 'document';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'تعذر تنزيل الملف الأصلي.' });
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  const triggerFileInput = () => {
    if (!isUploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Confirm delete single document
  const confirmDelete = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    try {
      const activeToken = await getAuthToken() || propToken;
      if (!activeToken) throw new Error('لا يوجد رمز تحقق');

      const res = await fetch(`/api/knowledge/${docToDelete.id}?orgId=${encodeURIComponent(selectedOrgId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== docToDelete.id));
        setStatusMessage({ type: 'success', text: `تم حذف المستند المرجعي "${docToDelete.title}" بنجاح.` });
        setDocToDelete(null);
      } else {
        throw new Error('فشل حذف المستند من الخادم');
      }
    } catch (e: any) {
      console.error('Delete error:', e);
      setStatusMessage({ type: 'error', text: e.message || 'تعذر حذف المستند. يرجى المحاولة لاحقاً.' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Confirm delete all documents
  const confirmClearAll = async () => {
    setIsClearingAll(true);
    try {
      const activeToken = await getAuthToken() || propToken;
      if (!activeToken) throw new Error('لا يوجد رمز تحقق');

      const res = await fetch(`/api/knowledge?orgId=${encodeURIComponent(selectedOrgId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      if (res.ok) {
        setDocuments([]);
        setStatusMessage({ type: 'success', text: 'تم حذف جميع المستندات المرجعية بنجاح.' });
        setShowClearAllModal(false);
      } else {
        throw new Error('فشل إفراغ قاعدة المعرفة');
      }
    } catch (e: any) {
      console.error('Clear all error:', e);
      setStatusMessage({ type: 'error', text: e.message || 'تعذر إفراغ المستندات. يرجى المحاولة لاحقاً.' });
    } finally {
      setIsClearingAll(false);
    }
  };

  const getIcon = (filename: string = '') => {
    const lower = filename.toLowerCase();
    if (lower.endsWith('pdf')) return <FileText className="w-7 h-7 text-rose-400" />;
    if (lower.endsWith('xls') || lower.endsWith('xlsx') || lower.endsWith('csv')) return <FileSpreadsheet className="w-7 h-7 text-emerald-400" />;
    if (lower.endsWith('ppt') || lower.endsWith('pptx')) return <Layout className="w-7 h-7 text-amber-400" />;
    if (lower.endsWith('doc') || lower.endsWith('docx')) return <FileText className="w-7 h-7 text-sky-400" />;
    return <FileIcon className="w-7 h-7 text-indigo-400" />;
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getProcessingProgress = (doc: KnowledgeDoc) => {
    const pageCount = Math.max(0, Number(doc.pageCount || 0));
    const processedPages = Math.max(0, Number(doc.processedPages || 0));
    if (!pageCount) return { processedPages, pageCount, percent: doc.processingStatus === 'COMPLETE' ? 100 : 0 };
    return {
      processedPages: Math.min(processedPages, pageCount),
      pageCount,
      percent: Math.max(0, Math.min(100, Math.round((processedPages / pageCount) * 100))),
    };
  };

  const filteredDocs = documents.filter(doc => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (doc.title && doc.title.toLowerCase().includes(query)) ||
      (doc.content && doc.content.toLowerCase().includes(query))
    );
  });

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-300" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Database className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              الذكاء المؤسسي وقاعدة المعرفة (RAG)
            </h2>
          </div>
          <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
            ارفع السياسات، اللوائح التنظيمية، تقارير التدقيق، والميزانيات ليعتمد عليها المستشار الذكي كمرجع معرفي دقيق أثناء الاجتماعات وصياغة القرارات والمهام.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {organizations.length > 0 && (
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="اختر المؤسسة لقاعدة المعرفة"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>{org.name || `مؤسسة ${org.id}`}</option>
              ))}
            </select>
          )}
          <button
            onClick={fetchDocuments}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

          {documents.length > 0 && (
            <button
              onClick={() => setShowClearAllModal(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
              title="حذف جميع المستندات"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف كافة المراجع</span>
            </button>
          )}
        </div>
      </div>

      {/* Alert Banner */}
      {statusMessage && (
        <div className={`mb-6 p-4 rounded-2xl border flex items-center justify-between gap-3 text-sm animate-in fade-in duration-200 ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
        }`}>
          <div className="flex items-center gap-2.5">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
          <button 
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-slate-900/40"
          >
            إغلاق
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Upload Column (Left / 4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div 
            id="knowledge-dropzone-container"
            onClick={triggerFileInput}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
            block bg-slate-900/90 border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer relative overflow-hidden shadow-xl select-none
            ${isUploading ? 'opacity-85 pointer-events-none border-blue-500/50 bg-slate-900' : ''}
            ${isDragOver ? 'border-blue-400 bg-blue-950/30 scale-[1.01] shadow-blue-500/20' : 'border-slate-700/80 hover:border-blue-500/60 hover:bg-slate-850 hover:shadow-blue-500/5'}
          `}>
            <input 
              ref={fileInputRef}
              type="file" 
              className="sr-only opacity-0 absolute w-0 h-0 pointer-events-none" 
              onChange={handleFileSelect} 
              disabled={isUploading}
              accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json"
            />

            {isUploading ? (
              <div className="py-6 flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/15 flex items-center justify-center mb-4 relative">
                  <div className="absolute inset-0 border-2 border-blue-400 border-t-transparent rounded-2xl animate-spin"></div>
                  <Database className="w-7 h-7 text-blue-400" />
                </div>
                <p className="text-white font-bold text-sm mb-1.5">
                  {uploadProgress < 100 ? `جاري رفع الملف الأصلي... ${uploadProgress}%` : 'اكتمل النقل — جاري التحقق والفهرسة...'}
                </p>
                <div className="w-full max-w-xs h-2 rounded-full bg-slate-800 overflow-hidden mb-2">
                  <div className="h-full bg-blue-500 transition-[width] duration-200" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">لن تظهر رسالة النجاح قبل حفظ الملف كاملاً والتحقق من بصمته</p>
              </div>
            ) : showSuccess ? (
              <div className="py-6 flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4 text-emerald-400 animate-in zoom-in-75 duration-300">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <p className="text-white font-bold text-sm mb-1">تمت إضافة المرجع بنجاح</p>
                <p className="text-xs text-slate-400">أصبح الخبير جاهزاً للاستناد على بنوده فوراً</p>
              </div>
            ) : (
              <div className="py-4 flex flex-col items-center">
                <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-4 transition-transform text-blue-400 ${isDragOver ? 'scale-110 bg-blue-500/20 border-blue-400' : 'bg-slate-800/80 border-slate-700/50 group-hover:scale-105'}`}>
                  <UploadCloud className="w-8 h-8" />
                </div>
                <p className="text-white font-bold text-sm mb-1.5">
                  {isDragOver ? 'أفلت المستند هنا لرفعه مباشرة' : 'اضغط لاختيار مستند مرجعي أو اسحبه هنا'}
                </p>
                <p className="text-xs text-slate-400 mb-4 max-w-xs leading-relaxed">
                  يدعم صيغ PDF، Word (DOCX)، جداول Excel (XLSX, CSV)، ونصوص اللوائح
                </p>
                <button
                  type="button"
                  id="browse-files-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerFileInput();
                  }}
                  className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:border-blue-400 hover:bg-blue-600/30 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>تصفح الملفات من جهازك</span>
                </button>
              </div>
            )}
          </div>

          {/* Info Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-3">
            <div className="flex items-center gap-2.5 text-white font-bold text-sm">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>خصوصية وأمان المعرفة</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              المستندات المرفوعة تُعالج كمعرفة استشارية خاصة بمؤسستك فقط، وتستخدم لتزويد المستشار بالسياق الدقيق أثناء المحادثات وصياغة محاضر الاجتماعات.
            </p>
            <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span>إجمالي المراجع المخزنة:</span>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 font-bold text-white border border-slate-700">
                {documents.length}
              </span>
            </div>
          </div>
        </div>

        {/* Documents List (Right / 8 cols) */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 flex flex-col shadow-xl min-h-[500px]">
          
          {/* List Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <span>المستندات المرجعية المرفوعة (RAG)</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                  {filteredDocs.length} مستند
                </span>
              </h3>
            </div>

            {documents.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="بحث في المراجع والمستندات..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <p className="text-xs">جاري تحميل المستندات المرجعية...</p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-500 gap-3 border border-dashed border-slate-800 rounded-2xl p-8 text-center">
                <Database className="w-10 h-10 text-slate-600 opacity-60" />
                <div>
                  <p className="text-sm font-semibold text-slate-300 mb-1">
                    {searchQuery ? 'لا توجد نتائج مطابقة لبحثك' : 'لا توجد مستندات مرجعية مرفوعة حتى الآن'}
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    {searchQuery ? 'جرب البحث بكلمات أخرى أو امسح شريط البحث' : 'ارفع لوائح وسياسات مؤسستك من القائمة الجانبية لتغذية المستشار الذكي'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredDocs.map((doc) => (
                  <div 
                    key={doc.id} 
                    className="bg-slate-950/60 border border-slate-800/90 hover:border-slate-700/90 rounded-2xl p-4.5 flex flex-col justify-between gap-3.5 transition-all hover:bg-slate-900/90 hover:shadow-lg group relative"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-2xl shadow-inner shrink-0 group-hover:border-slate-700 transition-colors">
                        {getIcon(doc.title)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h4 
                          className="text-sm font-bold text-white mb-1 line-clamp-1 group-hover:text-blue-300 transition-colors cursor-pointer"
                          title={doc.title}
                          onClick={() => setPreviewDoc(doc)}
                        >
                          {doc.title || 'مستند بدون عنوان'}
                        </h4>
                        
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>تم الرفع: {formatDate(doc.createdAt)}</span>
                          <span>•</span>
                          <span className="text-slate-400 font-mono">
                            {doc.processingStatus === 'PENDING' || doc.processingStatus === 'PROCESSING'
                              ? 'قيد المعالجة'
                              : doc.processingStatus === 'FAILED'
                                ? 'فشل الاستخراج'
                                : doc.content ? `${Math.round(doc.content.length / 100) / 10}k حرف` : 'مفهرس'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {(doc.processingStatus === 'PENDING' || doc.processingStatus === 'PROCESSING' || doc.processingStatus === 'FAILED') && (() => {
                      const progress = getProcessingProgress(doc);
                      const isFailed = doc.processingStatus === 'FAILED';
                      return (
                        <div className={`rounded-2xl border p-3 text-xs ${isFailed ? 'bg-rose-500/10 border-rose-500/20 text-rose-200' : 'bg-blue-500/10 border-blue-500/20 text-blue-200'}`}>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="font-bold flex items-center gap-1.5">
                              {isFailed ? <AlertCircle className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              {isFailed ? 'فشلت معالجة المستند' : doc.processingStatus === 'PENDING' ? 'بانتظار بدء المعالجة' : 'جاري استخراج وفهرسة PDF'}
                            </span>
                            {!isFailed && progress.pageCount > 0 && <span className="font-mono">{progress.percent}%</span>}
                          </div>
                          {!isFailed && progress.pageCount > 0 && (
                            <>
                              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mb-1.5">
                                <div className="h-full bg-blue-400 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
                              </div>
                              <div className="text-[11px] text-blue-100/80">{progress.processedPages} / {progress.pageCount} صفحة</div>
                            </>
                          )}
                          {isFailed && <div className="text-[11px] text-rose-100/80 leading-relaxed">{doc.processingError || 'راجع سجلات KnowledgeWorker لمعرفة سبب الفشل.'}</div>}
                        </div>
                      );
                    })()}

                    {/* Action Buttons Bar */}
                    <div className="pt-3 border-t border-slate-800/70 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-white text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="معاينة النص المستخرج"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-400" />
                        <span>معاينة المحتوى</span>
                      </button>

                      <div className="flex items-center gap-2">
                      {doc.hasOriginalFile && (
                        <button
                          type="button"
                          onClick={() => void downloadOriginal(doc)}
                          disabled={downloadingDocId === doc.id}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50"
                          title={`تنزيل الملف الأصلي${doc.sha256 ? ` — SHA-256: ${doc.sha256}` : ''}`}
                        >
                          {downloadingDocId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          <span>الأصل</span>
                        </button>
                      )}

                      {doc.hasOriginalFile
                        && ((doc.mimeType || '').includes('pdf') || /\.pdf$/i.test(doc.fileName || doc.title || ''))
                        && (doc.processingStatus === 'FAILED' || (!doc.content && doc.processingStatus !== 'PENDING' && doc.processingStatus !== 'PROCESSING') || doc.textQuality?.usable === false)
                        && (
                          <button
                            type="button"
                            onClick={() => void reprocessOcr(doc)}
                            disabled={reprocessingDocId === doc.id || doc.processingStatus === 'PENDING' || doc.processingStatus === 'PROCESSING'}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50"
                            title="إعادة استخراج النص من PDF الممسوح ضوئيًا عبر OCR"
                          >
                            {reprocessingDocId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            <span>إعادة OCR</span>
                          </button>
                        )}

                      {/* Prominent Delete Button */}
                      <button 
                        type="button"
                        onClick={() => setDocToDelete(doc)}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                        title="حذف هذا المستند المرجعي"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>حذف المرجع</span>
                      </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Individual Deletion */}
      <ConfirmModal
        isOpen={Boolean(docToDelete)}
        title="تأكيد حذف المستند المرجعي"
        message={`هل أنت متأكد من رغبتك في حذف المرجع "${docToDelete?.title || ''}"؟ سيتم حذفه نهائياً من قاعدة المعرفة ولن يعود الخبير قادراً على الاستناد عليه أثناء الاجتماعات وصياغة القرارات.`}
        confirmText="نعم، احذف المرجع"
        cancelText="إلغاء وتراجع"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={confirmDelete}
        onClose={() => {
          if (!isDeleting) setDocToDelete(null);
        }}
      />

      {/* Confirmation Modal for Delete All */}
      <ConfirmModal
        isOpen={showClearAllModal}
        title="تأكيد حذف كافة المستندات المرجعية"
        message="هل أنت متأكد من رغبتك في حذف جميع المستندات المرجعية وقاعدة المعرفة بالكامل؟ هذا الإجراء نهائي ولا يمكن التراجع عنه."
        confirmText="نعم، حذف الكل"
        cancelText="إلغاء"
        isDestructive={true}
        isLoading={isClearingAll}
        onConfirm={confirmClearAll}
        onClose={() => {
          if (!isClearingAll) setShowClearAllModal(false);
        }}
      />

      {/* Extracted Content Preview Modal */}
      {previewDoc && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          dir="rtl"
          onClick={() => setPreviewDoc(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                  {getIcon(previewDoc.title)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white truncate" title={previewDoc.title}>
                    {previewDoc.title}
                  </h3>
                  <p className="text-xs text-slate-400">
                    تاريخ الرفع: {formatDate(previewDoc.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const d = previewDoc;
                    setPreviewDoc(null);
                    setDocToDelete(d);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>حذف</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {previewDoc.textQuality && !previewDoc.textQuality.usable && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold mb-1">
                      {previewDoc.processingStatus === 'PENDING' || previewDoc.processingStatus === 'PROCESSING'
                        ? 'المستند محفوظ، والنص ما زال قيد استخراج OCR.'
                        : 'النص المستخرج غير متاح أو غير موثوق ولن يستخدمه الخبير.'}
                    </div>
                    <div className="text-amber-100/80 leading-6">
                      {previewDoc.processingStatus === 'PENDING' || previewDoc.processingStatus === 'PROCESSING'
                        ? 'انتظر اكتمال المعالجة؛ سيتم تحديث المحتوى تلقائيًا عند فتح قاعدة المعرفة.'
                        : 'استخدم زر إعادة OCR لإعادة استخراج النص من الملف الأصلي المحفوظ دون الحاجة لحذفه وإعادة رفعه.'}
                    </div>
                    {previewDoc.hasOriginalFile
                      && ((previewDoc.mimeType || '').includes('pdf') || /\.pdf$/i.test(previewDoc.fileName || previewDoc.title || ''))
                      && previewDoc.processingStatus !== 'PENDING'
                      && previewDoc.processingStatus !== 'PROCESSING'
                      && (
                        <button
                          type="button"
                          onClick={() => void reprocessOcr(previewDoc)}
                          disabled={reprocessingDocId === previewDoc.id}
                          className="mt-3 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/25 text-amber-100 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {reprocessingDocId === previewDoc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          <span>إعادة OCR من الملف الأصلي</span>
                        </button>
                      )}
                  </div>
                </div>
              )}
              <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap select-text max-h-[55vh] overflow-y-auto">
                {previewDoc.content || (
                  previewDoc.processingStatus === 'PENDING' || previewDoc.processingStatus === 'PROCESSING'
                    ? 'المحتوى النصي لم يكتمل بعد. المستند الأصلي محفوظ وسيتم عرضه هنا بعد اكتمال OCR.'
                    : 'لا يوجد نص مستخرج متاح لهذا المستند. جرّب إعادة OCR من الملف الأصلي.'
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex items-center justify-between text-xs text-slate-400">
              <span>
                {previewDoc.textQuality && !previewDoc.textQuality.usable
                  ? 'هذا المحتوى معزول عن الخبير بسبب فشل فحص جودة النص'
                  : 'يتم استخدام هذا المحتوى آلياً لتزويد الذكاء الاصطناعي بسياق المؤسسة'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors cursor-pointer"
              >
                تم
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
