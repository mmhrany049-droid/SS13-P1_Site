import { useEffect, useMemo, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { dailyQuests } from './rewards.js';
import { attemptsOf, bookById, questsFor, rewardSummary, examForecast, setMode, todayStr, reviewQueue, parseLocal, upcomingExams } from '@ss/domain/store.js';
import { ReasonList } from './Practice.jsx';
import { Btn, Card, Meter, Empty, fa, pct, jDate } from '@ss/ui/ui.jsx';

export default function Home({ s, set, go }) {
  const atts = useMemo(() => attemptsOf(s), [s]);
  const r = rewardSummary(s); const rq = useMemo(() => reviewQueue(s, atts), [s, atts]); const quests = dailyQuests(s, atts);
  const exam = upcomingExams(s)[0];
  const fc = useMemo(() => exam ? examForecast(s, exam, atts, { runs: 1500 }) : null, [exam, atts]);
  const open = s.errorTasks.filter(t => t.status === 'open');
  const [task, setTask] = useState(null);
  const todayItems = s.placements.filter(p => p.date === todayStr() && (p.status === 'approved' || p.status === 'done'));
  const markDone = id => set(x => ({ ...x, placements: x.placements.map(p => p.id === id ? { ...p, status: p.status === 'done' ? 'approved' : 'done', doneAt: p.status === 'done' ? null : new Date().toISOString() } : p) }));
  const empty = !s.sessions.length;
  return (
    <div>
      <header className="mb-8 grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-end">
        <div>
          <p className="mb-2 text-[15px] font-bold text-[var(--ink)]">{jDate(new Date().toISOString())}</p>
          <h1 className="text-[44px] font-black leading-[1.05] tracking-[-0.03em] sm:text-[64px]">{exam ? <>{fa(fc?.daysLeft ?? 0)} روز تا<br /><span className="text-[var(--ink)]">{exam.title}</span></> : <>امروز چند تست<br /><span className="text-[var(--ink)]">می‌زنی؟</span></>}</h1>
          {exam && <Countdown date={exam.date} />}
          <div className="mt-6 flex flex-wrap gap-3"><Btn className="min-h-[52px] px-6 text-[17px]" onClick={() => go('practice')}>📝 ثبت تست</Btn><Btn kind="line" className="min-h-[52px]" onClick={() => go('assistant')}>از دستیار بپرس</Btn></div>
        </div>
        {fc && <Card><p className="text-[15px] font-bold">شاخص آمادگی</p><p className="text-[56px] font-black leading-none text-[var(--ink)]">{fa(Math.round(fc.RI))}<span className="text-[20px] text-[var(--pencil)]"> / ۱۰۰</span></p>
          <p className="mt-3 text-[15px]">پیش‌بینی کل: <b>{fa(Math.round(fc.sim.total.P10))} تا {fa(Math.round(fc.sim.total.P90))}٪</b></p>
          <p className="text-[14px] text-[var(--pencil)]">نخوانده {fa(fc.gaps.untaught.length)}، نزده {fa(fc.gaps.untested.length)}، در حال فراموشی {fa(fc.gaps.fading.length)}</p>
          <Btn kind="soft" className="mt-4" onClick={() => go('exam')}>آمادگی و برنامه</Btn></Card>}
      </header>
      {(s.announcements || []).some(a => !a.read) && <Card className="mb-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[16px] font-black">📣 اطلاعیه مرکز</p><Btn kind="ghost" className="min-h-[32px] px-3 text-[13px]" onClick={() => set(x => ({ ...x, announcements: x.announcements.map(a => ({ ...a, read: true })) }))}>خواندم</Btn></div>
        {s.announcements.filter(a => !a.read).slice(0, 3).map(a => <p key={a.id} className="mt-2 text-[15px]"><b>{a.title}</b>: {a.text}</p>)}</Card>}
      {s.books.some(b => b.active === false && b.origin === 'hub') && <p className="mb-5 rounded-[12px] bg-[var(--wash)] p-3 text-[15px]">{fa(s.books.filter(b => b.active === false && b.origin === 'hub').length)} کتاب تست از مرکز رسیده و منتظر فعال شدن است. <button type="button" className="font-bold text-[var(--ink)] underline" onClick={() => go('books')}>دیدن</button></p>}
      {empty && <Card className="mb-5"><Empty title="هنوز جلسه‌ای ثبت نشده" text="اولین تست‌ها را ثبت کن، یا برای دیدن همه قابلیت‌ها با داده نمونه (۳۴ جلسه، یک آزمون در ۹ روز آینده) شروع کن. داده نمونه جدا از داده‌های واقعی‌ات نگه داشته می‌شود." action={<div className="flex gap-2"><Btn onClick={() => go('practice')}>ثبت اولین تست</Btn><Btn kind="line" onClick={() => set(() => setMode('demo'))}>داده نمونه</Btn></div>} /></Card>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <p className="mb-3 text-[16px] font-black">کارهای امروز</p>
          <ul className="grid gap-2">
            {todayItems.map(it => <li key={it.id}><label className={`flex cursor-pointer items-start gap-3 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px] ${it.status === 'done' ? 'opacity-60' : ''}`}><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]" checked={it.status === 'done'} onChange={() => markDone(it.id)} /><span className={it.status === 'done' ? 'line-through' : ''}>{it.title} <span className="text-[var(--pencil)]">، {fa(it.minutes)} دقیقه</span></span></label></li>)}
            {rq.dueNow.length > 0 && <li><button type="button" onClick={() => go('review')} className="w-full rounded-[10px] bg-[var(--wash)] px-3 py-2 text-right text-[14px]">🔁 {fa(rq.dueNow.length)} کارت مرور سررسید</button></li>}
            {open.map(t => { const ses = s.sessions.find(x => x.id === t.sessionId); const b = ses && bookById(s, ses.bookId); return ses && <li key={t.id}><button type="button" onClick={() => setTask(task === t.id ? null : t.id)} className="w-full rounded-[10px] bg-[var(--wash)] px-3 py-2 text-right text-[14px]">🧩 تحلیل خطای جلسه {b.subject} ({fa(Object.keys(ses.answers).length)} تست)</button>
              {task === t.id && <div className="mt-2 max-h-[40vh] overflow-auto rounded-[10px] border-2 border-[var(--rule)] p-3"><ReasonList ses={ses} wrong={Object.keys(ses.answers).map(Number).filter(n => ['W', 'B'].includes(E.correct(ses.answers[n], b.keys[n] ?? null)))} res={n => E.correct(ses.answers[n], b.keys[n] ?? null)} setReason={(n, rid) => set(x => ({ ...x, sessions: x.sessions.map(z => z.id !== ses.id ? z : { ...z, reasonAt: { ...(z.reasonAt || {}), [n]: new Date().toISOString() }, reasons: { ...z.reasons, [n]: (z.reasons[n] || []).includes(rid) ? z.reasons[n].filter(q => q !== rid) : [...(z.reasons[n] || []), rid] } }) }))} />
                <Btn className="w-full" onClick={() => { set(x => ({ ...x, errorTasks: x.errorTasks.map(z => z.id === t.id ? { ...z, status: 'done', doneAt: new Date().toISOString() } : z) })); setTask(null); }}>بستن (+۵ امتیاز)</Btn></div>}</li>; })}
            {!todayItems.length && !open.length && !rq.dueNow.length && <li className="text-[15px] text-[var(--pencil)]">برای امروز برنامه تأییدشده‌ای نداری. <button type="button" className="font-bold text-[var(--ink)] underline" onClick={() => go('planner')}>بساز</button></li>}
          </ul>
        </Card>
        <Card>
          <p className="mb-3 text-[16px] font-black">ماموریت‌ها</p>
          <ul className="grid gap-3">{quests.map(q => <li key={q.id}><div className="mb-1 flex justify-between gap-2 text-[14px]"><span>{q.done ? '✅ ' : ''}{q.title}</span><span className="shrink-0 text-[var(--pencil)]">{fa(Math.min(q.progress, q.target))}/{fa(q.target)}</span></div><Meter value={Math.min(q.progress, q.target)} max={q.target} color={q.done ? 'var(--ok)' : 'var(--ink)'} h={6} /></li>)}</ul>
        </Card>
        <Card>
          <p className="mb-1 text-[16px] font-black">سطح {fa(r.level)}، {fa(r.coins)} سکه</p>
          <Meter value={r.xp - r.prev} max={r.next - r.prev} />
          <p className="mt-2 text-[14px] text-[var(--pencil)]">{fa(r.next - r.xp)} امتیاز تا سطح بعد، {fa(r.consistency)} روز فعال از ۱۴</p>
          <Btn kind="soft" className="mt-4" onClick={() => go('rewards')}>فروشگاه پاداش</Btn>
        </Card>
      </div>
      {s.demo && <p className="mt-6 text-[14px] text-[var(--pencil)]">داری داده نمونه را می‌بینی؛ جدا از داده‌های واقعی‌ات نگه داشته می‌شود. <button type="button" className="font-bold text-[var(--ink)] underline" onClick={() => set(() => setMode('real'))}>برگشت به داده‌های خودم</button></p>}
    </div>
  );
}

function Countdown({ date }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, parseLocal(date) + 8 * 36e5 - now); // exams start 08:00 local
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  return <p className="mt-3 flex gap-4 text-[15px] text-[var(--pencil)]" aria-label="شمارش معکوس">{[[d, 'روز'], [h, 'ساعت'], [m, 'دقیقه']].map(([v, t]) => <span key={t}><b className="text-[22px] font-black tabular-nums text-[var(--graphite)]">{fa(v)}</b> {t}</span>)}</p>;
}
