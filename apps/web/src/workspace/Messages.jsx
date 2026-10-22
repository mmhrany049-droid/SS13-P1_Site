// پیام‌ها: threads with each student (sent from the student app's assistant or account page). Replies go to the app and, if set, to Gmail.
import { useEffect, useRef, useState } from 'react';
import { api, errText } from './adminApi.js';
import { Btn, Card, Head, Empty, fa, jDate } from '@ss/ui/ui.jsx';
import { inp } from './theme.js';

export default function Messages({ offline, counts, refreshCounts }) {
  const [th, setTh] = useState(null); const [cur, setCur] = useState(() => sessionStorage.getItem('ss-admin-thread')); const [text, setText] = useState(''); const [mail, setMail] = useState(true); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const load = () => api('/api/admin/messages').then(r => setTh(r.threads)).catch(e => setMsg(errText(e)));
  useEffect(() => { if (!offline) { load(); const i = setInterval(load, 20000); return () => clearInterval(i); } }, []);
  useEffect(() => { sessionStorage.removeItem('ss-admin-thread'); if (cur && th?.find(t => t.studentId === cur)?.unread) api(`/api/admin/messages/${cur}/read`, { method: 'POST', body: {} }).then(() => { load(); refreshCounts?.(); }).catch(() => {}); end.current?.scrollIntoView({ block: 'end' }); }, [cur, th?.length]);
  if (offline) return <div><Head kicker="مرکز" title="پیام‌ها" /><Card><Empty title="بدون سرور" text="پیام‌ها فقط با سرور مرکز کار می‌کند." /></Card></div>;
  const t = th?.find(x => x.studentId === cur);
  const reply = async () => { if (!text.trim()) return; setBusy(true); setMsg(''); try { const r = await api(`/api/admin/messages/${cur}`, { method: 'POST', body: { text, email: mail } }); setText(''); setMsg(r.mailed ? '✓ فرستاده شد (در برنامه و ایمیل).' : '✓ در برنامه دانش‌آموز فرستاده شد.'); await load(); } catch (e) { setMsg('✗ ' + errText(e)); } setBusy(false); };
  return <div>
    <Head kicker="مرکز" title="پیام‌ها" />
    {!th ? <p>…</p> : !th.length && !cur ? <Card><Empty title="هنوز پیامی نیامده" text="دانش‌آموزان از دستیار برنامه («پیام به مشاور») یا صفحه حساب پیام می‌فرستند. از صفحه دانش‌آموزان هم می‌توانی گفتگو را شروع کنی." /></Card> :
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="max-h-[72vh] overflow-auto p-2">{(th || []).map(x => <button key={x.studentId} type="button" onClick={() => setCur(x.studentId)} className={`mb-1 block w-full rounded-[10px] p-3 text-right ${cur === x.studentId ? 'bg-[var(--ink)] text-[var(--paper)]' : 'hover:bg-[var(--wash)]'}`}>
          <span className="flex items-center justify-between"><b className="text-[15px]">{x.name}</b>{x.unread > 0 && <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] ${cur === x.studentId ? 'bg-[var(--paper)] text-[var(--ink)]' : 'bg-[var(--ink)] text-[var(--paper)]'}`}>{fa(x.unread)}</span>}</span>
          <span className="block truncate text-[13px] opacity-80">{x.last.from === 'admin' ? 'تو: ' : ''}{x.last.text}</span></button>)}</Card>
        <Card className="flex max-h-[72vh] min-h-[420px] flex-col p-0">
          {!cur ? <div className="grid flex-1 place-items-center p-6 text-[15px] text-[var(--pencil)]">یک گفتگو را انتخاب کن.</div> : <>
            <div className="border-b-2 border-[var(--rule)] p-4"><p className="text-[18px] font-black">{t?.name || 'گفتگوی جدید'}</p>{t?.email && <p className="text-[13px] text-[var(--pencil)]" dir="ltr">{t.email}</p>}</div>
            <div className="flex-1 overflow-auto p-4">{[...(t?.items || [])].reverse().map(m => <div key={m.id} className={`mb-3 flex ${m.from === 'admin' ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[80%] rounded-[16px] px-4 py-2.5 text-[15px] leading-7 ${m.from === 'admin' ? 'rounded-bl-[4px] bg-[var(--ink)] text-[var(--paper)]' : 'rounded-br-[4px] bg-[var(--wash)]'}`}>{m.subject && m.from === 'student' && <b className="block text-[13px]">{m.subject}</b>}<p className="whitespace-pre-line">{m.text}</p><p className="mt-1 text-[11px] opacity-70">{m.from === 'admin' ? m.by + ' · ' : ''}{jDate(m.at)}</p></div></div>)}<div ref={end} /></div>
            <div className="border-t-2 border-[var(--rule)] p-3">
              <textarea rows={3} aria-label="پاسخ" className={inp + ' mt-0'} placeholder="پاسخ را بنویس…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) reply(); }} />
              <div className="mt-2 flex flex-wrap items-center gap-3"><Btn disabled={busy || !text.trim()} onClick={reply}>{busy ? 'در حال ارسال…' : 'ارسال'}</Btn><label className="flex items-center gap-2 text-[14px]"><input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={mail} disabled={!counts.mail || !t?.email} onChange={e => setMail(e.target.checked)} />به Gmail دانش‌آموز هم برود</label>{msg && <span className="text-[14px] font-bold">{msg}</span>}</div>
            </div></>}
        </Card>
      </div>}
  </div>;
}
