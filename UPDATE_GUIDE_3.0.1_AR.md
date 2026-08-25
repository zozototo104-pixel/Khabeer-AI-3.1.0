# تطبيق تحديث 3.0.1 من Codespaces

ارفع الملف `smart-expert-deployment-v3.0.1.zip` إلى جذر المستودع المفتوح في Codespaces، ثم نفّذ الأوامر التالية كل واحد في سطر مستقل:

```bash
unzip -o smart-expert-deployment-v3.0.1.zip
mv smart-expert-deployment-v3.0.1.zip /tmp/
git status --short
npm ci
npm run lint
npm run test:unit
npm run speaker:verify-model
npm run build
git add .
git commit -m "Prepare v3.0.1 production deployment"
git push
```

انتظر نجاح فحص `Continuous Integration` في تبويب Actions. بعد ظهور العلامة الخضراء أنشئ الإصدار:

```bash
git tag v3.0.1
git push origin v3.0.1
```

سيؤدي دفع الوسم إلى تشغيل `Create GitHub Release` تلقائيًا. لا تنفّذ الترحيلات على قاعدة بيانات إنتاجية قبل أخذ نسخة احتياطية وضبط `DATABASE_URL`.
