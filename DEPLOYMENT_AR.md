# دليل النشر الآمن — الخبير الذكي المؤسسي

## ما الذي يحتاجه النظام؟

- حاوية Linux تدعم WebSocket واتصالات HTTPS طويلة نسبيًا.
- Node.js 22 وذاكرة مناسبة للنموذج العصبي المحلي.
- PostgreSQL دائم مع اتصال TLS ونسخ احتياطي.
- مشروع Firebase Auth صالح، وهوية Firebase Admin على الخادم.
- مفتاح Gemini محفوظ كسر، وليس داخل المستودع.

## ترتيب النشر

1. أنشئ قاعدة PostgreSQL خاصة واضبط `DATABASE_URL` و`SQL_SSL_MODE=require`.
2. ابنِ صورة الحاوية من `Dockerfile`.
3. شغّل الترحيلات مرة واحدة قبل تحويل الزيارات إلى النسخة الجديدة:

   ```bash
   npm run db:migrate:prod
   ```

4. شغّل التطبيق بواسطة `npm start` أو أمر الحاوية الافتراضي.
5. اجعل فحص الحياة على `/api/health` وفحص الجاهزية على `/api/ready`.
6. اختبر تسجيل الدخول، قاعدة المعرفة، الاجتماع الصوتي، حفظ المتحدثين، والمحضر.
7. فعّل النسخ الاحتياطي والسجلات والتنبيهات قبل فتح النظام للمستخدمين.

## الأسرار المطلوبة

- `GEMINI_API_KEY`
- `DATABASE_URL` أو مجموعة `SQL_*`
- `DIRECT_AUTH_SECRET`
- `EXPERT_CHANNEL_SECRET`
- `FIREBASE_SERVICE_ACCOUNT_JSON` عندما لا تكون الاستضافة داخل Google Cloud

لا تضع القيم الحقيقية في `.env.example` أو GitHub. خزّنها في مدير أسرار مزود الاستضافة.

## إعدادات الإنتاج الإلزامية

```dotenv
NODE_ENV=production
ALLOW_ACOUSTIC_FALLBACK=false
ALLOW_DEV_DIRECT_AUTH=false
VITE_ALLOW_DEV_DIRECT_AUTH=false
ALLOW_LEGACY_DIRECT_AUTH=false
SQL_SSL_MODE=require
PUBLIC_BASE_URL=https://your-production-host.example
APP_URL=https://your-production-host.example
```

## نقاط الفحص

- `GET /api/health`: يؤكد أن عملية الخادم تعمل.
- `GET /api/ready`: يتحقق من PostgreSQL والنموذج العصبي؛ يعيد 503 عند عدم الجاهزية.
- `GET /api/speaker/model-health`: فحص تفصيلي محمي بالمصادقة.

## ملاحظات تشغيلية

- نفّذ ترحيلات قاعدة البيانات كأمر ما قبل النشر، لا بالتوازي داخل كل نسخة من الخادم.
- يحتاج الاتصال الصوتي إلى WebSocket على `/api/live` دون تعطيل الترقية من HTTP.
- لا تخفّض عدد النسخ إلى الصفر أثناء اجتماع نشط إذا كان مزود الاستضافة يقطع WebSocket.
- راقب استخدام Gemini، زمن استجابة الصوت، فشل التعرف على المتحدث، واتصالات قاعدة البيانات.
- اختبر الاستعادة من نسخة احتياطية دوريًا؛ وجود نسخة احتياطية غير مختبرة لا يكفي.
