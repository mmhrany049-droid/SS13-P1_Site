// SS 13 — phase 1 pages: «مجوزها و تأییدها» (owner decides, owner-admin asks) and «تیک طلایی» (teachers).
import { useCallback, useEffect, useState } from 'react';
import { call, errFa } from '../shell/api.js';
import { Btn, Card, Head, Empty, fa, jDate } from '@ss/ui/ui.jsx';

const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2.5 text-[15px] outline-none focus:border-[var(--ink)]';
const ST = { pending: ['در انتظار تأیید', 'var(--amber)'], approved: ['تأییدشده', 'var(--ok)'], denied: ['ردشده', 'var(--bad)'], revoked: ['لغوشده', 'var(--pencil)'] };
const Msg = ({ m }) => (m ? <p role={m.bad ? 'alert' : 'status'} className="mt-3 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px] font-bold">{m.t}</p> : null);
const useLoad = path => { const [d, setD] = useState(null); const [e, setE] = useState(''); const load = useCallback(() => call(path).then(x => { setD(x); setE(''); }).catch(x => setE(errFa(x))), [path]); useEffect(() => { load(); }, [load]); return [d, load, e]; };

export function Approvals() {
  const [d, load, err] = useLoad('/api/workspace/approvals'); const [m, setM] = useState(null); const [cap, setCap] = useState(''); const [why, setWhy] = useState(''); const [days, setDays] = useState({}); const [note, setNote] = useState({});
  const act = async (p, body = {}) => { try { await call(p, { method: 'POST', body }); setM(null); load(); } catch (x) { setM({ bad: true, t: errFa(x) }); } };
  if (err) return <Card><p role="alert" className="text-[var(--bad)]">{err}</p></Card>; if (!d) return <p className="p-6 text-[var(--pencil)]">در حال بارگذاری…</p>;
  const pending = d.items.filter(g => g.status === 'pending'); const rest = d.items.filter(g => g.status !== 'pending');
  return <div><Head kicker="امنیت" title={d.canDecide ? 'مجوزها و تأییدها' : 'مجوزهای من'} />
    <Card className="mb-5"><p className="text-[14px] leading-7 text-[var(--pencil)]">{d.canDecide ? 'ادمین‌های مالک برای دیدن یا تغییر بعضی اطلاعات از تو مجوز می‌خواهند. هر مجوز را می‌توانی با مدت دلخواه تأیید، رد یا هر زمان لغو کنی.' : 'برای دیدن یا تغییر بعضی اطلاعات به تأیید مالک نیاز داری. درخواستت را بفرست؛ تا تأیید نشود آن بخش کار نمی‌کند.'}</p></Card>
    {!d.canDecide && <Card className="mb-5"><p className="mb-2 text-[16px] font-black">درخواست مجوز تازه</p>
      <label className="block text-[14px] font-bold">کدام قابلیت؟<select className={inp} value={cap} onChange={e => setCap(e.target.value)}><option value="">— انتخاب کن —</option>{d.capabilities.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label className="mt-2 block text-[14px] font-bold">دلیل (اختیاری)<input className={inp} maxLength={200} value={why} onChange={e => setWhy(e.target.value)} /></label>
      <Btn className="mt-3" disabled={!cap} onClick={async () => { await act('/api/workspace/approvals/request', { capability: cap, reason: why }); setCap(''); setWhy(''); }}>ارسال درخواست</Btn><Msg m={m} /></Card>}
    {d.canDecide && <Msg m={m} />}
    <p className="mb-2 text-[16px] font-black">در انتظار ({fa(pending.length)})</p>
    {!pending.length ? <Card><p className="text-[14px] text-[var(--pencil)]">درخواست بازی نیست.</p></Card> : <div className="grid gap-3">{pending.map(g => <Card key={g.id}><p className="text-[15px] font-black">{g.userName} · {g.label}</p><p className="text-[13px] text-[var(--pencil)]">{jDate(g.requestedAt?.slice(0, 10))}{g.reason ? ` · ${g.reason}` : ''}</p>
      {d.canDecide && <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-[13px] font-bold">مدت (روز، خالی = بدون پایان)<input type="number" min="1" max="365" className={inp + ' w-28'} value={days[g.id] ?? ''} onChange={e => setDays({ ...days, [g.id]: e.target.value })} /></label><label className="min-w-[160px] flex-1 text-[13px] font-bold">یادداشت<input className={inp} value={note[g.id] || ''} onChange={e => setNote({ ...note, [g.id]: e.target.value })} /></label>
        <Btn onClick={() => act(`/api/workspace/approvals/${g.id}/decide`, { decision: 'approve', days: days[g.id] || null, note: note[g.id] })}>تأیید</Btn><Btn kind="soft" onClick={() => act(`/api/workspace/approvals/${g.id}/decide`, { decision: 'deny', note: note[g.id] })}>رد</Btn></div>}</Card>)}</div>}
    <p className="mb-2 mt-6 text-[16px] font-black">سابقه</p>
    {!rest.length ? <p className="text-[14px] text-[var(--pencil)]">هنوز چیزی تصمیم‌گیری نشده.</p> : <Card className="overflow-x-auto"><table className="w-full min-w-[520px] text-[14px]"><thead><tr className="text-right text-[var(--pencil)]"><th className="py-1">ادمین</th><th>قابلیت</th><th>وضعیت</th><th>پایان</th><th /></tr></thead><tbody>{rest.map(g => <tr key={g.id} className="border-t border-[var(--rule)]"><td className="py-1.5">{g.userName}</td><td>{g.label}</td><td style={{ color: ST[g.status][1] }} className="font-bold">{ST[g.status][0]}</td><td>{g.expiresAt ? jDate(g.expiresAt.slice(0, 10)) : '—'}</td>
      <td>{d.canDecide && g.status === 'approved' && <Btn kind="ghost" onClick={() => confirm('این مجوز لغو شود؟') && act(`/api/workspace/approvals/${g.id}/revoke`)}>لغو</Btn>}</td></tr>)}</tbody></table></Card>}</div>;
}

export function Badges() {
  const [d, load, err] = useLoad('/api/workspace/badges'); const [m, setM] = useState(null);
  const set = async (u, on) => { try { await call(`/api/workspace/badges/${on ? 'grant' : 'revoke'}`, { method: 'POST', body: { userId: u.userId } }); setM(null); load(); } catch (x) { setM({ bad: true, t: errFa(x) }); } };
  if (err) return <Card><p role="alert" className="text-[var(--bad)]">{err}</p></Card>; if (!d) return <p className="p-6 text-[var(--pencil)]">در حال بارگذاری…</p>;
  return <div><Head kicker="معلم‌ها" title="تیک طلایی" />
    <Card className="mb-5"><p className="text-[14px] leading-7">معلم دارای تیک طلایی به امکانات ویژه دسترسی دارد. فعلاً: {d.features.map(f => f.label).join('، ')}. امکانات بیشتر بعداً به همین تیک اضافه می‌شود.</p><Msg m={m} /></Card>
    {!d.items.length ? <Empty title="معلمی نیست" text="اول از «افراد و نقش‌ها» معلم اضافه کن." /> : <div className="grid gap-3">{d.items.map(u => <Card key={u.userId}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[16px] font-black">{u.gold && <span aria-label="تیک طلایی" className="ml-1 text-[#C9A227]">✔</span>}{u.name}</p><p className="text-[13px] text-[var(--pencil)]">{u.roles.join('، ')}{u.since ? ` · از ${jDate(u.since.slice(0, 10))}` : ''}</p></div>
      <Btn kind={u.gold ? 'soft' : undefined} onClick={() => set(u, !u.gold)}>{u.gold ? 'گرفتن تیک' : 'دادن تیک طلایی'}</Btn></div></Card>)}</div>}</div>;
}
