# Smart Expert - Final Realtime Voice & Speaker Integration

هذه النسخة هي دمج نهائي محافظ على مسار الصوت الحي الموجود في Smart-AI ويضيف تحسينات التعرف على المتحدث والتدفق دون تحويل التعرف بالبصمة إلى خطوة حاجبة لاستجابة الخبير.

## المبادئ المعمارية

- مسار الصوت إلى Gemini Live يبقى فورياً ومستقلاً عن Speaker Recognition.
- ERes2Net/ONNX يعمل داخل Worker Thread مستقل؛ لا يتم تنفيذ `extractor.compute()` على WebSocket/event loop.
- Live speaker identity وFinal identity منفصلان: الـLive يحتاج دليلاً قوياً فورياً أو دليلين متوافقين، بينما Final هو المرجع النهائي للدور.
- البصمات الدائمة لا تُنشأ من Acoustic Fallback افتراضياً.
- التعلم التلقائي لبصمة الشخص لا يحدث إلا من Final neural match عالي الثقة وبهامش فصل كافٍ وصوت أطول من 1.2 ثانية.

## ما تم الاستفادة منه من المشاريع المرجعية

### 3D-Speaker
- نموذج ERes2Net 16kHz الرسمي الموجود في النسخة القديمة.
- 512-D neural speaker embeddings عبر sherpa-onnx.
- تحقق SHA256 قبل تشغيل النموذج.

### WhoSpeaksLive
- فصل المسار السريع Live Probe عن Final Assignment.
- عدم إجبار هوية من عينة قصيرة أو غامضة.
- فكرة gallery/multi-sample للشخص عبر ظروف ومداخل صوت مختلفة.
- evidence/corroboration قبل تثبيت live identity المتوسطة.

### WhisperLive
- إبقاء streaming audio منفصلاً عن diarization.
- online speaker matching لا يوقف إرسال الصوت إلى نموذج المحادثة.
- التعامل مع الهوية المعروفة كطبقة metadata على transcript/turn.

### MeetScribe / Voiceprint pattern
- البصمة الدائمة مرتبطة بشخص، ويمكن أن تحتوي عدة عينات موثوقة.
- التعلم التدريجي الآمن من الاجتماعات المؤكدة بدلاً من استبدال البصمة بعينة واحدة.

### Realtime audio patterns (Pipecat-style)
- adaptive playout lookahead بدلاً من fixed delay: تقريباً 25-110ms حسب تذبذب وصول chunks.
- الاحتفاظ بمسار interruption منفصلاً عن playback scheduling.
- echo guard مرحلي: المقاطعة البشرية القوية تبقى سريعة، والإشارة الحدّية أثناء AI playback تحتاج ثباتاً إضافياً من دون تغيير thresholds الأساسية.

## تغييرات رئيسية

1. `server/services/speaker/SpeakerRecognitionService.ts`
   - ONNX Worker Thread.
   - model hash/size validation.
   - acoustic fallback opt-in فقط.

2. `src/lib/speaker/SpeakerRegistry.ts`
   - robust multi-sample gallery scoring (centroid + corroborated samples).
   - margin ضد ثاني أفضل شخص.
   - إصلاح إعادة استخدام candidate cluster بدلاً من إنشاء unknown جديد مكرر.
   - حماية model/dimension compatibility.

3. `src/lib/speaker/SpeakerDiarizer.ts`
   - Safe continued learning من Final neural HIGH فقط.
   - لا تعلم من probe ضعيف أو fallback أو ambiguity.

4. `server/services/speech/SpeechEngine.ts`
   - Live evidence accumulation.
   - HIGH + strong margin قد يظهر فوراً.
   - MEDIUM يحتاج corroboration داخل نفس الدور.
   - Final يبقى authority.

5. `src/components/VoiceChat.tsx`
   - adaptive jitter lookahead 25-110ms.
   - المحافظة على إرسال الميكروفون فورياً قبل أي speaker work.
   - echo/barge-in guard دون تغيير thresholds المحمية: strong interruption=6 frames، borderline أثناء AI playback=8 frames.
   - الاحتفاظ بتشخيص UNDER_RUN / QUEUE_STARVATION / INTERRUPT.

6. `server.ts`
   - توجيه الخبير لعدم انتظار بصمة الصوت كي يبدأ فهم الكلام والرد.
   - إذا قوطع، يترك الجملة القديمة ويجيب على أحدث مداخلة.
   - استخدام الاسم VERIFIED بشكل طبيعي فقط دون تكراره في كل جملة.

## النموذج

`models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx`

SHA256:
`1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b`

## التحقق المنجز

- Speaker Registry unit tests: 8/8 PASS.
- تم التحقق من SHA256 للنموذج وهو مطابق.
- فحص TypeScript الجزئي لم يظهر أخطاء syntax في الملفات المعدلة؛ فشل الفحص الكامل بسبب عدم اكتمال تثبيت dependencies في بيئة العمل وليس بسبب خطأ TypeScript محدد.
- محاولة `npm install` في بيئة العمل انتهت بمهلة التنفيذ، لذلك يجب على منصة البناء الاعتيادية تنفيذ install/build كما تفعل مع المشروع الأصلي.

## قواعد يجب عدم تغييرها تلقائياً في iStudio

- لا تنقل ONNX inference إلى main event loop.
- لا تجعل speaker identification شرطاً قبل إرسال الصوت إلى Gemini Live.
- لا تخفض/ترفع VAD thresholds عشوائياً؛ التغيير الحالي يعتمد فقط على عدد frames الحدّية أثناء AI playback.
- لا تحول Acoustic Fallback إلى persistent voiceprints.
- لا تستبدل Final VERIFIED بنتيجة PROBE ضعيفة.
- لا تلغ adaptive playback lookahead وتعود إلى 5ms ثابتة على شبكة الجوال.
