import { Card, Head } from '@ss/ui/ui.jsx';

export const MORE = [
  ['days', 'روزهای من', 'هر روز را جدا بچین: ساعت‌ها، هدف، کارهای ثابت', '◷'],
  ['pace', 'مسیر رشد تست', 'هدف تست روزانه که با توان خودت بالا و پایین می‌شود', '⇡'],
  ['analytics', 'تحلیل', 'روند، مبحث‌ها، خطاها، حافظه و دوباره بزن', '▤'],
  ['books', 'کتاب‌ها', 'قفسه و بازه‌ها: اول فصل‌ها، بعد زیربخش‌ها', '▥'],
  ['keys', 'ثبت پاسخ‌نامه', 'کلید تست‌ها، مثل ثبت تست', '✓'],
  ['textbooks', 'کتاب‌های درسی', 'دهم تا دوازدهم، ریاضی و تجربی؛ کتاب‌های من', '▣'],
  ['history', 'تست‌های قبلی', 'بازه را بزن، گزینه‌ها را یکی‌یکی وارد کن', '⤓'],
  ['habits', 'سیستم عادت', 'شناسایی، عادت هدف و مراحل ساخت عادت', '♧'],
  ['topics', 'مباحث خوانده‌شده', 'تدریس شد یا خودم خواندم', '☑'],
  ['rewards', 'پاداش', 'ماموریت‌ها، چالش هفته، نشان‌ها، فروشگاه خودت', '★'],
  ['profile', 'نیمرخ من', 'پرسشنامه‌ها و الگوهای رفتاری', '◐'],
  ['network', 'مرکز و همگام‌سازی', 'ارسال فایل، دریافت فایل مرجع، تلگرام', '⇄'],
  ['assistant', 'دستیار', 'سؤال بپرس، سریع ثبت کن', '✉'],
  ['settings', 'تنظیمات و حساب', 'قفل، پشتیبان، داده نمونه', '⚙'],
];

export default function More({ go }) {
  return (
    <div>
      <Head kicker="بیشتر" title="همه بخش‌ها" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MORE.map(([k, t, d, i]) => (
          <button key={k} type="button" onClick={() => go(k)} className="text-right">
            <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-[0_1px_0_var(--rule),0_14px_30px_-18px_rgba(60,20,35,.45)]">
              <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-[var(--wash)] text-[20px] text-[var(--ink)]" aria-hidden>{i}</span>
              <p className="text-[18px] font-black">{t}</p>
              <p className="mt-1 text-[15px] text-[var(--pencil)]">{d}</p>
            </Card>
          </button>))}
      </div>
    </div>
  );
}
