# دمج محرك التفاعل الصوتي وتمييز المتحدثين — نسخة آمنة

## الهدف
هذه النسخة تبقي مسار الصوت الحي سريعاً ومستقلاً عن محرك البصمة، وتضيف نموذج ERes2Net ONNX الموثق من النسخة القديمة دون إعادة منطق الصوت القديم.

## ما تم دمجه فعلياً
- أضيف النموذج الرسمي `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx` بحجم 39,593,761 بايت وبصمة SHA256 المتوقعة في الخدمة.
- نُقل تنفيذ `sherpa-onnx` الثقيل إلى `Worker Thread` مستقل، بحيث لا تنفذ `extractor.compute()` على event loop المسؤول عن WebSocket والصوت الحي.
- بقي مسار الميكروفون إلى مزود الذكاء الاصطناعي مستقلاً عن speaker inference؛ لا ينتظر التعرف على الاسم قبل إرسال الصوت.
- بقي الفصل الحالي بين `PROBE` السريع و`FINAL` النهائي، وهو نفس المبدأ الذي يفيدنا من WhoSpeaksLive: عرض سريع دون التضحية بثبات النتيجة النهائية.
- أبقينا hysteresis وprevious-speaker continuity ومنع weak PROBE من استبدال VERIFIED في الواجهة.
- جعلنا Acoustic Fallback معطلاً افتراضياً في الإنتاج. لا يُفعل إلا صراحةً بـ `ALLOW_ACOUSTIC_FALLBACK=true`، لمنع خلط embeddings من فضاءات مختلفة مع ملفات ERes2Net الدائمة.

## ما استفدنا منه من المشاريع المرجعية
### 3D-Speaker
- ERes2Net 16kHz كقلب neural speaker embedding.
- فصل التحقق من الهوية عن مجرد diarization.

### WhoSpeaksLive
- فصل هوية المتحدث اللحظية عن التثبيت النهائي.
- تشغيل أعمال embedding في مسار مستقل وعدم جعلها شرطاً لإكمال الصوت الحي.
- المحافظة على هوية persistent person منفصلة عن cluster مؤقت داخل الاجتماع.

### WhisperLive
- إبقاء streaming audio متدفقاً بينما diarization/identity تعمل بالتوازي.
- الاعتماد على 16kHz mono كعقد صوت موحد لمسار التعرف.

### MeetScribe / Voiceprint pattern
- ملف شخص دائم يمكن أن يملك عدة عينات صوتية بدلاً من عينة واحدة.
- عدم تسجيل بصمة جديدة من مقطع ضعيف أو غير مؤكد.

### Pipecat / realtime pipeline pattern
- الأعمال الثقيلة خارج event loop الحرج.
- عدم ربط زمن استجابة الخبير بزمن speaker recognition.

## ما لم نغيره عمداً
- لم نعد كتابة WebSocket أو playback scheduler.
- لم نغير thresholds الحالية عشوائياً.
- لم نستبدل ScriptProcessor بـ AudioWorklet في هذه الخطوة لتجنب regression على iPhone قبل اختبار ميداني منفصل.
- لم نجعل البصمة شرطاً لبدء رد الخبير.

## قاعدة التشغيل
المسار الحرج:

`Microphone -> WebSocket -> Realtime AI -> streamed response -> playback`

المسار الموازي:

`Microphone -> speech buffer -> Worker Thread -> ERes2Net -> registry -> PROBE/FINAL identity`

لا يجوز للمسار الموازي إيقاف أو انتظار المسار الحرج.

## اختبار القبول الميداني
1. تحدث شخص مسجل 10 مرات وتأكد أن الاسم لا يتبدل داخل نفس الدور.
2. تحدث شخص غير مسجل وتأكد أنه لا يسرق اسم شخص مسجل.
3. دع الخبير يتحدث جملة طويلة وتأكد أن ONNX يعمل في الخلفية دون `UNDER_RUN` جديد مرتبط بوقت inference.
4. قاطع الخبير بصوت بشري حقيقي وتأكد أن المقاطعة تعمل.
5. شغل الخبير على سماعة iPhone دون كلام وتأكد أن الصدى لا يولد مقاطعات متكررة.
6. راقب `speaker_engine_status` ويجب أن يظهر `neuralAvailable=true` و`realtimeIsolation=worker-thread`.

## الخطوة التالية بعد الاختبار
إذا بقي `QUEUE_STARVATION` مع ONNX معزولاً، فالمشكلة تكون في jitter/stream delivery أو playback buffering وليس في speaker inference. عندها نعالج scheduler بشكل مستقل مع prebuffer تكيفي صغير بدلاً من زيادة latency ثابتة.
