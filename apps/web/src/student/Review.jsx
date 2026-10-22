import * as BK from '@ss/domain/book.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { attemptsOf, reviewQueue, applyReview, undoReview, previewIntervals, retrievabilityNow, reviewStats, isLeech, upcomingExams, chapterOf, label, REASONS, uid, todayStr } from '@ss/domain/store.js';
import { Btn, Card, Chip, Head, Empty, Meter, fa, jDate } from '@ss/ui/ui.jsx';
import ReviewSets from './ReviewSets.jsx';

const RATINGS = [[1, 'دوباره', 'یادم نبود'], [2, 'سخت', 'با زحمت'], [3, 'خوب', 'درست حل شد'], [4, 'آسان', 'سریع و مطمئن']];
const OPT = ['—', '۱', '۲', '۳', '۴'];
const MODES = [['today', 'مرور امروز'], ['mixed', 'مخلوط'], ['exam', 'قبل از آزمون'], ['starred', 'تست‌های خوب ★'], ['leech', 'سرسخت‌ها']];
const ivl = d => d < 1 ? `${fa(Math.max(1, Math.round(d * 24 * 60)))} دقیقه` : d < 30 ? `${fa(Math.round(d))} روز` : `${fa(Math.round(d / 30))} ماه`;

/** Interleave so that two consecutive cards never come from the same chapter when alternatives exist. */
function interleave(items) {
  const pool = [...items]; const out = []; let lastCh = null;
  while (pool.length) { const i = pool.findIndex(x => x.ch !== lastCh); const k = i < 0 ? 0 : i; out.push(pool[k]); lastCh = pool[k].ch; pool.splice(k, 1); }
  return out;
}

/** Review queue (MRS). «اول حل کن» first (R-20), FSRS scheduling, modes, filters, leeches, stats, undo. */
function CardReview({ s, set, go }) {
  const atts = useMemo(() => attemptsOf(s), [s.sessions, s.books, s.exams]);
  const q = useMemo(() => reviewQueue(s, atts), [s, atts]);
  const st = useMemo(() => reviewStats(s, q.all), [s, q]);
  const [mode, setMode] = useState('today');
  const [subj, setSubj] = useState(null);
  const [type, setType] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [retrieved, setRetrieved] = useState(false);
  const [done, setDone] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const shownAt = useRef(Date.now());
  const exam = upcomingExams(s)[0];

  const list = useMemo(() => {
    let base = mode === 'leech' ? q.all.filter(x => isLeech(x.item)) : mode === 'starred' ? interleave([...q.all.filter(x => x.starred)].sort((a, z) => a.due - z.due).map(x => ({ ...x, ch: null }))) : q.dueNow;
    base = base.map(x => ({ ...x, ch: x.b && x.node ? chapterOf(x.b, x.node)?.id : null }));
    if (mode === 'exam' && exam) { const ids = new Set(exam.sections.flatMap(sec => sec.nodeIds.map(n => sec.bookId + '|' + n))); base = base.filter(x => ids.has(x.a.bookId + '|' + x.a.nodeId)); }
    if (subj) base = base.filter(x => x.b?.subject === subj);
    if (type) base = base.filter(x => x.a.result === type);
    if (mode === 'today') { const left = Math.max(0, s.settings.reviewLimit - st.todayDone); let newLeft = s.settings.reviewNewLimit; base = base.filter(x => !x.isNew || newLeft-- > 0).slice(0, left); }
    if (mode === 'mixed') base = interleave(base);
    return base;
  }, [q, mode, subj, type, exam, s.settings, st.todayDone]);
  const cur = list[0];
  useEffect(() => { shownAt.current = Date.now(); setRevealed(false); setRetrieved(false); setNoteOpen(false); }, [cur?.ref]);

  const rate = r => { const quick = Date.now() - shownAt.current < 2000; set(x => applyReview(x, cur.ref, r, retrieved && !quick)); setDone(d => d + 1); };
  const patchItem = p => set(x => ({ ...x, reviews: { ...x.reviews, [cur.ref]: { ...(x.reviews[cur.ref] || { dueAt: Date.now() }), ...p } } }));
  const iv = cur ? previewIntervals(s, cur.ref) : [];
  const R = cur ? retrievabilityNow(s, cur.item) : null;
  const subjects = [...new Set(q.all.map(x => x.b?.subject).filter(Boolean))];
  const hot = useMemo(() => { const m = {}; for (const x of q.dueNow) { const k = x.a.bookId + '|' + x.a.nodeId; (m[k] ||= { b: x.b, node: x.node, n: 0 }).n++; } return Object.values(m).filter(x => x.node).sort((a, z) => z.n - a.n).slice(0, 4); }, [q]);
  const toPlan = h => set(x => ({ ...x, placements: [...x.placements, { id: uid(), date: todayStr(), order: 50, title: `مرور مبحث: ${h.b.subject}، ${label(h.b, h.node)}`, minutes: Math.min(40, 10 + h.n * 2), kind: 'مرور', subject: h.b.subject, bookId: h.b.id, nodeId: h.node.id, count: 10, u: 3, reason: `${fa(h.n)} کارت مرور سررسید از همین مبحث؛ شاید بهتر است درسنامه‌اش را دوباره ببینی`, status: 'draft', source: 'review' }] }));

  return (
    <div>
      <Head kicker="مرور فاصله‌دار" title={cur ? <>{fa(list.length)} کارت<span className="text-[var(--ink)]"> {mode === 'leech' ? 'سرسخت' : 'آماده'}</span></> : 'صف مرور'}>
        <div className="flex items-center gap-3">{done > 0 && <span className="text-[15px] text-[var(--pencil)]">{fa(done)} کارت در این نشست</span>}
          {s.lastReview && <Btn kind="ghost" onClick={() => { set(x => undoReview(x)); setDone(d => Math.max(0, d - 1)); }}>برگرداندن آخری</Btn>}</div>
      </Head>
      <div className="mb-3 flex flex-wrap gap-2">{MODES.map(([k, t]) => <Chip key={k} active={mode === k} onClick={() => setMode(k)} disabled={k === 'exam' && !exam}>{t}{k === 'leech' ? `، ${fa(st.leeches)}` : k === 'starred' ? `، ${fa(q.all.filter(x => x.starred).length)}` : ''}</Chip>)}</div>
      <div className="mb-5 flex flex-wrap gap-2 text-[14px]">
        <Chip active={!subj} onClick={() => setSubj(null)}>همه درس‌ها</Chip>{subjects.map(x => <Chip key={x} active={subj === x} onClick={() => setSubj(subj === x ? null : x)}>{x}</Chip>)}
        <span className="mx-1 w-[2px] bg-[var(--rule)]" aria-hidden />
        <Chip active={type === 'W'} onClick={() => setType(type === 'W' ? null : 'W')}>فقط غلط</Chip><Chip active={type === 'B'} onClick={() => setType(type === 'B' ? null : 'B')}>فقط نزده</Chip>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {!cur ? (
          <Card><Empty title={q.all.length ? (mode === 'today' && st.todayDone >= s.settings.reviewLimit ? 'سقف مرور امروز پر شد 👏' : 'مروری نمانده 👌') : 'هنوز کارتی نداری'}
            text={q.all.length ? (q.later[0] ? `کارت بعدی: ${jDate(new Date(q.later[0].due).toISOString())}` : '') : 'هر تست غلط یا نزده خودکار اینجا می‌آید.'}
            action={!q.all.length && <Btn onClick={() => go('practice')}>ثبت تست</Btn>} /></Card>
        ) : (
          <Card className="relative overflow-hidden p-0">
            <div className="flex items-stretch">
              <div className="w-[14px] shrink-0 bg-[repeating-linear-gradient(to_bottom,var(--graphite)_0_5px,transparent_5px_22px)] opacity-70" aria-hidden />
              <div className="flex-1 p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="text-[15px] font-bold text-[var(--ink)]">{cur.b?.subject} · {cur.b?.title}</p>
                    <p className="mt-1 text-[15px] text-[var(--pencil)]">{cur.b && cur.node ? label(cur.b, cur.node) : ''}</p></div>
                  <div className="flex flex-wrap gap-1.5 text-[13px] font-bold">{cur.isNew && <span className="rounded-full bg-[var(--wash)] px-2.5 py-1 text-[var(--ink-deep)]">جدید</span>}{isLeech(cur.item) && <span className="rounded-full bg-[var(--bad)] px-2.5 py-1 text-[var(--paper)]">سرسخت</span>}{R != null && <span className="rounded-full bg-[var(--wash)] px-2.5 py-1">احتمال یادآوری {fa(Math.round(R * 100))}٪</span>}</div>
                </div>
                <p className="mt-6 text-[15px] font-bold">تست شماره</p>
                <p className="text-[88px] font-black leading-none tracking-[-0.04em] text-[var(--graphite)]">{cur.b ? BK.qLabel(cur.b, cur.a.num) : fa(cur.a.num)}</p>
                {cur.item?.note && <p className="mt-3 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[15px]">📝 {cur.item.note}</p>}
                {!revealed ? (
                  <div className="mt-8">
                    <p className="mb-4 text-[17px]">اول خودت حلش کن، بعد جواب را ببین.</p>
                    <div className="flex flex-wrap gap-3">
                      <Btn className="min-h-[50px] px-6" onClick={() => { setRetrieved(true); setRevealed(true); }}>حل کردم، جواب را نشان بده</Btn>
                      <Btn kind="ghost" onClick={() => setRevealed(true)}>بلد نیستم، نشان بده</Btn>
                    </div>
                  </div>
                ) : (
                  <div className="mt-8">
                    <div className="mb-6 flex flex-wrap gap-6 text-[16px]">
                      <span>کلید: <b className="text-[22px] text-[var(--ok)]">گزینه {OPT[cur.b?.keys[cur.a.num] ?? 0]}</b></span>
                      <span>دفعه قبل: <b className="text-[22px] text-[var(--bad)]">{cur.a.result === 'B' ? 'نزده' : `گزینه ${OPT[cur.a.chosen]}`}</b></span>
                    </div>
                    <p className="mb-3 text-[15px] font-bold">این بار چطور بود؟</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {RATINGS.map(([r, t, sub], i) => <button key={r} type="button" onClick={() => rate(r)} className="rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-3 text-right transition hover:border-[var(--ink)]"><b className="block text-[16px]">{t}</b><span className="block text-[14px] text-[var(--pencil)]">{sub}</span><span className="mt-1 block text-[13px] font-bold text-[var(--ink-deep)]">بعدی: {ivl(iv[i])}</span></button>)}
                    </div>
                  </div>)}
                <div className="mt-6 flex flex-wrap gap-4 text-[14px] font-bold text-[var(--pencil)]">
                  <button type="button" className="underline" onClick={() => setNoteOpen(o => !o)}>{cur.item?.note ? 'ویرایش نکته' : 'افزودن نکته'}</button>
                  <button type="button" className="underline" onClick={() => patchItem({ suspended: true })}>کنار بگذار</button>
                  <button type="button" className="font-bold text-[var(--amber)]" onClick={() => set(x => { const st = { ...(x.starred || {}) }; if (st[cur.ref]) delete st[cur.ref]; else st[cur.ref] = { at: new Date().toISOString(), bookId: cur.a.bookId, num: cur.a.num, subject: cur.b?.subject }; return { ...x, starred: st }; })}>{s.starred?.[cur.ref] ? '★ ستاره‌دار' : '☆ ستاره بزن'}</button>
                  <button type="button" className="underline" onClick={() => patchItem({ dueAt: Date.now() + 864e5 })}>فردا</button>
                </div>
                {noteOpen && <NoteBox initial={cur.item?.note || ''} onSave={t => { patchItem({ note: t || null }); setNoteOpen(false); }} />}
              </div>
            </div>
          </Card>)}
        <div className="grid content-start gap-5">
          <Card>
            <p className="mb-3 text-[16px] font-black">وضعیت مرور</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[[st.retention == null ? '—' : fa(Math.round(st.retention * 100)) + '٪', 'یادآوری ۳۰ روز'], [fa(st.streak), 'روز پیاپی'], [fa(st.todayDone) + '/' + fa(s.settings.reviewLimit), 'امروز']].map(([v, t]) => <div key={t} className="rounded-[12px] bg-[var(--wash)] p-2"><p className="text-[20px] font-black">{v}</p><p className="text-[13px] text-[var(--pencil)]">{t}</p></div>)}
            </div>
            <p className="mb-2 mt-4 text-[14px] font-bold">سررسید ۷ روز آینده</p>
            <div className="flex h-[70px] items-end gap-1.5" aria-label="پیش‌بینی سررسید">{st.forecast.map((v, i) => { const mx = Math.max(1, ...st.forecast); return <div key={i} className="flex flex-1 flex-col items-center gap-1"><span className="text-[12px] text-[var(--pencil)]">{fa(v)}</span><div className="w-full rounded-t-[4px] bg-[var(--ink)]" style={{ height: `${Math.max(3, 44 * v / mx)}px`, opacity: i ? 0.55 : 1 }} /></div>; })}</div>
          </Card>
          {hot.length > 0 && <Card>
            <p className="mb-2 text-[16px] font-black">مبحث‌های پرخطا</p>
            <ul className="grid gap-2">{hot.map(h => <li key={h.b.id + h.node.id} className="flex items-center justify-between gap-2 text-[14px]"><span>{h.b.subject}، {label(h.b, h.node)} <span className="text-[var(--pencil)]">({fa(h.n)})</span></span><button type="button" className="shrink-0 font-bold text-[var(--ink)]" onClick={() => toPlan(h)}>به برنامه</button></li>)}</ul>
          </Card>}
          {mode === 'leech' && <Card><p className="text-[15px] leading-7">کارت سرسخت یعنی دست‌کم {fa(4)} بار فراموش شده. به‌جای تکرار، درسنامه همان مبحث را دوباره بخوان و یک نکته برای کارت بنویس.</p></Card>}
        </div>
      </div>
    </div>
  );
}

function NoteBox({ initial, onSave }) {
  const [t, setT] = useState(initial);
  return <div className="mt-3 flex gap-2"><input aria-label="نکته" className="min-w-0 flex-1 rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px]" value={t} onChange={e => setT(e.target.value)} placeholder="مثلاً: علامت منفی را جا انداختم" onKeyDown={e => e.key === 'Enter' && onSave(t.trim())} /><Btn kind="soft" onClick={() => onSave(t.trim())}>ذخیره</Btn></div>;
}

/** v13: «set» mode (default) — review in sets of 20; «card» mode keeps the v12 one-card page. */
export default function Review(props) {
  const mode = props.s.settings?.reviewMode === 'card' ? 'card' : 'set';
  return mode === 'card' ? <div><div className="mb-3 flex justify-end"><Btn kind="soft" onClick={() => props.set(x => ({ ...x, settings: { ...x.settings, reviewMode: 'set' } }))}>مرور مجموعه‌ای (۲۰تایی)</Btn></div><CardReview {...props} /></div> : <ReviewSets {...props} />;
}
