// دانش‌آموزان: accounts (email/password), devices from 7.1, status, verification, last activity; bulk e-mail; per-student summary drawer.
import { useEffect, useMemo, useState } from 'react';
import { api, errText } from './adminApi.js';
import { Btn, Card, Chip, Head, Empty, fa, jDate, jShort } from '@ss/ui/ui.jsx';
import { GRADE_FA, STREAMS } from '@ss/domain/curriculum.js';
import { canDo } from './perms.js';
import { inp } from './theme.js';

const ago = iso => { if (!iso) return '—'; const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? 'امروز' : d === 1 ? 'دیروز' : `${fa(d)} روز پیش`; };
export default function Students({ me, go, offline, h, refreshCounts }) {
  const [list, setList] = useState(null); const [q, setQ] = useState(''); const [flt, setFlt] = useState('all'); const [sel, setSel] = useState([]); const [open, setOpen] = useState(null); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const load = () => api('/api/admin/students').then(r => setList(r.items)).catch(e => setErr(errText(e)));
  useEffect(() => { if (!offline) load(); }, []);
  const rows = useMemo(() => (list || []).filter(s => {
    const t = q.trim().toLowerCase(); if (t && ![s.name, s.email, s.phone, s.id].some(x => String(x || '').toLowerCase().includes(t))) return false;
    if (flt === 'inactive') return !s.lastPackAt || Date.now() - Date.parse(s.lastPackAt) > 7 * 864e5;
    if (flt === 'unverified') return s.email && !s.emailVerified; if (flt === 'suspended') return s.status === 'suspended'; if (flt === 'noemail') return !s.email; if (flt === 'unread') return s.unread > 0; return true;
  }).sort((a, z) => String(z.lastPackAt || z.registeredAt || '').localeCompare(String(a.lastPackAt || a.registeredAt || ''))), [list, q, flt]);
  const act = async (s, a, confirmText) => { if (confirmText && !confirm(confirmText)) return; setErr(''); setMsg(''); try { await api(`/api/admin/students/${s.id}/${a}`, { method: 'POST', body: {} }); setMsg({ suspend: 'تعلیق شد؛ همه نشست‌هایش بسته شد.', activate: 'فعال شد.', reset: 'اتصال دستگاه بازنشانی شد.', verify: 'ایمیل تأییدشده علامت خورد.', 'send-reset': `کد ساختن رمز جدید به ${s.email} فرستاده شد.`, delete: 'حذف شد.' }[a]); load(); refreshCounts?.(); if (a === 'delete') setOpen(null); } catch (e) { setErr(errText(e)); } };
  if (offline) return <div><Head kicker="مرکز" title="دانش‌آموزان" /><Card><Empty title="بدون سرور" text="حساب‌های دانش‌آموزان فقط وقتی سرور مرکز روشن است مدیریت می‌شود. در حالت فایل از «گروه‌بندی افراد» استفاده کن." /></Card></div>;
  const write = canDo(me, 'students:write');
  const F = [['all', 'همه'], ['inactive', 'غیرفعال ۷ روز'], ['unread', 'پیام تازه'], ['unverified', 'ایمیل تأییدنشده'], ['noemail', 'بدون ایمیل'], ['suspended', 'تعلیق‌شده']];
  const emailSel = () => { sessionStorage.setItem('ss-admin-compose', JSON.stringify({ studentIds: sel, subject: '', text: 'سلام {نام}،\n\n' })); go('mail'); };
  return <div>
    <Head kicker="مرکز" title="دانش‌آموزان"><div className="flex flex-wrap gap-2"><a className="inline-flex min-h-[42px] items-center rounded-[10px] bg-[var(--wash)] px-4 text-[15px] font-bold text-[var(--ink-deep)]" href="/api/admin/students.csv">خروجی اکسل (CSV)</a></div></Head>
    <div className="mb-4 flex flex-wrap items-center gap-2"><input aria-label="جستجو" className={inp + ' mt-0 max-w-[280px]'} placeholder="جستجو: نام، ایمیل، شماره…" value={q} onChange={e => setQ(e.target.value)} />{F.map(([k, t]) => <Chip key={k} active={flt === k} onClick={() => setFlt(k)}>{t}</Chip>)}</div>
    {msg && <p role="status" className="mb-3 rounded-[10px] bg-[var(--wash)] p-3 text-[14px] font-bold text-[var(--ok)]">{msg}</p>}
    {err && <p role="alert" className="mb-3 rounded-[10px] bg-[var(--wash)] p-3 text-[14px] font-bold text-[var(--bad)]">{err}</p>}
    {sel.length > 0 && <div className="sticky top-[60px] z-10 mb-3 flex flex-wrap items-center gap-2 rounded-[12px] bg-[var(--ink)] p-2 pr-4 text-[var(--paper)]"><b>{fa(sel.length)} نفر انتخاب شد</b><Btn kind="soft" className="mr-auto" onClick={emailSel}>✉ ایمیل به انتخاب‌شده‌ها</Btn><Btn kind="ghost" className="text-[var(--paper)] hover:bg-white/10" onClick={() => setSel([])}>لغو</Btn></div>}
    {!list ? <p>در حال بارگذاری…</p> : !rows.length ? <Card><Empty title={list.length ? 'کسی با این فیلتر نیست' : 'هنوز دانش‌آموزی ثبت‌نام نکرده'} text={list.length ? '' : 'آدرس سایت دانش‌آموز را بده؛ هر کس با ایمیل ثبت‌نام کند اینجا می‌آید.'} /></Card> :
      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <Card className="overflow-x-auto p-0"><table className="w-full min-w-[640px] text-right text-[14px]">
          <thead><tr className="text-[13px] text-[var(--pencil)]"><th className="w-10 p-3"><input type="checkbox" aria-label="انتخاب همه" className="h-4 w-4 accent-[var(--ink)]" checked={sel.length === rows.length} onChange={e => setSel(e.target.checked ? rows.map(r => r.id) : [])} /></th><th>نام</th><th>ایمیل</th><th>پایه</th><th>آخرین همگام‌سازی</th><th>وضعیت</th></tr></thead>
          <tbody>{rows.map(s => <tr key={s.id} className={`cursor-pointer border-t border-[var(--rule)] hover:bg-[var(--wash)] ${open === s.id ? 'bg-[var(--wash)]' : ''}`} onClick={() => setOpen(s.id)}>
            <td className="p-3" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`انتخاب ${s.name}`} className="h-4 w-4 accent-[var(--ink)]" checked={sel.includes(s.id)} onChange={e => setSel(x => e.target.checked ? [...x, s.id] : x.filter(y => y !== s.id))} /></td>
            <td className="py-2.5"><b>{s.name || '—'}</b>{s.unread > 0 && <span className="mr-2 rounded-full bg-[var(--ink)] px-2 text-[11px] text-[var(--paper)]">{fa(s.unread)} پیام</span>}{s.classes?.length > 0 && <span className="block text-[12px] text-[var(--pencil)]">{s.classes.join('، ')}</span>}</td>
            <td dir="ltr" className="text-left text-[13px]">{s.email || <span className="text-[var(--pencil)]">—</span>}{s.email && !s.emailVerified && <span className="mr-1 text-[var(--amber)]" title="تأییدنشده">•</span>}</td>
            <td>{GRADE_FA[s.grade] || ''} {STREAMS[s.stream] || ''}</td><td>{ago(s.lastPackAt)}</td>
            <td>{s.status === 'suspended' ? <span className="font-bold text-[var(--bad)]">تعلیق</span> : s.hasPassword ? 'حساب' : s.online ? 'دستگاه' : 'فایل'}{s.telegram ? ' · ✈' : ''}</td></tr>)}</tbody></table></Card>
        <div>{open ? <Drawer s={(list || []).find(x => x.id === open)} write={write} act={act} go={go} /> : <Card><p className="text-[15px] text-[var(--pencil)]">روی یک نفر بزن تا خلاصه درس، پیام‌ها و کارهای حساب را ببینی.</p></Card>}</div>
      </div>}
  </div>;
}

function Drawer({ s, write, act, go }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); if (s) api(`/api/admin/students/${s.id}/summary`).then(setD).catch(() => setD({})); }, [s?.id]);
  if (!s) return null;
  const sm = d?.summary;
  return <Card className="pop-in sticky top-[72px]">
    <p className="text-[22px] font-black">{s.name}</p>
    <p className="text-[13px] text-[var(--pencil)]" dir="ltr">{s.email || 'بدون ایمیل'}{s.phone ? ` · ${s.phone}` : ''}</p>
    <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">{[['ثبت‌نام', jShort(s.registeredAt)], ['آخرین ورود', ago(s.lastLoginAt)], ['آخرین بسته', ago(s.lastPackAt)], ['پشتیبان ابری', s.backupAt ? ago(s.backupAt) : '—']].map(([k, v]) => <div key={k} className="rounded-[8px] bg-[var(--wash)] px-2 py-1.5"><span className="text-[var(--pencil)]">{k}</span><b className="block">{v || '—'}</b></div>)}</div>
    {d === null ? <p className="mt-3 text-[14px]">…</p> : sm ? <div className="mt-3 rounded-[10px] outline outline-2 outline-[var(--rule)] p-3 text-[14px] leading-7">
      <p className="font-black">خلاصه درس (از آخرین همگام‌سازی)</p>
      {sm.today && <p>امروز: {fa(sm.today.items?.length || 0)} کار ({fa(sm.today.items?.filter(x => x.done).length || 0)} انجام‌شده)</p>}
      {sm.last7 && <p>۷ روز اخیر: {fa(sm.last7.tests || 0)} تست{sm.last7.percent != null ? ` · ${fa(sm.last7.percent)}٪` : ''}</p>}
      <p>مرور معوق: {fa(sm.reviewsDue || 0)}{sm.rewards ? ` · سطح ${fa(sm.rewards.level)}` : ''}</p>
      {sm.exams?.length > 0 && <p>آزمون بعدی: {sm.exams[0].title} · {fa(sm.exams[0].daysLeft)} روز دیگر{sm.exams[0].P50 != null ? ` · پیش‌بینی ${fa(sm.exams[0].P50)}٪` : ''}</p>}
      {sm.habits?.length > 0 && <p>عادت‌ها: {sm.habits.map(x => `${x.title}${x.adherence != null ? ` ${fa(x.adherence)}٪` : ''}`).join('، ')}</p>}
    </div> : <p className="mt-3 text-[14px] text-[var(--pencil)]">هنوز خلاصه‌ای نفرستاده (رضایت «تلگرام/خلاصه» یا همگام‌سازی لازم است).</p>}
    {d?.dossier && <div className="mt-3 rounded-[10px] bg-[var(--wash)] p-3 text-[14px] leading-7"><p className="font-black">پرونده تحصیلی</p>
      <p>{d.dossier.identity?.school || '—'}{d.dossier.identity?.city ? ` · ${d.dossier.identity.city}` : ''} · معدل {d.dossier.education?.gpa || '—'} · هدف {d.dossier.education?.targetMajor || d.dossier.education?.targetUni || '—'}{d.dossier.education?.targetRank ? ` (رتبه ${d.dossier.education.targetRank})` : ''}</p>
      <p>برنامه‌ریزی: {d.dossier.planning?.styleFa || '—'} · {d.dossier.planning?.studyTimeFa || ''} · هدف روزانه {d.dossier.planning?.dailyGoalH || '—'} ساعت · هفتگی {fa(Math.round((d.dossier.planning?.weeklyTargetMin || 0) / 60))} ساعت</p>
      <p>تعهد: خودارزیابی {fa(d.dossier.commitment?.selfRating || 0)}/۵ · پایبندی ۲۸ روز {d.dossier.commitment?.last28?.adherence != null ? fa(d.dossier.commitment.last28.adherence) + '٪' : '—'} · {fa(d.dossier.commitment?.last28?.activeDays || 0)} روز فعال</p>
      {d.dossier.education?.mockProviders?.length > 0 && <p>آزمون‌ها: {d.dossier.education.mockProviders.join('، ')}</p>}</div>}
    {d?.results?.length > 0 && <p className="mt-2 text-[13px] text-[var(--pencil)]">{fa(d.results.length)} نتیجه آزمون مشترک</p>}
    <div className="mt-4 grid gap-2">
      <Btn onClick={() => { sessionStorage.setItem('ss-admin-thread', s.id); go('messages'); }}>✉ پیام / پاسخ</Btn>
      {write && <div className="flex flex-wrap gap-2">
        {s.email && <Btn kind="soft" onClick={() => act(s, 'send-reset')}>فرستادن کد رمز جدید</Btn>}
        {s.email && !s.emailVerified && <Btn kind="ghost" onClick={() => act(s, 'verify')}>تأیید دستی ایمیل</Btn>}
        {s.status === 'suspended' ? <Btn kind="soft" onClick={() => act(s, 'activate')}>فعال کردن</Btn> : <Btn kind="ghost" onClick={() => act(s, 'suspend', `حساب «${s.name}» تعلیق شود؟ تا وقتی فعالش نکنی نمی‌تواند وارد شود.`)}>تعلیق</Btn>}
        {s.online && !s.hasPassword && <Btn kind="ghost" onClick={() => act(s, 'reset', 'اتصال دستگاه این دانش‌آموز بازنشانی شود؟ باید دوباره به مرکز وصل شود.')}>بازنشانی دستگاه</Btn>}
        <Btn kind="ghost" className="text-[var(--bad)]" onClick={() => act(s, 'delete', `«${s.name}» و همه داده‌هایش (بسته، پشتیبان، پیام‌ها) از مرکز حذف شود؟ این کار برگشت ندارد.`)}>حذف</Btn>
      </div>}
    </div>
  </Card>;
}
