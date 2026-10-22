import { useMemo, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { GRADES, GRADE_FA, STREAMS, subjectsFor, textbooksFor, isPending, skeletonFromTextbook, subjectLabel } from '@ss/domain/curriculum.js';
import { bookFromSSB, uid, uuid } from '@ss/domain/store.js';
import { ensureScopeNos, autoRefs, KIND_FA, NUMBERING_FA } from '@ss/domain/book.js';
import { textbookById } from '@ss/domain/curriculum.js';
import { Btn, Card, Chip, fa } from './ui.jsx';

const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px] font-normal';
const COLORS = ['#7A3B8F', '#1F5F8B', '#2F7D4F', '#B9800F', '#B3184A', '#4B5563', '#0E7490'];

/** «افزودن کتاب تست»: grade → stream → subject → school textbook (reference TOC) → book info → TOC → create.
 *  Used by the student app and by the Hub. `onCreate(book)` receives a ready book (inactive if `inactive`). */
export default function BookWizard({ defaults = {}, onCreate, onCancel, inactive = false, author }) {
  // v9: opened from «کتاب‌های درسی» with a textbook already chosen → jump straight to the book info step
  const pre = defaults.textbookId ? textbookById(defaults.textbookId) : null;
  const [step, setStep] = useState(pre ? 3 : 0);
  const [grade, setGrade] = useState(pre?.grade || defaults.grade || 11);
  const [stream, setStream] = useState(pre ? (pre.streams.includes(defaults.stream) ? defaults.stream : pre.streams[0]) : defaults.stream || 'rf');
  const [subjectId, setSubjectId] = useState(pre?.subjectId || null);
  const [tbId, setTbId] = useState(pre?.id || null);
  const [title, setTitle] = useState(''); const [publisher, setPublisher] = useState('');
  const [numbering, setNumbering] = useState('global'); const [levels, setLevels] = useState(0);
  const [mode, setMode] = useState('textbook'); // textbook | ssb | empty
  const [ssb, setSsb] = useState(''); const [err, setErr] = useState('');
  const [nodes, setNodes] = useState([]);
  const subjects = subjectsFor(grade, stream);
  const tbs = subjectId ? textbooksFor(grade, stream, subjectId) : [];
  const tb = textbookById(tbId);
  const pending = isPending(tb);

  const toToc = () => {
    setErr('');
    if (mode === 'ssb') {
      const r = bookFromSSB(ssb.startsWith('#') || ssb.includes('\n=') || ssb.startsWith('=') ? ssb : ssb, {});
      if (r.errors.length) return setErr(`خط ${fa(r.errors[0].line)} قالب درستی ندارد (هر خط با = شروع شود).`);
      if (!r.book.nodes.length) return setErr('فهرستی پیدا نشد.');
      setNodes(r.book.nodes);
    } else if (mode === 'textbook' && !pending) setNodes(skeletonFromTextbook(tb).map(n => ({ ...n, qStart: null, qEnd: null })));
    else setNodes([{ id: 'n1', title: 'فصل ۱', kind: 'topic', depth: 0, parentId: null, order: 0, isLeaf: true, qStart: null, qEnd: null }]);
    setStep(4);
  };
  const create = () => {
    const now = new Date().toISOString();
    const fixed = nodes.map((n, i) => ({ ...n, order: i, isLeaf: !nodes.some(c => c.parentId === n.id) }));
    let b = { id: uid(), uid: uuid(), title: title.trim() || `${tb?.title || subjectLabel(subjects.find(x => x.id === subjectId)?.fa)} تست`, publisher: publisher.trim(), subject: subjectLabel(tb?.title) || subjects.find(x => x.id === subjectId)?.fa,
      subjectId, grade, stream, textbookId: tbId, numbering, levels, active: !inactive, origin: 'user', author: author || null, color: COLORS[Math.floor(Math.random() * COLORS.length)],
      nodes: fixed, keys: {}, createdAt: now, updatedAt: now };
    b = ensureScopeNos(b); if (tb && !pending) b = autoRefs(b, tb);
    onCreate(b);
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-[18px] font-black">افزودن کتاب تست</p>
        <p className="text-[14px] text-[var(--pencil)]">مرحله {fa(step + 1)} از ۵</p></div>

      {step === 0 && <div className="grid gap-4">
        <div><p className="mb-2 text-[15px] font-bold">پایه تحصیلی</p><div className="flex flex-wrap gap-2">{GRADES.map(g => <Chip key={g} active={grade === g} onClick={() => { setGrade(g); setSubjectId(null); setTbId(null); }}>{GRADE_FA[g]}</Chip>)}</div></div>
        <div><p className="mb-2 text-[15px] font-bold">رشته</p><div className="flex flex-wrap gap-2">{Object.entries(STREAMS).map(([k, t]) => <Chip key={k} active={stream === k} onClick={() => { setStream(k); setSubjectId(null); setTbId(null); }}>{t}</Chip>)}</div></div>
        <div className="flex gap-2"><Btn onClick={() => setStep(1)}>ادامه</Btn>{onCancel && <Btn kind="ghost" onClick={onCancel}>لغو</Btn>}</div>
      </div>}

      {step === 1 && <div className="grid gap-4">
        <p className="text-[15px] font-bold">کدام درس؟ <span className="font-normal text-[var(--pencil)]">({GRADE_FA[grade]}، {STREAMS[stream]})</span></p>
        <div className="flex flex-wrap gap-2">{subjects.map(x => <Chip key={x.id} active={subjectId === x.id} onClick={() => { setSubjectId(x.id); const t = textbooksFor(grade, stream, x.id); setTbId(t.length === 1 ? t[0].id : null); }}>{x.fa}</Chip>)}</div>
        {subjectId && tbs.length > 1 && <div><p className="mb-2 text-[15px] font-bold">کتاب درسی مرجع</p><div className="flex flex-wrap gap-2">{tbs.map(t => <Chip key={t.id} active={tbId === t.id} onClick={() => setTbId(t.id)}>{t.title}</Chip>)}</div></div>}
        {tb && <p className="text-[14px] text-[var(--pencil)]">مرجع فهرست: <b>{tb.title}</b> (چاپ {fa(tb.edition || '۱۴۰۵')}){pending ? ' · فهرستش هنوز وارد نشده' : ` · ${fa(tb.nodes.filter(n => n.depth === 0).length)} فصل`}</p>}
        <div className="flex gap-2"><Btn disabled={!tbId} onClick={() => setStep(2)}>ادامه</Btn><Btn kind="ghost" onClick={() => setStep(0)}>برگشت</Btn></div>
      </div>}

      {step === 2 && <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[15px] font-bold">نام کتاب تست<input className={inp} placeholder={`مثلاً ${tb?.title} تست`} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label className="text-[15px] font-bold">ناشر<input className={inp} placeholder="خیلی سبز، الگو، مبتکران، گاج…" value={publisher} onChange={e => setPublisher(e.target.value)} /></label>
        </div>
        <div><p className="mb-2 text-[15px] font-bold">شماره تست‌ها</p><div className="flex flex-wrap gap-2">{Object.entries(NUMBERING_FA).map(([k, t]) => <Chip key={k} active={numbering === k} onClick={() => setNumbering(k)}>{t}</Chip>)}</div>
          <p className="mt-1 text-[13px] text-[var(--pencil)]">مثل مبتکران شیمی که شماره هر فصل از ۱ شروع می‌شود، «هر فصل از ۱» را بزن.</p></div>
        <div><p className="mb-2 text-[15px] font-bold">سطح سختی</p><div className="flex flex-wrap gap-2"><Chip active={!levels} onClick={() => setLevels(0)}>ندارد</Chip><Chip active={levels === 3} onClick={() => setLevels(3)}>۳ سطح (۱ آسان، ۲ متوسط، ۳ سخت)</Chip></div>
          <p className="mt-1 text-[13px] text-[var(--pencil)]">مثل نشر الگو که تست‌های هر بخش سه سطح دارند.</p></div>
        <div className="flex gap-2"><Btn onClick={() => setStep(3)}>ادامه</Btn><Btn kind="ghost" onClick={() => setStep(1)}>برگشت</Btn></div>
      </div>}

      {step === 3 && <div className="grid gap-4">
        <p className="text-[15px] font-bold">فهرست کتاب تست از کجا بیاید؟</p>
        <div className="flex flex-wrap gap-2">
          <Chip active={mode === 'textbook'} disabled={pending} onClick={() => setMode('textbook')}>از فهرست کتاب درسی ({tb?.title})</Chip>
          <Chip active={mode === 'ssb'} onClick={() => setMode('ssb')}>چسباندن متن SSB</Chip>
          <Chip active={mode === 'empty'} onClick={() => setMode('empty')}>خالی، خودم می‌سازم</Chip></div>
        {mode === 'textbook' && !pending && <p className="text-[14px] text-[var(--pencil)]">فصل‌ها و درس‌های کتاب درسی به‌عنوان مبحث ساخته می‌شوند و هر مبحث به درس مرجعش وصل می‌ماند (برای مقایسه با کتاب‌های دیگر و رشته دیگر). بعد می‌توانی بخش، تست‌های مخلوط و آزمون اضافه کنی.</p>}
        {mode === 'ssb' && <><textarea dir="rtl" rows={9} className={inp + ' font-mono text-[14px]'} placeholder={'= فصل ۱: …\n== درس ۱: …\n=== بخش ۱: …\n== آزمون فصل ۱ {آزمون|شماره‌جدا}'} value={ssb} onChange={e => setSsb(e.target.value)} />
          <p className="text-[13px] text-[var(--pencil)]">برچسب‌ها: {'{مخلوط}'} {'{چکاپ}'} {'{جامع}'} {'{آزمون}'} {'{درسنامه}'} · {'|شماره‌جدا'} یعنی این بخش شماره‌گذاری خودش را دارد.</p></>}
        {err && <p role="alert" className="text-[14px] font-bold text-[var(--bad)]">{err}</p>}
        <div className="flex gap-2"><Btn disabled={mode === 'ssb' && !ssb.trim()} onClick={toToc}>ادامه</Btn><Btn kind="ghost" onClick={() => setStep(2)}>برگشت</Btn></div>
      </div>}

      {step === 4 && <div className="grid gap-4">
        <p className="text-[15px] font-bold">فهرست را مرتب کن <span className="font-normal text-[var(--pencil)]">({fa(nodes.length)} ردیف؛ بعداً هم در «کتاب‌ها» قابل ویرایش است)</span></p>
        <TocEditor nodes={nodes} setNodes={setNodes} />
        {inactive && <p className="text-[14px] text-[var(--pencil)]">کتاب‌هایی که مرکز می‌فرستد برای هر کاربر غیرفعال می‌رسند تا خودش فعالشان کند.</p>}
        <div className="flex gap-2"><Btn disabled={!nodes.length} onClick={create}>ساخت کتاب</Btn><Btn kind="ghost" onClick={() => setStep(3)}>برگشت</Btn></div>
      </div>}
    </Card>
  );
}

/** Minimal tree editor: rename, indent/outdent, add topic/exam rows, delete. Exam-like rows can have their own numbering. */
export function TocEditor({ nodes, setNodes }) {
  const [sel, setSel] = useState(null);
  const ids = useMemo(() => new Set(nodes.map(n => n.id)), [nodes]);
  const newId = () => { let i = nodes.length + 1; while (ids.has('n' + i)) i++; return 'n' + i; };
  const fixParents = arr => { const st = []; return arr.map(n => { st.length = n.depth; const p = st[n.depth - 1]; const x = { ...n, parentId: n.depth ? p?.id ?? null : null }; st[n.depth] = x; return x; }).map((n, i, a) => ({ ...n, order: i, isLeaf: !a.some(c => c.parentId === n.id) })); };
  const upd = (i, patch) => setNodes(fixParents(nodes.map((n, j) => j === i ? { ...n, ...patch } : n)));
  const insert = (i, n) => setNodes(fixParents([...nodes.slice(0, i + 1), n, ...nodes.slice(i + 1)]));
  const del = i => setNodes(fixParents(nodes.filter((_, j) => j !== i).map((n, j, a) => j > 0 && n.depth > a[j - 1].depth + 1 ? { ...n, depth: a[j - 1].depth + 1 } : n)));
  return (
    <div className="max-h-[52vh] overflow-auto rounded-[12px] border-2 border-[var(--rule)]">
      {nodes.map((n, i) => (
        <div key={n.id} className={`flex flex-wrap items-center gap-2 border-b border-[var(--rule)] px-2 py-1.5 ${sel === n.id ? 'bg-[var(--wash)]' : ''}`} style={{ paddingRight: 8 + n.depth * 18 }} onClick={() => setSel(n.id)}>
          <input aria-label="عنوان" className={`min-w-[160px] flex-1 rounded-[6px] bg-transparent px-1 py-1 text-[14px] ${n.depth === 0 ? 'font-black' : ''}`} value={n.title} onChange={e => upd(i, { title: e.target.value })} />
          <select aria-label="نوع" className="rounded-[6px] border border-[var(--rule)] bg-[var(--paper)] px-1 text-[13px]" value={n.kind} onChange={e => upd(i, { kind: e.target.value })}>{Object.entries(KIND_FA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          {n.kind !== 'topic' && n.kind !== 'theory' && <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={!!n.ownNumbering} onChange={e => upd(i, { ownNumbering: e.target.checked })} />شماره جدا</label>}
          <button type="button" aria-label="بیرون‌تر" className="px-1 text-[var(--pencil)] disabled:opacity-30" disabled={!n.depth} onClick={() => upd(i, { depth: n.depth - 1 })}>→</button>
          <button type="button" aria-label="داخل‌تر" className="px-1 text-[var(--pencil)] disabled:opacity-30" disabled={!i || n.depth > nodes[i - 1].depth || n.depth >= 3} onClick={() => upd(i, { depth: n.depth + 1 })}>←</button>
          <button type="button" className="px-1 text-[12px] font-bold text-[var(--ink)]" onClick={() => insert(i, { id: newId(), title: 'بخش جدید', kind: 'topic', depth: Math.min(3, n.depth + 1), qStart: null, qEnd: null })}>+ زیربخش</button>
          <button type="button" className="px-1 text-[12px] font-bold text-[var(--ink)]" onClick={() => insert(i, { id: newId(), title: 'آزمون', kind: 'final', depth: Math.max(1, n.depth), ownNumbering: false, qStart: null, qEnd: null })}>+ آزمون</button>
          <button type="button" aria-label="حذف" className="px-1 text-[16px] text-[var(--pencil)]" onClick={() => del(i)}>×</button>
        </div>))}
      <button type="button" className="w-full p-2 text-[14px] font-bold text-[var(--ink)]" onClick={() => setNodes(fixParents([...nodes, { id: newId(), title: `فصل ${fa(nodes.filter(n => !n.depth).length + 1)}`, kind: 'topic', depth: 0, qStart: null, qEnd: null }]))}>+ فصل</button>
    </div>
  );
}
