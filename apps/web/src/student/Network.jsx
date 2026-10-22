import { useState } from 'react';
import { buildPack, applyBulletin, activateHubExam, downloadJson } from './exchange.js';
import { registerAtHub, hubError, client } from './sync/client.js';
import { bookFromSSB, todayStr } from '@ss/domain/store.js';
import { phoneLabel } from './account.js';
import { mockRounds } from '@ss/domain/schedule.js';
import { Btn, Card, Chip, Head, fa, jDate, jShort } from '@ss/ui/ui.jsx';

const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px] font-normal';

/** 7.1 «مرکز و همگام‌سازی»: online sync with the admin site, offline file exchange (send pack / receive reference
 *  files), what the hub sent me (activate books, mock-exam series, class exams), Telegram link, consent. */
export default function Network({ s, set, doSync, sync }) {
  const me = s.me || {}; const srv = s.account?.server;
  const [url, setUrl] = useState(srv?.url || s.settings.syncUrl || ''); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [drag, setDrag] = useState(false);
  const say = (m, e = '') => { setMsg(m); setErr(e); };
  const upConsent = p => set(x => ({ ...x, me: { ...x.me, consent: { ...(x.me.consent || {}), ...p } } }));
  const connect = async () => { setBusy(true); say(''); try { const r = await registerAtHub(s, url); set(x => ({ ...x, account: { ...x.account, server: r }, settings: { ...x.settings, syncUrl: r.url }, hub: { ...(x.hub || {}), hubName: r.hubName, bot: r.bot } })); say(`به «${r.hubName || 'مرکز'}» وصل شدی. حالا «همگام‌سازی» را بزن.`); } catch (x) { say('', hubError(x)); } setBusy(false); };
  const test = async () => { setBusy(true); try { const h = await client(url).health(); say(`سرور در دسترس است: ${h.name || 'مرکز SS'}${h.bot ? ` · ربات @${h.bot}` : ''}`); } catch (x) { say('', hubError(x)); } setBusy(false); };
  const exportPack = async () => { const p = await buildPack(s); downloadJson(p, `SS-${(me.name || 'user').replace(/\s+/g, '-')}-${todayStr()}.sspack`); set(x => ({ ...x, hub: { ...(x.hub || {}), lastPackAt: new Date().toISOString() } })); say('فایل ارسال (.sspack) ساخته شد؛ برای مسئول مرکز بفرست یا در سایت مدیریت بارگذاری کن.'); };
  const importFiles = async files => {
    say(''); const out = []; let st = s;
    for (const f of files) {
      try {
        const text = await f.text();
        if (/\.ssb$|\.txt$/i.test(f.name) || /^\s*#/.test(text)) { const r = bookFromSSB(text, { origin: 'user' }); if (!r.book) throw new Error(r.error || 'SSB نامعتبر'); st = { ...st, books: [...st.books, { ...r.book, active: false }] }; out.push(`✓ ${f.name}: کتاب «${r.book.title}» اضافه شد (غیرفعال)`); continue; }
        const r = await applyBulletin(st, JSON.parse(text));
        if (!r.ok) { out.push(`✗ ${f.name}: ${r.error}`); continue; }
        st = r.state; const m = r.summary; out.push(`✓ ${f.name}: ${m.partial ? 'فایل مرجع' : 'اطلاع‌رسانی'} — ${fa(m.booksNew)} کتاب جدید، ${fa(m.booksUpdated)} کتاب به‌روز، ${fa(m.exams)} آزمون کلاس، ${fa(m.mocks)} سری شبه‌کنکور، ${fa(m.notices)} اطلاعیه`);
      } catch (x) { out.push(`✗ ${f.name}: خوانده نشد (${x.message || 'فرمت نامعتبر'})`); }
    }
    set(() => st); say(out.join('\n'));
  };
  const pendingBooks = s.books.filter(b => b.active === false && b.origin === 'hub');
  const hubMocks = (s.mockSeries || []).filter(m => m.fromHub);
  const pendingExams = s.exams.filter(e => e.pending);
  const classes = s.org?.classes || []; const bot = s.hub?.bot;
  return (
    <div>
      <Head kicker="مرکز" title="مرکز و همگام‌سازی" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[16px] font-black">اتصال آنلاین</p>{srv ? <span className="rounded-full bg-[var(--ok)] px-3 py-0.5 text-[13px] font-bold text-[var(--paper)]">وصل به {s.hub?.hubName || 'مرکز'}</span> : <span className="rounded-full bg-[var(--wash)] px-3 py-0.5 text-[13px] font-bold">وصل نیست</span>}</div>
          <label className="text-[14px] font-bold">آدرس سایت مدیریت (مرکز)<input dir="ltr" className={inp + ' text-left'} placeholder="https://hub.example.ir" value={url} onChange={e => setUrl(e.target.value.trim())} /></label>
          <div className="mt-3 flex flex-wrap gap-2">
            {!srv || srv.url !== url.replace(/\/+$/, '') ? <Btn disabled={busy || !url} onClick={connect}>ثبت در مرکز و اتصال</Btn> : <Btn disabled={sync?.busy} onClick={() => doSync(false)}>{sync?.busy ? 'همگام‌سازی…' : '⟳ همگام‌سازی الان'}</Btn>}
            <Btn kind="ghost" disabled={busy || !url} onClick={test}>آزمایش اتصال</Btn>
            {srv && <button type="button" className="text-[13px] font-bold text-[var(--bad)]" onClick={() => confirm('اتصال این دستگاه به مرکز قطع شود؟ (داده‌هایت پاک نمی‌شود)') && set(x => ({ ...x, account: { ...x.account, server: null } }))}>قطع اتصال</button>}
          </div>
          <label className="mt-3 flex items-center gap-2 text-[14px]"><input type="checkbox" className="h-5 w-5 accent-[var(--ink)]" checked={s.settings.syncAuto !== false} onChange={e => set(x => ({ ...x, settings: { ...x.settings, syncAuto: e.target.checked } }))} />هر بار که اپ باز می‌شود خودکار همگام شود</label>
          <p className="mt-2 text-[13px] text-[var(--pencil)]">{s.hub?.lastSyncAt ? `آخرین همگام‌سازی: ${jDate(s.hub.lastSyncAt)}` : 'هنوز همگام نشده.'}{s.hub?.lastSeq ? ` · اطلاع‌رسانی شماره ${fa(s.hub.lastSeq)}` : ''}{s.hub?.lastSyncError ? ` · خطای آخر: ${s.hub.lastSyncError}` : ''}</p>
        </Card>
        <Card>
          <p className="mb-1 text-[16px] font-black">ربات تلگرام</p>
          <p className="text-[14px] text-[var(--pencil)]">شماره ثبت‌شده: <b className="text-[var(--graphite)]">{s.account?.phone ? phoneLabel(s.account.phone) : '—'}</b></p>
          {bot?.username ? <ol className="mt-2 grid gap-1 text-[14px] leading-7"><li>۱) در تلگرام <a className="font-bold text-[var(--ink)] underline" href={`https://t.me/${bot.username}`} target="_blank" rel="noreferrer">@{bot.username}</a> را باز کن و «Start» را بزن.</li><li>۲) دکمه «📱 ارسال شماره من» را بزن (همان شماره بالا).</li><li>۳) از منوی ربات: برنامه امروز، آزمون‌ها، وضعیت، مرورها.</li></ol>
            : <p className="mt-2 text-[14px]">بعد از اتصال و اولین همگام‌سازی، نام ربات مرکز اینجا می‌آید.</p>}
          <label className="mt-3 flex items-start gap-2 text-[14px]"><input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--ink)]" checked={me.consent?.telegram !== false} onChange={e => upConsent({ telegram: e.target.checked })} /><span>خلاصه برنامه و وضعیتم برای ربات فرستاده شود<span className="block text-[12px] text-[var(--pencil)]">ربات فقط آخرین خلاصه همگام‌شده را نشان می‌دهد.</span></span></label>
        </Card>
        <Card className="lg:col-span-2">
          <p className="mb-1 text-[16px] font-black">تبادل با فایل (بدون اینترنت)</p>
          <p className="mb-3 text-[14px] text-[var(--pencil)]">۱) فایل ارسال خودت را بساز و بده به مرکز. ۲) فایل اطلاع‌رسانی (.ssbulletin)، فایل مرجع کتاب یا فایل SSB را اینجا رها کن.</p>
          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <Btn onClick={exportPack}>ساخت فایل ارسال (.sspack)</Btn>
            <label onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); importFiles([...e.dataTransfer.files]); }}
              className={`flex min-h-[64px] cursor-pointer items-center justify-center rounded-[12px] border-2 border-dashed px-4 text-center text-[15px] font-bold ${drag ? 'border-[var(--ink)] bg-[var(--wash)]' : 'border-[var(--ink-faint)]'}`}>فایل مرکز را اینجا بکش یا بزن تا انتخاب کنی<input type="file" multiple accept=".ssbulletin,.ssref,.json,.ssb,.txt" className="sr-only" onChange={e => { importFiles([...(e.target.files || [])]); e.target.value = ''; }} /></label>
          </div>
          {msg && <p role="status" className="mt-3 whitespace-pre-line text-[14px] font-bold text-[var(--ok)]">{msg}</p>}
          {err && <p role="alert" className="mt-3 text-[14px] font-bold text-[var(--bad)]">{err}</p>}
          {sync?.msg && <p className="mt-2 text-[13px] text-[var(--pencil)]">{sync.msg}</p>}
        </Card>
        <Card className="lg:col-span-2">
          <p className="mb-1 text-[16px] font-black">رسیده از مرکز: فقط فعالشان کن</p>
          <p className="mb-3 text-[14px] text-[var(--pencil)]">کتاب‌ها، سری‌های شبه‌کنکور و آزمون‌های کلاس را مرکز طراحی می‌کند؛ تا فعال نکنی وارد برنامه و تحلیل نمی‌شوند.</p>
          {!pendingBooks.length && !hubMocks.length && !pendingExams.length ? <p className="text-[15px] text-[var(--pencil)]">چیز تازه‌ای منتظر نیست.</p> : <div className="grid gap-4 lg:grid-cols-3">
            <div><p className="mb-2 text-[14px] font-black">کتاب‌های تست ({fa(pendingBooks.length)})</p><ul className="grid gap-2">{pendingBooks.map(b => <li key={b.id} className="flex items-center justify-between gap-2 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px]"><span><b>{b.title}</b>، {b.publisher}<span className="block text-[12px] text-[var(--pencil)]">{fa(Object.keys(b.keys || {}).length)} کلید · {fa(b.nodes.filter(n => n.qStart != null).length)} بازه</span></span><Btn kind="soft" className="min-h-[34px] px-3 text-[13px]" onClick={() => set(x => ({ ...x, books: x.books.map(z => z.id === b.id ? { ...z, active: true } : z) }))}>فعال کن</Btn></li>)}</ul></div>
            <div><p className="mb-2 text-[14px] font-black">شبه‌کنکور ({fa(hubMocks.length)})</p><ul className="grid gap-2">{hubMocks.map(m => <li key={m.id} className="rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px]"><div className="flex items-center justify-between gap-2"><b>{m.title}</b><Chip active={m.active === true} onClick={() => set(x => ({ ...x, mockSeries: x.mockSeries.map(z => z.id === m.id ? { ...z, active: z.active !== true } : z) }))} className="min-h-[30px] text-[12px]">{m.active === true ? 'فعال' : 'فعال کن'}</Chip></div><p className="text-[12px] text-[var(--pencil)]">هر {fa(m.everyWeeks)} هفته · {fa(mockRounds(m).length)} مرحله · بعدی {jShort(mockRounds(m).find(r => r.date >= todayStr())?.date || m.startDate)}</p></li>)}</ul></div>
            <div><p className="mb-2 text-[14px] font-black">آزمون‌های کلاس ({fa(pendingExams.length)})</p><ul className="grid gap-2">{pendingExams.map(e => <li key={e.id} className="flex items-center justify-between gap-2 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px]"><span><b>{e.title}</b><span className="block text-[12px] text-[var(--pencil)]">{jShort(e.date)} · {classes.find(c => c.id === e.classId)?.name || ''}</span></span><Btn kind="soft" className="min-h-[34px] px-3 text-[13px]" onClick={() => set(x => activateHubExam(x, e.id))}>فعال کن</Btn></li>)}</ul></div>
          </div>}
        </Card>
        <Card>
          <p className="mb-2 text-[16px] font-black">کلاس‌های من</p>
          {!classes.length ? <p className="text-[14px] text-[var(--pencil)]">فهرست کلاس‌ها از مرکز می‌آید.</p> : <div className="flex flex-wrap gap-2">{classes.map(c => { const mine = (me.classIds || []).includes(c.id); const req = (me.joinRequests || []).includes(c.id); return <Chip key={c.id} active={mine} disabled={mine} onClick={() => set(x => ({ ...x, me: { ...x.me, joinRequests: req ? x.me.joinRequests.filter(y => y !== c.id) : [...(x.me.joinRequests || []), c.id] } }))}>{c.kind === 'school' ? '🏫' : '📚'} {c.name}{mine ? ' ✓' : req ? ' (درخواست)' : ''}</Chip>; })}</div>}
          <p className="mt-2 text-[12px] text-[var(--pencil)]">عضویت را مرکز تأیید می‌کند؛ روی کلاس بزن تا درخواست عضویت در همگام‌سازی بعدی برود.</p>
        </Card>
        <Card>
          <p className="mb-3 text-[16px] font-black">اجازه‌ها</p>
          <div className="grid gap-3 text-[15px]">{[['books', 'کتاب‌ها، بازه‌ها و کلیدهایی که ساخته‌ام', 'تا بقیه بدون وارد کردن دوباره استفاده کنند'], ['results', 'نتیجه آزمون‌های مشترک و شبه‌کنکور', 'برای کارنامه کلاس'], ['compare', 'آمار مباحث برای مقایسه ناشناس', 'فقط گروه‌های حداقل ۳ نفره منتشر می‌شوند'], ['dossier', 'پرونده تحصیلی، شیوه برنامه‌ریزی و میزان تعهدم', 'برای ثبت‌نام و پیگیری در پایگاه داده مرکز (داخل همان فایل .sspack)'], ['full', 'پشتیبان کامل همه داده‌هایم در مرکز', 'برای بازیابی و بررسی کامل؛ رمزها و عکس‌ها فرستاده نمی‌شوند']].map(([k, t, h]) =>
            <label key={k} className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--ink)]" checked={k === 'dossier' ? me.consent?.dossier !== false : !!me.consent?.[k]} onChange={e => upConsent({ [k]: e.target.checked })} /><span>{t}<span className="block text-[13px] text-[var(--pencil)]">{h}</span></span></label>)}</div>
        </Card>
        {(s.announcements || []).length > 0 && <Card className="lg:col-span-2"><div className="mb-3 flex items-center justify-between"><p className="text-[16px] font-black">اطلاعیه‌های مرکز</p><Btn kind="ghost" className="min-h-[32px] px-3 text-[13px]" onClick={() => set(x => ({ ...x, announcements: x.announcements.map(a => ({ ...a, read: true })) }))}>همه خوانده شد</Btn></div>
          <ul className="grid gap-2">{s.announcements.map(a => <li key={a.id} className={`rounded-[10px] p-3 text-[15px] ${a.read ? 'bg-[var(--wash)]' : 'bg-[var(--card)] outline outline-2 outline-[var(--ink)]'}`}><b>{a.title}</b>{a.classId ? <span className="text-[13px] text-[var(--pencil)]"> · {classes.find(c => c.id === a.classId)?.name}</span> : null}<p className="mt-1 whitespace-pre-line">{a.text}</p><p className="mt-1 text-[12px] text-[var(--pencil)]">{jDate(a.at)}</p></li>)}</ul></Card>}
      </div>
    </div>
  );
}
