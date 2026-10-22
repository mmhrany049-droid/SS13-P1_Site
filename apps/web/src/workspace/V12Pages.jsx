// SS 12 — workspace pages that run on the unified API (identity, scope, events, migration, class schedule).
// The server enforces every permission (policy.mjs); hiding a page here is only convenience, never security.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { call, errFa } from '../shell/api.js';
import { Btn, Card, Head, Empty, fa, jDate } from '@ss/ui/ui.jsx';
import { PERMISSIONS } from '@ss/contracts/roles.mjs';

export const may = (roleId, perm) => !!PERMISSIONS[roleId]?.includes(perm);
const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2.5 text-[15px] outline-none focus:border-[var(--ink)]';
const Msg = ({ m }) => m ? <p role={m.bad ? 'alert' : 'status'} className={`mt-3 rounded-[10px] px-3 py-2 text-[14px] font-bold ${m.bad ? 'bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] text-[var(--bad)]' : 'bg-[var(--wash)] text-[var(--ink-deep)]'}`}>{m.t}</p> : null;
const useLoad = (path, deps = []) => {
  const [d, setD] = useState(null); const [e, setE] = useState('');
  const load = useCallback(() => call(path).then(x => { setD(x); setE(''); }).catch(x => setE(errFa(x))), [path]);
  useEffect(() => { load(); }, [load, ...deps]);
  return [d, load, e];
};

/* ---------------------------------------------------------------- people & the nine roles */
export function People12({ unified }) {
  const [d, reload, err] = useLoad('/api/workspace/people');
  const [f, setF] = useState({ name: '', email: '', role: 'student', classIds: '', subjects: '' }); const [m, setM] = useState(null); const [busy, setBusy] = useState(false); const [q, setQ] = useState('');
  const add = async e => { e.preventDefault(); setBusy(true); setM(null);
    try { const r = await call('/api/workspace/people', { method: 'POST', body: f });
      setM({ t: r.tempPassword ? `ساخته شد. رمز موقت (فقط همین یک بار): ${r.tempPassword} — با اولین ورود باید عوض شود.` : 'نقش به حساب موجود اضافه شد (رمز قبلی‌اش تغییری نکرد).' });
      setF({ ...f, name: '', email: '', classIds: '', subjects: '' }); reload(); }
    catch (x) { setM({ bad: true, t: errFa(x) }); } finally { setBusy(false); } };
  const revoke = async (ra, u) => { if (!confirm(`نقش «${ra.label}» از ${u.name || u.email} گرفته شود؟ نشست‌های همان نقش هم بسته می‌شود.`)) return;
    try { await call(`/api/workspace/roles/${ra.id}/revoke`, { method: 'POST', body: {} }); reload(); } catch (x) { setM({ bad: true, t: errFa(x) }); } };
  const items = (d?.items || []).filter(u => !q || `${u.name} ${u.email} ${u.phone}`.includes(q));
  return <div>
    <Head kicker="هویت واحد · یک حساب، چند نقش" title="افراد و نقش‌ها"><span className="text-[15px] text-[var(--pencil)]">{d ? `${fa(d.items.length)} نفر` : ''}</span></Head>
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <input className={inp} placeholder="جستجوی نام یا ایمیل…" value={q} onChange={e => setQ(e.target.value)} aria-label="جستجو" />
        {err && <Msg m={{ bad: true, t: err }} />}
        <ul className="mt-4 divide-y-2 divide-[var(--rule)]">
          {items.map(u => <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--wash)] font-black text-[var(--ink)]">{(u.name || '؟').slice(0, 1)}</span>
            <span className="min-w-0 flex-1"><b className="block text-[16px]">{u.name || '—'}</b><span className="block truncate text-[14px] text-[var(--pencil)]" dir="ltr">{u.email || u.phone}</span>{u.needsPassword && <span className="text-[13px] font-bold text-[var(--amber)]">هنوز با رمز موقت</span>}</span>
            <span className="flex flex-wrap gap-1.5">{u.roles.map(ra => <span key={ra.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--wash)] px-3 py-1 text-[13px] font-bold">{ra.label}
              {ra.roleId !== 'owner' && u.id !== unified.user.id && <button type="button" onClick={() => revoke(ra, u)} className="text-[var(--bad)]" aria-label={`گرفتن نقش ${ra.label}`}>×</button>}</span>)}</span>
          </li>)}
          {d && !items.length && <li className="py-6"><Empty title="کسی پیدا نشد" /></li>}
        </ul>
      </Card>
      <Card>
        <p className="text-[18px] font-black">افزودن نقش</p>
        <p className="mt-1 text-[14px] text-[var(--pencil)]">اگر ایمیل قبلاً حساب دارد، فقط نقش تازه به همان حساب اضافه می‌شود.</p>
        <form onSubmit={add}>
          <label className="mt-3 block text-[14px] font-bold">نام<input className={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label className="mt-3 block text-[14px] font-bold">ایمیل<input className={inp} dir="ltr" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></label>
          <label className="mt-3 block text-[14px] font-bold">نقش<select className={inp} value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{(d?.grantable || []).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
          <label className="mt-3 block text-[14px] font-bold">کلاس‌ها (اختیاری، با ویرگول)<input className={inp} value={f.classIds} onChange={e => setF({ ...f, classIds: e.target.value })} /></label>
          <label className="mt-3 block text-[14px] font-bold">درس‌ها (برای معلم درس منتخب)<input className={inp} value={f.subjects} onChange={e => setF({ ...f, subjects: e.target.value })} placeholder="ریاضی، فیزیک" /></label>
          <Btn type="submit" className="mt-4 w-full" disabled={busy || !f.email}>{busy ? '…' : 'ثبت نقش'}</Btn>
        </form>
        <Msg m={m} />
      </Card>
    </div>
  </div>;
}

/* ------------------------------------------------------------ student/workspace integration */
const SHARE_LABEL = { books: 'کتاب‌ها و کلیدهای مشترک', results: 'نتیجه آزمون‌ها', topic_stats: 'آمار مبحث‌ها', dossier: 'پرونده با رضایت دانش‌آموز', summary: 'خلاصه مطالعه', requests: 'درخواست‌ها' };
export function Progress() {
  const [d, reload, err] = useLoad('/api/workspace/progress');
  const [selected, setSelected] = useState(null); const [detail, setDetail] = useState(null); const [detailErr, setDetailErr] = useState('');
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let live = true; setDetail(null); setDetailErr('');
    call(`/api/workspace/progress/${encodeURIComponent(selected)}`).then(x => { if (live) setDetail(x); })
      .catch(x => { if (live) setDetailErr(errFa(x)); });
    return () => { live = false; };
  }, [selected]);
  const title = kind => SHARE_LABEL[kind] || kind;
  const fmt = n => fa(n || 0);
  return <div>
    <Head kicker="اتصال داده با رضایت و محدوده سازمان" title="پیوند مطالعه و کلاس">
      <Btn kind="soft" onClick={reload}>به‌روزرسانی</Btn>
    </Head>
    <p className="mb-4 max-w-3xl text-[14px] leading-7 text-[var(--pencil)]">ثبت‌های مطالعه‌ی دانش‌آموز در /today، پس از همگام‌شدن، به گزارش محدود همین سازمان می‌رسند. داده‌های کتاب و پرونده فقط وقتی نشان داده می‌شوند که دانش‌آموز در بسته‌ی ارسالی برای همان نوع داده رضایت داده باشد.</p>
    {err && <Msg m={{ bad: true, t: err }} />}
    {!d ? <Card><p className="text-[14px] text-[var(--pencil)]">در حال دریافت داده‌ی محدود به سازمان…</p></Card> : !d.items?.length ? <Card><Empty title="داده‌ی پیوندخورده‌ای نیست" text="دانش‌آموزان باید نقش دانش‌آموز در این سازمان داشته باشند و برای آمار تازه، از حساب خودشان حداقل یک جلسه مطالعه را همگام کنند." /></Card> :
      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-right text-[14px]">
            <thead><tr className="bg-[var(--wash)] text-[13px] text-[var(--pencil)]"><th className="p-3">دانش‌آموز</th><th>مطالعه ۷ روز</th><th>تست</th><th>جلسه</th><th>روزهای پیوسته</th><th>داده اشتراکی</th></tr></thead>
            <tbody>{d.items.map(x => {
              const days = x.progress.week || []; const minutes = days.reduce((a, y) => a + y.minutes, 0);
              const tests = days.reduce((a, y) => a + y.tests, 0); const sessions = days.reduce((a, y) => a + y.sessions, 0);
              return <tr key={x.user.id} className={`cursor-pointer border-t border-[var(--rule)] hover:bg-[var(--wash)] ${selected === x.user.id ? 'bg-[var(--wash)]' : ''}`} onClick={() => setSelected(x.user.id)}>
                <td className="p-3"><b>{x.user.name || '—'}</b><span className="block text-[12px] text-[var(--pencil)]" dir="ltr">{x.user.email || ''}</span></td>
                <td>{fmt(minutes)} دقیقه</td><td>{fmt(tests)}</td><td>{fmt(sessions)}</td><td>{fmt(x.progress.streakDays)}</td>
                <td>{x.sharedData?.length ? x.sharedData.map(title).join('، ') : <span className="text-[var(--pencil)]">فقط آمار همگام‌شده</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </Card>
        <Card>
          {!selected ? <Empty title="یک دانش‌آموز را انتخاب کن" text="نمایش فقط خلاصه‌ی روزانه و اطلاعاتی است که خودش برای مرکز فرستاده." /> : detailErr ? <Msg m={{ bad: true, t: detailErr }} /> : !detail ? <p className="text-[14px] text-[var(--pencil)]">در حال بارگذاری جزئیات…</p> : <>
            <p className="text-[18px] font-black">{detail.user.name || 'خلاصه دانش‌آموز'}</p>
            <p className="mb-3 text-[13px] text-[var(--pencil)]">اطلاعات اشتراکی با رضایت · {fmt(detail.progress.today.minutes)} دقیقه امروز، {fmt(detail.progress.today.tests)} تست</p>
            {!detail.sharedData.length ? <Empty title="فایل اشتراکی ندارد" text="آمار جلسه‌های همگام‌شده همچنان در جدول سمت راست در دسترس است." /> :
              <div className="grid gap-3">{detail.sharedData.map(r => {
                const b = r.body; const isArray = Array.isArray(b);
                const summary = isArray ? `${fmt(b.length)} مورد` : r.kind === 'dossier' ? [b?.identity?.gradeFa || b?.identity?.grade, b?.identity?.streamFa || b?.identity?.stream, b?.education?.targetMajor || b?.education?.targetUni].filter(Boolean).join(' · ') : '';
                return <section key={r.id} className="rounded-[10px] bg-[var(--paper)] p-3">
                  <p className="font-bold">{title(r.kind)}{summary ? <span className="font-normal text-[var(--pencil)]"> · {summary}</span> : null}</p>
                  {r.kind === 'results' && isArray && <p className="mt-1 text-[13px] text-[var(--pencil)]">{b.slice(0, 5).map(z => `${z.date || '—'}: ${z.percent ?? '—'}٪`).join(' · ')}</p>}
                  {r.kind === 'books' && isArray && <p className="mt-1 text-[13px] text-[var(--pencil)]">{b.slice(0, 6).map(z => z.title).filter(Boolean).join('، ')}</p>}
                  {r.kind === 'dossier' && <p className="mt-1 text-[13px] text-[var(--pencil)]">{[b?.education?.school, b?.education?.institute, b?.planning?.styleFa, b?.commitment?.last7?.adherence != null ? `تعهد هفته: ${fmt(b.commitment.last7.adherence)}٪` : ''].filter(Boolean).join(' · ') || 'پرونده ثبت شده است.'}</p>}
                </section>;
              })}</div>}
          </>}
        </Card>
      </div>}
  </div>;
}

/* ---------------------------------------------------------------- class schedule (C1) */
const DAYS = [['sat', 'شنبه'], ['sun', 'یکشنبه'], ['mon', 'دوشنبه'], ['tue', 'سه‌شنبه'], ['wed', 'چهارشنبه'], ['thu', 'پنجشنبه']];
const BELLS0 = [['07:30', '09:00'], ['09:15', '10:45'], ['11:00', '12:30'], ['13:15', '14:45']].map(([from, to], i) => ({ no: i + 1, from, to }));
const half = (a, z) => { const t = s => +s.slice(0, 2) * 60 + +s.slice(3); const m = Math.round((t(a) + t(z)) / 2); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export function Schedules({ unified }) {
  const [d, reload, err] = useLoad('/api/workspace/schedules');
  const [sel, setSel] = useState(null); const [m, setM] = useState(null); const [nf, setNf] = useState({ grade: '12', stream: 'riazi', academicYear: '1405-1406' });
  const canWrite = may(unified.activeRole?.roleId, 'schedule.write');
  const list = useMemo(() => (d?.items || []).sort((a, b) => `${a.grade}${a.stream}${b.version}`.localeCompare(`${b.grade}${b.stream}${a.version}`)), [d]);
  const cur = sel;
  const create = async () => { setM(null); try { const v = await call('/api/workspace/schedules', { method: 'POST', body: { ...nf, bells: BELLS0, days: {} } }); setSel(v); reload(); } catch (x) { setM({ bad: true, t: x.data?.reason === 'draft-exists' ? 'برای این پایه و رشته یک پیش‌نویس باز هست؛ همان را ویرایش کن.' : errFa(x) }); } };
  const save = async v => { try { const r = await call(`/api/workspace/schedules/${v.id}`, { method: 'POST', body: { bells: v.bells, days: v.days } }); setSel(r); reload(); setM(r.errors?.length ? { bad: true, t: `ذخیره شد، ولی ${fa(r.errors.length)} خطا مانع انتشار است.` } : { t: 'ذخیره شد.' }); } catch (x) { setM({ bad: true, t: errFa(x) }); } };
  const publish = async v => { if (!confirm('بعد از انتشار، این نسخه قفل می‌شود و برای برنامه‌ریز دانش‌آموزان ورودی قطعی است. منتشر شود؟')) return; try { await call(`/api/workspace/schedules/${v.id}/publish`, { method: 'POST', body: {} }); setSel(null); reload(); setM({ t: 'منتشر شد.' }); } catch (x) { setM({ bad: true, t: x.data?.errors?.join(' · ') || errFa(x) }); } };
  const slot = (v, day, no) => (v.days?.[day] || []).find(s => s.bell === no);
  const setSlot = (day, no, patch) => setSel(v => { const ds = (v.days?.[day] || []).filter(s => s.bell !== no); const b = v.bells.find(x => x.no === no);
    const next = patch === null ? ds : [...ds, { bell: no, ...patch, ...(patch.type === 'split' && !patch.parts ? { parts: [{ subject: '', from: b.from, to: half(b.from, b.to) }, { subject: '', from: half(b.from, b.to), to: b.to }] } : {}) }].sort((a, z) => a.bell - z.bell);
    return { ...v, days: { ...v.days, [day]: next } }; });
  return <div>
    <Head kicker="ماژول تازه · ورودی قطعی برنامه‌ریز" title="برنامه کلاس" />
    {err && <Msg m={{ bad: true, t: err }} />}
    <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
      <Card>
        <p className="text-[16px] font-black">نسخه‌ها</p>
        <ul className="mt-3 space-y-1.5">{list.map(v => <li key={v.id}><button type="button" onClick={() => setSel(v)} className={`w-full rounded-[10px] px-3 py-2 text-right text-[14px] font-bold ${sel?.id === v.id ? 'bg-[var(--ink)] text-[var(--paper)]' : 'hover:bg-[var(--wash)]'}`}>پایه {fa(v.grade || '—')} · {v.stream || '—'} · نسخه {fa(v.version)}<span className="block text-[13px] font-normal opacity-80">{{ draft: 'پیش‌نویس', published: 'منتشرشده', superseded: 'جایگزین‌شده' }[v.status]}{v.academicYear ? ` · ${v.academicYear}` : ''}</span></button></li>)}</ul>
        {!list.length && <p className="mt-2 text-[14px] text-[var(--pencil)]">هنوز برنامه‌ای ساخته نشده.</p>}
        {canWrite && <div className="mt-5 border-t-2 border-[var(--rule)] pt-4">
          <p className="text-[14px] font-black">نسخه تازه</p>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[13px] font-bold">پایه<select className={inp} value={nf.grade} onChange={e => setNf({ ...nf, grade: e.target.value })}>{['10', '11', '12'].map(g => <option key={g} value={g}>{fa(g)}</option>)}</select></label>
            <label className="text-[13px] font-bold">رشته<select className={inp} value={nf.stream} onChange={e => setNf({ ...nf, stream: e.target.value })}><option value="riazi">ریاضی</option><option value="tajrobi">تجربی</option></select></label>
            <label className="text-[13px] font-bold">سال<input className={inp} dir="ltr" value={nf.academicYear} onChange={e => setNf({ ...nf, academicYear: e.target.value })} /></label>
          </div>
          <Btn kind="soft" className="mt-3 w-full" onClick={create}>ساخت پیش‌نویس</Btn>
        </div>}
        <Msg m={m} />
      </Card>
      {cur ? <Card>
        <div className="flex flex-wrap items-center gap-3"><p className="text-[18px] font-black">پایه {fa(cur.grade)} · {cur.stream} · نسخه {fa(cur.version)}</p>
          {cur.status === 'draft' && canWrite ? <><Btn onClick={() => save(cur)}>ذخیره</Btn><Btn kind="line" onClick={() => publish(cur)} disabled={!!cur.errors?.length}>انتشار</Btn></> : <span className="rounded-full bg-[var(--wash)] px-3 py-1 text-[13px] font-bold">فقط خواندنی</span>}</div>
        {!!cur.errors?.length && <ul className="mt-3 list-inside list-disc text-[14px] text-[var(--bad)]">{cur.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-1 text-[14px]">
            <thead><tr><th className="text-right">زنگ</th>{DAYS.map(([k, t]) => <th key={k} className="text-right font-black">{t}</th>)}</tr></thead>
            <tbody>{cur.bells.map(b => <tr key={b.no}>
              <td className="whitespace-nowrap align-top font-bold">{fa(b.no)}<span className="block text-[12px] font-normal text-[var(--pencil)]" dir="ltr">{b.from}–{b.to}</span></td>
              {DAYS.map(([day]) => { const s = slot(cur, day, b.no); const ro = cur.status !== 'draft' || !canWrite; return <td key={day} className="rounded-[8px] bg-[var(--paper)] p-1.5 align-top">
                <select disabled={ro} aria-label={`${day} زنگ ${b.no}`} className="w-full rounded-[6px] bg-transparent text-[13px] font-bold" value={s?.type || ''} onChange={e => setSlot(day, b.no, e.target.value ? { type: e.target.value, subject: s?.subject || '' } : null)}>
                  <option value="">—</option><option value="full">کامل</option><option value="free">آزاد</option><option value="split">دونیمه</option></select>
                {s?.type === 'full' && <input disabled={ro} className="mt-1 w-full rounded-[6px] border border-[var(--rule)] bg-[var(--card)] px-1.5 py-1 text-[13px]" placeholder="درس" value={s.subject || ''} onChange={e => setSlot(day, b.no, { ...s, subject: e.target.value })} />}
                {s?.type === 'split' && s.parts.map((p, i) => <input key={i} disabled={ro} className="mt-1 w-full rounded-[6px] border border-[var(--rule)] bg-[var(--card)] px-1.5 py-1 text-[13px]" placeholder={`نیمه ${i ? 'دوم' : 'اول'} ${p.from}`} value={p.subject} onChange={e => setSlot(day, b.no, { ...s, parts: s.parts.map((q, j) => j === i ? { ...q, subject: e.target.value } : q) })} />)}
              </td>; })}
            </tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-[var(--pencil)]">زنگ آزاد هرگز خودکار «کار مطالعه» نمی‌سازد؛ دونیمه دقیقاً دو بخش دارد و بیرون از زنگ نمی‌رود.</p>
      </Card> : <Card><Empty title="یک نسخه را انتخاب کن" text="نسخه منتشرشده قفل است؛ تغییر یعنی نسخه بعدی به‌صورت پیش‌نویس." /></Card>}
    </div>
  </div>;
}

/* ---------------------------------------------------------------- migration v9/v10/v11 → v12 (A6) */
export function Imports() {
  const [d, reload, err] = useLoad('/api/workspace/imports'); const [job, setJob] = useState(null); const [m, setM] = useState(null); const [busy, setBusy] = useState(false);
  const preview = async body => { setBusy(true); setM(null); try { setJob(await call('/api/workspace/imports', { method: 'POST', body })); reload(); } catch (x) { setM({ bad: true, t: x.data?.reason ? `${errFa(x)} (${x.data.reason})` : errFa(x) }); } finally { setBusy(false); } };
  const file = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 900 * 1024) { setM({ bad: true, t: 'فایل بزرگ‌تر از ۹۰۰ کیلوبایت است؛ برای داده کامل سرور قدیمی از گزینه «داده همین سرور» استفاده کن.' }); return; } preview({ content: await f.text() }); };
  const act = async (id, what) => { if (what === 'rollback' && !confirm('بازگردانی: رکوردهای این انتقال از دید فعلی برداشته می‌شوند (حذف تاریخی نیست). ادامه؟')) return; setBusy(true); setM(null);
    try { const r = await call(`/api/workspace/imports/${id}/${what}`, { method: 'POST', body: {} }); setJob(r); reload(); setM({ t: what === 'apply' ? 'انتقال انجام و راستی‌آزمایی شد.' : 'بازگردانی شد.' }); } catch (x) { setM({ bad: true, t: errFa(x) }); } finally { setBusy(false); } };
  const P = job?.preview;
  return <div>
    <Head kicker="مهاجرت امن · پیش‌نمایش ← تأیید ← راستی‌آزمایی" title="انتقال داده نسخه‌های قبلی" />
    {err && <Msg m={{ bad: true, t: err }} />}
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Card>
        <p className="text-[16px] font-black">۱. منبع</p>
        <p className="mt-1 text-[14px] text-[var(--pencil)]">هیچ چیزی بدون پیش‌نمایش و تأیید تو نوشته نمی‌شود. فایل اصلی دست نمی‌خورد.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn disabled={busy || !d?.legacyData} onClick={() => preview({ source: 'server-data' })}>داده همین سرور (v9 تا v11)</Btn>
          <label className="inline-flex min-h-[42px] cursor-pointer items-center rounded-[10px] border-2 border-[var(--ink)] px-4 text-[15px] font-bold text-[var(--ink)] hover:bg-[var(--wash)]">فایل پشتیبان / بسته .sspack<input type="file" accept=".json,.sspack,.ssbulletin,application/json" className="sr-only" onChange={file} /></label>
        </div>
        {d && !d.legacyData && <p className="mt-2 text-[13px] text-[var(--pencil)]">در پوشه داده این سرور، داده نسخه‌های قبلی (admins.json / students.json) پیدا نشد.</p>}
        <Msg m={m} />
        <p className="mt-6 text-[16px] font-black">کارهای قبلی</p>
        <ul className="mt-2 space-y-1.5">{(d?.items || []).map(j => <li key={j.id}><button type="button" onClick={() => setJob(j)} className="w-full rounded-[10px] px-3 py-2 text-right text-[14px] hover:bg-[var(--wash)]"><b>{j.label || j.kind}</b> · {{ previewed: 'پیش‌نمایش', applied: 'اعمال‌شده', rolled_back: 'بازگردانده' }[j.status] || j.status}<span className="block text-[12px] text-[var(--pencil)]">{jDate(j.createdAt)}</span></button></li>)}</ul>
      </Card>
      <Card>
        {!job ? <Empty title="۲. پیش‌نمایش" text="بعد از انتخاب منبع، اینجا تعداد افزوده، بدون تغییر، تداخل و نگاشت‌نشده را می‌بینی." /> : <>
          <p className="text-[16px] font-black">۲. پیش‌نمایش · {job.label || job.kind}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{[['added', 'افزوده'], ['unchanged', 'بدون تغییر'], ['conflict', 'تداخل'], ['unmapped', 'نگاشت‌نشده'], ['records', 'داده اشتراکی']].map(([k, t]) => <div key={k} className="rounded-[10px] bg-[var(--paper)] p-3 text-center"><p className="text-[26px] font-black">{fa(P?.[k] || 0)}</p><p className="text-[13px] text-[var(--pencil)]">{t}</p></div>)}</div>
          {job.kind === 'sspack-v3' && <p className="mt-2 text-[13px] text-[var(--pencil)]">کتاب، نتیجه، آمار و پرونده فقط طبق رضایت ثبت‌شده داخل بسته وارد می‌شوند؛ پشتیبان کامل در گزارش خلاصه نمایش داده نمی‌شود.</p>}
          {!!job.conflicts?.length && <><p className="mt-4 text-[14px] font-black">صف تداخل و نگاشت‌نشده</p><ul className="mt-1 max-h-48 overflow-auto text-[13px]">{job.conflicts.slice(0, 50).map((c, i) => <li key={i} className="border-b border-[var(--rule)] py-1">{c.entity} · {c.label || c.key} {c.why ? `— ${c.why}` : ''}</li>)}</ul></>}
          {!!P?.samples?.length && <><p className="mt-4 text-[14px] font-black">نمونه رکوردها</p><ul className="mt-1 text-[13px]">{P.samples.slice(0, 8).map((r, i) => <li key={i}>{r.op} · {r.entity} · {r.label || r.key}</li>)}</ul></>}
          <div className="mt-5 flex flex-wrap gap-2">
            {job.status === 'previewed' && <Btn disabled={busy} onClick={() => act(job.id, 'apply')}>۳. تأیید و اعمال</Btn>}
            {job.status === 'applied' && <Btn kind="line" disabled={busy} onClick={() => act(job.id, 'rollback')}>بازگردانی این انتقال</Btn>}
          </div>
          {job.applied && <p className="mt-3 text-[13px] text-[var(--pencil)]">راستی‌آزمایی: {JSON.stringify(job.applied.verify || job.applied).slice(0, 220)}</p>}
        </>}
      </Card>
    </div>
  </div>;
}

/* ---------------------------------------------------------------- events & data integrity (A5) */
export function Integrity() {
  const [v, reloadV, e1] = useLoad('/api/workspace/events/verify'); const [ev, reloadE, e2] = useLoad('/api/workspace/events?limit=60');
  return <div>
    <Head kicker="رویدادهای فقط‌افزودنی · بازسازی از صفر" title="رویدادها و صحت داده"><Btn kind="soft" onClick={() => { reloadV(); reloadE(); }}>بررسی دوباره</Btn></Head>
    {(e1 || e2) && <Msg m={{ bad: true, t: e1 || e2 }} />}
    {v && <Card className="mb-6"><p className={`text-[28px] font-black ${v.ok ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}`}>{v.ok ? '✓ داده سالم است' : '✗ ناسازگاری پیدا شد'}</p>
      <p className="mt-1 text-[15px]">بازسازی «امروز» از روی {fa(v.events)} رویداد {v.projectionMatchesReplay ? 'دقیقاً برابر' : 'متفاوت از'} داده زنده است · تکراری: {fa(v.duplicates)}</p></Card>}
    <Card><p className="text-[16px] font-black">آخرین رویدادها</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-[13px]"><thead><tr className="text-right text-[var(--pencil)]"><th className="py-1 text-right">#</th><th className="text-right">نوع</th><th className="text-right">منبع</th><th className="text-right">زمان</th><th className="text-right">فیلدها</th></tr></thead>
        <tbody>{(ev?.items || []).map(e => <tr key={e.eventId || e.seq} className="border-t border-[var(--rule)]"><td className="py-1.5">{fa(e.seq)}</td><td dir="ltr" className="text-right font-mono">{e.type}</td><td>{e.source}</td><td>{jDate(e.occurredAt)}</td><td dir="ltr" className="text-right text-[var(--pencil)]">{(e.payloadKeys || []).join(', ')}</td></tr>)}</tbody></table></div>
      <p className="mt-3 text-[13px] text-[var(--pencil)]">محتوای خام رویدادها (پاسخ‌ها، یادداشت‌ها) اینجا نشان داده نمی‌شود؛ فقط نام فیلدها.</p>
    </Card>
  </div>;
}
