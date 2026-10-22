// SS 12 — «امروز»: the first of the five primary sections (Blueprint §5). Top: what the SERVER knows about today
// (/api/today, Asia/Tehran day, last 7 days) + the offline queue state. Below: the personal cockpit (Home) as before.
import { useCallback, useEffect, useState } from 'react';
import { call, errFa, newKey } from '../shell/api.js';
import * as Q from '../shell/outbox.js';
import { Btn, Card, fa, jWeekday } from '@ss/ui/ui.jsx';
import Home from './Home.jsx';
import { PaceCard } from './Pace.jsx';

const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2.5 text-[16px] outline-none focus:border-[var(--ink)]';
const digits = v => String(v).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\D/g, '');

export function ServerToday({ unified, queue, refreshQueue }) {
  const [t, setT] = useState(null); const [err, setErr] = useState(''); const [open, setOpen] = useState(false);
  const [f, setF] = useState({ minutes: '', tests: '', correct: '', wrong: '', topic: '' }); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const load = useCallback(() => call('/api/today').then(x => { setT(x); setErr(''); }).catch(e => setErr(errFa(e))), []);
  useEffect(() => { load(); }, [load, queue?.sent]);
  const uid = unified.user.id;
  const quick = async e => {
    e.preventDefault(); setBusy(true); setMsg('');
    const body = { minutes: +digits(f.minutes), tests: +digits(f.tests || 0), correct: +digits(f.correct || 0), wrong: +digits(f.wrong || 0), topic: f.topic.trim(), at: new Date().toISOString(), timed: true };
    await Q.put({ key: newKey('quick'), userId: uid, createdAt: new Date().toISOString(), tries: 0, body });
    const r = await Q.flush(uid); await refreshQueue(); await load(); setBusy(false);
    if (r.rejected) setMsg('سرور این ثبت را نپذیرفت؛ عددها را بررسی کن (دقیقه ۱ تا ۶۰۰، تست ۰ تا ۵۰۰، درست+غلط ≤ تست).');
    else if (r.offline) setMsg('آفلاین هستی؛ در صف ماند و با برگشتن اینترنت خودکار فرستاده می‌شود.');
    else { setMsg('ثبت شد.'); setF({ minutes: '', tests: '', correct: '', wrong: '', topic: '' }); setOpen(false); }
  };
  const week = t?.week || []; const max = Math.max(60, ...week.map(d => d.minutes));
  const today = t?.today;
  return (
    <Card className="mb-8 overflow-hidden !p-0">
      <div className="grid gap-0 md:grid-cols-[1fr_auto]">
        <div className="p-5 sm:p-6">
          <p className="text-[14px] font-bold text-[var(--ink)]">ثبت‌شده روی سرور · به وقت تهران</p>
          {err ? <p className="mt-2 text-[15px] text-[var(--bad)]">{err}</p> :
            <p className="mt-1 text-[40px] font-black leading-[1.05] tracking-[-0.02em] sm:text-[48px]">{fa(today?.minutes || 0)} <span className="text-[20px] text-[var(--pencil)]">دقیقه</span> · {fa(today?.tests || 0)} <span className="text-[20px] text-[var(--pencil)]">تست</span></p>}
          <p className="mt-1 text-[15px] text-[var(--pencil)]">{today?.sessions ? `${fa(today.sessions)} جلسه امروز` : 'امروز هنوز جلسه‌ای روی سرور نیست'}{t?.streakDays ? ` · ${fa(t.streakDays)} روز پشت سر هم` : ''}</p>
          <p className="mt-3 text-[14px] font-bold" role="status">
            {queue?.pending ? <span className="text-[var(--amber)]">◷ {fa(queue.pending)} ثبت در صف آفلاین؛ با اتصال خودکار فرستاده می‌شود</span>
              : <span className="text-[var(--ok)]">✓ همه ثبت‌های این دستگاه روی سرور است</span>}
            {queue?.rejected ? <span className="mr-2 text-[var(--bad)]"> · {fa(queue.rejected)} ثبت ردشده</span> : null}
          </p>
          <div className="mt-4 flex flex-wrap gap-2"><Btn kind="soft" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'بستن' : '+ ثبت سریع زمان مطالعه'}</Btn></div>
          {open && <form onSubmit={quick} className="mt-4 grid gap-3 sm:grid-cols-5">
            <label className="text-[14px] font-bold sm:col-span-2">مبحث<input className={inp} value={f.topic} onChange={e => setF({ ...f, topic: e.target.value })} placeholder="مثلاً فیزیک · حرکت" required maxLength={120} /></label>
            {[['minutes', 'دقیقه'], ['tests', 'تست'], ['correct', 'درست']].map(([k, l]) => <label key={k} className="text-[14px] font-bold">{l}<input inputMode="numeric" className={inp} value={fa(f[k])} onChange={e => setF({ ...f, [k]: digits(e.target.value) })} required={k === 'minutes'} /></label>)}
            <div className="sm:col-span-5"><Btn type="submit" disabled={busy || !+digits(f.minutes) || !f.topic.trim()}>{busy ? '…' : 'ثبت'}</Btn>{msg && <span className="mr-3 text-[14px]" role="status">{msg}</span>}</div>
          </form>}
          {!open && msg && <p className="mt-2 text-[14px]" role="status">{msg}</p>}
        </div>
        <div className="flex items-end gap-2 border-t-2 border-[var(--rule)] bg-[var(--paper)] px-5 pb-5 pt-4 md:border-r-2 md:border-t-0" aria-label="هفت روز اخیر">
          {week.map(d => (
            <div key={d.date} className="flex w-9 flex-col items-center gap-1.5" title={`${jWeekday(d.date)}: ${fa(d.minutes)} دقیقه`}>
              <div className="flex h-[110px] w-[14px] items-end overflow-hidden rounded-full bg-[var(--wash)]"><div className="w-full rounded-full bg-[var(--ink)] transition-[height] duration-500" style={{ height: `${Math.round((d.minutes / max) * 100)}%` }} /></div>
              <span className={`text-[12px] font-bold ${d.date === t?.date ? 'text-[var(--ink)]' : 'text-[var(--pencil)]'}`}>{jWeekday(d.date).slice(0, 1)}</span>
            </div>))}
        </div>
      </div>
    </Card>
  );
}

export default function Today(P) {
  return <div>{P.unified && <ServerToday unified={P.unified} queue={P.queue} refreshQueue={P.refreshQueue} />}<div className="mb-5"><PaceCard s={P.s} go={P.go} /></div><Home {...P} /></div>;
}
