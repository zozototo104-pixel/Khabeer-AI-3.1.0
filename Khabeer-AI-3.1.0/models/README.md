# نموذج هوية المتحدث في الإصدار الاحترافي

يتضمن هذا الإصدار النموذج الرسمي:

```text
3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx
```

- المحرك: `sherpa-onnx-node`.
- التردد: 16 kHz أحادي القناة.
- بُعد متجه المتحدث: 512.
- الحجم المتوقع: `39593761` بايت.
- SHA-256:

```text
1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b
```

يتحقق الخادم من البصمة قبل تحميل النموذج، ولن يقبل ملفاً ناقصاً أو مستبدلاً. ترخيص المصدر محفوظ في `THIRD_PARTY_3D_SPEAKER_LICENSE.txt`.

## التحقق

```bash
npm run speaker:verify-model
```

ويجب أن تعرض نقطة الصحة الموثقة:

```text
GET /api/speaker/model-health
mode: "NEURAL"
neuralAvailable: true
embeddingDimension: 512
```

بعد ترقية هذا الإصدار، أعد تسجيل بصمات الحاضرين القديمة؛ متجهات أي نموذج سابق لا تُخلط تلقائياً مع متجهات ERes2Net الجديدة.

## التثبيت التلقائي في CI وRender

قد يظهر الملف داخل حزمة المصدر كمؤشر Git LFS صغير بدل الباينري الكامل. هذا مقصود وآمن.
أثناء CI وبناء Docker يتم تنفيذ:

```bash
npm run speaker:download-model
npm run speaker:verify-model
```

ويتم تنزيل ملف ONNX الحقيقي (39,593,761 بايت) والتحقق من SHA-256 قبل إدخاله في صورة الإنتاج. توجد مرآة احتياطية على Hugging Face تحمل نفس البصمة.

## حالة هذه الحزمة

هذه الحزمة تتضمن ملف ONNX الحقيقي كاملاً داخل `models/` بحجم `39,593,761` بايت،
وليس مؤشر Git LFS. يبقى أمر `speaker:download-model` كمسار احتياطي فقط؛ إذا تحقق
الحجم وSHA-256 من الملف المضمّن فلن يعيد تنزيله.
