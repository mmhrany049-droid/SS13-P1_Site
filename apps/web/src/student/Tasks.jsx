// 7.1: one editor for adding AND editing planner tasks (fixes v7: minutes field was clamped on every keystroke,
// only 7 days were selectable, tasks could not be edited, no book/topic link, no weekly repeat).
import { useState } from 'react';
import * as E from '@ss/domain/engine.js';
import * as SC from '@ss/domain/schedule.js';
import { todayStr, addDays, uid, leaves, label, INTENSITY } from '@ss/domain/store.js';
import { Btn, Card, Chip, fa, jWeekday, jDay } from '@ss/ui/ui.jsx';

const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px] font-normal';
export const TASK_KINDS = ['کار دستی', 'مطالعه درسنامه', 'تست هدفمند', 'تست نزده', 'مرور', 'مرور فراموشی', 'تحلیل خطا', 'شرایط آزمون'];

export function TaskEditor({ s, set, task = null, date = todayStr(), onClose }) {
  const books = s.books.filter(b => b.active !== false);
  const [f, setF] = useState(() => task ? { title: task.title, date: task.date, at: task.at || '', minutes: String(task.minutes), kind: task.kind || 'کار دستی', bookId: task.bookId || '', nodeId: task.nodeId || '', count: task.count ? String(task.count) : '', note: task.note || '', repeat: false, weekdays: [], until: '' }
    : { title: '', date, at: '', minutes: '60', kind: 'کار دستی', bookId: '', nodeId: '', count: '', note: '', repeat: false, weekdays: [SC.dow(date)], until: addDays(date, 28) });
  const [err, setErr] = useState('');
  const b = books.find(x => x.id === f.bookId); const n = b?.nodes.find(x => x.id === f.nodeId);
  const minutes = +E.normalizeDigits(f.minutes);
  const autoTitle = () => b ? `${f.kind}: ${b.subject}${n ? `، ${label(b, n)}` : ''}` : '';
  const save = () => {
    setErr(''); const title = (f.title.trim() || autoTitle()).trim();
    if (!title) return setErr('عنوان کار را بنویس یا یک کتاب/مبحث انتخاب کن.');
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 300) return setErr('مدت باید بین ۵ تا ۳۰۰ دقیقه باشد. کارهای بلندتر از یک جلسه خودکار بین جلسه‌ها تقسیم می‌شوند.');
    if (f.at && SC.toMin(f.at) == null) return setErr('ساعت نامعتبر است.');
    const base = { title, minutes: Math.round(minutes), kind: f.kind, at: f.at || null, bookId: f.bookId || undefined, nodeId: f.nodeId || undefined, subject: b?.subject, count: +E.normalizeDigits(f.count) || undefined, note: f.note.trim() || undefined };
    if (task) { set(x => ({ ...x, placements: x.placements.map(p => p.id === task.id ? { ...p, ...base, date: f.date, moves: p.date !== f.date ? (p.moves || 0) + 1 : p.moves } : p) })); onClose?.(); return; }
    const dates = !f.repeat ? [f.date] : (() => { const out = []; for (let d = f.date; d <= (f.until || f.date) && out.length < 60; d = addDays(d, 1)) if (f.weekdays.includes(SC.dow(d))) out.push(d); return out; })();
    if (!dates.length) return setErr('هیچ روزی با این تکرار انتخاب نشد.');
    const seriesId = f.repeat ? uid() : undefined;
    set(x => ({ ...x, placements: [...x.placements, ...dates.map(d => ({ id: uid(), date: d, order: 999, ...base, status: 'approved', source: 'manual', manual: true, seriesId, reason: 'خودت اضافه کردی' }))] }));
    onClose?.();
  };
  const del = all => set(x => ({ ...x, placements: x.placements.filter(p => all && task.seriesId ? !(p.seriesId === task.seriesId && p.date >= task.date && p.status !== 'done') : p.id !== task.id) }));
  return (
    <Card className="mb-5 outline outline-2 outline-[var(--ink)]">
      <div className="mb-3 flex items-center justify-between"><p className="text-[16px] font-black">{task ? 'ویرایش کار' : 'افزودن کار به برنامه'}</p><button type="button" aria-label="بستن" className="px-2 text-[20px] text-[var(--pencil)]" onClick={onClose}>×</button></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-[14px] font-bold lg:col-span-3">کار<input autoFocus className={inp} placeholder={autoTitle() || 'مثلاً حل تمرین‌های فصل ۲ فیزیک'} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <label className="text-[14px] font-bold">روز<input type="date" className={inp} value={f.date} onChange={e => setF({ ...f, date: e.target.value || f.date })} /></label>
        <label className="text-[14px] font-bold">مدت (دقیقه)<input inputMode="numeric" className={inp} value={fa(f.minutes)} onChange={e => setF({ ...f, minutes: E.normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 3) })} /></label>
        <label className="text-[14px] font-bold">ساعت (اختیاری)<input type="time" className={inp} value={f.at} onChange={e => setF({ ...f, at: e.target.value })} /></label>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">{[30, 45, 60, 90, 120].map(m => <Chip key={m} active={minutes === m} onClick={() => setF({ ...f, minutes: String(m) })} className="min-h-[32px] text-[13px]">{fa(m)}′</Chip>)}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <label className="text-[14px] font-bold">نوع<select className={inp} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{TASK_KINDS.map(k => <option key={k}>{k}</option>)}</select></label>
        <label className="text-[14px] font-bold">کتاب (اختیاری)<select className={inp} value={f.bookId} onChange={e => setF({ ...f, bookId: e.target.value, nodeId: '' })}><option value="">—</option>{books.map(x => <option key={x.id} value={x.id}>{x.subject} · {x.title}</option>)}</select></label>
        <label className="text-[14px] font-bold">مبحث<select className={inp} disabled={!b} value={f.nodeId} onChange={e => setF({ ...f, nodeId: e.target.value })}><option value="">—</option>{b && leaves(b).map(x => <option key={x.id} value={x.id}>{label(b, x)}</option>)}</select></label>
        <label className="text-[14px] font-bold">تعداد تست<input inputMode="numeric" className={inp} disabled={!n} value={fa(f.count)} onChange={e => setF({ ...f, count: E.normalizeDigits(e.target.value).replace(/\D/g, '') })} /></label>
      </div>
      {!task && <div className="mt-3 rounded-[10px] bg-[var(--wash)] p-3 text-[14px]">
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" className="h-5 w-5 accent-[var(--ink)]" checked={f.repeat} onChange={e => setF({ ...f, repeat: e.target.checked })} />تکرار هفتگی</label>
        {f.repeat && <div className="mt-2 flex flex-wrap items-center gap-1.5">{SC.WEEKDAYS_FA.map(([d, nm]) => <Chip key={d} active={f.weekdays.includes(d)} onClick={() => setF({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter(x => x !== d) : [...f.weekdays, d] })} className="min-h-[30px] text-[12px]">{nm}</Chip>)}<span className="mr-2">تا</span><input type="date" className="rounded-[8px] border-2 border-[var(--rule)] bg-[var(--paper)] px-2 py-1" value={f.until} onChange={e => setF({ ...f, until: e.target.value })} /></div>}
      </div>}
      <label className="mt-3 block text-[14px] font-bold">یادداشت<input className={inp} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></label>
      {err && <p role="alert" className="mt-2 text-[14px] font-bold text-[var(--bad)]">{err}</p>}
      <div className="mt-3 flex flex-wrap gap-2"><Btn onClick={save}>{task ? 'ذخیره' : 'افزودن'}</Btn><Btn kind="ghost" onClick={onClose}>بستن</Btn>
        {task && <><button type="button" className="mr-auto text-[14px] font-bold text-[var(--bad)]" onClick={() => { del(false); onClose?.(); }}>حذف همین</button>{task.seriesId && <button type="button" className="text-[14px] font-bold text-[var(--bad)]" onClick={() => confirm('همه تکرارهای بعدی این کار حذف شوند؟') && (del(true), onClose?.())}>حذف تکرارهای بعدی</button>}</>}</div>
      <p className="mt-2 text-[12px] text-[var(--pencil)]">وزن فشار «{f.kind}»: {fa(INTENSITY[f.kind] ?? 1)}</p>
    </Card>
  );
}

/** Compact time-line of a day: sessions with their (split) tasks, and busy blocks. */
export function DayTimeline({ s, d, items }) {
  const t = SC.timeline(s, d, items.filter(p => p.status !== 'done' && p.status !== 'outline'));
  if (!t.blocks.length) return <p className="mb-2 text-[12px] text-[var(--pencil)]">{SC.dayCfg(s, d).mode === 'off' ? 'تعطیل' : 'جلسه‌ای در این روز جا نمی‌شود'}</p>;
  return (
    <div className="mb-2 grid gap-1 text-[12px]">
      {t.blocks.map((b, i) => b.type === 'event'
        ? <p key={i} className="rounded-[6px] bg-[var(--graphite)] px-2 py-0.5 text-[var(--paper)]">{fa(b.from)}–{fa(b.to)} · {b.kind === 'mock' ? '🎯' : SC.EVENT_KINDS[b.kind]?.[1]} {b.title}</p>
        : <details key={i} className="rounded-[6px] border border-[var(--rule)] px-2 py-0.5"><summary className="cursor-pointer"><b>{fa(b.from)}–{fa(b.to)}</b> جلسه {fa(b.minutes)}′ · {b.items.length ? `${fa(b.items.length)} کار (${fa(b.used)}′)` : 'آزاد'}</summary>
          <ul className="pb-1">{b.items.map((p, k) => <li key={k}>• {p.title.split(':')[0]}{p.part ? ` (${fa(p.part)})` : ''} {fa(p.partMin)}′</li>)}</ul></details>)}
      {t.overflow.length > 0 && <p className="font-bold text-[var(--bad)]">{fa(t.overflow.length)} کار در جلسه‌های این روز جا نمی‌شود؛ جابه‌جا یا کوتاهش کن.</p>}
    </div>
  );
}
