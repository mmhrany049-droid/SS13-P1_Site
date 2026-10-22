// میز کار: what needs attention today + the two hub jobs (collect packs → publish one bulletin) + a setup checklist for new admins.
import { useEffect, useState } from 'react';
import * as H from './hubStore.js';
import { api, adminApi, errText } from './adminApi.js';
import { downloadJson, readJsonFile } from '@ss/domain/format.js';
import { Btn, Card, Head, fa, jDate } from '@ss/ui/ui.jsx';
import { todayStr } from '@ss/domain/store.js';
import { canDo } from './perms.js';

const ACT = { login: 'ورود', 'login-failed': 'ورود ناموفق', signup: 'ثبت‌نام دانش‌آموز', 'mail-send': 'ارسال ایمیل', message: 'پاسخ پیام', bulletin: 'انتشار اطلاع‌رسانی', 'student-suspend': 'تعلیق دانش‌آموز', 'student-activate': 'فعال‌سازی دانش‌آموز', 'admin-add': 'افزودن مدیر', 'mail-config': 'تنظیم Gmail', setup: 'راه‌اندازی', 'password-change': 'تغییر رمز', '2fa-on': 'روشن کردن ورود دومرحله‌ای', config: 'تغییر تنظیمات', 'password-reset': 'بازیابی رمز' };
export const actFa = a => ACT[a] || a;

export default function Desk({ h, setH, go, counts: c, refreshCounts, me, offline, canWrite }) {
  const [log, setLog] = useState([]); const [busy, setBusy] = useState(''); const [emailAnn, setEmailAnn] = useState(false);
  const people = Object.values(h.people); const lib = H.libraryBooks(h); const t = adminApi();
  useEffect(() => { refreshCounts?.(); }, []);
  const importFiles = async e => {
    const fs = [...(e.target.files || [])]; e.target.value = ''; let cur = h; const out = [];
    for (const f of fs) { try { const pk = await readJsonFile(f); const r = await H.importPack(cur, pk); if (r.ok) { cur = r.hub; out.push(`✓ ${f.name}: ${r.name}`); if (!offline) await t.uploadPack(pk).catch(() => {}); } else out.push(`✗ ${f.name}: ${r.error}`); } catch { out.push(`✗ ${f.name}: خوانده نشد`); } }
    setH(cur); setLog(out);
  };
  const pull = async () => { setBusy('pull'); const out = []; let cur = h; try { const list = await t.listPacks(); for (const it of list.items || []) { const r = await H.importPack(cur, await t.getPack(it.id)); if (r.ok) { cur = r.hub; out.push(`✓ ${r.name}`); } } setH(cur); setLog(out.length ? out : ['بسته تازه‌ای روی سرور نبود.']); } catch (x) { setLog(['✗ ' + errText(x)]); } setBusy(''); };
  const publish = async () => {
    setBusy('pub');
    try {
      if (offline) { const b = await H.buildBulletin(h, { seq: (h.seq || 0) + 1 }); downloadJson(b, `SS-bulletin-${todayStr()}.ssbulletin`); setH(x => ({ ...x, seq: b.seq, published: [{ id: b.bulletinId, at: b.createdAt, books: b.books.length, exams: b.classExams.length }, ...x.published].slice(0, 30) })); setLog(['✓ فایل اطلاع‌رسانی ساخته شد.']); }
      else { const cur = await t.bulletinInfo(); const tg = await t.telegram().catch(() => null);
        const b = await H.buildBulletin(h, { seq: (cur.seq || 0) + 1, emailAnnouncements: emailAnn, bot: tg?.status?.username || tg?.username ? { username: tg.status?.username || tg.username } : null, proxies: (tg?.proxies || []).filter(p => p.share).map(p => ({ type: p.type, link: p.link, name: p.name })) });
        const r = await t.publishBulletin(b); setH(x => ({ ...x, seq: b.seq, published: [{ id: b.bulletinId, at: b.createdAt, books: b.books.length, exams: b.classExams.length }, ...x.published].slice(0, 30) }));
        setLog([`✓ اطلاع‌رسانی شماره ${fa(b.seq)} منتشر شد؛ دانش‌آموزان با «همگام‌سازی» می‌گیرند.${r.notified ? ` ${fa(r.notified)} پیام تلگرام.` : ''}${r.mailed ? ` ${fa(r.mailed)} ایمیل.` : ''}`]); refreshCounts?.(); }
    } catch (x) { setLog(['✗ ' + errText(x)]); }
    setBusy('');
  };
  const steps = [
    ['Gmail مرکز را وصل کن', !!c.mail, 'mail', 'برای بازیابی رمز، تأیید ایمیل و پیام به دانش‌آموزان'],
    ['ورود دومرحله‌ای را روشن کن', !!me.totp, 'account', 'امنیت حساب مدیر'],
    ['اولین کلاس را بساز', h.classes.length > 0, 'classes', 'مدرسه یا آموزشگاه'],
    ['یک کتاب تست به کتابخانه اضافه کن', lib.length > 0, 'books', 'با پاسخ‌نامه و بازه‌ها'],
    ['اطلاع‌رسانی را منتشر کن', (c.bulletinSeq || 0) > 0, 'desk', 'کتاب‌ها و آزمون‌ها به دانش‌آموزان می‌رسد'],
  ];
  const doneN = steps.filter(s => s[1]).length;
  const tiles = [['دانش‌آموز', c.students ?? people.length, 'students'], ['فعال در ۷ روز', c.active7 ?? '—', 'students'], ['پیام خوانده‌نشده', c.unreadMessages ?? 0, 'messages'], ['ایمیل امروز', c.mail ? `${fa(c.sentToday || 0)}/${fa(c.mailCap || 450)}` : 'خاموش', 'mail']];
  return <div>
    <Head kicker={`سلام ${me.name || ''}`} title="میز کار">{!offline && <Btn kind="soft" onClick={() => go('mail')}>✉ نوشتن ایمیل</Btn>}</Head>
    <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">{tiles.map(([tt, v, p], i) => <button key={tt} type="button" onClick={() => go(p)} className="text-right"><Card className={`h-full transition hover:-translate-y-0.5 ${i === 0 ? 'bg-[var(--ink)] text-[var(--paper)]' : ''}`}><p className={`text-[40px] font-black leading-none ${i === 0 ? '' : 'text-[var(--ink)]'}`}>{typeof v === 'number' ? fa(v) : v}</p><p className="mt-1 text-[15px]">{tt}</p></Card></button>)}</div>
    {doneN < steps.length && <Card className="mb-5">
      <div className="mb-3 flex items-center justify-between"><p className="text-[17px] font-black">راه‌اندازی مرکز</p><span className="text-[14px] font-bold text-[var(--pencil)]">{fa(doneN)} از {fa(steps.length)}</span></div>
      <div className="mb-3 h-2 rounded-full bg-[var(--wash)]"><div className="h-2 rounded-full bg-[var(--ink)] transition-[width] duration-700" style={{ width: `${doneN / steps.length * 100}%` }} /></div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{steps.map(([tt, ok, p, d]) => <li key={tt}><button type="button" onClick={() => go(p)} className={`flex w-full items-start gap-3 rounded-[12px] p-3 text-right ${ok ? 'bg-[var(--wash)] opacity-70' : 'outline outline-2 outline-[var(--rule)] hover:outline-[var(--ink)]'}`}><span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-[13px] ${ok ? 'border-[var(--ok)] bg-[var(--ok)] text-white' : 'border-[var(--ink-faint)]'}`}>{ok ? '✓' : ''}</span><span><b className="block text-[15px]">{tt}</b><span className="text-[13px] text-[var(--pencil)]">{d}</span></span></button></li>)}</ul>
    </Card>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <p className="mb-1 text-[17px] font-black">۱) جمع کردن بسته‌های دانش‌آموزان</p>
        <p className="mb-3 text-[14px] text-[var(--pencil)]">دانش‌آموزانی که حساب آنلاین دارند با «همگام‌سازی» بسته را خودشان می‌فرستند؛ اینجا وارد داده مرکز کن. فایل‌های .sspack دستی هم قبول است.</p>
        <div className="flex flex-wrap gap-2">{!offline && <Btn disabled={!canWrite || busy === 'pull'} onClick={pull}>{busy === 'pull' ? 'در حال گرفتن…' : `گرفتن بسته‌ها از سرور${c.packs ? ` (${fa(c.packs)})` : ''}`}</Btn>}
          <label className={`inline-flex min-h-[42px] cursor-pointer items-center rounded-[10px] px-4 text-[15px] font-bold ${offline ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[var(--wash)] text-[var(--ink-deep)]'} ${canWrite ? '' : 'pointer-events-none opacity-40'}`}>وارد کردن فایل‌ها<input type="file" multiple accept=".sspack,.json" className="sr-only" onChange={importFiles} /></label></div>
      </Card>
      <Card>
        <p className="mb-1 text-[17px] font-black">۲) انتشار اطلاع‌رسانی</p>
        <p className="mb-3 text-[14px] text-[var(--pencil)]">کتاب‌های تأییدشده، کلاس‌ها، آزمون‌های مشترک، شبه‌کنکور، مقایسه ناشناس (گروه‌های حداقل {fa(h.minGroup)} نفره) و اطلاعیه‌ها در یک بسته.</p>
        {!offline && <label className="mb-3 flex items-center gap-2 text-[14px]"><input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={emailAnn} disabled={!c.mail} onChange={e => setEmailAnn(e.target.checked)} />اطلاعیه‌های تازه به ایمیل دانش‌آموزان هم برود{!c.mail && ' (Gmail خاموش است)'}</label>}
        <div className="flex flex-wrap gap-2"><Btn disabled={!canDo(me, 'bulletin') && !offline || busy === 'pub'} onClick={publish}>{busy === 'pub' ? 'در حال انتشار…' : offline ? 'ساخت و دانلود فایل' : 'انتشار برای همه'}</Btn>
          {!offline && <Btn kind="ghost" onClick={async () => downloadJson(await H.buildBulletin(h, { seq: (h.seq || 0) }), `SS-bulletin-${todayStr()}.ssbulletin`)}>دانلود فایل (بدون انتشار)</Btn>}</div>
        {h.published?.length > 0 && <p className="mt-3 text-[13px] text-[var(--pencil)]">آخرین انتشار: {jDate(h.published[0].at)} · {fa(h.published[0].books)} کتاب · {fa(h.published[0].exams)} آزمون</p>}
      </Card>
      {log.length > 0 && <Card className="lg:col-span-2"><ul className="grid gap-1 text-[14px]">{log.map((l, i) => <li key={i} className={l.startsWith('✗') ? 'text-[var(--bad)]' : ''}>{l}</li>)}</ul></Card>}
      {!offline && c.recent?.length > 0 && <Card className="lg:col-span-2"><div className="mb-2 flex items-center justify-between"><p className="text-[17px] font-black">آخرین اتفاق‌ها</p>{canDo(me, 'audit') && <button type="button" className="text-[14px] font-bold text-[var(--ink)]" onClick={() => go('audit')}>همه ←</button>}</div>
        <ul className="grid gap-1.5 text-[14px]">{c.recent.map((a, i) => <li key={i} className="flex flex-wrap justify-between gap-2 rounded-[8px] bg-[var(--wash)] px-3 py-1.5"><span><b>{actFa(a.action)}</b>{a.target ? ` · ${a.target}` : ''}</span><span className="text-[13px] text-[var(--pencil)]">{a.who} · {jDate(a.at)}</span></li>)}</ul></Card>}
    </div>
  </div>;
}
