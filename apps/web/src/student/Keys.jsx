// v9 — «ثبت پاسخ‌نامه»: a separate system, built exactly like «ثبت تست»: درس ← کتاب ← بازه ← پاسخ‌نامه ← بررسی و ثبت.
// Keys are stored per question number (book.keys), so a key can be entered before or after the topics are defined;
// every test already done in that range is graded automatically the moment its key arrives.
import { useEffect, useMemo, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { bookById, leaves, label, mapRange, uid } from '@ss/domain/store.js';
import * as BK from '@ss/domain/book.js';
import { AnswerStep } from './Practice.jsx';
import { Btn, Card, Chip, Head, Empty, fa, jShort } from '@ss/ui/ui.jsx';

const STEPS = ['درس', 'کتاب', 'بازه', 'پاسخ‌نامه', 'بررسی و ثبت'];
const numsOf = ranges => ranges.flatMap(r => Array.from({ length: Math.max(0, r.to - r.from + 1) }, (_, i) => r.from + i));

/** What a key entry would change: new / changed / same / unknown, and how many already-done tests get graded. */
export function keyDiff(s, b, values) {
  const out = { add: [], change: [], same: 0, unknown: 0, graded: 0 };
  for (const [q, v0] of Object.entries(values)) {
    const n = +q, v = v0 || null, old = b.keys?.[n] ?? null;
    if (v == null) { out.unknown++; continue; }
    if (old == null) out.add.push(n); else if (old !== v) out.change.push({ n, old, v }); else out.same++;
  }
  const touched = new Set([...out.add, ...out.change.map(x => x.n)]);
  for (const ses of s.sessions || []) if (ses.bookId === b.id && !ses.legacy) for (const q of Object.keys(ses.answers || {})) if (touched.has(+q) && ses.answers[q]) out.graded++;
  return out;
}
/** Apply a key entry (never deletes a key with «نامعلوم»). Returns the new state + an undo record. */
export function applyKeys(s, bookId, values, ranges = []) {
  const b = bookById(s, bookId); const prev = {}; const keys = { ...(b.keys || {}) }; let count = 0;
  for (const [q, v0] of Object.entries(values)) { const v = v0 || null; if (v == null) continue; const n = +q; if (keys[n] !== v) { prev[n] = keys[n] ?? null; keys[n] = v; count++; } }
  const log = { id: uid(), at: new Date().toISOString(), bookId, ranges: ranges.map(r => ({ from: r.from, to: r.to })), count, prev };
  return { state: { ...s, books: s.books.map(x => x.id === bookId ? { ...x, keys, updatedAt: log.at } : x), keyLog: [log, ...(s.keyLog || [])].slice(0, 30), keyDraft: null }, log };
}
export function undoKeys(s, logId) {
  const log = (s.keyLog || []).find(l => l.id === logId); if (!log) return s;
  return { ...s, books: s.books.map(b => { if (b.id !== log.bookId) return b; const keys = { ...b.keys }; for (const [q, v] of Object.entries(log.prev || {})) { if (v == null) delete keys[q]; else keys[q] = v; } return { ...b, keys, updatedAt: new Date().toISOString() }; }), keyLog: s.keyLog.filter(l => l.id !== logId) };
}

export default function Keys({ s, set, go }) {
  const books = s.books.filter(b => b.active !== false);
  const subjects = [...new Set(books.map(b => b.subject))];
  const d = s.keyDraft || {};
  const [step, setStep] = useState(d.step ?? 0);
  const [subject, setSubject] = useState(d.subject ?? null);
  const [bookId, setBookId] = useState(d.bookId ?? null);
  const [ranges, setRanges] = useState(d.ranges ?? []);
  const [values, setValues] = useState(d.values ?? {});
  const [done, setDone] = useState(null);
  const b = bookId ? bookById(s, bookId) : null;
  const nums = useMemo(() => numsOf(ranges), [ranges]);
  useEffect(() => { if (done) return; set(x => ({ ...x, keyDraft: step === 0 && !subject ? null : { step, subject, bookId, ranges, values } })); }, [step, subject, bookId, ranges, values, done]);
  const reset = () => { setStep(0); setSubject(null); setBookId(null); setRanges([]); setValues({}); setDone(null); };
  const pickSubject = sub => { setSubject(sub); const bs = books.filter(x => x.subject === sub); if (bs.length === 1) { setBookId(bs[0].id); setStep(2); } else setStep(1); };
  // the answer sheet opens with the keys I already have, so a second pass is a correction, not a re-type
  const openSheet = () => { setValues(v => { const o = {}; for (const n of nums) o[n] = v[n] ?? b.keys?.[n] ?? undefined; return Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)); }); setStep(3); };

  if (done) return <Done s={s} done={done} go={go} again={reset} undo={() => { set(x => undoKeys(x, done.log.id)); reset(); }} />;
  return (
    <div>
      <Head kicker="پاسخ‌نامه" title="ثبت کلید تست‌ها">
        {(subject || ranges.length > 0) && <Btn kind="ghost" onClick={() => { reset(); set(x => ({ ...x, keyDraft: null })); }}>شروع از اول</Btn>}
      </Head>
      <ol className="steps mb-6 flex flex-wrap gap-2" aria-label="مراحل">
        {STEPS.map((t, i) => <li key={t}><button type="button" disabled={i > step} onClick={() => setStep(i === 1 && books.filter(x => x.subject === subject).length === 1 ? 0 : i)}
          className={`step flex min-h-[34px] items-center gap-2 rounded-full px-3 text-[14px] font-bold ${i === step ? 'is-on bg-[var(--ink)] text-[var(--paper)]' : i < step ? 'bg-[var(--wash)] text-[var(--ink-deep)]' : 'text-[var(--pencil)]'}`}>
          <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-current text-[12px]">{i < step ? '✓' : fa(i + 1)}</span>{t}{i === 0 && subject && i < step ? `: ${subject}` : ''}{i === 1 && b && i < step ? `: ${b.publisher}` : ''}</button></li>)}
      </ol>

      {step === 0 && <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="rise-in">
          <p className="mb-1 text-[18px] font-black">پاسخ‌نامه کدام درس؟</p>
          <p className="mb-4 text-[15px] text-[var(--pencil)]">مثل ثبت تست: درس، کتاب، شماره‌ها؛ بعد گزینه درست هر تست را روی پاسخ‌نامه می‌زنی.</p>
          {!subjects.length ? <Empty title="کتاب فعالی نداری" text="اول در «کتاب‌ها» یک کتاب تست بساز یا فعال کن." action={<Btn onClick={() => go('books')}>کتاب‌ها</Btn>} /> :
            <div className="stagger flex flex-wrap gap-3">{subjects.map(sub => <Chip key={sub} onClick={() => pickSubject(sub)} className="min-h-[52px] px-6 text-[17px]">{sub}</Chip>)}</div>}
        </Card>
        <Recent s={s} set={set} />
      </div>}

      {step === 1 && <Card className="rise-in"><p className="mb-4 text-[18px] font-black">کدام کتاب؟</p>
        <div className="stagger flex flex-wrap gap-3">{books.filter(x => x.subject === subject).map(x => { const k = Object.keys(x.keys || {}).length; return <Chip key={x.id} onClick={() => { setBookId(x.id); setStep(2); }}>{x.title}، {x.publisher} <span className="text-[12px] opacity-70">({fa(k)} کلید)</span></Chip>; })}</div></Card>}

      {step === 2 && b && <KeyRangeStep b={b} ranges={ranges} setRanges={setRanges} onNext={openSheet} />}

      {step === 3 && b && <AnswerStep b={b} nums={nums} answers={values} setAnswers={setValues} guesses={{}} setGuesses={() => {}} hideGuess blankLabel="نامعلوم" title="پاسخ‌نامه"
        compare={b.keys} nextLabel="بررسی" onNext={() => setStep(4)} onBack={() => setStep(2)} />}

      {step === 4 && b && <Review s={s} b={b} values={values} nums={nums} onBack={() => setStep(3)} onSave={() => { const r = applyKeys(s, b.id, values, ranges); set(() => r.state); setDone({ bookId: b.id, log: r.log, diff: keyDiff(s, b, values) }); }} />}
    </div>
  );
}

/** Numbers only (with «which chapter?» for per-chapter books). Unmapped numbers are fine for keys; they get a note. */
function KeyRangeStep({ b, ranges, setRanges, onNext }) {
  const scopes = BK.scopesOf(b); const multi = BK.hasScopes(b);
  const [scope, setScope] = useState(multi && b.numbering === 'perChapter' ? scopes[0]?.id ?? null : null);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [err, setErr] = useState('');
  const I = v => BK.toInternal(b, scope, +v);
  const preview = useMemo(() => { const f = +from, t = +to; return f && t && f <= t && t - f < 400 ? mapRange(b, I(f), I(t)) : null; }, [from, to, scope, b]);
  const add = (f, t) => {
    setErr(''); if (!(f > 0) || !(t > 0)) return setErr('شماره اول و آخر را بنویس.'); if (f > t) return setErr('شماره شروع باید کوچک‌تر باشد.'); if (t - f >= 400) return setErr('حداکثر ۴۰۰ تست در یک پاسخ‌نامه.');
    const taken = ranges.find(r => !(t < r.from || f > r.to)); if (taken) return setErr(`بخشی از این بازه را قبلاً اضافه کرده‌ای (${BK.rangeLabel(b, taken.from, taken.to)}).`);
    setRanges(r => [...r, { from: f, to: t }].sort((x, y) => x.from - y.from)); setFrom(''); setTo('');
  };
  const topics = leaves(b).filter(n => n.qStart != null && (!multi || BK.scopeNoOfNum(n.qStart) === BK.scopeNoById(b, scope)));
  const total = numsOf(ranges).length; const have = numsOf(ranges).filter(n => b.keys?.[n]).length;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card className="rise-in">
        <p className="mb-1 text-[18px] font-black">کلید تست چند تا چند؟</p>
        <p className="mb-4 text-[15px] text-[var(--pencil)]">شماره‌ها را همان‌طور که در پاسخ‌نامه کتاب چاپ شده بنویس. لازم نیست مبحث‌ها از قبل بازه داشته باشند.</p>
        {multi && <div className="mb-4"><p className="mb-2 text-[14px] font-bold">{b.numbering === 'perChapter' ? 'شماره‌ها هر فصل از ۱ شروع می‌شود؛ کدام فصل؟' : 'کدام بخش؟'}</p>
          <div className="flex flex-wrap gap-2">{scopes.map(x => <Chip key={x.id || 'g'} active={scope === x.id} onClick={() => setScope(x.id)} className="min-h-[34px] text-[13px]">{x.title}</Chip>)}</div></div>}
        <div className="flex flex-wrap items-center gap-3 text-[17px]">از
          <input aria-label="از تست" inputMode="numeric" autoFocus className="w-28 rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-3 text-center text-[22px] font-black" value={fa(from)} onChange={e => setFrom(E.normalizeDigits(e.target.value).replace(/\D/g, ''))} />
          تا<input aria-label="تا تست" inputMode="numeric" className="w-28 rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-3 text-center text-[22px] font-black" value={fa(to)} onChange={e => setTo(E.normalizeDigits(e.target.value).replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && add(I(from), I(to))} />
          <Btn className="min-h-[52px]" onClick={() => add(I(from), I(to))}>افزودن</Btn></div>
        {preview && !err && <div className="pop-in mt-4 rounded-[12px] bg-[var(--wash)] p-3 text-[15px]">
          {preview.parts.map(p => <p key={p.from}>{fa(BK.printedOf(p.from))} تا {fa(BK.printedOf(p.to))} ← <b>{label(b, b.nodes.find(n => n.id === p.nodeId))}</b></p>)}
          {preview.gaps.map(g => { const sp = BK.spanOfNumber(b, g.from); return <p key={'g' + g.from} className="text-[var(--amber)]">{fa(BK.printedOf(g.from))} تا {fa(BK.printedOf(g.to))} ← {sp ? `داخل «${sp.title}»، زیربخشش هنوز مشخص نیست` : 'مبحث ندارد'} (کلید ذخیره می‌شود)</p>; })}</div>}
        {err && <p role="alert" className="shake mt-3 text-[15px] font-bold text-[var(--bad)]">{err}</p>}
        {topics.length > 0 && <div className="mt-6"><p className="mb-2 text-[14px] font-bold">یا کل یک مبحث:</p>
          <div className="flex max-h-[30vh] flex-wrap gap-2 overflow-auto">{topics.map(n => { const k = (() => { let c = 0; for (let q = n.qStart; q <= n.qEnd; q++) if (b.keys?.[q]) c++; return c; })(); const all = n.qEnd - n.qStart + 1;
            return <Chip key={n.id} className="min-h-[34px] text-[13px]" onClick={() => add(n.qStart, n.qEnd)}>{label(b, n)} <span className="opacity-70">{fa(k)}/{fa(all)}</span></Chip>; })}</div></div>}
      </Card>
      <Card className="content-start rise-in">
        <p className="mb-2 text-[16px] font-black">بازه‌های این پاسخ‌نامه</p>
        {!ranges.length ? <p className="text-[15px] text-[var(--pencil)]">هنوز چیزی اضافه نشده.</p> :
          <ul className="grid gap-2">{ranges.map(r => <li key={r.from} className="pop-in flex items-center justify-between rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[15px]"><b>{BK.rangeLabel(b, r.from, r.to)}</b><button type="button" aria-label="حذف" className="px-2 text-[18px] text-[var(--bad)]" onClick={() => setRanges(x => x.filter(y => y !== r))}>×</button></li>)}</ul>}
        {total > 0 && <p className="mt-3 text-[14px] text-[var(--pencil)]">{fa(total)} تست · {fa(have)} کلید از قبل داری (روی پاسخ‌نامه پر شده می‌آید)</p>}
        <Btn className="mt-4 w-full" disabled={!ranges.length} onClick={onNext}>باز کردن پاسخ‌نامه ({fa(total)} تست)</Btn>
      </Card>
    </div>
  );
}

function Review({ s, b, values, nums, onBack, onSave }) {
  const d = keyDiff(s, b, values); const blank = nums.filter(n => !values[n]).length;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card className="rise-in">
        <p className="mb-4 text-[18px] font-black">قبل از ثبت، یک نگاه</p>
        <div className="stagger grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          {[['کلید جدید', d.add.length, 'var(--ok)'], ['تغییر کلید', d.change.length, 'var(--amber)'], ['بدون تغییر', d.same, 'var(--pencil)'], ['نامعلوم', blank, 'var(--pencil)']].map(([t, v, c]) =>
            <div key={t} className="rounded-[12px] bg-[var(--wash)] p-3"><p className="text-[28px] font-black" style={{ color: c }}>{fa(v)}</p><p className="text-[14px]">{t}</p></div>)}
        </div>
        {d.change.length > 0 && <div className="mt-4"><p className="mb-2 text-[15px] font-bold text-[var(--amber)]">این کلیدها عوض می‌شوند (تست‌های قبلی دوباره تصحیح می‌شوند):</p>
          <div className="flex flex-wrap gap-1.5">{d.change.slice(0, 60).map(x => <span key={x.n} className="rounded-full bg-[var(--wash)] px-3 py-1 text-[13px] font-bold">{BK.qLabel(b, x.n)}: {fa(x.old)} ← {fa(x.v)}</span>)}</div></div>}
        {d.graded > 0 && <p className="mt-4 rounded-[10px] bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] p-3 text-[15px] font-bold text-[var(--ok)]">{fa(d.graded)} پاسخ از تست‌هایی که قبلاً زده‌ای همین الان تصحیح می‌شود.</p>}
        {blank > 0 && <p className="mt-3 text-[14px] text-[var(--pencil)]">«نامعلوم»ها ذخیره نمی‌شوند و کلید قبلی‌شان (اگر هست) دست نمی‌خورد.</p>}
      </Card>
      <div className="grid content-start gap-3">
        <Btn disabled={!d.add.length && !d.change.length} onClick={onSave}>ثبت پاسخ‌نامه</Btn>
        <Btn kind="ghost" onClick={onBack}>برگشت به پاسخ‌نامه</Btn>
      </div>
    </div>
  );
}

function Done({ s, done, go, again, undo }) {
  const b = bookById(s, done.bookId);
  return (
    <div className="grid place-items-center py-6">
      <Card className="celebrate w-full max-w-[560px] text-center">
        <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-[var(--ok)] text-[30px] text-[var(--paper)] stamp" aria-hidden>✓</div>
        <p className="text-[24px] font-black">پاسخ‌نامه ثبت شد</p>
        <p className="mt-1 text-[15px] text-[var(--pencil)]">{b?.title}، {b?.publisher} · {fa(done.log.count)} کلید{done.diff.graded ? ` · ${fa(done.diff.graded)} پاسخ قبلی تصحیح شد` : ''}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2"><Btn onClick={again}>پاسخ‌نامه دیگر</Btn><Btn kind="soft" onClick={() => go('books')}>کتاب‌ها</Btn><Btn kind="ghost" onClick={undo}>برگرداندن این ثبت</Btn></div>
      </Card>
    </div>
  );
}

function Recent({ s, set }) {
  const log = (s.keyLog || []).slice(0, 6);
  return <Card className="content-start rise-in">
    <p className="mb-2 text-[16px] font-black">ثبت‌های اخیر</p>
    {!log.length ? <p className="text-[14px] text-[var(--pencil)]">هنوز پاسخ‌نامه‌ای ثبت نکرده‌ای.</p> :
      <ul className="grid gap-2">{log.map((l, i) => { const b = bookById(s, l.bookId); return <li key={l.id} className="rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px]">
        <b>{b?.subject || '—'}</b> · {b?.publisher} · {fa(l.count)} کلید<span className="block text-[12px] text-[var(--pencil)]">{jShort(l.at)} · {l.ranges.map(r => b ? BK.rangeLabel(b, r.from, r.to) : '').join('، ')}</span>
        {i === 0 && <button type="button" className="mt-1 text-[12px] font-bold text-[var(--bad)]" onClick={() => confirm('آخرین ثبت پاسخ‌نامه برگردانده شود؟') && set(x => undoKeys(x, l.id))}>برگرداندن</button>}</li>; })}</ul>}
  </Card>;
}
