// SS v13 — review in sets of 20: the cards are frozen into a set, solved in the book, answers entered at once, corrected with the keys,
// and every card is rated automatically (right → good, wrong/blank → again, «not sure» → hard). The one-card page of v12 stays as «card mode».
import { useMemo, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { attemptsOf, upcomingExams, label, bookById } from '@ss/domain/store.js';
import * as R from '@ss/domain/reviewSet.js';
import * as D from '@ss/domain/redo.js';
import { Btn, Card, Chip, Head, Empty, Meter, fa } from '@ss/ui/ui.jsx';
import { Bars } from '@ss/ui/charts.jsx';

const MODES = [['today', 'مرور امروز'], ['mixed', 'مخلوط'], ['exam', 'قبل از آزمون'], ['starred', 'تست‌های خوب ★'], ['leech', 'سرسخت‌ها']];
const OPT = ['—', '۱', '۲', '۳', '۴'];
const ivl = d => (d == null ? '' : d < 1 ? 'چند ساعت دیگر' : d < 30 ? `${fa(Math.round(d))} روز دیگر` : `${fa(Math.round(d / 30))} ماه دیگر`);
const inp = 'rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px]';

export default function ReviewSets({ s, set, go }) {
  const [report, setReport] = useState(null); const open = s.reviewSet;
  if (report && !open) return <Result s={s} set={set} go={go} rep={report} onNext={() => setReport(null)} />;
  if (open) return open.startedAt && !open.entering ? <Solve s={s} set={set} /> : open.entering ? <Entry s={s} set={set} onDone={setReport} /> : <Solve s={s} set={set} />;
  return <Start s={s} set={set} go={go} />;
}

function Start({ s, set, go }) {
  const atts = useMemo(() => attemptsOf(s), [s.sessions, s.books, s.exams]); const [mode, setMode] = useState('today'); const [subj, setSubj] = useState(null); const [size, setSize] = useState(R.setSizeOf(s));
  const exam = upcomingExams(s)[0]; const exclude = R.busyRefs(s); const { list, q, st } = useMemo(() => R.listForMode(s, atts, { mode, subject: subj, exclude }), [s, atts, mode, subj]);
  const subjects = [...new Set(q.all.map(x => x.b?.subject).filter(Boolean))]; const plans = (s.redo?.plans || []).filter(p => p.status === 'active'); const n = Math.min(size, list.length); const last = (s.reviewSets || []).slice(-5).reverse();
  const create = () => { const rs = R.buildReviewSet(s, atts, { mode, subject: subj, size, now: Date.now() }); if (rs.order.length) set(x => ({ ...R.openSet(x, rs), settings: { ...x.settings, reviewSetSize: size } })); };
  return <div>
    <Head kicker="مرور فاصله‌دار" title={<>{fa(list.length)} کارت<span className="text-[var(--ink)]"> آماده</span></>}><div className="flex gap-2"><Btn kind="ghost" onClick={() => set(x => ({ ...x, settings: { ...x.settings, reviewMode: 'card' } }))}>مرور تک‌کارتی</Btn>{s.lastReviewSet && <Btn kind="ghost" onClick={() => set(x => R.undoReviewSet(x))}>برگرداندن آخرین مجموعه</Btn>}</div></Head>
    <div className="mb-3 flex flex-wrap gap-2">{MODES.map(([k, t]) => <Chip key={k} active={mode === k} onClick={() => setMode(k)} disabled={k === 'exam' && !exam}>{t}</Chip>)}</div>
    <div className="mb-5 flex flex-wrap gap-2 text-[14px]"><Chip active={!subj} onClick={() => setSubj(null)}>همه درس‌ها</Chip>{subjects.map(x => <Chip key={x} active={subj === x} onClick={() => setSubj(subj === x ? null : x)}>{x}</Chip>)}</div>
    {plans.length > 0 && <Card className="mb-5"><p className="mb-2 text-[16px] font-black">دوباره بزن · برنامه‌های فعال</p><div className="grid gap-3">{plans.map(p => { const nxt = p.sets.find(x => x.status !== 'done'); const doneN = p.sets.filter(x => x.status === 'done').length; return <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-[var(--wash)] p-3"><div><b className="text-[15px]">{p.subject}، {p.label}</b><p className="text-[13px] text-[var(--pencil)]">دور {fa(p.round)} · مجموعه {fa(doneN)} از {fa(p.sets.length)} انجام شد{p.escalation === 'textbook' ? ' · پیشنهاد: اول درسنامه را دوباره بخوان' : p.escalation === 'easier' ? ' · پیشنهاد: از تست‌های ساده‌تر شروع کن' : ''}</p></div><div className="flex gap-2">{nxt && <Btn onClick={() => set(x => { const rs = R.buildReviewSet(x, atts, { refs: nxt.refs, kind: 'redo', size: 100, now: Date.now() }); return rs.order.length ? R.openSet(x, { ...rs, planId: p.id, redoSetId: nxt.id }) : x; })}>شروع مجموعه</Btn>}<Btn kind="ghost" onClick={() => set(x => D.cancelPlan(x, p.id))}>لغو</Btn></div></div>; })}</div></Card>}
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card>{!list.length ? <Empty title={q.all.length ? 'مروری نمانده 👌' : 'هنوز کارتی نداری'} text={q.all.length ? 'سقف امروز پر شده یا کارتی سررسید ندارد.' : 'هر تست غلط یا نزده خودکار اینجا می‌آید.'} action={!q.all.length && <Btn onClick={() => go('practice')}>ثبت تست</Btn>} /> : <>
        <p className="text-[18px] font-black">مجموعهٔ {fa(n)}تایی</p><p className="mt-1 text-[14px] text-[var(--pencil)]">تست‌ها را از روی کتاب خودت حل می‌کنی، بعد همه پاسخ‌ها را یک‌جا وارد می‌کنی. بدون نمایش کلید وسط کار.</p>
        <p className="mt-3 text-[13px] font-bold">اندازهٔ مجموعه</p><div className="mt-1 flex flex-wrap gap-2">{R.REVIEW_SIZES.map(z => <Chip key={z} active={size === z} onClick={() => setSize(z)}>{fa(z)}</Chip>)}</div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Btn className="min-h-[48px] px-6" onClick={create}>ساخت مجموعه</Btn><span className="text-[14px] text-[var(--pencil)]">حدود {fa(Math.max(1, Math.round(n * 72 / 60)))} دقیقه</span></div></>}</Card>
      <div className="grid content-start gap-5"><Card><p className="mb-2 text-[16px] font-black">وضعیت مرور</p><div className="grid grid-cols-3 gap-2 text-center">{[[st.retention == null ? '—' : fa(Math.round(st.retention * 100)) + '٪', 'یادآوری ۳۰ روز'], [fa(st.streak), 'روز پیاپی'], [fa(st.todayDone) + '/' + fa(s.settings.reviewLimit ?? 40), 'امروز']].map(([v, t]) => <div key={t} className="rounded-[12px] bg-[var(--wash)] p-2"><p className="text-[20px] font-black">{v}</p><p className="text-[13px] text-[var(--pencil)]">{t}</p></div>)}</div></Card>
        {last.length > 0 && <Card><p className="mb-2 text-[16px] font-black">مجموعه‌های اخیر</p><ul className="grid gap-1 text-[14px]">{last.map(x => <li key={x.id} className="flex justify-between"><span>{x.kind === 'redo' ? 'دوباره بزن' : 'مرور'} · {fa(x.n)} تست</span><b>{x.P == null ? '—' : fa(Math.round(x.P)) + '٪'}</b></li>)}</ul></Card>}</div>
    </div></div>;
}

/** Step 2: the list of tests to solve in the book, grouped by book and sorted by number. */
function Solve({ s, set }) {
  const rs = s.reviewSet; const started = !!rs.startedAt;
  return <div><Head kicker="مجموعهٔ مرور" title={<>{fa(rs.order.length)} تست <span className="text-[var(--ink)]">از روی کتاب</span></>}><Btn kind="ghost" onClick={() => set(x => R.discardSet(x))}>انصراف از مجموعه</Btn></Head>
    <Card><p className="text-[14px] text-[var(--pencil)]">ترتیب پیشنهادی حل از بالا به پایین است (فصل‌ها به‌صورت مخلوط). پاسخ را همین‌جا نبین؛ بعد از حل، همه را یک‌جا وارد می‌کنی. {rs.meta.newCount ? `${fa(rs.meta.newCount)} کارت تازه` : ''} {rs.meta.leechCount ? `· ${fa(rs.meta.leechCount)} سرسخت` : ''}</p>
      {!started && <Btn className="mt-3" onClick={() => set(x => R.startSet(x, Date.now()))}>شروع تایمر</Btn>}
      <div className="mt-4 grid gap-4">{rs.groups.map(g => <div key={g.bookId}><p className="mb-2 text-[15px] font-black">{g.subject} · {g.title}</p><div className="flex flex-wrap gap-1.5">{g.items.map(it => <span key={it.ref} title={it.topic} className="grid min-h-[36px] min-w-[44px] place-items-center rounded-[8px] border-2 border-[var(--rule)] bg-[var(--paper)] px-2 text-[15px] font-bold">{it.label}</span>)}</div></div>)}</div>
      <div className="mt-5 flex flex-wrap gap-2"><Btn onClick={() => set(x => ({ ...(started ? x : R.startSet(x, Date.now())), reviewSet: { ...(started ? x : R.startSet(x, Date.now())).reviewSet, entering: true } }))}>حل کردم؛ ثبت پاسخ‌ها</Btn></div></Card></div>;
}

/** Step 3: all answers at once — bubbles per row, or paste one string in solving order. */
function Entry({ s, set, onDone }) {
  const rs = s.reviewSet; const [text, setText] = useState(''); const [err, setErr] = useState(''); const items = rs.groups.flatMap(g => g.items); const meta = Object.fromEntries(items.map(i => [i.ref, i])); const answered = rs.order.filter(r => rs.answers[r] !== undefined).length;
  const mins = rs.startedAt ? Math.max(1, Math.round((Date.now() - rs.startedAt) / 60000)) : null; const [minutes, setMinutes] = useState(mins);
  const patch = (k, ref, v) => set(x => ({ ...x, reviewSet: { ...x.reviewSet, [k]: { ...x.reviewSet[k], [ref]: v } } }));
  const paste = () => { const r = R.parseSetAnswers(text, rs.order); if (!r.ok) { setErr(r.error === 'E_KEY_LENGTH' ? `تعداد پاسخ‌ها ${fa(r.got)} است؛ باید ${fa(rs.order.length)} باشد (۰ یا - برای نزده).` : 'فقط ۰ تا ۴ مجاز است.'); return; } setErr(''); set(x => ({ ...x, reviewSet: { ...x.reviewSet, answers: r.answers } })); };
  const submit = partial => { const g = R.gradeReviewSet(s, { ...rs, minutes }, { now: Date.now(), durationSec: minutes ? minutes * 60 : null, partial }); if (g.duplicate) return; let s2 = g.s2; if (rs.kind === 'redo' && rs.planId) s2 = D.afterRedoSet(s2, rs, g.report, Date.now()).s; set(() => s2); onDone({ ...g.report, kind: rs.kind }); };
  return <div><Head kicker="ثبت پاسخ‌ها" title={<>{fa(answered)} از {fa(rs.order.length)} <span className="text-[var(--ink)]">پاسخ</span></>}><Btn kind="ghost" onClick={() => set(x => ({ ...x, reviewSet: { ...x.reviewSet, entering: false } }))}>برگشت به فهرست</Btn></Head>
    <Card className="mb-4"><p className="mb-1 text-[14px] font-bold">وارد کردن یک‌جا (به ترتیب حل)</p><div className="flex flex-wrap gap-2"><input dir="ltr" className={inp + ' min-w-0 flex-1 tracking-widest'} value={text} onChange={e => setText(e.target.value)} placeholder="مثلاً ۳۱۴۰۲۲۱…" aria-label="رشتهٔ پاسخ‌ها" /><Btn kind="soft" onClick={paste}>اعمال</Btn></div>{err && <p role="alert" className="mt-1 text-[13px] text-[var(--bad)]">{err}</p>}</Card>
    <Card><div className="grid gap-2">{rs.order.map((ref, i) => { const m = meta[ref]; const v = rs.answers[ref]; return <div key={ref} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-[var(--paper)] p-2"><span className="w-10 text-center text-[13px] text-[var(--pencil)]">{fa(i + 1)}</span><b className="w-14 text-[17px]">{m?.label}</b>
      <div className="flex gap-1">{[1, 2, 3, 4, 0].map(o => <button key={o} type="button" aria-pressed={v === o} aria-label={o ? `گزینه ${OPT[o]}` : 'نزده'} onClick={() => patch('answers', ref, o)} className={`h-9 w-9 rounded-full border-2 text-[14px] font-bold ${v === o ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--rule)]'}`}>{o ? OPT[o] : '—'}</button>)}</div>
      <button type="button" className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${rs.guess[ref] ? 'bg-[var(--amber)] text-[var(--paper)]' : 'bg-[var(--wash)]'}`} onClick={() => patch('guess', ref, !rs.guess[ref])}>مطمئن نیستم</button>
      <button type="button" className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${rs.mark[ref] === 'easy' ? 'bg-[var(--ok)] text-[var(--paper)]' : 'bg-[var(--wash)]'}`} onClick={() => patch('mark', ref, rs.mark[ref] === 'easy' ? null : 'easy')}>خیلی آسان</button></div>; })}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><label className="text-[14px] font-bold">زمان کل (دقیقه)<input type="number" min="1" className={inp + ' mr-2 w-20'} value={minutes ?? ''} onChange={e => setMinutes(e.target.value ? Math.max(1, +e.target.value) : null)} /></label><Btn className="min-h-[48px] px-6" disabled={answered < rs.order.length} onClick={() => submit(false)}>ثبت و تصحیح</Btn><Btn kind="soft" disabled={!answered} onClick={() => submit(true)}>ثبت نیمه‌کاره</Btn></div>
      {answered < rs.order.length && <p className="mt-2 text-[12px] text-[var(--pencil)]">برای «ثبت و تصحیح» همهٔ پاسخ‌ها لازم است؛ تست نزده را با «—» بزن.</p>}</Card></div>;
}

/** Step 4: corrected report with the next due date of every card. */
function Result({ s, set, go, rep, onNext }) {
  const rows = rep.rows; const topics = rep.byTopic.slice().sort((a, z) => z.W + z.B - (a.W + a.B)).slice(0, 5); const bad = rows.filter(r => r.result === 'W' || r.result === 'B');
  return <div><Head kicker="نتیجهٔ مجموعه" title={<>{rep.P == null ? '—' : fa(Math.round(rep.P))}٪ <span className="text-[var(--ink)]">در {fa(rows.length)} تست</span></>}><div className="flex gap-2"><Btn kind="ghost" onClick={() => { set(x => R.undoReviewSet(x)); onNext(); }}>برگرداندن</Btn><Btn onClick={onNext}>مجموعهٔ بعدی</Btn></div></Head>
    {rep.flags.length > 0 && <p role="status" className="mb-3 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px]">پاسخ‌ها خیلی سریع یا یکنواخت بود؛ نمرهٔ کارت‌ها بالاتر از «خوب» ثبت نشد و آمار با وزن کمتر حساب می‌شود.</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><div className="grid grid-cols-4 gap-2 text-center">{[[rep.C, 'درست'], [rep.W, 'غلط'], [rep.B, 'نزده'], [rep.improved, 'بهتر از قبل']].map(([v, t]) => <div key={t} className="rounded-[12px] bg-[var(--wash)] p-2"><p className="text-[22px] font-black">{fa(v)}</p><p className="text-[12px] text-[var(--pencil)]">{t}</p></div>)}</div>
        {rep.regressed > 0 && <p className="mt-2 text-[13px] text-[var(--pencil)]">{fa(rep.regressed)} تست که قبلاً درست بود این بار غلط شد؛ در مرور بعدی دوباره می‌آید.</p>}
        <p className="mb-2 mt-4 text-[14px] font-bold">نمرهٔ کارت‌ها</p><Bars rows={[[1, 'دوباره'], [2, 'سخت'], [3, 'خوب'], [4, 'آسان']].map(([k, t]) => ({ label: t, value: rep.ratings[k] }))} unit="" /></Card>
      <Card><p className="mb-2 text-[16px] font-black">مبحث‌ها در این مجموعه</p><Bars rows={topics.map(t => ({ label: t.label, value: t.n ? (100 * t.C) / t.n : 0, note: `${fa(t.C)}/${fa(t.n)}` }))} /></Card>
    </div>
    {rep.manual.length > 0 && <Card className="mt-5"><p className="mb-2 text-[16px] font-black">بدون کلید: خودت نمره بده</p>{rep.manual.map(ref => <div key={ref} className="mb-2 flex flex-wrap items-center gap-2 text-[14px]"><b>{rows.find(r => r.ref === ref)?.label}</b>{[[1, 'دوباره'], [2, 'سخت'], [3, 'خوب'], [4, 'آسان']].map(([k, t]) => <Btn key={k} kind="soft" className="min-h-[32px] px-3 text-[13px]" onClick={() => set(x => R.rateManual(x, ref, k))}>{t}</Btn>)}</div>)}</Card>}
    {bad.length > 0 && <Card className="mt-5"><p className="mb-2 text-[16px] font-black">غلط و نزده‌ها</p><div className="overflow-x-auto"><table className="w-full text-[14px]"><thead><tr className="text-right text-[var(--pencil)]"><th className="py-1">تست</th><th>مبحث</th><th>پاسخ تو</th><th>کلید</th><th>بعدی</th></tr></thead><tbody>{bad.map(r => <tr key={r.ref} className="border-t border-[var(--rule)]"><td className="py-1 font-bold">{r.label}</td><td>{r.topic}</td><td>{r.result === 'B' ? 'نزده' : OPT[r.chosen]}</td><td>{r.key ? OPT[r.key] : '—'}</td><td className="text-[var(--pencil)]">{ivl(r.nextIntervalDays)}</td></tr>)}</tbody></table></div><p className="mt-2 text-[13px] text-[var(--pencil)]">دلیل خطا را بعداً در «ثبت تست» یا تحلیل خطاها می‌توانی بنویسی؛ به مرور فاصله‌دار ربطی ندارد.</p></Card>}
  </div>;
}
