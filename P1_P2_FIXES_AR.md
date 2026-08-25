# إصلاحات P1/P2 بعد تقرير الاختبار النهائي

## ما تم إصلاحه

### P1 — التسجيل المتكرر لنفس الشخص
- أضيف مسار `registerOrUpdateSpeaker` داخل `SpeakerRegistry`.
- عند تسجيل الاسم نفسه مرة أخرى، وإذا كان نموذج البصمة والبعد متوافقين، تضاف العينة إلى نفس Voice Gallery بدل إنشاء SpeakerProfile جديد.
- يتم تحديث centroid وsampleCount عبر `updateSpeaker(..., 'HIGH', true)` لأن التسجيل صريح من المستخدم.
- إذا كان embeddingModel مختلفاً، لا يتم دمج العينات حتى لا تختلط فضاءات نماذج مختلفة.
- `SpeechEngine.registerSpeaker` و`SpeakerDiarizer.enrollSpeakerWithSamples` يستخدمان الآن هذا المسار.

### P2 — فرض 512-D صراحة
- `SpeakerRecognitionService` يرفض Worker إذا أعلن بعداً غير 512.
- كل نتيجة embedding من Worker تُرفض إذا لم يكن طولها 512.
- `DeepSpeakerEmbeddingProvider` يرفض أي embedding لا يساوي 512-D.

## ما لم يتم تغييره عمداً
- VAD thresholds
- barge-in thresholds
- similarity thresholds
- jitter buffer
- playback scheduler
- ONNX model

## التحقق
- `speaker_registry.unit.test.ts`: 10/10 PASS.
- أضيف اختبار يمنع إنشاء عدة Profiles لنفس الاسم عند التسجيل المتكرر.
- أضيف اختبار يمنع دمج نفس الاسم عبر neural model contracts غير المتوافقة.
- فحص syntax للملفات المعدلة: PASS.
- تشغيل كل اختبارات المشروع لم يكتمل لأن `node_modules` غير موجود في النسخة المفكوكة وظهر `ERR_MODULE_NOT_FOUND: drizzle-orm`. هذا ليس فشلاً في الإصلاحات نفسها.
