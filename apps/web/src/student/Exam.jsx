import * as BK from '@ss/domain/book.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { shrinkImage, putPhoto, getPhoto, deletePhoto } from './media.js';
import * as E from '@ss/domain/engine.js';
import { mockRounds } from '@ss/domain/schedule.js';
import { MOCK_PROVIDERS, providerName } from '@ss/domain/store.js';
import { attemptsOf, examForecast, buildPrepPlan, uid, todayStr, addDays, label, defaultTarget, examStatus, latestSitting, sittingPercent, syncMockExams, questionCoverage, isTaught } from '@ss/domain/store.js';
import { Btn, Card, Chip, Head, Meter, Interval, Empty, fa, pct, jDate, jShort } from '@ss/ui/ui.jsx';
import { activeSelectableBooks, selectableBooks, descendantTopicIds, topicLeafIds, toggleTopicSelection, topicSelectionState, selectedTopicCoverage, liveExamSections } from './examSections.js';
import BookWizard from '@ss/ui/BookWizard.jsx';

const KINDS = [['upcoming', 'پیش‌رو', 'آزمون جدیدی که قرار است بدهی'], ['done', 'برگزارشده', 'آزمون‌های جدیدی که نتیجه‌شان ثبت شده'], ['old', 'قدیمی', 'سوابق: آزمون‌هایی که قبلاً زده‌ای']];
const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 font-normal';

export default function Exam({ s, set, go }) {
  const groups = { upcoming: [], done: [], old: [] };
  for (const e of s.exams) { const st = examStatus(e); if (st === 'pending') continue; (st === 'awaiting' ? groups.upcoming : groups[st]).push(e); }
  const pending = s.exams.filter(e => e.pending).length;
  groups.upcoming.sort((a, z) => a.date.localeCompare(z.date)); groups.done.sort((a, z) => z.date.localeCompare(a.date)); groups.old.sort((a, z) => z.date.localeCompare(a.date));
  const [tab, setTab] = useState(groups.upcoming.length ? 'upcoming' : groups.old.length ? 'old' : 'upcoming');
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(null); // kind
  const list = groups[tab];
  const exam = s.exams.find(e => e.id === sel) || (!creating && list[0]) || null;
  const title = creating ? (creating === 'mock' ? 'آزمون‌های شبه‌کنکور' : creating === 'old' ? 'ثبت آزمون قدیمی' : 'آزمون جدید') : exam ? exam.title : 'آزمون‌ها';
  return (
    <div>
      <Head kicker="آزمون‌ها" title={title} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {KINDS.map(([k, t]) => <Chip key={k} active={tab === k && !creating} onClick={() => { setTab(k); setSel(null); setCreating(null); }}>{t}، {fa(groups[k].length)}</Chip>)}
        <span className="mx-1 h-6 w-[2px] bg-[var(--rule)]" aria-hidden />
        <Btn kind="soft" onClick={() => setCreating('upcoming')}>+ آزمون جدید</Btn>
        <Btn kind="ghost" onClick={() => setCreating('old')}>+ آزمون قدیمی</Btn>
        <Chip active={creating === 'mock'} onClick={() => { setCreating('mock'); setSel(null); }}>🎯 شبه‌کنکور{(s.mockSeries || []).length ? `، ${fa(s.mockSeries.length)}` : ''}</Chip>
        {pending > 0 && <button type="button" className="text-[14px] font-bold text-[var(--ink)] underline" onClick={() => go('network')}>{fa(pending)} آزمون کلاس منتظر فعال شدن</button>}
      </div>
      {!creating && list.length > 1 && <div className="mb-5 flex flex-wrap gap-2">{list.map(e => <Chip key={e.id} active={exam?.id === e.id} onClick={() => setSel(e.id)}>{e.title} · {jShort(e.date)}</Chip>)}</div>}
      {creating === 'mock' ? <MockSeries s={s} set={set} /> : creating ? <ExamForm s={s} set={set} kind={creating} onSave={e => { set(x => ({ ...x, exams: [...x.exams, e] })); setSel(e.id); setTab(e.kind === 'old' ? 'old' : 'upcoming'); setCreating(null); }} />
        : !exam ? <Card><Empty title={tab === 'old' ? 'هنوز آزمون قدیمی ثبت نکرده‌ای' : tab === 'done' ? 'هنوز نتیجه‌ای ثبت نشده' : 'آزمون پیش‌رویی نداری'} text={KINDS.find(k => k[0] === tab)[2]} action={<Btn onClick={() => setCreating(tab === 'old' ? 'old' : 'upcoming')}>ثبت آزمون</Btn>} /></Card>
        : <ExamView s={s} set={set} exam={exam} go={go} />}
    </div>
  );
}

function ExamView({ s, set, exam, go }) {
  const st = examStatus(exam);
  const liveSections = liveExamSections(s, exam);
  const del = () => { if (confirm('این آزمون و همه نتیجه‌هایش حذف شود؟')) set(x => ({ ...x, exams: x.exams.filter(e => e.id !== exam.id), placements: x.placements.filter(p => p.examId !== exam.id || p.status === 'done') })); };
  return (
    <div className="grid gap-5">
      <p className="text-[15px] text-[var(--pencil)]">{st === 'old' ? 'آزمون قدیمی' : st === 'done' ? 'برگزار شد' : st === 'awaiting' ? 'تاریخش گذشته؛ منتظر نتیجه' : 'پیش‌رو'} · {jDate(exam.date)} · {exam.sections.map(x => s.books.find(b => b.id === x.bookId)?.subject).join('، ')}
        <button type="button" className="mr-3 font-bold text-[var(--bad)]" onClick={del}>حذف</button></p>
      {exam.classId && <p className="-mt-3 text-[14px]"><span className="rounded-full bg-[var(--wash)] px-3 py-0.5 font-bold text-[var(--ink-deep)]">آزمون مشترک کلاس «{s.org?.classes?.find(c => c.id === exam.classId)?.name || 'کلاس'}»</span>{exam.unresolved > 0 && <span className="mr-2 text-[var(--amber)]">{fa(exam.unresolved)} درس این آزمون در کتاب‌های فعال تو پیدا نشد؛ کتابش را فعال کن.</span>}</p>}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[16px] font-black">اتصال زنده به کتاب تست</p><p className="mt-1 text-[13px] text-[var(--pencil)]">فهرست فصل/مبحث و وزن بودجه‌بندی از بازه‌های فعلی کتاب خوانده می‌شود؛ تغییر بازه در «کتاب‌ها» اینجا و در پیش‌بینی/برنامه اعمال می‌شود.</p></div>
          <Btn kind="soft" onClick={() => go('books')}>مدیریت کتاب‌ها و بازه‌ها</Btn>
        </div>
        {!liveSections.some(x => x.topics.length) && <p className="mt-3 text-[14px] text-[var(--amber)]">این آزمون به مبحث معتبر در کتاب تست وصل نیست؛ بودجه را دوباره پیوند بده.</p>}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {liveSections.map(sec => <div key={sec.bookId} className="rounded-[10px] bg-[var(--paper)] p-3">
            {sec.book ? <><p className="font-bold">{sec.book.subject} · {sec.book.title} <span className="font-normal text-[var(--pencil)]">({fa(sec.count)} سؤال)</span></p>
              {sec.topics.length ? <ul className="mt-2 grid gap-1 text-[13px]">{sec.topics.map(t => <li key={t.id} className="flex flex-wrap justify-between gap-2"><span>{t.title}{t.range ? <span className="text-[var(--pencil)]"> · بازه فعلی {BK.rangeLabel(sec.book, t.range.from, t.range.to)}{t.estimated ? ' (تقسیم برآوردی)' : ''}</span> : <span className="text-[var(--amber)]"> · بازه تست تعریف نشده</span>}</span><b>{fa(t.questions)} سؤال بودجه</b></li>)}</ul> : <p className="mt-2 text-[13px] text-[var(--bad)]">مبحث‌های ذخیره‌شده دیگر در فهرست این کتاب نیستند.</p>}
              {sec.coverage?.exact ? <div className="mt-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3">
                <Stat label="کل سؤال‌های این مباحث" value={sec.coverage.totalQuestions} />
                <Stat label="از مباحث تدریس‌شده" value={sec.coverage.taughtQuestions} />
                <Stat label="از مباحث تدریس‌نشده" value={sec.coverage.untaughtQuestions} />
                <Stat label="هرگز ثبت/زده نشده" value={sec.coverage.notAttemptedQuestions} />
                <Stat label="پاسخ ثبت‌شده" value={sec.coverage.answeredQuestions} />
                <Stat label="سفید ثبت‌شده" value={sec.coverage.blankQuestions} />
              </div> : <p className="mt-3 rounded-[8px] bg-[var(--wash)] p-2 text-[13px] text-[var(--amber)]">برای شمارش دقیق، بازه‌ی همه‌ی مباحث این بودجه را در کتاب تست ثبت کن؛ فعلاً {fa(sec.coverage?.knownQuestions || 0)} سؤال شماره‌دار شناخته شده و {fa(sec.coverage?.unknownTopicIds?.length || 0)} مبحث بازه‌ی دقیق ندارد.</p>}
              {!!sec.coverage?.unlocatedExamResultQuestions && <p className="mt-2 text-[12px] text-[var(--pencil)]">نتیجه‌های تجمیعی آزمون: {fa(sec.coverage.unlocatedExamResultQuestions)} سؤال نمره‌گذاری شده، اما شماره‌ی تک‌تک سؤال‌ها ثبت نشده؛ پس در شمار «دقیقاً زده‌شده» حساب نمی‌شود.</p>}
              {sec.missingTopicIds.length > 0 && <p className="mt-2 text-[12px] text-[var(--bad)]">{fa(sec.missingTopicIds.length)} پیوند مبحث قدیمی نیاز به بازبینی دارد.</p>}
            </> : <p className="text-[14px] text-[var(--bad)]">کتاب این آزمون پیدا نشد؛ پیوند قدیمی شکسته است.</p>}
          </div>)}
        </div>
      </Card>
      {st === 'upcoming' && exam.date <= todayStr() && <TookIt s={s} set={set} exam={exam} />}
      {st === 'upcoming' && <Forecast s={s} set={set} exam={exam} />}
      {st === 'awaiting' && <SittingForm s={s} exam={exam} first onSave={sit => set(x => ({ ...x, exams: x.exams.map(e => e.id === exam.id ? { ...e, predicted: snapshot(x, e), sittings: [sit] } : e) }))} />}
      {(st === 'done' || st === 'old') && <Sittings s={s} set={set} exam={exam} />}
    </div>
  );
}
/** v6: an upcoming exam becomes a past one as soon as its result (and sheet photos) are entered. */
function TookIt({ s, set, exam }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Card className="flex flex-wrap items-center justify-between gap-3"><p className="text-[16px] font-black">آزمون را دادی؟ نتیجه و عکس پاسخ‌برگ را ثبت کن تا به آزمون‌های گذشته برود.</p><Btn onClick={() => setOpen(true)}>ثبت نتیجه</Btn></Card>;
  return <SittingForm s={s} exam={exam} first onBack={() => setOpen(false)} onSave={sit => set(x => ({ ...x, exams: x.exams.map(e => e.id === exam.id ? { ...e, predicted: snapshot(x, e), sittings: [sit] } : e) }))} />;
}
function snapshot(s, exam) {
  const fc = examForecast(s, exam, attemptsOf(s), { runs: 1500 }); if (!fc) return null;
  return { total: fc.sim.total.P50, sections: Object.fromEntries(Object.entries(fc.sim.sections).map(([k, v]) => [k, v.P50])) };
}

function ExamForm({ s, set, kind, onSave }) {
  const [title, setTitle] = useState(kind === 'old' ? 'آزمون قلمچی (قدیمی)' : 'آزمون قلمچی');
  const [date, setDate] = useState(kind === 'old' ? addDays(todayStr(), -30) : addDays(todayStr(), 10));
  const [target, setTarget] = useState(() => defaultTarget(s));
  const [sections, setSections] = useState(() => activeSelectableBooks(s).map(b => ({ bookId: b.id, count: 0, nodeIds: [] })));
  const [step, setStep] = useState(0);
  const [addingBook, setAddingBook] = useState(false);
  const upd = (i, patch) => setSections(ss => ss.map((x, j) => j === i ? { ...x, ...patch } : x));
  const addBook = bookId => {
    if (!bookId || sections.some(x => x.bookId === bookId)) return;
    setSections(ss => [...ss, { bookId, count: 0, nodeIds: [] }]);
  };
  const removeBook = bookId => setSections(ss => ss.filter(x => x.bookId !== bookId));
  const activeBooks = activeSelectableBooks(s);
  const inactiveBooks = selectableBooks(s).filter(b => b.active === false);
  const availableBooks = activeBooks.filter(b => !sections.some(x => x.bookId === b.id));
  const valid = sections.map(x => {
    const book = s.books.find(b => b.id === x.bookId);
    const ids = new Set(book ? topicLeafIds(book) : []);
    return { ...x, nodeIds: x.nodeIds.filter(id => ids.has(id)) };
  }).filter(x => x.count > 0 && x.nodeIds.length);
  const dateOk = kind === 'old' ? date <= todayStr() : date >= todayStr();
  const ok = valid.length && title.trim() && dateOk;
  const base = { id: uid(), kind, title: title.trim(), date, target, sections: valid, sittings: [] };
  if (step === 1) return <SittingForm s={s} exam={base} first onSave={sit => onSave({ ...base, sittings: [sit] })} onBack={() => setStep(0)} />;
  return (
    <div className="grid gap-5">
      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-[15px] font-bold">عنوان<input className={inp} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label className="text-[15px] font-bold">{kind === 'old' ? 'تاریخ (تقریبی)' : 'تاریخ آزمون'}<input type="date" className={inp} value={date} max={kind === 'old' ? todayStr() : undefined} min={kind === 'old' ? undefined : todayStr()} onChange={e => setDate(e.target.value)} /><span className="text-[13px] font-normal text-[var(--pencil)]">{jDate(date)}</span></label>
          {kind !== 'old' ? <label className="text-[15px] font-bold">درصد هدف<input inputMode="numeric" className={inp} value={fa(target)} onChange={e => setTarget(+E.normalizeDigits(e.target.value) || 0)} /></label>
            : <p className="text-[14px] leading-7 text-[var(--pencil)]">بعد از بودجه‌بندی، جواب‌ها یا تعداد درست و غلطت را وارد می‌کنی. اگر چند بار زده‌ای، بعداً «یک بار دیگر» را بزن.</p>}
        </div>
        {!dateOk && <p className="mt-2 text-[14px] font-bold text-[var(--bad)]">{kind === 'old' ? 'تاریخ آزمون قدیمی نمی‌تواند در آینده باشد.' : 'تاریخ آزمون جدید باید امروز یا بعد از آن باشد.'}</p>}
      </Card>
      <Card>
        <p className="text-[17px] font-black">کتاب‌های آزمون و بودجه‌بندی</p>
        <p className="mt-1 text-[14px] leading-6 text-[var(--pencil)]">آزمون مستقیماً از کتاب‌های تست فعال و تقسیم‌بندی فصل/بخش/مبحث همان کتاب ساخته می‌شود. مبحث انتخابی، برای پیش‌بینی آمادگی و ساخت برنامه به همان شناسه‌ی کتاب وصل می‌ماند.</p>
        {!addingBook && <Btn kind="soft" className="mt-3" onClick={() => setAddingBook(true)}>+ ساخت/افزودن کتاب تست همین‌جا</Btn>}
        {addingBook && <div className="mt-3"><BookWizard defaults={{ grade: s.me?.grade, stream: s.me?.stream }} author={s.me?.name} onCancel={() => setAddingBook(false)} onCreate={book => {
          set(x => ({ ...x, books: [...x.books, { ...book, active: true }] }));
          setSections(ss => [...ss, { bookId: book.id, count: 0, nodeIds: [] }]);
          setAddingBook(false);
        }} /></div>}
        {!activeBooks.length && <div className="mt-3 rounded-[10px] bg-[var(--wash)] p-3 text-[14px]">
          <b>کتاب تست فعالی پیدا نشد.</b> همین‌جا بساز یا یکی از کتاب‌های غیرفعال را فعال کن.
        </div>}
        {availableBooks.length > 0 && <label className="mt-3 block max-w-xl text-[14px] font-bold">افزودن کتاب به آزمون
          <select className={inp} value="" onChange={e => { addBook(e.target.value); e.target.value = ''; }}>
            <option value="">انتخاب از کتاب‌های فعال…</option>
            {availableBooks.map(b => <option key={b.id} value={b.id}>{b.subject} · {b.title}</option>)}
          </select>
        </label>}
        {inactiveBooks.length > 0 && <div className="mt-3">
          <p className="text-[13px] font-bold text-[var(--amber)]">کتاب‌های غیرفعال در آزمون نیستند؛ با فعال‌کردن، به بودجه‌بندی افزوده می‌شوند.</p>
          <div className="mt-2 flex flex-wrap gap-2">{inactiveBooks.map(b => <Btn key={b.id} kind="ghost" className="min-h-[34px] px-3 text-[13px]" onClick={() => {
            set(x => ({ ...x, books: x.books.map(z => z.id === b.id ? { ...z, active: true } : z) }));
            addBook(b.id);
          }}>فعال کن و بیفزا: {b.subject} · {b.title}</Btn>)}</div>
        </div>}
      </Card>
      <p className="text-[16px] font-black">بودجه‌بندی: چند سؤال و از کدام تقسیم‌بندی؟</p>
      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map((sec, i) => { const b = s.books.find(x => x.id === sec.bookId); if (!b) return null; const coverage = selectedTopicCoverage(b, sec.nodeIds); const questions = questionCoverage(s, b.id, { nodeIds: sec.nodeIds }); const exceedsAvailable = questions.exact && sec.count > questions.totalQuestions; return (
          <Card key={sec.bookId}>
            <div className="mb-3 flex items-center justify-between gap-2"><p className="text-[16px] font-black">{b.subject}<span className="block text-[12px] font-normal text-[var(--pencil)]">{b.title}</span></p>
              <label className="flex items-center gap-2 text-[14px]">تعداد سؤال<input inputMode="numeric" aria-label={`تعداد سؤال ${b.subject}`} className="w-16 rounded-[8px] border-2 border-[var(--rule)] bg-[var(--paper)] px-2 py-1 text-center" value={fa(sec.count)} onChange={e => upd(i, { count: Math.min(100, +E.normalizeDigits(e.target.value) || 0) })} /></label></div>
            <div className="mb-2 flex flex-wrap gap-2"><Btn kind="soft" className="min-h-[32px] px-3 text-[13px]" onClick={() => upd(i, { nodeIds: topicLeafIds(b) })}>همه مباحث</Btn><Btn kind="soft" className="min-h-[32px] px-3 text-[13px]" onClick={() => upd(i, { nodeIds: topicLeafIds(b).filter(id => isTaught(s, b.id, id)) })}>فقط خوانده‌ها</Btn><Btn kind="ghost" className="min-h-[32px] px-3 text-[13px]" onClick={() => upd(i, { nodeIds: [] })}>پاک‌کردن</Btn><Btn kind="ghost" className="min-h-[32px] px-3 text-[13px]" onClick={() => removeBook(b.id)}>حذف کتاب</Btn></div>
            <div className="max-h-[42vh] overflow-auto rounded-[10px] bg-[var(--paper)] p-2"><TopicTree b={b} selected={sec.nodeIds} onChange={nodeIds => upd(i, { nodeIds })} /></div>
            <p className="mt-2 text-[13px] text-[var(--pencil)]">{fa(coverage.selected)} مبحث · {questions.exact ? `موجود ${fa(questions.totalQuestions)} · تدریس‌شده ${fa(questions.taughtQuestions)} · نزده ${fa(questions.notAttemptedQuestions)}` : `دقیقاً بازه‌دار ${fa(questions.knownQuestions)} · بازه نامشخص ${fa(questions.unknownTopicIds.length)} مبحث`}</p>
            {exceedsAvailable && <p role="alert" className="mt-1 text-[13px] font-bold text-[var(--bad)]">بودجه‌ی {fa(sec.count)} سؤال از کل {fa(questions.totalQuestions)} سؤال موجود بیشتر است.</p>}
          </Card>); })}
      </div>
      <div className="flex flex-wrap items-center gap-3"><Btn disabled={!ok || sections.some(sec => { const b = s.books.find(x => x.id === sec.bookId); const c = b && questionCoverage(s, b.id, { nodeIds: sec.nodeIds }); return c?.exact && sec.count > c.totalQuestions; })} onClick={() => kind === 'old' ? setStep(1) : onSave(base)}>{kind === 'old' ? 'ادامه: ورود نتیجه' : 'ثبت و دیدن آمادگی'}</Btn>
        {kind !== 'old' && <p className="text-[14px] text-[var(--pencil)]">بعد از ثبت، در «برنامه» به‌عنوان آزمون پیش‌رو می‌آید و برنامه هفتگی را تغییر می‌دهد.</p>}</div>
    </div>
  );
}

function TopicTree({ b, selected, onChange }) {
  const nodes = b.nodes.filter(n => !n.parentId).sort((a, z) => a.order - z.order);
  const toggle = (ids, checked) => onChange(toggleTopicSelection(selected, ids, checked));
  const checkbox = (id, ids, title) => <TopicCheckbox key={id} title={title} ids={ids} selected={selected} onToggle={toggle} />;
  const render = node => {
    if (node.isLeaf && node.kind === 'topic') return <div key={node.id} className="py-0.5 pr-4">{checkbox(node.id, [node.id], label(b, node))}</div>;
    const ids = descendantTopicIds(b, node.id);
    if (!ids.length) return null;
    const children = b.nodes.filter(x => x.parentId === node.id).sort((a, z) => a.order - z.order);
    return <details key={node.id} open={node.depth === 0} className="border-r-2 border-[var(--rule)] pr-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[14px] font-bold">
        {checkbox(node.id, ids, '')}<span>{node.title}</span><span className="text-[12px] font-normal text-[var(--pencil)]">({fa(ids.length)} مبحث)</span>
      </summary>
      <div className="pr-2">{children.map(render)}</div>
    </details>;
  };
  if (!nodes.length) return <p className="text-[13px] text-[var(--pencil)]">فهرست این کتاب تقسیم‌بندی ندارد.</p>;
  return <div className="grid gap-1">{nodes.map(render)}</div>;
}

function TopicCheckbox({ title, ids, selected, onToggle }) {
  const ref = useRef(null); const state = topicSelectionState(selected, ids);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'some'; }, [state]);
  return <input ref={ref} type="checkbox" aria-label={title || 'انتخاب همه مباحث این بخش'} aria-checked={state === 'some' ? 'mixed' : state === 'all'} className="h-4 w-4 shrink-0 accent-[var(--ink)]" checked={state === 'all'} disabled={state === 'empty'} onChange={e => onToggle(ids, e.target.checked)} onClick={e => e.stopPropagation()} />;
}

function Stat({ label, value }) {
  return <div className="rounded-[8px] bg-[var(--wash)] px-2 py-1.5"><span className="block text-[11px] text-[var(--pencil)]">{label}</span><b>{fa(value ?? 0)}</b></div>;
}

/** Enter one sitting: per section either C/W/B counts or answer string + key string. */
function SittingForm({ s, exam, first, onSave, onBack, repeat }) {
  const [date, setDate] = useState(repeat ? todayStr() : exam.date);
  const [mode, setMode] = useState('counts');
  const [rows, setRows] = useState(exam.sections.map(x => ({ bookId: x.bookId, n: x.count, C: '', W: '', B: '', ans: '', key: '' })));
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]); const [busy, setBusy] = useState(false); const [perr, setPerr] = useState('');
  const addPhotos = async e => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (!fs.length) return; setBusy(true); setPerr('');
    try { const ids = []; for (const f of fs.slice(0, 8)) ids.push(await putPhoto(await shrinkImage(f))); setPhotos(p => [...p, ...ids]); } catch { setPerr('ذخیره عکس ممکن نشد (مرورگر اجازه ذخیره نداد یا فایل عکس نیست).'); } setBusy(false); };
  const up = (i, p) => setRows(r => r.map((x, j) => j === i ? { ...x, ...p } : x));
  const n = v => Math.max(0, Math.floor(+E.normalizeDigits(v) || 0));
  const calc = r => {
    if (mode === 'counts') { const C = n(r.C), W = n(r.W); const B = r.B === '' ? Math.max(0, r.n - C - W) : n(r.B); return { C, W, B, err: C + W + B > r.n ? `جمع بیشتر از ${fa(r.n)} سؤال است` : null }; }
    const a = E.parseAnswerString(r.ans, r.n), k = E.parseAnswerString(r.key, r.n);
    if (!r.ans || !r.key) return { C: 0, W: 0, B: 0, err: 'جواب و کلید لازم است' };
    if (!a.ok || !k.ok) return { C: 0, W: 0, B: 0, err: `هر کدام باید ${fa(r.n)} رقم ۰ تا ۴ باشد` };
    let C = 0, W = 0, B = 0; a.values.forEach((v, i) => { if (!v) B++; else if (v === k.values[i]) C++; else W++; }); return { C, W, B, err: null, answers: a.values, key: k.values };
  };
  const res = rows.map(calc);
  const ok = res.every(x => !x.err) && res.some(x => x.C + x.W + x.B > 0) && date <= todayStr();
  const total = sittingPercent(res);
  const save = () => onSave({ id: uid(), date, at: new Date().toISOString(), isRepeat: !!repeat, note: note.trim() || null, mode, percent: total, photos, sections: rows.map((r, i) => ({ bookId: r.bookId, C: res[i].C, W: res[i].W, B: res[i].B, P: E.percent(res[i].C, res[i].W, res[i].C + res[i].W + res[i].B), ...(res[i].answers ? { answers: res[i].answers, key: res[i].key } : {}) })) });
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[18px] font-black">{repeat ? 'یک بار دیگر زدم' : first && exam.kind !== 'old' ? 'نتیجه آزمون' : 'نتیجه این بار'}</p>
          <p className="text-[14px] text-[var(--pencil)]">همه دفعه‌ها ذخیره می‌شوند؛ تحلیل از آخرین نتیجه استفاده می‌کند.</p></div>
        <div className="flex gap-2"><Chip active={mode === 'counts'} onClick={() => setMode('counts')}>تعداد درست/غلط</Chip><Chip active={mode === 'answers'} onClick={() => setMode('answers')}>جواب‌ها + کلید</Chip></div>
      </div>
      <label className="mb-4 block max-w-xs text-[15px] font-bold">تاریخ این دفعه<input type="date" max={todayStr()} className={inp} value={date} onChange={e => setDate(e.target.value)} /></label>
      <div className="grid gap-3">
        {rows.map((r, i) => { const b = s.books.find(x => x.id === r.bookId); const c = res[i]; return (
          <div key={r.bookId} className="grid gap-3 rounded-[12px] bg-[var(--wash)] p-3 lg:grid-cols-[140px_1fr_120px] lg:items-center">
            <p className="text-[16px] font-black">{b.subject} <span className="text-[13px] font-normal text-[var(--pencil)]">{fa(r.n)} سؤال</span></p>
            {mode === 'counts' ? <div className="grid grid-cols-3 gap-2">{[['C', 'درست'], ['W', 'غلط'], ['B', 'نزده']].map(([k, t]) => <label key={k} className="text-[14px] font-bold">{t}<input inputMode="numeric" className={inp + ' text-center'} placeholder={k === 'B' ? fa(Math.max(0, r.n - n(r.C) - n(r.W))) : ''} value={r[k] === '' ? '' : fa(n(r[k]))} onChange={e => up(i, { [k]: e.target.value })} /></label>)}</div>
              : <div className="grid gap-2 sm:grid-cols-2"><label className="text-[14px] font-bold">جواب‌های من<input dir="ltr" inputMode="numeric" className={inp + ' tracking-[0.2em]'} placeholder="۳۱۴۰۲…" value={fa(r.ans)} onChange={e => up(i, { ans: E.normalizeDigits(e.target.value) })} /></label><label className="text-[14px] font-bold">کلید<input dir="ltr" inputMode="numeric" className={inp + ' tracking-[0.2em]'} value={fa(r.key)} onChange={e => up(i, { key: E.normalizeDigits(e.target.value) })} /></label></div>}
            <p className="text-[15px] lg:text-left">{c.err ? <span className="font-bold text-[var(--bad)]">{c.err}</span> : <b className="text-[18px]">{pct(E.percent(c.C, c.W, c.C + c.W + c.B))}</b>}</p>
          </div>); })}
      </div>
      <label className="mt-4 block text-[15px] font-bold">توضیح (اختیاری)<input className={inp} value={note} onChange={e => setNote(e.target.value)} placeholder="مثلاً: بدون زمان زدم، کلید را از سایت گرفتم" /></label>
      <div className="mt-4"><p className="text-[15px] font-bold">عکس ورقه آزمون و پاسخ‌برگ (اختیاری)</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">{photos.map(id => <Photo key={id} id={id} onRemove={() => { deletePhoto(id).catch(() => {}); setPhotos(p => p.filter(x => x !== id)); }} />)}
          <label className="inline-flex min-h-[42px] cursor-pointer items-center rounded-[10px] border-2 border-dashed border-[var(--ink-faint)] px-4 text-[14px] font-bold text-[var(--ink)]">{busy ? 'در حال ذخیره…' : '+ عکس'}<input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={addPhotos} /></label></div>
        {perr && <p className="mt-1 text-[13px] font-bold text-[var(--bad)]">{perr}</p>}
        <p className="mt-1 text-[12px] text-[var(--pencil)]">عکس‌ها فقط روی همین دستگاه ذخیره می‌شوند (کوچک‌شده، حداکثر ۸ عکس هر بار).</p></div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><Btn disabled={!ok} onClick={save}>ثبت نتیجه</Btn>{onBack && <Btn kind="ghost" onClick={onBack}>برگشت</Btn>}
        {total != null && <p className="text-[16px]">کل: <b>{pct(total)}</b></p>}</div>
    </Card>
  );
}

function Sittings({ s, set, exam }) {
  const [adding, setAdding] = useState(false);
  const sits = [...exam.sittings].sort((a, z) => (a.date + (a.at || '')).localeCompare(z.date + (z.at || '')));
  const last = latestSitting(exam);
  const subj = id => s.books.find(b => b.id === id)?.subject;
  const removeSit = id => set(x => ({ ...x, exams: x.exams.map(e => e.id === exam.id ? { ...e, sittings: e.sittings.filter(z => z.id !== id) } : e) }));
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card>
          <p className="text-[15px] font-bold">آخرین نتیجه (در تحلیل)</p>
          <p className="text-[64px] font-black leading-none text-[var(--ink)]">{last?.percent != null ? fa(Math.round(last.percent)) : '—'}<span className="text-[22px] text-[var(--pencil)]">٪</span></p>
          <p className="mt-2 text-[14px] text-[var(--pencil)]">{fa(sits.length)} بار زده شده</p>
          {exam.predicted && last && <div className="mt-4 rounded-[12px] bg-[var(--wash)] p-3 text-[15px]"><p>پیش‌بینی: <b>{pct(exam.predicted.total)}</b>، واقعی: <b>{pct(sits[0].percent)}</b></p>
            <p className="text-[14px] text-[var(--pencil)]">فاصله: {fa(Math.abs(Math.round(sits[0].percent - exam.predicted.total)))} درصد</p></div>}
          <Btn kind="line" className="mt-4 w-full" onClick={() => setAdding(true)}>یک بار دیگر زدم</Btn>
        </Card>
        <Card>
          <p className="mb-3 text-[16px] font-black">همه دفعه‌ها</p>
          <div className="overflow-x-auto"><table className="w-full text-right text-[15px]"><thead><tr className="text-[14px] text-[var(--pencil)]"><th className="py-2 font-bold">تاریخ</th>{exam.sections.map(x => <th key={x.bookId} className="font-bold">{subj(x.bookId)}</th>)}<th className="font-bold">کل</th><th /></tr></thead>
            <tbody>{sits.map(z => <tr key={z.id} className={`border-t border-[var(--rule)] ${z.id === last.id ? 'font-bold' : ''}`}><td className="py-2">{jShort(z.date)}{z.isRepeat ? ' · تکرار' : ''}{z.id === last.id ? ' ✓' : ''}</td>
              {exam.sections.map(x => { const q = z.sections.find(y => y.bookId === x.bookId); return <td key={x.bookId}>{q ? pct(q.P) : '—'}</td>; })}<td>{pct(z.percent)}</td>
              <td><button type="button" aria-label="حذف این دفعه" className="text-[var(--pencil)]" onClick={() => removeSit(z.id)}>×</button></td></tr>)}</tbody></table></div>
          {sits.length > 1 && <p className="mt-3 text-[14px] text-[var(--pencil)]">تغییر از اولین تا آخرین بار: {fa(Math.round(last.percent - sits[0].percent))} درصد</p>}
          {sits.some(z => z.photos?.length) && <div className="mt-4"><p className="mb-2 text-[15px] font-bold">عکس‌های ورقه</p>{sits.filter(z => z.photos?.length).map(z => <div key={z.id} className="mb-2"><p className="text-[13px] text-[var(--pencil)]">{jShort(z.date)}</p><div className="flex flex-wrap gap-2">{z.photos.map(id => <Photo key={id} id={id} large />)}</div></div>)}</div>}
        </Card>
      </div>
      {adding && <SittingForm s={s} exam={exam} repeat onBack={() => setAdding(false)} onSave={sit => { set(x => ({ ...x, exams: x.exams.map(e => e.id === exam.id ? { ...e, sittings: [...e.sittings, sit] } : e) })); setAdding(false); }} />}
    </div>
  );
}

const TABS = [['untaught', 'نخوانده'], ['untested', 'نزده'], ['weak', 'ضعیف'], ['fading', 'در حال فراموشی'], ['openErrors', 'خطاهای باز']];

function Forecast({ s, set, exam }) {
  const atts = useMemo(() => attemptsOf(s), [s.sessions, s.books]);
  const fc = useMemo(() => examForecast(s, exam, atts), [s, exam, atts]);
  const [tab, setTab] = useState('untested');
  const [plan, setPlan] = useState(null); const [sent, setSent] = useState(false);
  const linked = s.placements.filter(p => p.source === 'exam:' + exam.id);
  if (!fc) return <Empty title="بودجه‌بندی خالی است" text="حداقل یک درس با تعداد سؤال و مبحث لازم است." />;
  const comps = [['A', 'درصد پیش‌بینی به هدف', 0.40], ['Cov', 'پوشش مباحث تست‌شده', 0.25], ['Ret', 'ماندگاری تا روز آزمون', 0.15], ['Mock', 'تمرین شرایط آزمون', 0.10], ['Err', 'تحلیل خطاهای باز', 0.10]];
  const list = fc.gaps[tab];
  const gapExact = key => ['untested', 'untaught'].includes(key) && fc.gaps[key].every(x => x.questionCounts?.exact);
  const gapCount = key => ['untested', 'untaught'].includes(key) && gapExact(key)
    ? fc.gaps[key].reduce((sum, x) => sum + (key === 'untested' ? x.questionCounts.notAttemptedQuestions : x.questionCounts.untaughtQuestions), 0)
    : fc.gaps[key].length;
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card>
          <p className="text-[15px] font-bold text-[var(--pencil)]">{jDate(exam.date)}، {fa(fc.daysLeft)} روز مانده</p>
          <p className="mt-2 text-[15px] font-bold">شاخص آمادگی</p>
          <p className="text-[64px] font-black leading-none text-[var(--ink)]">{fa(Math.round(fc.RI))}<span className="text-[22px] text-[var(--pencil)]"> / ۱۰۰</span></p>
          <ul className="mt-4 grid gap-3">{comps.map(([k, t, w]) => <li key={k}><div className="mb-1 flex justify-between text-[14px]"><span>{t} <span className="text-[var(--pencil)]">(وزن {fa(w * 100)}٪)</span></span><b>{fa(Math.round(fc.comps[k] * 100))}٪</b></div><Meter value={fc.comps[k]} h={7} /></li>)}</ul>
        </Card>
        <Card>
          <p className="mb-1 text-[16px] font-black">درصد احتمالی هر درس</p>
          <p className="mb-4 text-[14px] text-[var(--pencil)]">نوار = ۸۰٪ محتمل‌ترین بازه، خط پررنگ = میانه، خط نازک = هدف. فراموشی تا روز آزمون و مباحث نزده حساب شده‌اند.</p>
            <ul className="grid gap-5">
            {[...Object.entries(fc.sim.sections), ['کل', fc.sim.total]].map(([k, v]) => {
              const low = k !== 'کل' && (fc.subjAtt[k] || 0) < 30; const width = v.P90 - v.P10;
              return (
                <li key={k}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <span className={`text-[16px] ${k === 'کل' ? 'font-black' : 'font-bold'}`}>{k}</span>
                    <span className="text-[16px]"><b>{fa(Math.round(v.P10))} تا {fa(Math.round(v.P90))}</b>{!low && <span className="text-[14px] text-[var(--pencil)]">، میانه {fa(Math.round(v.P50))}</span>}
                      <span className="mr-2 rounded bg-[var(--wash)] px-2 text-[12px] text-[var(--ink-deep)]">{low ? 'کم‌داده' : width <= 10 ? 'دقیق' : width <= 20 ? 'متوسط' : 'تقریبی'}</span></span>
                  </div>
                  <Interval {...v} target={exam.target} />
                </li>);
            })}
          </ul>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <p className="text-[16px] font-black">پوشش واقعی سؤال‌ها در کتاب‌ها</p>
          <p className="mt-1 text-[13px] text-[var(--pencil)]">«نزده» یعنی سؤال شماره‌دار و انتخاب‌شده‌ای که هنوز هیچ پاسخی برایش ثبت نشده؛ سؤال سفید جدا شمرده می‌شود و تکرارهای چندجلسه‌ای دوباره‌شماری نمی‌شوند.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">{exam.sections.map(section => {
            const c = questionCoverage(s, section.bookId, { nodeIds: section.nodeIds }); const b = s.books.find(x => x.id === section.bookId);
            return <div key={section.bookId} className="rounded-[10px] bg-[var(--paper)] p-3">
              <p className="mb-2 font-bold">{b?.subject || 'درس'} · {b?.title || 'کتاب'} · بودجه آزمون {fa(section.count)} سؤال</p>
              {c.exact ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="سؤال موجود در محدوده" value={c.totalQuestions} />
                <Stat label="تدریس‌شده" value={c.taughtQuestions} />
                <Stat label="تدریس‌نشده" value={c.untaughtQuestions} />
                <Stat label="هرگز ثبت نشده" value={c.notAttemptedQuestions} />
                <Stat label="پاسخ داده‌شده" value={c.answeredQuestions} />
                <Stat label="سفید ثبت‌شده" value={c.blankQuestions} />
              </div> : <p className="text-[13px] text-[var(--amber)]">شمار دقیق کامل نیست: {fa(c.knownQuestions)} سؤال از بازه‌های ثبت‌شده و {fa(c.unknownTopicIds.length)} مبحث بدون بازه‌ی قابل‌شمارش. از «مدیریت کتاب‌ها و بازه‌ها» محدوده را کامل کن.</p>}
            </div>;
          })}</div>
        </Card>
        <Card>
          <div className="mb-4 flex flex-wrap gap-2">{TABS.map(([k, t]) => <Chip key={k} active={tab === k} onClick={() => setTab(k)}>{t}، {fa(gapCount(k))}{gapExact(k) ? ' سؤال' : ['untested', 'untaught'].includes(k) ? ' مبحث' : ' مورد'}</Chip>)}</div>
          {!list.length ? <p className="text-[15px] text-[var(--pencil)]">موردی نیست 👌</p> :
            <ul className="grid max-h-[46vh] gap-2 overflow-auto">{tab === 'openErrors' ? list.slice(0, 60).map((a, i) => <li key={i} className="flex justify-between rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px]"><span>{a.subject}، تست {BK.qLabel(s.books.find(b => b.id === a.bookId), a.num)}</span><span className="text-[var(--pencil)]">{a.result === 'W' ? 'غلط' : 'نزده'}{a.reasons.length ? '' : '، بدون تحلیل'}</span></li>) :
              list.map((g, i) => {
                const exact = g.questionCounts?.exact;
                const countText = tab === 'untested' ? (exact ? `${fa(g.questionCounts.notAttemptedQuestions)} سؤال هرگز ثبت نشده` : `بودجه آزمون ≈ ${fa(g.q)}، شمار کل نامشخص`)
                  : tab === 'untaught' ? (exact ? `${fa(g.questionCounts.untaughtQuestions)} سؤال تدریس‌نشده` : `بازه تدریس/سؤال نامشخص`)
                  : tab === 'weak' ? `تسلط ${fa(Math.round(g.m.pC * 100))}٪`
                  : `ماندگاری ${fa(Math.round(g.R * 100))}٪`;
                return <li key={i} className="flex justify-between gap-2 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px]"><span>{g.b.subject}، {label(g.b, g.node)}</span><span className="shrink-0 text-[var(--pencil)]">{countText}</span></li>;
              })}</ul>}
        </Card>
        <Card>
          <p className="mb-1 text-[16px] font-black">اولویت‌ها (درصد بیشتر در دقیقه کمتر)</p>
          <ul className="mb-4 grid gap-2">{fc.actions.slice(0, 6).map((a, i) => <li key={i} className="grid grid-cols-[1fr_auto] gap-2 text-[14px]"><span><b>{a.kind}</b>، {a.t.section}، {label(a.t.b, a.t.node)}</span><span className="text-[var(--ok)]">+{fa(a.gain.toFixed(1))} در {fa(a.minutes)} دقیقه</span></li>)}</ul>
          <Btn onClick={() => setPlan(buildPrepPlan(s, exam, fc))}>ساخت پیش‌نویس برنامه آمادگی</Btn>
          <p className="mt-2 text-[13px] text-[var(--pencil)]">سقف روزانه {fa(s.settings.weekdayMin)} دقیقه (جمعه {fa(s.settings.weekendMin)})؛ خروجی فقط پیش‌نویس است.</p>
        </Card>
      </div>
      {plan && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[18px] font-black">پیش‌نویس برنامه آمادگی</p>
            <div className="flex gap-2"><Btn onClick={() => { set(x => ({ ...x, placements: [...x.placements.filter(p => !(p.source === 'exam:' + exam.id && p.status === 'draft')), ...plan.flatMap(d => d.items.map((it, k) => ({ id: uid(), date: d.date, order: 200 + k, examId: exam.id, deadline: exam.date, bookId: it.bookId, nodeId: it.nodeId, count: it.count, u: it.gain || 1, title: it.title, minutes: it.minutes, kind: it.kind, subject: it.subject, reason: it.gain ? `+${fa(it.gain.toFixed(1))} درصد پیش‌بینی‌شده در ${fa(it.minutes)} دقیقه` : it.kind, status: 'draft', source: 'exam:' + exam.id })))] })); setPlan(null); setSent(true); }}>ارسال به برنامه</Btn><Btn kind="ghost" onClick={() => setPlan(null)}>دور بینداز</Btn></div></div>
          <PlanGrid plan={plan} />
        </Card>)}
      {!plan && (sent || linked.length > 0) && <Card><p className="text-[18px] font-black">در برنامه: {fa(linked.filter(p => p.status === 'draft').length)} پیش‌نویس، {fa(linked.filter(p => p.status !== 'draft').length)} تأییدشده</p><p className="mt-1 text-[15px] text-[var(--pencil)]">پیش‌نویس‌ها را در بخش «برنامه» ببین و تأیید کن؛ تا تأیید نکنی چیزی زمان‌بندی نمی‌شود.</p></Card>}
    </div>
  );
}

function PlanGrid({ plan }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{plan.map(d => <div key={d.date} className="rounded-[12px] bg-[var(--wash)] p-3"><p className="mb-2 text-[14px] font-black text-[var(--ink)]">{jDate(d.date)}</p><ul className="grid gap-1.5">{d.items.map((it, i) => <li key={i} className="text-[14px] leading-6">{it.title} <span className="text-[var(--pencil)]">، {fa(it.minutes)} دقیقه</span></li>)}</ul></div>)}</div>;
}

/** Thumbnail of a stored photo; click opens full size. */
function Photo({ id, onRemove, large }) {
  const [src, setSrc] = useState(null); const [big, setBig] = useState(false);
  useEffect(() => { let ok = true; getPhoto(id).then(d => ok && setSrc(d)).catch(() => {}); return () => { ok = false; }; }, [id]);
  return <span className="relative inline-block">
    <button type="button" onClick={() => setBig(true)} className={`${large ? 'h-28 w-24' : 'h-16 w-14'} overflow-hidden rounded-[8px] bg-[var(--wash)]`}>{src ? <img src={src} alt="ورقه آزمون" className="h-full w-full object-cover" /> : '…'}</button>
    {onRemove && <button type="button" aria-label="حذف عکس" onClick={onRemove} className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--graphite)] text-[12px] text-[var(--paper)]">×</button>}
    {big && src && <div role="dialog" aria-label="عکس" className="fixed inset-0 z-50 grid place-items-center bg-[rgba(20,10,15,.8)] p-4" onClick={() => setBig(false)}><img src={src} alt="ورقه آزمون" className="max-h-full max-w-full rounded-[8px]" /></div>}
  </span>;
}


/** شبه‌کنکور: series from the hub (activate only) + my own series (every N weeks, each round with its own topics). */
function MockSeries({ s, set }) {
  const books = s.books.filter(b => b.active !== false);
  const blank = () => ({ title: '', startDate: addDays(todayStr(), 7), everyWeeks: 2, count: 6, from: '07:30', to: '11:30', target: defaultTarget(s), rounds: [] });
  const [f, setF] = useState(null); const [open, setOpen] = useState(0);
  const list = s.mockSeries || [];
  const toggle = id => set(x => ({ ...x, mockSeries: x.mockSeries.map(m => m.id === id ? { ...m, active: m.active !== true } : m) }));
  const roundsOf = x => Array.from({ length: Math.max(1, Math.min(40, +x.count || 1)) }, (_, i) => x.rounds[i] || { no: i + 1, date: addDays(x.startDate, i * (+x.everyWeeks || 2) * 7), title: '', sections: [] });
  const patchRound = (i, p) => setF(x => { const rs = roundsOf(x); rs[i] = { ...rs[i], ...p }; return { ...x, rounds: rs }; });
  const save = () => { const rounds = roundsOf(f).map(r => ({ ...r, sections: r.sections.filter(sec => sec.nodeIds.length && sec.count > 0) })); set(x => syncMockExams({ ...x, mockSeries: [...(x.mockSeries || []), { id: 'my-' + uid(), ...f, rounds, active: true, own: true }] })); setF(null); };
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[18px] font-black">سری‌های شبه‌کنکور</p>{!f && <Btn kind="soft" onClick={() => setF(blank())}>+ سری شخصی</Btn>}</div>
        {!list.length && !f && <Empty title="هنوز سری‌ای نداری" text="مرکز سری‌ها را طراحی می‌کند و تو فقط فعالشان می‌کنی؛ یا خودت یک سری بساز." />}
        <ul className="grid gap-3">{list.map(m => { const rs = mockRounds(m); const next = rs.find(r => r.date >= todayStr()); return <li key={m.id} className="rounded-[12px] bg-[var(--wash)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span><b className="text-[16px]">{m.title}</b> <span className="text-[13px] text-[var(--pencil)]">{m.provider ? `${providerName(m.provider)} · ` : ''}{m.fromHub ? 'از مرکز' : 'شخصی'} · هر {fa(m.everyWeeks)} هفته · {fa(rs.length)} مرحله{next ? ` · بعدی ${jShort(next.date)}` : ''}</span></span>
            <span className="flex items-center gap-2"><Chip active={m.active === true} onClick={() => toggle(m.id)}>{m.active === true ? 'فعال ✓' : 'فعال کن'}</Chip>{!m.fromHub && <button type="button" className="text-[13px] font-bold text-[var(--bad)]" onClick={() => confirm('این سری و آزمون‌های بدون نتیجه‌اش حذف شود؟') && set(x => syncMockExams({ ...x, mockSeries: x.mockSeries.filter(z => z.id !== m.id) }))}>حذف</button>}</span></div>
          <details className="mt-2 text-[13px]"><summary className="cursor-pointer font-bold text-[var(--pencil)]">مراحل و مباحث</summary><ul className="mt-1 grid gap-1">{rs.map(r => <li key={r.no}>مرحله {fa(r.no)} · {jShort(r.date)} {fa(r.from)}–{fa(r.to)}{r.title ? ` · ${r.title}` : ''} · {r.sections.length ? r.sections.map(sec => `${s.books.find(b => b.id === sec.bookId)?.subject || sec.subject || 'درس'} ${fa(sec.count)} سؤال`).join('، ') : 'مباحث اعلام نشده'}</li>)}</ul></details></li>; })}</ul>
        <p className="mt-3 text-[13px] text-[var(--pencil)]">سری فعال: هر مرحله با مباحث خودش آزمون پیش‌رو می‌شود، روز آزمون در «روزهای من» مسدود می‌شود و برنامه‌ریز آمادگی‌اش را می‌چیند.</p>
      </Card>
      {f && <Card className="content-start">
        <p className="mb-3 text-[16px] font-black">سری شخصی جدید</p>
        <div className="grid gap-2">
          <div><p className="mb-1 text-[14px] font-bold">برگزارکننده آزمون</p><div className="flex flex-wrap gap-1.5">{MOCK_PROVIDERS.map(([k, t]) => <Chip key={k} active={f.provider === k} className="min-h-[32px] text-[13px]" onClick={() => setF({ ...f, provider: k, title: f.title || (k === 'other' ? '' : `آزمون‌های ${providerName(k)}`) })}>{t}</Chip>)}</div></div>
          <label className="text-[14px] font-bold">عنوان<input className={inp} value={f.title} placeholder="مثلاً آزمون‌های آزمایشی قلم‌چی" onChange={e => setF({ ...f, title: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2"><label className="text-[14px] font-bold">مرحله اول<input type="date" className={inp} value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value, rounds: [] })} /></label>
            <label className="text-[14px] font-bold">فاصله<select className={inp} value={f.everyWeeks} onChange={e => setF({ ...f, everyWeeks: +e.target.value, rounds: [] })}>{[1, 2, 3, 4].map(w => <option key={w} value={w}>هر {fa(w)} هفته</option>)}</select></label>
            <label className="text-[14px] font-bold">تعداد مراحل<select className={inp} value={f.count} onChange={e => setF({ ...f, count: +e.target.value })}>{Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>{fa(i + 1)}</option>)}</select></label>
            <label className="text-[14px] font-bold">هدف درصد<input inputMode="numeric" className={inp} value={fa(f.target)} onChange={e => setF({ ...f, target: +E.normalizeDigits(e.target.value) || 0 })} /></label>
            <label className="text-[14px] font-bold">شروع<input type="time" className={inp} value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label>
            <label className="text-[14px] font-bold">پایان<input type="time" className={inp} value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></label></div>
        </div>
        <div className="mt-3 grid max-h-[50vh] gap-2 overflow-auto">{roundsOf(f).map((r, i) => <div key={r.no} className="rounded-[10px] bg-[var(--wash)] p-2 text-[13px]">
          <button type="button" className="flex w-full justify-between font-bold" onClick={() => setOpen(open === i ? -1 : i)}><span>مرحله {fa(r.no)} · {jShort(r.date)}</span><span>{r.sections.reduce((a, x) => a + x.nodeIds.length, 0) ? `${fa(r.sections.reduce((a, x) => a + x.nodeIds.length, 0))} مبحث` : 'مباحث؟'}</span></button>
          {open === i && <div className="mt-2 grid gap-2">{books.map(b => { const sec = r.sections.find(x => x.bookId === b.id) || { bookId: b.id, count: 10, nodeIds: [] }; const upSec = p => patchRound(i, { sections: [...r.sections.filter(x => x.bookId !== b.id), { ...sec, ...p }] }); const coverage = selectedTopicCoverage(b, sec.nodeIds); return <details key={b.id} className="rounded-[8px] bg-[var(--card)] p-2"><summary className="cursor-pointer font-bold">{b.subject} · {b.title} ({fa(sec.nodeIds.length)} مبحث)</summary>
            <label className="mt-1 block">تعداد سؤال <input inputMode="numeric" className="w-14 rounded border border-[var(--rule)] px-1 text-center" value={fa(sec.count)} onChange={e => upSec({ count: +E.normalizeDigits(e.target.value) || 0 })} /></label>
            <div className="mb-1 flex gap-2"><Btn kind="ghost" className="min-h-[30px] px-2 text-[12px]" onClick={() => upSec({ nodeIds: topicLeafIds(b) })}>همه مباحث</Btn><Btn kind="ghost" className="min-h-[30px] px-2 text-[12px]" onClick={() => upSec({ nodeIds: [] })}>پاک‌کردن</Btn></div>
            <TopicTree b={b} selected={sec.nodeIds} onChange={nodeIds => upSec({ nodeIds })} />
            <p className="text-[12px] text-[var(--pencil)]">{fa(coverage.ranged)} مبحث دارای بازه تست · {coverage.questions ? `${fa(coverage.questions)} تست شماره‌گذاری‌شده` : 'بازه‌های تست در «کتاب‌ها» ثبت نشده'}</p></details>; })}</div>}
        </div>)}</div>
        <div className="mt-3 flex gap-2"><Btn disabled={!f.title.trim()} onClick={save}>ساخت سری (مباحث هر مرحله را بعداً هم می‌شود زد)</Btn><Btn kind="ghost" onClick={() => setF(null)}>لغو</Btn></div>
      </Card>}
    </div>
  );
}
