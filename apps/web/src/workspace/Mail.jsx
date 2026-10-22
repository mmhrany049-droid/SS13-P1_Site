// ایمیل: compose to students / a class / everyone (personalised with {نام}), read the center's Gmail inbox, outbox log, Gmail setup.
import { useEffect, useState } from 'react';
import { api, errText } from './adminApi.js';
import { Btn, Card, Chip, Head, Empty, fa, jDate } from '@ss/ui/ui.jsx';
import { canDo } from './perms.js';
import { inp } from './theme.js';

export const TEMPLATES = [
  ['یادآوری همگام‌سازی', 'یادآوری: برنامه هفته', 'سلام {نام}،\n\nچند روزی است برنامه SS را همگام نکرده‌ای. امروز ۱۰ دقیقه وقت بگذار، تست‌هایت را ثبت کن و «همگام‌سازی» را بزن تا برنامه هفته‌ات به‌روز شود.\n\nموفق باشی'],
  ['آزمون نزدیک', 'آزمون پیش‌رو', 'سلام {نام}،\n\nآزمون بعدی نزدیک است. در برنامه SS بخش «آزمون‌ها» را باز کن و برنامه آمادگی را بساز؛ مباحث نخوانده و در حال فراموشی را همان‌جا می‌بینی.\n\nموفق باشی'],
  ['تبریک پیشرفت', 'آفرین!', 'سلام {نام}،\n\nروند این هفته‌ات عالی بود. همین مسیر را ادامه بده 👏'],
  ['جلسه رفع اشکال', 'جلسه رفع اشکال', 'سلام {نام}،\n\nجلسه رفع اشکال روز … ساعت … برگزار می‌شود. سؤال‌هایت را از بخش «ستاره‌دار»های برنامه بیاور.'],
];

export default function Mail(props) {
  const { me, offline, counts } = props;
  const [tab, setTab] = useState(() => sessionStorage.getItem('ss-admin-compose') ? 'compose' : counts.mail === false && canDo(me, 'mail:config') ? 'settings' : 'compose');
  if (offline) return <div><Head kicker="مرکز" title="ایمیل" /><Card><Empty title="بدون سرور" text="ایمیل فقط با سرور مرکز کار می‌کند." /></Card></div>;
  const T = [['compose', 'نوشتن'], canDo(me, 'mail:inbox') && ['inbox', 'صندوق Gmail'], ['outbox', 'ارسال‌شده‌ها'], canDo(me, 'mail:config') && ['settings', 'تنظیمات Gmail']].filter(Boolean);
  return <div>
    <Head kicker="مرکز" title="ایمیل"><div className="flex flex-wrap gap-2">{T.map(([k, t]) => <Chip key={k} active={tab === k} onClick={() => setTab(k)}>{t}</Chip>)}</div></Head>
    {counts.mail === false && tab !== 'settings' && <p className="mb-4 rounded-[12px] bg-[color-mix(in_srgb,var(--amber)_14%,transparent)] p-3 text-[14px] font-bold">Gmail هنوز وصل نیست.{canDo(me, 'mail:config') ? <button type="button" className="mr-2 underline" onClick={() => setTab('settings')}>تنظیمش کن</button> : ' از مالک مرکز بخواه وصلش کند.'}</p>}
    {tab === 'compose' && <Compose {...props} />}
    {tab === 'inbox' && <Inbox {...props} setTab={setTab} />}
    {tab === 'outbox' && <Outbox />}
    {tab === 'settings' && <GmailSettings {...props} />}
  </div>;
}

function Compose({ h, refreshCounts }) {
  const pre = (() => { try { return JSON.parse(sessionStorage.getItem('ss-admin-compose') || 'null'); } catch { return null; } })();
  const [f, setF] = useState({ to: pre?.studentIds?.length ? 'selected' : pre?.emails ? 'emails' : 'all', classId: h.classes[0]?.id || '', studentIds: pre?.studentIds || [], emails: (pre?.emails || []).join(', '), subject: pre?.subject || '', text: pre?.text || 'سلام {نام}،\n\n', copyToApp: true });
  const [list, setList] = useState([]); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { sessionStorage.removeItem('ss-admin-compose'); api('/api/admin/students').then(r => setList(r.items)).catch(() => {}); }, []);
  const withEmail = list.filter(s => s.email && s.status !== 'suspended');
  const n = f.to === 'all' ? withEmail.length : f.to === 'class' ? withEmail.filter(s => (h.classes.find(c => c.id === f.classId)?.members || []).includes(s.id)).length : f.to === 'selected' ? withEmail.filter(s => f.studentIds.includes(s.id)).length : f.emails.split(/[,\s]+/).filter(x => x.includes('@')).length;
  const send = async () => {
    if (!confirm(`این ایمیل برای ${fa(n)} نفر فرستاده شود؟`)) return; setBusy(true); setMsg('');
    try { const body = { subject: f.subject, text: f.text, copyToApp: f.copyToApp, ...(f.to === 'all' ? { all: true } : f.to === 'class' ? { classId: f.classId } : f.to === 'selected' ? { studentIds: f.studentIds } : { emails: f.emails.split(/[,\s]+/).filter(x => x.includes('@')) }) };
      const r = await api('/api/admin/mail/send', { method: 'POST', body }); setMsg(`✓ ${fa(r.sent)} ایمیل فرستاده شد${r.failed ? `، ${fa(r.failed)} ناموفق (${r.error})` : ''}${r.skipped ? `، ${fa(r.skipped)} نفر ایمیل نداشتند` : ''}.`); refreshCounts?.(); }
    catch (e) { setMsg('✗ ' + errText(e)); } setBusy(false);
  };
  return <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
    <Card>
      <p className="mb-2 text-[15px] font-bold">گیرنده</p>
      <div className="mb-3 flex flex-wrap gap-2">{[['all', `همه (${fa(withEmail.length)})`], ['class', 'یک کلاس'], ['selected', 'انتخابی'], ['emails', 'آدرس دستی']].map(([k, t]) => <Chip key={k} active={f.to === k} onClick={() => setF({ ...f, to: k })}>{t}</Chip>)}</div>
      {f.to === 'class' && (h.classes.length ? <select aria-label="کلاس" className={inp + ' mb-3'} value={f.classId} onChange={e => setF({ ...f, classId: e.target.value })}>{h.classes.map(c => <option key={c.id} value={c.id}>{c.name} ({fa(c.members.length)})</option>)}</select> : <p className="mb-3 text-[14px] text-[var(--pencil)]">هنوز کلاسی نساخته‌ای.</p>)}
      {f.to === 'selected' && <div className="mb-3 flex max-h-[180px] flex-wrap gap-1.5 overflow-auto rounded-[10px] bg-[var(--wash)] p-2">{withEmail.map(s => <Chip key={s.id} className="min-h-[32px] text-[13px]" active={f.studentIds.includes(s.id)} onClick={() => setF({ ...f, studentIds: f.studentIds.includes(s.id) ? f.studentIds.filter(x => x !== s.id) : [...f.studentIds, s.id] })}>{s.name}</Chip>)}{!withEmail.length && <p className="text-[14px]">دانش‌آموزی با ایمیل نیست.</p>}</div>}
      {f.to === 'emails' && <input dir="ltr" aria-label="آدرس‌ها" className={inp + ' mb-3 text-left'} placeholder="a@gmail.com, b@gmail.com" value={f.emails} onChange={e => setF({ ...f, emails: e.target.value })} />}
      <label className="block text-[14px] font-bold">موضوع<input className={inp} value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} /></label>
      <label className="mt-3 block text-[14px] font-bold">متن <span className="font-normal text-[var(--pencil)]">({'{نام}'} = نام هر دانش‌آموز)</span><textarea rows={9} className={inp} value={f.text} onChange={e => setF({ ...f, text: e.target.value })} /></label>
      {f.to !== 'emails' && <label className="mt-2 flex items-center gap-2 text-[14px]"><input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={f.copyToApp} onChange={e => setF({ ...f, copyToApp: e.target.checked })} />یک نسخه در «پیام‌ها»ی برنامه دانش‌آموز هم بماند</label>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><Btn disabled={busy || !n || !f.subject.trim() || !f.text.trim()} onClick={send}>{busy ? 'در حال ارسال…' : `ارسال به ${fa(n)} نفر`}</Btn>{msg && <span className={`text-[14px] font-bold ${msg.startsWith('✗') ? 'text-[var(--bad)]' : 'text-[var(--ok)]'}`}>{msg}</span>}</div>
    </Card>
    <Card className="content-start"><p className="mb-2 text-[16px] font-black">الگوهای آماده</p><div className="grid gap-2">{TEMPLATES.map(([t, sub, txt]) => <button key={t} type="button" onClick={() => setF({ ...f, subject: sub, text: txt })} className="rounded-[10px] bg-[var(--wash)] p-3 text-right text-[14px] hover:brightness-95"><b>{t}</b><span className="block truncate text-[13px] text-[var(--pencil)]">{txt.split('\n').filter(Boolean)[1]}</span></button>)}</div>
      <p className="mt-4 text-[13px] leading-6 text-[var(--pencil)]">هر نفر ایمیل جداگانه می‌گیرد (آدرس بقیه را نمی‌بیند). Gmail شخصی روزانه حدود ۵۰۰ ایمیل اجازه می‌دهد؛ سقف را در تنظیمات مرکز عوض کن.</p></Card>
  </div>;
}

function Inbox({ setTab }) {
  const [box, setBox] = useState(null); const [err, setErr] = useState(''); const [open, setOpen] = useState(null); const [m, setM] = useState(null); const [rep, setRep] = useState(''); const [msg, setMsg] = useState('');
  const load = () => { setErr(''); setBox(null); api('/api/admin/mail/inbox?limit=30').then(setBox).catch(e => setErr(e.code === 'mail-off' ? 'mail-off' : errText(e))); };
  useEffect(load, []);
  useEffect(() => { setM(null); setRep(''); setMsg(''); if (open) api(`/api/admin/mail/inbox/${open}`).then(setM).catch(e => setM({ error: errText(e) })); }, [open]);
  const reply = async () => { const to = (/<([^>]+)>/.exec(m.replyTo || m.from)?.[1] || m.replyTo || m.from).trim(); try { await api('/api/admin/mail/send', { method: 'POST', body: { emails: [to], subject: /^re:/i.test(m.subject) ? m.subject : 'Re: ' + m.subject, text: rep } }); setMsg('✓ پاسخ فرستاده شد.'); setRep(''); } catch (e) { setMsg('✗ ' + errText(e)); } };
  if (err === 'mail-off') return <Card><Empty title="Gmail وصل نیست" text="برای خواندن صندوق، اول Gmail مرکز را با App Password وصل کن." action={<Btn onClick={() => setTab('settings')}>تنظیمات Gmail</Btn>} /></Card>;
  return <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
    <Card className="max-h-[72vh] overflow-auto p-2"><div className="flex items-center justify-between p-2"><b>صندوق ورودی{box ? ` · ${fa(box.total)}` : ''}</b><button type="button" className="text-[14px] font-bold text-[var(--ink)]" onClick={load}>⟳ تازه کن</button></div>
      {err ? <p className="p-3 text-[14px] text-[var(--bad)]">{err}</p> : !box ? <p className="p-3 text-[14px]">در حال خواندن Gmail…</p> : box.items.map(x => <button key={x.uid} type="button" onClick={() => setOpen(x.uid)} className={`mb-1 block w-full rounded-[10px] p-3 text-right ${open === x.uid ? 'bg-[var(--ink)] text-[var(--paper)]' : 'hover:bg-[var(--wash)]'}`}><span className="flex justify-between gap-2"><b className={`truncate text-[14px] ${x.seen ? 'font-normal' : ''}`}>{x.from.replace(/<.*>/, '').trim() || x.from}</b><span className="shrink-0 text-[12px] opacity-75">{x.date ? jDate(x.date) : ''}</span></span><span className="block truncate text-[13px] opacity-85">{x.subject}</span></button>)}</Card>
    <Card className="min-h-[300px]">{!open ? <p className="text-[15px] text-[var(--pencil)]">یک ایمیل را باز کن.</p> : !m ? <p>…</p> : m.error ? <p className="text-[var(--bad)]">{m.error}</p> : <>
      <p className="text-[20px] font-black">{m.subject}</p><p className="mb-3 text-[13px] text-[var(--pencil)]" dir="ltr">{m.from}</p>
      <div className="max-h-[42vh] overflow-auto whitespace-pre-line rounded-[10px] bg-[var(--wash)] p-4 text-[15px] leading-7" dir="auto">{m.text || '(متن ساده ندارد)'}</div>
      <textarea rows={4} aria-label="پاسخ" className={inp + ' mt-3'} placeholder="پاسخ…" value={rep} onChange={e => setRep(e.target.value)} />
      <div className="mt-2 flex items-center gap-3"><Btn disabled={!rep.trim()} onClick={reply}>پاسخ</Btn>{msg && <span className="text-[14px] font-bold">{msg}</span>}</div></>}</Card>
  </div>;
}

function Outbox() {
  const [l, setL] = useState(null);
  useEffect(() => { api('/api/admin/mail/outbox').then(r => setL(r.items)).catch(() => setL([])); }, []);
  const K = { verify: 'تأیید ایمیل', reset: 'بازیابی رمز', 'admin-reset': 'بازیابی رمز مدیر', invite: 'دعوت', broadcast: 'گروهی', custom: 'دستی', reply: 'پاسخ پیام', 'student-message': 'پیام دانش‌آموز', self: 'برنامه دانش‌آموز', test: 'آزمایشی', announcement: 'اطلاعیه', security: 'امنیتی', notify: 'اعلان' };
  return <Card className="overflow-x-auto p-0">{!l ? <p className="p-4">…</p> : !l.length ? <div className="p-4"><Empty title="هنوز ایمیلی فرستاده نشده" /></div> :
    <table className="w-full min-w-[600px] text-right text-[14px]"><thead><tr className="text-[13px] text-[var(--pencil)]"><th className="p-3">زمان</th><th>گیرنده</th><th>موضوع</th><th>نوع</th><th>وضعیت</th></tr></thead>
      <tbody>{l.map(x => <tr key={x.id} className="border-t border-[var(--rule)]"><td className="p-3 text-[13px]">{jDate(x.at)}</td><td dir="ltr" className="text-left text-[13px]">{x.to}</td><td>{x.subject}</td><td>{K[x.kind] || x.kind}</td><td title={x.error || ''} className={x.status === 'sent' ? 'text-[var(--ok)]' : 'font-bold text-[var(--bad)]'}>{x.status === 'sent' ? '✓ رفت' : '✗ ' + (x.error || 'ناموفق').slice(0, 40)}</td></tr>)}</tbody></table>}</Card>;
}

function GmailSettings({ me, refreshCounts }) {
  const [c, setC] = useState(null); const [f, setF] = useState(null); const [pass, setPass] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [adv, setAdv] = useState(false);
  const load = () => api('/api/admin/mail').then(x => { setC(x); setF({ user: x.user || me.email || '', fromName: x.fromName || '', notifyEmail: x.notifyEmail || '', enabled: x.enabled !== false, smtpHost: x.smtpHost, smtpPort: x.smtpPort, imapHost: x.imapHost, imapPort: x.imapPort }); });
  useEffect(() => { load(); }, []);
  if (!f) return <p>…</p>;
  const save = async () => { setBusy(true); setMsg(''); try { await api('/api/admin/mail', { method: 'POST', body: { ...f, enabled: true, ...(pass ? { pass } : {}) } }); setPass(''); await load(); refreshCounts?.(); setMsg('✓ ذخیره شد. حالا «ایمیل آزمایشی» را بزن.'); } catch (e) { setMsg('✗ ' + errText(e)); } setBusy(false); };
  const test = async () => { setBusy(true); setMsg(''); try { const r = await api('/api/admin/mail/test', { method: 'POST', body: { to: me.email } }); setMsg(`✓ ایمیل آزمایشی به ${r.to} رفت. صندوقت را ببین.`); } catch (e) { setMsg('✗ ' + (/535|534|Username and Password/i.test(e.message) ? 'Gmail رمز را قبول نکرد: باید App Password ۱۶ حرفی باشد، نه رمز معمولی Gmail.' : errText(e))); } setBusy(false); };
  return <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
    <Card>
      <div className="mb-3 flex items-center justify-between"><p className="text-[17px] font-black">اتصال Gmail مرکز</p><span className={`rounded-full px-3 py-0.5 text-[13px] font-bold text-white ${c.ready ? 'bg-[var(--ok)]' : 'bg-[var(--pencil)]'}`}>{c.ready ? 'وصل' : 'وصل نیست'}</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[14px] font-bold">آدرس Gmail مرکز<input dir="ltr" className={inp + ' text-left'} placeholder="center@gmail.com" value={f.user} onChange={e => setF({ ...f, user: e.target.value.trim() })} /></label>
        <label className="text-[14px] font-bold">App Password {c.hasPass && <span className="font-normal text-[var(--ok)]">(ذخیره شده ✓)</span>}<input dir="ltr" type="password" autoComplete="new-password" className={inp + ' text-left tracking-widest'} placeholder={c.hasPass ? '•••• •••• •••• ••••' : 'abcd efgh ijkl mnop'} value={pass} onChange={e => setPass(e.target.value)} /></label>
        <label className="text-[14px] font-bold">نام فرستنده<input className={inp} placeholder="مرکز مشاوره …" value={f.fromName} onChange={e => setF({ ...f, fromName: e.target.value })} /></label>
        <label className="text-[14px] font-bold">پیام‌های دانش‌آموزان به این ایمیل برسد<input dir="ltr" className={inp + ' text-left'} placeholder={f.user || 'you@gmail.com'} value={f.notifyEmail} onChange={e => setF({ ...f, notifyEmail: e.target.value.trim() })} /></label>
      </div>
      <button type="button" className="mt-3 text-[13px] font-bold text-[var(--pencil)] underline" onClick={() => setAdv(x => !x)}>{adv ? 'بستن' : 'تنظیمات پیشرفته (سرویس غیر از Gmail)'}</button>
      {adv && <div className="mt-2 grid gap-2 sm:grid-cols-4">{[['smtpHost', 'SMTP'], ['smtpPort', 'پورت SMTP'], ['imapHost', 'IMAP'], ['imapPort', 'پورت IMAP']].map(([k, l]) => <label key={k} className="text-[13px] font-bold">{l}<input dir="ltr" className={inp + ' text-left'} value={f[k] || ''} onChange={e => setF({ ...f, [k]: /Port/.test(k) ? +e.target.value || '' : e.target.value })} /></label>)}</div>}
      <div className="mt-4 flex flex-wrap items-center gap-2"><Btn disabled={busy || !f.user || (!pass && !c.hasPass)} onClick={save}>ذخیره</Btn><Btn kind="soft" disabled={busy || !c.ready} onClick={test}>ایمیل آزمایشی به خودم</Btn></div>
      {msg && <p className={`mt-3 text-[14px] font-bold ${msg.startsWith('✗') ? 'text-[var(--bad)]' : 'text-[var(--ok)]'}`}>{msg}</p>}
      <p className="mt-4 text-[13px] leading-6 text-[var(--pencil)]">رمز روی سرور رمزنگاری‌شده (AES-256) نگه داشته می‌شود و هیچ‌وقت به مرورگر برنمی‌گردد. با این اتصال: کد تأیید و بازیابی رمز، پیام دانش‌آموزان، پاسخ‌ها، ایمیل گروهی و خواندن صندوق Gmail.</p>
    </Card>
    <Card className="content-start"><p className="mb-2 text-[16px] font-black">App Password را چطور بسازم؟</p>
      <ol className="grid gap-2 text-[14px] leading-7">{['وارد حساب Google همان Gmail مرکز شو.', 'Security ← 2-Step Verification را روشن کن (بدون آن App Password ساخته نمی‌شود).', 'به myaccount.google.com/apppasswords برو.', 'یک نام بده (مثلاً SS) و Create را بزن.', 'رمز ۱۶ حرفی زرد را اینجا بچسبان و ذخیره کن.', 'برای خواندن صندوق: در تنظیمات Gmail بخش Forwarding and POP/IMAP، گزینه IMAP روشن باشد.'].map((t, i) => <li key={i} className="flex gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[12px] font-bold text-[var(--paper)]">{fa(i + 1)}</span><span>{t}</span></li>)}</ol></Card>
  </div>;
}
