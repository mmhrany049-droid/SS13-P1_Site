// 7.1 «تست‌های قبلی»: pick a book and a question range → the answer sheet opens → tap the option you chose (or
// leave it blank) one by one. No date, no counts: the app grades with the book's key (unkeyed questions are graded
// automatically when the key arrives), wrong and blank questions go into the review queue and the analysis.
import { useMemo, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { uid, sessionStats, attemptsOf, label, bookById } from '@ss/domain/store.js';
import { RangeStep, AnswerStep, ReasonList, starEntries } from './Practice.jsx';
import * as BK from '@ss/domain/book.js';
import { Btn, Card, Chip, Head, Empty, fa, pct, jShort } from '@ss/ui/ui.jsx';

export default function History({ s, set, go }) {
  const books = s.books.filter(b => b.active !== false);
  const [step, setStep] = useState(0); const [bid, setBid] = useState(null);
  const [ranges, setRanges] = useState([]); const [answers, setAnswers] = useState({}); const [keyAnswers, setKeyAnswers] = useState({}); const [stars, setStars] = useState({});
  const [freeRange, setFreeRange] = useState(false);
  const [saved, setSaved] = useState(null); const [analyze, setAnalyze] = useState(false);
  const b = bid ? bookById(s, bid) : null;
  const nums = useMemo(() => ranges.flatMap(r => Array.from({ length: Math.max(0, r.to - r.from + 1) }, (_, i) => r.from + i)), [ranges]);
  const done = useMemo(() => { const m = new Set(); for (const a of attemptsOf(s)) if (a.bookId === bid && a.num != null) m.add(a.num); return m; }, [s.sessions, bid]);
  const already = nums.filter(n => done.has(n)).length;
  const reset = () => { setStep(0); setBid(null); setRanges([]); setAnswers({}); setKeyAnswers({}); setStars({}); setSaved(null); setAnalyze(false); setFreeRange(false); };
  const save = () => {
    const batchId = uid(); const at = new Date().toISOString();
    const ses = { id: uid(), bookId: bid, nodeId: ranges[0].nodeId, ranges, answers: Object.fromEntries(nums.map(n => [n, answers[n] ?? 0])), guesses: {}, reasons: {}, minutes: null, timeSource: 'none', at, origin: 'history', historical: true, undated: true, batchId, mixed: new Set(ranges.map(r => r.nodeId)).size >= 3 };
    const st = sessionStats(s, ses);
    set(x => ({ ...x, sessions: [...x.sessions, ses], starred: { ...(x.starred || {}), ...starEntries(b, nums.filter(n => stars[n]), at) },
      historyBatches: [...(x.historyBatches || []), { id: batchId, at, count: 1, q: nums.length, bookId: bid, kind: 'answers', C: st.C, W: st.W, B: st.B, U: st.U }] }));
    setSaved(ses.id); setKeyAnswers({}); setStep(3);
  };
  const undo = id => set(x => ({ ...x, sessions: x.sessions.filter(z => z.batchId !== id), historyBatches: x.historyBatches.filter(z => z.id !== id) }));
  const ses = saved ? s.sessions.find(x => x.id === saved) : null;
  const res = n => E.correct(ses.answers[n], b.keys[n] ?? null);
  const st = ses ? sessionStats(s, ses) : null;
  const wrong = ses ? Object.keys(ses.answers).map(Number).filter(n => ['W', 'B'].includes(res(n))) : [];
  const setReason = (n, rid) => set(x => ({ ...x, sessions: x.sessions.map(z => z.id !== saved ? z : { ...z, reasonAt: { ...(z.reasonAt || {}), [n]: new Date().toISOString() }, reasons: { ...z.reasons, [n]: (z.reasons[n] || []).includes(rid) ? z.reasons[n].filter(r => r !== rid) : [...(z.reasons[n] || []), rid] } }) }));
  return (
    <div>
      <Head kicker="تست‌های قبلی" title={step === 3 ? (st?.P == null ? 'ثبت شد، منتظر کلید' : pct(st.P)) : 'ورود گزینه‌های زده‌شده'}>{step > 0 && step < 3 && <Btn kind="ghost" onClick={reset}>از اول</Btn>}</Head>
      {step === 0 && <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <p className="mb-1 text-[18px] font-black">کدام کتاب؟</p>
          <p className="mb-4 text-[15px] text-[var(--pencil)]">تاریخ و تعداد درست و غلط لازم نیست؛ فقط گزینه‌ای که زده بودی یا خالی. تصحیح با کلید کتاب انجام می‌شود و غلط‌ها و نزده‌ها به صف مرور می‌روند.</p>
          {!books.length ? <Empty title="کتاب فعالی نداری" action={<Btn onClick={() => go('books')}>کتاب‌ها</Btn>} /> :
            <div className="flex flex-wrap gap-3">{books.map(x => { const keyed = Object.keys(x.keys || {}).length; return <button key={x.id} type="button" onClick={() => { setBid(x.id); setStep(1); }} className="rounded-[12px] border-2 border-[var(--rule)] px-4 py-3 text-right hover:border-[var(--ink)]"><b className="block text-[16px]">{x.subject}</b><span className="text-[13px] text-[var(--pencil)]">{x.title}، {x.publisher} · کلید {fa(keyed)} تست</span></button>; })}</div>}
        </Card>
        <Batches s={s} undo={undo} />
      </div>}
      {step === 1 && b && (freeRange
        ? <FreeRangeStep b={b} ranges={ranges} setRanges={setRanges} onNext={() => setStep(2)} onBack={() => setFreeRange(false)} />
        : <><RangeStep s={s} set={set} go={go} b={b} ranges={ranges} setRanges={setRanges} onNext={() => setStep(2)} /><button type="button" className="mt-3 text-right text-[14px] font-bold text-[var(--ink)] underline" onClick={() => { setFreeRange(true); setRanges([]); }}>ورود آزاد، بدون اتصال به مبحث</button></>)}
      {step === 2 && b && <>
        {already > 0 && <p className="mb-4 rounded-[12px] bg-[var(--wash)] p-3 text-[15px]">{fa(already)} تست از این بازه قبلاً ثبت شده؛ این بار به‌عنوان «دور دوم» ثبت و در تحلیل با وزن کمتر حساب می‌شود.</p>}
        <AnswerStep b={b} nums={nums} answers={answers} setAnswers={setAnswers} guesses={{}} setGuesses={() => {}} hideGuess stars={stars} setStars={setStars} nextLabel="ثبت و تصحیح" onNext={save} />
      </>}
      {step === 3 && ses && <KeyEntry b={b} nums={nums} values={keyAnswers} setValues={setKeyAnswers} onNext={() => {
        const keys = Object.fromEntries(nums.filter(n => keyAnswers[n] > 0).map(n => [n, keyAnswers[n]]));
        set(x => ({ ...x, books: x.books.map(bb => bb.id === b.id ? { ...bb, keys: { ...bb.keys, ...keys }, updatedAt: new Date().toISOString() } : bb) }));
        setStep(4);
      }} />}
      {step === 4 && ses && <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <div className="mb-4 grid grid-cols-4 gap-3 text-center">{[['درست', st.C, 'var(--ok)'], ['غلط', st.W, 'var(--bad)'], ['نزده', st.B, 'var(--pencil)'], ['بدون کلید', st.U, 'var(--amber)']].map(([t, v, c]) => <div key={t} className="rounded-[12px] bg-[var(--wash)] p-3"><p className="text-[28px] font-black" style={{ color: c }}>{fa(v)}</p><p className="text-[14px]">{t}</p></div>)}</div>
          <div className="flex flex-wrap gap-1.5">{Object.keys(ses.answers).map(Number).map(n => { const r = res(n); return <span key={n} title={`تست ${BK.qLabel(b, n, { long: true })}`} className="grid h-9 w-9 place-items-center rounded-full text-[12px] font-bold text-[var(--paper)]" style={{ background: { C: 'var(--ok)', W: 'var(--bad)', B: 'var(--pencil)', U: 'var(--amber)' }[r] }}>{fa(BK.printedOf(n))}</span>; })}</div>
          <p className="mt-4 text-[15px] text-[var(--pencil)]">{fa(wrong.length)} غلط و نزده به صف مرور اضافه شد{st.U ? `؛ ${fa(st.U)} تست وقتی کلیدش وارد شود خودکار تصحیح می‌شود` : ''}. این جلسه در «بهترین ساعت مطالعه» و «سرعت» حساب نمی‌شود چون تاریخ ندارد.</p>
        </Card>
        <Card>
          {!wrong.length ? <p className="text-[16px] font-black">هیچ غلط یا نزده‌ای نیست 👏</p> : !analyze ? <><p className="text-[17px] font-black">علت غلط‌ها را یادت هست؟</p><p className="mb-3 mt-1 text-[14px] text-[var(--pencil)]">اختیاری؛ ولی تحلیل خطا مهم‌ترین منبع پیشرفت است.</p><Btn onClick={() => setAnalyze(true)}>تحلیل خطا</Btn></>
            : <div className="max-h-[50vh] overflow-auto"><ReasonList b={b} ses={ses} wrong={wrong} res={res} setReason={setReason} /></div>}
          <div className="mt-4 flex flex-wrap gap-2"><Btn kind="soft" onClick={reset}>بازه دیگر</Btn><Btn kind="ghost" onClick={() => go('review')}>صف مرور</Btn></div>
        </Card>
      </div>}
    </div>
  );
}

function FreeRangeStep({ b, ranges, setRanges, onNext, onBack }) {
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [err, setErr] = useState('');
  const add = () => {
    const f = +E.normalizeDigits(from), t = +E.normalizeDigits(to);
    if (!f || !t || f > t) return setErr('شماره شروع و پایان را درست وارد کن.');
    if (t - f > 999) return setErr('حداکثر هزار تست در یک ثبت.');
    setRanges([{ nodeId: null, from: f, to: t }]); setErr('');
  };
  return <Card><p className="mb-1 text-[18px] font-black">ورود آزاد تست‌ها</p>
    <p className="mb-4 text-[14px] text-[var(--pencil)]">برای این ثبت لازم نیست تست‌ها به فصل یا مبحثی وصل باشند. بعداً هر وقت فهرست را ساختی می‌توانی آن‌ها را تطبیق بدهی.</p>
    <div className="flex flex-wrap items-center gap-3 text-[16px]">از<input inputMode="numeric" dir="ltr" className="w-24 rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-center" value={fa(from)} onChange={e => setFrom(E.normalizeDigits(e.target.value).replace(/\D/g, ''))} />تا<input inputMode="numeric" dir="ltr" className="w-24 rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-center" value={fa(to)} onChange={e => setTo(E.normalizeDigits(e.target.value).replace(/\D/g, ''))} /><Btn onClick={add}>افزودن بازه</Btn></div>
    {ranges.length > 0 && <p className="mt-3 rounded-[10px] bg-[var(--wash)] p-3">تست‌های {fa(ranges[0].from)} تا {fa(ranges[0].to)} از «{b.title}» آماده است.</p>}
    {err && <p role="alert" className="mt-2 font-bold text-[var(--bad)]">{err}</p>}
    <div className="mt-4 flex gap-2"><Btn disabled={!ranges.length} onClick={onNext}>باز کردن پاسخ‌برگ</Btn><Btn kind="ghost" onClick={onBack}>اتصال به مبحث</Btn></div>
  </Card>;
}

function KeyEntry({ b, nums, values, setValues, onNext }) {
  return <div><Head kicker="تست‌های قبلی" title="حالا کلید پاسخ‌نامه را وارد کن" />
    <p className="mb-4 text-[15px] text-[var(--pencil)]">اول جواب‌های خودت ذخیره شد. در این مرحله فقط گزینه درست را وارد کن؛ این مرحله هم مثل پاسخ‌برگ قبلی است و به مبحث وابسته نیست.</p>
    <AnswerStep b={b} nums={nums} answers={values} setAnswers={setValues} guesses={{}} setGuesses={() => {}} hideGuess nextLabel="تصحیح و نمایش نتیجه" onNext={onNext} />
  </div>;
}
function Batches({ s, undo }) {
  const list = [...(s.historyBatches || [])].reverse();
  return <Card className="content-start"><p className="mb-3 text-[16px] font-black">ثبت‌های قبلی</p>
    {!list.length ? <p className="text-[15px] text-[var(--pencil)]">هنوز چیزی وارد نشده.</p> :
      <ul className="grid max-h-[50vh] gap-2 overflow-auto">{list.map(h => { const b = s.books.find(x => x.id === h.bookId); return <li key={h.id} className="flex items-center justify-between gap-2 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px]"><span>{b ? `${b.subject} · ` : ''}{fa(h.q)} تست{h.kind === 'answers' ? ` · ${fa(h.C || 0)} درست، ${fa(h.W || 0)} غلط، ${fa(h.B || 0)} نزده` : ' (نسخه قدیمی، با تعداد)'}<span className="block text-[12px] text-[var(--pencil)]">ثبت {jShort(h.at)}</span></span><Btn kind="ghost" className="min-h-[34px] px-3 text-[13px]" onClick={() => confirm('این ثبت برگردانده شود؟') && undo(h.id)}>برگرداندن</Btn></li>; })}</ul>}</Card>;
}
