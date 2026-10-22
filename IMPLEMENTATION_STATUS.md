# SS 12.0.0 — وضعیت واقعی (ویرایش ۲، ۱۳ اکتبر ۲۰۲۶)

**تغییرات این ویرایش:** گیر کردن تست API برطرف شد (خطای await در error boundary)؛ پوسته واحد وب ساخته شد (`/login`، `/setup`، `/choose-role` با فعال‌سازی MFA، `/today`، `/workspace`، `/demo`)؛ دانش‌آموز ۵ بخش اصلی دارد و جلسه‌ها از صف آفلاین IndexedDB با Idempotency-Key روی سرور ثبت می‌شوند؛ صفحه‌های میز کار v12 اضافه شد (افراد و ۹ نقش، برنامه کلاس، انتقال داده، رویدادها و صحت داده)؛ build، dev، demo، seed و reset بدون Vite کار می‌کنند؛ SPA فقط برای مسیرهای واقعی؛ رمز موقت دروغین برای حساب‌های موجود حذف شد؛ اعتبار نقش‌ها بر اساس روز تهران است. نتیجه: ۶۵ از ۶۵ تست PASS (TEST_REPORT.md).

موارد هنوز باز: E2E مرورگر، PostgreSQL، آزمون آنلاین، چرخه کتاب رسمی/proposal، بسته‌ها و entitlement، ۱۹ سند مهندسی کامل، و package-lock.json (به `npm install` با اینترنت نیاز دارد).

## جدول قبلی (با اصلاح ردیف‌های رابط وب و API)

| بخش | وضعیت | شاهد |
|---|---|---|
| ساختار workspace (apps/api، apps/web، packages/domain·ui·auth·contracts·persistence) | implemented | یک نسخه هسته به‌جای دو کپی |
| ۳۲ تست قدیمی Vitest (engine/store/v6) | PASS ۳۲/۳۲ | با node:test و shim، بدون npm |
| تست‌های سرور مرکز قدیمی | PASS ۱۲/۱۲ | tests/legacy-hub.test.mjs |
| باگ ۵۰۰ آپلود پرونده (dossier) | fixed + بازتولید | قبل: 500، بعد: 201 |
| CORS نمایشی «*» در تنظیمات | fixed | |
| موتور توان: میانه/میانگین پیراسته به‌جای صدک۷۵×۱.۱ + رشد ۵–۱۰٪ + خروجی‌های جدا + ۵ دکمه | implemented-not-tested | packages/domain/src/capacity.js |
| بررسی خودکار عادت (timed/guess/started/sleep) | implemented-not-tested | habits.js |
| نقش‌های ۹گانه، رویدادهای ۱۲گانه، اعتبارسنجی ورودی، feature flag | implemented-not-tested | packages/contracts |
| نشست هش‌شده + rotation + revoke، سیاست مجوز ۹عاملی، امضای Ed25519 | implemented-not-tested | packages/auth |
| Repository: آداپتر JSON با journal، SQLite (node:sqlite)، idempotency per-user، replay | implemented-not-tested | packages/persistence |
| PostgreSQL | documented-only | نیاز به npm و تصمیم مالک |
| API واحد (login/role/MFA/today/study/workspace/import/schedule) + اتصال صفحات مدیریت قدیمی | implemented + tested | PASS ۲۱/۲۱ |
| مهاجرت v9/v10/v11 با preview/apply/verify/rollback | implemented-not-tested | apps/api/src/import/legacy.mjs |
| پیشنهاد برنامه با diff، برنامه کلاس دونیمه | implemented-not-tested (domain) | UI وصل نشده |
| رابط وب واحد (ورود واحد، انتخاب نقش، /today و /workspace، صف آفلاین) | implemented (smoke-tested) | apps/web/src/shell |
| ساخت وب (esbuild + Tailwind، بدون Vite) | implemented + PASS | scripts/web-build-lib.mjs |
| ۱۹ سند مهندسی | فقط همین فایل | |
| آزمون آنلاین | feature-disabled (عمداً) | |

## بازبینی ارتباط داخلی (۱۴ اکتبر ۲۰۲۶)
- افزوده شد: projection روزانه tenant-scoped و صفحه «پیوند مطالعه و کلاس»، فیلتر سازمانی رویدادها/import jobs، واردسازی داده‌های رضایت‌دار `.sspack` همراه rollback، merge امن‌تر sync و حفاظت backup.
- پل legacy در پایگاه چندسازمانی عمداً بسته است تا داده global افشا نشود. اتصال برنامه کلاس منتشرشده به planner دانش‌آموز هنوز باز است.
- بازآزمایی پایه: ۶۷/۶۷ تست Node و `scripts/check.mjs` قبول؛ build مستقل esbuild بعداً در بخش آزمون/کتاب اجرا شد.

## پیوند آزمون و کتاب‌های تست (۱۴ اکتبر ۲۰۲۶)
- فرم آزمون از کتاب‌های فعال تغذیه می‌شود، کتاب غیرفعال را فعال/اضافه می‌کند و ساخت کتاب جدید را در همان مسیر در دسترس قرار می‌دهد.
- انتخاب مباحث به درخت زیربخش کتاب وصل است؛ انتخاب گروهی فصل/بخش، فقط برگ‌های مبحث را ثبت می‌کند. Forecast، نتیجه‌ آزمون و planner از همان `bookId/nodeIds` استفاده می‌کنند.
- آزمون Node: ۷۱/۷۱ PASS؛ `node scripts/check.mjs` و build وب با اسکریپت مستقل PASS. آزمون browser/E2E همچنان اجرا نشده است.

## اتصال زنده‌ی بازه‌ها به آزمون (۱۴ اکتبر ۲۰۲۶)
- آزمون ذخیره‌شده در هر بار نمایش، بودجه‌ی مباحث را از بازه‌های جاری کتاب محاسبه می‌کند؛ parent span هم منبع وزن برآوردی است و تغییر ساختار والد را به برگ‌های تازه resolve می‌کند.
- نتایج تجمیعی آزمون با وزن بازه‌ی جاری به مبحث‌ها تخصیص داده می‌شوند؛ همان محدوده به forecast و پیش‌نویس برنامه آمادگی می‌رسد.
- بازآزمایی: ۷۵/۷۵ تست Node، build مستقل وب و `scripts/check.mjs` قبول.

## شمارش دقیق در بودجه‌بندی آزمون (۱۴ اکتبر ۲۰۲۶)
- محاسبه‌ی یکتای سؤال‌های محدوده از range/span؛ تفکیک تدریس‌شده، تدریس‌نشده، هرگز ثبت‌نشده، پاسخ‌داده‌شده و سفید.
- تکرار پاسخ یک سؤال دوباره‌شماری نمی‌شود؛ نتیجه‌ی تجمیعی آزمون که شماره‌ی سؤال ندارد از آمار دقیق جدا نگه داشته شده است.
- بازه‌های ناقص با نشان «دقیق نیست» و تعداد مجهول‌ها نمایش داده می‌شوند؛ span با پوشش کامل برگ‌ها امکان شمارش دقیق می‌دهد.
- تست‌ها: ۷۷/۷۷ PASS؛ build و `scripts/check.mjs` PASS.
