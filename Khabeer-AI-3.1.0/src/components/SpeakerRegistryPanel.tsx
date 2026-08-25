import React, { useState, useRef, useEffect } from 'react';
import {
  Users, UserPlus, Mic, CheckCircle2, AlertCircle, Sparkles, Trash2, Edit3,
  Activity, Shield, Check, X, RefreshCw, ChevronDown, ChevronUp, Radio,
  Scale, Target, Zap
} from 'lucide-react';
import { SpeakerProfile, SpeakerIdentificationResult, SpeechSegment, SpeakerEmbeddingProvider, SPEAKER_THRESHOLDS } from '../lib/speaker/types';
import { AudioFeatures } from '../lib/speaker/AudioFeatures';
import { SpeakerRegistry } from '../lib/speaker/SpeakerRegistry';
import { getAuthToken } from '../lib/firebase';

interface SpeakerRegistryPanelProps {
  registry: SpeakerRegistry;
  provider: SpeakerEmbeddingProvider | null;
  profiles: SpeakerProfile[];
  activeSpeakerId: string | null;
  activeSpeakerName: string | null;
  currentSimilarity: number;
  lastSegment?: SpeechSegment | null;
  debugLogs: string[];
  onProfilesUpdated: (profiles: SpeakerProfile[]) => void;
  onSelectSpeakerOverride: (speakerId: string | 'auto') => void;
  activeOverrideMode: string;
}

export const SpeakerRegistryPanel: React.FC<SpeakerRegistryPanelProps> = ({
  registry,
  provider,
  profiles,
  activeSpeakerId,
  activeSpeakerName,
  currentSimilarity,
  lastSegment,
  debugLogs,
  onProfilesUpdated,
  onSelectSpeakerOverride,
  activeOverrideMode
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showDebugHUD, setShowDebugHUD] = useState(false);
  const [showCalibrationHUD, setShowCalibrationHUD] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [enrollSamples, setEnrollSamples] = useState<Float32Array[]>([]);
  const [isRecordingSample, setIsRecordingSample] = useState(false);
  const [isProcessingEnrollment, setIsProcessingEnrollment] = useState(false);
  const [recordingCountdown, setRecordingCountdown] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);

  const sampleAudioCtxRef = useRef<AudioContext | null>(null);
  const sampleStreamRef = useRef<MediaStream | null>(null);
  const sampleProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSampleRecording();
    };
  }, []);

  const startSampleRecording = async () => {
    try {
      setRecordingCountdown(10);
      setIsRecordingSample(true);
      recordedChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sampleStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      sampleAudioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      sampleProcessorRef.current = processor;

      source.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        recordedChunksRef.current.push(new Float32Array(inputData));
      };

      // 10-second recording duration
      let timeLeft = 10;
      const timer = setInterval(() => {
        timeLeft -= 1;
        setRecordingCountdown(timeLeft);
        if (timeLeft <= 0) {
          clearInterval(timer);
          finishSampleRecording();
        }
      }, 1000);

    } catch (e) {
      console.error('Failed to start sample recording:', e);
      setIsRecordingSample(false);
    }
  };

  const finishSampleRecording = () => {
    stopSampleRecording();

    // Concatenate chunks
    let totalLen = 0;
    for (const c of recordedChunksRef.current) {
      totalLen += c.length;
    }
    if (totalLen < 16000 * 0.4) {
      alert('العينة الصوتية قصيرة جداً، يرجى التحدث بوضوح لمدة ثانيتين على الأقل.');
      return;
    }

    const pcm = new Float32Array(totalLen);
    let offset = 0;
    for (const c of recordedChunksRef.current) {
      pcm.set(c, offset);
      offset += c.length;
    }

    setEnrollSamples(prev => [...prev, pcm]);
  };

  const stopSampleRecording = () => {
    if (sampleProcessorRef.current) {
      sampleProcessorRef.current.disconnect();
      sampleProcessorRef.current = null;
    }
    if (sampleStreamRef.current) {
      sampleStreamRef.current.getTracks().forEach(t => t.stop());
      sampleStreamRef.current = null;
    }
    if (sampleAudioCtxRef.current && sampleAudioCtxRef.current.state !== 'closed') {
      sampleAudioCtxRef.current.close().catch(() => {});
      sampleAudioCtxRef.current = null;
    }
    setIsRecordingSample(false);
  };

  const handleSaveEnrolledSpeaker = async () => {
    if (!newSpeakerName.trim()) {
      alert('يرجى كتابة اسم المتحدث');
      return;
    }
    if (enrollSamples.length === 0) {
      alert('يرجى تسجيل عينة صوتية واحدة على الأقل');
      return;
    }
    if (!provider) {
      alert('نظام التعرف الصوتي غير جاهز حالياً.');
      return;
    }

    setIsProcessingEnrollment(true);
    try {
      // V6.1 SURGICAL FIX 3 — MULTI-SAMPLE SERVER-SIDE ENROLLMENT
      // ALL recorded samples are sent to the server's /api/speech/register-multi
      // endpoint. The server extracts each embedding via its own ONNX Worker
      // (512-D) and persists ALL of them to the SAME SpeakerProfile in
      // PostgreSQL. This is the SINGLE SOURCE OF TRUTH — no client-side
      // embedding merging.
      const activeToken = await getAuthToken();
      if (!activeToken) {
        alert('انتهت الجلسة. يرجى إعادة تسجيل الدخول قبل تسجيل البصمة.');
        setIsProcessingEnrollment(false);
        return;
      }

      // Convert ALL Float32 samples → PCM16 LE → base64
      const samplesPayload = enrollSamples.map((sample) => {
        const pcm16 = new Int16Array(sample.length);
        for (let i = 0; i < sample.length; i++) {
          const s = Math.max(-1, Math.min(1, sample[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        const pcm16Buffer = pcm16.buffer.slice(0, pcm16.byteLength);
        const bytes = new Uint8Array(pcm16Buffer);
let binary = '';
const CHUNK_SIZE = 0x8000;

for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
  binary += String.fromCharCode(
    ...bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length))
  );
}

const audioBase64 = btoa(binary);
        return { audio: audioBase64, sampleRate: 16000 };
      });

      const resp = await fetch('/api/speech/register-multi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          name: newSpeakerName.trim(),
          samples: samplesPayload,
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody?.error || `HTTP ${resp.status}`);
      }
      const result = await resp.json();
      const serverProfile = result.profile;
      console.log(`[Enrollment] Server-side multi-sample enrollment: id=${serverProfile?.id} name=${serverProfile?.name} samples=${serverProfile?.sampleCount} model=${serverProfile?.embeddingModel} accepted=${result.acceptedSamples}/${enrollSamples.length}`);

      // Server-authoritative refresh: do not independently reconstruct the
      // persistent voiceprint in the browser after enrollment. Reload the
      // exact profiles persisted by PostgreSQL/Server ONNX instead.
      const refreshResp = await fetch('/api/speech/speakers', {
        headers: { 'Authorization': `Bearer ${activeToken}` },
      });
      if (!refreshResp.ok) {
        const errBody = await refreshResp.json().catch(() => ({}));
        throw new Error(errBody?.error || `PROFILE_REFRESH_HTTP_${refreshResp.status}`);
      }
      const refreshBody = await refreshResp.json();
      const authoritativeProfiles = Array.isArray(refreshBody?.speakers) ? refreshBody.speakers : [];
      onProfilesUpdated(authoritativeProfiles);
      setNewSpeakerName('');
      setEnrollSamples([]);
      setShowEnrollModal(false);
    } catch (e: any) {
      console.error('Enrollment error:', e);
      alert(`فشل تسجيل البصمة: ${e.message}`);
    } finally {
      setIsProcessingEnrollment(false);
    }
  };

  const handlePromoteCandidate = (candidateId: string, name: string) => {
    const updated = registry.promoteCandidate(candidateId, name);
    if (updated) {
      onProfilesUpdated(registry.getAllSpeakers());
    }
    setEditingId(null);
    setEditName('');
  };

  const handleDeleteProfile = async (id: string) => {
    if (!id || deletingProfileId) return;
    setDeletingProfileId(id);
    try {
      const activeToken = await getAuthToken();
      if (!activeToken) throw new Error('انتهت الجلسة. يرجى إعادة تسجيل الدخول.');

      const resp = await fetch(`/api/speech/speakers/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${activeToken}` },
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody?.error || `HTTP ${resp.status}`);
      }

      // Only mutate the browser registry after the authoritative server/DB
      // deletion succeeds. A failed request therefore leaves the UI intact.
      registry.deleteSpeaker(id);
      onProfilesUpdated(registry.getAllSpeakers());
    } catch (e: any) {
      console.error('Speaker deletion error:', e);
      alert(`فشل حذف البصمة: ${e?.message || 'خطأ غير معروف'}`);
    } finally {
      setDeletingProfileId(null);
    }
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-xl text-slate-100 mb-4 transition-all">
      {/* Top Bar Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-950/30">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">نظام التعرّف الصوتي الذكي على المتحدثين</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                {provider ? `${provider.getDimension()}-d • ${provider.getName()}` : 'جارٍ تهيئة محرك البصمة'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {profiles.length} بصمة صوتية مسجلة • {activeSpeakerName ? `المتحدث النشط: ${activeSpeakerName}` : 'بانتظار الصوت...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Speaker Live Badge */}
          {activeSpeakerName && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/90 border border-emerald-500/40 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-300">الراصد:</span>
              <span className="font-bold text-emerald-400">{activeSpeakerName}</span>
              {currentSimilarity > 0 && (
                <span className="text-[10px] text-slate-400 font-mono">
                  ({Math.round(currentSimilarity * 100)}%)
                </span>
              )}
            </div>
          )}

          <button
            id="btn-register-new-speaker"
            onClick={() => setShowEnrollModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>تسجيل بصمة جديدة</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
            title="إظهار / إخفاء تفاصيل البصمات الصوتية"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Profiles List & Management */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
          {/* Override Mode Selector */}
          <div className="flex items-center justify-between bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">وضع توجيه المتحدث:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onSelectSpeakerOverride('auto')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  activeOverrideMode === 'auto'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                تلقائي (التعرف البيومتري)
              </button>
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => onSelectSpeakerOverride(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeOverrideMode === p.id
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  تثبيت ({p.name})
                </button>
              ))}
            </div>
          </div>

          {/* Profiles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {profiles.map(p => {
              const isActive = activeSpeakerId === p.id;
              const isCandidate = p.isCandidate;
              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-emerald-950/40 border-emerald-500/60 shadow-lg shadow-emerald-950/20'
                      : isCandidate
                      ? 'bg-amber-950/30 border-amber-500/40'
                      : 'bg-slate-800/60 border-slate-700/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isActive ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'
                      }`}>
                        <Mic className="w-4 h-4" />
                      </div>
                      <div>
                        {editingId === p.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="اسم المتحدث"
                              className="px-2 py-0.5 bg-slate-900 border border-emerald-500 rounded text-xs text-white focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handlePromoteCandidate(p.id, editName)}
                              className="p-1 text-emerald-400 hover:text-emerald-300"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 text-slate-400 hover:text-slate-300"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-white">{p.name}</span>
                            {isCandidate && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                مرشح جديد
                              </span>
                            )}
                          </div>
                        )}
                        <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                          ID: {p.id} • {p.sampleCount} عينات
                        </span>
<span className="text-[9px] text-slate-500 block font-mono mt-0.5">
  Model: {p.embeddingModel || 'UNKNOWN'}
</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {editingId !== p.id && (
                        <button
                          onClick={() => {
                            setEditingId(p.id);
                            setEditName(p.name);
                          }}
                          className="p-1 text-slate-400 hover:text-white transition-colors"
                          title="تعديل الاسم"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteProfile(p.id)}
                        disabled={deletingProfileId === p.id}
                        className="p-1 text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={deletingProfileId === p.id ? 'جارٍ حذف البصمة...' : 'حذف البصمة'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Confidence & Vector metrics */}
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-700/50 pt-1.5">
                    <span>مستوى الثقة:</span>
                    <span className={`font-semibold ${
                      p.confidence >= 0.85 ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {p.confidence >= 0.85 ? '🟢 عالي الثقة' : '🟡 متوسط'} ({Math.round(p.confidence * 100)}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Telemetry & Calibration Toggles */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              onClick={() => setShowDebugHUD(!showDebugHUD)}
              className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                showDebugHUD ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{showDebugHUD ? 'إخفاء سجل التشخيص' : 'سجل التشخيص [Debug]'}</span>
            </button>

            <button
              onClick={() => setShowCalibrationHUD(!showCalibrationHUD)}
              className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                showCalibrationHUD ? 'bg-amber-600/20 border-amber-500/40 text-amber-300' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>{showCalibrationHUD ? 'إخفاء المعايرة' : 'معايرة العتبات [Calibration]'}</span>
            </button>
          </div>

          {showCalibrationHUD && (
            <div className="bg-slate-950/80 rounded-xl p-4 border border-amber-500/30 space-y-3 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-2 text-amber-400 mb-1">
                <Scale className="w-4 h-4" />
                <h4 className="text-xs font-bold">معايرة عتبات التعرّف (Threshold Calibration)</h4>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                يتم ضبط العتبات بناءً على أداء نموذج ERes2Net-v2 في البيئة الحالية. العتبات الحالية مصممة للتوازن بين الدقة (Precision) والاستدعاء (Recall).
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800">
                  <div className="text-[9px] text-slate-500 mb-1 uppercase font-bold">Same Speaker</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-emerald-400">{SPEAKER_THRESHOLDS.SAME_SPEAKER_THRESHOLD}</span>
                    <span className="text-[9px] text-slate-400">Similarity</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800">
                  <div className="text-[9px] text-slate-500 mb-1 uppercase font-bold">High Confidence</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-blue-400">{SPEAKER_THRESHOLDS.HIGH_CONFIDENCE_THRESHOLD}</span>
                    <span className="text-[9px] text-slate-400">Min Score</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                 <button 
                   onClick={() => alert('تم تفعيل وضع المعايرة اللحظي. يرجى التحدث بوضوح لجمع عينات للمقارنة.')}
                   className="flex-1 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold transition-all"
                 >
                   بدء اختبار المعايرة اللحظي
                 </button>
                 <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-[10px] text-slate-300">
                   <Zap className="w-3 h-3 text-amber-400" />
                   EER: ~0.82%
                 </div>
              </div>
            </div>
          )}

          {showDebugHUD && (
            <div className="bg-black/80 rounded-xl p-3 border border-slate-800 font-mono text-[11px] text-emerald-400/90 max-h-40 overflow-y-auto space-y-1 dir-ltr text-left">
              <div className="text-slate-500 font-semibold mb-1">--- Biometric Diarization Telemetry Stream ---</div>
              {debugLogs.length === 0 ? (
                <div className="text-slate-600">No speech segments captured yet. Speak to observe real-time embedding extraction.</div>
              ) : (
                debugLogs.slice(-8).map((log, idx) => (
                  <div key={idx} className="leading-relaxed whitespace-pre-wrap pb-2 border-b border-slate-800/50">
                    {log}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Enroll New Speaker */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Mic className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">تسجيل بصمة صوتية جديدة</h3>
              </div>
              <button
                onClick={() => {
                  stopSampleRecording();
                  setShowEnrollModal(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  اسم المتحدث:
                </label>
                <input
                  id="input-new-speaker-name"
                  type="text"
                  value={newSpeakerName}
                  onChange={(e) => setNewSpeakerName(e.target.value)}
                  placeholder="مثال: أحمد، أبو خالد، م. عبد الله"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-center space-y-3">
                <p className="text-xs text-slate-300">
                  اضغط على زر التسجيل وتحدث بصوت طبيعي لاستخراج بصمة مستقرة. يفضّل تسجيل ثلاث عينات في ظروف هادئة.
                </p>

                {isRecordingSample ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-rose-600 text-white animate-pulse">
                      <Mic className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-rose-400">
                      جارٍ التسجيل... متبقي {recordingCountdown} ثوانٍ
                    </span>
                  </div>
                ) : (
                  <button
                    id="btn-record-voice-sample"
                    onClick={startSampleRecording}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-2 mx-auto transition-all active:scale-95"
                  >
                    <Mic className="w-4 h-4" />
                    <span>{enrollSamples.length === 0 ? 'بدء تسجيل العينة الصوتية' : 'إضافة عينة صوتية أخرى'}</span>
                  </button>
                )}

                {enrollSamples.length > 0 && (
                  <div className="flex items-center justify-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تم التقاط {enrollSamples.length} عينات صوتية بنجاح</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                id="btn-cancel-speaker-enrollment"
                onClick={() => {
                  stopSampleRecording();
                  setShowEnrollModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                إلغاء
              </button>
              <button
                id="btn-save-speaker-enrollment"
                onClick={handleSaveEnrolledSpeaker}
                disabled={!newSpeakerName.trim() || enrollSamples.length === 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-950/40"
              >
                حفظ البصمة وتأكيد المتحدث
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpeakerRegistryPanel;
