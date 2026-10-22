import { useEffect, useMemo, useRef, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { REASONS, bookById, leaves, nodePath, sessionStats, uid, attemptsOf, label, mapRange, assignGap, nextBlockFor, todayStr, topicMastery } from '@ss/domain/store.js';
import { Btn, Card, Chip, Head, Bubble, fa, pct } from '@ss/ui/ui.jsx';
import * as BK from '@ss/domain/book.js';

const STEPS = ['درس', 'کتاب', 'بازه', 'لیست پاسخ', 'زمان حدودی', 'توضیحات'];
const TIME_CHIPS = [10, 15, 20, 30, 45, 60, 90];
/** s.starred entries for questions of book b (ref = bookId:num, same as attempts/reviews). */
export const starEntries = (b, nums, at = new Date().toISOString()) => Object.fromEntries(nums.map(n => [`${b.id}:${n}`, { at, bookId: b.id, num: n, subject: b.subject }]));
export const ORIGINS = [
  ['planned', 'جدید، طبق برنامه', 'بخشی از برنامه تأییدشده'],
  ['extra', 'جدید، خارج از برنامه', 'تست‌هایی که برنامه‌ریزی نکرده بودی'],
  ['repeat', 'تکراری', 'این تست‌ها را قبلاً هم زده بودم'],
];

export default function Practice({ s, set, go, preset }) {
  const books = s.books.filter(b => b.active !== false);
  const subjects = [...new Set(books.map(b => b.subject))];
  const draft = s.draft;
  const [step, setStep] = useState(draft?.step ?? 0);
  const [subject, setSubject] = useState(draft?.subject ?? null);
  const [bookId, setBookId] = useState(draft?.bookId ?? null);
  const [ranges, setRanges] = useState(draft?.ranges ?? []);
  const [answers, setAnswers] = useState(draft?.answers ?? {});
  const [guesses, setGuesses] = useState(draft?.guesses ?? {});
  const [minutes, setMinutes] = useState(draft?.minutes ?? null);
  const [origin, setOrigin] = useState(draft?.origin ?? null);
  const [note, setNote] = useState(draft?.note ?? '');
  const [placementId, setPlacementId] = useState(draft?.placementId ?? null);
  const [stars, setStars] = useState(draft?.stars ?? {});
  const [savedId, setSavedId] = useState(null);
  const atts = useMemo(() => attemptsOf(s), [s.sessions, s.books, s.exams]);

  useEffect(() => {
    if (savedId) return;
    const d = { step, subject, bookId, ranges, answers, guesses, minutes, origin, note, placementId, stars };
    set(x => ({ ...x, draft: step === 0 && !subject ? null : d }));
  }, [step, subject, bookId, ranges, answers, guesses, minutes, origin, note, placementId, stars, savedId]);

  useEffect(() => { if (preset) { setSubject(preset.subject); setBookId(preset.bookId); setRanges([preset.range]); setStep(3); } }, [preset]);

  const b = bookId ? bookById(s, bookId) : null;
  const nums = useMemo(() => ranges.flatMap(r => Array.from({ length: Math.max(0, r.to - r.from + 1) }, (_, i) => r.from + i)), [ranges]);
  const reset = () => { setStep(0); setSubject(null); setBookId(null); setRanges([]); setAnswers({}); setGuesses({}); setMinutes(null); setOrigin(null); setNote(''); setPlacementId(null); setStars({}); };

  if (savedId) return <Result s={s} set={set} go={go} id={savedId} again={() => { setSavedId(null); reset(); }} />;

  const pickSubject = sub => {
    setSubject(sub); const bs = books.filter(x => x.subject === sub);
    if (bs.length === 1) { setBookId(bs[0].id); setStep(2); } else setStep(1);
  };
  const fromPlan = (p, range) => {
    const bb = bookById(s, p.bookId); setSubject(bb.subject); setBookId(bb.id); setPlacementId(p.id); setOrigin('planned');
    if (range) { setRanges(mapRange(bb, range.from, range.to).parts); setStep(3); } else setStep(2);
  };

  const save = () => {
    const ses = { id: uid(), bookId, nodeId: ranges[0].nodeId, ranges, answers: Object.fromEntries(nums.map(n => [n, answers[n] ?? 0])), guesses, reasons: {}, minutes, timeSource: minutes ? 'estimated' : 'none', at: new Date().toISOString(), origin: origin || 'extra', note: note.trim() || null, placementId: origin === 'planned' ? placementId : null, mixed: new Set(ranges.map(r => r.nodeId)).size >= 3 || ranges.some(r => b.nodes.find(n => n.id === r.nodeId)?.kind !== 'topic') };
    const st = sessionStats({ books: s.books }, ses);
    ses.flags = E.antiGamingFlags(st, minutes ? E.secPerQ(minutes * 60, st) : null, Object.values(ses.answers));
    set(x => ({ ...x, sessions: [...x.sessions, ses], draft: null, starred: { ...(x.starred || {}), ...starEntries(b, nums.filter(n => stars[n]), ses.at) },
      placements: ses.placementId ? x.placements.map(p => p.id === ses.placementId ? { ...p, status: 'done', doneAt: ses.at, actualMin: minutes || p.minutes, sessionId: ses.id } : p) : x.placements }));
    setSavedId(ses.id);
  };

  return (
    <div>
      <Head kicker="ثبت تست" title="جلسه جدید">
        {(subject || ranges.length > 0) && <Btn kind="ghost" onClick={() => { reset(); set(x => ({ ...x, draft: null })); }}>شروع از اول</Btn>}
      </Head>
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="مراحل">
        {STEPS.map((t, i) => (
          <li key={t}>
            <button type="button" disabled={i > step} onClick={() => setStep(i === 1 && books.filter(x => x.subject === subject).length === 1 ? 0 : i)}
              className={`flex min-h-[34px] items-center gap-2 rounded-full px-3 text-[14px] font-bold ${i === step ? 'bg-[var(--ink)] text-[var(--paper)]' : i < step ? 'bg-[var(--wash)] text-[var(--ink-deep)]' : 'text-[var(--pencil)]'}`}>
              <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-current text-[12px]">{fa(i + 1)}</span>{t}
              {i === 0 && subject && i < step ? `: ${subject}` : ''}{i === 1 && b && i < step ? `: ${b.publisher}` : ''}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (<div className="grid gap-5">
        <PlannedCard s={s} atts={atts} onPick={fromPlan} go={go} />
        <Card>
          <p className="mb-4 text-[18px] font-black">کدام درس؟</p>
          <div className="flex flex-wrap gap-3">{subjects.map(sub => <Chip key={sub} onClick={() => pickSubject(sub)} className="min-h-[52px] px-6 text-[17px]">{sub}</Chip>)}</div>
          <ContinueCard s={s} atts={atts} onPick={(sub, bid, r) => { setSubject(sub); setBookId(bid); setRanges(mapRange(bookById(s, bid), r.from, r.to).parts); setStep(3); }} />
        </Card>
      </div>)}

      {step === 1 && (
        <Card>
          <p className="mb-4 text-[18px] font-black">کدام کتاب؟</p>
          <div className="flex flex-wrap gap-3">{books.filter(x => x.subject === subject).map(x => <Chip key={x.id} onClick={() => { setBookId(x.id); setStep(2); }}>{x.title}، {x.publisher}</Chip>)}</div>
        </Card>
      )}

      {step === 2 && b && <RangeStep s={s} set={set} go={go} b={b} ranges={ranges} setRanges={setRanges} onNext={() => setStep(3)} hintNode={placementId ? s.placements.find(p => p.id === placementId)?.nodeId : null} />}

      {step === 3 && b && <AnswerStep b={b} nums={nums} answers={answers} setAnswers={setAnswers} guesses={guesses} setGuesses={setGuesses} stars={stars} setStars={setStars} onNext={() => setStep(4)} />}

      {step === 4 && (
        <Card>
          <p className="mb-1 text-[18px] font-black">حدوداً چقدر طول کشید؟</p>
          <p className="mb-4 text-[15px] text-[var(--pencil)]">{fa(nums.length)} تست. فقط یک عدد تقریبی، همین.</p>
          <div className="flex flex-wrap gap-3">
            {TIME_CHIPS.map(m => <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>{fa(m)} دقیقه</Chip>)}
            <Chip active={minutes === 0} onClick={() => setMinutes(0)}>نمی‌دانم</Chip>
          </div>
          <label className="mt-4 flex items-center gap-3 text-[15px]">یا دقیق:
            <input inputMode="numeric" className="w-24 rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-center" placeholder="۲۵"
              value={minutes && !TIME_CHIPS.includes(minutes) ? fa(minutes) : ''} onChange={e => { const v = +E.normalizeDigits(e.target.value); if (v >= 0 && v <= 600) setMinutes(v || null); }} /> دقیقه
          </label>
          {minutes > 0 && <p className="mt-3 text-[14px] text-[var(--pencil)]">≈ {fa(Math.round(minutes * 60 / nums.length))} ثانیه برای هر تست</p>}
          <div className="mt-6 flex gap-3"><Btn disabled={minutes == null} onClick={() => setStep(5)}>ادامه</Btn></div>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <p className="mb-1 text-[18px] font-black">این تست‌ها چه بودند؟</p>
          <p className="mb-4 text-[15px] text-[var(--pencil)]">تکراری‌ها در تحلیل وزن کمتری می‌گیرند تا درصدت واقعی بماند.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {ORIGINS.map(([k, t, d]) => { const dis = k === 'planned' && !placementId && !s.placements.some(p => p.date === todayStr() && p.status === 'approved' && p.bookId === bookId);
              return <button key={k} type="button" disabled={dis} aria-pressed={origin === k} onClick={() => setOrigin(k)} className={`rounded-[12px] border-2 p-4 text-right transition disabled:opacity-40 ${origin === k ? 'border-[var(--ink)] bg-[var(--wash)]' : 'border-[var(--rule)] hover:border-[var(--ink)]'}`}><b className="block text-[16px]">{t}</b><span className="text-[14px] text-[var(--pencil)]">{d}</span></button>; })}
          </div>
          {origin === 'planned' && !placementId && <PlanPicker s={s} bookId={bookId} value={placementId} onChange={setPlacementId} />}
          <label className="mt-5 block text-[15px] font-bold">توضیح (اختیاری)
            <textarea rows={2} className="mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px] font-normal" placeholder="مثلاً: سر کلاس حل شد، با تایمر زدم، خسته بودم…" value={note} onChange={e => setNote(e.target.value)} /></label>
          <div className="mt-6 flex gap-3"><Btn disabled={!origin || (origin === 'planned' && !placementId)} onClick={save}>ثبت و تصحیح</Btn></div>
        </Card>
      )}
    </div>
  );
}

function PlanPicker({ s, bookId, value, onChange }) {
  const items = s.placements.filter(p => p.date === todayStr() && p.status === 'approved' && p.bookId === bookId);
  return <label className="mt-4 block text-[15px] font-bold">کدام کار برنامه؟
    <select className="mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 font-normal" value={value || ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">انتخاب کن</option>{items.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>;
}

/** «از برنامه امروز»: approved test tasks open straight to the right topic and next untried block. */
function PlannedCard({ s, atts, onPick, go }) {
  const today = todayStr();
  const items = s.placements.filter(p => p.status === 'approved' && p.date <= today && p.bookId && p.kind !== 'مطالعه درسنامه').sort((a, z) => a.date.localeCompare(z.date) || (a.order ?? 0) - (z.order ?? 0));
  if (!items.length) return <Card><p className="text-[16px] font-black">از برنامه امروز</p><p className="mt-1 text-[15px] text-[var(--pencil)]">کار تستی تأییدشده‌ای برای امروز نداری. <button type="button" className="font-bold text-[var(--ink)] underline" onClick={() => go('planner')}>برنامه</button></p></Card>;
  return (
    <Card>
      <p className="mb-3 text-[18px] font-black">از برنامه امروز</p>
      <ul className="grid gap-2">{items.map(p => { const b = bookById(s, p.bookId); const n = b?.nodes.find(x => x.id === p.nodeId); const m = b && n ? topicMastery(s, atts).res[`${b.id}|${n.id}`] : null; const nb = b && n ? nextBlockFor(s, atts, b, n, p.count || 12, { mastery: m?.pC }) : null; return (
        <li key={p.id}><button type="button" onClick={() => onPick(p, nb)} className="flex w-full items-center justify-between gap-4 rounded-[12px] bg-[var(--wash)] p-4 text-right hover:brightness-95">
          <span><span className="block text-[16px] font-black">{p.title}</span>
            <span className="block text-[14px] text-[var(--pencil)]">{p.date < today ? 'از روزهای قبل · ' : ''}{nb ? `تست ${BK.rangeLabel(b, nb.from, nb.to)}${nb.level ? ` · سطح ${fa(nb.level)}` : ''}${nb.repeat ? ' (دور دوم)' : ''}` : 'بازه این مبحث هنوز ثبت نشده'} · {fa(p.minutes)} دقیقه</span></span>
          <span className="text-[22px] text-[var(--ink)]">←</span></button></li>); })}</ul>
    </Card>
  );
}

function ContinueCard({ s, atts, onPick }) {
  const last = [...s.sessions].filter(x => !x.legacy).sort((a, z) => z.at.localeCompare(a.at))[0]; if (!last) return null;
  const b = bookById(s, last.bookId); if (!b || b.active === false) return null;
  const ls = leaves(b).filter(n => n.qStart != null); const start = Math.max(0, ls.findIndex(n => n.id === last.nodeId));
  const done = new Set(atts.filter(a => a.bookId === b.id && a.num != null).map(a => a.num));
  let node = null, nb = null;
  for (let i = start; i < ls.length && !nb; i++) { node = ls[i]; let f = node.qStart; while (f <= node.qEnd && done.has(f)) f++; if (f <= node.qEnd) nb = { from: f, to: Math.min(node.qEnd, f + Math.max(10, Object.keys(last.answers).length) - 1) }; }
  if (!nb) return null;
  return (
    <button type="button" onClick={() => onPick(b.subject, b.id, nb)}
      className="mt-6 flex w-full items-center justify-between gap-4 rounded-[12px] bg-[var(--wash)] p-4 text-right hover:brightness-95">
      <span><span className="block text-[14px] font-bold text-[var(--ink)]">ادامه از جایی که ماندی</span>
        <span className="block text-[16px] font-black">{b.subject}، {label(b, node)}، تست {BK.rangeLabel(b, nb.from, nb.to)}</span></span>
      <span className="text-[22px] text-[var(--ink)]">←</span>
    </button>
  );
}

/** Range by NUMBERS only. The system finds the topics; unmapped numbers raise an error + mini assistant. */
export function RangeStep({ s, set, go, b, ranges, setRanges, onNext, hintNode }) {
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [err, setErr] = useState(''); const [gap, setGap] = useState(null); const [helpOpen, setHelpOpen] = useState(false);
  // v6: books numbered per chapter (or with self-numbered exams) need «which chapter?» first
  const scopes = BK.scopesOf(b); const multi = BK.hasScopes(b);
  const hintScope = hintNode ? BK.scopeNodeOf(b, b.nodes.find(n => n.id === hintNode))?.id ?? null : null;
  const [scope, setScope] = useState(hintScope ?? (multi && b.numbering === 'perChapter' ? scopes[0]?.id ?? null : null));
  const I = v => BK.toInternal(b, scope, +v);
  const toRef = useRef(null);
  const mapped = leaves(b).filter(n => n.qStart != null && BK.scopeNoOfNum(n.qStart) === BK.scopeNoById(b, scope));
  const maxQ = mapped.length ? Math.max(...mapped.map(n => BK.printedOf(n.qEnd))) : 0;
  const preview = useMemo(() => { const f = +from, t = +to; return f && t && f <= t && t - f < 300 ? mapRange(b, I(f), I(t)) : null; }, [from, to, b, scope]);
  const add = () => {
    const f = from ? I(from) : 0, t = to ? I(to) : 0; setErr('');
    if (!+from || !+to) return setErr('شماره اول و آخر را بنویس.');
    if (f > t) return setErr('شماره شروع باید از پایان کوچک‌تر باشد.');
    if (t - f >= 300) return setErr('حداکثر ۳۰۰ تست در یک جلسه.');
    const taken = ranges.find(r => !(t < r.from || f > r.to)); if (taken) return setErr(`بخشی از این بازه را قبلاً اضافه کرده‌ای (${BK.rangeLabel(b, taken.from, taken.to)}).`);
    const m = mapRange(b, f, t);
    if (m.gaps.length) { setGap(m.gaps[0]); setHelpOpen(true); return setErr(`تست‌های ${BK.rangeLabel(b, m.gaps[0].from, m.gaps[0].to)} به هیچ مبحثی وصل نیستند.`); }
    setRanges(r => [...r, ...m.parts].sort((x, y) => x.from - y.from)); setFrom(''); setTo(''); setGap(null); setHelpOpen(false);
  };
  const byNode = ranges.reduce((a, r) => { (a[r.nodeId] ||= []).push(r); return a; }, {});
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card>
        <p className="mb-1 text-[18px] font-black">از تست چند تا چند؟</p>
        <p className="mb-4 text-[15px] text-[var(--pencil)]">فقط شماره‌ها را بنویس؛ مبحث‌ها را خودم پیدا می‌کنم. {maxQ ? `${scope ? 'این بخش' : `کتاب ${b.title}`} تا تست ${fa(maxQ)} بازه دارد.` : 'هنوز برای این بخش بازه‌ای ثبت نشده.'}</p>
        {multi && <div className="mb-4"><p className="mb-2 text-[14px] font-bold">{b.numbering === 'perChapter' ? 'شماره‌های این کتاب هر فصل از ۱ شروع می‌شود؛ کدام فصل؟' : 'کدام بخش؟'}</p>
          <div className="flex flex-wrap gap-2">{scopes.map(x => <Chip key={x.id || 'g'} active={scope === x.id} onClick={() => { setScope(x.id); setErr(''); }} className="min-h-[34px] text-[13px]">{x.title}</Chip>)}</div></div>}
        <div className="flex flex-wrap items-center gap-3 text-[17px]">از
          <input aria-label="از تست" inputMode="numeric" autoFocus className="w-28 rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-3 text-center text-[22px] font-black" value={fa(from)} onChange={e => setFrom(E.normalizeDigits(e.target.value).replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && toRef.current?.focus()} />
          تا
          <input ref={toRef} aria-label="تا تست" inputMode="numeric" className="w-28 rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-3 text-center text-[22px] font-black" value={fa(to)} onChange={e => setTo(E.normalizeDigits(e.target.value).replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && add()} />
          <Btn className="min-h-[52px]" onClick={add}>افزودن</Btn>
        </div>
        {preview && !err && <div className="mt-4 rounded-[12px] bg-[var(--wash)] p-3 text-[15px]">
          {preview.parts.map(p => <p key={p.from}>{fa(BK.printedOf(p.from))} تا {fa(BK.printedOf(p.to))} ← <b>{label(b, b.nodes.find(n => n.id === p.nodeId))}</b></p>)}
          {preview.gaps.map(g => <p key={'g' + g.from} className="font-bold text-[var(--bad)]">{fa(BK.printedOf(g.from))} تا {fa(BK.printedOf(g.to))} ← مبحث ندارد</p>)}
        </div>}
        {err && <p role="alert" className="mt-3 text-[15px] font-bold text-[var(--bad)]">{err} {gap && !helpOpen && <button type="button" className="underline" onClick={() => setHelpOpen(true)}>چه کار کنم؟</button>}</p>}
        <details className="mt-6 text-[15px]"><summary className="cursor-pointer font-bold text-[var(--pencil)]">بازه مبحث‌های این کتاب</summary>
          <ul className="mt-2 grid max-h-[36vh] gap-1 overflow-auto">{leaves(b).map(n => <li key={n.id} className="flex justify-between gap-3 rounded-[8px] px-2 py-1 odd:bg-[var(--wash)]"><span>{label(b, n)}</span><span className="shrink-0 text-[var(--pencil)]">{n.qStart != null ? `${BK.qLabel(b, n.qStart)}–${fa(BK.printedOf(n.qEnd))}` : 'ندارد'}</span></li>)}</ul></details>
      </Card>
      <Card className="content-start">
        <p className="mb-2 text-[16px] font-black">بازه‌های این جلسه</p>
        {!ranges.length ? <p className="text-[15px] text-[var(--pencil)]">هنوز چیزی اضافه نشده.</p> :
          <ul className="grid gap-2">{Object.entries(byNode).map(([nid, rs]) => <li key={nid} className="rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[15px]"><b>{label(b, b.nodes.find(n => n.id === nid))}</b>
            <span className="block text-[14px] text-[var(--pencil)]">{rs.map(r => BK.rangeLabel(b, r.from, r.to)).join('، ')}</span></li>)}</ul>}
        {ranges.length > 0 && <button type="button" className="mt-2 text-[14px] font-bold text-[var(--bad)]" onClick={() => setRanges([])}>پاک کردن بازه‌ها</button>}
        <Btn className="mt-4 w-full" disabled={!ranges.length} onClick={onNext}>باز کردن لیست پاسخ ({fa(ranges.reduce((a, r) => a + r.to - r.from + 1, 0))} تست)</Btn>
      </Card>
      {helpOpen && gap && <MiniAssistant s={s} set={set} go={go} b={b} gap={gap} hintNode={hintNode} onClose={() => setHelpOpen(false)} onFixed={() => { setErr(''); setGap(null); setHelpOpen(false); }} />}
    </div>
  );
}

/** Small floating assistant window: explains what to do when numbers have no topic, and fixes it in place. */
function MiniAssistant({ s, set, go, b, gap, hintNode, onClose, onFixed }) {
  const [nodeId, setNodeId] = useState(hintNode || '');
  const [e2, setE2] = useState('');
  // v9: if the numbers sit inside a chapter's span, only that chapter's topics are offered
  const inside = BK.spanOfNumber(b, gap.from);
  const ls = leaves(b).filter(n => !inside || BK.isDescendant(b, n, inside));
  const empty = ls.filter(n => n.qStart == null);
  const before = [...ls].filter(n => n.qEnd != null && n.qEnd < gap.from).sort((x, y) => y.qEnd - x.qEnd)[0];
  const fix = () => { const r = assignGap(s, b.id, nodeId, gap); if (!r.ok) return setE2(r.error); set(x => ({ ...x, books: r.books })); onFixed(); };
  return (
    <div role="dialog" aria-label="دستیار" className="fixed bottom-24 left-4 z-40 w-[min(360px,calc(100vw-32px))] rounded-[16px] bg-[var(--card)] p-4 shadow-[0_18px_40px_-12px_rgba(60,20,35,.45)] outline outline-2 outline-[var(--ink)] md:bottom-6">
      <div className="mb-2 flex items-center justify-between"><p className="text-[15px] font-black text-[var(--ink)]">✉ دستیار</p><button type="button" aria-label="بستن" className="px-2 text-[18px] text-[var(--pencil)]" onClick={onClose}>×</button></div>
      <p className="text-[15px] leading-7">تست‌های <b>{BK.rangeLabel(b, gap.from, gap.to)}</b> هنوز مبحث ندارند، برای همین نمی‌دانم کجا ثبتشان کنم.{inside ? ` این شماره‌ها داخل «${inside.title}» (${fa(BK.printedOf(inside.span.from))} تا ${fa(BK.printedOf(inside.span.to))}) هستند.` : ''}{before ? ` آخرین مبحث قبل از این شماره «${label(b, before)}» است که تا ${fa(BK.printedOf(before.qEnd))} می‌رسد.` : ''}</p>
      <p className="mt-2 text-[15px] font-bold">این تست‌ها مال کدام مبحث‌اند؟</p>
      <select className="mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px]" value={nodeId} onChange={e => { setNodeId(e.target.value); setE2(''); }}>
        <option value="">انتخاب کن</option>
        {empty.length > 0 && <optgroup label="بدون بازه">{empty.map(n => <option key={n.id} value={n.id}>{label(b, n)}</option>)}</optgroup>}
        <optgroup label="ادامه یک مبحث">{ls.filter(n => n.qStart != null).map(n => <option key={n.id} value={n.id}>{label(b, n)} ({fa(BK.printedOf(n.qStart))}–{fa(BK.printedOf(n.qEnd))})</option>)}</optgroup>
      </select>
      {e2 && <p className="mt-2 text-[14px] font-bold text-[var(--bad)]">{e2}</p>}
      <div className="mt-3 flex flex-wrap gap-2"><Btn disabled={!nodeId} onClick={fix}>وصل کن و ادامه بده</Btn><Btn kind="ghost" onClick={() => go('books')}>تعریف در کتاب‌ها</Btn></div>
      <p className="mt-2 text-[13px] text-[var(--pencil)]">اگر بازه یک مبحث را کامل بدانی، بهتر است یک بار در «کتاب‌ها» واردش کنی.</p>
    </div>
  );
}

export function AnswerStep({ b, nums, answers, setAnswers, guesses, setGuesses, onNext, stars = null, setStars = null, nextLabel = 'ادامه', hideGuess = false, blankLabel = 'نزده', title = 'پاسخ‌برگ', compare = null, onBack = null }) {
  const [cur, setCur] = useState(() => nums.find(n => answers[n] == null) ?? nums[0]);
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const refs = useRef({});
  const filled = nums.filter(n => answers[n] != null).length;
  const setAns = (n, v) => { setAnswers(a => ({ ...a, [n]: v })); const i = nums.indexOf(n); if (i < nums.length - 1) { setCur(nums[i + 1]); refs.current[nums[i + 1]]?.scrollIntoView({ block: 'nearest' }); } };
  useEffect(() => {
    const h = e => {
      if (e.target.tagName === 'INPUT') return;
      const k = E.normalizeDigits(e.key);
      if (/^[0-4]$/.test(k)) { e.preventDefault(); setAns(cur, +k); }
      else if (e.key === ' ') { e.preventDefault(); setAns(cur, 0); }
      else if ((e.key === '?' || e.key === '؟') && !hideGuess) setGuesses(g => ({ ...g, [cur]: !g[cur] }));
      else if (e.key === 'ArrowDown') setCur(nums[Math.min(nums.length - 1, nums.indexOf(cur) + 1)]);
      else if (e.key === 'ArrowUp') setCur(nums[Math.max(0, nums.indexOf(cur) - 1)]);
      else if (e.key === 'Backspace') setAnswers(a => { const x = { ...a }; delete x[cur]; return x; });
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [cur, nums]);
  const applyPaste = () => {
    const r = E.parseAnswerString(paste); if (!r.ok) return setMsg(`فقط ارقام ۰ تا ۴ مجاز است (۰ یعنی ${blankLabel}).`);
    const start = nums.indexOf(cur); const upd = {};
    r.values.forEach((v, i) => { if (nums[start + i] != null) upd[nums[start + i]] = v; });
    setAnswers(a => ({ ...a, ...upd })); setMsg(`${fa(Object.keys(upd).length)} پاسخ از تست ${BK.qLabel(b, cur)} وارد شد${r.values.length > nums.length - start ? ' (اضافه‌ها نادیده گرفته شد)' : ''}.`); setPaste('');
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card className="p-0">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-[14px] bg-[var(--card)] px-5 py-3 shadow-[0_1px_0_var(--rule)]">
          <p className="text-[16px] font-black">{title}، {b.subject}</p>
          <p className="text-[14px] text-[var(--pencil)]"><span key={filled} className="count-pop inline-block">{fa(filled)}</span> از {fa(nums.length)}</p>
        </div>
        <div className="max-h-[60vh] overflow-auto px-3 py-2">
          {nums.map(n => (
            <div key={n} ref={el => refs.current[n] = el} onClick={() => setCur(n)}
              className={`sheet-row flex items-center gap-3 rounded-[10px] px-2 py-1.5 ${n === cur ? 'is-cur bg-[var(--wash)]' : ''} ${(nums.indexOf(n) + 1) % 10 === 0 ? 'mb-2 border-b-2 border-[var(--rule)] pb-3' : ''}`}>
              <span className="mark" aria-hidden />
              <span className="w-14 text-left text-[15px] font-bold tabular-nums text-[var(--ink)]">{BK.qLabel(b, n)}</span>
              <div className="flex gap-2">{[1, 2, 3, 4].map(o => <Bubble key={o} label={fa(o)} filled={answers[n] === o} onClick={() => setAns(n, o)} title={`تست ${BK.qLabel(b, n)} گزینه ${fa(o)}`} />)}</div>
              <button type="button" onClick={() => setAns(n, 0)} className={`rounded-full px-3 min-h-[30px] text-[13px] font-bold transition ${answers[n] === 0 ? 'bg-[var(--pencil)] text-[var(--paper)]' : 'text-[var(--pencil)] hover:bg-[var(--wash)]'}`}>{blankLabel}</button>
              {compare && compare[n] != null && compare[n] !== (answers[n] || null) && <span className="rounded-full bg-[color-mix(in_srgb,var(--amber)_18%,transparent)] px-2 text-[12px] font-bold text-[var(--amber)]" title="کلید قبلی این تست">قبلاً {fa(compare[n])}</span>}
              {!hideGuess && <button type="button" onClick={() => setGuesses(g => ({ ...g, [n]: !g[n] }))} aria-pressed={!!guesses[n]} className={`mr-auto rounded-full px-3 min-h-[30px] text-[13px] font-bold ${guesses[n] ? 'bg-[var(--amber)] text-[var(--paper)]' : 'text-[var(--pencil)] hover:bg-[var(--wash)]'}`}>حدسی</button>}
              {setStars && <button type="button" onClick={e => { e.stopPropagation(); setStars(x => ({ ...x, [n]: !x[n] })); }} aria-pressed={!!stars?.[n]} title="تست خوب؛ برای مرورهای بعدی" className={`${hideGuess ? 'mr-auto ' : ''}grid h-[30px] w-[30px] place-items-center rounded-full text-[17px] ${stars?.[n] ? 'text-[var(--amber)]' : 'text-[var(--ink-faint)] hover:text-[var(--amber)]'}`}>{stars?.[n] ? '★' : '☆'}</button>}
            </div>
          ))}
        </div>
      </Card>
      <div className="grid content-start gap-4">
        <Card>
          <p className="mb-2 text-[16px] font-black">ورود سریع</p>
          <p className="mb-3 text-[14px] text-[var(--pencil)]">گزینه‌ها را پشت هم بنویس، از تست {BK.qLabel(b, cur)} پر می‌شود. ۰ یعنی {blankLabel}.</p>
          <input aria-label="رشته پاسخ" inputMode="numeric" dir="ltr" className="w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-center text-[18px] tracking-[0.3em]" placeholder="۳۱۴۰۲۲۱" value={fa(paste)} onChange={e => setPaste(E.normalizeDigits(e.target.value))} onKeyDown={e => e.key === 'Enter' && applyPaste()} />
          <Btn kind="soft" className="mt-3 w-full" onClick={applyPaste} disabled={!paste}>وارد کن</Btn>
          {msg && <p className="mt-2 text-[14px] text-[var(--ink-deep)]">{msg}</p>}
          <p className="mt-4 text-[13px] leading-6 text-[var(--pencil)]">صفحه‌کلید: ۱ تا ۴ انتخاب، فاصله یا ۰ {blankLabel}{hideGuess ? '' : '، ؟ حدسی'}، ↑↓ جابه‌جایی</p>
        </Card>
        <Btn onClick={onNext} disabled={!filled}>{filled < nums.length ? `${nextLabel} (${fa(nums.length - filled)} تست خالی = ${blankLabel})` : nextLabel}</Btn>
        {onBack && <Btn kind="ghost" onClick={onBack}>برگشت به بازه</Btn>}
        {setStars && <p className="text-[13px] text-[var(--pencil)]">☆ = تست خوب. ستاره‌دارها در مرورهای بعدی و «تست‌های خوب من» می‌آیند.</p>}
      </div>
    </div>
  );
}

function Result({ s, set, go, id, again }) {
  const ses = s.sessions.find(x => x.id === id); const b = bookById(s, ses.bookId);
  const st = sessionStats(s, ses); const nums = Object.keys(ses.answers).map(Number);
  const [analyze, setAnalyze] = useState(false);
  const [shown, setShown] = useState(0);
  useEffect(() => { let i = 0; const t = setInterval(() => { i += 1; setShown(i); if (i >= nums.length) clearInterval(t); }, 25); return () => clearInterval(t); }, []);
  const res = n => E.correct(ses.answers[n], b.keys[n] ?? null);
  const wrong = nums.filter(n => ['W', 'B'].includes(res(n)));
  const setReason = (n, rid) => set(x => ({ ...x, sessions: x.sessions.map(z => z.id !== id ? z : { ...z, reasonAt: { ...(z.reasonAt || {}), [n]: new Date().toISOString() }, reasons: { ...z.reasons, [n]: (z.reasons[n] || []).includes(rid) ? z.reasons[n].filter(r => r !== rid) : [...(z.reasons[n] || []), rid] } }) }));
  const later = () => { set(x => ({ ...x, errorTasks: [...x.errorTasks, { id: uid(), sessionId: id, status: 'open', at: new Date().toISOString() }] })); go('home'); };
  const spq = E.secPerQ(ses.minutes * 60, st);
  const lost = st.N ? E.pointsLost(st.N, st.W, st.B) : null;
  return (
    <div>
      <Head kicker={`${b.subject}، ${label(b, b.nodes.find(n => n.id === ses.nodeId))}`} title={st.P == null ? 'منتظر کلید' : pct(st.P)} />
      {ses.flags?.length > 0 && <p className="mb-4 rounded-[10px] bg-[var(--wash)] p-3 text-[15px]">این جلسه غیرعادی به نظر می‌رسد (خیلی سریع یا گزینه‌های یکسان)؛ ذخیره شد ولی پاداش ندارد.</p>}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card>
          <div className="mb-4 grid grid-cols-4 gap-3 text-center">
            {[['C', 'درست', st.C], ['W', 'غلط', st.W], ['B', 'نزده', st.B], ['U', 'بدون کلید', st.U]].map(([k, t, v]) => (
              <div key={k} className="rounded-[12px] bg-[var(--wash)] p-3"><p className="text-[28px] font-black" style={{ color: { C: 'var(--ok)', W: 'var(--bad)', B: 'var(--pencil)', U: 'var(--amber)' }[k] }}>{fa(v)}</p><p className="text-[14px]">{t}</p></div>))}
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="نتیجه تست‌ها">
            {nums.map((n, i) => { const r = res(n); const ref = `${b.id}:${n}`; const on = !!s.starred?.[ref]; return <button type="button" key={n} title={`تست ${BK.qLabel(b, n, { long: true })} · ${on ? 'ستاره را بردار' : 'ستاره بزن (تست خوب)'}`} onClick={() => set(x => { const st = { ...(x.starred || {}) }; if (st[ref]) delete st[ref]; else Object.assign(st, starEntries(b, [n])); return { ...x, starred: st }; })} className="relative grid h-9 w-9 place-items-center rounded-full text-[12px] font-bold transition-all duration-200" style={{ background: i < shown ? { C: 'var(--ok)', W: 'var(--bad)', B: 'var(--pencil)', U: 'var(--amber)' }[r] : 'var(--wash)', color: i < shown ? 'var(--paper)' : 'var(--pencil)', transform: i < shown ? 'scale(1)' : 'scale(.8)' }}>{fa(BK.printedOf(n))}{on && <span className="absolute -left-1 -top-1 text-[13px] text-[var(--amber)]">★</span>}</button>; })}
          </div>
          <p className="mt-2 text-[13px] text-[var(--pencil)]">روی هر تست بزن تا ستاره بخورد (تست خوب برای مرور).</p>
          <p className="mt-4 text-[15px] text-[var(--pencil)]">{ses.minutes ? `${fa(ses.minutes)} دقیقه، حدود ${fa(Math.round(spq))} ثانیه برای هر تست (تخمینی)` : 'زمان ثبت نشد'}{st.U ? `، ${fa(st.U)} تست وقتی کلیدش وارد شود خودکار تصحیح می‌شود` : ''}</p>
          {b.levels > 0 && (() => { const node = id => b.nodes.find(x => x.id === id); const by = {}; for (const n of nums) { const nd = b.nodes.find(x => x.levels?.some(l => n >= l.from && n <= l.to)); const L = BK.levelOf(b, nd, n); if (!L) continue; const r = res(n); const t = by[L] ||= { C: 0, N: 0 }; if (r !== 'U') { t.N++; if (r === 'C') t.C++; } } return Object.keys(by).length ? <p className="mt-2 text-[15px]">{Object.entries(by).map(([L, t]) => `سطح ${fa(L)}: ${fa(t.C)} از ${fa(t.N)}`).join(' · ')}</p> : null; })()}
          {lost && lost.total > 0 && <p className="mt-2 text-[15px]">هر غلط {fa(lost.perW.toFixed(1))} و هر نزده {fa(lost.perB.toFixed(1))} درصد از این جلسه کم کرد.</p>}
        </Card>
        <Card>
          {!wrong.length ? <p className="text-[16px] font-black">هیچ غلط یا نزده‌ای نیست 👏</p> : !analyze ? (<>
            <p className="text-[17px] font-black">{fa(wrong.length)} غلط و نزده</p>
            <p className="mt-1 mb-4 text-[15px] text-[var(--pencil)]">علتشان را الان می‌زنی یا بعداً؟ «بعداً» به کارهای امروزت اضافه می‌شود.</p>
            <div className="flex gap-2"><Btn onClick={() => setAnalyze(true)}>تحلیل خطا الان</Btn><Btn kind="line" onClick={later}>بعداً</Btn></div>
          </>) : (
            <div className="max-h-[50vh] overflow-auto">
              <ReasonList b={b} ses={ses} wrong={wrong} res={res} setReason={setReason} />
              <Btn className="mt-3 w-full" onClick={() => go('home')}>تمام</Btn>
            </div>
          )}
          <Btn kind="ghost" className="mt-3 w-full" onClick={again}>یک جلسه دیگر</Btn>
        </Card>
      </div>
    </div>
  );
}

export function ReasonList({ b, ses, wrong, res, setReason }) {
  return wrong.map(n => (
    <div key={n} className="mb-3 border-b border-[var(--rule)] pb-3">
      <p className="mb-2 text-[15px] font-bold">تست {b ? BK.qLabel(b, n) : fa(n)} <span className="text-[13px]" style={{ color: res(n) === 'W' ? 'var(--bad)' : 'var(--pencil)' }}>{res(n) === 'W' ? 'غلط' : 'نزده'}</span></p>
      <div className="flex flex-wrap gap-1.5">{REASONS.map(r => <button key={r.id} type="button" aria-pressed={(ses.reasons[n] || []).includes(r.id)} onClick={() => setReason(n, r.id)} className={`rounded-full border-2 px-3 min-h-[30px] text-[13px] font-bold ${(ses.reasons[n] || []).includes(r.id) ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--rule)]'}`}>{r.fa}</button>)}</div>
    </div>
  ));
}
