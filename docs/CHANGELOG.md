# Changelog

## 6.0.0 — 2026-10-02
- کتاب تست: شماره‌گذاری «هر فصل از ۱» (مبتکران شیمی) + بخش‌های «شماره جدا»؛ تبدیل سراسری↔فصلی بدون از دست رفتن تست‌ها.
- سطح سختی ۱/۲/۳ برای هر بخش (الگو حسابان): تحلیل جدا برای هر سطح، وزن سطح در تسلط، پیشنهاد بلوک بعدی با بالا رفتن سطح.
- بخش‌های آزمون‌مانند (چکاپ، جامع، مخلوط، آزمون فصل): انتخاب «از کدام مباحث» و نسبت دادن نتیجه به همان مباحث.
- افزودن کتاب تست: پایه ← رشته ← درس ← کتاب درسی مرجع ← ناشر/شماره‌گذاری/سطح ← فهرست (از کتاب درسی، SSB یا خالی). فعال/غیرفعال کردن کتاب.
- کاتالوگ کتاب‌های درسی دهم و یازدهم (هر دو رشته) + پیوند مباحث مشترک دو رشته؛ جای خالی دوازدهم (حسابان۲، هندسه۳، گسسته، فیزیک۳، شیمی۳، ریاضی۳، زیست۳).
- برنامه‌ریز: هفته جاری (تا جمعه) بعد از تأیید قفل؛ پیش‌نویس چندهفته‌ای تا آخرین آزمون؛ پنج‌شنبه/جمعه روز جبرانی + جلو انداختن کارها؛ آزمون‌های هم‌پوشان با هم دیده و مباحث مرتبط کنار هم چیده می‌شوند.
- آزمون‌ها: ثبت نتیجه آزمون پیش‌رو و تبدیل به گذشته، عکس ورقه و پاسخ‌برگ (IndexedDB، در پشتیبان هم هست).
- چند کاربر روی یک دستگاه، مدرسه و کلاس، اجازه‌ها، فایل .sspack برای مرکز و ورود .ssbulletin.
- «پروژه مرکز» (hub.html): افراد بر اساس مدرسه/کلاس، مدیریت کلاس‌ها و اعضا، کتابخانه کتاب‌ها (رأی اکثریت برای کلید)، آزمون مشترک کلاس، مقایسه ناشناس، اطلاعیه‌ها.
- زیرساخت سایت: سرور بدون وابستگی (server/hub-server.mjs)، Dockerfile، docker-compose، nginx، Netlify، GitHub Pages، deploy/README_DEPLOY_FA.md.
- ۱۶ تست جدید (tests/v6.test.js).


## 5.1.0 — 2026-10-02 (رفع باگ برنامه‌ریز)
- buildPrepPlan: برنامه آمادگی آزمون دیگر روی کارهای تأییدشده‌ی هر روز سوار نمی‌شود (قبلاً فشار روزها به ~۲۰۰٪ می‌رسید)؛ فقط تا ۸۵٪ سقفِ (سبک‌شده) پر می‌کند و وزن شدت کار را حساب می‌کند. روز قبل آزمون همیشه سبک است (حتی وقتی ۱ روز مانده).
- planLighten: ظرفیت روزِ مقصد با سقف و «سبکی» خودِ همان روز سنجیده می‌شود (قبلاً با سقف روز مبدأ و حد ۱۰۰٪، پس کار به روزی که کاربر سبک کرده بود منتقل می‌شد). کار سنگین به روز آزمون و روز قبلش منتقل نمی‌شود.
- proposeWeek: کارهای تأییدشده‌ی همین هفته در سقف تکرار شمرده می‌شوند؛ «پیشنهاد بده» دوباره، کار تکراری نمی‌سازد.
- کشیدن و رها کردن (drag & drop) به بعد از موعد آزمونِ کار ممنوع شد (مثل منوی «انتقال…»).
- تاریخ محلی (F-16): ماموریت «بستن تحلیل خطا»، شمارش روزهای فعال و تاریخ «تدریس‌شده» دیگر از تاریخ UTC استفاده نمی‌کنند (بین ۰۰:۰۰ تا ۰۳:۳۰ به وقت تهران روز اشتباه ثبت می‌شد).
- پشتیبان‌گیری: لغو زودهنگام لینک دانلود که در Firefox/Safari دانلود را خراب می‌کرد.
- run_vectors: فایل JSON در پوشه seed به‌عنوان SSB پارس نمی‌شود (۶۲/۶۲ پاس).
- ۳ تست جدید در tests/store.test.js.

## 5.0.0 — 2026-10-02
- Practice: number-only ranges auto-mapped to topics (`mapRange`), unmapped-number error + floating mini assistant with in-place fix (`assignGap`), «از برنامه امروز» one-click entry (auto topic + next untried block, marks placement done), new «توضیحات» step (planned / extra / repeat + note; repeats down-weighted).
- Review: modes (today with daily/new limits, interleaved mixed, pre-exam, leeches), subject/type filters, next-interval previews, retrievability, notes, snooze, suspend, undo, stats (30-day retention, streak, 7-day forecast), hot topics → planner.
- Exams: three kinds (old with multiple sittings — analysis uses latest; upcoming → readiness + planner; done with prediction vs actual). Sitting entry by counts or answers+key. Latest sitting feeds mastery as L3 data.
- Planner: pressure % per day/week with task intensity, mini 7-day board, dedicated planner assistant (overview → detail → move suggestions with apply), drag & drop, move-to-day, reorder, per-day relief (take a day easier) with automatic redistribution, all upcoming exams considered, target pressure 85%.
- Data v5 migration (v4 → v5). Offline font via @fontsource (F-08), PWA manifest + service worker, Vitest tests, no-remote-AI check.

## 4.0.0
- Spec 37 navigation, review queue, planner proposal → approve, topics, history import, settings & backup, spec 38 fixes F-01/02/03/04/06/07/09/10/11/12/13/15/16/17/18/19/21.

## 7.0.0 — برنامه زمانی، شبه‌کنکور و سیستم عادت
- تنظیم ساعت مطالعه برای هر روز هفته با بازه‌های قابل ویرایش؛ جلسات مطالعه قابل برنامه‌ریزی بین ۶۰ تا ۱۲۰ دقیقه با زمان استراحت.
- افزودن کارهای شخصی، ورزش، کلاس موسیقی و کلاس‌های ثابت یک‌باره، هفتگی یا دو هفته‌یک‌بار؛ این موارد وقت مطالعه را از روی خط زمانی کم می‌کنند.
- افزودن کار دستی به روز و ساعت مشخص، خط زمانی روزانه و نمایش کارهای جا‌نشده.
- طراحی سری آزمون‌های شبه‌کنکور در سایت مرکز: فاصله تکرار، تعداد مراحل، زمان، هدف و مباحث مستقل هر مرحله؛ انتشار برای اعضای کلاس و فعال‌سازی در اپ دانش‌آموز.
- سیستم عادت: شناسایی الگو از داده، عادت‌های هدف خوب/بد، نردبان پیشرفت، پیش‌نویس خودکار «اگر... آنگاه...»، برنامه هفتگی، خودکاری، پایبندی، جایگزین عادت بد و برآورد بهترین درصد ممکن.
- پرسشنامه شخصی‌سازی‌شده بر اساس داده کاربر و علایق در تست‌زدن، با مبنای پژوهشی مستند و برچسب غیرتشخیصی.
