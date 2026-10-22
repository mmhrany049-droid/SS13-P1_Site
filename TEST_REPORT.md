# SS ۱۳ — گزارش تست (۲۶ مهر ۱۴۰۵)
- `npm test`: **۱۶۳ از ۱۶۳ قبول** (۷۷ تست v12 + ۸۶ تست تازه: مسیر رشد، مرور مجموعه‌ای، تحلیل/روایت/دوباره‌بزن، قرارداد شبکه).
- ساخت وب با esbuild: موفق. بسته‌های `site` و `app` هر دو ساخته و در Chromium بی‌سر باز شدند (بدون خطای کنسول).
- انجام نشده: تست E2E خودکار، بار، نفوذ، آزمون با کاربر واقعی، اجرای روی سرور واقعی با HTTPS.

---
# TEST_REPORT — SS 12.0.0 (2026-10-13, Node 22.23.1)
| name | command | status | evidence | limitation |
|---|---|---|---|---|
| engine/store/v6 (۳۲ Vitest قدیمی) | npm test | PASS | بخشی از ۶۵/۶۵ | با shim روی node:test |
| سرور مرکز قدیمی | npm test | PASS | tests/legacy-hub.test.mjs | |
| API واحد (۲۱ تست: MFA، چرخش نشست، CSRF، قفل، اعتبارسنجی، idempotency، ۲۰ نوشتن همزمان، replay=live، تاریخ تهران، IDOR، محدودیت بدنه، logout) | npm run test:api | PASS | ۲۱/۲۱ | قبلاً به خاطر خطای await در error boundary گیر می‌کرد؛ رفع شد |
| ساخت وب (esbuild + Tailwind) | npm run build | PASS | dist ≈ ۱.۴ مگابایت، کمتر از ۱ ثانیه | |
| smoke سرور + دمو | npm run demo + curl | PASS | / /login /today /workspace ← 200؛ /etc/passwd ← 404؛ ورود دانش‌آموز + /api/today | |
| E2E مرورگر (Playwright) | npm run test:e2e | SKIPPED | | اسکریپت هنوز نوشته نشده |
| PostgreSQL adapter | — | NOT_APPLICABLE | documented-only | به تصمیم مالک نیاز دارد |
| آزمون آنلاین | — | NOT_APPLICABLE | پشت feature flag | ۹ شرط لازم هنوز برقرار نیست |

## بازآزمایی ارتباط داخلی (۱۴ اکتبر ۲۰۲۶)
- اجرای مستقیم مجموعه Node: **۶۷/۶۷ PASS**؛ تست تاریخ‌وابسته planner اصلاح و تست‌های tenant progress، جداسازی import، حفظ داده‌های `.sspack` رضایت‌دار و rollback افزوده شد.
- `node scripts/check.mjs`: PASS.
- در آن مرحله `npm` حاضر نبود؛ build مستقل esbuild بعداً در بخش آزمون کتاب/آزمون اجرا و PASS شد.

## پیوند سیستم آزمون به کتاب تست (۱۴ اکتبر ۲۰۲۶)
- مجموعه Node: **۷۱/۷۱ PASS**؛ ۴ تست تازه برای کتاب فعال، انتخاب مبحث از درخت، بازه‌های شماره‌گذاری و اتصال forecast/نتیجه آزمون به subdivision منتخب.
- build وب با `node --disable-warning=ExperimentalWarning --import ./scripts/ss-resolve.mjs scripts/build-web.mjs`: **PASS**، ۷ فایل، حدود ۱٫۴ مگابایت.
- `node scripts/check.mjs`: PASS؛ آزمون browser/E2E اجرا نشده، Playwright و اسکریپت E2E در این پروژه حاضر نیستند.

## اصلاح اتصال زنده‌ی بازه کتاب به آزمون (۱۴ اکتبر ۲۰۲۶)
- بازه‌های فرزند و span فصل/بخش اکنون وزن آزمون را تعیین می‌کنند؛ مبحث والدِ تبدیل‌شده به چند زیربخش به برگ‌های جدید resolve می‌شود.
- نتایج تجمیعی آزمون بر اساس بازه‌های جاری میان مباحث تقسیم می‌شوند و پیشنهادهای آمادگی از همان forecast ساخته می‌شوند.
- کل مجموعه Node: **۷۵/۷۵ PASS**؛ شامل تست تغییر بازه بعد از ساخت آزمون، parent-span، شکستن مبحث به زیربخش و تخصیص نتیجه به مبحث‌ها.
- build مستقل وب و `node scripts/check.mjs`: PASS.

## بودجه‌بندی و پوشش سؤال دقیق (۱۴ اکتبر ۲۰۲۶)
- API دامنه‌ی `questionCoverage` بر اساس range/span جاری، تکرارنشدن question ID، آخرین پاسخ، blank، علامت تدریس و پاسخ aggregate آزمون محاسبه می‌کند.
- ۲ تست تازه برای dedupe پاسخ‌ها، شمار سفید/نزده، ارث‌بری حالت تدریس از والد و اعلام عدم قطعیت مبحث بدون range.
- مجموعه Node: ۷۷/۷۷ PASS؛ build وب مستقل و `scripts/check.mjs`: PASS.
