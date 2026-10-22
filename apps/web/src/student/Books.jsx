import { useMemo, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { leaves, rangeOverlap, label, todayStr, attemptsOf, topicMastery } from '@ss/domain/store.js';
import * as BK from '@ss/domain/book.js';
import { textbookById, GRADE_FA, STREAMS } from '@ss/domain/curriculum.js';
import { compareFor } from './exchange.js';
import BookWizard, { TocEditor } from '@ss/ui/BookWizard.jsx';
import { growPlan, growBook } from './grow.js';
import { Btn, Card, Chip, Head, Meter, Empty, fa } from '@ss/ui/ui.jsx';

const inp = 'w-20 rounded-[8px] border-2 border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-center';

export default function Books({ s, set, go }) {
  const active = s.books.filter(b => b.active !== false), inactive = s.books.filter(b => b.active === false);
  const [bid, setBid] = useState(active[0]?.id || s.books[0]?.id);
  // v9: «کتاب‌های درسی» → «ساخت کتاب تست» opens the wizard with that textbook already chosen
  const [preTb] = useState(() => { try { const v = sessionStorage.getItem('ss-new-book-tb'); sessionStorage.removeItem('ss-new-book-tb'); return v; } catch { return null; } });
  const [adding, setAdding] = useState(!!preTb);
  const b = s.books.find(x => x.id === bid);
  const setActive = (id, on) => set(x => ({ ...x, books: x.books.map(bb => bb.id === id ? { ...bb, active: on } : bb) }));
  return (
    <div>
      <Head kicker="کتاب‌ها" title="قفسه و بازه‌ها"><div className="flex flex-wrap gap-2"><Btn kind="soft" onClick={() => go('textbooks')}>کتاب‌های درسی</Btn><Btn onClick={() => setAdding(true)}>+ افزودن کتاب تست</Btn></div></Head>
      {adding ? <BookWizard defaults={{ grade: s.me?.grade, stream: s.me?.stream, textbookId: preTb }} author={s.me?.name} onCancel={() => setAdding(false)}
        onCreate={nb => { set(x => ({ ...x, books: [...x.books, nb] })); setBid(nb.id); setAdding(false); }} /> : <>
        <div className="mb-3 flex flex-wrap gap-2">{active.map(x => <Chip key={x.id} active={x.id === bid} onClick={() => setBid(x.id)}>{x.title}، {x.publisher}</Chip>)}</div>
        {inactive.length > 0 && <Card className="mb-5"><p className="mb-2 text-[15px] font-black">کتاب‌های غیرفعال {fa(inactive.length)}</p>
          <p className="mb-3 text-[14px] text-[var(--pencil)]">کتاب‌هایی که از مرکز رسیده‌اند یا خاموششان کرده‌ای. تا فعال نکنی در ثبت تست، برنامه و آزمون‌ها نمی‌آیند.</p>
          <ul className="grid gap-2 sm:grid-cols-2">{inactive.map(x => <li key={x.id} className="flex items-center justify-between gap-2 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px]">
            <button type="button" className="text-right" onClick={() => setBid(x.id)}><b>{x.title}</b>، {x.publisher}<span className="block text-[12px] text-[var(--pencil)]">{x.origin === 'hub' ? 'از مرکز' : 'خاموش'}{x.grade ? ` · ${GRADE_FA[x.grade]}` : ''}{x.author ? ` · ${x.author}` : ''}</span></button>
            <Btn kind="soft" className="min-h-[34px] px-3 text-[13px]" onClick={() => { setActive(x.id, true); setBid(x.id); }}>فعال کن</Btn></li>)}</ul></Card>}
        {b && <BookEditor key={b.id} s={s} set={set} go={go} b={b} setActive={setActive} />}
      </>}
    </div>
  );
}

function BookEditor({ s, set, go, b, setActive }) {
  const [view, setView] = useState(() => (BK.rangeProgress(b).topsDone < BK.rangeProgress(b).tops ? 'big' : 'small')); // big | small | all
  const [edit, setEdit] = useState(null); // {id, from, to, levels:[{L,from,to}]}
  const [covers, setCovers] = useState(null); // node id whose coverage is being edited
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [toc, setToc] = useState(null);
  const atts = useMemo(() => attemptsOf(s), [s.sessions, s.books, s.exams]);
  const mast = useMemo(() => topicMastery(s, atts).res, [atts]);
  const ls = leaves(b);
  const withRange = ls.filter(n => n.qStart != null);
  const totalQ = withRange.reduce((a, n) => a + n.qEnd - n.qStart + 1, 0);
  const keyed = withRange.reduce((a, n) => { let k = 0; for (let q = n.qStart; q <= n.qEnd; q++) if (b.keys[q]) k++; return a + k; }, 0);
  const allKeys = Object.keys(b.keys || {}).length;
  const prog = BK.rangeProgress(b);
  const upd = fn => set(x => ({ ...x, books: x.books.map(bb => bb.id === b.id ? { ...fn(bb), updatedAt: new Date().toISOString() } : bb) }));
  const taught = s.taught[b.id] || {};
  const tb = textbookById(b.textbookId);
  const toggleTaught = id => set(x => { const m = { ...(x.taught[b.id] || {}) }; if (m[id]) delete m[id]; else m[id] = { state: 'taught', at: todayStr() }; return { ...x, taught: { ...x.taught, [b.id]: m } }; });
  const scopeOf = n => BK.scopeNodeOf(b, n);
  const P = q => BK.printedOf(q);
  const openKeys = () => { set(x => ({ ...x, keyDraft: { step: 2, subject: b.subject, bookId: b.id, ranges: [], values: {} } })); go('keys'); };

  const open = n => { setErr(''); const r = BK.rangeOfNode(n); setEdit({ id: n.id, from: r ? P(r.from) : '', to: r ? P(r.to) : '',
    levels: [1, 2, 3].map(L => { const x = n.levels?.find(z => z.L === L); return { L, from: x ? P(x.from) : '', to: x ? P(x.to) : '' }; }) }); };
  /** «اول بخش بزرگ»: a topic inside a chapter without a span opens the chapter first. */
  const openGuarded = n => { const par = n.parentId ? b.nodes.find(x => x.id === n.parentId) : null; if (n.isLeaf && par && !par.span) { setMsg(`اول بازه «${par.title}» را مشخص کن؛ بعد زیربخش‌هایش.`); return open(par); } setMsg(''); open(n); };
  const saveEdit = () => {
    setErr(''); const n = b.nodes.find(x => x.id === edit.id); const sc = scopeOf(n); const I = v => BK.toInternal(b, sc?.id, +E.normalizeDigits(v));
    let from, to, levels;
    if (n.isLeaf && b.levels && !BK.isExamLike(n)) {
      const r = BK.normalizeLevels(edit.levels.filter(l => l.from !== '' && l.to !== '').map(l => ({ L: l.L, from: I(l.from), to: I(l.to) })));
      if (!r.ok) return setErr(r.error); ({ levels, qStart: from, qEnd: to } = r);
    } else { from = I(edit.from); to = I(edit.to); if (!P(from) || !P(to) || from > to) return setErr('بازه نامعتبر است.'); }
    if (n.isLeaf) { const ov = rangeOverlap(b, edit.id, from, to); if (ov) return setErr(`تداخل با «${ov.title}» (${BK.rangeLabel(b, ov.qStart, ov.qEnd)})`); }
    const chk = BK.checkRange(b, n, from, to); if (!chk.ok) return setErr(chk.error);
    upd(bb => ({ ...bb, nodes: bb.nodes.map(x => x.id !== edit.id ? x : x.isLeaf ? { ...x, qStart: from, qEnd: to, ...(levels ? { levels } : {}) } : { ...x, span: { from, to } }) }));
    setEdit(null);
  };
  const clearRange = n => {
    if (!n.isLeaf && b.nodes.some(x => BK.isDescendant(b, x, n) && BK.rangeOfNode(x))) return setMsg(`اول بازه زیربخش‌های «${n.title}» را پاک کن.`);
    upd(bb => ({ ...bb, nodes: bb.nodes.map(x => x.id !== n.id ? x : n.isLeaf ? { ...x, qStart: null, qEnd: null, levels: undefined } : { ...x, span: undefined }) })); setEdit(null);
  };
  const changeNumbering = mode => {
    const r = BK.convertNumbering(b, mode); if (!r.ok) return setMsg(r.error);
    set(x => BK.remapState({ ...x, books: x.books.map(bb => bb.id === b.id ? { ...r.book, numberingHint: undefined } : bb) }, b.id, r.map));
    setMsg(mode === 'perChapter' ? 'شماره‌گذاری «هر فصل از ۱» شد؛ همه تست‌های ثبت‌شده حفظ شدند.' : 'شماره‌گذاری سراسری شد.');
  };
  const saveToc = nodes => {
    // keep ranges/levels/covers of nodes that still exist; never drop a node that has saved ranges.
    // v9: a topic that just got sub-sections keeps its numbers as a SPAN (detail is added over time).
    const kept = nodes.map(n => { const old = b.nodes.find(x => x.id === n.id); if (!old) return n; const z = { ...old, ...n, qStart: old.qStart, qEnd: old.qEnd, levels: old.levels, covers: old.covers, span: old.span };
      if (!n.isLeaf && old.isLeaf && old.qStart != null) return { ...z, span: z.span || { from: old.qStart, to: old.qEnd }, qStart: null, qEnd: null, levels: undefined };
      if (n.isLeaf && !old.isLeaf && old.span && old.qStart == null) return { ...z, qStart: old.span.from, qEnd: old.span.to, span: undefined };
      return z; });
    const lost = b.nodes.filter(o => (o.qStart != null || o.span) && !kept.some(n => n.id === o.id));
    if (lost.length) return setMsg(`«${lost[0].title}» بازه ثبت‌شده دارد؛ اول بازه‌اش را خالی کن.`);
    upd(bb => BK.ensureScopeNos({ ...bb, nodes: kept })); setToc(null); setMsg('فهرست ذخیره شد.');
  };

  const editorFor = n => { const ex = BK.isExamLike(n); const sc = scopeOf(n); const anc = BK.spanAncestor(b, n); return (
    <div className="pop-in mt-3 grid gap-3 rounded-[12px] bg-[var(--wash)] p-3">
      <p className="text-[13px] text-[var(--pencil)]">{n.isLeaf ? 'بازه تست‌های این مبحث' : 'بازه کل این بخش (زیربخش‌ها بعداً داخل همین بازه مشخص می‌شوند)'}{sc ? ` · شماره‌ها داخل «${sc.title}»` : ''}{anc ? ` · باید داخل ${fa(P(anc.span.from))} تا ${fa(P(anc.span.to))} باشد` : ''}</p>
      {n.isLeaf && b.levels && !ex ? <div className="grid gap-2">{edit.levels.map((l, i) => <div key={l.L} className="flex flex-wrap items-center gap-2 text-[14px]"><span className="w-32 font-bold">{BK.LEVEL_FA[l.L]}</span>از
        <input aria-label={`از سطح ${l.L}`} inputMode="numeric" className={inp} value={fa(l.from)} onChange={e => setEdit({ ...edit, levels: edit.levels.map((z, j) => j === i ? { ...z, from: E.normalizeDigits(e.target.value) } : z) })} />تا
        <input aria-label={`تا سطح ${l.L}`} inputMode="numeric" className={inp} value={fa(l.to)} onChange={e => setEdit({ ...edit, levels: edit.levels.map((z, j) => j === i ? { ...z, to: E.normalizeDigits(e.target.value) } : z) })} /></div>)}
        <p className="text-[12px] text-[var(--pencil)]">سطحی که این بخش ندارد را خالی بگذار.</p></div>
        : <div className="flex items-center gap-2 text-[15px]">از <input aria-label="از" inputMode="numeric" className={inp} value={fa(edit.from)} onChange={e => setEdit({ ...edit, from: E.normalizeDigits(e.target.value) })} />
          تا <input aria-label="تا" inputMode="numeric" className={inp} value={fa(edit.to)} onChange={e => setEdit({ ...edit, to: E.normalizeDigits(e.target.value) })} onKeyDown={e => e.key === 'Enter' && saveEdit()} /></div>}
      {err && <p role="alert" className="shake text-[14px] font-bold text-[var(--bad)]">{err}</p>}
      <div className="flex flex-wrap gap-2"><Btn onClick={saveEdit}>ذخیره</Btn><Btn kind="ghost" onClick={() => { setEdit(null); setErr(''); }}>لغو</Btn>{BK.rangeOfNode(n) && <Btn kind="ghost" className="text-[var(--bad)]" onClick={() => clearRange(n)}>پاک کردن بازه</Btn>}</div>
    </div>); };

  const parentsReady = b.nodes.filter(n => !n.isLeaf && n.span && BK.childrenOf(b, n.id).length);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {[['big', `۱. بخش‌های بزرگ (${fa(prog.topsDone)}/${fa(prog.tops)})`], ['small', `۲. زیربخش‌ها (${fa(prog.leavesDone)}/${fa(prog.leaves)})`], ['all', 'نمای کامل']].map(([k, t]) => <Chip key={k} active={view === k} onClick={() => { setView(k); setEdit(null); setMsg(''); }} className="min-h-[36px] text-[13px]">{t}</Chip>)}
          <Btn kind="soft" className="mr-auto min-h-[36px] px-3 text-[13px]" onClick={openKeys}>✓ ثبت پاسخ‌نامه</Btn>
        </div>
        {msg && <p role="status" className="pop-in mb-3 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px] font-bold text-[var(--ink-deep)]">{msg}</p>}
        {toc ? <><p className="mb-3 text-[16px] font-black">ویرایش فهرست</p><TocEditor nodes={toc} setNodes={setToc} />
          <div className="mt-3 flex gap-2"><Btn onClick={() => saveToc(toc)}>ذخیره فهرست</Btn><Btn kind="ghost" onClick={() => setToc(null)}>لغو</Btn></div></> :
        view === 'big' ? <SeqEditor key={'top' + b.updatedAt} b={b} parent={null} upd={upd} onDone={() => setView('small')} /> :
        view === 'small' ? <div>
          {!parentsReady.length ? <Empty title="اول بخش‌های بزرگ" text="وقتی بازه فصل‌ها (یا بخش‌های بزرگ) مشخص شد، اینجا زیربخش‌های هر کدام را داخل همان بازه تقسیم می‌کنی." action={<Btn onClick={() => setView('big')}>رفتن به مرحله ۱</Btn>} /> :
            <SmallStage b={b} parents={parentsReady} upd={upd} />}
        </div> :
        <div className="max-h-[70vh] overflow-auto">
          {b.nodes.filter(n => n.kind !== 'theory').map(n => {
            const editing = edit?.id === n.id; const ex = BK.isExamLike(n); const r = BK.rangeOfNode(n);
            if (!n.isLeaf) return <div key={n.id} style={{ paddingRight: n.depth * 14 }} className={`${n.depth === 0 ? 'mt-4' : 'mt-2'} border-b border-[var(--rule)] pb-2`}>
              <div className="flex flex-wrap items-center gap-3"><span className={`flex-1 ${n.depth === 0 ? 'text-[17px] font-black text-[var(--ink)]' : 'text-[15px] font-bold text-[var(--pencil)]'}`}>{n.title}{n.ownNumbering ? ' · شماره جدا' : ''}</span>
                <span className="text-[14px] text-[var(--pencil)]">{r ? `کل بخش ${fa(P(r.from))}–${fa(P(r.to))}${n.span?.derived ? ' (از زیربخش‌ها)' : ''}` : 'بازه بخش؟'}</span>
                <Btn kind="ghost" className="min-h-[34px] px-3 text-[14px]" onClick={() => open(n)}>بازه بخش</Btn></div>
              {editing && editorFor(n)}</div>;
            let k = 0; if (n.qStart != null) for (let q = n.qStart; q <= n.qEnd; q++) if (b.keys[q]) k++;
            const m = mast[`${b.id}|${n.id}`]; const cmp = compareFor(s, b, n);
            return (
              <div key={n.id} style={{ paddingRight: n.depth * 14 }} className="border-b border-[var(--rule)] py-2">
                <div className="flex flex-wrap items-center gap-3">
                  {n.kind === 'topic' && <input type="checkbox" aria-label={`خوانده‌شده: ${n.title}`} checked={!!taught[n.id]} onChange={() => toggleTaught(n.id)} className="h-5 w-5 accent-[var(--ink)]" />}
                  <span className="flex-1 text-[15px]">{n.title}{ex && <span className="mr-2 rounded-full bg-[var(--wash)] px-2 text-[12px] font-bold text-[var(--ink-deep)]">{BK.KIND_FA[n.kind]}</span>}</span>
                  <span className="text-[14px] text-[var(--pencil)]">{n.qStart != null ? `${fa(P(n.qStart))}–${fa(P(n.qEnd))}، کلید ${fa(k)}/${fa(n.qEnd - n.qStart + 1)}` : 'بدون بازه'}</span>
                  <Btn kind="ghost" className="min-h-[34px] px-3 text-[14px]" onClick={() => openGuarded(n)}>بازه</Btn>
                  {ex && <Btn kind="soft" className="min-h-[34px] px-3 text-[13px]" onClick={() => setCovers(covers === n.id ? null : n.id)}>از کدام مباحث؟ ({fa(BK.coversOf(b, n).length)})</Btn>}
                </div>
                {b.levels > 0 && n.levels?.length > 0 && <p className="mt-1 text-[13px] text-[var(--pencil)]">{n.levels.map(l => `سطح ${fa(l.L)}: ${fa(P(l.from))}–${fa(P(l.to))}${m?.levels?.[l.L] ? ` (${fa(Math.round(100 * m.levels[l.L].C / m.levels[l.L].N))}٪ درست)` : ''}`).join(' · ')}</p>}
                {cmp && <p className="mt-1 text-[13px] text-[var(--pencil)]">مقایسه: تسلط تو {m ? fa(Math.round(m.pC * 100)) : '—'}٪، میانه {fa(cmp.n)} نفر {fa(Math.round(cmp.p50 * 100))}٪</p>}
                {covers === n.id && <CoverPicker b={b} node={n} onSave={ids => { upd(bb => ({ ...bb, nodes: bb.nodes.map(x => x.id === n.id ? { ...x, covers: ids } : x) })); setCovers(null); }} onCancel={() => setCovers(null)} />}
                {editing && editorFor(n)}
              </div>);
          })}
        </div>}
      </Card>
      <div className="grid content-start gap-4">
        <Card>
          <p className="text-[16px] font-black">{b.title}، {b.publisher}</p>
          <p className="mt-1 text-[13px] text-[var(--pencil)]">{b.grade ? GRADE_FA[b.grade] : ''}{b.stream ? ` · ${STREAMS[b.stream]}` : ''}{tb ? ` · مرجع: ${tb.title}` : ''}{b.origin === 'hub' ? ' · از مرکز' : ''}</p>
          <p className="mt-3 text-[14px] text-[var(--pencil)]">۱. بخش‌های بزرگ {fa(prog.topsDone)} از {fa(prog.tops)}</p><Meter value={prog.topsDone} max={prog.tops || 1} />
          <p className="mt-3 text-[14px] text-[var(--pencil)]">۲. مبحث‌های ریز {fa(withRange.length)} از {fa(ls.length)}</p><Meter value={withRange.length} max={ls.length || 1} color="var(--ink-deep)" />
          <p className="mt-3 text-[14px] text-[var(--pencil)]">کلید {fa(keyed)} از {fa(totalQ)} تست بازه‌دار{allKeys > keyed ? ` (+${fa(allKeys - keyed)} کلید بدون مبحث)` : ''}</p><Meter value={keyed} max={totalQ || 1} color="var(--ok)" />
          <p className="mt-3 text-[14px] text-[var(--pencil)]">خوانده‌شده {fa(Object.values(taught).filter(Boolean).length)} مبحث</p>
          <Btn className="mt-4 w-full" onClick={openKeys}>✓ ثبت پاسخ‌نامه این کتاب</Btn>
          {(() => { const gp = growPlan(b); if (!gp.length) return null; const n = gp.reduce((a, x) => a + x.lessons.length, 0); return <div className="pop-in mt-3 rounded-[10px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] p-3 text-[14px] leading-7">
            <b>کتاب درسی «{tb?.title}» ریزتر شده:</b> {fa(n)} درس/بخش تازه برای {fa(gp.length)} فصل. بازه فصل‌ها حفظ می‌شود و درس‌ها در مرحله ۲ تقسیم می‌شوند.
            <Btn kind="soft" className="mt-2 w-full" onClick={() => { const r = growBook(b); upd(() => r.book); setMsg(`${fa(r.added)} زیربخش اضافه شد؛ حالا در «زیربخش‌ها» تقسیمشان کن.`); setView('small'); }}>اضافه کردن به این کتاب تست</Btn></div>; })()}
        </Card>
        <Card>
          <p className="mb-3 text-[16px] font-black">تنظیمات کتاب</p>
          <div className="grid gap-3 text-[14px]">
            <div><p className="mb-1 font-bold">شماره تست‌ها</p><div className="flex flex-wrap gap-2">{Object.entries(BK.NUMBERING_FA).map(([k, t]) => <Chip key={k} active={(b.numbering || 'global') === k} onClick={() => changeNumbering(k)}>{t}</Chip>)}</div>
              {b.numberingHint === 'perChapter' && b.numbering !== 'perChapter' && <p className="mt-1 text-[13px] text-[var(--amber)]">شماره‌های این کتاب هر فصل از ۱ شروع می‌شود؛ «هر فصل از ۱» را بزن، تست‌های قبلی حفظ می‌شوند.</p>}</div>
            <div><p className="mb-1 font-bold">سطح سختی</p><div className="flex gap-2"><Chip active={!b.levels} onClick={() => upd(bb => ({ ...bb, levels: 0 }))}>ندارد</Chip><Chip active={b.levels === 3} onClick={() => upd(bb => ({ ...bb, levels: 3 }))}>۳ سطح</Chip></div></div>
            <div className="flex flex-wrap gap-2"><Btn kind="soft" className="min-h-[36px] px-3 text-[13px]" onClick={() => setToc(b.nodes.map(n => ({ ...n })))}>ویرایش فهرست (افزودن زیربخش)</Btn>
              {b.active !== false ? <Btn kind="ghost" className="min-h-[36px] px-3 text-[13px]" onClick={() => setActive(b.id, false)}>غیرفعال کن</Btn> : <Btn className="min-h-[36px] px-3 text-[13px]" onClick={() => setActive(b.id, true)}>فعال کن</Btn>}</div>
          </div>
        </Card>
        <Card><p className="text-[14px] leading-7 text-[var(--pencil)]">ترتیب درست: <b>اول</b> بازه هر فصل (بخش بزرگ)، <b>بعد</b> داخل همان بازه، زیربخش‌ها. اگر هنوز زیربخش‌ها را نمی‌دانی، فصل را با بازه‌اش نگه دار و بعداً با «ویرایش فهرست» ریزترش کن؛ بازه فصل حفظ می‌شود. کلیدها را در «ثبت پاسخ‌نامه» بزن.</p></Card>
      </div>
    </div>
  );
}

/** Stage 2: pick a big section that has a span, then cut it into its children back to back. */
function SmallStage({ b, parents, upd }) {
  const firstTodo = parents.find(p => BK.childrenOf(b, p.id).some(c => !BK.rangeOfNode(c))) || parents[0];
  const [pid, setPid] = useState(firstTodo?.id);
  const par = b.nodes.find(n => n.id === pid) || parents[0];
  return <div>
    <p className="mb-2 text-[14px] font-bold">کدام بخش را ریز کنیم؟</p>
    <div className="mb-4 flex flex-wrap gap-2">{parents.map(p => { const ch = BK.childrenOf(b, p.id); const dn = ch.filter(c => BK.rangeOfNode(c)).length; return <Chip key={p.id} active={p.id === par?.id} onClick={() => setPid(p.id)} className="min-h-[34px] text-[13px]">{'· '.repeat(p.depth)}{p.title} <span className="opacity-70">{dn === ch.length ? '✓' : `${fa(dn)}/${fa(ch.length)}`}</span></Chip>; })}</div>
    {par && <SeqEditor key={par.id + JSON.stringify(par.span) + b.updatedAt} b={b} parent={par} upd={upd} />}
  </div>;
}

/** Back-to-back entry: for each child type only its LAST number; the next one starts right after. */
function SeqEditor({ b, parent, upd, onDone }) {
  const perChapterTop = !parent && b.numbering === 'perChapter';
  const kids = BK.childrenOf(b, parent ? parent.id : null);
  const own = n => perChapterTop || !!n.ownNumbering; // starts from 1 in its own numbering
  const scope = n => BK.scopeNodeOf(b, n)?.id ?? null;
  const P = q => BK.printedOf(q);
  const first = parent?.span ? P(parent.span.from) : (() => { const r = kids.filter(n => !own(n)).map(BK.rangeOfNode).filter(Boolean); return r.length ? Math.min(...r.map(x => P(x.from))) : 1; })();
  const [start, setStart] = useState(String(first));
  const [ends, setEnds] = useState(() => Object.fromEntries(kids.map(n => [n.id, BK.rangeOfNode(n) ? String(P(BK.rangeOfNode(n).to)) : ''])));
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const parentEnd = parent?.span ? P(parent.span.to) : null;
  const seqKids = kids.filter(n => !own(n));
  const lay = {};
  { let cur = parent?.span ? first : (+E.normalizeDigits(start) || 1); seqKids.forEach((n, i) => { const last = i === seqKids.length - 1; const e = +E.normalizeDigits(ends[n.id] || '') || (last && parentEnd ? parentEnd : 0); lay[n.id] = { from: cur, to: e || null }; if (e) cur = e + 1; }); }
  for (const n of kids.filter(own)) { const e = +E.normalizeDigits(ends[n.id] || ''); lay[n.id] = { from: 1, to: e || null }; }
  const save = () => {
    setErr(''); setOk(''); let work = b; let count = 0;
    for (const n of kids) { // validate on a working copy, then write once
      const L = lay[n.id]; if (!L?.to) continue; if (L.to < L.from) return setErr(`«${n.title}»: شماره آخر از شماره اول (${fa(L.from)}) کمتر است.`);
      const sc = scope(n); const f = BK.toInternal(work, sc, L.from), t = BK.toInternal(work, sc, L.to);
      const cur = work.nodes.find(x => x.id === n.id); const old = BK.rangeOfNode(cur); if (old && old.from === f && old.to === t) continue;
      const cleared = { ...work, nodes: work.nodes.map(x => x.id !== n.id ? x : x.isLeaf ? { ...x, qStart: null, qEnd: null } : { ...x, span: undefined }) };
      const chk = BK.checkRange(cleared, cleared.nodes.find(x => x.id === n.id), f, t);
      if (!chk.ok) return setErr(`«${n.title}»: ${chk.error}`);
      work = { ...cleared, nodes: cleared.nodes.map(x => x.id !== n.id ? x : x.isLeaf ? { ...x, qStart: f, qEnd: t, levels: cur.levels?.length && (cur.levels[0].from < f || cur.levels.at(-1).to > t) ? undefined : cur.levels } : { ...x, span: { from: f, to: t } }) }; count++;
    }
    if (!count) return setOk('چیزی تغییر نکرد.');
    upd(() => work); setOk(`${fa(count)} بازه ذخیره شد.`);
  };
  if (!kids.length) return <Empty title="زیربخشی ندارد" text="با «ویرایش فهرست» برای این بخش زیربخش بساز؛ تا آن وقت همه تست‌هایش به خود این بخش می‌رسد." />;
  return <div className="rise-in">
    <p className="mb-1 text-[16px] font-black">{parent ? `زیربخش‌های «${parent.title}»` : 'بازه هر بخش بزرگ (فصل)'}</p>
    <p className="mb-3 text-[14px] text-[var(--pencil)]">{parent ? `داخل ${fa(P(parent.span.from))} تا ${fa(P(parent.span.to))}. ` : ''}فقط <b>شماره آخر</b> هر کدام را بنویس؛ بعدی خودش از شماره بعد شروع می‌شود.{perChapterTop ? ' (این کتاب هر فصل از ۱ شماره می‌خورد: تعداد تست‌های هر فصل را بنویس.)' : ''}{parent ? ' آخری اگر خالی بماند تا آخر بخش می‌رود.' : ''}</p>
    {!parent && !perChapterTop && <label className="mb-3 flex items-center gap-2 text-[14px] font-bold">شروع از تست<input inputMode="numeric" className={inp} value={fa(start)} onChange={e => setStart(E.normalizeDigits(e.target.value).replace(/\D/g, ''))} /></label>}
    <div className="stagger grid gap-1.5">{kids.map(n => { const L = lay[n.id]; return <div key={n.id} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[15px]">
      <span className="min-w-[160px] flex-1 font-bold">{n.title}{!n.isLeaf && <span className="mr-1 text-[12px] font-normal text-[var(--pencil)]">(بخش، زیربخش دارد)</span>}{BK.isExamLike(n) && <span className="mr-1 text-[12px] font-normal text-[var(--ink-deep)]">{BK.KIND_FA[n.kind]}</span>}</span>
      <span className="w-20 text-center text-[14px] text-[var(--pencil)]">از {fa(L?.from ?? '')}</span>
      <label className="flex items-center gap-1 text-[14px]">تا<input aria-label={`تا ${n.title}`} inputMode="numeric" className={inp} placeholder={!own(n) && n === seqKids.at(-1) && parentEnd ? fa(parentEnd) : ''} value={fa(ends[n.id] || '')} onChange={e => setEnds(x => ({ ...x, [n.id]: E.normalizeDigits(e.target.value).replace(/\D/g, '') }))} /></label>
      {L?.to ? <span className="w-16 text-left text-[13px] text-[var(--pencil)]">{fa(Math.max(0, L.to - L.from + 1))} تست</span> : <span className="w-16" />}
    </div>; })}</div>
    {err && <p role="alert" className="shake mt-3 text-[14px] font-bold text-[var(--bad)]">{err}</p>}
    {ok && <p role="status" className="pop-in mt-3 text-[14px] font-bold text-[var(--ok)]">{ok}</p>}
    <div className="mt-4 flex flex-wrap gap-2"><Btn onClick={save}>ذخیره بازه‌ها</Btn>{onDone && <Btn kind="soft" onClick={onDone}>مرحله بعد: زیربخش‌ها ←</Btn>}</div>
  </div>;
}

/** Pick the topics an exam-like section (چکاپ، جامع، مخلوط، آزمون فصل) is drawn from. */
function CoverPicker({ b, node, onSave, onCancel }) {
  const [ids, setIds] = useState(() => BK.coversOf(b, node));
  const topics = leaves(b).filter(n => n.kind === 'topic');
  const byChapter = topics.reduce((a, n) => { const c = BK.chapterNode(b, n); (a[c?.id] ||= { c, items: [] }).items.push(n); return a; }, {});
  const tog = id => setIds(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id]);
  return (
    <div className="mt-3 rounded-[12px] bg-[var(--wash)] p-3">
      <p className="mb-2 text-[14px] font-bold">«{node.title}» از کدام مباحث است؟</p>
      <div className="mb-2 flex flex-wrap gap-2"><Btn kind="soft" className="min-h-[30px] px-3 text-[12px]" onClick={() => setIds(BK.defaultCovers(b, node))}>پیشنهاد خودکار</Btn><Btn kind="ghost" className="min-h-[30px] px-3 text-[12px]" onClick={() => setIds([])}>هیچ</Btn></div>
      <div className="max-h-[40vh] overflow-auto">{Object.values(byChapter).map(({ c, items }) => <div key={c?.id || 'x'} className="mb-2">
        <label className="flex items-center gap-2 text-[14px] font-black"><input type="checkbox" checked={items.every(n => ids.includes(n.id))} onChange={e => setIds(x => e.target.checked ? [...new Set([...x, ...items.map(n => n.id)])] : x.filter(y => !items.some(n => n.id === y)))} />{c?.title}</label>
        {items.map(n => <label key={n.id} className="flex items-center gap-2 py-0.5 pr-5 text-[14px]"><input type="checkbox" checked={ids.includes(n.id)} onChange={() => tog(n.id)} />{label(b, n)}</label>)}</div>)}</div>
      <div className="mt-2 flex gap-2"><Btn className="min-h-[34px]" onClick={() => onSave(ids)}>ذخیره ({fa(ids.length)} مبحث)</Btn><Btn kind="ghost" className="min-h-[34px]" onClick={onCancel}>لغو</Btn></div>
    </div>
  );
}
