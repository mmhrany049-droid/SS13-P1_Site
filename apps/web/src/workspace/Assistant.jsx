// دستیار مدیر: small floating button → chat window. Knows the center's live numbers, reads the Gmail inbox, finds inactive
// students and e-mails them (after a confirm), explains every admin task step by step. Rule-based, runs locally — no AI service.
import { useEffect, useRef, useState } from 'react';
import { api, errText } from './adminApi.js';
import { fa, jDate } from '@ss/ui/ui.jsx';
import { canDo } from './perms.js';
import { TEMPLATES } from './Mail.jsx';

const norm = t => String(t || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌\u200c]/g, ' ').toLowerCase();
const FAQ = [
  [['gmail', 'جیمیل', 'ایمیل وصل', 'app password', 'رمز برنامه'], 'وصل کردن Gmail', '۱) در حساب Google مرکز «تأیید دومرحله‌ای» را روشن کن.\n۲) به myaccount.google.com/apppasswords برو و یک App Password بساز.\n۳) در «ایمیل ← تنظیمات Gmail» آدرس و رمز ۱۶ حرفی را بزن و ذخیره کن.\n۴) «ایمیل آزمایشی به خودم» را بزن.', 'mail'],
  [['دبیر', 'همکار', 'مدیر جدید', 'نقش', 'دسترسی'], 'افزودن همکار', 'در «مدیران و نقش‌ها» ایمیل و نقش را بزن. «مدیر» همه کار می‌کند جز تنظیمات و پشتیبان؛ «دبیر / مشاور» فقط دانش‌آموزان را می‌بیند، پیام و ایمیل می‌فرستد. رمز موقت با ایمیل می‌رود و بعد از اولین ورود عوض می‌شود.', 'team'],
  [['رمز دانش', 'فراموش', 'وارد نمیشه', 'نمی تونه وارد', 'ورود دانش'], 'دانش‌آموز نمی‌تواند وارد شود', 'اول در «دانش‌آموزان» ببین حسابش تعلیق نباشد. بعد «فرستادن کد رمز جدید» را بزن تا کد ۲۴ ساعته به Gmailش برود؛ در صفحه ورود برنامه «رمز را فراموش کردم» را بزند. اگر ۵ بار اشتباه زده باشد، ۱۵ دقیقه قفل است.', 'students'],
  [['انتشار', 'اطلاع رسانی', 'بولتن', 'کتاب برسه', 'همگام'], 'رساندن کتاب‌ها و آزمون‌ها', 'در «کتاب‌های تست» تیک «انتشار برای همه» را بزن، بعد در «میز کار» دکمه «انتشار برای همه». دانش‌آموزان با دکمه همگام‌سازی برنامه همه را می‌گیرند.', 'desk'],
  [['پشتیبان', 'بکاپ', 'backup'], 'پشتیبان', 'در «تنظیمات و پشتیبان» دکمه «دانلود پشتیبان» را بزن. رمزها و توکن‌ها داخلش نیست. هفته‌ای یک بار کافی است.', 'settings'],
  [['دومرحله', '2fa', 'امنیت', 'هک', 'authenticator'], 'امنیت حساب', 'در «حساب من و امنیت» ورود دومرحله‌ای را روشن کن، نشست‌های ناشناخته را ببند و رمز حداقل ۱۰ کاراکتری بگذار. «گزارش فعالیت» ورودهای ناموفق را نشان می‌دهد.', 'account'],
  [['تلگرام', 'ربات', 'پروکسی'], 'ربات تلگرام', 'توکن را از @BotFather بگیر و در «ربات تلگرام» بزن. اگر سرور به تلگرام وصل نمی‌شود، پروکسی SOCKS5/HTTP اضافه کن و «آزمایش» بزن. دانش‌آموز در ربات Start و «ارسال شماره من» را می‌زند.', 'telegram'],
  [['کلاس', 'مدرسه', 'عضو'], 'کلاس‌ها', 'در «مدارس و کلاس‌ها» کلاس بساز و اعضا را تیک بزن. بعد می‌توانی برای همان کلاس ایمیل بفرستی، آزمون مشترک و شبه‌کنکور بسازی.', 'classes'],
  [['شبه کنکور', 'آزمون مشترک', 'آزمون کلاس'], 'آزمون‌ها', '«آزمون‌های مشترک» برای یک آزمون؛ «شبه‌کنکور» برای سری چندمرحله‌ای با فاصله ثابت. مباحث از فهرست کتاب درسی انتخاب می‌شوند و برای هر دانش‌آموز به کتاب تست خودش وصل می‌شود.', 'exams'],
];
const MENU = [[['📋 امروز چه کنم؟', 'today'], ['😴 غیرفعال‌ها', 'inactive']], [['💬 پیام‌های تازه', 'msgs'], ['📥 صندوق Gmail', 'inbox']], [['📊 آمار مرکز', 'stats'], ['🔐 امنیت من', 'sec']], [['❓ راهنمای کارها', 'faq']]];

export default function AdminAssistant({ me, go, counts, h, offline }) {
  const [open, setOpen] = useState(false); const [msgs, setMsgs] = useState([]); const [text, setText] = useState(''); const [ctx, setCtx] = useState({}); const end = useRef(null);
  const bot = (t, b = []) => setMsgs(m => [...m, { from: 'bot', t, b, id: Math.random() }]);
  const meSay = t => setMsgs(m => [...m, { from: 'me', t, id: Math.random() }]);
  useEffect(() => { if (open && !msgs.length) bot(`سلام ${me.name || ''} 👋 دستیار مدیریت هستم. عددهای مرکز را می‌دانم، Gmail را می‌خوانم و ایمیل می‌فرستم.`, MENU); }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [msgs]);
  useEffect(() => { const f = e => e.key === 'Escape' && setOpen(false); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, []);
  const home = [['🏠 منو', 'menu']];
  const inactiveList = async () => { const r = await api('/api/admin/students'); return r.items.filter(s => s.status !== 'suspended' && (!s.lastPackAt || Date.now() - Date.parse(s.lastPackAt) > 7 * 864e5)); };

  const run = async (act, lbl) => {
    if (lbl) meSay(lbl); const [k, v] = act.split(/:(.+)/);
    try {
      if (k === 'menu') return bot('چه کار کنیم؟', MENU);
      if (k === 'go') { go(v); return bot('باز کردم ←', [home]); }
      if (offline && !['faq', 'f', 'menu'].includes(k)) return bot('در حالت فایل (بدون سرور) فقط راهنما کار می‌کند.', [[['❓ راهنما', 'faq']]]);
      if (k === 'today') { const c = await api('/api/admin/overview'); const L = [];
        if (!c.mail) L.push(['• Gmail وصل نیست: بازیابی رمز و پیام‌ها بدون آن کار نمی‌کند.', ['وصل کردن Gmail', 'go:mail']]);
        if (c.unreadMessages) L.push([`• ${fa(c.unreadMessages)} پیام خوانده‌نشده از دانش‌آموزان.`, ['دیدن پیام‌ها', 'go:messages']]);
        const ina = c.students - c.active7; if (c.students && ina > 0) L.push([`• ${fa(ina)} نفر این هفته همگام نکرده‌اند.`, ['یادآوری به آن‌ها', 'inactive']]);
        if (c.accounts > c.verified) L.push([`• ${fa(c.accounts - c.verified)} حساب ایمیلش را تأیید نکرده.`, ['دانش‌آموزان', 'go:students']]);
        if (!me.totp) L.push(['• ورود دومرحله‌ای حسابت خاموش است.', ['روشن کردن', 'go:account']]);
        if (!c.bulletinSeq) L.push(['• هنوز اطلاع‌رسانی منتشر نشده؛ کتاب‌ها به دانش‌آموزان نرسیده.', ['میز کار', 'go:desk']]);
        return bot(L.length ? `برای امروز:\n${L.map(x => x[0]).join('\n')}` : 'همه چیز مرتب است 👌 پیام تازه یا کار عقب‌افتاده‌ای نیست.', [...L.slice(0, 3).map(x => [x[1]]), home]); }
      if (k === 'inactive') { const l = await inactiveList(); setCtx({ inactive: l });
        if (!l.length) return bot('همه دانش‌آموزان در ۷ روز اخیر همگام کرده‌اند 👏', [home]);
        const withMail = l.filter(s => s.email);
        return bot(`${fa(l.length)} نفر بیش از ۷ روز همگام نکرده‌اند:\n${l.slice(0, 10).map(s => `• ${s.name}${s.lastPackAt ? ` (آخرین: ${jDate(s.lastPackAt)})` : ' (هیچ‌وقت)'}`).join('\n')}${l.length > 10 ? '\n…' : ''}\n\n${fa(withMail.length)} نفرشان ایمیل دارند.`, [...(withMail.length && canDo(me, 'mail:send') ? [[[`✉ ایمیل یادآوری به ${fa(withMail.length)} نفر`, 'remind']], [['✏ اول متن را ببینم', 'draft']]] : []), home]); }
      if (k === 'remind' || k === 'draft') { const ids = (ctx.inactive || await inactiveList()).filter(s => s.email).map(s => s.id); const [, sub, txt] = TEMPLATES[0];
        if (k === 'draft') { sessionStorage.setItem('ss-admin-compose', JSON.stringify({ studentIds: ids, subject: sub, text: txt })); go('mail'); return bot('پیش‌نویس در «ایمیل» آماده است؛ ویرایش کن و بفرست.', [home]); }
        setCtx(c => ({ ...c, confirm: { ids, sub, txt } })); return bot(`این متن برای ${fa(ids.length)} نفر می‌رود:\n\n«${sub}»\n${txt.replace('{نام}', '(نام هر نفر)')}`, [[['✅ بفرست', 'send'], ['✏ ویرایش', 'draft']], home]); }
      if (k === 'send') { const c = ctx.confirm; if (!c) return bot('چیزی برای فرستادن نیست.', [home]); bot('در حال فرستادن…'); const r = await api('/api/admin/mail/send', { method: 'POST', body: { studentIds: c.ids, subject: c.sub, text: c.txt } }); setCtx({}); return bot(`✓ ${fa(r.sent)} ایمیل رفت${r.failed ? `، ${fa(r.failed)} ناموفق` : ''}. یک نسخه در «پیام‌ها»ی برنامه‌شان هم هست.`, [home]); }
      if (k === 'msgs') { const r = await api('/api/admin/messages'); const u = r.threads.filter(t => t.unread);
        return bot(u.length ? `${fa(u.length)} گفتگو منتظر جواب:\n${u.slice(0, 6).map(t => `• ${t.name}: «${t.last.text.slice(0, 60)}»`).join('\n')}` : 'پیام خوانده‌نشده‌ای نیست.', [[['باز کردن پیام‌ها', 'go:messages']], home]); }
      if (k === 'inbox') { if (!canDo(me, 'mail:inbox')) return bot('نقش تو به صندوق Gmail مرکز دسترسی ندارد.', [home]); bot('Gmail را می‌خوانم…'); const r = await api('/api/admin/mail/inbox?limit=8'); const un = r.items.filter(x => !x.seen);
        return bot(`صندوق Gmail: ${fa(r.total)} ایمیل، ${fa(un.length)} تازه بین ۸ تای آخر\n${r.items.slice(0, 6).map(x => `${x.seen ? '◦' : '•'} ${x.from.replace(/<.*>/, '').trim()}: ${x.subject}`).join('\n')}`, [[['باز کردن صندوق', 'go:mail']], home]); }
      if (k === 'stats') { const c = await api('/api/admin/overview'); const cls = h.classes.map(x => `• ${x.name}: ${fa(x.members.length)} نفر`).join('\n');
        return bot(`دانش‌آموز: ${fa(c.students)} (حساب آنلاین ${fa(c.accounts)}، ایمیل تأییدشده ${fa(c.verified)})\nفعال در ۷ روز: ${fa(c.active7)} · تعلیق: ${fa(c.suspended)}\nبسته‌های رسیده: ${fa(c.packs)} · آخرین اطلاع‌رسانی: شماره ${fa(c.bulletinSeq)}\nایمیل امروز: ${fa(c.sentToday)} از ${fa(c.mailCap)}${cls ? `\n\nکلاس‌ها:\n${cls}` : ''}`, [home]); }
      if (k === 'sec') { return bot(`حساب ${me.email}\n• ورود دومرحله‌ای: ${me.totp ? 'روشن ✓' : 'خاموش ✗'}\n• نقش: ${me.roleFa}\n${me.totp ? 'عالی است. نشست‌های ناشناخته را در «حساب من» ببند.' : 'پیشنهاد: همین الان روشنش کن؛ دو دقیقه طول می‌کشد.'}`, [[['حساب من و امنیت', 'go:account']], ...(canDo(me, 'audit') ? [[['گزارش ورودهای ناموفق', 'go:audit']]] : []), home]); }
      if (k === 'faq') return bot('درباره کدام کار؟', [...FAQ.reduce((rows, f, i) => { if (i % 2 === 0) rows.push([]); rows[rows.length - 1].push([f[1], `f:${i}`]); return rows; }, []), home]);
      if (k === 'f') { const f = FAQ[+v]; return bot(`${f[1]}\n\n${f[2]}`, [[['رفتن به همین بخش', `go:${f[3]}`]], [['❓ سؤال دیگر', 'faq'], ...home]]); }
    } catch (e) { return bot('✗ ' + errText(e), [home]); }
  };
  const onSend = () => {
    const t = text.trim(); if (!t) return; setText(''); meSay(t); const n = norm(t);
    const cls = h.classes.find(c => n.includes(norm(c.name)));
    if (cls && /ایمیل|پیام|بفرست|نامه/.test(n)) { sessionStorage.setItem('ss-admin-compose', JSON.stringify({ studentIds: cls.members, subject: '', text: 'سلام {نام}،\n\n' })); go('mail'); return bot(`پیش‌نویس ایمیل برای کلاس «${cls.name}» (${fa(cls.members.length)} نفر) باز شد.`, [home]); }
    const intents = [[/امروز|چه کنم|چیکار|کار(های)? مونده/, 'today'], [/غیرفعال|غایب|همگام نکرد|تنبل/, 'inactive'], [/صندوق|اینباکس|inbox|ایمیل(های)? (رسیده|جدید)/, 'inbox'], [/پیام|سؤال دانش/, 'msgs'], [/آمار|چند نفر|تعداد/, 'stats'], [/امنیت|دومرحله|2fa/, 'sec'], [/یادآوری|یاداوری/, 'inactive']];
    const hit = intents.find(([re]) => re.test(n)); if (hit) return run(hit[1]);
    const scored = FAQ.map((f, i) => [i, f[0].filter(w => n.includes(norm(w))).length]).sort((a, z) => z[1] - a[1]);
    if (scored[0][1] > 0) return run(`f:${scored[0][0]}`);
    bot('مطمئن نیستم منظورت را فهمیدم. یکی از این‌ها؟', MENU);
  };
  return <>
    <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="دستیار مدیر" className="fixed bottom-5 left-5 z-40 flex h-12 items-center gap-2 rounded-full bg-[var(--ink)] pl-4 pr-3 text-[15px] font-bold text-[var(--paper)] shadow-[0_12px_28px_-10px_var(--shadow)] transition hover:scale-[1.03]">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--paper)] text-[15px] text-[var(--ink)]">{open ? '×' : '?'}</span><span className="hidden sm:inline">{open ? 'بستن' : 'دستیار'}</span>
      {!open && counts?.unreadMessages > 0 && <span className="absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--bad)] px-1 text-[11px]">{fa(counts.unreadMessages)}</span>}</button>
    {open && <div role="dialog" aria-label="دستیار مدیر" className="pop-in fixed bottom-20 left-3 z-40 flex h-[min(620px,calc(100vh-110px))] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[18px] bg-[var(--card)] shadow-[0_30px_70px_-20px_var(--shadow)] outline outline-1 outline-[var(--rule)]">
      <div className="flex items-center gap-3 bg-[var(--ink)] px-4 py-3 text-[var(--paper)]"><span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--paper)] text-[16px] font-black text-[var(--ink)]">SS</span><div className="flex-1"><p className="text-[16px] font-black leading-tight">دستیار مدیریت</p><p className="text-[12px] opacity-80">آمار زنده · Gmail · راهنما</p></div><button type="button" className="text-[13px] font-bold opacity-80 hover:opacity-100" onClick={() => setMsgs([])}>شروع دوباره</button></div>
      <div className="flex-1 overflow-auto p-3" aria-live="polite">{msgs.map((m, i) => <div key={m.id} className={`mb-2.5 flex ${m.from === 'me' ? 'justify-start' : 'justify-end'}`}><div className="max-w-[92%]">
        <div className={`whitespace-pre-line rounded-[14px] px-3.5 py-2.5 text-[14px] leading-7 ${m.from === 'me' ? 'rounded-bl-[4px] bg-[var(--ink)] text-[var(--paper)]' : 'rounded-br-[4px] bg-[var(--wash)]'}`}>{m.t}</div>
        {m.b?.length > 0 && i === msgs.length - 1 && <div className="mt-2 grid gap-1.5">{m.b.map((row, r) => <div key={r} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${row.length},minmax(0,1fr))` }}>{row.map(([l, a]) => <button key={a + l} type="button" onClick={() => run(a, l)} className="min-h-[38px] rounded-[10px] border-2 border-[var(--rule)] bg-[var(--card)] px-2 text-[13px] font-bold text-[var(--ink-deep)] hover:border-[var(--ink)]">{l}</button>)}</div>)}</div>}
      </div></div>)}<div ref={end} /></div>
      <div className="flex gap-2 border-t-2 border-[var(--rule)] p-2.5"><input aria-label="پیام به دستیار" className="min-w-0 flex-1 rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[14px]" placeholder="مثلاً «ایمیل به کلاس شیمی» یا «چند نفر غایب‌اند؟»" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSend()} /><button type="button" onClick={onSend} className="rounded-[12px] bg-[var(--ink)] px-4 text-[14px] font-bold text-[var(--paper)]">ارسال</button></div>
    </div>}
  </>;
}
