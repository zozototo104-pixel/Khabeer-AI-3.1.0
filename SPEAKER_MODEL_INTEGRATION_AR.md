# دمج نموذج التعرف العصبي على المتحدث

تم ربط نموذج ERes2Net الرسمي الخاص بـ sherpa-onnx:

- الملف: `models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx`
- الحجم: `39,593,761` بايت
- SHA-256: `1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b`
- بُعد البصمة الصوتية: 512
- التردد المتوقع: 16 kHz

## ما تم تعديله

1. `scripts/download-speaker-model.mjs` صار يتحقق من الحجم والبصمة ويجرب مصدرين.
2. GitHub Actions ينزل النموذج الحقيقي ثم يشغّل `speaker:verify-model`.
3. Docker/Render ينزل النموذج في مرحلة build ثم ينسخه إلى صورة runtime.
4. أي Git LFS pointer صغير في المصدر لا يُستخدم كنموذج فعلي؛ يتم استبداله أثناء البناء بالباينري الصحيح.

## التحقق بعد النشر

افتح:

`GET /api/speaker/model-health`

والنتيجة المطلوبة:

- `mode: "NEURAL"`
- `neuralAvailable: true`
- `embeddingDimension: 512`
