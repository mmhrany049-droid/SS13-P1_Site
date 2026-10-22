import { useMemo, useState } from 'react';
import { isRestDay, attemptsOf, proposeWeek, addDays, todayStr, capFor, baseCap, isWeekend, isOffDay, weekEnd, dayPressure, weekPressure, pressureTone, planLighten, applyMoves, plannerAdvice, upcomingExams, activeOn, intensityOf, examForecast, daysBetween, planOutline, withOutline, promoteOutline, approveDrafts, catchUpMoves, aheadCandidates, horizonWeeks, daysFromTo } from '@ss/domain/store.js';
import { Btn, Card, Head, Meter, Chip, fa, jWeekday, jDay, jShort } from '@ss/ui/ui.jsx';
import { classBlocks } from '@ss/domain/planning/scheduleLink.js';
import { TaskEditor, DayTimeline } from './Tasks.jsx';

const VERDICT = { ok: ['جا می‌شود', 'var(--ok)'], tight: ['فشرده', 'var(--amber)'], overloaded: ['بیش از ظرفیت', 'var(--bad)'] };
const RELIEF = [[1, 'عادی'], [0.75, 'کمی سبک'], [0.5, 'سبک'], [0.25, 'خیلی سبک']];
const pLabel = p => p > 100 ? 'سنگین‌تر از توان' : p > 80 ? 'پرفشار' : p > 50 ? 'متعادل' : p > 0 ? 'سبک' : 'خالی';

/** Planner (PLN, spec 10): proposal → approve, pressure %, assistant, move & reorder, take-a-day-easier. */
export default function Planner({ s, set, go }) {
  const atts = useMemo(() => attemptsOf(s), [s.sessions, s.books, s.exams]);
  const [info, setInfo] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [focus, setFocus] = useState(null); // day opened in assistant detail
  const [editor, setEditor] = useState(null); // {task?|date}
  const today = todayStr();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const adv = useMemo(() => plannerAdvice(s, days), [s.placements, s.dayRelief, s.exams, s.settings]);
  const drafts = s.placements.filter(p => p.status === 'draft');
  const exams = upcomingExams(s);
  const setPl = f => set(x => ({ ...x, placements: f(x.placements) }));
  const upd = (id, f) => setPl(ps => ps.map(p => p.id === id ? f(p) : p));
  const moveTo = (id, d) => upd(id, p => ({ ...p, date: d, order: 999, moves: (p.moves || 0) + 1 }));
  const reorder = (id, dir) => set(x => { const p = x.placements.find(z => z.id === id); const list = activeOn(x, p.date); const i = list.findIndex(z => z.id === id); const j = i + dir; if (j < 0 || j >= list.length) return x;
    const ids = list.map(z => z.id); [ids[i], ids[j]] = [ids[j], ids[i]]; const ord = Object.fromEntries(ids.map((z, k) => [z, k])); return { ...x, placements: x.placements.map(z => ord[z.id] != null ? { ...z, order: ord[z.id] } : z) }; });
  const propose = () => { const r = proposeWeek(s, atts); setPl(ps => [...ps.filter(p => !(p.status === 'draft' && p.source === 'planner')), ...r.drafts]); setInfo(r); };
  const approveAll = () => set(x => approveDrafts(x));
  const rebuildOutline = () => set(x => withOutline(x, planOutline(x, attemptsOf(x))));
  const outline = s.placements.filter(p => p.status === 'outline');
  const outlineNow = outline.filter(p => p.date <= weekEnd(today));
  const cu = catchUpMoves(s, today);
  const discard = () => { setPl(ps => ps.filter(p => p.status !== 'draft')); setInfo(null); };
  const lighten = (d, v) => set(x => { const y = { ...x, dayRelief: { ...(x.dayRelief || {}), [d]: v } }; if (v === 1) delete y.dayRelief[d]; const r = planLighten(y, d, Math.round(85 * v), days); return applyMoves(y, r.moves); });
  const overdue = s.placements.filter(p => p.status === 'approved' && p.date < today);
  return (
    <div>
      <Head kicker="برنامه" title={<>هفت روز<span className="text-[var(--ink)]"> پیش رو</span></>}>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={propose}>پیشنهاد این هفته</Btn><Btn kind="soft" onClick={() => setEditor({ date: today })}>+ افزودن کار</Btn><Btn kind="ghost" onClick={() => go('days')}>روزهای من</Btn>
          <Btn kind="line" onClick={rebuildOutline}>برنامه {fa(horizonWeeks(s))} هفته بعد</Btn>
          {drafts.length > 0 && <Btn kind="line" onClick={approveAll}>تأیید {fa(drafts.length)} پیش‌نویس</Btn>}
          {drafts.length > 0 && <Btn kind="ghost" onClick={discard}>دور بینداز</Btn>}
        </div>
      </Head>

      {editor && <TaskEditor key={editor.task?.id || editor.date} s={s} set={set} task={editor.task || null} date={editor.date || today} onClose={() => setEditor(null)} />}
      {exams.length > 0 && <div className="mb-5 flex flex-wrap gap-2">{exams.slice(0, 4).map(e => <button key={e.id} type="button" onClick={() => go('exam')} className="rounded-[12px] bg-[var(--card)] px-4 py-2 text-right shadow-[0_1px_0_var(--rule)]"><span className="block text-[13px] font-bold text-[var(--ink)]">آزمون پیش‌رو · {fa(daysBetween(today, e.date))} روز</span><span className="text-[15px] font-black">{e.title}</span></button>)}</div>}

      <p className="-mt-3 mb-4 text-[14px] text-[var(--pencil)]">برنامه این هفته (تا جمعه {jDay(weekEnd(today))}) بعد از تأیید ثابت می‌ماند 🔒؛ هفته‌های بعد پیش‌نویس‌اند و هر وقت خواستی از نو چیده می‌شوند. روزهای جبرانی (از «روزهای من») برای کارهای جامانده یا جلو انداختن کارهای بعدی‌اند؛ هر کار بلند خودکار بین جلسه‌های ۶۰ تا ۱۲۰ دقیقه‌ای تقسیم می‌شود.</p>
      {outlineNow.length > 0 && <Card className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-[16px] font-black">برای این هفته {fa(outlineNow.length)} کار از پیش‌نویس هفته‌های قبل آماده است.</p><Btn onClick={() => set(x => promoteOutline(x))}>بیاور برای تأیید</Btn></Card>}
      <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_380px]">
        <PressureBoard s={s} days={days} adv={adv} focus={focus} setFocus={setFocus} />
        <PlannerAssistant s={s} set={set} days={days} adv={adv} info={info} focus={focus} setFocus={setFocus} lighten={lighten} exams={exams} atts={atts} />
      </div>

      {overdue.length > 0 && <Card className="mb-5"><p className="mb-2 text-[16px] font-black">{fa(overdue.length)} کار انجام‌نشده از روزهای قبل</p>
        <div className="flex flex-wrap gap-2">{cu.moves.length > 0 && <Btn onClick={() => set(x => applyMoves(x, catchUpMoves(x, today).moves))}>انتقال به روز جبرانی ({fa(cu.moves.length)})</Btn>}
          <Btn kind="soft" onClick={() => setPl(ps => ps.map(p => p.status === 'approved' && p.date < today ? { ...p, date: today, moves: (p.moves || 0) + 1 } : p))}>انتقال به امروز</Btn>
          <Btn kind="soft" onClick={() => set(x => { const y = { ...x, placements: x.placements.map(p => p.status === 'approved' && p.date < today ? { ...p, date: today } : p) }; return applyMoves(y, planLighten(y, today, 85, days).moves); })}>پخش در روزهای سبک</Btn>
          <Btn kind="ghost" onClick={() => setPl(ps => ps.map(p => p.status === 'approved' && p.date < today ? { ...p, status: 'skipped' } : p))}>رها کن</Btn></div>
        {overdue.some(p => (p.moves || 0) >= 2) && <p className="mt-2 text-[14px] text-[var(--pencil)]">بعضی کارها دو بار جابه‌جا شده‌اند؛ شاید بهتر است کوچک‌ترشان کنی.</p>}</Card>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {days.map(d => {
          const pr = dayPressure(s, d); const items = pr.items; const ex = exams.find(e => e.date === d);
          return (
            <Card key={d} className={`p-4 ${d === today ? 'outline outline-2 outline-[var(--ink)]' : ''} ${dragId ? 'transition-shadow' : ''}`}
              onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const dp = dragId && s.placements.find(z => z.id === dragId); if (dp && !(dp.deadline && d >= dp.deadline)) moveTo(dragId, d); setDragId(null); }}>
              <div className="mb-1 flex items-baseline justify-between"><p className="text-[17px] font-black">{d === today ? 'امروز' : jWeekday(d)}</p><p className="flex items-center gap-2 text-[14px] text-[var(--pencil)]">{jDay(d)}<button type="button" aria-label="افزودن کار به این روز" className="grid h-7 w-7 place-items-center rounded-full bg-[var(--wash)] font-bold text-[var(--ink)]" onClick={() => setEditor({ date: d })}>+</button></p></div>
              {classBlocks(s, d).length > 0 && <p className="mb-2 rounded-[8px] bg-[var(--wash)] px-2 py-1 text-[12px] text-[var(--pencil)]" title="برنامهٔ رسمی کلاس؛ فقط نمایش">کلاس: {classBlocks(s, d).map(b => `${b.subject} ${b.label}`).join(' · ')}</p>}
              {ex && <p className="mb-2 rounded-[8px] bg-[var(--ink)] px-2 py-1 text-[13px] font-bold text-[var(--paper)]">🎯 {ex.title}</p>}
              {isRestDay(s, d) && <p className="mb-2 rounded-[8px] bg-[var(--wash)] px-2 py-1 text-[13px]"><b>تعطیل</b> · بدون مطالعه</p>}
              {isOffDay(s, d) && !isRestDay(s, d) && <div className="mb-2 rounded-[8px] bg-[var(--wash)] px-2 py-1 text-[13px]"><b>روز جبرانی</b> · برنامه جدید ندارد
                {aheadCandidates(s, d).length > 0 && <select aria-label="جلو انداختن کار" className="mt-1 w-full rounded-[6px] border border-[var(--rule)] bg-[var(--paper)] px-1 text-[13px]" value="" onChange={e => e.target.value && set(x => ({ ...x, placements: x.placements.map(p => p.id === e.target.value ? { ...p, date: d, status: 'approved', order: 999, pulledAhead: true, moves: (p.moves || 0) + 1 } : p) }))}>
                  <option value="">+ کاری از روزهای بعد را جلو بینداز</option>{aheadCandidates(s, d).map(p => <option key={p.id} value={p.id}>{jWeekday(p.date)} {jDay(p.date)}: {p.title}</option>)}</select>}</div>}
              <DayTimeline s={s} d={d} items={items} />
              <div className="mb-1 flex items-center gap-2"><Meter value={pr.pct} max={100} h={7} color={pressureTone(pr.pct)} /><span className="w-11 shrink-0 text-left text-[14px] font-black tabular-nums" style={{ color: pressureTone(pr.pct) }}>{fa(pr.pct)}٪</span></div>
              <div className="mb-3 flex items-center justify-between text-[13px] text-[var(--pencil)]"><span>{pLabel(pr.pct)} · {fa(items.length)} کار · {fa(pr.minutes)} دقیقه</span>
                <select aria-label={`سبکی ${jWeekday(d)}`} className="rounded-[8px] border border-[var(--rule)] bg-[var(--paper)] px-1 py-0.5 text-[13px]" value={s.dayRelief?.[d] ?? 1} onChange={e => lighten(d, +e.target.value)}>{RELIEF.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
              {!items.length ? <p className="text-[14px] text-[var(--pencil)]">{isOffDay(s, d) ? 'خالی؛ کار جامانده یا جلوافتاده اینجا می‌آید' : 'خالی؛ کار را اینجا بکش'}</p> :
                <ul className="grid gap-2">{items.map((p, i) => (
                  <li key={p.id} draggable={p.status !== 'done'} onDragStart={() => setDragId(p.id)} onDragEnd={() => setDragId(null)}
                    className={`rounded-[10px] p-2.5 text-[14px] leading-6 ${p.status === 'draft' ? 'border-2 border-dashed border-[var(--ink-faint)]' : 'bg-[var(--wash)]'} ${p.status === 'done' ? 'opacity-60' : 'cursor-grab'} ${dragId === p.id ? 'opacity-40' : ''}`}>
                    <div className="flex items-start gap-2">
                      {p.status !== 'draft' && <input type="checkbox" aria-label={`انجام شد: ${p.title}`} className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]" checked={p.status === 'done'} disabled={p.date > today}
                        onChange={() => upd(p.id, q => ({ ...q, status: q.status === 'done' ? 'approved' : 'done', doneAt: q.status === 'done' ? null : new Date().toISOString() }))} />}
                      <span role="button" tabIndex={0} title="ویرایش" onClick={() => setEditor({ task: p })} onKeyDown={e => e.key === 'Enter' && setEditor({ task: p })} className={`flex-1 cursor-pointer hover:underline ${p.status === 'done' ? 'line-through' : ''}`}>{p.locked ? '🔒 ' : ''}{p.at ? `${fa(p.at)} · ` : ''}{p.title}<span className="text-[var(--pencil)]">، {fa(p.minutes)} دقیقه</span>{p.related ? <span className="mr-1 text-[12px] text-[var(--ink)]">· مرتبط</span> : null}</span>
                    </div>
                    {p.status !== 'done' && <div className="mt-1.5 flex items-center gap-x-2.5 text-[13px] font-bold">
                      {p.status === 'draft' && <button type="button" className="text-[var(--ink)]" onClick={() => upd(p.id, q => ({ ...q, status: 'approved' }))}>تأیید</button>}
                      <button type="button" aria-label="بالاتر" className="text-[var(--pencil)] disabled:opacity-30" disabled={i === 0} onClick={() => reorder(p.id, -1)}>▲</button>
                      <button type="button" aria-label="پایین‌تر" className="text-[var(--pencil)] disabled:opacity-30" disabled={i === items.length - 1} onClick={() => reorder(p.id, 1)}>▼</button>
                      <select aria-label="انتقال به روز" className="min-w-0 max-w-[110px] flex-1 rounded-[6px] border border-[var(--rule)] bg-[var(--paper)] px-1 text-[13px] font-normal" value="" onChange={e => e.target.value && moveTo(p.id, e.target.value)}>
                        <option value="">انتقال…</option>{days.filter(x => x !== d).map(x => <option key={x} value={x} disabled={p.deadline && x >= p.deadline}>{x === today ? 'امروز' : jWeekday(x)} ({fa(dayPressure(s, x).pct)}٪)</option>)}</select>
                      <button type="button" aria-label="حذف" className="mr-auto text-[16px] text-[var(--pencil)]" onClick={() => setPl(ps => ps.filter(z => z.id !== p.id))}>×</button>
                    </div>}
                    {p.reason && <details className="mt-1 text-[13px] text-[var(--pencil)]"><summary className="cursor-pointer font-bold">چرا؟</summary>{p.reason}</details>}
                  </li>))}</ul>}
            </Card>);
        })}
      </div>
      <OutlineWeeks s={s} set={set} outline={outline} today={today} rebuild={rebuildOutline} />
      <p className="mt-4 text-[14px] text-[var(--pencil)]">کار را بکش و روی روز دیگر رها کن، یا از «انتقال…» استفاده کن. کادر خط‌چین = پیش‌نویس. <button type="button" className="font-bold text-[var(--ink)] underline" onClick={() => go('days')}>ساعت‌ها و هدف هر روز</button></p>
    </div>
  );
}

/** Mini program: tasks count + pressure per day and for the week. */
function PressureBoard({ s, days, adv, focus, setFocus }) {
  const w = adv.week; const today = todayStr();
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[15px] font-bold">فشار هفته</p><p className="text-[52px] font-black leading-none" style={{ color: pressureTone(w.pct) }}>{fa(w.pct)}<span className="text-[22px]">٪</span></p></div>
        <p className="text-[15px] text-[var(--pencil)]">{fa(w.count)} کار · {pLabel(w.pct)}<br />۱۰۰٪ یعنی یک روز کامل با سقف عادی.</p>
      </div>
      <div className="grid grid-cols-7 gap-2" role="list" aria-label="فشار روزها">
        {days.map((d, i) => { const x = w.days[i]; const h = Math.min(120, x.pct); return (
          <button key={d} type="button" role="listitem" onClick={() => setFocus(focus === d ? null : d)} aria-pressed={focus === d} className={`flex flex-col items-center gap-1 rounded-[10px] p-1.5 ${focus === d ? 'bg-[var(--wash)]' : 'hover:bg-[var(--wash)]'}`}>
            <span className="text-[13px] font-black tabular-nums" style={{ color: pressureTone(x.pct) }}>{fa(x.pct)}٪</span>
            <div className="relative flex h-[96px] w-full items-end overflow-hidden rounded-[6px] bg-[var(--wash)]">
              {x.limitPct < 100 && <div className="absolute inset-x-0 border-t-2 border-dashed border-[var(--graphite)] opacity-50" style={{ bottom: `${x.limitPct * 96 / 120}px` }} />}
              <div className="w-full rounded-t-[4px]" style={{ height: `${h * 96 / 120}px`, background: pressureTone(x.pct) }} />
            </div>
            <span className="text-[13px] font-bold">{d === today ? 'امروز' : jWeekday(d).replace('‌شنبه', '').slice(0, 5)}</span>
            <span className="text-[12px] text-[var(--pencil)]">{fa(x.items.length)} کار</span>
          </button>); })}
      </div>
      <p className="mt-3 text-[13px] text-[var(--pencil)]">خط‌چین = سقفِ روزی که سبک‌تر گرفته‌ای. روی هر روز بزن تا دستیار جزئیاتش را بگوید.</p>
    </Card>
  );
}

/** Dedicated planner assistant: overview → click for detail → move suggestions with one-tap apply. */
function PlannerAssistant({ s, set, days, adv, info, focus, setFocus, lighten, exams }) {
  const [open, setOpen] = useState(false);
  const [easy, setEasy] = useState('');
  const w = adv.week; const today = todayStr();
  const name = d => d === today ? 'امروز' : jWeekday(d);
  const overview = w.count === 0 ? 'هنوز برای هفت روز آینده کاری نداری. «پیشنهاد بده» را بزن تا از روی آزمون‌ها، مرورها و مباحث ضعیف برنامه بچینم.'
    : `این هفته ${fa(w.count)} کار داری و فشار کلی ${fa(w.pct)}٪ است (${pLabel(w.pct)}). سنگین‌ترین روز ${name(adv.heaviest.d)} با ${fa(adv.heaviest.pct)}٪ است.${exams[0] ? ` نزدیک‌ترین آزمون «${exams[0].title}» است.` : ''}`;
  const fd = focus ? dayPressure(s, focus) : null;
  const byKind = fd ? Object.entries(fd.items.reduce((a, p) => { a[p.kind || 'کار'] = (a[p.kind || 'کار'] || 0) + p.minutes; return a; }, {})) : [];
  return (
    <Card className="bg-[var(--graphite)] text-[var(--paper)]">
      <p className="mb-2 flex items-center gap-2 text-[16px] font-black"><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--ink)]">✉</span>دستیار برنامه</p>
      <p className="text-[15px] leading-7">{overview}</p>
      {info && <p className="mt-2 text-[14px] leading-6 opacity-80">پیشنهاد جدید: {VERDICT[info.verdict][0]}، نیاز به {fa(Math.round(info.ratio * 100))}٪ وقت آزاد.{info.dropped.length ? ` جا نشد: ${info.dropped.slice(0, 2).map(d => d.title).join('، ')}.` : ''}</p>}
      {w.count > 0 && <button type="button" className="mt-2 text-[14px] font-bold text-[var(--ink-faint)] underline" onClick={() => setOpen(o => !o)}>{open ? 'بستن جزئیات' : 'توضیح جزئی‌تر'}</button>}
      {open && <ul className="mt-2 grid gap-1 text-[14px] leading-6">{days.map((d, i) => { const x = w.days[i]; return <li key={d}><button type="button" className="text-right hover:underline" onClick={() => setFocus(d)}><b>{name(d)}:</b> {fa(x.items.length)} کار، {fa(x.minutes)} دقیقه، فشار {fa(x.pct)}٪{x.limitPct < 100 ? ` (سقف ${fa(x.limitPct)}٪)` : ''}</button></li>; })}</ul>}
      {fd && <div className="mt-3 rounded-[12px] bg-[rgba(255,255,255,.08)] p-3 text-[14px] leading-6">
        <p className="font-black">{name(focus)} · {fa(fd.pct)}٪</p>
        {fd.items.length ? <p>{byKind.map(([k, m]) => `${k} ${fa(m)} دقیقه`).join('، ')}. کارهای سنگین (درسنامه، تست نزده، آزمون) فشار بیشتری از مرور و تحلیل خطا دارند.</p> : <p>این روز خالی است.</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">{RELIEF.map(([v, t]) => <button key={v} type="button" onClick={() => lighten(focus, v)} className={`rounded-full border px-2.5 py-0.5 text-[13px] font-bold ${(s.dayRelief?.[focus] ?? 1) === v ? 'border-[var(--paper)] bg-[var(--paper)] text-[var(--graphite)]' : 'border-[rgba(255,255,255,.35)]'}`}>{t}</button>)}</div>
      </div>}
      {adv.suggestions.length > 0 && <div className="mt-4"><p className="mb-2 text-[15px] font-black">پیشنهاد جابه‌جایی</p>
        <ul className="grid gap-2">{adv.suggestions.slice(0, 4).map(sg => <li key={sg.id} className="rounded-[12px] bg-[rgba(255,255,255,.08)] p-3 text-[14px] leading-6">
          <p><b>{name(sg.day)}:</b> {sg.text}</p>
          {sg.moves && <p className="opacity-80">{sg.moves.slice(0, 3).map(m => `«${m.title.split(':')[0]}» ← ${name(m.to)}`).join('، ')}{sg.moves.length > 3 ? '…' : ''}</p>}
          {sg.moves && <button type="button" className="mt-1 rounded-full bg-[var(--ink)] px-3 py-1 text-[13px] font-bold" onClick={() => set(x => applyMoves(x, sg.moves))}>اعمال</button>}
          {sg.reorder && <button type="button" className="mt-1 rounded-full bg-[var(--ink)] px-3 py-1 text-[13px] font-bold" onClick={() => set(x => { const list = activeOn(x, sg.day); const bySub = {}; list.forEach(p => (bySub[p.subject || '-'] ||= []).push(p)); const out = []; while (Object.values(bySub).some(a => a.length)) for (const a of Object.values(bySub)) if (a.length) out.push(a.shift()); const ord = Object.fromEntries(out.map((p, k) => [p.id, k])); return { ...x, placements: x.placements.map(p => ord[p.id] != null ? { ...p, order: ord[p.id] } : p) }; })}>مخلوط کن</button>}
        </li>)}</ul></div>}
      <div className="mt-4 border-t border-[rgba(255,255,255,.15)] pt-3"><p className="mb-2 text-[15px] font-black">کدام روز را راحت‌تر بگیرم؟</p>
        <div className="flex gap-2"><select aria-label="روز" className="min-w-0 flex-1 rounded-[10px] bg-[var(--paper)] px-2 py-2 text-[14px] text-[var(--graphite)]" value={easy} onChange={e => setEasy(e.target.value)}><option value="">انتخاب روز</option>{days.map(d => <option key={d} value={d}>{name(d)} ({fa(dayPressure(s, d).pct)}٪)</option>)}</select>
          <button type="button" disabled={!easy} className="rounded-[10px] bg-[var(--ink)] px-3 text-[14px] font-bold disabled:opacity-40" onClick={() => { lighten(easy, 0.5); setFocus(easy); }}>سبک کن</button></div>
        <p className="mt-2 text-[13px] opacity-70">کارهای کم‌اولویت آن روز به روزهای خلوت‌تر می‌روند (قبل از موعد آزمونشان).</p></div>
    </Card>
  );
}

/** Tentative plan for the next weeks (rebuilt freely; becomes this week's draft when its week arrives). */
function OutlineWeeks({ s, set, outline, today, rebuild }) {
  const later = outline.filter(p => p.date > weekEnd(today));
  const weeks = [...new Set(later.map(p => p.week || p.date))].sort();
  return (
    <Card className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[17px] font-black">هفته‌های بعد (پیش‌نویس)</p><Btn kind="soft" onClick={rebuild}>از نو بچین</Btn></div>
      {!weeks.length ? <p className="text-[15px] text-[var(--pencil)]">هنوز برنامه‌ای برای هفته‌های بعد نیست. «برنامه هفته‌های بعد» را بزن؛ آزمون‌های پیش‌رو با هم دیده می‌شوند و مباحث مشترک و مرتبط کنار هم چیده می‌شوند.</p> :
        <div className="grid gap-4">{weeks.map(w => { const ds = daysFromTo(w, addDays(w, 6)); const items = later.filter(p => (p.week || p.date) === w); const exams = upcomingExams(s).filter(e => ds.includes(e.date)); return (
          <details key={w} className="rounded-[12px] bg-[var(--wash)] p-3"><summary className="cursor-pointer text-[15px] font-black">هفته {jDay(w)} تا {jDay(addDays(w, 6))} · {fa(items.length)} کار · {fa(items.reduce((a, p) => a + p.minutes, 0))} دقیقه{exams.length ? ` · 🎯 ${exams.map(e => e.title).join('، ')}` : ''}</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{ds.filter(d => !isOffDay(s, d)).map(d => <div key={d}><p className="text-[13px] font-bold text-[var(--ink)]">{jWeekday(d)} {jDay(d)}</p>
              <ul className="mt-1 grid gap-1">{items.filter(p => p.date === d).map(p => <li key={p.id} className="flex items-start gap-1 rounded-[8px] border border-dashed border-[var(--ink-faint)] bg-[var(--card)] px-2 py-1 text-[13px]"><span className="flex-1">{p.title}، {fa(p.minutes)}′{p.related ? ' · مرتبط' : ''}</span><button type="button" aria-label="حذف" className="text-[var(--pencil)]" onClick={() => set(x => ({ ...x, placements: x.placements.filter(z => z.id !== p.id) }))}>×</button></li>)}</ul></div>)}</div>
          </details>); })}</div>}
    </Card>
  );
}
