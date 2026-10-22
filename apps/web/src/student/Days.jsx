// «روزهای من» (7.1): every weekday and every specific date is designed on its own —
// when I CAN study, when I WANT to study, how much I WANT to study, plus fixed/personal blocks.
import { useMemo, useState } from 'react';
import * as SC from '@ss/domain/schedule.js';
import { todayStr, addDays, uid } from '@ss/domain/store.js';
import { Btn, Card, Chip, Head, Meter, fa, jWeekday, jDay, jShort } from '@ss/ui/ui.jsx';

const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px] font-normal';
const tIn = 'w-[96px] rounded-[8px] border-2 border-[var(--rule)] bg-[var(--paper)] px-2 py-1 text-center text-[14px]';
const REPEAT = { once: 'یک‌بار', weekly: 'هر هفته', biweekly: 'دو هفته یک‌بار' };
const dayName = d => SC.WEEKDAYS_FA.find(w => w[0] === d)?.[1] || '';
const hrs = m => fa(Math.round(m / 6) / 10);
const nextDateOf = wd => { let t = todayStr(); for (let i = 0; i < 7 && SC.dow(t) !== wd; i++) t = addDays(t, 1); return t; };

export default function Days({ s, set, go }) {
  const [tab, setTab] = useState('week');
  const [wd, setWd] = useState(SC.dow(todayStr()) === 4 || SC.dow(todayStr()) === 5 ? SC.dow(todayStr()) : 6);
  const [date, setDate] = useState(todayStr());
  const plan = SC.dayPlanOf(s);
  const setPlan = f => set(x => ({ ...x, settings: { ...x.settings, dayPlan: f(SC.dayPlanOf(x)) } }));
  return (
    <div>
      <Head kicker="برنامه" title="روزهای من"><Btn kind="soft" onClick={() => go('planner')}>← برنامه هفته</Btn></Head>
      <div className="mb-5 flex flex-wrap gap-2">{[['week', 'هفته معمول'], ['dates', 'تاریخ‌های خاص'], ['events', 'کلاس‌ها و کارهای ثابت'], ['rules', 'قانون جلسه‌ها']].map(([k, t]) => <Chip key={k} active={tab === k} onClick={() => setTab(k)}>{t}</Chip>)}</div>
      {tab === 'week' && <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <div className="mb-4 flex flex-wrap gap-1.5">{SC.WEEKDAYS_FA.map(([d, n]) => { const c = plan.template[d] || {}; return <button type="button" key={d} onClick={() => setWd(d)} aria-pressed={wd === d} className={`min-w-[86px] rounded-[12px] border-2 px-3 py-2 text-right text-[14px] ${wd === d ? 'border-[var(--ink)] bg-[var(--wash)]' : 'border-[var(--rule)]'}`}><b className="block">{n}</b><span className="text-[12px] text-[var(--pencil)]">{c.mode === 'off' ? 'تعطیل' : `${hrs(c.target || 0)} ساعت${c.mode === 'catchup' ? ' · جبرانی' : ''}`}</span></button>; })}</div>
          <DayEditor key={wd} cfg={plan.template[wd]} onChange={c => setPlan(p => ({ ...p, template: { ...p.template, [wd]: c } }))} />
          <CopyTo from={wd} onCopy={ds => setPlan(p => { const t = { ...p.template }; for (const d of ds) t[d] = JSON.parse(JSON.stringify(p.template[wd])); return { ...p, template: t }; })} />
        </Card>
        <DayPreview s={s} d={nextDateOf(wd)} title={`${dayName(wd)} بعدی، ${jDay(nextDateOf(wd))}`} />
      </div>}
      {tab === 'dates' && <Dates s={s} set={set} plan={plan} setPlan={setPlan} date={date} setDate={setDate} />}
      {tab === 'events' && <Events s={s} set={set} />}
      {tab === 'rules' && <Rules s={s} set={set} />}
    </div>
  );
}

/** One day's design: mode, wanted minutes, windows (prefer / can). */
export function DayEditor({ cfg = { mode: 'normal', target: 240, windows: [] }, onChange }) {
  const up = p => onChange({ ...cfg, ...p });
  const ws = cfg.windows || [];
  const upW = (i, p) => up({ windows: ws.map((w, j) => j === i ? { ...w, ...p } : w) });
  const can = ws.reduce((a, w) => a + Math.max(0, (SC.toMin(w.to) ?? 0) - (SC.toMin(w.from) ?? 0)), 0);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">{Object.entries(SC.DAY_MODES).map(([k, [t, d]]) => <button type="button" key={k} onClick={() => up({ mode: k })} aria-pressed={cfg.mode === k} className={`rounded-[12px] border-2 px-3 py-2 text-right ${cfg.mode === k ? 'border-[var(--ink)] bg-[var(--wash)]' : 'border-[var(--rule)]'}`}><b className="block text-[14px]">{t}</b><span className="text-[12px] text-[var(--pencil)]">{d}</span></button>)}</div>
      {cfg.mode !== 'off' && <>
        <label className="text-[15px] font-bold">چقدر می‌خواهم درس بخوانم؟
          <div className="mt-1 flex flex-wrap items-center gap-3"><input type="range" min={0} max={1200} step={30} value={cfg.target || 0} onChange={e => up({ target: +e.target.value })} className="w-64 accent-[var(--ink)]" /><b className="text-[22px] text-[var(--ink)]">{hrs(cfg.target || 0)} ساعت</b>
            {(cfg.target || 0) > 840 && <span className="text-[13px] font-bold text-[var(--amber)]">بیش از ۱۴ ساعت: استراحت و خواب را فراموش نکن</span>}
            {can > 0 && (cfg.target || 0) > can && <span className="text-[13px] font-bold text-[var(--bad)]">بیشتر از کل بازه‌ها ({hrs(can)} ساعت) است</span>}</div></label>
        <div>
          <p className="mb-1 text-[15px] font-bold">بازه‌های ساعتی</p>
          <p className="mb-2 text-[13px] text-[var(--pencil)]">«می‌خواهم» = ساعت دلخواه مطالعه، اول پر می‌شود. «می‌توانم» = اگر لازم شد. کلاس‌ها و کارهای ثابت خودکار از این بازه‌ها کم می‌شوند.</p>
          <div className="grid gap-2">{ws.map((w, i) => <div key={i} className={`flex flex-wrap items-center gap-2 rounded-[10px] px-2 py-2 text-[14px] ${w.type === 'prefer' ? 'bg-[var(--wash)]' : 'border-2 border-dashed border-[var(--rule)]'}`}>
            <select aria-label="نوع بازه" className="rounded-[8px] border-2 border-[var(--rule)] bg-[var(--paper)] px-2 py-1 font-bold" value={w.type} onChange={e => upW(i, { type: e.target.value })}><option value="prefer">می‌خواهم</option><option value="can">می‌توانم</option></select>
            از <input type="time" aria-label="از" className={tIn} value={w.from} onChange={e => upW(i, { from: e.target.value })} /> تا <input type="time" aria-label="تا" className={tIn} value={w.to} onChange={e => upW(i, { to: e.target.value })} />
            <span className="text-[12px] text-[var(--pencil)]">{SC.toMin(w.to) > SC.toMin(w.from) ? `${hrs(SC.toMin(w.to) - SC.toMin(w.from))} ساعت` : 'نامعتبر'}</span>
            <button type="button" aria-label="حذف بازه" className="mr-auto px-2 text-[18px] text-[var(--bad)]" onClick={() => up({ windows: ws.filter((_, j) => j !== i) })}>×</button></div>)}</div>
          <div className="mt-2 flex flex-wrap gap-2"><Btn kind="soft" className="min-h-[34px] px-3 text-[13px]" onClick={() => up({ windows: [...ws, { from: ws.at(-1)?.to || '16:00', to: SC.toHHMM(Math.min(1440, (SC.toMin(ws.at(-1)?.to) ?? 960) + 120)), type: ws.length ? 'can' : 'prefer' }] })}>+ بازه</Btn>
            {[['صبح', '08:00', '12:00'], ['بعدازظهر', '15:00', '19:00'], ['شب', '19:30', '22:30'], ['تمام روز', '05:00', '23:59']].map(([t, a, z]) => <Btn key={t} kind="ghost" className="min-h-[34px] px-3 text-[13px]" onClick={() => up({ windows: [...ws, { from: a, to: z, type: 'prefer' }] })}>+ {t}</Btn>)}</div>
        </div>
      </>}
    </div>
  );
}
function CopyTo({ from, onCopy }) {
  const [ds, setDs] = useState([]);
  return <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t-2 border-[var(--rule)] pt-3 text-[14px]"><span className="font-bold">همین را برای</span>{SC.WEEKDAYS_FA.filter(([d]) => d !== from).map(([d, n]) => <Chip key={d} active={ds.includes(d)} onClick={() => setDs(x => x.includes(d) ? x.filter(y => y !== d) : [...x, d])} className="min-h-[32px] text-[13px]">{n}</Chip>)}<Btn kind="soft" disabled={!ds.length} className="min-h-[34px] px-3 text-[13px]" onClick={() => { onCopy(ds); setDs([]); }}>کپی کن</Btn></div>;
}

/** Real preview of one date: sessions cut around events, wish vs. what fits. */
export function DayPreview({ s, d, title }) {
  const b = SC.dayBudget(s, d);
  const blocks = [...b.sessions.map(x => ({ ...x, kind: 'session' })), ...b.events.map(e => ({ ...e, kind: 'event' }))].sort((a, z) => SC.toMin(a.from) - SC.toMin(z.from));
  return (
    <Card className="content-start">
      <p className="text-[16px] font-black">{title || `${jWeekday(d)} ${jDay(d)}`}</p>
      <p className="mb-3 text-[13px] text-[var(--pencil)]">{b.cfg.custom ? 'برای این تاریخ جدا چیده شده' : 'از هفته معمول'}{b.cfg.note ? ` · ${b.cfg.note}` : ''}</p>
      {b.cfg.mode === 'off' ? <p className="text-[15px]">تعطیل؛ برنامه درسی ندارد.</p> : <>
        <div className="mb-1 flex justify-between text-[14px]"><span>می‌خواهم {hrs(b.target)} ساعت</span><b style={{ color: b.studyMin + 30 < b.target ? 'var(--bad)' : 'var(--ok)' }}>جا شد {hrs(b.studyMin)} ساعت</b></div>
        <Meter value={b.studyMin} max={Math.max(1, b.target)} color={b.studyMin + 30 < b.target ? 'var(--bad)' : 'var(--ok)'} />
        {b.studyMin + 30 < b.target && <p className="mt-2 text-[13px] text-[var(--bad)]">بازه‌های آزاد برای هدفت کم است؛ یک بازه «می‌توانم» اضافه کن یا هدف را کم کن.</p>}
        {b.cfg.mode === 'catchup' && <p className="mt-2 text-[13px] text-[var(--pencil)]">روز جبرانی: برنامه‌ریز کار جدید نمی‌چیند؛ این جلسه‌ها برای کارهای جامانده و جلو انداختن است.</p>}
        <ol className="mt-3 grid gap-1.5">{blocks.map((x, i) => x.kind === 'event'
          ? <li key={i} className="rounded-[8px] bg-[var(--graphite)] px-3 py-1.5 text-[13px] text-[var(--paper)]">{fa(x.from)}–{fa(x.to)} · {x.kind === 'mock' ? '🎯' : SC.EVENT_KINDS[x.kind]?.[1] || '•'} {x.title}</li>
          : <li key={i} className={`rounded-[8px] px-3 py-1.5 text-[13px] ${x.type === 'prefer' ? 'bg-[var(--ink)] text-[var(--paper)]' : 'border-2 border-[var(--ink-faint)]'}`}><b>{fa(x.from)}–{fa(x.to)}</b> · جلسه {fa(x.minutes)} دقیقه{x.type === 'can' ? ' (بازه «می‌توانم»)' : ''}</li>)}
          {!blocks.length && <li className="text-[14px] text-[var(--pencil)]">هیچ جلسه‌ای جا نشد (بازه آزاد کمتر از {fa(SC.sessionRules(s.settings).min)} دقیقه).</li>}</ol>
      </>}
    </Card>
  );
}

function Dates({ s, set, plan, setPlan, date, setDate }) {
  const days = Array.from({ length: 35 }, (_, i) => addDays(todayStr(), i));
  const cfg = SC.dayCfg(s, date); const o = plan.overrides?.[date];
  const [draft, setDraft] = useState(null); const cur = draft?.d === date ? draft.c : { mode: cfg.mode, target: cfg.target, windows: cfg.windows, note: cfg.note || '' };
  const save = () => { setPlan(p => ({ ...p, overrides: { ...(p.overrides || {}), [date]: cur } })); setDraft(null); };
  const reset = () => { setPlan(p => { const ov = { ...(p.overrides || {}) }; delete ov[date]; return { ...p, overrides: ov }; }); setDraft(null); };
  // forget overrides in the past (housekeeping)
  const past = Object.keys(plan.overrides || {}).filter(d => d < addDays(todayStr(), -30));
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <Card>
        <div className="mb-4 grid grid-cols-7 gap-1.5 text-center text-[12px]">{['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map(x => <span key={x} className="font-bold text-[var(--pencil)]">{x}</span>)}
          {Array.from({ length: (SC.dow(days[0]) + 1) % 7 }, (_, i) => <span key={'p' + i} />)}
          {days.map(d => { const c = SC.dayCfg(s, d); const ev = SC.eventsOn(s, d).length; return <button type="button" key={d} onClick={() => { setDate(d); setDraft(null); }} aria-pressed={date === d}
            className={`rounded-[10px] border-2 px-1 py-1.5 ${date === d ? 'border-[var(--ink)] bg-[var(--wash)]' : c.custom ? 'border-[var(--ink-faint)]' : 'border-transparent hover:bg-[var(--wash)]'}`}>
            <b className="block text-[14px]">{jShort(d).split('/').pop()}</b><span className={`block text-[11px] ${c.mode === 'off' ? 'text-[var(--bad)]' : 'text-[var(--pencil)]'}`}>{c.mode === 'off' ? 'تعطیل' : c.mode === 'catchup' ? 'جبرانی' : `${hrs(c.target)}س`}</span>{ev > 0 && <span className="text-[10px]">{'•'.repeat(Math.min(3, ev))}</span>}</button>; })}</div>
        <div className="rounded-[12px] border-2 border-[var(--rule)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[17px] font-black">{jWeekday(date)} {jDay(date)}</p>{o && <span className="rounded-full bg-[var(--wash)] px-3 py-0.5 text-[13px] font-bold text-[var(--ink-deep)]">اختصاصی</span>}</div>
          <DayEditor key={date + (o ? 'o' : 't')} cfg={cur} onChange={c => setDraft({ d: date, c: { ...cur, ...c } })} />
          <label className="mt-3 block text-[14px] font-bold">یادداشت این روز<input className={inp} placeholder="مثلاً مهمانی، امتحان مدرسه…" value={cur.note || ''} onChange={e => setDraft({ d: date, c: { ...cur, note: e.target.value } })} /></label>
          <div className="mt-3 flex flex-wrap gap-2"><Btn disabled={!draft} onClick={save}>ذخیره برای همین تاریخ</Btn>{o && <Btn kind="ghost" onClick={reset}>برگشت به هفته معمول</Btn>}</div>
        </div>
        {past.length > 0 && <button type="button" className="mt-3 text-[13px] font-bold text-[var(--pencil)] underline" onClick={() => setPlan(p => { const ov = { ...p.overrides }; past.forEach(d => delete ov[d]); return { ...p, overrides: ov }; })}>پاک کردن {fa(past.length)} تنظیم قدیمی</button>}
      </Card>
      <div className="grid content-start gap-4">
        <DayPreview s={draft ? { ...s, settings: { ...s.settings, dayPlan: { ...plan, overrides: { ...(plan.overrides || {}), [date]: cur } } } } : s} d={date} />
        <QuickEvent s={s} set={set} date={date} />
      </div>
    </div>
  );
}
function QuickEvent({ s, set, date }) {
  const [f, setF] = useState({ title: '', from: '17:00', to: '18:00', kind: 'personal' });
  const list = (s.events || []).filter(e => e.repeat === 'once' && e.date === date);
  return <Card><p className="mb-2 text-[15px] font-black">کار شخصی همین روز</p>
    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input aria-label="عنوان" className={inp + ' mt-0'} placeholder="مثلاً دندانپزشکی" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /><input type="time" className={tIn} value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /><input type="time" className={tIn} value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></div>
    <Btn kind="soft" className="mt-2 min-h-[36px] px-3 text-[13px]" disabled={!f.title.trim() || !(SC.toMin(f.to) > SC.toMin(f.from))} onClick={() => { set(x => ({ ...x, events: [...(x.events || []), { id: uid(), ...f, title: f.title.trim(), repeat: 'once', date, active: true }] })); setF({ ...f, title: '' }); }}>+ افزودن</Btn>
    {list.length > 0 && <ul className="mt-2 grid gap-1 text-[13px]">{list.map(e => <li key={e.id} className="flex justify-between rounded-[8px] bg-[var(--wash)] px-2 py-1"><span>{fa(e.from)}–{fa(e.to)} {e.title}</span><button type="button" className="text-[var(--bad)]" onClick={() => set(x => ({ ...x, events: x.events.filter(z => z.id !== e.id) }))}>×</button></li>)}</ul>}</Card>;
}

const blankEv = () => ({ title: '', kind: 'sport', repeat: 'weekly', date: todayStr(), weekdays: [], from: '17:00', to: '18:00', until: '', buffer: 15 });
/** Personal tasks, sport, music class, school… one-off, weekly or every two weeks. */
export function Events({ s, set }) {
  const [f, setF] = useState(blankEv()); const [err, setErr] = useState(''); const [editId, setEditId] = useState(null);
  const evs = (s.events || []).filter(e => e.repeat !== 'once' || e.date >= todayStr());
  const save = () => {
    setErr(''); if (!f.title.trim()) return setErr('عنوان را بنویس.');
    if (!(SC.toMin(f.to) > SC.toMin(f.from))) return setErr('ساعت پایان باید بعد از شروع باشد.');
    if (f.repeat !== 'once' && !f.weekdays.length) return setErr('حداقل یک روز هفته را انتخاب کن.');
    const ev = { ...f, title: f.title.trim(), until: f.until || null, active: true, buffer: +f.buffer || 0 };
    set(x => ({ ...x, events: editId ? x.events.map(e => e.id === editId ? { ...e, ...ev } : e) : [...(x.events || []), { id: uid(), ...ev }] }));
    setF(blankEv()); setEditId(null);
  };
  const when = e => e.repeat === 'once' ? `${jWeekday(e.date)} ${jDay(e.date)}` : `${REPEAT[e.repeat]}: ${(e.weekdays || []).map(dayName).join('، ')}`;
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <p className="mb-1 text-[16px] font-black">{editId ? 'ویرایش' : 'افزودن'} کار ثابت یا شخصی</p>
        <p className="mb-3 text-[14px] text-[var(--pencil)]">ورزش، کلاس موسیقی، آموزشگاه، مدرسه… زمانشان از بازه‌های مطالعه کم می‌شود و جلسه‌ها دورشان چیده می‌شوند.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[14px] font-bold">عنوان<input className={inp} placeholder="مثلاً باشگاه فوتبال" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
          <label className="text-[14px] font-bold">نوع<select className={inp} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{Object.entries(SC.EVENT_KINDS).map(([k, [t, i]]) => <option key={k} value={k}>{i} {t}</option>)}</select></label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">{Object.entries(REPEAT).map(([k, t]) => <Chip key={k} active={f.repeat === k} onClick={() => setF({ ...f, repeat: k })}>{t}</Chip>)}</div>
        {f.repeat !== 'once' && <div className="mt-2 flex flex-wrap gap-1.5">{SC.WEEKDAYS_FA.map(([d, n]) => <Chip key={d} active={f.weekdays.includes(d)} onClick={() => setF({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter(x => x !== d) : [...f.weekdays, d] })} className="min-h-[32px] text-[13px]">{n}</Chip>)}</div>}
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="text-[14px] font-bold">{f.repeat === 'once' ? 'روز' : 'از تاریخ'}<input type="date" className={inp} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
          <label className="text-[14px] font-bold">شروع<input type="time" className={inp} value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label>
          <label className="text-[14px] font-bold">پایان<input type="time" className={inp} value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></label>
          {f.repeat !== 'once' && <label className="text-[14px] font-bold">تا تاریخ (اختیاری)<input type="date" className={inp} value={f.until || ''} onChange={e => setF({ ...f, until: e.target.value })} /></label>}
          <label className="text-[14px] font-bold">فاصله بعدش (رفت‌وآمد)<select className={inp} value={f.buffer} onChange={e => setF({ ...f, buffer: +e.target.value })}>{[0, 15, 30, 45, 60].map(m => <option key={m} value={m}>{fa(m)} دقیقه</option>)}</select></label>
        </div>
        {err && <p role="alert" className="mt-2 text-[14px] font-bold text-[var(--bad)]">{err}</p>}
        <div className="mt-3 flex gap-2"><Btn onClick={save}>{editId ? 'ذخیره تغییر' : '+ افزودن'}</Btn>{editId && <Btn kind="ghost" onClick={() => { setEditId(null); setF(blankEv()); }}>لغو</Btn>}</div>
      </Card>
      <Card className="content-start">
        <p className="mb-3 text-[16px] font-black">فهرست ({fa(evs.length)})</p>
        {!evs.length ? <p className="text-[15px] text-[var(--pencil)]">هنوز کار ثابتی نیست.</p> : <ul className="grid gap-2">{evs.map(e => <li key={e.id} className={`rounded-[10px] bg-[var(--wash)] p-3 text-[14px] ${e.active === false ? 'opacity-50' : ''}`}>
          <p><b>{SC.EVENT_KINDS[e.kind]?.[1]} {e.title}</b> · {fa(e.from)} تا {fa(e.to)}</p><p className="text-[13px] text-[var(--pencil)]">{when(e)}{e.until ? ` · تا ${jDay(e.until)}` : ''}</p>
          <div className="mt-1 flex gap-3 text-[13px] font-bold"><button type="button" className="text-[var(--ink)]" onClick={() => { setEditId(e.id); setF({ ...blankEv(), ...e, until: e.until || '' }); }}>ویرایش</button>
            <button type="button" className="text-[var(--pencil)]" onClick={() => set(x => ({ ...x, events: x.events.map(z => z.id === e.id ? { ...z, active: z.active === false } : z) }))}>{e.active === false ? 'روشن کن' : 'موقتاً خاموش'}</button>
            {e.repeat !== 'once' && <button type="button" className="text-[var(--pencil)]" onClick={() => { const d = prompt('کدام تاریخ برگزار نمی‌شود؟ (YYYY-MM-DD)', todayStr()); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) set(x => ({ ...x, events: x.events.map(z => z.id === e.id ? { ...z, skip: [...new Set([...(z.skip || []), d])] } : z) })); }}>یک جلسه‌اش لغو</button>}
            <button type="button" className="text-[var(--bad)]" onClick={() => confirm(`«${e.title}» حذف شود؟`) && set(x => ({ ...x, events: x.events.filter(z => z.id !== e.id) }))}>حذف</button></div></li>)}</ul>}
      </Card>
    </div>
  );
}

function Rules({ s, set }) {
  const st = s.settings; const r = SC.sessionRules(st); const up = p => set(x => ({ ...x, settings: { ...x.settings, ...p } }));
  return <Card className="max-w-[720px]">
    <p className="mb-3 text-[16px] font-black">قانون جلسه‌های درس</p>
    <div className="grid gap-3 sm:grid-cols-3">
      {[['sessionMin', 'کوتاه‌ترین جلسه', r.min], ['sessionMax', 'بلندترین جلسه', r.max]].map(([k, t, v]) => <label key={k} className="text-[14px] font-bold">{t}<select className={inp} value={v} onChange={e => up({ [k]: +e.target.value })}>{[60, 70, 75, 80, 90, 100, 105, 110, 120].map(m => <option key={m} value={m}>{fa(m)} دقیقه</option>)}</select></label>)}
      <label className="text-[14px] font-bold">استراحت بین جلسه‌ها<select className={inp} value={r.brk} onChange={e => up({ breakMin: +e.target.value })}>{[10, 15, 20, 25, 30].map(m => <option key={m} value={m}>{fa(m)} دقیقه</option>)}</select></label>
    </div>
    <ul className="mt-4 grid gap-1 text-[14px] leading-7 text-[var(--pencil)]">
      <li>• هر جلسه درس بین {fa(SC.SESSION_MIN)} تا {fa(SC.SESSION_MAX)} دقیقه است؛ بازه آزاد کوتاه‌تر از {fa(r.min)} دقیقه جلسه نمی‌شود.</li>
      <li>• جلسه‌ها اول در بازه‌های «می‌خواهم» و بعد «می‌توانم» ساخته می‌شوند تا به هدف آن روز برسی.</li>
      <li>• کار بلندتر از یک جلسه خودکار بین جلسه‌ها تقسیم می‌شود (۱/۲، ۲/۲)؛ «شرایط آزمون» هیچ‌وقت نصف نمی‌شود.</li>
    </ul>
  </Card>;
}
