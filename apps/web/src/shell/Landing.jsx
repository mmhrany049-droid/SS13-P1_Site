// SS v13 — the public face of the SITE build: one domain, two doors. Students go to «کابین مطالعه» (/today), staff go to «میز کار» (/workspace);
// both use ONE login. Nothing here is promised that the product does not do: unbuilt things are labelled «به‌زودی».
import { useEffect, useState } from 'react';
import { SHELL_THEME } from './Sheet.jsx';

const NAV = [['/', 'خانه'], ['/features', 'امکانات'], ['/pace', 'مسیر رشد تست'], ['/privacy', 'حریم خصوصی'], ['/contact', 'تماس']];
export const SITE_PATHS = new Set(NAV.map(n => n[0]).concat(['/terms']));
const Btn = ({ children, onClick, ghost }) => <button type="button" onClick={onClick} className={`min-h-[48px] rounded-[12px] px-6 text-[16px] font-black ${ghost ? 'border-2 border-[var(--ink)] bg-transparent text-[var(--ink)]' : 'bg-[var(--ink)] text-[var(--paper)]'}`}>{children}</button>;
const Sec = ({ id, title, lead, children }) => <section id={id} className="mx-auto w-full max-w-5xl px-4 py-10"><h2 className="text-[26px] font-black">{title}</h2>{lead && <p className="mt-2 max-w-2xl text-[16px] leading-8 text-[var(--pencil)]">{lead}</p>}<div className="mt-6">{children}</div></section>;
const Tile = ({ t, children }) => <div className="rounded-[16px] bg-[var(--wash)] p-5"><p className="text-[17px] font-black">{t}</p><p className="mt-2 text-[15px] leading-8">{children}</p></div>;

function Home({ go }) {
  return <>
    <header className="mx-auto max-w-5xl px-4 pb-6 pt-14 text-center"><p className="text-[14px] font-bold text-[var(--ink)]">سامانهٔ مطالعه و مدیریت کنکور</p>
      <h1 className="mt-3 text-[38px] font-black leading-[1.35] sm:text-[52px]">برنامه، تست، مرور و تحلیل؛<br />یک‌جا برای دانش‌آموز و آموزشگاه</h1>
      <p className="mx-auto mt-4 max-w-2xl text-[17px] leading-9 text-[var(--pencil)]">هدف تست روزانه‌ات با توان واقعی خودت بالا و پایین می‌شود، مرورها مجموعه‌ای و بی‌دردسرند و هر عدد نشان می‌دهد روی چند تست بنا شده. مدیر و معلم فقط خلاصه‌ای را می‌بینند که خود دانش‌آموز اجازه داده.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3"><Btn onClick={() => go('/login')}>ورود</Btn><Btn ghost onClick={() => go('/features')}>امکانات را ببین</Btn></div></header>
    <Sec title="دو در، یک دامنه" lead="دانش‌آموز و کارکنان آموزشگاه/مدرسه با یک حساب واحد وارد می‌شوند؛ سرور از روی نقش تشخیص می‌دهد به کجا بروند.">
      <div className="grid gap-4 sm:grid-cols-2"><Tile t="کابین مطالعه (دانش‌آموز)">امروز، ثبت تست، مرور مجموعه‌ای، برنامهٔ هفتگی، آزمون‌ها و مرکز تحلیل. روی گوشی نصب می‌شود و بدون اینترنت هم کار می‌کند.</Tile><Tile t="میز کار (معلم، مدیر، مالک)">افراد و نقش‌ها، پیگیری پیشرفت دانش‌آموزان، برنامهٔ رسمی کلاس، انتقال داده و شبکهٔ ارتباطی سیستم‌ها.</Tile></div></Sec>
    <Sec title="چطور شروع کنیم" lead=""><ol className="grid gap-3 text-[16px] leading-8 sm:grid-cols-3"><li className="rounded-[16px] bg-[var(--wash)] p-5"><b>۱. حساب بگیر</b><br />آموزشگاه یا مدرسه حساب دانش‌آموز را می‌سازد؛ مستقل‌ها خودشان ثبت‌نام می‌کنند.</li><li className="rounded-[16px] bg-[var(--wash)] p-5"><b>۲. چند پرسش کوتاه</b><br />پایه و رشته، ساعت‌های مطالعه و ۱۵ پرسش اختیاری برای شناخت سطح تست.</li><li className="rounded-[16px] bg-[var(--wash)] p-5"><b>۳. هر روز یک گام</b><br />هدف امروز، مرور سررسید و یک چک ۳۰ ثانیه‌ای پایان روز.</li></ol></Sec></>;
}
function Features() {
  return <Sec title="امکانات" lead="هر مورد زیر در نسخهٔ ۱۳ ساخته شده است؛ مواردی که هنوز نیست در آخر صفحه آمده.">
    <div className="grid gap-4 sm:grid-cols-2"><Tile t="مسیر رشد تست">عدد تست روزانه نردبان ثابت نیست؛ با دقت، خستگی، شب‌بیداری و آزمون نزدیک تنظیم می‌شود و هر تغییر دلیل دارد. «سبک‌تر» همیشه فوری است.</Tile>
      <Tile t="مرور مجموعه‌ای">کارت‌های سررسید در مجموعه‌های ۱۰ تا ۳۰تایی؛ از روی کتاب حل می‌کنی، پاسخ‌ها را یک‌جا می‌زنی و نمرهٔ هر کارت خودکار ثبت می‌شود.</Tile>
      <Tile t="مرکز تحلیل">روند هفتگی با بازهٔ اطمینان، مبحث‌ها، نشت امتیاز، منحنی فراموشی و پیش‌بینی بار مرور؛ با جملات ساده و عددهای قابل‌ردگیری.</Tile>
      <Tile t="دوباره بزن">برای مبحث‌های خیلی پایین، برنامهٔ بازسازی در مجموعه‌های ۲۰تایی با اندازه‌گیری قبل و بعد؛ اگر جواب نداد مسیر عوض می‌شود.</Tile>
      <Tile t="شبکهٔ سیستم‌ها">برنامهٔ رسمی کلاس به برنامهٔ دانش‌آموز می‌رسد (فقط نمایش) و آمار درس‌ها با شناسهٔ واحد جمع می‌شود.</Tile>
      <Tile t="حریم خصوصی">داده‌های تفصیلی روی دستگاه می‌ماند؛ سازمان فقط خلاصهٔ روزانه و فقط با رضایت می‌بیند.</Tile></div>
    <p className="mt-6 rounded-[12px] border-2 border-[var(--rule)] p-4 text-[15px] leading-8"><b>به‌زودی (هنوز ساخته نشده):</b> ثبت‌نام و اشتراک/پرداخت، ورود دسته‌جمعی از اکسل، نقش مشاور، نمای والد، هشدار خودکار افت فعالیت، پیامک، آزمون آنلاین.</p></Sec>;
}
function PacePage() {
  return <Sec title="مسیر رشد تست؛ چطور کار می‌کند" lead="قاعده‌ها ثابت و قابل‌خواندن‌اند. ضریب‌ها حدس اولیه‌اند و با داده تنظیم می‌شوند، نه حکم علمی.">
    <ul className="grid gap-3 text-[16px] leading-8"><li>• سه روز اول فقط سطحت را می‌شناسیم؛ عدد بالا نمی‌رود.</li><li>• وقتی چند روز پشت‌سرهم ≥۹۰٪ هدف را راحت زدی و نشانهٔ خستگی، کم‌دقتی، شب‌بیداری یا آزمون نزدیک نبود، یک پله کوچک بالاتر می‌رویم.</li><li>• یک روز جا افتاد؟ بدون جریمه و بدون بدهی. دو روز؟ دو روز «شروع مجدد کوچک». سه روز؟ رشد متوقف و یک گفتگوی کوتاه.</li><li>• اگر سه بار پشت‌سرهم از تست زدن حس بدی ثبت شود، حالت «حفاظت» روشن می‌شود و اول حال خوب می‌آید.</li><li>• پنجشنبه و جمعه روز جبرانی‌اند؛ هیچ تست تازه‌ای چیده نمی‌شود.</li></ul></Sec>;
}
function Privacy() {
  return <Sec title="حریم خصوصی" lead="خلاصهٔ ساده؛ متن حقوقی کامل باید پیش از عرضه به نوجوانان توسط حقوقدان بازبینی و جایگزین شود.">
    <ul className="grid gap-3 text-[16px] leading-8"><li>• پاسخ‌های تفصیلی، مرورها، عکس پاسخنامه و پرسشنامه‌ها روی دستگاه خودت می‌مانند.</li><li>• به سازمان فقط خلاصهٔ روزانهٔ مطالعه می‌رسد: دقیقه، تعداد تست، درست و غلط؛ و هر چیز دیگر فقط با رضایت جداگانهٔ خودت.</li><li>• یادداشت‌های متنی چک پایان روز اگر نشانهٔ نگرانی داشته باشند ذخیره نمی‌شوند و راهنمایی کمک نشان داده می‌شود.</li><li>• هیچ سرویس هوش مصنوعی بیرونی به داده‌هایت دسترسی ندارد.</li><li>• برای حذف داده با مدیر سازمان یا پشتیبانی تماس بگیر. (فرایند خودکار حذف و نگهداری هنوز ساخته نشده است.)</li></ul></Sec>;
}
function Terms() { return <Sec title="شرایط استفاده" lead="پیش‌نویس: این متن باید پیش از انتشار عمومی توسط حقوقدان نهایی شود."><p className="text-[16px] leading-8">استفاده از SS یعنی پذیرفتن اینکه توصیه‌های برنامه‌ریزی و آمار، پیشنهاد هستند و جایگزین نظر معلم، مشاور یا پزشک نیستند. حساب‌ها شخصی‌اند و رمز نباید به دیگران داده شود. سازمان‌ها مسئول مجوز و رضایت‌نامهٔ دانش‌آموزان خود هستند.</p></Sec>; }
function Contact() {
  const [mail, setMail] = useState(null); useEffect(() => { fetch('/config.json', { cache: 'no-store' }).then(r => r.json()).then(c => setMail(c.contactEmail || '')).catch(() => setMail('')); }, []);
  return <Sec title="تماس" lead="برای راه‌اندازی آموزشگاه یا مدرسه و پشتیبانی:"><div className="rounded-[16px] bg-[var(--wash)] p-5 text-[16px] leading-8">{mail ? <p>ایمیل پشتیبانی: <a className="font-bold underline" dir="ltr" href={`mailto:${mail}`}>{mail}</a></p> : <p className="text-[var(--pencil)]">راه تماس هنوز در این سایت ثبت نشده است.</p>}</div></Sec>;
}

export default function Landing({ path, go }) {
  const [open, setOpen] = useState(false); const page = path === '/features' ? <Features /> : path === '/pace' ? <PacePage /> : path === '/privacy' ? <Privacy /> : path === '/terms' ? <Terms /> : path === '/contact' ? <Contact /> : <Home go={go} />;
  return <div dir="rtl" lang="fa" className="ss min-h-screen bg-[var(--paper)] text-[var(--graphite)]"><style>{SHELL_THEME}</style>
    <nav className="sticky top-0 z-20 border-b border-[var(--rule)] bg-[var(--paper)]/95 backdrop-blur" aria-label="منوی سایت"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3"><a href="/" onClick={e => { e.preventDefault(); go('/'); }} className="text-[24px] font-black text-[var(--ink)]">SS</a>
      <button type="button" className="rounded-[10px] border-2 border-[var(--rule)] px-3 py-1 text-[14px] sm:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>منو</button>
      <ul className={`${open ? 'flex' : 'hidden'} absolute inset-x-0 top-full flex-col gap-1 border-b border-[var(--rule)] bg-[var(--paper)] p-3 sm:static sm:flex sm:flex-row sm:border-0 sm:p-0`}>{NAV.map(([p, t]) => <li key={p}><a href={p} onClick={e => { e.preventDefault(); setOpen(false); go(p); }} className={`block rounded-[8px] px-3 py-2 text-[15px] font-bold ${path === p ? 'text-[var(--ink)]' : ''}`}>{t}</a></li>)}<li><button type="button" onClick={() => go('/login')} className="rounded-[10px] bg-[var(--ink)] px-4 py-2 text-[15px] font-black text-[var(--paper)]">ورود</button></li></ul></div></nav>
    <main>{page}</main>
    <footer className="mt-10 border-t border-[var(--rule)] py-8 text-center text-[13px] text-[var(--pencil)]"><p>SS ۱۳ · <a className="underline" href="/privacy" onClick={e => { e.preventDefault(); go('/privacy'); }}>حریم خصوصی</a> · <a className="underline" href="/terms" onClick={e => { e.preventDefault(); go('/terms'); }}>شرایط</a> · <a className="underline" href="/contact" onClick={e => { e.preventDefault(); go('/contact'); }}>تماس</a></p></footer></div>;
}
