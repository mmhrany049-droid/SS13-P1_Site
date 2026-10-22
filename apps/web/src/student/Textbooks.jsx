// v9 — «کتاب‌های درسی»: every official textbook of grades 10–12 (ریاضی‌فیزیک + تجربی) is in the app by default.
// I choose the ones in MY program, and add detail over time: chapters first, lessons/sub-sections later.
// Layers: base catalog ← hub layer (from «مدیریت») ← my additions (s.tbCustom). Nothing here needs a server.
import { useMemo, useState } from 'react';
import { TEXTBOOKS, GRADES, GRADE_FA, STREAMS, myTextbookIds, programTextbooks, detailOf, newNodeId, CATALOG } from '@ss/domain/curriculum.js';
import { hubUrlOf, siteConfig } from './sync/client.js';
import { Btn, Card, Chip, Head, Empty, fa } from '@ss/ui/ui.jsx';

const inp = 'rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-1.5 text-[14px]';
const LEVEL_FA = { chapter: 'فقط فصل‌ها', lesson: 'فصل + درس', deep: 'فصل + درس + زیربخش' };

export default function Textbooks({ s, set, go }) {
  const [grade, setGrade] = useState(s.me?.grade || 11); const [stream, setStream] = useState(s.me?.stream || 'rf');
  const [onlyMine, setOnlyMine] = useState(false); const [open, setOpen] = useState(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const mine = new Set(myTextbookIds(s));
  const list = useMemo(() => TEXTBOOKS.filter(t => (onlyMine ? mine.has(t.id) : t.grade === grade && t.streams.includes(stream))), [grade, stream, onlyMine, s.myTextbooks, s.tbCustom, s.catalogHub]);
  const toggle = id => set(x => { const cur = new Set(myTextbookIds(x)); if (cur.has(id)) cur.delete(id); else cur.add(id); return { ...x, myTextbooks: [...cur] }; });
  const usePro = () => set(x => ({ ...x, myTextbooks: [...new Set([...myTextbookIds(x), ...programTextbooks(grade, stream).map(t => t.id)])] }));
  const fetchHub = async () => {
    setMsg(''); setBusy(true);
    try { await siteConfig(); const url = hubUrlOf(s) || s.account?.server?.url; if (!url) throw new Error('آدرس مرکز ثبت نشده (مرکز و همگام‌سازی).');
      const r = await fetch(url.replace(/\/+$/, '') + '/api/catalog', { cache: 'no-store' }); if (r.status === 204) { setMsg('مرکز هنوز تغییری روی فهرست‌ها نداده؛ فهرست داخل برنامه کامل است.'); return; }
      if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); const layer = j.layer || j;
      set(x => ({ ...x, catalogHub: layer })); setMsg(`فهرست‌های مرکز گرفته شد (${fa(Object.keys(layer).filter(k => k !== '__extra').length)} کتاب درسی به‌روز شد).`);
    } catch (e) { setMsg(e.message === 'Failed to fetch' ? 'به مرکز وصل نشد؛ اینترنت را بررسی کن. فهرست‌های داخل برنامه بدون اینترنت هم کار می‌کنند.' : e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <Head kicker="کتاب‌های درسی" title="فهرست کتاب‌ها">
        <div className="flex flex-wrap gap-2"><Btn kind="soft" disabled={busy} onClick={fetchHub}>{busy ? 'در حال گرفتن…' : '⟳ به‌روزرسانی از مرکز'}</Btn></div>
      </Head>
      <Card className="mb-5 rise-in">
        <div className="flex flex-wrap items-center gap-2">
          {GRADES.map(g => <Chip key={g} active={!onlyMine && grade === g} onClick={() => { setGrade(g); setOnlyMine(false); }}>{GRADE_FA[g]}</Chip>)}
          <span className="mx-1 h-6 w-px bg-[var(--rule)]" />
          {Object.entries(STREAMS).map(([k, t]) => <Chip key={k} active={!onlyMine && stream === k} onClick={() => { setStream(k); setOnlyMine(false); }}>{t}</Chip>)}
          <span className="mx-1 h-6 w-px bg-[var(--rule)]" />
          <Chip active={onlyMine} onClick={() => setOnlyMine(v => !v)}>کتاب‌های من ({fa(mine.size)})</Chip>
          {!onlyMine && <Btn kind="ghost" className="mr-auto min-h-[36px] px-3 text-[13px]" onClick={usePro}>همه کتاب‌های {GRADE_FA[grade]} {STREAMS[stream]} را اضافه کن</Btn>}
        </div>
        <p className="mt-3 text-[13px] leading-6 text-[var(--pencil)]">فهرست‌ها از فهرست رسمی کتاب‌های چاپ {fa(CATALOG.edition || '1405')} آمده‌اند و بدون اینترنت هم در دسترس‌اند. هر جا فقط فصل‌ها هست، درس‌ها و زیربخش‌ها را به مرور خودت اضافه کن (یا مرکز اضافه می‌کند).</p>
        {msg && <p role="status" className="pop-in mt-3 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px] font-bold text-[var(--ink-deep)]">{msg}</p>}
      </Card>
      {!list.length ? <Empty title="کتابی نیست" text={onlyMine ? 'هنوز کتابی به برنامه‌ات اضافه نکرده‌ای.' : 'برای این پایه و رشته کتابی ثبت نشده.'} /> :
        <div className="stagger grid gap-4 md:grid-cols-2">{list.map(tb => { const d = detailOf(tb); const on = mine.has(tb.id); return (
          <Card key={tb.id} className={`lift ${open === tb.id ? 'md:col-span-2' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button type="button" className="text-right" onClick={() => setOpen(open === tb.id ? null : tb.id)}>
                <p className="text-[18px] font-black">{tb.title}</p>
                <p className="mt-0.5 text-[13px] text-[var(--pencil)]">{GRADE_FA[tb.grade]} · {tb.streams.map(x => STREAMS[x]).join(' و ')} · {fa(d.chapters)} فصل{d.lessons ? ` · ${fa(d.lessons)} درس/بخش` : ''}</p>
                <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-bold ${d.level === 'chapter' ? 'bg-[color-mix(in_srgb,var(--amber)_16%,transparent)] text-[var(--amber)]' : 'bg-[var(--wash)] text-[var(--ink-deep)]'}`}>{LEVEL_FA[d.level]}</span>
              </button>
              <div className="flex flex-wrap gap-2"><Chip active={on} onClick={() => toggle(tb.id)}>{on ? 'در برنامه من ✓' : '+ برنامه من'}</Chip>
                <Btn kind="soft" className="min-h-[38px] px-3 text-[13px]" onClick={() => { try { sessionStorage.setItem('ss-new-book-tb', tb.id); } catch { /* */ } go('books'); }}>ساخت کتاب تست</Btn></div>
            </div>
            {open === tb.id && <Toc s={s} set={set} tb={tb} />}
          </Card>); })}</div>}
    </div>
  );
}

/** The TOC of one textbook; chapters always shown, lessons beneath; I can add/rename my own lines. */
function Toc({ s, set, tb }) {
  const [adding, setAdding] = useState(null); const [title, setTitle] = useState(''); const [ren, setRen] = useState(null);
  const L = s.tbCustom?.[tb.id] || {};
  const save = patch => set(x => ({ ...x, tbCustom: { ...(x.tbCustom || {}), [tb.id]: { ...(x.tbCustom?.[tb.id] || {}), ...patch } } }));
  const add = parentId => { const t = title.trim(); if (!t) return; save({ add: [...(L.add || []), { id: newNodeId(tb, parentId), parentId, title: t, mine: true }] }); setTitle(''); };
  const del = id => save({ add: (L.add || []).filter(a => a.id !== id && !a.parentId.startsWith(id)) });
  const rename = (id, t) => { save({ rename: { ...(L.rename || {}), [id]: t.trim() } }); setRen(null); };
  return (
    <div className="pop-in mt-4 border-t-2 border-[var(--rule)] pt-3">
      <ul className="grid gap-1">{tb.nodes.filter(n => n.kind !== 'problemSet').map(n => <li key={n.id} style={{ paddingRight: n.depth * 18 }}>
        <div className={`group flex flex-wrap items-center gap-2 rounded-[8px] px-2 py-1 ${n.depth === 0 ? 'bg-[var(--wash)] text-[15px] font-black' : 'text-[14px]'}`}>
          {ren === n.id ? <form className="flex flex-1 gap-2" onSubmit={e => { e.preventDefault(); rename(n.id, e.target.t.value); }}><input name="t" autoFocus defaultValue={n.title} className={inp + ' flex-1'} /><Btn type="submit" className="min-h-[32px] px-3 text-[13px]">ذخیره</Btn></form>
            : <span className="flex-1">{n.title}{n.mine && <span className="mr-2 rounded-full bg-[var(--card)] px-2 text-[11px] font-bold text-[var(--ink)]">افزوده من</span>}</span>}
          {ren !== n.id && <span className="flex gap-1 opacity-70 group-hover:opacity-100">
            {n.depth < 2 && <button type="button" className="rounded-full px-2 text-[12px] font-bold text-[var(--ink)] hover:bg-[var(--card)]" onClick={() => { setAdding(adding === n.id ? null : n.id); setTitle(''); }}>+ {n.depth === 0 ? 'درس/بخش' : 'زیربخش'}</button>}
            <button type="button" className="rounded-full px-2 text-[12px] text-[var(--pencil)] hover:bg-[var(--card)]" onClick={() => setRen(n.id)}>نام</button>
            {n.mine && <button type="button" aria-label="حذف" className="rounded-full px-2 text-[14px] text-[var(--bad)] hover:bg-[var(--card)]" onClick={() => del(n.id)}>×</button>}</span>}
        </div>
        {adding === n.id && <form className="pop-in mt-1 flex gap-2 pr-6" onSubmit={e => { e.preventDefault(); add(n.id); }}><input autoFocus className={inp + ' flex-1'} placeholder={n.depth === 0 ? 'مثلاً درس ۲: اسید و باز' : 'مثلاً pH محلول‌ها'} value={title} onChange={e => setTitle(e.target.value)} /><Btn type="submit" className="min-h-[34px] px-3 text-[13px]" disabled={!title.trim()}>افزودن</Btn></form>}
      </li>)}</ul>
      {tb.note && <p className="mt-3 text-[13px] text-[var(--pencil)]">{tb.note}</p>}
      <p className="mt-3 text-[13px] text-[var(--pencil)]">افزوده‌های تو فقط روی همین دستگاه‌اند و با پشتیبان/همگام‌سازی جابه‌جا می‌شوند. کتاب‌های تستی که از این کتاب ساخته‌ای، در «کتاب‌ها» پیشنهاد اضافه شدن درس‌های تازه را می‌گیرند.</p>
    </div>
  );
}
