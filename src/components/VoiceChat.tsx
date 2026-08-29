import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, MicOff, Square, Loader2, MessageSquare, Settings, Activity, UserCog, 
  AlertTriangle, Shield, Lock, Trash2, ShieldAlert, CheckCircle, FileText,
  Send, Sparkles, Volume2, Copy, Check, RefreshCw, Paperclip, ChevronDown, ChevronUp,
  HelpCircle, BarChart3, Scale, DollarSign, Search, ShieldCheck,
  Brain, Users, Compass, Award, Lightbulb, UserCheck, Edit2, RotateCcw, X, Plus
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { pcmToBase64, base64ToPcm } from '../lib/audio';
import { getAuthToken } from '../lib/firebase';
import ConfirmModal from './ConfirmModal';
import MeetingCognitiveSimulator from './MeetingCognitiveSimulator';
import MemberPersonaModal from './MemberPersonaModal';
import { MemberProfile, THINKING_STYLES, RISK_STANCES } from '../types';
import { SpeakerProfile } from '../lib/speaker/types';
import { SpeakerRegistry } from '../lib/speaker/SpeakerRegistry';
import { DeepSpeakerEmbeddingProvider } from '../lib/speaker/DeepSpeakerEmbeddingProvider';
import SpeakerRegistryPanel from './SpeakerRegistryPanel';
import { loadAssistantSettings } from './Settings';

export interface VoiceFootprint {
  id: string; // e.g. 'male_1', 'male_2', 'female_1'
  label: string; // 'صوت رجالي (بصمة 1)', 'صوت رجالي (بصمة 2)', 'صوت نسائي (بصمة 1)'
  name: string;
  gender: 'male' | 'female';
  avgPitch: number; // in Hz
  avgSpectralCentroid: number; // For better timbre discrimination
  avgZCR: number; // Zero Crossing Rate for breathiness/sharpness
  avgSpectralRolloff: number; // For better timbre discrimination
  sampleCount: number;
  confidence: number; // 0.0 to 1.0
  isCandidate: boolean; // If true, not yet fully trusted
  lastActive: number;
}

type Message = {
  id: string;
  text: string;
  isUser: boolean;
  createdAt?: string | Date;
  speakerId?: string | null;
  speakerName?: string | null;
  speakerConfidence?: number | null;
  turnId?: number;
};

type ExpertProfileSummary = {
  id: string;
  name: string;
  category: string;
  domain: string;
  description: string;
  capabilities: string[];
};

const normalizeSpeakerNameForUiDedupe = (name: string): string => String(name || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/[إأآا]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .toLowerCase();

const dedupeSpeakerProfilesForUi = (profiles: SpeakerProfile[]): SpeakerProfile[] => {
  const byName = new Map<string, SpeakerProfile>();
  for (const profile of profiles.filter((item) => item && !item.isCandidate && !String(item.id || '').startsWith('unknown_') && !String(item.id || '').startsWith('candidate_'))) {
    const key = normalizeSpeakerNameForUiDedupe(profile.name);
    if (!key) continue;
    const current = byName.get(key);
    if (!current || (profile.updatedAt || 0) >= (current.updatedAt || 0)) {
      byName.set(key, profile);
    }
  }
  return Array.from(byName.values());
};

const EXPERT_CATEGORY_LABELS: Record<string, string> = {
  GOVERNANCE_CONTROL: 'الحوكمة والرقابة',
  MANAGEMENT_STRATEGY: 'الإدارة والاستراتيجية',
  FINANCE_ACCOUNTING: 'المالية والمحاسبة',
  LEGAL_COMPLIANCE: 'القانون والالتزام',
  ENGINEERING_TECHNOLOGY: 'الهندسة والتقنية',
  PEOPLE_SAFETY: 'الأفراد والسلامة والاستمرارية',
};

interface VoiceChatProps {
  token: string | null;
  sessionId?: string | number | null;
  onSessionCreated?: (newSessionId: number, title?: string) => void;
  onSessionDeleted?: (sessionId: number) => void;
  onSessionUpdated?: (sessionId: number, title: string) => void;
  guestInviteToken?: string | null;
  guestDisplayName?: string;
}

const EXPERT_MODES = {
  CONSULTANT: { id: 'CONSULTANT', label: 'المستشار الرقابي', desc: 'يشارك في النقاش ويقدم التوصيات والحلول الرقابية بحرية.' },
  OBSERVER: { id: 'OBSERVER', label: 'المراقب الصامت', desc: 'يستمع فقط، ولا يتدخل إلا عند وجود خطر طارئ أو مخالفة جسيمة.' },
  CRITIC: { id: 'CRITIC', label: 'الناقد والمدقق', desc: 'يركز فقط على كشف الثغرات، الأخطاء، والافتراضات الضعيفة.' },
  STRATEGIST: { id: 'STRATEGIST', label: 'المحلل الاستراتيجي', desc: 'يركز على الامتثال بعيد المدى، مؤشرات SWOT، وتأثير القرارات.' },
  DECISION_MAKER: { id: 'DECISION_MAKER', label: 'صانع القرار', desc: 'يقدم توصية نهائية قاطعة مبنية على المعطيات والأنظمة.' },
  FINANCIAL_ANALYST: { id: 'FINANCIAL_ANALYST', label: 'المراجع المالي', desc: 'يركز حصراً على الأثر المالي، الهدر، الاسترداد، والمخاطر المالية.' },
  MEETING_MANAGER: { id: 'MEETING_MANAGER', label: 'مدير الاجتماع والجلسة', desc: 'يساعد في تنظيم الحوار، يمنع الخروج عن الموضوع، ويلخص المحاور.' }
};

const MEETING_TYPES = {
  BOARD: { id: 'BOARD', label: 'مجلس الإدارة والرقابة', desc: 'اجتماع رقابي واستراتيجي لتحليل القرارات.' },
  EXECUTIVE: { id: 'EXECUTIVE', label: 'الإدارة التنفيذية', desc: 'اجتماع تنفيذي لمتابعة سير العمل ومعالجة الإشكالات.' },
  FINANCIAL: { id: 'FINANCIAL', label: 'المراجعة والتدقيق المالي', desc: 'جلسة تدقيق مالي لتحليل الميزانية والتكاليف والاسترداد.' },
  HR: { id: 'HR', label: 'الموارد البشرية والامتثال', desc: 'جلسة رقابية حول قرارات الموظفين والتظلمات.' },
  PROJECTS: { id: 'PROJECTS', label: 'متابعة المشاريع والعقود', desc: 'جلسة فحص عقود التوريد والمخاطر والجدول الزمني.' },
  CRISIS: { id: 'CRISIS', label: 'إدارة الأزمات والمخالفات', desc: 'جلسة طارئة للتعامل مع المخالفات والتجاوزات الحرجة.' },
  STRATEGIC: { id: 'STRATEGIC', label: 'التخطيط الاستراتيجي SWOT', desc: 'جلسة تحليل الأداء المؤسسي ومعدلات الامتثال.' },
  PERFORMANCE: { id: 'PERFORMANCE', label: 'تقييم الأداء والجولات', desc: 'جلسة تقييم نتائج الجولات التفتيشية ومؤشرات KPIs.' }
};

const LIVE_CONNECT_TIMEOUT_MS = 90_000;

function resampleAudio(input: Float32Array, inputRate: number, outputRate = 16000): Float32Array {
  if (!Number.isFinite(inputRate) || inputRate <= 0 || inputRate === outputRate) {
    return new Float32Array(input);
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  if (ratio > 1) {
    for (let outputIndex = 0; outputIndex < outputLength; outputIndex++) {
      const start = Math.floor(outputIndex * ratio);
      const end = Math.min(input.length, Math.max(start + 1, Math.floor((outputIndex + 1) * ratio)));
      let sum = 0;
      for (let inputIndex = start; inputIndex < end; inputIndex++) sum += input[inputIndex];
      output[outputIndex] = sum / Math.max(1, end - start);
    }
    return output;
  }

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex++) {
    const sourcePosition = outputIndex * ratio;
    const left = Math.floor(sourcePosition);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = sourcePosition - left;
    output[outputIndex] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}

// Robust Pitch Detection using Normalized Cross-Correlation (NCC)

export default function VoiceChat({ 
  token, 
  sessionId, 
  onSessionCreated, 
  onSessionDeleted, 
  onSessionUpdated,
  guestInviteToken = null,
  guestDisplayName = ''
}: VoiceChatProps) {
  // Mode selection: 'chat' (Interactive chat transcript) | 'voice' (Live audio call) | 'cognitive' (Cognitive Team Simulator & Negotiation)
  const [activeTab, setActiveTab] = useState<'chat' | 'voice' | 'cognitive' | 'calibration'>('chat');
  
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [voiceConnectionStatus, setVoiceConnectionStatus] = useState('جاهز لبدء الحوار الصوتي');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeAlert, setActiveAlert] = useState<{type: string, message: string} | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | number | null>(sessionId || null);
  
  // Cognitive profiling & participants in session
  const [meetingParticipants, setMeetingParticipants] = useState<MemberProfile[]>(() => {
    try {
      const stored = localStorage.getItem('gemini_meeting_participants');
      if (stored) return JSON.parse(stored);
      return [
        { name: 'المدير التنفيذي', role: 'رئيس الجلسة', thinkingStyle: 'operational', riskStance: 'balanced', corePriorities: 'سرعة الإنجاز وسلامة العمليات', persuasionTrigger: 'خطة تنفيذية وجدول زمني محدد' }
      ];
    } catch {
      return [];
    }
  });

  const defaultSystemInstruction = `أنت الخبير المؤسسي الذكي والمستشار الاستراتيجي المدمج في منصة إدارة الاجتماعات والحوكمة والرقابة.

اسمك ولقبك في هذا اللقاء هو: [[EXPERT_NAME_PLACEHOLDER]].
رئيس الجلسة الأساسي وصاحب الحساب هو: [[SPEAKER_NICKNAME_PLACEHOLDER]].

👥 إدارة هويات المتحدثين (Dynamic Speaker Memory):
- سيصلك إشعار موثق من محرك الخادم عند التعرف على المتحدث؛ لا تستنتج الاسم من نبرة الصوت بنفسك.
- إذا عرّف المتحدث عن نفسه، اطلب من أداة تسجيل البصمة ربط الاسم بالصوت، ولا تعتبر الاسم موثقاً قبل تأكيد المحرك.
- لا تفترض أن الجميع هو رئيس الجلسة. ميز بين الحضور بأصواتهم وأسمائهم.

مهمتك الأساسية:
تحليل استفسارات المستخدمين المتعلقة بالشؤون الرقابية، وتوليد استشارات وتقارير احترافية مفصّلة باللغة العربية، مستنداً إلى البيانات الفعلية ونصوص اللوائح المعتمدة.

المهارات التحليلية الرقابية الـ 7:
1. 📩 محلل الشكاوى: تصنيف الخطورة، كشف الأنماط المتكررة، استخراج المبالغ، وتوصيات زمنية (24 ساعة / 7 أيام).
2. 💰 المراجع المالي: الأثر المالي، نسبة الاسترداد، العقود ذات المخاطر العالية.
3. ⚖️ محلل الامتثال: ربط اللوائح المتاحة بالمخالفات وفحص الحوكمة دون اختلاق نصوص أو أرقام مواد.
4. 🎯 المحلل الاستراتيجي SWOT: تحليل نقاط القوة والضعف والفرص والتهديدات من الأدلة المتاحة.
5. 🚔 محلل الجولات والتفتيش: أداء المفتشين، كثافة المخالفات، وتغطية المحاور.
6. 📑 محلل العقود والتوريدات: توزيع المخاطر، العقود المنتهية أو القريبة من الانتهاء.
7. ⚙️ محلل الأداء التشغيلي: مؤشر الإنتاجية، نسب الإنجاز، والمهام المتأخرة.

توجيهات الحوار والتفاعل الصوتي البشري (Active Listening & Spoken Naturalness):
- ردودك يجب أن تكون مقتضبة، ذكية، وفورية. لا تنتظر طويلاً لبدء الرد.
- كن سريعاً ومباشراً في ردودك الصوتية، تجنب الإطالة غير الضرورية، وادخل في صلب الموضوع فوراً بمجرد انتهاء المستخدم من حديثه.
- استخدم إيماءات التفاعل والاستماع النشط بشكل عفوي وطبيعي (مثل: "نعم معك.. تفضل", "همم، مفهوم تماماً", "صحيح.. نقطة جوهرية", "أسمعك.. استمر", "تماماً").
- عند السؤال عن مادة أو لائحة: استدع النص الموجود في قاعدة المعرفة أولاً، وصرح بعدم توفره إذا لم يُعثر عليه.

طبيعة الجلسة الحالية:
[[MEETING_TYPE_PLACEHOLDER]]

ذاكرة وسياق المؤسسة:
[[COMPANY_CONTEXT_PLACEHOLDER]]
`;

const assistantSettings = loadAssistantSettings();

const assistantIdentityContext = `
هوية المساعد المخصصة:
- اسم المستخدم: ${assistantSettings.userName || 'غير محدد'}
- الاسم الذي يفضّل المستخدم أن يُنادى به: ${assistantSettings.addressUserAs || assistantSettings.userName || 'غير محدد'}
- اسم المساعد: ${assistantSettings.assistantName || 'الخبير الذكي'}
- وصف العلاقة: ${assistantSettings.relationship || 'علاقة مهنية عامة'}
- التخصص المهني المختار: ${assistantSettings.expertRole || 'general'}
- سمات الشخصية المختارة: ${(assistantSettings.personality || []).join(', ') || 'friendly'}
- تعليمات المستخدم الإضافية: ${assistantSettings.customInstructions || 'لا توجد'}

قواعد تطبيق الهوية:
- استخدم اسم المساعد المخصص عند التحدث عن نفسك.
- خاطب المستخدم بالاسم أو اللقب الذي حدده، ما لم يطلب خلاف ذلك.
- إذا وصف المستخدم العلاقة مثل "زوجتي" أو "صديقتي" أو "مستشارتي"، فاجعل أسلوب الحوار منسجماً مع هذا الوصف ضمن حدود كونك مساعد ذكاء اصطناعي.
- طبّق سمات الشخصية المختارة على النبرة والأسلوب، من دون التضحية بالدقة أو السلامة أو النزاهة المهنية.
- طبّق التخصص المهني المختار على نوع التحليل والأولويات والمصطلحات المستخدمة.
`;
const [systemInstruction, setSystemInstruction] = useState(
  () =>
    localStorage.getItem('gemini_system_instruction_v10') ||
    `${defaultSystemInstruction}\n\n${assistantIdentityContext}`
);
  const [voiceName, setVoiceName] = useState(() => localStorage.getItem('gemini_voice_name') || 'Zephyr');
  const [speakerNickname, setSpeakerNickname] = useState(() => localStorage.getItem('gemini_user_kunya') || 'رئيس الجلسة');
  const [greetingMode, setGreetingMode] = useState<'auto' | 'all' | 'custom'>(() => (localStorage.getItem('gemini_greeting_mode') as 'auto' | 'all' | 'custom') || 'auto');
  const [companyContext, setCompanyContext] = useState(() => localStorage.getItem('gemini_company_context') || 'تُحمّل بيانات المؤسسة واللوائح المعتمدة من قاعدة المعرفة؛ لا تفترض بيانات غير مسجلة.');
  const [expertMode, setExpertMode] = useState<keyof typeof EXPERT_MODES>(() => {
    try {
      const val = localStorage.getItem('gemini_expert_mode');
      return (val && val in EXPERT_MODES) ? (val as keyof typeof EXPERT_MODES) : 'CONSULTANT';
    } catch {
      return 'CONSULTANT';
    }
  });
  const [expertName, setExpertName] = useState(() => {
    try {
      return localStorage.getItem('gemini_expert_name') || 'المستشار الرقابي';
    } catch {
      return 'المستشار الرقابي';
    }
  });
  const [expertCatalog, setExpertCatalog] = useState<ExpertProfileSummary[]>([]);
  const [selectedExpertIds, setSelectedExpertIds] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('smart_expert_panel') || '[]');
      return Array.isArray(saved) && saved.length ? saved.slice(0, 4) : ['governance_advisor'];
    } catch { return ['governance_advisor']; }
  });
  const [leadExpertId, setLeadExpertId] = useState(() => {
    try {
      return localStorage.getItem('smart_expert_lead') || 'governance_advisor';
    } catch {
      return 'governance_advisor';
    }
  });
  const [consultationCapabilities, setConsultationCapabilities] = useState<any[]>([]);
  const [callConsentRecorded, setCallConsentRecorded] = useState(false);
  const [callBusinessUseCase, setCallBusinessUseCase] = useState('استشارة مؤسسية مرتبطة باجتماع مسجل');
  const [twilioWebhookUrl, setTwilioWebhookUrl] = useState('');
  const [channelSetupState, setChannelSetupState] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  const [channelSetupMessage, setChannelSetupMessage] = useState('');
  const [meetingType, setMeetingType] = useState<keyof typeof MEETING_TYPES>(() => {
    try {
      const val = localStorage.getItem('gemini_meeting_type');
      return (val && val in MEETING_TYPES) ? (val as keyof typeof MEETING_TYPES) : 'BOARD';
    } catch {
      return 'BOARD';
    }
  });
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(() => localStorage.getItem('gemini_recording') !== 'false');
  const [retentionPeriod, setRetentionPeriod] = useState(() => localStorage.getItem('gemini_retention') || '30_days');
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionDone, setExtractionDone] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('جلسة غير معنونة');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<{ time: string, msg: string }[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false);

  const addDebugLog = useCallback((msg: string) => {
    console.log(msg);
    setDiagnosticLogs(prev => {
      const time = new Date().toISOString().split('T')[1].replace('Z', '');
      return [{ time, msg }, ...prev].slice(0, 100);
    });
  }, []);
  const [titleInput, setTitleInput] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isSendingText, setIsSendingText] = useState(false);
  const [isSpeakingTTS, setIsSpeakingTTS] = useState<string | null>(null);
  const [isDictating, setIsDictating] = useState(false);

  // Calibration Mode States
  const [isCalibrationMode, setIsCalibrationMode] = useState(false);
  const [expectedSpeaker, setExpectedSpeaker] = useState<'speaker_001' | 'speaker_002' | 'unknown'>('speaker_001');
  const [calibrationLogs, setCalibrationLogs] = useState<any[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedMemberForPersona, setSelectedMemberForPersona] = useState<{ member: any, index: number } | null>(null);

  // Conversational State Machine & Real-Time Telemetry HUD
  const [conversationState, setConversationState] = useState<'IDLE' | 'LISTENING' | 'USER_SPEAKING' | 'AI_THINKING' | 'AI_SPEAKING' | 'INTERRUPTED' | 'UNKNOWN_SPEAKER' | 'ERROR'>('IDLE');
  const [vadStatus, setVadStatus] = useState<'SILENCE' | 'SPEECH_START' | 'SPEECH_CONTINUE' | 'SPEECH_END'>('SILENCE');
  const [liveRMS, setLiveRMS] = useState<number>(0);
  const [liveNoiseFloor, setLiveNoiseFloor] = useState<number>(0.005);
  const [audioQueueLength, setAudioQueueLength] = useState<number>(0);
  const [interruptionCount, setInterruptionCount] = useState<number>(0);
  const [rttLatency, setRttLatency] = useState<number>(0);
  const [showDebugHUD, setShowDebugHUD] = useState<boolean>(false);

  // Multi-Speaker Dynamic Voice Footprints State
  const [detectedAcousticGender, setDetectedAcousticGender] = useState<'male' | 'female' | 'analyzing' | 'silent'>('silent');
  const [currentLivePitch, setCurrentLivePitch] = useState<number>(0);
  const [activeFootprintId, setActiveFootprintId] = useState<string | null>(null);
  const [speakerConfidence, setSpeakerConfidence] = useState<number>(0);
  const [recentSpeakerHistory, setRecentSpeakerHistory] = useState<string[]>([]);
  const [activeSpeakerMode, setActiveSpeakerMode] = useState<'auto' | string>('auto');
  const [editingFootprintId, setEditingFootprintId] = useState<string | null>(null);
  const [editingFootprintName, setEditingFootprintName] = useState<string>('');
  const [isFootprintsExpanded, setIsFootprintsExpanded] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const [voiceFootprints, setVoiceFootprints] = useState<VoiceFootprint[]>(() => {
    try {
      const stored = localStorage.getItem('gemini_voice_footprints_v3');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  // --- Biometric Speaker Recognition State ---
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfile[]>(() => {
    try {
      const stored = localStorage.getItem('gemini_speaker_profiles_v4');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          let needsUpdate = false;
          const migratedProfiles = parsed.filter(p => {
             if ((p.id && p.id.startsWith('unknown_session')) || p.isCandidate) {
                needsUpdate = true;
                return false;
             }
             return true;
          }).map(p => {
             const hasValidEmb = p.centroidEmbedding
               && p.centroidEmbedding.length >= 64
               && p.centroidEmbedding.length <= 2048;
             if (hasValidEmb && p.status !== 'VALID') {
                needsUpdate = true;
                return { ...p, status: 'VALID' };
             }
             return p;
          });
          
          const dedupedProfiles = dedupeSpeakerProfilesForUi(migratedProfiles);
          if (needsUpdate || dedupedProfiles.length !== migratedProfiles.length) {
             localStorage.setItem('gemini_speaker_profiles_v4', JSON.stringify(dedupedProfiles));
          }
          return dedupedProfiles;
        }
      }
    } catch {}
    return [];
  });

  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [activeSpeakerName, setActiveSpeakerName] = useState<string | null>(null);
  const [currentSimilarity, setCurrentSimilarity] = useState<number>(0);
const [lastSpeakerDiagnostic, setLastSpeakerDiagnostic] = useState<{
  name: string;
  source: string;
  phase: string;
  similarity: number;
}>({
  name: 'UNKNOWN',
  source: 'UNKNOWN',
  phase: 'NONE',
  similarity: 0,
});
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // Refs
  const isCalibrationModeRef = useRef(false);
  const expectedSpeakerRef = useRef('speaker_001');
  const dictationRecognitionRef = useRef<any>(null);
  const conversationStateRef = useRef<'IDLE' | 'LISTENING' | 'USER_SPEAKING' | 'AI_THINKING' | 'AI_SPEAKING' | 'INTERRUPTED' | 'UNKNOWN_SPEAKER' | 'ERROR'>('IDLE');
  const audioQueueRef = useRef<{ id: string; pcm: Float32Array; duration: number; meta?: any }[]>([]);
  const noiseFloorRef = useRef<number>(0.005);
  const vadSpeechFramesRef = useRef<number>(0);
  const vadSilenceFramesRef = useRef<number>(0);
  const interruptionCountRef = useRef<number>(0);
  const lastPingTimeRef = useRef<number>(0);
  const isMutedRef = useRef<boolean>(false);
  const pitchFrameCountRef = useRef<number>(0);
  const voiceFootprintsRef = useRef<VoiceFootprint[]>(voiceFootprints);
  const activeFootprintIdRef = useRef<string | null>(activeFootprintId);
  const speakerHistoryRef = useRef<{id: string, time: number}[]>([]);
  const activeSpeakerModeRef = useRef<'auto' | string>('auto');
  const currentAvgPitchRef = useRef<number>(0);
  const currentGenderRef = useRef<'male' | 'female'>('male');
  const recentPitchesRef = useRef<number[]>([]);
  const lastDetectedGenderRef = useRef<'male' | 'female' | null>(null);
  const lastSpeakerChangeTimeRef = useRef<number>(0);
  const lastNotifiedSpeakerRef = useRef<string>('');
  const currentAiTurnIdRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputSinkRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const userInterruptFramesRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef<number>(0);
  const currentSessionIdRef = useRef<string | number | null>(sessionId || null);
  const isIntentionalDisconnectRef = useRef<boolean>(false);
  const liveReadyRef = useRef<boolean>(false);
  const isAiTurnInProgressRef = useRef<boolean>(false);
  const lastChunkTimeRef = useRef<number>(0);
  const chunkCountRef = useRef<number>(0);
  const jitterHistoryRef = useRef<number[]>([]);
  const audioUnderrunCountRef = useRef<number>(0);
  const queueStarvationCountRef = useRef<number>(0);
  const queueStarvationStartedAtRef = useRef<number>(0);
  const falseBargeInSuppressedCountRef = useRef<number>(0);
  const bargeInSentForTurnRef = useRef<number>(-1);
  const lastProcessedInterruptIdRef = useRef<string>('');
  const currentChunkSeqRef = useRef<number>(0);
  const lastAdaptiveLookaheadMsRef = useRef<number>(30);
  const playbackWarmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackWarmupReadyRef = useRef<boolean>(false);
  const playbackWarmupStartedAtRef = useRef<number>(0);
  const bargeInConfirmedRef = useRef<boolean>(false);
  const aiPlaybackStartedAtRef = useRef<number>(0);
  const echoGuardPeakRmsRef = useRef<number>(0);
  const ambientRmsRef = useRef<number>(0.01);
  const nearFieldSpeechFramesRef = useRef<number>(0);
  const micPreRollRef = useRef<string[]>([]);
  const speakerRegistryRef = useRef<SpeakerRegistry>(new SpeakerRegistry(speakerProfiles));
  const speakerProviderRef = useRef<DeepSpeakerEmbeddingProvider | null>(null);

  // Sync refs with effects
  useEffect(() => { isCalibrationModeRef.current = isCalibrationMode; }, [isCalibrationMode]);
  useEffect(() => { expectedSpeakerRef.current = expectedSpeaker; }, [expectedSpeaker]);
  useEffect(() => { conversationStateRef.current = conversationState; }, [conversationState]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { activeFootprintIdRef.current = activeFootprintId; }, [activeFootprintId]);
  useEffect(() => { activeSpeakerModeRef.current = activeSpeakerMode; }, [activeSpeakerMode]);
  useEffect(() => {
    voiceFootprintsRef.current = voiceFootprints;
    try {
      localStorage.setItem('gemini_voice_footprints_v3', JSON.stringify(voiceFootprints));
    } catch {}
  }, [voiceFootprints]);
  useEffect(() => {
    speakerRegistryRef.current = new SpeakerRegistry(speakerProfiles);
    speakerProviderRef.current = new DeepSpeakerEmbeddingProvider();
  }, [speakerProfiles]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/experts', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('EXPERT_CATALOG_UNAVAILABLE')))
      .then((data) => setExpertCatalog(Array.isArray(data?.experts) ? data.experts : []))
      .catch((error) => console.warn('Failed to load expert catalog:', error));
    fetch('/api/integrations/capabilities', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('CAPABILITIES_UNAVAILABLE')))
      .then((data) => setConsultationCapabilities(Array.isArray(data?.capabilities) ? data.capabilities : []))
      .catch((error) => console.warn('Failed to load consultation capabilities:', error));
  }, [token]);

  const createExternalConsultationSession = async () => {
    const activeToken = token || await getAuthToken();
    if (!activeToken || !activeSessionId) {
      setChannelSetupState('ERROR');
      setChannelSetupMessage('أنشئ اجتماعاً واحفظه أولاً.');
      return;
    }
    setChannelSetupState('LOADING');
    setChannelSetupMessage('');
    try {
      const response = await fetch('/api/integrations/consultation-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({ sessionId: Number(activeSessionId), selectedExpertIds, leadExpertId, consentRecorded: callConsentRecorded, businessUseCase: callBusinessUseCase }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'تعذر إعداد قناة الاتصال');
      setTwilioWebhookUrl(data.twilioVoiceWebhookUrl || '');
      setChannelSetupState('READY');
      setChannelSetupMessage('تم إنشاء رابط موقع اتصال موقّع لمدة 15 دقيقة. ضعه في إعداد Voice Webhook لدى Twilio/WhatsApp Business Calling.');
    } catch (error: any) {
      setChannelSetupState('ERROR');
      setChannelSetupMessage(error?.message === 'EXTERNAL_CHANNEL_NOT_CONFIGURED' ? 'يلزم أن يضبط مسؤول الخادم PUBLIC_BASE_URL وEXPERT_CHANNEL_SECRET أولاً.' : (error?.message || 'تعذر إعداد قناة الاتصال'));
    }
  };

  const QUICK_AUDIT_PROMPTS = [
    { label: 'تحليل الشكاوى المتكررة', text: 'ما هي الأقسام التي تتلقى أكبر عدد من الشكاوى المتكررة؟' },
    { label: 'مراجعة أداء الجولات', text: 'أعطني تقييم شامل لأداء المفتشين في الجولات الرقابية الأخيرة' },
    { label: 'تحليل المخاطر التعاقدية', text: 'هل توجد عقود عالية المخاطر توشك على الانتهاء ولم تُنجز بعد؟' },
    { label: 'تقييم الامتثال الاستراتيجي', text: 'قم بعمل تحليل SWOT شامل لمعدلات الامتثال المؤسسي الحالي' }
  ];

  const matchOrCreateFootprint = useCallback((pitch: number, centroid: number, zcr: number, rolloff: number): VoiceFootprint => {
    const gender: 'male' | 'female' = pitch <= 165 ? 'male' : 'female';
    // Normalization thresholds for distance calculation
    const pitchNorm = gender === 'male' ? 30 : 40;
    const centroidNorm = 25;
    const zcrNorm = 0.07;
    const rolloffNorm = 2048 * 0.15;

    const currentList = voiceFootprintsRef.current;
    let bestMatch: VoiceFootprint | null = null;
    let minScore = Infinity;

    // 1. Identification via Similarity Matching
    for (const fp of currentList) {
      if (fp.gender === gender) {
        const dP = Math.abs(fp.avgPitch - pitch) / pitchNorm;
        const dC = Math.abs((fp.avgSpectralCentroid || 0) - centroid) / centroidNorm;
        const dZ = Math.abs((fp.avgZCR || 0) - zcr) / zcrNorm;
        const dR = Math.abs((fp.avgSpectralRolloff || 0) - rolloff) / rolloffNorm;
        
        // Weighted Manhattan Distance (Signature Matching)
        // Pitch(40%), Timbre(30%), Breathiness(15%), Brilliance(15%)
        const score = (dP * 0.4) + (dC * 0.3) + (dZ * 0.15) + (dR * 0.15);

        if (score < minScore) {
          minScore = score;
          bestMatch = fp;
        }
      }
    }

    const HIGH_CONFIDENCE = 0.8; 
    const similarity = bestMatch ? (1 - Math.min(minScore, 1)) : 0;

    // 2. Identification Thresholding & Candidate Logic
    if (bestMatch && similarity >= 0.70) {
      // Identity Locked - Refine profile if high confidence
      const alpha = similarity >= HIGH_CONFIDENCE ? 0.05 : 0.01;
      bestMatch.avgPitch = Math.round(((bestMatch.avgPitch * (1-alpha)) + pitch * alpha));
      bestMatch.avgSpectralCentroid = (bestMatch.avgSpectralCentroid * (1-alpha)) + centroid * alpha;
      bestMatch.avgZCR = (bestMatch.avgZCR * (1-alpha)) + zcr * alpha;
      bestMatch.avgSpectralRolloff = (bestMatch.avgSpectralRolloff * (1-alpha)) + rolloff * alpha;
      bestMatch.sampleCount += 1;
      bestMatch.confidence = Math.min(bestMatch.confidence + 0.02, 0.98);
      bestMatch.lastActive = Date.now();
      
      if (bestMatch.sampleCount > 20) bestMatch.isCandidate = false;
      
      console.log(`[DEBUG] Speaker ID: ${bestMatch.name} | Similarity: ${similarity.toFixed(2)} | Confidence: ${bestMatch.confidence.toFixed(2)}`);
      return bestMatch;
    }

    // 3. New Speaker / Candidate Allocation
    const sameGenderList = currentList.filter(f => f.gender === gender);
    const num = sameGenderList.length + 1;
    const id = `speaker_${gender}_${num}_${Date.now()}`;
    const label = `متحدث مجهول (${gender === 'male' ? 'رجل' : 'امرأة'} ${num})`;
    
    const newFootprint: VoiceFootprint = {
      id,
      label,
      // FIX (V4): DO NOT auto-name new unknown footprints with the owner's
      // nickname ("رئيس الجلسة"). That was causing the AI to call Abu Musab
      // (or any new male speaker) by the owner's name instead of "unknown
      // speaker" until he explicitly registered his voice. Now we always use
      // the neutral "label" (e.g. "متحدث مجهول (رجل 1)") so the AI is forced
      // to ask "من المتحدث؟" rather than guessing from the owner's nickname.
      // The owner's real name is only used for the *initial greeting* in the
      // setup message (line ~1469), not for voice footprints.
      name: label,
      gender,
      avgPitch: Math.round(pitch),
      avgSpectralCentroid: centroid,
      avgZCR: zcr,
      avgSpectralRolloff: rolloff,
      sampleCount: 1,
      confidence: 0.5,
      isCandidate: true,
      lastActive: Date.now()
    };

    console.log(`[DEBUG] New Candidate Detected: ${newFootprint.id} | Pitch: ${pitch}Hz`);
    
    const updatedList = [...currentList, newFootprint];
    voiceFootprintsRef.current = updatedList;
    setVoiceFootprints(updatedList);
    return newFootprint;
  }, [speakerNickname]);

  // Rename a footprint and notify live session
  const renameFootprint = useCallback((id: string, newName: string) => {
    if (!newName.trim()) return;
    setVoiceFootprints(prev => {
      const updated = prev.map(fp => fp.id === id ? { ...fp, name: newName.trim(), isCandidate: false, confidence: 1.0 } : fp);
      try {
        localStorage.setItem('gemini_voice_footprints_v3', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    const targetFp = voiceFootprintsRef.current.find(f => f.id === id);
    if (targetFp && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'speaker_override',
        detectedGender: targetFp.gender,
        avgPitch: targetFp.avgPitch,
        speakerName: newName.trim(),
        footprintId: targetFp.id,
        footprintLabel: targetFp.label
      }));
    }
    setEditingFootprintId(null);
    setEditingFootprintName('');
  }, []);

  // Delete an extra footprint
  const deleteFootprint = useCallback((id: string) => {
    setVoiceFootprints(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(f => f.id !== id);
    });
    if (activeFootprintId === id) {
      setActiveFootprintId(null);
    }
  }, [activeFootprintId]);

  // Reset all footprints to default primary profile
  const resetFootprints = useCallback(() => {
    // FIX (V4): the default footprint was previously named after the owner
    // (speakerNickname || 'رئيس الجلسة'). That made every newly-detected
    // voice look like the owner. Now the default footprint is named
    // "متحدث غير معروف" so the AI asks the speaker to identify themselves
    // via the register_voice_profile tool. The owner's real name is set
    // only AFTER they explicitly enroll their own voiceprint.
    const initial: VoiceFootprint[] = [
      {
        id: 'male_1',
        label: 'صوت رجالي (بصمة 1)',
        name: 'متحدث غير معروف',
        gender: 'male',
        avgPitch: 115,
        avgSpectralCentroid: 45,
        avgZCR: 0.05,
        avgSpectralRolloff: 200,
        sampleCount: 1,
        confidence: 0.95,
        isCandidate: false,
        lastActive: Date.now()
      }
    ];
    setVoiceFootprints(initial);
    setActiveFootprintId('male_1');
    setActiveSpeakerMode('auto');
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'speaker_override',
        detectedGender: 'male',
        avgPitch: 115,
        speakerName: 'متحدث غير معروف',
        footprintId: 'male_1',
        footprintLabel: 'صوت رجالي (بصمة 1)'
      }));
    }
  }, [speakerNickname]);

  // Manual or Auto Speaker Footprint Selector
  const handleSelectSpeakerFootprint = useCallback((mode: 'auto' | string) => {
    setActiveSpeakerMode(mode);
    activeSpeakerModeRef.current = mode;
    
    if (mode === 'auto') {
      // Return to automatic dynamic footprint tracking
      return;
    }

    const target = voiceFootprintsRef.current.find(f => f.id === mode);
    if (target && wsRef.current?.readyState === WebSocket.OPEN) {
      setActiveFootprintId(target.id);
      setDetectedAcousticGender(target.gender);
      wsRef.current.send(JSON.stringify({
        type: 'speaker_override',
        detectedGender: target.gender,
        avgPitch: target.avgPitch,
        speakerName: target.name,
        footprintId: target.id,
        footprintLabel: target.label
      }));
    }
  }, []);

  // Fetch user profile from DB to ensure identity continuity across sessions and days
  useEffect(() => {
    let isMounted = true;
    const fetchUserProfile = async () => {
      try {
        const activeToken = token || await getAuthToken();
        if (!activeToken) return;
        const res = await fetch('/api/user/profile', {
          headers: { Authorization: `Bearer ${activeToken}` }
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.profile?.nickname) {
            setSpeakerNickname(data.profile.nickname);
            localStorage.setItem('gemini_user_kunya', data.profile.nickname);
          }
          if (data.profile?.preferences?.preferredVoice) {
            setVoiceName(data.profile.preferences.preferredVoice);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch persistent user profile:", e);
      }
    };
    fetchUserProfile();
    return () => {
      isMounted = false;
    };
  }, [token]);

  // Load Session Messages when sessionId changes
  useEffect(() => {
    setActiveSessionId(sessionId || null);
    let isMounted = true;
    const loadMessages = async () => {
      if (sessionId) {
        setIsLoadingHistory(true);
        try {
          const activeToken = token || await getAuthToken();
          if (!activeToken) {
            if (isMounted) setIsLoadingHistory(false);
            return;
          }
          const res = await fetch(`/api/sessions/${sessionId}/messages`, {
            headers: { Authorization: `Bearer ${activeToken}` }
          });
          if (res.ok && isMounted) {
            const data = await res.json();
            if (Array.isArray(data)) {
              setMessages(data.map(m => ({
                id: m.id?.toString() || Math.random().toString(),
                text: typeof m.text === 'string' ? m.text : (m.content || m.message || ''),
                isUser: Boolean(m.isUser),
                createdAt: m.createdAt,
                speakerId: m.speakerId,
                speakerName: m.speakerName,
                speakerConfidence: m.speakerConfidence,
              })));
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          if (isMounted) setIsLoadingHistory(false);
        }
      } else {
        setMessages([]);
        setSessionTitle('محادثة جديدة');
      }
    };
    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [sessionId, token]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTab]);

  const stopPlayback = useCallback((reason: string = 'MANUAL_STOP', turnId?: number, interruptRequestId?: string) => {
    const queueDepthBefore = audioQueueRef.current.length;
    const activeSourcesBefore = sourcesRef.current.length;
    
    // Ignore stale server interrupts
    if (reason === 'SERVER_INTERRUPT' && turnId !== undefined) {
      if (turnId < currentAiTurnIdRef.current) {
        addDebugLog(`[INTERRUPT_DIAG] Ignored stale SERVER_INTERRUPT targetTurnId=${turnId} currentTurnId=${currentAiTurnIdRef.current}`);
        return;
      }
      if (interruptRequestId && interruptRequestId === lastProcessedInterruptIdRef.current) {
        addDebugLog(`[INTERRUPT_DIAG] Ignored duplicate SERVER_INTERRUPT interruptRequestId=${interruptRequestId}`);
        return;
      }
      if (interruptRequestId) {
        lastProcessedInterruptIdRef.current = interruptRequestId;
      }
      // If it's valid, we'll log it in the accepted block below
    }

    if (playbackWarmupTimerRef.current) {
      clearTimeout(playbackWarmupTimerRef.current);
      playbackWarmupTimerRef.current = null;
    }
    playbackWarmupReadyRef.current = false;
    audioQueueRef.current = [];
    setAudioQueueLength(0);
    sourcesRef.current.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {}
    });
    sourcesRef.current = [];
    nextStartTimeRef.current = 0;
    setIsSpeaking(false);
    
    if (activeSourcesBefore > 0 || queueDepthBefore > 0) {
        addDebugLog(`[INTERRUPT_DIAG] Accepted PLAYBACK_STOP reason=${reason} activeSourcesBefore=${activeSourcesBefore} queueDepthBefore=${queueDepthBefore} targetTurnId=${turnId} currentTurnId=${currentAiTurnIdRef.current}`);
    } else {
        addDebugLog(`[INTERRUPT_DIAG] PLAYBACK_STOP (cleanup/duplicate) reason=${reason} activeSourcesBefore=${activeSourcesBefore} queueDepthBefore=${queueDepthBefore} targetTurnId=${turnId} currentTurnId=${currentAiTurnIdRef.current}`);
    }
  }, [addDebugLog]);

  const handleBargeIn = useCallback((
    reason: string = 'USER_BARGE_IN',
    vadMetrics?: {
      rms: number;
      noiseFloor: number;
      threshold: number;
      frames: number;
      isAiPlaying: boolean;
      peak?: number;
      crestFactor?: number;
      ambient?: number;
      nearFieldVoice?: boolean;
    }
  ) => {
    if (sourcesRef.current.length > 0 || audioQueueRef.current.length > 0 || isAiTurnInProgressRef.current) {
      if (vadMetrics) {
        const nearFieldDiag = vadMetrics.peak !== undefined
          ? ` peak=${vadMetrics.peak.toFixed(5)} crest=${(vadMetrics.crestFactor || 0).toFixed(2)} ambient=${(vadMetrics.ambient || 0).toFixed(5)} nearFieldVoice=${vadMetrics.nearFieldVoice === true}`
          : '';
        addDebugLog(`[BARGE_DIAG] reason=${reason} turnId=${currentAiTurnIdRef.current} rms=${vadMetrics.rms.toFixed(5)} threshold=${vadMetrics.threshold.toFixed(5)} noiseFloor=${vadMetrics.noiseFloor.toFixed(5)} frames=${vadMetrics.frames} aiPlaying=${vadMetrics.isAiPlaying} activeSources=${sourcesRef.current.length} queueDepth=${audioQueueRef.current.length}${nearFieldDiag}`);
      }
      
      const currentTurn = currentAiTurnIdRef.current;
      if (bargeInSentForTurnRef.current === currentTurn) {
        addDebugLog(`[INTERRUPT_DIAG] Ignored duplicate ${reason} for turnId=${currentTurn}`);
        return;
      }
      bargeInSentForTurnRef.current = currentTurn;
      bargeInConfirmedRef.current = true;
      const interruptRequestId = `req_${currentTurn}_${Date.now()}`;

      stopPlayback(reason, currentTurn, interruptRequestId);
      interruptionCountRef.current += 1;
      setInterruptionCount(interruptionCountRef.current);
      setConversationState('INTERRUPTED');
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        addDebugLog(`[WS_INTERRUPT] Sending type: 'interrupt' targetTurnId=${currentTurn} interruptRequestId=${interruptRequestId} to server.`);
        wsRef.current.send(JSON.stringify({ type: 'interrupt', targetTurnId: currentTurn, interruptRequestId }));
      }
      setTimeout(() => {
        setConversationState('USER_SPEAKING');
      }, 120);
    }
  }, [stopPlayback]);

  // Alert Detection Effect
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && !lastMsg.isUser && typeof lastMsg.text === 'string' && lastMsg.text.trim()) {
        const text = lastMsg.text;
        
        let detectedType = null;
        let detectedMsg = null;
        
        if (text.includes('خطر مالي') || text.includes('اختلاس') || text.includes('هدر')) {
          detectedType = 'FINANCIAL';
          detectedMsg = 'تم اكتشاف مؤشر خطر مالي استناداً إلى المعطيات الرقابية.';
        } else if (text.includes('مخالفة قانون') || text.includes('مادة 43') || text.includes('مادة 44') || text.includes('تعارض')) {
          detectedType = 'POLICY';
          detectedMsg = 'يوجد تعارض محتمل مع المواد القانونية أو اللوائح التنظيمية.';
        } else if (text.includes('نقص في البيانات') || text.includes('بيانات غير كافية')) {
          detectedType = 'DATA';
          detectedMsg = 'هناك نقص في الوثائق أو البيانات المرفقة يؤثر على دقة التدقيق.';
        } else if (text.includes('حرجة') || text.includes('مخاطر عالية')) {
          detectedType = 'HIGH_RISK';
          detectedMsg = 'تم رصد ملاحظة أو شكوى مصنفة بدرجة خطورة عالية جداً.';
        }
        
        if (detectedType && activeAlert?.type !== detectedType) {
          setActiveAlert({ type: detectedType, message: detectedMsg });
        }
      }
    }
  }, [messages, activeAlert?.type]);

  useEffect(() => {
    if (activeAlert) {
      const timer = setTimeout(() => setActiveAlert(null), 12000);
      return () => clearTimeout(timer);
    }
  }, [activeAlert]);

  // Handle Text Message Submission
  const handleSendTextMessage = async (textToSend?: string) => {
    const rawText = textToSend || inputText;
    const activeToken = token || await getAuthToken();
    if (!rawText.trim() || !activeToken || isSendingText) return;

    const trimmedText = rawText.trim();
    setInputText('');
    setIsSendingText(true);

    let currentSid = activeSessionId;

    // If no session exists yet, create one first
    if (!currentSid) {
      try {
        const createRes = await fetch('/api/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeToken}`
          },
          body: JSON.stringify({ 
            title: trimmedText.substring(0, 35) + (trimmedText.length > 35 ? '...' : '') 
          })
        });
        if (createRes.ok) {
          const newS = await createRes.json();
          currentSid = newS.id;
          setActiveSessionId(newS.id);
          setSessionTitle(newS.title || trimmedText.substring(0, 35));
          if (onSessionCreated) {
            onSessionCreated(newS.id, newS.title);
          }
        }
      } catch (err) {
        console.error('Failed to create session:', err);
      }
    }

    if (!currentSid) {
      setIsSendingText(false);
      return;
    }

    // Optimistically add user message to UI
    const tempUserMsg: Message = {
      id: 'temp-' + Date.now(),
      text: trimmedText,
      isUser: true,
      createdAt: new Date(),
      speakerName: speakerNickname || 'المستخدم',
      speakerConfidence: 1,
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const modeData = EXPERT_MODES[expertMode] || EXPERT_MODES.CONSULTANT;
      const meetingData = MEETING_TYPES[meetingType] || MEETING_TYPES.BOARD;
      
      // Build cognitive member profile context for the AI
      let cognitiveContext = '';
      if (meetingParticipants.length > 0) {
        cognitiveContext += '\n\n🧠 الملف الإدراكي والتفاوضي لأعضاء الجلسة الحاضرين:\n';
        meetingParticipants.forEach(p => {
          const style = p.thinkingStyle ? THINKING_STYLES[p.thinkingStyle as keyof typeof THINKING_STYLES]?.label : 'متوازن';
          const risk = p.riskStance ? RISK_STANCES[p.riskStance as keyof typeof RISK_STANCES]?.label : 'متوازن';
          const priorities = p.corePriorities || p.priorities;
          const concerns = p.biasesOrConcerns || p.concerns;
          const persuasion = p.persuasionTrigger || p.persuasionKey;
          cognitiveContext += `- ${p.name} (${p.role || 'عضو'}): نمط التفكير: [${style}]، الموقف من المخاطر: [${risk}]`;
          if (priorities) cognitiveContext += `، الأولويات: [${priorities}]`;
          if (concerns) cognitiveContext += `، المخاوف: [${concerns}]`;
          if (persuasion) cognitiveContext += `، مفتاح الإقناع: [${persuasion}]`;
          cognitiveContext += '\n';
        });
        cognitiveContext += '\nإرشادات تفاوضية وإدارية ذكية: عند تقديم الحلول أو الاستشارات، راعِ عقلية وتوجهات هؤلاء الأعضاء المحددة أعلاه، وقدم مقترحات تساعد على بناء التوافق، تجنب الاحتكاك غير البناء، واقتراح أساليب الإقناع المناسبة لكل عضو، وتوزيع المهام بدقة وفق كفاءتهم ونمط تفكيرهم.';
      }

      const selectedExpertNames = selectedExpertIds
        .map((id) => expertCatalog.find((profile) => profile.id === id)?.name)
        .filter(Boolean);
      const panelInstruction = `\n\nلوحة الخبراء المختارة: ${selectedExpertNames.join('، ') || 'مستشار الحوكمة المؤسسية'}. الخبير القائد: ${expertCatalog.find((profile) => profile.id === leadExpertId)?.name || 'مستشار الحوكمة المؤسسية'}. حلل من زوايا جميع الأعضاء وقدّم جواباً موحداً مع فصل الوقائع والأدلة والتحليل.`;
      const customInstruction = systemInstruction
        .replaceAll('[[COMPANY_CONTEXT_PLACEHOLDER]]', companyContext + cognitiveContext)
        .replaceAll('[[EXPERT_MODE_PLACEHOLDER]]', modeData.desc)
        .replaceAll('[[EXPERT_NAME_PLACEHOLDER]]', expertName)
        .replaceAll('[[SPEAKER_NICKNAME_PLACEHOLDER]]', speakerNickname || 'رئيس الجلسة')
        .replaceAll('[[MEETING_TYPE_PLACEHOLDER]]', meetingData.desc) + panelInstruction;

      const res = await fetch(`/api/sessions/${currentSid}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          text: trimmedText,
      systemInstruction: `${customInstruction}\n\n${assistantIdentityContext}`
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.aiMessage) {
          setMessages(prev => [...prev, {
            id: data.aiMessage.id?.toString() || Math.random().toString(),
            text: data.aiMessage.text,
            isUser: false,
            createdAt: new Date()
          }]);
        }
        if (onSessionUpdated) {
          onSessionUpdated(Number(currentSid), sessionTitle);
        }
      } else {
        const errData = await res.json();
        setMessages(prev => [...prev, {
          id: 'err-' + Date.now(),
          text: `⚠️ عذراً، حدث خطأ أثناء المعالجة: ${errData.error || 'يرجى المحاولة مرة أخرى.'}`,
          isUser: false
        }]);
      }
    } catch (e: any) {
      console.error('Error sending message:', e);
      setMessages(prev => [...prev, {
        id: 'err-' + Date.now(),
        text: `⚠️ تعذر إرسال الرسالة، تأكد من الاتصال بالخادم.`,
        isUser: false
      }]);
    } finally {
      setIsSendingText(false);
      chatInputRef.current?.focus();
    }
  };

  // Delete Conversation
  const confirmDeleteSession = async () => {
    const activeToken = token || await getAuthToken();
    if (!activeSessionId || !activeToken) {
      setMessages([]);
      setShowDeleteModal(false);
      return;
    }

    setIsDeletingSession(true);
    try {
      const res = await fetch(`/api/sessions/${activeSessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.ok) {
        setMessages([]);
        if (onSessionDeleted) {
          onSessionDeleted(Number(activeSessionId));
        }
        setActiveSessionId(null);
        setShowDeleteModal(false);
        setShowSecurityModal(false);
      }
    } catch (e) {
      console.error('Error deleting session:', e);
    } finally {
      setIsDeletingSession(false);
    }
  };

  // Save Title Update
  const handleSaveTitle = async () => {
    const activeToken = token || await getAuthToken();
    if (!titleInput.trim() || !activeSessionId || !activeToken) {
      setIsEditingTitle(false);
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${activeSessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`
        },
        body: JSON.stringify({ title: titleInput.trim() })
      });
      if (res.ok) {
        setSessionTitle(titleInput.trim());
        if (onSessionUpdated) {
          onSessionUpdated(Number(activeSessionId), titleInput.trim());
        }
      }
    } catch(e) {
      console.error(e);
    } finally {
      setIsEditingTitle(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const scheduleAudioPlayback = useCallback(() => {
    const audioCtx = outputAudioCtxRef.current;
    if (!audioCtx || audioCtx.state === 'closed') return;

    const flushQueue = () => {
      if (audioCtx.state !== 'running') return;

      const isCurrentlyPlaying = sourcesRef.current.length > 0;

      // Small adaptive jitter cushion (Pipecat/streaming-pipeline style): do
      // not add a fixed response delay. Instead derive 25-110ms lookahead
      // from recent chunk-arrival variance so clean networks stay fast while
      // unstable mobile networks get enough runway to avoid audible gaps.
      const recentJitter = jitterHistoryRef.current.slice(-16);
      let jitterVariationMs = 0;
      if (recentJitter.length >= 3) {
        let variationTotal = 0;
        for (let i = 1; i < recentJitter.length; i++) {
          variationTotal += Math.abs(recentJitter[i] - recentJitter[i - 1]);
        }
        jitterVariationMs = variationTotal / (recentJitter.length - 1);
      }
      const adaptiveLookaheadMs = Math.max(25, Math.min(110, 25 + jitterVariationMs * 1.35));
      lastAdaptiveLookaheadMsRef.current = adaptiveLookaheadMs;

      // Real jitter buffer: after a cold start or starvation, wait until we have
      // enough queued audio duration to bridge Render/Gemini/iPhone chunk jitter.
      // We cap the wait so the assistant remains responsive even if chunks are
      // genuinely sparse.
      const queuedAudioMs = audioQueueRef.current.reduce((sum, item) => sum + item.duration * 1000, 0);
      const recoveringFromStarvation = queueStarvationStartedAtRef.current > 0;
      const targetBufferMs = recoveringFromStarvation
        ? Math.max(360, Math.min(1200, adaptiveLookaheadMs * 4 + 280))
        : Math.max(220, Math.min(850, adaptiveLookaheadMs * 3 + 160));
      const maxWarmupWaitMs = recoveringFromStarvation ? 950 : 520;
      const shouldWarmUp = !isCurrentlyPlaying
        && audioQueueRef.current.length > 0
        && isAiTurnInProgressRef.current
        && !playbackWarmupReadyRef.current
        && queuedAudioMs < targetBufferMs;
      if (shouldWarmUp) {
        if (!playbackWarmupStartedAtRef.current) playbackWarmupStartedAtRef.current = Date.now();
        const elapsedWarmupMs = Date.now() - playbackWarmupStartedAtRef.current;
        if (elapsedWarmupMs < maxWarmupWaitMs) {
          if (!playbackWarmupTimerRef.current) {
            const retryMs = Math.max(50, Math.min(140, maxWarmupWaitMs - elapsedWarmupMs));
            playbackWarmupTimerRef.current = setTimeout(() => {
              playbackWarmupTimerRef.current = null;
              flushQueue();
            }, retryMs);
          }
          return;
        }
        addDebugLog(`[JITTER_BUFFER_TIMEOUT] queuedMs=${Math.round(queuedAudioMs)} targetMs=${Math.round(targetBufferMs)} waitMs=${elapsedWarmupMs} starvation=${recoveringFromStarvation}`);
        playbackWarmupReadyRef.current = true;
      }
      if (playbackWarmupTimerRef.current) {
        clearTimeout(playbackWarmupTimerRef.current);
        playbackWarmupTimerRef.current = null;
      }
      playbackWarmupReadyRef.current = false;
      playbackWarmupStartedAtRef.current = 0;
      
      if (!isCurrentlyPlaying && audioQueueRef.current.length > 0 && queueStarvationStartedAtRef.current > 0) {
          const starvationDurationMs = Date.now() - queueStarvationStartedAtRef.current;
          const nextSeq = audioQueueRef.current[0]?.meta?.sequence || '?';
          console.log(`[SCHED_DIAG] turnId=${currentAiTurnIdRef.current} nextReceivedChunkSeq=${nextSeq} schedulerWaitMs=${starvationDurationMs} bufferedChunksAtResume=${audioQueueRef.current.length}`);
          queueStarvationStartedAtRef.current = 0; // Reset
      }

      while (audioQueueRef.current.length > 0) {
        const chunk = audioQueueRef.current.shift()!;
        const buffer = audioCtx.createBuffer(1, chunk.pcm.length, 24000);
        buffer.getChannelData(0).set(chunk.pcm);

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        // Unity gain reduces loudspeaker bleed into the microphone.
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 1.0;

        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const currentTime = audioCtx.currentTime;
        let gapMs = 0;
        if (nextStartTimeRef.current < currentTime) {
          if (nextStartTimeRef.current > 0) {
            audioUnderrunCountRef.current += 1;
            gapMs = Math.round((currentTime - nextStartTimeRef.current) * 1000);
            if (gapMs > 1000 && audioQueueRef.current.length === 0) {
              addDebugLog(`[QUEUE_STARVATION_RESYNC] Network delay caused ${gapMs}ms gap. Resyncing playback.`);
            } else {
              addDebugLog(`[SCHED_DIAG] UNDER_RUN gap=${gapMs}ms lookahead=${Math.round(adaptiveLookaheadMs)}ms activeSources=${sourcesRef.current.length} queueDepth=${audioQueueRef.current.length} aiTurnOpen=${isAiTurnInProgressRef.current}`);
            }
          }
          // Resume with an adaptive mobile-network cushion instead of a
          // brittle fixed 5ms lookahead.
          nextStartTimeRef.current = currentTime + (adaptiveLookaheadMs / 1000);
        }

        const scheduledStart = nextStartTimeRef.current;
        source.start(scheduledStart);
        
        if ((chunk as any).meta) {
          const m = (chunk as any).meta;
          const serverDelay = m.serverTimestamp ? (m.clientReceiveTimestamp - m.serverTimestamp) : 0;
          const scheduleDelay = Date.now() - (m.clientReceiveTimestamp || Date.now());
          console.log(`[CHUNK_LIFECYCLE] turn=${m.turnId} chunkId=${chunk.id} seq=${m.sequence} ` +
            `serverTs=${m.serverTimestamp} clientTs=${m.clientReceiveTimestamp} queueDepth=${m.queueDepthAtReceive} ` +
            `durationMs=${Math.round(chunk.duration * 1000)} schedStart=${scheduledStart.toFixed(3)} currentCtxTime=${currentTime.toFixed(3)} ` +
            `gap=${gapMs}ms netDelay=${serverDelay}ms schedDelay=${scheduleDelay}ms`);
        }

        nextStartTimeRef.current += buffer.duration;
        sourcesRef.current.push(source);

        if (sourcesRef.current.length === 1) {
          aiPlaybackStartedAtRef.current = Date.now();
          echoGuardPeakRmsRef.current = 0;
        }
        setIsSpeaking(true);
        setConversationState('AI_SPEAKING');

        source.onended = () => {
          sourcesRef.current = sourcesRef.current.filter(s => s !== source);
          if (sourcesRef.current.length === 0) {
            if (audioQueueRef.current.length === 0) {
              if (!isAiTurnInProgressRef.current) {
                // Turn is officially completed and all buffered chunks have played
                setIsSpeaking(false);
                setConversationState('LISTENING');
                addDebugLog(`[PLAYBACK_COMPLETE] AI turn completed and all audio played smoothly.`);
              } else {
                // Temporary queue starvation between streamed chunks
                queueStarvationCountRef.current += 1;
                queueStarvationStartedAtRef.current = Date.now();
                playbackWarmupReadyRef.current = false;
                playbackWarmupStartedAtRef.current = 0;
                addDebugLog(`[SCHED_DIAG] QUEUE_STARVATION while aiTurnOpen=true`);
              }
            }
          }
        };
      }
      setAudioQueueLength(audioQueueRef.current.length);
    };

    if (audioCtx.state === 'suspended') {
      void audioCtx.resume().then(flushQueue).catch(() => {
        setVoiceError('تعذر تشغيل صوت الخبير. اضغط بدء الحوار مرة أخرى للسماح بالصوت.');
      });
      return;
    }

    flushQueue();
  }, []);

  const playAudioChunk = useCallback((base64: string, meta?: any) => {
    const audioCtx = outputAudioCtxRef.current;
    if (!audioCtx) return;

    const pcm = base64ToPcm(base64);
    if (!pcm || pcm.length === 0) return;

    const now = Date.now();
    chunkCountRef.current += 1;
    if (lastChunkTimeRef.current > 0) {
      const deltaMs = now - lastChunkTimeRef.current;
      jitterHistoryRef.current.push(deltaMs);
      if (jitterHistoryRef.current.length > 50) jitterHistoryRef.current.shift();
      if (deltaMs > 160) {
        console.log(`[${new Date().toISOString()}] [SERVER_CHUNK_GAP] High chunk arrival gap: ${deltaMs}ms (Chunk #${chunkCountRef.current}, samples: ${pcm.length})`);
      }
    }
    lastChunkTimeRef.current = now;
    
    if (!isAiTurnInProgressRef.current) {
        nextStartTimeRef.current = 0;
        playbackWarmupReadyRef.current = false;
        playbackWarmupStartedAtRef.current = 0;
        bargeInConfirmedRef.current = false;
        micPreRollRef.current = [];
        if (meta?.turnId) currentAiTurnIdRef.current = meta.turnId;
        addDebugLog(`[TURN_START] Received first chunk for new turn ${meta?.turnId || '?'}. Resetting playback scheduler.`);
    }
    isAiTurnInProgressRef.current = true;

    const duration = pcm.length / 24000;
    const chunkId = meta?.chunkId || `chunk_${Date.now()}_${Math.random()}`;
    
    const seq = currentChunkSeqRef.current + 1;
    currentChunkSeqRef.current = seq;
    const networkTransitMs = meta?.serverTimestamp ? now - meta.serverTimestamp : -1;

    audioQueueRef.current.push({
      id: chunkId,
      pcm,
      duration,
      meta: {
        ...meta,
        queueDepthAtReceive: audioQueueRef.current.length,
        sequence: seq,
        networkTransitMs,
        clientReceiveTimestamp: now,
        decodedAt: now
      }
    });
    
    console.log(`[AUDIO_PIPELINE_RECEIVE] turnId=${meta?.turnId || currentAiTurnIdRef.current} chunkSeq=${seq} networkTransitMs=${networkTransitMs} decodedAt=${now}`);

    setAudioQueueLength(audioQueueRef.current.length);
    scheduleAudioPlayback();
  }, [scheduleAudioPlayback]);

  const handleToggleTTS = (msgId: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    if (isSpeakingTTS === msgId) {
      window.speechSynthesis.cancel();
      setIsSpeakingTTS(null);
      return;
    }
    window.speechSynthesis.cancel();
    // Clean markdown syntax for pure audio reading
    const cleanText = text
      .replace(/[#*`_~>\-]/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ar-SA';
    utterance.rate = 1.0;
    utterance.onend = () => setIsSpeakingTTS(null);
    utterance.onerror = () => setIsSpeakingTTS(null);
    setIsSpeakingTTS(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('التعرف الصوتي غير مدعوم في هذا المتصفح');
      return;
    }
    if (isDictating) {
      if (dictationRecognitionRef.current) {
        try { dictationRecognitionRef.current.stop(); } catch(e) {}
      }
      setIsDictating(false);
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-SA';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputText(prev => (prev ? prev + ' ' + transcript : transcript));
        }
      };
      recognition.onend = () => setIsDictating(false);
      recognition.onerror = () => setIsDictating(false);
      dictationRecognitionRef.current = recognition;
      recognition.start();
      setIsDictating(true);
    } catch(e) {
      console.warn('Dictation error:', e);
      setIsDictating(false);
    }
  };

  const connect = async () => {
    if (isConnecting || isConnected) return;

    try {
      isIntentionalDisconnectRef.current = false;
      liveReadyRef.current = false;
      setVoiceError(null);
      setIsConnecting(true);
      setVoiceConnectionStatus('جارٍ تهيئة الصوت على جهازك...');

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('MICROPHONE_UNAVAILABLE');
      }

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('AUDIO_CONTEXT_UNAVAILABLE');
      }

      // On iPhone/Chrome (WebKit), audio contexts must be created and resumed
      // directly inside the user gesture before opening a network connection.
      const inputCtx: AudioContext = new AudioContextCtor();
      // Let WebKit choose the hardware rate. AudioBuffer carries Gemini's 24 kHz
      // rate and Web Audio performs the output conversion safely on iPhone.
      const outputCtx: AudioContext = new AudioContextCtor();
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;

      outputCtx.onstatechange = () => {
        console.log(`[${new Date().toISOString()}] [AUDIO_CTX_STATE] outputCtx state: ${outputCtx.state}`);
        if (outputCtx.state === 'suspended' && liveReadyRef.current) {
          outputCtx.resume().catch(() => {});
        }
      };
      inputCtx.onstatechange = () => {
        console.log(`[${new Date().toISOString()}] [AUDIO_CTX_STATE] inputCtx state: ${inputCtx.state}`);
        if (inputCtx.state === 'suspended' && liveReadyRef.current) {
          inputCtx.resume().catch(() => {});
        }
      };

      await Promise.all([
        inputCtx.state === 'suspended' ? inputCtx.resume() : Promise.resolve(),
        outputCtx.state === 'suspended' ? outputCtx.resume() : Promise.resolve(),
      ]);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: { ideal: 48000 },
        }
      });
      streamRef.current = stream;

      const source = inputCtx.createMediaStreamSource(stream);
      inputSourceRef.current = source;

      setVoiceConnectionStatus('جارٍ التحقق من الحساب...');
      // Refresh Firebase credentials at the moment the live session starts.
      const activeToken = guestInviteToken ? '__meeting_invite__' : (await getAuthToken() || token);
      if (!activeToken) throw new Error('AUTH_TOKEN_MISSING');

      const startWebSocketStream = (tokenToUse: string) => {
        if (wsRef.current) {
          const oldWs = wsRef.current;
          wsRef.current = null;
          oldWs.onopen = null;
          oldWs.onmessage = null;
          oldWs.onerror = null;
          oldWs.onclose = null;
          try { oldWs.close(); } catch {}
        }

        setVoiceConnectionStatus(reconnectCountRef.current > 0 ? `جارٍ استعادة الاتصال التلقائي (محاولة ${reconnectCountRef.current} من 4)...` : 'جارٍ الاتصال بالخادم الصوتي...');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/live`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = setTimeout(() => {
          if (!liveReadyRef.current) {
            console.warn('Live session setup timed out.');
            handleConnectionDrop('استغرق تشغيل الخادم وقتاً أطول من المتوقع. جارٍ إعادة المحاولة...');
          }
        }, LIVE_CONNECT_TIMEOUT_MS);

        const handleConnectionDrop = (customErrMessage?: string) => {
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          if (isIntentionalDisconnectRef.current) {
            setIsConnected(false);
            setIsConnecting(false);
            return;
          }

          liveReadyRef.current = false;
          const maxAttempts = 4;
          if (reconnectCountRef.current < maxAttempts) {
            reconnectCountRef.current += 1;
            const attempt = reconnectCountRef.current;
            const backoffDelay = Math.min(600 * Math.pow(1.5, attempt - 1), 3000);
            console.warn(`Live WebSocket stream dropped. Initiating automatic reconnect ${attempt}/${maxAttempts} in ${backoffDelay}ms...`);
            
            setIsConnecting(true);
            setIsConnected(false);
            setVoiceConnectionStatus(`جارٍ استعادة الاتصال التلقائي (محاولة ${attempt} من ${maxAttempts})...`);
            
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(async () => {
              if (isIntentionalDisconnectRef.current) return;
              try {
                const refreshedToken = guestInviteToken ? '__meeting_invite__' : (await getAuthToken() || tokenToUse);
                startWebSocketStream(refreshedToken);
              } catch (reconnErr) {
                console.warn('Auto-reconnect token refresh error:', reconnErr);
                handleConnectionDrop(customErrMessage);
              }
            }, backoffDelay);
          } else {
            console.warn('Live audio automatic reconnect attempts exhausted.');
            setVoiceError(customErrMessage || 'انقطع الاتصال الصوتي مؤقتاً بسبب تقلب شبكة الهاتف أو انتهاء مهلة الجلسة. يمكنك الضغط على "إعادة المحاولة" للمتابعة فوراً.');
            setVoiceConnectionStatus('انقطع الاتصال الصوتي');
            void disconnect(false);
          }
        };

        ws.onopen = () => {
          setVoiceConnectionStatus('تم الاتصال؛ جارٍ تجهيز الخبير الذكي...');
          const modeData = EXPERT_MODES[expertMode] || EXPERT_MODES.CONSULTANT;
          const meetingData = MEETING_TYPES[meetingType] || MEETING_TYPES.BOARD;
          
          let customMeetingContext = '';
          const mTitle = localStorage.getItem('gemini_meeting_title');
          const mAgenda = localStorage.getItem('gemini_meeting_agenda');
          const mPartsStr = localStorage.getItem('gemini_meeting_participants');
          const mOrgName = localStorage.getItem('gemini_meeting_org_name');
          
          if (mOrgName) customMeetingContext += `\nالجهة: ${mOrgName}`;
          if (mTitle) customMeetingContext += `\nموضوع الاجتماع: ${mTitle}`;
          if (mAgenda) customMeetingContext += `\nمحاور الاجتماع: ${mAgenda}`;
          
          // Inject cognitive member profiles
          if (meetingParticipants.length > 0) {
            customMeetingContext += '\n\nالمشاركون والملفات الإدراكية والتفاوضية:\n';
            meetingParticipants.forEach(p => {
              const style = p.thinkingStyle ? THINKING_STYLES[p.thinkingStyle as keyof typeof THINKING_STYLES]?.label : 'متوازن';
              const risk = p.riskStance ? RISK_STANCES[p.riskStance as keyof typeof RISK_STANCES]?.label : 'متوازن';
              const priorities = p.corePriorities || p.priorities;
              const persuasion = p.persuasionTrigger || p.persuasionKey;
              customMeetingContext += `- ${p.name} (${p.role || 'عضو'}): نمط التفكير: [${style}]، المخاطر: [${risk}]`;
              if (priorities) customMeetingContext += `، الأولويات: [${priorities}]`;
              if (persuasion) customMeetingContext += `، مفتاح الإقناع: [${persuasion}]`;
              customMeetingContext += '\n';
            });
          } else if (mPartsStr) {
            customMeetingContext += `\nالمشاركون: ${mPartsStr}`;
          }
          
          let finalInstructionContext = systemInstruction
            .replaceAll('[[COMPANY_CONTEXT_PLACEHOLDER]]', companyContext)
            .replaceAll('[[EXPERT_MODE_PLACEHOLDER]]', modeData.desc)
            .replaceAll('[[EXPERT_NAME_PLACEHOLDER]]', expertName)
            .replaceAll('[[SPEAKER_NICKNAME_PLACEHOLDER]]', speakerNickname || 'رئيس الجلسة')
            .replaceAll('[[MEETING_TYPE_PLACEHOLDER]]', meetingData.desc + customMeetingContext);

          if (!isRecordingEnabled) {
            finalInstructionContext += "\n\nتنبيه أمني: الاجتماع مشفر وغير مسموح بتسجيله للعامة.";
          }

          ws.send(JSON.stringify({
            type: 'setup',
            systemInstruction: finalInstructionContext,
            voiceName,
            token: guestInviteToken ? undefined : tokenToUse,
            inviteToken: guestInviteToken || undefined,
            sessionId: currentSessionIdRef.current || activeSessionId,
            meetingTitle: mTitle || sessionTitle,
            meetingAgenda: mAgenda || '',
            meetingType,
            expertMode,
            selectedExpertIds,
            leadExpertId,
            channel: 'INTERNAL',
            greetingMode,
            speakerNickname: guestDisplayName || speakerNickname || 'رئيس الجلسة',
            participants: meetingParticipants.map(p => ({ name: p.name, role: p.role })),
            voiceProfiles: speakerProfiles.filter(p => p.status === 'VALID' || p.status === 'CANDIDATE')
          }));

          // Keepalive heartbeat ping every 8 seconds to prevent mobile network / proxy drops
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              lastPingTimeRef.current = Date.now();
              wsRef.current.send(JSON.stringify({ type: 'ping' }));
            }
          }, 8000);
        };

        ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') {
            if (lastPingTimeRef.current > 0) {
              setRttLatency(Date.now() - lastPingTimeRef.current);
            }
            return; // keepalive ack
          }
          if (msg.type === 'setup_progress') {
            setVoiceConnectionStatus(msg.message || 'جارٍ تجهيز الخبير الذكي...');
            return;
          }
          if (msg.type === 'live_ready') {
            if (connectTimeoutRef.current) {
              clearTimeout(connectTimeoutRef.current);
              connectTimeoutRef.current = null;
            }
            liveReadyRef.current = true;
            setIsConnected(true);
            setIsConnecting(false);
            setVoiceConnectionStatus('متصل — الخبير يستمع الآن');
            setConversationState('LISTENING');
            return;
          }
          if (msg.type === 'speaker_engine_status') {
            const health = msg.health || {};
            if (health.neuralAvailable !== true) {
              setActiveAlert({
                type: 'warning',
                message: 'محرك البصمة العصبية غير متاح؛ لن ينسب النظام الحديث إلى أي اسم حتى يعود النموذج للعمل.',
              });
            }
            return;
          }
          if (msg.error) {
            console.warn("Server live stream notice:", msg.error, msg.details);
            setVoiceError(msg.details || msg.error);
            setVoiceConnectionStatus('تعذر تشغيل الجلسة الصوتية');
            void disconnect(false);
            return;
          }
          if (msg.type === 'session_info') {
            setActiveSessionId(msg.sessionId);
            if (onSessionCreated && !sessionId) {
              onSessionCreated(msg.sessionId, sessionTitle);
            }
          }
          if (msg.type === 'register_voice_profile') {
            if (msg.name) {
              const fiveSecsAgo = Date.now() - 5000;
              const recentHistory = speakerHistoryRef.current.filter(h => h.time > fiveSecsAgo);
              
              let targetId = activeFootprintIdRef.current;
              if (recentHistory.length > 0) {
                const counts = recentHistory.reduce((acc, h) => {
                  acc[h.id] = (acc[h.id] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);
                targetId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
              }

              if (targetId) {
                setVoiceFootprints(prev => {
                  const list = prev.map(f => f.id === targetId ? { ...f, name: msg.name } : f);
                  try {
                    localStorage.setItem('gemini_voice_footprints_v3', JSON.stringify(list));
                  } catch {}
                  return list;
                });
              }
              console.log(`Registered speaker identity: ${msg.name}`);
            }
          }
          if (msg.type === 'speaker_profiles_synced' && Array.isArray(msg.profiles)) {
            const durableProfiles = dedupeSpeakerProfilesForUi(msg.profiles.filter((profile: any) => !profile?.isCandidate));
            const registry = new SpeakerRegistry(durableProfiles);
            const normalizedProfiles = dedupeSpeakerProfilesForUi(registry.getAllSpeakers().filter((profile) => !profile.isCandidate));
            speakerRegistryRef.current = registry;
            setSpeakerProfiles(normalizedProfiles);
            try {
              localStorage.setItem('gemini_speaker_profiles_v4', JSON.stringify(normalizedProfiles));
            } catch {}
          }
          if (msg.type === 'meeting_item_recorded') {
            const labels: Record<string, string> = {
              DECISION: 'تم تسجيل قرار',
              RECOMMENDATION: 'تم تسجيل توصية',
              TASK: 'تم تسجيل مهمة',
              RISK: 'تم تسجيل خطر',
            };
            const itemType = String(msg.item?.itemType || '').toUpperCase();
            setActiveAlert({
              type: itemType === 'RISK' ? 'HIGH_RISK' : 'RECORDED',
              message: `${labels[itemType] || 'تم تحديث سجل الاجتماع'}: ${msg.item?.title || ''}`,
            });
          }
          if (msg.type === 'expert_task_started') {
            setActiveAlert({
              type: 'RECORDED',
              message: `بدأ الخبير تنفيذ التكليف: ${msg.title || ''}`,
            });
          }
          if (msg.type === 'expert_task_completed') {
            setActiveAlert({
              type: 'RECORDED',
              message: `اكتمل مخرج الخبير وأضيف إلى المهام: ${msg.title || ''}`,
            });
          }
          if (msg.type === 'expert_task_failed') {
            setActiveAlert({
              type: 'HIGH_RISK',
              message: `تعذر إكمال تكليف الخبير ويحتاج مراجعة: ${msg.title || ''}`,
            });
          }
          if (msg.type === 'speaker_identified') {
            const isVerified = msg.identitySource === 'VERIFIED';
            setLastSpeakerDiagnostic({
  name: msg.speakerName || 'UNKNOWN',
  source: msg.identitySource || 'UNKNOWN',
  phase: msg.phase || 'FINAL',
  similarity: typeof msg.similarity === 'number' ? msg.similarity : 0,
});
            // Stale/Overwrite protection: 
            // Do NOT let a weak PROBE or UNKNOWN FINAL overwrite an already VERIFIED speaker in the UI for this turn
            if (isVerified) {
                setActiveSpeakerId(msg.speakerId || null);
                setActiveSpeakerName(msg.speakerName || 'متحدث غير معروف');
                if (msg.similarity !== undefined) {
                  setCurrentSimilarity(msg.similarity);
                }
            } else if (msg.phase === 'FINAL' && activeSpeakerName === 'متحدث غير معروف') {
                // Only let FINAL set unknown if we never got a VERIFIED hit
                setActiveSpeakerId(msg.speakerId || null);
                setActiveSpeakerName(msg.speakerName || 'متحدث غير معروف');
            }

            const diagTurnId = msg.debugInfo?.turnId || '?';
            const diagSegmentId = msg.debugInfo?.segmentId || '?';
            addDebugLog(`[ServerDiarization:${msg.phase || 'FINAL'}] Turn:${diagTurnId} Seg:${diagSegmentId} Identified: ${msg.speakerName} (${msg.speakerId || 'UNKNOWN'}) [${(msg.similarity * 100).toFixed(0)}%] Source: ${msg.identitySource}`);
            if (msg.debugInfo?.speakerComparisons?.length) {
              const compStr = msg.debugInfo.speakerComparisons.map((c: any) => `${c.name}:${c.similarity?.toFixed(4)}[${c.eligible ? 'OK' : c.rejectionReason}]`).join(', ');
              addDebugLog(`[COMPARE] ${compStr}`);
            }
            if (isVerified) {
                setMessages((previous) => {
                  const updated = [...previous];
                  for (let index = updated.length - 1; index >= 0; index--) {
                    if (updated[index].isUser) {
                      updated[index] = {
                        ...updated[index],
                        speakerId: msg.speakerId,
                        speakerName: msg.speakerName,
                        speakerConfidence: msg.confidence === 'HIGH' ? 0.95 : msg.confidence === 'MEDIUM' ? 0.82 : 0.65,
                      };
                      break;
                    }
                  }
                  return updated;
                });
              }
            
            if (isCalibrationModeRef.current && msg.debugInfo) {
               setCalibrationLogs(prev => [...prev, {
                  segmentId: msg.debugInfo.segmentId,
                  actualSpeaker: expectedSpeakerRef.current,
                  bestSpeakerId: msg.speakerId || 'UNKNOWN',
                  bestSpeakerName: msg.speakerName || 'UNKNOWN',
                  bestSimilarity: msg.similarity || 0,
                  secondBestSpeakerId: msg.debugInfo.secondBestSpeakerId,
                  secondBestSpeakerName: msg.debugInfo.secondBestSpeakerName,
                  secondBestSimilarity: msg.debugInfo.secondBestSimilarity,
                  margin: msg.debugInfo.margin,
                  decision: msg.identitySource || 'UNKNOWN',
                  timestamp: new Date().toISOString()
               }]);
               console.log("[Calibration Logged]", msg.debugInfo);
            }
          }
          if (msg.type === 'turn_complete') {
            isAiTurnInProgressRef.current = false;
            bargeInConfirmedRef.current = false;
            micPreRollRef.current = [];
            addDebugLog(`[TURN_COMPLETE] Turn complete received for turn ${msg.turnId}. Remaining sources: ${sourcesRef.current.length}, Queue: ${audioQueueRef.current.length}`);
            if (sourcesRef.current.length === 0 && audioQueueRef.current.length === 0) {
              setIsSpeaking(false);
              setConversationState('LISTENING');
            } else {
              // Ensure we schedule playback for the remaining queue now that turn is complete
              scheduleAudioPlayback();
            }
            return;
          }
          if (msg.audio) {
            playAudioChunk(msg.audio, {
              turnId: msg.turnId,
              chunkId: msg.chunkId,
              serverTimestamp: msg.serverTimestamp,
              clientReceiveTimestamp: Date.now()
            });
          }
          if (msg.text) {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.isUser === !!msg.isUser && last.turnId === msg.turnId) {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...last,
                  text: (last.text || '') + (msg.text || ''),
                  speakerId: msg.speakerId || last.speakerId,
                  speakerName: msg.speakerName && msg.speakerName !== 'جارٍ التحقق من المتحدث'
                    ? msg.speakerName
                    : last.speakerName,
                  speakerConfidence: msg.speakerConfidence ?? last.speakerConfidence,
                  turnId: msg.turnId,
                };
                return updated;
              }
              return [...prev, {
                id: Math.random().toString(),
                text: msg.text || '',
                isUser: !!msg.isUser,
                createdAt: new Date(),
                speakerId: msg.speakerId,
                speakerName: msg.speakerName,
                speakerConfidence: msg.speakerConfidence,
                turnId: msg.turnId,
              }];
            });
          }
          if (msg.interrupted) {
            isAiTurnInProgressRef.current = false;
            bargeInConfirmedRef.current = false;
            micPreRollRef.current = [];
            stopPlayback('SERVER_INTERRUPT', msg.targetTurnId, msg.interruptRequestId);
          }
        } catch(err) {
          console.warn('Error parsing WS message:', err);
        }
      };

        ws.onerror = (e) => {
          if (isIntentionalDisconnectRef.current) return;
          console.warn(`[${new Date().toISOString()}] [WS_METRIC] Live audio WebSocket stream error:`, e);
          handleConnectionDrop();
        };

        ws.onclose = (event) => {
          if (isIntentionalDisconnectRef.current) {
            setIsConnected(false);
            setIsConnecting(false);
            return;
          }
          console.warn(`[${new Date().toISOString()}] [WS_METRIC] Live audio WebSocket closed. Code: ${event.code}, Reason: "${event.reason || 'None'}", ReconnectAttempt: ${reconnectCountRef.current}`);
          handleConnectionDrop();
        };
      };

      // Initiate initial WebSocket stream
      startWebSocketStream(activeToken);

      const processor = inputCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;
      
      // ScriptProcessor must stay connected to the audio graph on iOS, but
      // connecting it directly to the destination monitors the microphone and
      // can trigger echo/feedback. A muted gain node keeps the graph alive.
      const silentSink = inputCtx.createGain();
      silentSink.gain.value = 0;
      inputSinkRef.current = silentSink;
      source.connect(processor);
      processor.connect(silentSink);
      silentSink.connect(inputCtx.destination);

      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && liveReadyRef.current) {
          if (wsRef.current.bufferedAmount > 65536) {
            console.warn(`[${new Date().toISOString()}] [WS_BACKPRESSURE] WebSocket backpressure high (${wsRef.current.bufferedAmount} bytes). Skipping chunk.`);
            return;
          }
          const inputData = new Float32Array(e.inputBuffer.getChannelData(0));
          const capturedAudio = isMutedRef.current ? new Float32Array(inputData.length) : inputData;
          // iPhone normally captures at 48 kHz even when an app requests 16 kHz.
          // Normalize every chunk to the PCM rate expected by Gemini and the server.
          const networkAudio = resampleAudio(capturedAudio, inputCtx.sampleRate, 16000);

          // Encode once. During AI playback this frame is held behind the
          // local interruption gate so loudspeaker echo cannot trip the
          // realtime model's server-side VAD before speech is confirmed.
          const base64 = pcmToBase64(networkAudio);
          if (isMutedRef.current) {
            micPreRollRef.current = [];
            return;
          }
          
          // 2. Audio Energy (RMS) & Adaptive Dynamic Noise Floor with Hysteresis
          let sum = 0;
          let peak = 0;
          for (let i = 0; i < inputData.length; i++) {
            const sample = inputData[i];
            sum += sample * sample;
            const abs = Math.abs(sample);
            if (abs > peak) peak = abs;
          }
          const rms = Math.sqrt(sum / inputData.length);
          const crestFactor = peak / Math.max(rms, 1e-6);
          setLiveRMS(rms);

          const isAiPlaying = isSpeaking || sourcesRef.current.length > 0 || audioQueueRef.current.length > 0 || isAiTurnInProgressRef.current;

          // Adaptive Thresholds: High threshold and sustained voice requirement during AI playback to reject iPhone speaker echo.
          const startThreshold = isAiPlaying
            ? Math.max(0.085, noiseFloorRef.current * 4.5)
            : Math.max(0.015, noiseFloorRef.current * 2.5);
          const stopThreshold = isAiPlaying
            ? Math.max(0.045, noiseFloorRef.current * 3.0)
            : Math.max(0.005, noiseFloorRef.current * 1.5);

          // Near-end speech / echo guard. Browser AEC is advisory and Safari may
          // still leak the expert's speaker output into the mic, so local
          // barge-in during AI playback must be echo-aware rather than a plain
          // RMS threshold. The first playback frames are especially echo-prone;
          // require sustained, above-echo energy before interrupting the turn.
          const aiPlaybackAgeMs = isAiPlaying && aiPlaybackStartedAtRef.current > 0
            ? Date.now() - aiPlaybackStartedAtRef.current
            : Number.POSITIVE_INFINITY;
          const priorEchoPeak = isAiPlaying ? echoGuardPeakRmsRef.current : 0;
          const echoRelativeThreshold = Math.max(startThreshold, priorEchoPeak * 1.12);
          // Keep a short warmup guard for speaker click/echo, but allow a truly
          // near-field human voice to break through immediately.
          const warmupBreakthroughThreshold = Math.max(0.180, echoRelativeThreshold * 1.35);
          const playbackWarmupHoldoff = isAiPlaying && aiPlaybackAgeMs < 350 && rms < warmupBreakthroughThreshold;
          const ambientBaseline = Math.max(ambientRmsRef.current, noiseFloorRef.current * 2, 0.008);
          const nearFieldRms = rms >= Math.max(0.070, ambientBaseline * 2.8);
          const nearFieldPeak = peak >= Math.max(0.26, ambientBaseline * 8.0);
          const nearFieldImpulse = crestFactor >= 3.0;
          const closeSpeechOnset = nearFieldPeak && (nearFieldImpulse || peak >= 0.48 || rms >= 0.20);
          const sustainedNearSpeech = nearFieldRms && (crestFactor >= 2.4 || rms >= 0.18);
          const nearFieldVoice = !playbackWarmupHoldoff && (closeSpeechOnset || sustainedNearSpeech);
          // Fast interruption needs close/impulsive speech. Medium RMS with low
          // crest (typical TV/echo/compressed loudspeaker output) must persist
          // longer before we cut the expert off.
          const impulsiveNearFieldEvidence = crestFactor >= 2.85 || peak >= 0.72;
          const strongBargeIn = isAiPlaying
            && closeSpeechOnset
            && impulsiveNearFieldEvidence
            && rms >= Math.max(0.170, echoRelativeThreshold * 1.35);
          // A single sharp TV/transient or the expert's own loudspeaker echo can
          // look like near-field speech on iPhone/Safari. Do not stop playback
          // unless the signal is sustained. Low-crest, high-RMS audio is typical
          // loudspeaker echo/compressed media, so it must use the slower path.
          const requiredSpeechFrames = isAiPlaying ? (strongBargeIn ? 14 : 24) : 2;
          const isCurrentlySpeaking = vadSpeechFramesRef.current >= requiredSpeechFrames;
          const speechThreshold = isAiPlaying
            ? (isCurrentlySpeaking ? stopThreshold : echoRelativeThreshold)
            : (isCurrentlySpeaking ? stopThreshold : startThreshold);

          // Only update noise floor during confirmed silence and when AI is not playing
          if (rms < startThreshold && !isCurrentlySpeaking && !isAiPlaying) {
            noiseFloorRef.current = (noiseFloorRef.current * 0.98) + (rms * 0.02);
          }
          setLiveNoiseFloor(noiseFloorRef.current);

          const rawSpeech = !playbackWarmupHoldoff && rms > speechThreshold;
          const isSpeech = isAiPlaying ? (rawSpeech && nearFieldVoice) : rawSpeech;
          if (isAiPlaying) {
            // Learn playback echo/ambient only from non-near-field frames. Do not
            // let the user's barge-in voice raise the echo baseline above itself.
            if (!nearFieldVoice) {
              echoGuardPeakRmsRef.current = Math.max(priorEchoPeak * 0.992, rms);
              ambientRmsRef.current = (ambientRmsRef.current * 0.985) + (rms * 0.015);
            }
          } else {
            echoGuardPeakRmsRef.current = 0;
            if (!rawSpeech) ambientRmsRef.current = (ambientRmsRef.current * 0.98) + (rms * 0.02);
          }

          // 3. VAD Engine & Fast Turn-taking
          if (isSpeech) {
            vadSpeechFramesRef.current++;
            vadSilenceFramesRef.current = 0;

            if (vadSpeechFramesRef.current === requiredSpeechFrames) {
              setVadStatus('SPEECH_START');
              wsRef.current.send(JSON.stringify({ type: 'speech_start', isCalibration: isCalibrationModeRef.current, duringAiPlayback: isAiPlaying }));
              if (isAiPlaying) {
                handleBargeIn('USER_BARGE_IN', {
                  rms, noiseFloor: noiseFloorRef.current, threshold: speechThreshold, frames: vadSpeechFramesRef.current, isAiPlaying: true,
                  peak, crestFactor, ambient: ambientRmsRef.current, nearFieldVoice
                });
              } else {
                setConversationState('USER_SPEAKING');
              }
            } else if (vadSpeechFramesRef.current > requiredSpeechFrames) {
              setVadStatus('SPEECH_CONTINUE');
              if (conversationStateRef.current !== 'USER_SPEAKING' && !isAiPlaying) {
                setConversationState('USER_SPEAKING');
              }
            }
          } else {
            vadSilenceFramesRef.current++;
            
            // 6 frames = ~768ms silence grace period before finalizing segment
            if (vadSpeechFramesRef.current >= requiredSpeechFrames && vadSilenceFramesRef.current >= 6) {
              const currentNoiseFloor = noiseFloorRef.current;
              
              console.log(`[${new Date().toISOString()}] [VAD_SPEECH_END] Speech finalized. Frames: Speech=${vadSpeechFramesRef.current}, Silence=${vadSilenceFramesRef.current}, NoiseFloor=${currentNoiseFloor.toFixed(5)}`);

              setVadStatus('SPEECH_END');
              vadSpeechFramesRef.current = 0;

              // The server owns diarization and neural inference. Notify it immediately
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'speech_end', isCalibration: isCalibrationModeRef.current, duringAiPlayback: isAiPlaying }));
              }

              if (conversationStateRef.current === 'USER_SPEAKING') {
                setConversationState('AI_THINKING');
              }
            } else if (vadSilenceFramesRef.current > 6) {
              setVadStatus('SILENCE');
              vadSpeechFramesRef.current = 0;
              if (conversationStateRef.current === 'AI_THINKING' && sourcesRef.current.length === 0) {
                setConversationState('LISTENING');
              }
            }
          }

          // LiveKit-style adaptive interruption gate. While the expert is
          // talking, retain only a short pre-roll locally. Once sustained
          // nearby speech is confirmed, flush it and continue in real time.
          if (isAiPlaying) {
            micPreRollRef.current.push(base64);
            if (micPreRollRef.current.length > 8) micPreRollRef.current.shift();
            if (bargeInConfirmedRef.current) {
              const pending = micPreRollRef.current.splice(0);
              for (const frame of pending) {
                if (wsRef.current?.readyState !== WebSocket.OPEN || wsRef.current.bufferedAmount > 65536) break;
                wsRef.current.send(JSON.stringify({ audio: frame }));
              }
            } else {
              falseBargeInSuppressedCountRef.current += 1;
            }
          } else {
            micPreRollRef.current = [];
            bargeInConfirmedRef.current = false;
            wsRef.current.send(JSON.stringify({ audio: base64 }));
          }
        }
      };

    } catch (err: any) {
      console.warn('Failed to connect live stream:', err?.message || err);
      const errorCode = String(err?.message || '');
      const isPermissionError = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      const message = isPermissionError
        ? 'لم يُسمح باستخدام الميكروفون. اسمح به من إعدادات الموقع ثم أعد المحاولة.'
        : errorCode === 'AUTH_TOKEN_MISSING'
          ? 'انتهت جلسة تسجيل الدخول. حدّث الصفحة وسجّل الدخول مرة أخرى.'
          : errorCode === 'MICROPHONE_UNAVAILABLE'
            ? 'الميكروفون غير متاح في هذا المتصفح.'
            : 'تعذر بدء الاتصال الصوتي. أعد المحاولة بعد لحظات أو استخدم المحادثة النصية.';
      setVoiceError(message);
      setVoiceConnectionStatus('تعذر بدء الحوار الصوتي');
      void disconnect(false);
    }
  };

  const endMeetingAndExtract = async () => {
    isIntentionalDisconnectRef.current = true;
    setVoiceError(null);
    disconnect();
    
    const activeToken = token || await getAuthToken();
    setIsExtracting(true);
    setExtractionDone(false);

    try {
      let targetSessionId = activeSessionId;
      const orgId = localStorage.getItem('gemini_meeting_org_id');

      // If activeSessionId is not set but we have conversation messages, auto-create session first
      if (!targetSessionId && messages.length > 0 && activeToken) {
        try {
          const sessRes = await fetch('/api/sessions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${activeToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              title: `جلسة استشارية رقابية - ${new Date().toLocaleDateString('ar-SA')}`,
              orgId
            })
          });
          const sessResponse = await sessRes.json();
          const sessData = sessResponse.session || sessResponse;
          if (sessData && sessData.id) {
            targetSessionId = sessData.id;
            setActiveSessionId(targetSessionId);
            // Save messages
            for (const m of messages) {
              await fetch(`/api/sessions/${targetSessionId}/messages`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${activeToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: m.text, isUser: m.isUser })
              });
            }
          }
        } catch (sessErr) {
          console.warn('Auto session save before extract:', sessErr);
        }
      }

      if (targetSessionId && activeToken) {
        const res = await fetch(`/api/sessions/${targetSessionId}/extract`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${activeToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ orgId })
        });
        const data = await res.json();
        if (data.success) {
          await fetch(`/api/sessions/${targetSessionId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${activeToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'COMPLETED' }),
          });
          setExtractionDone(true);
          setTimeout(() => setExtractionDone(false), 5000);
        }
      } else {
        setExtractionDone(true);
        setTimeout(() => setExtractionDone(false), 5000);
      }
    } catch (e) {
      console.error('Error during extraction:', e);
      setExtractionDone(true);
      setTimeout(() => setExtractionDone(false), 5000);
    } finally {
      setIsExtracting(false);
    }
  };

  const disconnect = async (intentional = true) => {
    isIntentionalDisconnectRef.current = intentional;
    liveReadyRef.current = false;
    setIsMuted(false);
    isMutedRef.current = false;
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectCountRef.current = 0;
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try { socket.close(); } catch(e) {}
    }
    
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
      recognitionRef.current = null;
    }

    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(track => track.stop()); } catch(e) {}
      streamRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try { processorRef.current.disconnect(); } catch(e) {}
      processorRef.current = null;
    }

    if (inputSinkRef.current) {
      try { inputSinkRef.current.disconnect(); } catch(e) {}
      inputSinkRef.current = null;
    }

    if (inputSourceRef.current) {
      try { inputSourceRef.current.disconnect(); } catch(e) {}
      inputSourceRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }
    
    setIsConnecting(false);
    setIsConnected(false);
    setIsSpeaking(false);
    setConversationState('IDLE');
    setVadStatus('SILENCE');
    setLiveRMS(0);
    setAudioQueueLength(0);
    setDetectedAcousticGender('silent');
    recentPitchesRef.current = [];
    lastDetectedGenderRef.current = null;
    if (intentional) setVoiceConnectionStatus('جاهز لبدء الحوار الصوتي');
    stopPlayback('SESSION_DISCONNECT');
  };

  useEffect(() => {
    return () => {
      void disconnect(true);
    };
  }, []);

  const saveSettings = async () => {

    localStorage.setItem('gemini_voice_name', voiceName);

    localStorage.setItem('gemini_greeting_mode', greetingMode);
    localStorage.setItem('gemini_company_context', companyContext);
    localStorage.setItem('gemini_expert_mode', expertMode);

    localStorage.setItem('smart_expert_panel', JSON.stringify(selectedExpertIds));
    localStorage.setItem('smart_expert_lead', leadExpertId);
    localStorage.setItem('gemini_meeting_type', meetingType);
    localStorage.setItem('gemini_recording', isRecordingEnabled.toString());
    localStorage.setItem('gemini_retention', retentionPeriod);
    
    // Save to Database user profile to guarantee persistence across days and devices
    try {
      const activeToken = token || await getAuthToken();
      if (activeToken) {
        await Promise.all([
fetch('/api/user/profile', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${activeToken}`
  },
  body: JSON.stringify({
    preferences: {
      preferredVoice: voiceName
    }
  })
}),
          activeSessionId ? fetch(`/api/sessions/${activeSessionId}/experts`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
            body: JSON.stringify({ selectedExpertIds, leadExpertId }),
          }) : Promise.resolve(),
        ]);
      }
    } catch (err) {
      console.warn("Failed to persist user profile changes to DB:", err);
    }

    setShowSettings(false);
    setShowSecurityModal(false);
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-5rem)] max-w-6xl mx-auto rounded-2xl overflow-hidden bg-slate-900 shadow-2xl border border-slate-800" dir="rtl">
      
      {/* Top Header Bar */}
      <div className="p-3.5 sm:p-4 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            {isEditingTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                  className="px-2 py-1 bg-slate-800 border border-blue-500 rounded-lg text-white text-xs font-bold outline-none"
                  autoFocus
                />
                <button onClick={handleSaveTitle} className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs">حفظ</button>
                <button onClick={() => setIsEditingTitle(false)} className="px-2 py-1 bg-slate-700 text-slate-300 rounded-lg text-xs">إلغاء</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 
                  onClick={() => { setTitleInput(sessionTitle); setIsEditingTitle(true); }}
                  className="text-sm sm:text-base font-bold text-white truncate cursor-pointer hover:text-blue-400 transition-colors" 
                  title="انقر لتعديل عنوان المحادثة"
                >
                  {sessionTitle || (activeSessionId ? `جلسة رقم #${activeSessionId}` : 'محادثة رقابية ذكية')}
                </h2>
                <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                  <Lock className="w-2.5 h-2.5" />
                  مشفر ومحمي
                </div>
              </div>
            )}
            <p className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">
              {expertCatalog.find((profile) => profile.id === leadExpertId)?.name || expertName} • {selectedExpertIds.length} خبير • {MEETING_TYPES[meetingType]?.label || 'الرقابة والتدقيق'}
            </p>
          </div>
        </div>

        {/* Action Controls & Tabs */}
        <div className="flex items-center gap-2 shrink-0 max-w-full overflow-x-auto pb-1">
          
          {/* Tab Switcher: Chat vs Live Voice vs Cognitive Simulation */}
          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 whitespace-nowrap">
            <button
              onClick={() => { setActiveTab('chat'); setIsCalibrationMode(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'chat' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">المحادثة والتقارير</span>
            </button>

            <button
              onClick={() => { setActiveTab('voice'); setIsCalibrationMode(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'voice' 
                  ? 'bg-amber-600 text-white shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">الاتصال الصوتي</span>
            </button>

            <button
              onClick={() => { setActiveTab('cognitive'); setIsCalibrationMode(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'cognitive' 
                  ? 'bg-indigo-600 text-white shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
              title="محاكي التوافق الفكري ومصفوفة سلوك الأعضاء"
            >
              <Brain className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">محاكي التوافق الفكري</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('calibration');
                setIsCalibrationMode(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'calibration' 
                  ? 'bg-rose-600 text-white shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
              title="معايرة المتحدثين"
            >
              <Scale className="w-3.5 h-3.5 text-rose-400" />
              <span className="inline">معايرة المتحدث</span>
            </button>
          </div>

          {/* Quick Mode Switcher */}
          <div className="hidden md:flex items-center bg-slate-800 rounded-xl px-2.5 py-1.5 border border-slate-700">
            <UserCog className="w-3.5 h-3.5 text-blue-400 ml-1.5" />
            <select
              value={expertMode}
              onChange={(e) => {
                setExpertMode(e.target.value as keyof typeof EXPERT_MODES);
                localStorage.setItem('gemini_expert_mode', e.target.value);
              }}
              className="bg-transparent text-xs text-slate-300 font-medium outline-none cursor-pointer"
            >
              {Object.entries(EXPERT_MODES).map(([key, mode]) => (
                <option key={key} value={key} className="bg-slate-900">{mode.label}</option>
              ))}
            </select>
          </div>

          {/* Delete Active Session Button */}
          {activeSessionId && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2 text-rose-400 hover:text-rose-300 bg-rose-900/20 hover:bg-rose-900/40 border border-rose-500/20 rounded-xl transition-colors cursor-pointer"
              title="حذف هذه المحادثة"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Security & Settings Buttons */}
          <button 
            onClick={() => setShowSecurityModal(true)}
            className="p-2 text-emerald-400 hover:text-emerald-300 bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-500/20 rounded-xl transition-colors"
            title="إعدادات الأمان والخصوصية"
          >
            <Shield className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            title="تخصيص الخبير والصوت"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating Alert Banner */}
      {activeAlert && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 w-[92%] sm:w-auto max-w-xl">
          <div className={`p-3.5 rounded-2xl shadow-2xl flex items-start gap-3 border animate-in slide-in-from-top-4 fade-in duration-300
            ${activeAlert.type === 'FINANCIAL' ? 'bg-red-950/90 border-red-500/40 text-red-200' : 
              activeAlert.type === 'POLICY' ? 'bg-amber-950/90 border-amber-500/40 text-amber-200' :
              activeAlert.type === 'HIGH_RISK' ? 'bg-rose-950/90 border-rose-500/40 text-rose-200' :
              'bg-blue-950/90 border-blue-500/40 text-blue-200'
            }
          `}>
            <div className="p-1.5 rounded-lg bg-black/30 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-xs mb-0.5">تنبيه رقابي ذكي</h4>
              <p className="text-xs leading-relaxed opacity-90">{activeAlert.message}</p>
            </div>
            <button onClick={() => setActiveAlert(null)} className="text-slate-400 hover:text-white text-xs px-1">✕</button>
          </div>
        </div>
      )}

      {/* Main Body Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* VIEW 1: Interactive Chat & Audit Transcript */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col h-full bg-slate-950/60 overflow-hidden">
            
            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {isLoadingHistory && (
                <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  <span className="text-xs">جاري تحميل سجل المحادثة...</span>
                </div>
              )}

              {!isLoadingHistory && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto py-12">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 shadow-lg shadow-blue-500/10">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">مرحباً بك في جلسة الاستشارة الرقابية</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6">
                    يمكنك طرح استفساراتك عن الشكاوى، المخالفات، التدقيق المالي، والامتثال، أو استخدام الأزرار السريعة أدناه لبدء التدقيق فوراً.
                  </p>

                  <div className="w-full space-y-2">
                    <p className="text-[11px] font-semibold text-slate-500 text-right mb-1">نماذج استفسارات رقابية شائعة:</p>
                    {QUICK_AUDIT_PROMPTS.slice(0, 3).map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendTextMessage(prompt.text)}
                        className="w-full text-right p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs transition-all flex items-center justify-between group"
                      >
                        <span className="truncate">{prompt.label}</span>
                        <span className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">إرسال ←</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, index) => (
                <div 
                  key={msg.id || index} 
                  className={`flex flex-col ${msg.isUser ? 'items-start' : 'items-end'}`}
                >
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[11px] font-semibold text-slate-400">
                      {msg.isUser ? (msg.speakerName || 'متحدث غير معروف') : expertName}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>

                  <div 
                    className={`relative group max-w-[92%] sm:max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                      msg.isUser 
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-600/10' 
                        : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-none shadow-md'
                    }`}
                  >
                    {!msg.isUser ? (
                      <div className="prose prose-invert max-w-none text-xs sm:text-sm leading-relaxed overflow-x-auto">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    )}

                    {/* Action Buttons (TTS & Copy) */}
                    <div className="absolute top-2 left-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!msg.isUser && (
                        <button
                          onClick={() => handleToggleTTS(msg.id || index.toString(), msg.text)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isSpeakingTTS === (msg.id || index.toString())
                              ? 'bg-amber-500/30 text-amber-300'
                              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white'
                          }`}
                          title={isSpeakingTTS === (msg.id || index.toString()) ? "إيقاف القراءة" : "الاستماع صوتياً (Text-to-Speech)"}
                        >
                          <Volume2 className={`w-3.5 h-3.5 ${isSpeakingTTS === (msg.id || index.toString()) ? 'animate-pulse text-amber-400' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={() => copyToClipboard(msg.text, index)}
                        className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="نسخ النص"
                      >
                        {copiedIndex === index ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {isSendingText && (
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[11px] font-semibold text-slate-400">{expertName}</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-4 flex items-center gap-3 text-xs text-blue-400 shadow-md">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span>جاري تحليل المعطيات وتوليد التقرير الرقابي...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Chips & Chat Input Box */}
            <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md shrink-0">
              
              {/* Horizontal Scrollable Quick Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2.5 mb-2 scrollbar-none">
                {QUICK_AUDIT_PROMPTS.map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendTextMessage(chip.text)}
                    disabled={isSendingText}
                    className="whitespace-nowrap px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors shrink-0 disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Input Bar */}
              <div className="flex items-end gap-2 bg-slate-950 border border-slate-800 focus-within:border-blue-500 rounded-2xl p-2 transition-all shadow-inner">
                <textarea
                  ref={chatInputRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendTextMessage();
                    }
                  }}
                  placeholder="اكتب استفسارك الرقابي هنا (أو اضغط Shift+Enter لسطر جديد)..."
                  rows={1}
                  className="flex-1 bg-transparent text-white text-xs sm:text-sm p-2 outline-none resize-none max-h-32 min-h-[40px] leading-relaxed"
                />

                <div className="flex items-center gap-1.5 shrink-0 pb-1">
                  {/* Dictation Mic Button */}
                  <button
                    type="button"
                    onClick={handleToggleDictation}
                    className={`p-2 rounded-xl transition-colors ${
                      isDictating 
                        ? 'bg-rose-600 text-white animate-pulse' 
                        : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
                    }`}
                    title={isDictating ? "إيقاف الإملاء الصوتي" : "تحدث بالإملاء الصوتي (Speech-to-Text)"}
                  >
                    <Mic className="w-5 h-5" />
                  </button>

                  {/* Switch to Voice Button */}
                  <button
                    onClick={() => setActiveTab('voice')}
                    className="p-2 rounded-xl text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                    title="التبديل إلى المكالمة الصوتية المباشرة"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>

                  {/* Send Button */}
                  <button
                    onClick={() => handleSendTextMessage()}
                    disabled={!inputText.trim() || isSendingText}
                    className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:hover:bg-blue-600 shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:cursor-not-allowed"
                    title="إرسال"
                  >
                    {isSendingText ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* VIEW 2: Live Voice Consultant Call */}
        {activeTab === 'voice' && (
          <div className="flex-1 flex flex-col md:flex-row relative bg-slate-950/80 min-h-0 overflow-hidden">
            
            {/* Center Scrollable Area (Avatar, Status & Voice Footprints) */}
            <div className="flex-1 flex flex-col items-center justify-start p-3 sm:p-5 overflow-y-auto min-h-0 w-full pb-28 sm:pb-32">
              
              {/* Avatar Animation */}
              <div className={`relative flex items-center justify-center transition-all ${
                isConnected ? 'w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 my-2 shrink-0' : 'w-44 h-44 sm:w-56 sm:h-56 my-6 shrink-0'
              }`}>
                {/* Idle State */}
                {!isConnected && (
                  <button 
                    onClick={connect} 
                    disabled={isConnecting}
                    className="absolute inset-0 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center border border-slate-700 transition-all cursor-pointer group disabled:opacity-50 shadow-2xl hover:scale-105"
                  >
                    {isConnecting ? (
                      <Loader2 className="w-12 h-12 text-slate-400 animate-spin" />
                    ) : (
                      <Mic className="w-12 h-12 text-slate-400 group-hover:text-blue-400 transition-colors" />
                    )}
                  </button>
                )}
                {/* Connected & Listening */}
                {isConnected && !isSpeaking && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-blue-500/10 animate-[pulse_2s_ease-in-out_infinite]"></div>
                    <div className="absolute inset-2 sm:inset-3 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 shadow-[0_0_40px_rgba(37,99,235,0.4)] flex items-center justify-center">
                        <Activity className="w-8 h-8 sm:w-10 sm:h-10 text-white opacity-90" />
                      </div>
                    </div>
                  </>
                )}
                {/* Connected & Speaking */}
                {isConnected && isSpeaking && (
                  <>
                    <div className="absolute inset-[-10px] rounded-full bg-amber-500/10 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                    <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-pulse flex items-center justify-center">
                      <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_50px_rgba(245,158,11,0.6)] flex items-center justify-center">
                        <Activity className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-bounce" />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Voice Error Notice */}
              {voiceError && !isConnected && (
                <div className="mb-4 max-w-md w-full p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex flex-col items-center gap-2.5 text-center animate-in fade-in">
                  <div className="flex items-center gap-2 font-bold text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span>تنبيه الاتصال الصوتي</span>
                  </div>
                  <p className="leading-relaxed opacity-90">{voiceError}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => { setVoiceError(null); connect(); }}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs cursor-pointer transition-colors"
                    >
                      إعادة المحاولة
                    </button>
                    <button
                      onClick={() => setActiveTab('chat')}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer transition-colors"
                    >
                      الانتقال للمحادثة الذكية
                    </button>
                  </div>
                </div>
              )}

              {/* Status Text & Indicator */}
              <div className="my-1.5 h-9 flex items-center justify-center gap-2 shrink-0">
                {!isConnected && isConnecting && (
                  <div className="flex items-center gap-2 text-sm text-blue-300" role="status" aria-live="polite">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{voiceConnectionStatus}</span>
                  </div>
                )}
                {!isConnected && !isConnecting && (
                  <button 
                    onClick={connect} 
                    className="text-slate-300 hover:text-white text-sm sm:text-base transition-colors cursor-pointer font-medium"
                  >
                    اضغط لبدء الاتصال الصوتي مع {expertName}
                  </button>
                )}
                {isConnected && (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs sm:text-sm tracking-wide font-medium flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border transition-all ${
                      isMuted 
                        ? 'text-amber-300 bg-amber-950/50 border-amber-500/30' 
                        : conversationState === 'AI_SPEAKING'
                          ? 'text-amber-400 bg-amber-950/40 border-amber-500/30 animate-pulse'
                          : conversationState === 'USER_SPEAKING'
                            ? 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30'
                            : conversationState === 'INTERRUPTED'
                              ? 'text-rose-400 bg-rose-950/40 border-rose-500/30'
                              : conversationState === 'AI_THINKING'
                                ? 'text-purple-400 bg-purple-950/40 border-purple-500/30'
                                : 'text-blue-400 bg-blue-950/40 border-blue-500/20'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${
                        isMuted 
                          ? 'bg-amber-400' 
                          : conversationState === 'AI_SPEAKING' 
                            ? 'bg-amber-400 animate-ping'
                            : conversationState === 'USER_SPEAKING'
                              ? 'bg-emerald-400 animate-pulse'
                              : conversationState === 'INTERRUPTED'
                                ? 'bg-rose-400'
                                : 'bg-blue-400 animate-pulse'
                      }`}></span>
                      {isMuted 
                        ? 'المايك مكتوم (صامت)' 
                        : conversationState === 'AI_SPEAKING'
                          ? `${expertName} يتحدث الآن...`
                          : conversationState === 'USER_SPEAKING'
                            ? (activeSpeakerName && activeSpeakerName !== 'متحدث غير معروف' && activeSpeakerName !== 'UNKNOWN' ? `${activeSpeakerName} يتحدث الآن...` : 'جارٍ الاستماع إليك...')
                            : conversationState === 'INTERRUPTED'
                              ? 'تمت المقاطعة الفورية (Barge-In)...'
                              : conversationState === 'AI_THINKING'
                                ? 'معالجة الرد الصوتي...'
                                : 'مستمع... تحدث الآن'}
                    </span>

                    {/* Developer Telemetry HUD Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setShowDebugHUD(prev => !prev)}
                      className={`p-1.5 rounded-full border transition-all text-xs flex items-center gap-1 cursor-pointer ${
                        showDebugHUD
                          ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 shadow-md shadow-indigo-600/20'
                          : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
                      }`}
                      title="مؤشرات الأداء اللحظية (Dev HUD & Diagnostics)"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span className="text-[10px] hidden sm:inline">HUD</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Developer Diagnostics HUD Panel */}
              {isConnected && showDebugHUD && (
                <div className="w-full max-w-xl mx-auto my-2 p-3 rounded-2xl bg-slate-950/95 border border-indigo-500/30 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 text-right font-mono" dir="rtl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                      <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
                      <span>لوحة التشخيص والقياسات اللحظية (Dev Telemetry HUD)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDebugHUD(false)}
                      className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400 text-[10px] mb-0.5">حالة النظام (State)</div>
                      <div className="font-bold text-indigo-300">{conversationState}</div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400 text-[10px] mb-0.5">كاشف الصوت (VAD)</div>
                      <div className={`font-bold ${vadStatus === 'SPEECH_START' || vadStatus === 'SPEECH_CONTINUE' ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {vadStatus}
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400 text-[10px] mb-0.5">طابور الصوت (Queue)</div>
                      <div className="font-bold text-amber-300">{audioQueueLength} قطع ({sourcesRef.current.length} قيد التشغيل)</div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400 text-[10px] mb-0.5">زمن الاستجابة (RTT)</div>
                      <div className="font-bold text-emerald-400">{rttLatency > 0 ? `${rttLatency} ms` : '< 50 ms'}</div>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                    <div className="flex items-center gap-2">
                      <span>طاقة الصوت RMS: <strong className="text-slate-200">{(liveRMS * 100).toFixed(1)}%</strong></span>
                      <span>عتبة الضجيج: <strong className="text-slate-200">{(liveNoiseFloor * 100).toFixed(1)}%</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>مرات المقاطعة (Barge-in): <strong className="text-rose-400">{interruptionCount}</strong></span>
                      <span>الثقة الصوتية: <strong className="text-blue-400">{(speakerConfidence * 100).toFixed(0)}%</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Server-authoritative speaker recognition and diarization panel */}
<div className="w-full max-w-2xl mx-auto mt-2 px-3 py-2 rounded-xl bg-slate-950 border border-cyan-500/40 text-xs font-mono">
  <span className="text-slate-400">BIOMETRIC: </span>
  <span className="font-bold text-cyan-300">
    {lastSpeakerDiagnostic.name}
  </span>
  <span className="text-slate-400">
    {' | '}{lastSpeakerDiagnostic.source}
    {' | '}{Math.round(lastSpeakerDiagnostic.similarity * 100)}%
    {' | '}{lastSpeakerDiagnostic.phase}
  </span>
</div>
              <div className="w-full max-w-2xl mx-auto mt-2 shrink-0">
                <SpeakerRegistryPanel
                  registry={speakerRegistryRef.current}
                  provider={speakerProviderRef.current}
                  profiles={speakerProfiles}
                  activeSpeakerId={activeSpeakerId}
                  activeSpeakerName={activeSpeakerName}
                  currentSimilarity={currentSimilarity}
                  debugLogs={debugLogs}
                  onProfilesUpdated={(updated) => {
                    const deduped = dedupeSpeakerProfilesForUi(updated);
                    setSpeakerProfiles(deduped);
                    speakerRegistryRef.current = new SpeakerRegistry(deduped);
                    try {
                      localStorage.setItem('gemini_speaker_profiles_v4', JSON.stringify(deduped));
                    } catch {}
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                      wsRef.current.send(JSON.stringify({ type: 'sync_speakers', profiles: deduped }));
                    }
                  }}
                  onSelectSpeakerOverride={(mode) => {
                    setActiveSpeakerMode(mode);
                    if (mode !== 'auto') {
                      const sp = speakerProfiles.find(p => p.id === mode);
                      if (sp) {
                        setActiveSpeakerId(sp.id);
                        setActiveSpeakerName(sp.name);
                        if (wsRef.current?.readyState === WebSocket.OPEN) {
                          wsRef.current.send(JSON.stringify({
                            type: 'speaker_override',
                            speakerId: sp.id,
                            speakerName: sp.name
                          }));
                        }
                      }
                    }
                  }}
                  activeOverrideMode={activeSpeakerMode}
                />
              </div>

            </div>

            {/* FIXED DOCKED BOTTOM ACTION CONTROLS BAR (Always visible & accessible) */}
            <div className="absolute bottom-0 inset-x-0 z-30 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 px-3 sm:px-6 py-2.5 sm:py-3 shadow-2xl flex flex-wrap items-center justify-center gap-2 sm:gap-3" dir="rtl">
              {/* Main Call Toggle Button */}
              <button
                onClick={isConnected ? () => { void disconnect(true); } : connect}
                disabled={isConnecting}
                className={`flex items-center gap-2 px-5 sm:px-6 py-2.5 rounded-xl text-white font-bold transition-all shadow-xl text-xs sm:text-sm cursor-pointer ${
                  isConnected 
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20 active:scale-95' 
                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20 active:scale-95'
                }`}
              >
                {isConnected ? (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span>إنهاء المكالمة</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>بدء الحوار الصوتي</span>
                  </>
                )}
              </button>

              {/* Mute / Unmute Microphone Button (When Connected) */}
              {isConnected && (
                <button
                  type="button"
                  onClick={() => setIsMuted(prev => !prev)}
                  className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer border ${
                    isMuted
                      ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-600/20 animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title={isMuted ? 'تشغيل المايك' : 'كتم المايك مؤقتاً'}
                >
                  {isMuted ? (
                    <>
                      <MicOff className="w-4 h-4 text-white" />
                      <span>المايك مكتوم</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 text-slate-300" />
                      <span>كتم المايك</span>
                    </>
                  )}
                </button>
              )}

              {/* Extract Minutes Button */}
              {messages.length > 0 && !extractionDone && (
                <button
                  onClick={endMeetingAndExtract}
                  disabled={isExtracting}
                  className="flex items-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري التوثيق...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5" />
                      <span>استخراج وتوثيق المحضر</span>
                    </>
                  )}
                </button>
              )}

              {/* Extraction Success Badge */}
              {extractionDone && (
                <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>تم حفظ وتوثيق المحضر بنجاح</span>
                </div>
              )}

              {/* Quick Switch to Text Chat */}
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold cursor-pointer transition-colors"
                title="عرض وتعديل نص المحادثة"
              >
                <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">سجل المحادثة</span>
              </button>
            </div>

            {/* Left Sidebar (Meeting Info & Participants) */}
            <div className="hidden lg:flex w-72 border-r border-slate-800 p-6 flex-col bg-slate-900/40 pb-28">
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-4">أعضاء الجلسة الحالية</h3>
              <div className="space-y-3.5 flex-1 overflow-y-auto">
                <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-800/40 border border-slate-700/50">
                  <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">أ</div>
                  <div>
                    <p className="text-xs font-bold text-white">المدير التنفيذي</p>
                    <p className="text-[10px] text-slate-400">رئيس الجلسة</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-800/40 border border-slate-700/50">
                  <div className="w-9 h-9 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">م</div>
                  <div>
                    <p className="text-xs font-bold text-white">المدير المالي والرقابي</p>
                    <p className="text-[10px] text-slate-400">عضو مشارك</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-800/40 border border-slate-700/50">
                  <div className="w-9 h-9 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-xs">س</div>
                  <div>
                    <p className="text-xs font-bold text-white">مدير الشكاوى والمتابعة</p>
                    <p className="text-[10px] text-slate-400">عضو مشارك</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 relative">
                      {isConnected && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-900 animate-pulse"></span>
                      )}
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-400">{expertName}</p>
                      <p className="text-[10px] text-slate-400">المستشار الرقابي والذكي</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* View Transcript shortcut */}
              <button
                onClick={() => setActiveTab('chat')}
                className="w-full mt-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-2 border border-slate-700"
              >
                <FileText className="w-4 h-4" />
                عرض سجل المحادثة النصي
              </button>
            </div>

          </div>
        )}

        {/* VIEW 3: Cognitive Profiling & Consensus Matrix */}
        {activeTab === 'cognitive' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-950/70">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  أعضاء الجلسة الحالية ومصفوفة السلوك الفكري ({meetingParticipants.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  انقر على أي عضو لتعديل نمط تفكيره، أو استشر الذكاء الاصطناعي لإقناعه بالقرارات
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newMember: MemberProfile = {
                      name: `عضو جديد ${meetingParticipants.length + 1}`,
                      role: 'عضو مشارك',
                      thinkingStyle: 'analytical',
                      riskStance: 'balanced'
                    };
                    const updated = [...meetingParticipants, newMember];
                    setMeetingParticipants(updated);
                    localStorage.setItem('gemini_meeting_participants', JSON.stringify(updated));
                    setSelectedMemberForPersona({ member: newMember, index: updated.length - 1 });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  إضافة عضو للجلسة
                </button>
              </div>
            </div>

            {/* Render Cognitive Simulator */}
            <MeetingCognitiveSimulator
              participants={meetingParticipants}
              agenda={sessionTitle}
              meetingTitle={sessionTitle}
              onAskAIAboutMember={(memberName, query) => {
                setActiveTab('chat');
                handleSendTextMessage(query);
              }}
            />
          </div>
        )}

        {/* Calibration Mode Tab Content */}
        {activeTab === 'calibration' && (
          <div className="flex-1 flex flex-col h-full bg-slate-900 overflow-hidden relative">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700/50 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <Mic className="w-5 h-5 text-rose-500" />
                    وضع معايرة المتحدث (Scientific Calibration)
                  </h3>
                  <p className="text-slate-400 text-xs mt-1">هذا الوضع مخصص لاختبار دقة البصمة الصوتية وحساب الـ Thresholds بدون التأثير على محرك المحادثة.</p>
                </div>
                <button
                  onClick={isConnected ? () => { void disconnect(true); } : connect}
                  disabled={isConnecting}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold transition-all shadow-lg ${
                    isConnected
                      ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-500 hover:text-white'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-indigo-500/25'
                  } disabled:opacity-50`}
                >
                  {isConnecting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> جاري الاتصال...</>
                  ) : isConnected ? (
                    <><Square className="w-5 h-5 fill-current" /> إيقاف المعايرة</>
                  ) : (
                    <><Mic className="w-5 h-5" /> بدء المعايرة والتسجيل</>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-4 bg-slate-900/50 p-3 rounded-xl border border-slate-700">
                <label className="text-sm font-semibold text-slate-300">المتحدث الفعلي (Actual Speaker):</label>
                <select 
                  value={expectedSpeaker}
                  onChange={(e) => setExpectedSpeaker(e.target.value as any)}
                  className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-rose-500"
                >
                  <option value="speaker_001">المتحدث الأول (speaker_001)</option>
                  <option value="speaker_002">المتحدث الثاني (speaker_002)</option>
                  <option value="unknown">متحدث غير معروف (مخترق/Impostor)</option>
                </select>
                <div className="text-xs text-slate-400 mr-auto">
                  اختر هويتك الحقيقية قبل التحدث ليتم مطابقتها مع قرار النظام.
                </div>
                <button 
                  onClick={() => setCalibrationLogs([])}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-600"
                >
                  مسح السجل
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {calibrationLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <Activity className="w-12 h-12 mb-3 opacity-20" />
                  <p>لم يتم تسجيل أي قراءات بعد.</p>
                  <p className="text-xs mt-2">اضغط على "بدء المعايرة" وابدأ بالتحدث لالتقاط البصمات.</p>
                </div>
              ) : (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-slate-900/80 text-slate-300 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3">الوقت</th>
                        <th className="px-4 py-3">المتحدث الفعلي</th>
                        <th className="px-4 py-3">أفضل تطابق</th>
                        <th className="px-4 py-3">نسبة التشابه</th>
                        <th className="px-4 py-3">ثاني أفضل</th>
                        <th className="px-4 py-3">الفرق (Margin)</th>
                        <th className="px-4 py-3">القرار النهائي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {calibrationLogs.map((log, i) => {
                        const isCorrect = log.bestSpeakerId === log.actualSpeaker || (log.actualSpeaker === 'unknown' && (log.decision === 'UNKNOWN' || log.decision === 'CANDIDATE'));
                        return (
                          <tr key={i} className="hover:bg-slate-700/30 transition-colors text-slate-200">
                            <td className="px-4 py-3 text-xs text-slate-400">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="px-4 py-3 font-medium">
                              {log.actualSpeaker === 'speaker_001' ? 'المتحدث الأول' : log.actualSpeaker === 'speaker_002' ? 'المتحدث الثاني' : 'غير معروف'}
                            </td>
                            <td className="px-4 py-3">
                              {log.bestSpeakerName}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${log.bestSimilarity >= 0.68 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                {(log.bestSimilarity * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs">
                              {log.secondBestSpeakerName || '-'} ({(log.secondBestSimilarity * 100).toFixed(1)}%)
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${log.margin >= 0.08 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                {log.margin ? (log.margin * 100).toFixed(1) + '%' : '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${isCorrect ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                                {log.decision} {isCorrect ? '✅' : '❌'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Member Persona Editing Modal */}
      {selectedMemberForPersona && (
        <MemberPersonaModal
          isOpen={!!selectedMemberForPersona}
          onClose={() => setSelectedMemberForPersona(null)}
          member={selectedMemberForPersona.member}
          onSave={(updatedMember) => {
            const updated = [...meetingParticipants];
            updated[selectedMemberForPersona.index] = updatedMember;
            setMeetingParticipants(updated);
            localStorage.setItem('gemini_meeting_participants', JSON.stringify(updated));
            setSelectedMemberForPersona(null);
          }}
        />
      )}

      {/* Security Modal */}
      {showSecurityModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-emerald-950/30 p-6 border-b border-emerald-900/30">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-900/50 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">إعدادات الأمان والخصوصية الرقابية</h3>
                  <p className="text-xs text-emerald-400/80 mt-0.5">تشفير تام وحماية سرية البيانات</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                <div>
                  <h4 className="text-white text-xs font-bold flex items-center gap-2">
                    <Mic className="w-4 h-4 text-rose-400" />
                    تسجيل وحفظ جلسات الاستشارة
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1">الاحتفاظ بنسخة نصية للرجوع إليها في محاضر الاجتماعات</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={isRecordingEnabled} 
                    onChange={(e) => setIsRecordingEnabled(e.target.checked)} 
                  />
                  <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 space-y-2">
                <h4 className="text-white text-xs font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-blue-400" />
                  سياسة الاحتفاظ بالبيانات (Retention Policy)
                </h4>
                <select
                  value={retentionPeriod}
                  onChange={(e) => setRetentionPeriod(e.target.value)}
                  disabled={!isRecordingEnabled}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs outline-none transition-all disabled:opacity-50"
                >
                  <option value="24_hours">حذف تلقائي بعد 24 ساعة</option>
                  <option value="7_days">حذف تلقائي بعد 7 أيام</option>
                  <option value="30_days">حذف تلقائي بعد 30 يوماً</option>
                  <option value="forever">الاحتفاظ الدائم (مؤرشف ومُشفر)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-between items-center gap-3">
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="px-3.5 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  حذف الجلسة الحالية
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSecurityModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-300 hover:text-white text-xs font-medium"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={saveSettings}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    حفظ السياسة
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-blue-900/50 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">تخصيص المستشار الرقابي والصوت</h3>
                <p className="text-xs text-slate-400">قم بتعيين شخصية الخبير، الصوت، ونوع الاجتماع</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <label className="block text-xs font-bold text-indigo-200">لوحة الخبراء متعددة التخصصات</label>
                    <p className="text-[10px] text-slate-400 mt-1">اختر خبيراً قائداً وحتى 3 مراجعين مستقلين. الاختيار الحالي {selectedExpertIds.length}/4.</p>
                  </div>
                  <Users className="w-5 h-5 text-indigo-400 shrink-0" />
                </div>

                {expertCatalog.length === 0 ? (
                  <div className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> جارٍ تحميل كتالوج الخبراء…</div>
                ) : Object.entries(EXPERT_CATEGORY_LABELS).map(([category, label]) => {
                  const categoryExperts = expertCatalog.filter((profile) => profile.category === category);
                  if (!categoryExperts.length) return null;
                  return (
                    <div key={category} className="space-y-1.5">
                      <p className="text-[11px] font-bold text-slate-300">{label}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {categoryExperts.map((profile) => {
                          const selected = selectedExpertIds.includes(profile.id);
                          return (
                            <button
                              key={profile.id}
                              type="button"
                              onClick={() => {
                                if (selected) {
                                  if (selectedExpertIds.length === 1) return;
                                  const next = selectedExpertIds.filter((id) => id !== profile.id);
                                  setSelectedExpertIds(next);
                                  if (leadExpertId === profile.id) setLeadExpertId(next[0]);
                                } else if (selectedExpertIds.length < 4) {
                                  setSelectedExpertIds([...selectedExpertIds, profile.id]);
                                }
                              }}
                              title={profile.description}
                              className={`p-2.5 rounded-xl border text-right transition-colors ${selected ? 'bg-indigo-600/20 border-indigo-400 text-indigo-100' : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                            >
                              <span className="block text-[11px] font-bold">{selected ? '✓ ' : ''}{profile.name}</span>
                              <span className="block text-[10px] mt-0.5 opacity-75">{profile.domain}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">الخبير القائد وصاحب الرد النهائي</label>
                  <select
                    value={leadExpertId}
                    onChange={(event) => setLeadExpertId(event.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs outline-none"
                  >
                    {selectedExpertIds.map((id) => {
                      const profile = expertCatalog.find((item) => item.id === id);
                      return <option key={id} value={id}>{profile?.name || id}</option>;
                    })}
                  </select>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/25 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <label className="block text-xs font-bold text-emerald-200">الاستشارة عبر المكالمات الخارجية</label>
                    <p className="text-[10px] text-slate-400 mt-1">جسر ثنائي الاتجاه لرقم WhatsApp Business Calling المؤهل عبر Twilio.</p>
                  </div>
                  <Volume2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="space-y-1">
                  {consultationCapabilities.map((capability) => (
                    <div key={capability.id} className="flex items-start justify-between gap-2 text-[10px] rounded-lg bg-slate-900/50 px-2.5 py-2">
                      <span className="text-slate-300">{capability.name}</span>
                      <span className={capability.status === 'AVAILABLE' ? 'text-emerald-400' : capability.status === 'CONDITIONAL' ? 'text-amber-400' : 'text-rose-400'}>{capability.status}</span>
                    </div>
                  ))}
                </div>
                <input
                  value={callBusinessUseCase}
                  onChange={(event) => setCallBusinessUseCase(event.target.value)}
                  placeholder="حالة الاستخدام المؤسسية"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs outline-none"
                />
                <label className="flex items-start gap-2 text-[10px] text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={callConsentRecorded} onChange={(event) => setCallConsentRecorded(event.target.checked)} className="mt-0.5" />
                  <span>أؤكد الحصول على موافقة صريحة من المشاركين على توصيل الخبير وتسجيل النص والصوت وفق سياسة المؤسسة والقانون.</span>
                </label>
                <button
                  type="button"
                  disabled={!callConsentRecorded || channelSetupState === 'LOADING' || !activeSessionId}
                  onClick={createExternalConsultationSession}
                  className="w-full px-3 py-2 rounded-xl bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold"
                >
                  {channelSetupState === 'LOADING' ? 'جارٍ إنشاء القناة…' : 'إنشاء رابط WhatsApp Business Calling / Twilio'}
                </button>
                {channelSetupMessage && <p className={`text-[10px] ${channelSetupState === 'ERROR' ? 'text-rose-300' : 'text-emerald-300'}`}>{channelSetupMessage}</p>}
                {twilioWebhookUrl && (
                  <div className="flex gap-2">
                    <input readOnly value={twilioWebhookUrl} dir="ltr" className="min-w-0 flex-1 px-2 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[9px] text-slate-300" />
                    <button type="button" onClick={() => navigator.clipboard.writeText(twilioWebhookUrl)} className="px-3 rounded-lg bg-slate-700 text-white"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                )}
                <p className="text-[10px] text-amber-300">لا يمكن لبوت رسمي الانضمام إلى مكالمة Messenger شخصية قائمة؛ استخدم جسر مكبر الصوت داخل المنصة عند الحاجة.</p>
              </div>

              {/* Dynamic Greeting & Speaker Recognition Options */}
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 space-y-3">
                <label className="block text-xs font-bold text-blue-300">
                  🎯 أسلوب التحية والترحيب عند بدء الاجتماع
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setGreetingMode('auto')}
                    className={`p-2.5 rounded-xl text-right text-xs border transition-all ${
                      greetingMode === 'auto'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-200 font-bold shadow-sm'
                        : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span>🤖 تلقائي ذكي</span>
                      {greetingMode === 'auto' && <span className="text-[10px] text-blue-400">✓ مفعّل</span>}
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal leading-relaxed">
                      إذا وُجد مشارك واحد يناديه باسمه، وإن كانوا متعددين يرحب بالجميع
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGreetingMode('all')}
                    className={`p-2.5 rounded-xl text-right text-xs border transition-all ${
                      greetingMode === 'all'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-200 font-bold shadow-sm'
                        : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span>👥 ترحيب بالجميع</span>
                      {greetingMode === 'all' && <span className="text-[10px] text-blue-400">✓ مفعّل</span>}
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal leading-relaxed">
                      يلقي التحية على جميع الحاضرين ويدعوهم لتعريف أنفسهم
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGreetingMode('custom')}
                    className={`p-2.5 rounded-xl text-right text-xs border transition-all ${
                      greetingMode === 'custom'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-200 font-bold shadow-sm'
                        : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span>👤 اسم مخصص</span>
                      {greetingMode === 'custom' && <span className="text-[10px] text-blue-400">✓ مفعّل</span>}
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal leading-relaxed">
                      مناداة وترحيب مباشر بالاسم/الكنية المكتوبة أدناه
                    </p>
                  </button>
                </div>
              </div>

           
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    نوع الجلسة الرقابية
                  </label>
                  <select
                    value={meetingType}
                    onChange={(e) => setMeetingType(e.target.value as keyof typeof MEETING_TYPES)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                  >
                    {Object.entries(MEETING_TYPES).map(([key, mode]) => (
                      <option key={key} value={key}>{mode.label}</option>
                    ))}
                  </select>
                </div>

              
              </div>

             

            
<div>
  <label className="block text-xs font-bold text-slate-300 mb-2">
    نبرة الصوت المباشر (Voice Tone)
  </label>

  <select
    value={voiceName}
    onChange={(e) => setVoiceName(e.target.value)}
    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-xs outline-none focus:border-blue-500"
  >
    <optgroup label="أصوات رجالية">
      <option value="Charon">Charon — عميق وواثق</option>
      <option value="Fenrir">Fenrir — قوي وحازم</option>
      <option value="Puck">Puck — ديناميكي ومرن</option>
    </optgroup>

    <optgroup label="أصوات نسائية">
      <option value="Zephyr">Zephyr — هادئ وطبيعي</option>
      <option value="Kore">Kore — عميق وواضح</option>
      <option value="Aoede">Aoede — لطيف ودافئ</option>
    </optgroup>
  </select>
</div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  ذاكرة المؤسسة وسياق العمل (Company Context)
                </label>
                <textarea
                  value={companyContext}
                  onChange={(e) => setCompanyContext(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs outline-none resize-none font-mono"
                />
              </div>
              
              <div className="flex gap-3 pt-3">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={saveSettings}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20"
                >
                  حفظ الإعدادات
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Active Session Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title="حذف الجلسة الحالية"
        message={`هل أنت متأكد من رغبتك في حذف هذه الجلسة الرقابية "${sessionTitle}" نهائياً؟ سيتم مسح كافة الرسائل والملاحظات والمخاطر المسجلة.`}
        confirmText="تأكيد الحذف النهائي"
        cancelText="إلغاء"
        isDestructive={true}
        isLoading={isDeletingSession}
        onConfirm={confirmDeleteSession}
        onClose={() => {
          if (!isDeletingSession) setShowDeleteModal(false);
        }}
      />

      {/* Debug Logs Toggle Button */}
      <div className="fixed bottom-4 left-4 z-40">
        <button
          onClick={() => setShowDebugLog(p => !p)}
          className="p-2 rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shadow-lg backdrop-blur-md"
          title="سجل التشخيص"
        >
          <Activity className="w-5 h-5" />
        </button>
      </div>

      {/* Debug Logs Panel */}
      {showDebugLog && (
        <div className="fixed bottom-0 left-0 w-full max-h-[50vh] bg-black/95 border-t border-emerald-900/50 z-50 flex flex-col font-mono shadow-2xl backdrop-blur-xl transition-all">
          
          {/* Live Health Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-emerald-900/30">
            <div className="flex flex-wrap gap-4 text-[10px] uppercase font-semibold">
              <span className={isConnected ? "text-emerald-400" : "text-rose-400"}>WS: {isConnected ? 'OK' : 'OFF'}</span>
              <span className={voiceConnectionStatus.includes('متصل') ? "text-emerald-400" : "text-rose-400"}>MIC: {voiceConnectionStatus.includes('متصل') ? 'OK' : 'OFF'}</span>
              <span className={audioQueueLength === 0 && isAiTurnInProgressRef.current ? "text-yellow-400" : "text-emerald-400"}>
                AI AUDIO: {isAiTurnInProgressRef.current ? (audioQueueLength > 0 ? 'OK' : 'STARVED') : 'IDLE'}
              </span>
              <span className="text-emerald-400">
                MATCH ENGINE: OK
              </span>
              <span className={activeSpeakerName && activeSpeakerName !== 'متحدث غير معروف' ? "text-emerald-400" : "text-yellow-400"}>
                LAST RESULT: {activeSpeakerName || 'UNKNOWN'}
              </span>
<span
  className={
    lastSpeakerDiagnostic.source === 'VERIFIED'
      ? 'text-cyan-400'
      : 'text-yellow-400'
  }
>
  BIOMETRIC: {lastSpeakerDiagnostic.name}
  {' | '}
  {lastSpeakerDiagnostic.source}
  {' | '}
  {Math.round(lastSpeakerDiagnostic.similarity * 100)}%
  {' | '}
  {lastSpeakerDiagnostic.phase}
</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const text = diagnosticLogs.map(l => `[${l.time}] ${l.msg}`).join('\n');
                  navigator.clipboard.writeText(text);
                }}
                className="text-[10px] flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/30 transition-colors"
              >
                <Copy className="w-3 h-3" />
                Copy Log
              </button>
              <button
                onClick={() => setShowDebugLog(false)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 text-[10px] sm:text-[11px] select-text">
            {diagnosticLogs.length === 0 ? (
              <div className="text-slate-500 italic text-center py-4">Waiting for diagnostic events...</div>
            ) : (
              diagnosticLogs.map((log, i) => (
                <div key={i} className="flex gap-3 hover:bg-emerald-900/10 p-1 rounded break-words">
                  <span className="text-emerald-600/70 shrink-0 select-none">[{log.time}]</span>
                  <span className={`flex-1 ${
                    log.msg.includes('BARGE_IN_TRIGGER') ? 'text-amber-400' :
                    log.msg.includes('PLAYBACK_STOP') ? 'text-rose-400' :
                    log.msg.includes('TURN_COMPLETE') ? 'text-emerald-300' :
                    log.msg.includes('AUDIO_UNDERRUN') ? 'text-orange-400' :
                    log.msg.includes('QUEUE_STARVATION') ? 'text-yellow-400' :
                    'text-emerald-100/80'
                  }`}>
                    {log.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

    </div>
  );
}
