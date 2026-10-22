import { useState } from 'react';
import { leaves, chapterOf, label, todayStr } from '@ss/domain/store.js';
import { Card, Head, Chip, fa, jShort } from '@ss/ui/ui.jsx';

const STATES = [[null, 'نخوانده'], ['taught', 'تدریس شد'], ['self', 'خودم خواندم']];

/** Taught / self-studied topics (MTS, spec 31 TB-14): tri-state with date. */
export default function Topics({ s, set }) {
  const act = s.books.filter(b => b.active !== false);
  const [bid, setBid] = useState(act[0]?.id);
  const b = s.books.find(x => x.id === bid);
  const t = s.taught[bid] || {};
  const setState = (nid, st) => set(x => { const m = { ...(x.taught[bid] || {}) }; if (st) m[nid] = { state: st, at: m[nid]?.at || todayStr() }; else delete m[nid]; return { ...x, taught: { ...x.taught, [bid]: m } }; });
  const ls = b ? leaves(b).filter(n => n.kind === 'topic') : [];
  const groups = []; for (const n of ls) { const c = chapterOf(b, n); const g = groups.find(x => x.c.id === c.id); g ? g.items.push(n) : groups.push({ c, items: [n] }); }
  const cnt = st => ls.filter(n => (t[n.id]?.state || null) === st).length;
  return (
    <div>
      <Head kicker="مباحث" title={<>چه خوانده‌ای؟</>} />
      <div className="mb-5 flex flex-wrap gap-2">{act.map(x => <Chip key={x.id} active={x.id === bid} onClick={() => setBid(x.id)}>{x.subject}</Chip>)}</div>
      {b && <>
        <p className="mb-4 text-[15px] text-[var(--pencil)]">تدریس شد {fa(cnt('taught'))} · خودم خواندم {fa(cnt('self'))} · نخوانده {fa(cnt(null))}</p>
        <div className="grid gap-5 lg:grid-cols-2">
          {groups.map(g => (
            <Card key={g.c.id}>
              <p className="mb-3 text-[16px] font-black">{label(b, g.c)}</p>
              <ul className="grid gap-2">{g.items.map(n => { const cur = t[n.id]?.state || null; return (
                <li key={n.id} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <span className="text-[15px]">{label(b, n)}{t[n.id]?.at && <span className="mr-2 text-[13px] text-[var(--pencil)]">{jShort(t[n.id].at)}</span>}</span>
                  <div role="radiogroup" aria-label={label(b, n)} className="flex overflow-hidden rounded-[10px] border-2 border-[var(--rule)] text-[13px] font-bold">
                    {STATES.map(([st, tx]) => <button key={tx} type="button" role="radio" aria-checked={cur === st} onClick={() => setState(n.id, st)} className={`min-h-[34px] px-3 ${cur === st ? (st ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[var(--wash)]') : 'bg-[var(--card)] text-[var(--pencil)]'}`}>{tx}</button>)}
                  </div>
                </li>); })}</ul>
            </Card>))}
        </div>
      </>}
    </div>
  );
}
