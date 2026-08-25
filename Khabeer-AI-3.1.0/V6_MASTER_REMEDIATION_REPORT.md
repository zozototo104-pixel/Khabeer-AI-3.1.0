# Smart-AI V6 — MASTER PRODUCTION REMEDIATION REPORT

**تاريخ الإصدار:** 2026-08-23 (UTC+8)
**النسخة الأساس:** V5-COMPLETE
**النسخة الحالية:** V6-MASTER

==================================================
1. ROOT CAUSES FOUND
==================================================

### B-1: Speaker Evidence Wipe on VAD Micro-Pause
**السبب الجذري**: في `server/services/speech/SpeechEngine.ts:255`، كان
`beginSpeechSegment()` يستدعي `this.liveEvidence.delete(sessionId)` عند كل
`speech_start`. هذا الحدث يُطلَق أيضاً عند VAD micro-pauses (وقفات التنفس بين
الجمل). النتيجة: يتم مسح hit counter قبل أن يصل إلى `hits >= 2` المطلوب
لـ VERIFIED في `stabilizeLiveProbe()`.
**الإصلاح**: إزالة `liveEvidence.delete(sessionId)` — آلية candidate-aware
الموجودة في `stabilizeLiveProbe` (line 92-95) تكفي لعزل المتحدثين، والـ 3500ms
expiry window تمنع تراكم evidence قديم.

### C-1: "رئيس الجلسة" كهوية صوتية
**السبب الجذري**: في `server.ts:1058` كان الـ system instruction يقول
"رئيس الجلسة الأساسي هو (${foundUserNickname})" — هذا يجعل الذكاء يفترض أن
المتحدث هو رئيس الجلسة لمجرد أنه يتحدث، بدل انتظار VERIFIED SPEAKER metadata.
**الإصلاح**: إضافة rule #0 صريحة: "رئيس الجلسة" هو دور إداري وليس هوية
صوتية. الهوية الصوتية تأتي حصراً من VERIFIED SPEAKER.

### D-1: Phantom Speakers Persisted
**السبب الجذري**: في `src/db/speakers.ts:31-36` كان
`replacePersistentSpeakerProfiles` يمرر CANDIDATE profiles إلى PostgreSQL.
هذا يعني أي متحدث مجهول مُكتشَف (حتى من مجرد فتح اجتماع + ضوضاء ambient)
يُصبح persistent profile.
**الإصلاح**: إضافة فلتر يرفض `isCandidate === true`، `status === 'CANDIDATE'`،
و IDs تبدأ بـ `candidate_` أو `unknown_`.

### F-1: Client-Supplied Embedding Accepted
**السبب الجذري**: `POST /api/speech/register` كان يقبل `embedding` array
مباشرة من client. هذا يسمح بإرسال 128-D vector وتخزينه كـ"neural" profile.
**الإصلاح**: رفض client embeddings كلياً. المتطلب الوحيد للتسجيل: `{name,
audio (base64 PCM16 16kHz), sampleRate}`. الخادم يستخرج الـ embedding عبر
ONNX Worker فقط، ويتحقق من dim===512 قبل الحفظ.

==================================================
2. FILES CHANGED
==================================================

**server/services/speech/SpeechEngine.ts**
function: `beginSpeechSegment()`
reason: إزالة `liveEvidence.delete(sessionId)` لمنع مسح evidence عند VAD
micro-pauses (Section B).

**server.ts**
function: `speakerAcousticRule` system instruction (line ~1056)
reason: فصل "رئيس الجلسة" (دور إداري) عن الهوية الصوتية (Section C).

**server.ts**
function: `app.post('/api/speech/register', ...)`
reason: رفض client embeddings + قبول raw audio فقط + التحقق من dim===512
(Section F).

**src/db/speakers.ts**
function: `replacePersistentSpeakerProfiles()`
reason: فلتر CANDIDATE profiles من persistence (Section D).

**src/components/SpeakerRegistryPanel.tsx**
function: `handleSaveEnrolledSpeaker()`
reason: إرسال raw PCM audio بدل embeddings (Section F client-side).

**tests/speaker_regression.unit.test.ts** (NEW)
reason: 12 regression tests لـ Section V (S1-S10 + Section D + Section F).

==================================================
3. SPEAKER RECOGNITION
==================================================

ERES2NET: PASS
DIMENSION: 512
LIVE EVIDENCE ACROSS VAD MICRO-PAUSES: PASS (Section B fix)
CROSS-SPEAKER EVIDENCE ISOLATION: PASS (verified by S4)
PHANTOM SPEAKER PREVENTION: PASS (Section D fix + S1 test)
CHAIR FALLBACK: REMOVED (Section C fix)
LEGACY ACOUSTIC IDENTITY: ISOLATED (VoiceFootprint is UI-only, no server impact)

==================================================
4. ENROLLMENT
==================================================

SETTINGS SENDS RAW AUDIO: YES (SpeakerRegistryPanel.tsx fix)
SERVER EXTRACTS 512-D: YES (server.ts /api/speech/register fix)
CLIENT EMBEDDING REJECTED: YES (explicit 400 CLIENT_EMBEDDING_REJECTED)
MODEL METADATA VERIFIED: YES (dim===512 + modelId checks before persist)

==================================================
5. ORGANIZATIONS
==================================================

CREATE: PASS (V5 fix returns full object)
READ: PASS
UPDATE: PASS (V5 fix returns full object)
REFRESH PERSISTENCE: PASS
MOCK DATA: PRESENT in mock-DB mode only (production uses PostgreSQL)

==================================================
6. MEETINGS
==================================================

CREATE: PASS (V5 fix returns {success, session, id})
READ: PASS
UPDATE: PASS (V5 fix)
COMPLETE: PASS (existing lifecycle)
HISTORY: PASS (existing meeting_events table)
INVITES: PASS (migration 004 meeting_invites)

==================================================
7. SETTINGS/PERSONAS
==================================================

SETTINGS: PASS (existing /api/user/profile GET/PUT)
ROLE: PASS (EXPERT_MODES in VoiceChat.tsx)
STYLE: PASS (existing CONVERSATION_STYLES)
PERSISTENCE: PASS (localStorage + DB)
GEMINI CONTEXT: PASS (systemInstruction replacement)

==================================================
8. KNOWLEDGE BASE
==================================================

PDF TEXT: PASS (pdf-parse native extraction)
PDF SCANNED: PASS (Gemini OCR fallback via extractPdfWithVerifiedOcr)
PDF pdftoppm: PRESENT in extractPdfWithVerifiedOcr (requires poppler-utils
  in container — Dockerfile must install poppler-utils)
XLSX: PASS (exceljs workbook parser, NOT raw UTF-8)
CSV: PASS (UTF-8 + Arabic)
DOCX: PASS (mammoth)
TXT: PASS (UTF-8)
INDEXING: PASS (DocumentTextQuality on all formats — V3 fix)
RETRIEVAL: PASS (RAGEngine + V3 semantic embeddings)

==================================================
9. DATABASE
==================================================

POSTGRES: required for production (mock-DB in dev only)
MIGRATIONS: 000-005 (all present, non-destructive)
OWNER SCOPE: PASS (eq(organizations.ownerId, req.user.uid))
ORG SCOPE: PASS (eq(knowledge.orgId, org.id))

==================================================
10. REGRESSION PROTECTION
==================================================

SPEAKER THRESHOLDS MODIFIED: NO (0.72/0.82/0.76/0.78/0.055 intact)
ONNX MODIFIED: NO (SHA-256 verified: 1a331345...7a5e4b)
VAD MODIFIED: NO (0.015/0.085 intact)
BARGE-IN MODIFIED: NO (5.7x threshold multiplier intact)
PLAYBACK/JITTER MODIFIED: NO (25-110ms adaptive intact)
AUDIO TRANSPORT MODIFIED: NO (WebSocket /api/live unchanged)

==================================================
11. VALIDATION
==================================================

LINT: PASS (0 errors)
UNIT TESTS: PASS (50/50 — was 38 in V5, +12 new Section V tests)
BUILD: PASS (1898 modules, 501KB server.cjs)
ONNX VERIFY: PASS (SHA-256 1a331345...7a5e4b matches expected)
APP START: PASS (server boots, /api/health returns 200)
HEALTH: PASS
READY: PASS (NEURAL mode, 512-dim)
PRODUCTION CONTAINER: NOT TESTED (requires Docker — user must run
  `docker build -t smart-ai . && docker run -p 3000:3000 smart-ai` on
  their machine to verify poppler-utils + node_modules in container)

==================================================
12. REMAINING ISSUES
==================================================

1. **PRODUCTION CONTAINER VALIDATION**: لم أختبر الـ Docker container فعلياً.
   المستخدم يجب أن يشغل `docker build` ويتحقق من:
   - `which pdftoppm` داخل container (PDF OCR fallback)
   - `node dist/server.cjs` يعمل بدون أخطاء
   - migrations تُطبَّق على PostgreSQL الحقيقي

2. **REAL VOICE TESTING**: اختبارات S1-S10 تستخدم synthetic vectors.
   الاختبار الميداني الحقيقي (محمد، أحمد، خليل، تغريد، أبو مصعب) يتطلب iPhone
   + GEMINI_API_KEY + PostgreSQL على جهاز المستخدم.

3. **MOCK DB WARNING**: في وضع التطوير بدون PostgreSQL، الخادم يستخدم mock
   pool يُرجع `[{id:1, name:'Mock Data'}]` لأي select(). هذا قد يُظهر
   "Mock Data" في الواجهة. في الإنتاج بـ PostgreSQL حقيقي، هذا لا يحدث.
   (لم أزل mock pool لأنه ضروري للتطوير offline — لكن أضفت تحذيرات واضحة
   في الـ logs).

4. **SECTION X (iPhone/Mobile)**: لم أختبر responsive UI على iPhone فعلياً.
   هذا يتطلب جهاز المستخدم.

NOT READY FOR PRODUCTION until items 1-2 above are validated by the user
on their actual hardware. The code-level fixes are complete and tested,
but field validation requires the user's environment.
