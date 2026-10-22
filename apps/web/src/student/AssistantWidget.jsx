// v8 — the small assistant button on every page. Opens a window with: «کارهای من» (newcomer checklist + today),
// «این صفحه» (how this page works), «گفتگو» (chat + FAQ), «تست‌ها» (personality/profile questionnaires, inline).
import { useEffect, useMemo, useState } from 'react';
import { AssistantChat } from './Assistant.jsx';
import { PAGE_GUIDE, checklist } from './guide.js';
import { INSTRUMENTS, profileStatus, profileInsights, saveInstrument, isComplete, scoreInstrument } from './instruments.js';
import { todayStr } from '@ss/domain/store.js';
import { Btn, Meter, fa } from '@ss/ui/ui.jsx';

const TABS = [['todo', 'کارهای من'], ['page', 'این صفحه'], ['chat', 'گفتگو'], ['tests', 'تست‌ها']];

export default function AssistantWidget({ s, set, go, page }) {
  const [open, setOpen] = useState(false); const [tab, setTab] = useState('todo');
  const c = useMemo(() => checklist(s), [s]);
  const fresh = c.done < c.total && !s.account?.widgetSeen;
  useEffect(() => { const k = e => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const toggle = () => { setOpen(o => !o); if (!s.account?.widgetSeen) set(x => ({ ...x, account: { ...x.account, widgetSeen: true } })); };
  const goto = p => { if (p === 'tests') { setTab('tests'); return; } go(p); };
  return <>
    <button type="button" onClick={toggle} aria-expanded={open} aria-label={open ? 'بستن دستیار' : 'باز کردن دستیار'}
      className="fixed bottom-24 left-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-[var(--ink)] text-[20px] text-[var(--paper)] shadow-[0_10px_24px_-8px_rgba(126,15,51,.6)] transition hover:scale-105 md:bottom-6">
      {open ? '×' : '؟'}{!open && (fresh || c.done < c.total) && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--amber)] px-1 text-[11px] font-bold">{fa(c.total - c.done)}</span>}
      {!open && fresh && <span className="absolute inset-0 animate-ping rounded-full bg-[var(--ink)] opacity-30" aria-hidden />}
    </button>
    {open && <div role="dialog" aria-label="دستیار" className="page-in fixed inset-x-0 bottom-0 z-40 flex h-[82vh] flex-col overflow-hidden rounded-t-[20px] bg-[var(--card)] shadow-[0_24px_60px_-18px_rgba(60,20,35,.55)] outline outline-2 outline-[var(--ink)] sm:inset-x-auto sm:bottom-24 sm:left-4 sm:h-[min(620px,calc(100vh-130px))] sm:w-[400px] sm:rounded-[20px] md:bottom-20">
      <div className="flex items-center gap-3 bg-[var(--ink)] px-4 py-3 text-[var(--paper)]">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-[18px] font-black">؟</span>
        <div className="min-w-0 flex-1"><p className="text-[16px] font-black leading-tight">دستیار SS</p><p className="truncate text-[12px] opacity-85">{c.done < c.total ? `شروع: ${fa(c.done)} از ${fa(c.total)} قدم` : 'همه قدم‌های شروع انجام شد'}</p></div>
        <button type="button" aria-label="بستن" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-[20px] hover:bg-white/15">×</button>
      </div>
      <div className="flex border-b-2 border-[var(--rule)]" role="tablist">{TABS.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 py-2.5 text-[13px] font-bold ${tab === k ? 'border-b-[3px] border-[var(--ink)] text-[var(--ink)]' : 'text-[var(--pencil)]'}`}>{t}</button>)}</div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'todo' && <Todo s={s} c={c} goto={p => { goto(p); if (p !== 'tests') setOpen(false); }} />}
        {tab === 'page' && <PageHelp page={page} goChat={() => setTab('chat')} />}
        {tab === 'chat' && <AssistantChat s={s} set={set} go={p => { go(p); setOpen(false); }} page={page} compact onTab={t => setTab(t === 'todo' ? 'todo' : t)} />}
        {tab === 'tests' && <Tests s={s} set={set} go={p => { go(p); setOpen(false); }} />}
      </div>
    </div>}
  </>;
}

function Todo({ s, c, goto }) {
  const today = s.placements.filter(p => p.date === todayStr() && (p.status === 'approved' || p.status === 'done'));
  return <div className="p-4">
    <div className="mb-1 flex items-baseline justify-between"><p className="text-[16px] font-black">قدم‌های شروع</p><span className="text-[13px] text-[var(--pencil)]">{fa(c.done)} از {fa(c.total)}</span></div>
    <Meter value={c.done} max={c.total} h={8} />
    <ul className="mt-3 grid gap-1.5">{c.items.map(x => <li key={x.id}><button type="button" onClick={() => !x.done && goto(x.go)} disabled={x.done} className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-right text-[14px] ${x.done ? 'text-[var(--pencil)]' : x.id === c.next?.id ? 'bg-[var(--wash)] font-bold' : 'hover:bg-[var(--wash)]'}`}>
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-[12px] ${x.done ? 'border-[var(--ok)] bg-[var(--ok)] text-white' : 'border-[var(--ink-faint)]'}`}>{x.done ? '✓' : ''}</span>
      <span className={`flex-1 ${x.done ? 'line-through' : ''}`}>{x.t}</span>{!x.done && <span className="text-[var(--ink)]">←</span>}</button></li>)}</ul>
    <p className="mb-2 mt-5 text-[16px] font-black">کارهای امروز</p>
    {!today.length ? <p className="text-[14px] text-[var(--pencil)]">برای امروز کار تأییدشده‌ای نداری. <button type="button" className="font-bold text-[var(--ink)] underline" onClick={() => goto('planner')}>برنامه هفته</button></p> :
      <ul className="grid gap-1.5">{today.map(p => <li key={p.id} className={`rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px] ${p.status === 'done' ? 'line-through opacity-60' : ''}`}>{p.at ? `${fa(p.at)} · ` : ''}{p.title} <span className="text-[var(--pencil)]">({fa(p.minutes)}′)</span></li>)}</ul>}
  </div>;
}

function PageHelp({ page, goChat }) {
  const g = PAGE_GUIDE[page] || PAGE_GUIDE.home;
  return <div className="p-4"><p className="text-[13px] font-bold text-[var(--ink)]">الان اینجایی</p><p className="text-[22px] font-black">{g.t}</p><p className="mt-2 text-[15px] leading-7">{g.what}</p>
    {g.steps?.length > 0 && <ol className="mt-4 grid gap-2">{g.steps.map((x, i) => <li key={i} className="flex gap-3 text-[14px] leading-6"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[12px] font-bold text-[var(--paper)]">{fa(i + 1)}</span>{x}</li>)}</ol>}
    {g.tips?.length > 0 && <div className="mt-4 rounded-[12px] bg-[var(--wash)] p-3 text-[14px] leading-6">{g.tips.map((t, i) => <p key={i}>💡 {t}</p>)}</div>}
    <Btn kind="soft" className="mt-5 w-full" onClick={goChat}>سؤال دیگری دارم</Btn></div>;
}

/** Inline questionnaire runner (one item at a time; keyboard 1–5). Reused by «نیمرخ من». */
export function InstrumentRunner({ ins, s, set, onDone }) {
  const [ans, setAns] = useState(() => ({ ...(s.profile?.instruments?.[ins.id]?.answers || {}) })); const [i, setI] = useState(0);
  const item = ins.items[i]; const labels = ins.scale.labels_fa;
  const pick = v => { const a = { ...ans, [item.n]: v }; setAns(a); if (i < ins.items.length - 1) setI(i + 1); else { set(x => saveInstrument(x, ins.id, a)); onDone?.(); } };
  useEffect(() => { const k = e => { const d = +e.key; if (d >= 1 && d <= 5) pick(d); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  return <div><div className="mb-2 flex items-center justify-between text-[13px] text-[var(--pencil)]"><span>{ins.emoji} {ins.title}</span><span>{fa(i + 1)} از {fa(ins.items.length)}</span></div><Meter value={i} max={ins.items.length} h={6} />
    <p className="mt-4 min-h-[56px] text-[17px] font-bold leading-8">{item.fa}</p>
    <div className="mt-3 grid gap-1.5">{labels.map((l, j) => <button key={j} type="button" onClick={() => pick(j + 1)} className={`flex min-h-[42px] items-center gap-3 rounded-[12px] border-2 px-3 text-right text-[14px] font-bold ${ans[item.n] === j + 1 ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--rule)] hover:border-[var(--ink)]'}`}><span className="grid h-6 w-6 place-items-center rounded-full border-2 border-current text-[12px]">{fa(j + 1)}</span>{l}</button>)}</div>
    {i > 0 && <button type="button" className="mt-3 text-[13px] font-bold text-[var(--pencil)] underline" onClick={() => setI(i - 1)}>سؤال قبلی</button>}</div>;
}
export function InstrumentResult({ s, ins }) {
  const r = s.profile?.instruments?.[ins.id]; if (!r) return null; const sc = r.scores || scoreInstrument(ins, r.answers);
  return <div className="grid gap-2">{Object.entries(sc).map(([k, v]) => <div key={k}><div className="flex justify-between text-[13px]"><span>{v.name}</span><b>{fa(Math.round(v.score))}</b></div><div className="relative h-[8px] rounded-full bg-[var(--wash)]"><div className="absolute inset-y-0 rounded-full bg-[var(--ink-faint)]" style={{ right: `${v.lo}%`, width: `${v.hi - v.lo}%` }} /><div className="absolute top-1/2 h-3 w-[4px] -translate-y-1/2 rounded bg-[var(--ink)]" style={{ right: `calc(${v.score}% - 2px)` }} /></div></div>)}</div>;
}

function Tests({ s, set, go }) {
  const [run, setRun] = useState(null); const ps = profileStatus(s); const ins = profileInsights(s);
  if (run) return <div className="p-4"><InstrumentRunner ins={run} s={s} set={set} onDone={() => setRun(null)} /><button type="button" className="mt-4 block text-[13px] font-bold text-[var(--bad)]" onClick={() => setRun(null)}>انصراف</button></div>;
  return <div className="p-4">
    <p className="text-[16px] font-black">تست‌های شخصیت و نیمرخ</p><p className="mb-3 text-[13px] leading-6 text-[var(--pencil)]">{fa(ps.done)} از {fa(ps.total)} · غیرتشخیصی، فقط روی همین دستگاه. نتیجه‌ها برنامه، پاداش و پیشنهادهای دستیار را شخصی می‌کنند.</p>
    <ul className="grid gap-2">
      {[['ipip', '🧩', 'تست شخصیت پنج‌عاملی', '۲۰ سؤال · ۴ دقیقه', ps.ipip, () => go('profile')], ['habits', '♧', 'پرسشنامه عادت و تست‌زدن', '۲۵ جمله · ۵ دقیقه', ps.habits, () => go('habits')]].map(([k, e, t, d, done, fn]) =>
        <li key={k}><button type="button" onClick={fn} className="flex w-full items-center gap-3 rounded-[12px] bg-[var(--wash)] p-3 text-right"><span className="text-[22px]">{e}</span><span className="flex-1"><b className="block text-[14px]">{t}</b><span className="text-[12px] text-[var(--pencil)]">{d}</span></span><span className="text-[13px] font-bold" style={{ color: done ? 'var(--ok)' : 'var(--ink)' }}>{done ? '✓ پر شده' : 'شروع ←'}</span></button></li>)}
      {INSTRUMENTS.map(x => { const done = !!s.profile?.instruments?.[x.id]; return <li key={x.id}><button type="button" onClick={() => setRun(x)} className="flex w-full items-center gap-3 rounded-[12px] bg-[var(--wash)] p-3 text-right"><span className="text-[22px]">{x.emoji}</span><span className="flex-1"><b className="block text-[14px]">{x.title}</b><span className="text-[12px] text-[var(--pencil)]">{fa(x.items.length)} سؤال · {fa(x.minutes)} دقیقه · {x.about}</span></span><span className="text-[13px] font-bold" style={{ color: done ? 'var(--ok)' : 'var(--ink)' }}>{done ? '✓ دوباره' : 'شروع ←'}</span></button></li>; })}
    </ul>
    {ins.length > 0 && <div className="mt-5"><p className="mb-2 text-[15px] font-black">پیشنهادهای شخصی از نتیجه‌ها</p><ul className="grid gap-2">{ins.map((x, i) => <li key={i} className="rounded-[12px] outline outline-2 outline-[var(--rule)] p-3 text-[14px] leading-6">{x.t}{x.src && <span className="block text-[12px] text-[var(--pencil)]">پژوهش: {x.src}</span>}<button type="button" className="mt-1 block text-[13px] font-bold text-[var(--ink)]" onClick={() => go(x.go)}>برو ←</button></li>)}</ul></div>}
  </div>;
}
