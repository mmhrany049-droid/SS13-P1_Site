/* پروژه مرکز (Hub) — the owner's control room: collect students' files, manage schools/outside classes and their members,
   build the shared test-book library, define shared class exams, compare (with consent) and publish ONE bulletin file. */
import { useEffect, useMemo, useState } from 'react';
import * as H from './hubStore.js';
import { downloadJson, readJsonFile } from '@ss/domain/format.js';
import { TEXTBOOKS, textbookById, SUBJECTS, GRADES, GRADE_FA, STREAMS, textbooksFor } from '@ss/domain/curriculum.js';
import BookWizard from '@ss/ui/BookWizard.jsx';
import { Btn, Card, Chip, Head, Empty, fa, jDate, jShort } from '@ss/ui/ui.jsx';
import { todayStr, addDays } from '@ss/domain/store.js';

const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px] font-normal';
const _NAV = [['home', 'میز کار', '◉'], ['people', 'افراد', '👥'], ['classes', 'مدارس و کلاس‌ها', '🏫'], ['books', 'کتاب‌های تست', '▥'], ['exams', 'آزمون‌های مشترک', '◎'], ['mock', 'شبه‌کنکور', '🎯'], ['compare', 'مقایسه', '▤'], ['notes', 'اطلاعیه‌ها', '📣']];
const tbTitle = ref => { const tb = TEXTBOOKS.find(t => ref.startsWith(t.id)); const n = tb?.nodes.find(x => x.id === ref); return tb ? `${tb.title}${n ? '، ' + n.title : ''}` : ref; };

export function People({ h, setH }) {
  const [by, setBy] = useState('school'); const [open, setOpen] = useState(null);
  const g = H.groupPeople(h);
  const Person = ({ p }) => { const pack = h.packs[p.id]; const mine = h.classes.filter(c => c.members.includes(p.id)); return (
    <li className="rounded-[10px] bg-[var(--wash)] p-3 text-[14px]">
      <button type="button" className="flex w-full items-center justify-between text-right" onClick={() => setOpen(open === p.id ? null : p.id)}><span><b className="text-[15px]">{p.name}</b> · {GRADE_FA[p.grade] || ''} {STREAMS[p.stream] || ''}</span><span className="text-[12px] text-[var(--pencil)]">{jShort(p.lastPackAt)}</span></button>
      <p className="mt-1 text-[12px] text-[var(--pencil)]">{pack?.books?.length ? `${fa(pack.books.length)} کتاب · ` : ''}{p.consent?.compare ? 'اجازه مقایسه ✓' : 'بدون اجازه مقایسه'} · {p.consent?.results ? 'نتیجه آزمون ✓' : 'بدون نتیجه'}{mine.length ? ` · ${mine.map(c => c.name).join('، ')}` : ''}</p>
      {open === p.id && <div className="mt-2 grid gap-2">
        <label className="font-bold">مدرسه<select className={inp} value={p.schoolId || ''} onChange={e => setH(x => H.setPersonSchool(x, p.id, e.target.value || null))}><option value="">—</option>{h.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div><p className="font-bold">کلاس‌ها</p><div className="mt-1 flex flex-wrap gap-2">{h.classes.map(c => <Chip key={c.id} active={c.members.includes(p.id)} onClick={() => setH(x => H.setMember(x, c.id, p.id, !c.members.includes(p.id)))}>{c.name}</Chip>)}</div></div>
        <button type="button" className="justify-self-start text-[13px] font-bold text-[var(--bad)]" onClick={() => confirm(`«${p.name}» و فایلش از مرکز حذف شود؟`) && setH(x => { const { [p.id]: _, ...people } = x.people; const { [p.id]: __, ...packs } = x.packs; return { ...x, people, packs, classes: x.classes.map(c => ({ ...c, members: c.members.filter(m => m !== p.id) })) }; })}>حذف از مرکز</button></div>}
    </li>); };
  if (!Object.keys(h.people).length) return <div><Head kicker="مرکز" title="افراد" /><Card><Empty title="هنوز کسی نیست" text="از میز کار فایل‌های .sspack دانش‌آموزان را وارد کن." /></Card></div>;
  return (
    <div>
      <Head kicker="مرکز" title="افراد"><div className="flex gap-2"><Chip active={by === 'school'} onClick={() => setBy('school')}>بر اساس مدرسه</Chip><Chip active={by === 'class'} onClick={() => setBy('class')}>بر اساس کلاس</Chip></div></Head>
      <div className="grid gap-5 lg:grid-cols-2">{(by === 'school' ? g.bySchool.filter(x => x.people.length).map(x => [x.school.id || 'none', x.school.name, x.people]) : g.byClass.map(x => [x.cls.id, `${x.cls.kind === 'school' ? '🏫' : '📚'} ${x.cls.name}`, x.people])).map(([id, t, ps]) =>
        <Card key={id}><p className="mb-3 text-[16px] font-black">{t} <span className="text-[13px] font-normal text-[var(--pencil)]">{fa(ps.length)} نفر</span></p><ul className="grid gap-2">{ps.map(p => <Person key={p.id} p={p} />)}</ul></Card>)}</div>
    </div>
  );
}

export function Classes({ h, setH }) {
  const [sch, setSch] = useState(''); const [c, setC] = useState({ kind: 'outside', name: '', schoolId: '', institute: '', teacher: '', grade: 11, stream: 'rf', subjectIds: [] });
  const [sel, setSel] = useState(null); const cls = h.classes.find(x => x.id === sel);
  const people = Object.values(h.people);
  return (
    <div>
      <Head kicker="مرکز" title="مدارس و کلاس‌ها" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <p className="mb-3 text-[16px] font-black">مدرسه‌ها</p>
          <ul className="mb-3 grid gap-1">{h.schools.map(s => <li key={s.id} className="flex justify-between rounded-[8px] bg-[var(--wash)] px-3 py-1.5 text-[15px]"><span>{s.name}</span><span className="text-[13px] text-[var(--pencil)]">{fa(people.filter(p => p.schoolId === s.id).length)} نفر</span></li>)}</ul>
          <div className="flex gap-2"><input aria-label="نام مدرسه" className={inp + ' mt-0'} placeholder="نام مدرسه" value={sch} onChange={e => setSch(e.target.value)} /><Btn disabled={!sch.trim()} onClick={() => { setH(x => H.addSchool(x, sch)); setSch(''); }}>افزودن</Btn></div>
        </Card>
        <Card>
          <p className="mb-3 text-[16px] font-black">کلاس جدید</p>
          <div className="mb-2 flex gap-2"><Chip active={c.kind === 'school'} onClick={() => setC({ ...c, kind: 'school' })}>کلاس مدرسه</Chip><Chip active={c.kind === 'outside'} onClick={() => setC({ ...c, kind: 'outside' })}>کلاس بیرون (آموزشگاه)</Chip></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[14px] font-bold">نام کلاس<input className={inp} placeholder="مثلاً شیمی آقای …" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} /></label>
            {c.kind === 'school' ? <label className="text-[14px] font-bold">مدرسه<select className={inp} value={c.schoolId} onChange={e => setC({ ...c, schoolId: e.target.value })}><option value="">—</option>{h.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              : <label className="text-[14px] font-bold">آموزشگاه<input className={inp} value={c.institute} onChange={e => setC({ ...c, institute: e.target.value })} /></label>}
            <label className="text-[14px] font-bold">دبیر<input className={inp} value={c.teacher} onChange={e => setC({ ...c, teacher: e.target.value })} /></label>
            <label className="text-[14px] font-bold">پایه<select className={inp} value={c.grade} onChange={e => setC({ ...c, grade: +e.target.value })}>{GRADES.map(g => <option key={g} value={g}>{GRADE_FA[g]}</option>)}</select></label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">{SUBJECTS.map(x => <Chip key={x.id} active={c.subjectIds.includes(x.id)} onClick={() => setC({ ...c, subjectIds: c.subjectIds.includes(x.id) ? c.subjectIds.filter(y => y !== x.id) : [...c.subjectIds, x.id] })}>{x.fa}</Chip>)}</div>
          <Btn className="mt-3" disabled={!c.name.trim()} onClick={() => { setH(x => H.addClass(x, c)); setC({ ...c, name: '' }); }}>ساخت کلاس</Btn>
        </Card>
        <Card className="lg:col-span-2">
          <p className="mb-3 text-[16px] font-black">کلاس‌ها و اعضا</p>
          <div className="mb-3 flex flex-wrap gap-2">{h.classes.map(x => <Chip key={x.id} active={sel === x.id} onClick={() => setSel(x.id)}>{x.kind === 'school' ? '🏫' : '📚'} {x.name} ({fa(x.members.length)})</Chip>)}</div>
          {cls && <div className="grid gap-3">
            <p className="text-[14px] text-[var(--pencil)]">{cls.kind === 'school' ? h.schools.find(s => s.id === cls.schoolId)?.name : cls.institute}{cls.teacher ? ` · ${cls.teacher}` : ''} · {GRADE_FA[cls.grade] || ''} · {cls.subjectIds.map(id => SUBJECTS.find(s => s.id === id)?.fa).join('، ')}</p>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{people.map(p => <label key={p.id} className="flex items-center gap-2 rounded-[8px] bg-[var(--wash)] px-3 py-1.5 text-[14px]"><input type="checkbox" checked={cls.members.includes(p.id)} onChange={e => setH(x => H.setMember(x, cls.id, p.id, e.target.checked))} />{p.name}<span className="text-[12px] text-[var(--pencil)]">{h.schools.find(s => s.id === p.schoolId)?.name || ''}</span></label>)}</div>
            <button type="button" className="justify-self-start text-[13px] font-bold text-[var(--bad)]" onClick={() => confirm('این کلاس حذف شود؟') && setH(x => ({ ...x, classes: x.classes.filter(y => y.id !== cls.id) }))}>حذف کلاس</button></div>}
        </Card>
      </div>
    </div>
  );
}

export function Library({ h, setH }) {
  const [adding, setAdding] = useState(false); const [open, setOpen] = useState(null); const [tab, setTab] = useState('tests'); const [tb, setTb] = useState(null);
  const books = H.libraryBooks(h);
  if (adding) return <div><Head kicker="مرکز" title="کتاب تست جدید" /><BookWizard inactive author={h.name} onCancel={() => setAdding(false)} onCreate={b => { const { id, active, ...rest } = b; setH(x => ({ ...x, library: { ...x.library, [b.uid]: { uid: b.uid, hubBook: { ...rest }, versions: [] } }, approved: { ...x.approved, [b.uid]: true } })); setAdding(false); }} /></div>;
  return (
    <div>
      <Head kicker="مرکز" title={tab === 'tests' ? 'کتاب‌های تست' : 'کتاب‌های درسی'}><div className="flex flex-wrap gap-2"><Chip active={tab === 'tests'} onClick={() => setTab('tests')}>کتاب تست</Chip><Chip active={tab === 'textbooks'} onClick={() => setTab('textbooks')}>کتاب درسی</Chip>{tab === 'tests' ? <Btn onClick={() => setAdding(true)}>+ افزودن کتاب تست</Btn> : <Btn onClick={() => setTb({ id: null, title: '', subject: '', grade: 11, stream: 'rf', edition: '1405', nodes: [] })}>+ افزودن کتاب درسی</Btn>}</div></Head>
      {tab === 'textbooks' ? <TextbookManager h={h} setH={setH} editing={tb} setEditing={setTb} /> : (
      !books.length ? <Card><Empty title="کتابخانه خالی است" text="کتاب‌هایی که افراد ساخته‌اند با واردکردن فایلشان اینجا می‌آیند؛ یا خودت کتاب اضافه کن." /></Card> :
        <div className="grid gap-3">{books.map(b => { const e = h.library[b.uid]; const ranged = b.nodes.filter(n => n.qStart != null).length; const keys = Object.keys(b.keys || {}).length; return (
          <Card key={b.uid} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" className="text-right" onClick={() => setOpen(open === b.uid ? null : b.uid)}><p className="text-[16px] font-black">{b.title}، {b.publisher}</p>
                <p className="text-[13px] text-[var(--pencil)]">{GRADE_FA[b.grade] || ''} · {textbookById(b.textbookId)?.title || b.subject} · {b.numbering === 'perChapter' ? 'هر فصل از ۱' : 'سراسری'}{b.levels ? ' · ۳ سطح' : ''} · {fa(ranged)} بازه · {fa(keys)} کلید · {fa((e.versions || []).length)} نسخه از افراد{b.disputed?.length ? ` · ${fa(b.disputed.length)} کلید مورد اختلاف` : ''}</p></button>
              <label className="flex items-center gap-2 text-[14px] font-bold"><input type="checkbox" className="h-5 w-5" checked={!!h.approved[b.uid]} onChange={ev => setH(x => ({ ...x, approved: { ...x.approved, [b.uid]: ev.target.checked } }))} />انتشار برای همه</label>
            </div>
            {open === b.uid && <ul className="mt-3 max-h-[40vh] overflow-auto text-[14px]">{b.nodes.map(n => <li key={n.id} style={{ paddingRight: n.depth * 14 }} className="flex justify-between border-b border-[var(--rule)] py-1"><span className={n.depth ? '' : 'font-black'}>{n.title}</span><span className="text-[var(--pencil)]">{n.qStart != null ? `${fa(n.qStart % 100000)}–${fa(n.qEnd % 100000)}` : ''}</span></li>)}</ul>}
          </Card>); })}</div>)}
    </div>
  );
}

function TextbookManager({ h, setH, editing, setEditing }) {
  const list = h.textbooks || [];
  if (editing) return <TextbookForm value={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={() => { setH(x => x.textbooks?.some(t => t.id === editing.id) ? H.updateTextbook(x, editing.id, editing) : H.addTextbook(x, editing)); setEditing(null); }} />;
  return <div className="grid gap-3">{!list.length && <Card><Empty title="کتاب درسی سفارشی نداری" text="فهرست، فصل‌ها، درس‌ها و بازه صفحات را اینجا بساز." /></Card>}{list.map(t => <Card key={t.id}><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[17px] font-black">{t.title}</p><p className="text-[13px] text-[var(--pencil)]">{t.subject} · پایه {fa(t.grade)} · چاپ {t.edition} · {fa((t.nodes || []).length)} بخش</p></div><Btn kind="soft" onClick={() => setEditing(t)}>ویرایش فهرست</Btn></div><ul className="mt-3 grid gap-1">{(t.nodes || []).slice(0, 80).map(n => <li key={n.id} style={{ paddingRight: (n.depth || 0) * 14 }} className="flex justify-between border-b border-[var(--rule)] py-1 text-[14px]"><span className={!n.depth ? 'font-black' : ''}>{n.title}</span><span className="text-[var(--pencil)]">{n.pageFrom ? `ص ${fa(n.pageFrom)} تا ${fa(n.pageTo || n.pageFrom)}` : ''}</span></li>)}</ul></Card>)}</div>;
}

function TextbookForm({ value, onChange, onCancel, onSave }) {
  const patch = p => onChange({ ...value, ...p }); const [draft, setDraft] = useState({ title: '', depth: 0, pageFrom: '', pageTo: '' });
  const add = () => { if (!draft.title.trim()) return; patch({ nodes: [...(value.nodes || []), { id: 'tb-node-' + Date.now().toString(36), title: draft.title.trim(), depth: +draft.depth || 0, pageFrom: +draft.pageFrom || null, pageTo: +draft.pageTo || +draft.pageFrom || null }] }); setDraft({ title: '', depth: draft.depth, pageFrom: '', pageTo: '' }); };
  return <Card><div className="grid gap-3 sm:grid-cols-4"><label className="text-[14px] font-bold sm:col-span-2">نام کتاب<input className={inp} value={value.title} onChange={e => patch({ title: e.target.value })} /></label><label className="text-[14px] font-bold">درس<input className={inp} value={value.subject} onChange={e => patch({ subject: e.target.value })} /></label><label className="text-[14px] font-bold">پایه<input className={inp} inputMode="numeric" value={value.grade} onChange={e => patch({ grade: +e.target.value || 11 })} /></label><label className="text-[14px] font-bold">چاپ<input className={inp} value={value.edition} onChange={e => patch({ edition: e.target.value })} /></label></div>
    <p className="mt-5 text-[16px] font-black">افزودن بخش و بازه صفحات</p><p className="text-[13px] text-[var(--pencil)]">بازه‌ها می‌توانند هم‌پوشان باشند؛ برای دو نیمه یک صفحه، همان صفحه را در دو بخش ثبت کن.</p>
    <div className="mt-2 grid gap-2 rounded-[12px] bg-[var(--wash)] p-3 sm:grid-cols-[2fr_80px_90px_90px_auto] sm:items-end"><label className="text-[13px] font-bold">عنوان بخش<input className={inp} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><label className="text-[13px] font-bold">عمق<input className={inp} inputMode="numeric" value={draft.depth} onChange={e => setDraft({ ...draft, depth: e.target.value })} /></label><label className="text-[13px] font-bold">از صفحه<input className={inp} inputMode="numeric" value={draft.pageFrom} onChange={e => setDraft({ ...draft, pageFrom: e.target.value })} /></label><label className="text-[13px] font-bold">تا صفحه<input className={inp} inputMode="numeric" value={draft.pageTo} onChange={e => setDraft({ ...draft, pageTo: e.target.value })} /></label><Btn onClick={add}>افزودن</Btn></div>
    <div className="mt-3 max-h-[45vh] overflow-auto">{(value.nodes || []).map((n, i) => <div key={n.id} className="flex items-center gap-2 border-b border-[var(--rule)] py-1" style={{ paddingRight: n.depth * 14 }}><span className="flex-1 text-[14px]">{n.title}</span><span className="text-[13px] text-[var(--pencil)]">{n.pageFrom ? `ص ${fa(n.pageFrom)} تا ${fa(n.pageTo || n.pageFrom)}` : 'بدون صفحه'}</span><button type="button" className="text-[var(--bad)]" onClick={() => patch({ nodes: value.nodes.filter((_, j) => j !== i) })}>×</button></div>)}</div>
    <div className="mt-4 flex gap-2"><Btn disabled={!value.title.trim() || !(value.nodes || []).length} onClick={onSave}>ذخیره کتاب درسی</Btn><Btn kind="ghost" onClick={onCancel}>لغو</Btn></div>
  </Card>;
}

export function ClassExams({ h, setH }) {
  const [f, setF] = useState({ classId: '', provider: 'ghalamchi', title: '', date: addDays(todayStr(), 14), target: 60, sections: [] });
  const cls = h.classes.find(c => c.id === f.classId);
  const tbs = TEXTBOOKS.filter(t => t.nodes.length && (!cls || ((!cls.grade || t.grade === cls.grade) && (!cls.subjectIds.length || cls.subjectIds.includes(t.subjectId)))));
  const addSec = tb => setF({ ...f, sections: [...f.sections, { textbookId: tb.id, subjectId: tb.subjectId, count: 10, tbRefs: [] }] });
  const upSec = (i, p) => setF({ ...f, sections: f.sections.map((x, j) => j === i ? { ...x, ...p } : x) });
  const ok = f.classId && f.title.trim() && f.sections.some(x => x.count > 0 && x.tbRefs.length);
  return (
    <div>
      <Head kicker="مرکز" title="آزمون‌های مشترک کلاس‌ها" />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <p className="mb-3 text-[16px] font-black">آزمون جدید</p>
          {!h.classes.length ? <p className="text-[15px] text-[var(--pencil)]">اول در «مدارس و کلاس‌ها» کلاس بساز.</p> : <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-[14px] font-bold">کلاس<select className={inp} value={f.classId} onChange={e => setF({ ...f, classId: e.target.value, sections: [] })}>{h.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="text-[14px] font-bold">عنوان<input className={inp} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="آزمون مشترک فصل ۲" /></label>
            <label className="text-[14px] font-bold">تاریخ<input type="date" className={inp} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
          </div>
          <p className="mt-4 text-[14px] font-bold">درس‌ها (مباحث از فهرست کتاب درسی؛ برای هر دانش‌آموز به کتاب تست خودش وصل می‌شود)</p>
          <div className="mt-2 flex flex-wrap gap-2">{tbs.map(tb => <Chip key={tb.id} onClick={() => addSec(tb)}>+ {tb.title}</Chip>)}</div>
          {f.sections.map((sec, i) => { const tb = textbookById(sec.textbookId); return (
            <div key={i} className="mt-3 rounded-[12px] bg-[var(--wash)] p-3">
              <div className="mb-2 flex items-center justify-between"><b>{tb.title}</b><label className="text-[14px]">تعداد سؤال <input inputMode="numeric" className="w-16 rounded-[8px] border-2 border-[var(--rule)] bg-[var(--paper)] px-2 text-center" value={sec.count} onChange={e => upSec(i, { count: +e.target.value || 0 })} /></label></div>
              <div className="max-h-[30vh] overflow-auto">{tb.nodes.filter(n => n.kind !== 'problemSet').map(n => <label key={n.id} className="flex items-center gap-2 py-0.5 text-[14px]" style={{ paddingRight: n.depth * 14 }}><input type="checkbox" checked={sec.tbRefs.includes(n.id)} onChange={() => upSec(i, { tbRefs: sec.tbRefs.includes(n.id) ? sec.tbRefs.filter(x => x !== n.id) : [...sec.tbRefs, n.id] })} /><span className={n.depth ? '' : 'font-bold'}>{n.title}</span></label>)}</div>
              <button type="button" className="mt-1 text-[13px] font-bold text-[var(--bad)]" onClick={() => setF({ ...f, sections: f.sections.filter((_, j) => j !== i) })}>حذف درس</button>
            </div>); })}
          <Btn className="mt-4" disabled={!ok} onClick={() => { setH(x => H.addClassExam(x, { classId: f.classId, title: f.title.trim(), date: f.date, target: f.target, sections: f.sections.filter(x => x.count > 0 && x.tbRefs.length) })); setF({ ...f, title: '', sections: [] }); }}>ثبت آزمون مشترک</Btn></>}
        </Card>
        <Card className="content-start">
          <p className="mb-3 text-[16px] font-black">آزمون‌های ثبت‌شده</p>
          {!h.classExams.length ? <p className="text-[15px] text-[var(--pencil)]">هنوز آزمونی نیست.</p> :
            <ul className="grid gap-2">{h.classExams.map(e => { const r = H.examResults(h, e.id); return <li key={e.id} className="rounded-[10px] bg-[var(--wash)] p-3 text-[14px]"><b>{e.title}</b> · {h.classes.find(c => c.id === e.classId)?.name} · {jShort(e.date)}
              <p className="text-[13px] text-[var(--pencil)]">{e.sections.map(x => textbookById(x.textbookId)?.title).join('، ')}{r.n ? ` · ${fa(r.n)} نتیجه، میانگین ${fa(Math.round(r.mean))}٪` : ''}</p>
              {r.rows.length > 0 && <ul className="mt-1">{r.rows.sort((a, z) => z.percent - a.percent).map(x => <li key={x.id}>{x.person}: {fa(Math.round(x.percent))}٪</li>)}</ul>}
              <button type="button" className="mt-1 text-[12px] font-bold text-[var(--bad)]" onClick={() => setH(x => ({ ...x, classExams: x.classExams.filter(y => y.id !== e.id) }))}>حذف</button></li>; })}</ul>}
        </Card>
      </div>
    </div>
  );
}

export function Compare({ h, setH }) {
  const [cid, setCid] = useState('');
  const cls = h.classes.find(c => c.id === cid);
  const rows = useMemo(() => Object.entries(H.compareStats(h, cls?.members || null)).filter(([k]) => k.startsWith('ref:')).map(([k, v]) => ({ ref: k.slice(4), ...v })).sort((a, z) => a.p50 - z.p50), [h, cid]);
  const consenting = Object.values(h.packs).filter(p => p.consent?.compare).length;
  return (
    <div>
      <Head kicker="مرکز" title="مقایسه مباحث" />
      <div className="mb-4 flex flex-wrap items-center gap-2"><Chip active={!cid} onClick={() => setCid('')}>همه</Chip>{h.classes.map(c => <Chip key={c.id} active={cid === c.id} onClick={() => setCid(c.id)}>{c.name}</Chip>)}
        <label className="mr-auto text-[14px]">حداقل اندازه گروه <input inputMode="numeric" className="w-14 rounded-[8px] border-2 border-[var(--rule)] bg-[var(--paper)] px-2 text-center" value={h.minGroup} onChange={e => setH(x => ({ ...x, minGroup: Math.max(2, +e.target.value || 3) }))} /></label></div>
      <Card>
        <p className="mb-3 text-[14px] text-[var(--pencil)]">{fa(consenting)} نفر اجازه مقایسه داده‌اند. مباحث بر اساس کتاب درسی یکی می‌شوند، پس کتاب‌های تست مختلف و دو رشته هم قابل مقایسه‌اند. ضعیف‌ترین مباحث بالا هستند.</p>
        {!rows.length ? <Empty title="هنوز داده کافی نیست" text={`برای هر مبحث حداقل ${fa(h.minGroup)} نفر با اجازه لازم است.`} /> :
          <table className="w-full text-right text-[14px]"><thead><tr className="text-[13px] text-[var(--pencil)]"><th className="py-2">مبحث (کتاب درسی)</th><th>نفر</th><th>میانه تسلط</th><th>بازه میانی</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.ref} className="border-t border-[var(--rule)]"><td className="py-1.5">{tbTitle(r.ref)}</td><td>{fa(r.n)}</td><td><b>{fa(Math.round(r.p50 * 100))}٪</b></td><td>{fa(Math.round(r.p25 * 100))}–{fa(Math.round(r.p75 * 100))}٪</td></tr>)}</tbody></table>}
      </Card>
    </div>
  );
}

export function Notes({ h, setH }) {
  const [a, setA] = useState({ title: '', text: '', classId: '' });
  return (
    <div>
      <Head kicker="مرکز" title="اطلاعیه‌ها" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <label className="block text-[14px] font-bold">عنوان<input className={inp} value={a.title} onChange={e => setA({ ...a, title: e.target.value })} /></label>
          <label className="mt-2 block text-[14px] font-bold">متن<textarea rows={4} className={inp} value={a.text} onChange={e => setA({ ...a, text: e.target.value })} /></label>
          <label className="mt-2 block text-[14px] font-bold">برای<select className={inp} value={a.classId} onChange={e => setA({ ...a, classId: e.target.value })}><option value="">همه</option>{h.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <Btn className="mt-3" disabled={!a.title.trim()} onClick={() => { setH(x => H.addAnnouncement(x, { ...a, classId: a.classId || null })); setA({ title: '', text: '', classId: '' }); }}>افزودن (در اطلاع‌رسانی بعدی می‌رود)</Btn>
        </Card>
        <Card><ul className="grid gap-2">{h.announcements.map(n => <li key={n.id} className="rounded-[10px] bg-[var(--wash)] p-3 text-[14px]"><b>{n.title}</b>{n.classId ? ` · ${h.classes.find(c => c.id === n.classId)?.name}` : ''}<p>{n.text}</p><button type="button" className="text-[12px] font-bold text-[var(--bad)]" onClick={() => setH(x => ({ ...x, announcements: x.announcements.filter(y => y.id !== n.id) }))}>حذف</button></li>)}</ul></Card>
      </div>
    </div>
  );
}


export function MockExams({ h, setH }) {
  const [f, setF] = useState({ classId: '', provider: 'ghalamchi', title: '', startDate: addDays(todayStr(), 3), everyWeeks: 2, count: 6, from: '07:30', to: '11:30', target: 60, rounds: [] });
  const cls = h.classes.find(c => c.id === f.classId);
  const tbs = TEXTBOOKS.filter(t => t.nodes.length && (!cls || ((!cls.grade || t.grade === cls.grade) && (!cls.subjectIds.length || cls.subjectIds.includes(t.subjectId)))));
  const makeRounds = () => Array.from({ length: Math.max(1, Math.min(40, +f.count || 1)) }, (_, i) => f.rounds[i] || { no: i + 1, date: addDays(f.startDate, i * (+f.everyWeeks || 2) * 7), title: '', from: f.from, to: f.to, sections: [] });
  const rounds = makeRounds();
  const patchRound = (i, p) => setF(x => { const rs = Array.from({ length: Math.max(1, Math.min(40, +x.count || 1)) }, (_, j) => x.rounds[j] || { no: j + 1, date: addDays(x.startDate, j * (+x.everyWeeks || 2) * 7), title: '', from: x.from, to: x.to, sections: [] }); rs[i] = { ...rs[i], ...p }; return { ...x, rounds: rs }; });
  const addSec = (i, tb) => patchRound(i, { sections: [...(rounds[i].sections || []), { textbookId: tb.id, subjectId: tb.subjectId, count: 10, tbRefs: [] }] });
  const toggleRef = (i, j, id) => patchRound(i, { sections: rounds[i].sections.map((x, k) => k === j ? { ...x, tbRefs: x.tbRefs.includes(id) ? x.tbRefs.filter(y => y !== id) : [...x.tbRefs, id] } : x) });
  const save = () => { const rs = rounds.map(r => ({ ...r, sections: r.sections.filter(x => x.tbRefs.length && x.count > 0) })); if (!f.title.trim()) return; const ms = { id: 'mock-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: f.title.trim(), provider: f.provider, classId: f.classId || null, startDate: f.startDate, everyWeeks: +f.everyWeeks || 2, count: +f.count || 1, from: f.from, to: f.to, target: +f.target || 60, rounds: rs, active: true, createdAt: new Date().toISOString() }; setH(x => ({ ...x, mockSeries: [...(x.mockSeries || []), ms] })); setF({ ...f, title: '', rounds: [] }); };
  return <div><Head kicker="مرکز" title="آزمون‌های شبه‌کنکور" /><div className="grid gap-5 lg:grid-cols-[1fr_380px]"><Card><p className="mb-1 text-[16px] font-black">سری آزمون جدید</p><p className="mb-3 text-[14px] text-[var(--pencil)]">آزمون‌ها با برگزارکننده (قلم‌چی، ماز، گاج…) ثبت می‌شوند نه با کلاس؛ مباحث هر مرحله را هر وقت اعلام شد اضافه کن. دانش‌آموز فقط کتاب و آزمون دریافتی را فعال می‌کند.</p>{<><div className="grid gap-2 sm:grid-cols-3"><label className="text-[14px] font-bold">برگزارکننده<select className={inp} value={f.provider} onChange={e => setF({ ...f, provider: e.target.value })}>{[['ghalamchi','قلم‌چی'],['maz','ماز'],['gaj','گاج'],['sanjesh','سنجش'],['gozine2','گزینه ۲'],['mahan','ماهان'],['hamian','حامیان'],['center','آزمون مرکز'],['other','دیگر']].map(([k,t]) => <option key={k} value={k}>{t}</option>)}</select></label><label className="text-[14px] font-bold">برای<select className={inp} value={f.classId} onChange={e => setF({ ...f, classId: e.target.value, rounds: [] })}><option value="">همه دانش‌آموزان</option>{h.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-[14px] font-bold">عنوان سری<input className={inp} placeholder="شبه‌کنکور پاییز" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label><label className="text-[14px] font-bold">تاریخ مرحله اول<input type="date" className={inp} value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value, rounds: [] })} /></label><label className="text-[14px] font-bold">فاصله<select className={inp} value={f.everyWeeks} onChange={e => setF({ ...f, everyWeeks: +e.target.value, rounds: [] })}><option value="2">هر ۲ هفته</option><option value="1">هر هفته</option><option value="3">هر ۳ هفته</option><option value="4">هر ۴ هفته</option></select></label><label className="text-[14px] font-bold">تعداد مراحل<select className={inp} value={f.count} onChange={e => setF({ ...f, count: +e.target.value })}>{Array.from({length: 12},(_,i)=><option key={i+1} value={i+1}>{fa(i+1)} مرحله</option>)}</select></label><label className="text-[14px] font-bold">هدف درصد<input inputMode="numeric" className={inp} value={f.target} onChange={e => setF({ ...f, target: +e.target.value || 60 })} /></label></div><div className="mt-4 grid gap-3">{rounds.map((r, i) => <details key={r.no} className="rounded-[10px] bg-[var(--wash)] p-3" open={i === 0}><summary className="cursor-pointer text-[15px] font-black">مرحله {fa(r.no)} · {jShort(r.date)} · {r.sections.length ? `${fa(r.sections.length)} درس` : 'مباحث انتخاب نشده'}</summary><div className="mt-2 grid gap-2"><div className="flex gap-2"><label className="text-[13px] font-bold">عنوان<input className={inp} value={r.title} onChange={e => patchRound(i, { title: e.target.value })} placeholder="مرحله ۱" /></label><label className="text-[13px] font-bold">تاریخ<input type="date" className={inp} value={r.date} onChange={e => patchRound(i, { date: e.target.value })} /></label></div><div className="flex flex-wrap gap-1.5">{tbs.map(tb => <Chip key={tb.id} onClick={() => addSec(i, tb)}>+ {tb.title}</Chip>)}</div>{r.sections.map((sec, j) => { const tb = textbookById(sec.textbookId); return <div key={j} className="rounded-[8px] bg-[var(--card)] p-2"><div className="flex justify-between text-[14px]"><b>{tb?.title}</b><label>تعداد سؤال <input className="w-14 rounded border p-1 text-center" value={sec.count} onChange={e => patchRound(i, { sections: r.sections.map((x,k)=>k===j?{...x,count:+e.target.value||0}:x) })}/></label></div><div className="max-h-40 overflow-auto">{tb?.nodes.filter(n => n.kind === 'topic' && n.isLeaf).map(n => <label key={n.id} className="mr-2 block text-[13px]"><input type="checkbox" checked={sec.tbRefs.includes(n.id)} onChange={() => toggleRef(i,j,n.id)}/> {n.title}</label>)}</div></div>})}</div></details>)}</div><Btn className="mt-4" disabled={!f.title.trim()} onClick={save}>ثبت و انتشار در اطلاع‌رسانی بعدی</Btn></>}</Card><Card><p className="mb-3 text-[16px] font-black">سری‌های ثبت‌شده</p>{!(h.mockSeries || []).length ? <p className="text-[14px] text-[var(--pencil)]">هنوز سری آزمونی نیست.</p> : <ul className="grid gap-2">{h.mockSeries.map(ms => <li key={ms.id} className="rounded-[10px] bg-[var(--wash)] p-3 text-[14px]"><b>{ms.title}</b><p className="text-[13px] text-[var(--pencil)]">{ms.provider ? ms.provider + ' · ' : ''}{h.classes.find(c=>c.id===ms.classId)?.name || 'همه'} · هر {fa(ms.everyWeeks)} هفته · {fa(ms.count)} مرحله</p><div className="mt-2 flex gap-2"><Btn kind="soft" className="min-h-[32px] px-2 text-[12px]" onClick={() => setH(x => ({ ...x, mockSeries: x.mockSeries.map(z => z.id === ms.id ? { ...z, active: z.active === false } : z) }))}>{ms.active === false ? 'فعال کن' : 'متوقف کن'}</Btn><button type="button" className="text-[12px] font-bold text-[var(--bad)]" onClick={() => confirm('این سری و آزمون‌های بدون نتیجه‌اش حذف شود؟') && setH(x => ({ ...x, mockSeries: x.mockSeries.filter(z => z.id !== ms.id) }))}>حذف</button></div></li>)}</ul>}</Card></div></div>;
}
