// مدیران و نقش‌ها (owner only): invite by email with a one-time temp password, change role, disable, remove.
import { useEffect, useState } from 'react';
import { api, errText } from './adminApi.js';
import { Btn, Card, Chip, Head, fa, jDate } from '@ss/ui/ui.jsx';
import { inp } from './theme.js';

const ROLE_HELP = { manager: 'همه کارها جز مدیران، تنظیمات و پشتیبان', teacher: 'دیدن دانش‌آموزان، پیام و ایمیل؛ داده مرکز فقط خواندنی' };
export default function Team({ me }) {
  const [l, setL] = useState(null); const [f, setF] = useState({ email: '', name: '', role: 'teacher' }); const [msg, setMsg] = useState(''); const [temp, setTemp] = useState(null);
  const load = () => api('/api/admin/admins').then(r => setL(r.items)).catch(e => setMsg('✗ ' + errText(e)));
  useEffect(() => { load(); }, []);
  const add = async () => { setMsg(''); setTemp(null); try { const r = await api('/api/admin/admins', { method: 'POST', body: f }); setTemp({ email: f.email, pw: r.tempPassword, mailed: r.mailed }); setF({ email: '', name: '', role: 'teacher' }); load(); } catch (e) { setMsg('✗ ' + errText(e)); } };
  const act = async (a, x, body = {}) => { if (a === 'delete' && !confirm(`«${x.name}» حذف شود؟`)) return; try { await api(`/api/admin/admins/${x.id}/${a}`, { method: 'POST', body }); load(); } catch (e) { setMsg('✗ ' + errText(e)); } };
  return <div>
    <Head kicker="سیستم" title="مدیران و نقش‌ها" />
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Card className="p-0">{!l ? <p className="p-4">…</p> : <ul>{l.map(x => <li key={x.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--rule)] p-4 last:border-0">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--ink)] font-black text-[var(--paper)]">{(x.name || '?').slice(0, 1)}</span>
        <span className="min-w-[180px] flex-1"><b className="text-[16px]">{x.name}</b>{x.id === me.id && <span className="mr-2 text-[13px] text-[var(--pencil)]">(خودت)</span>}<span className="block text-[13px] text-[var(--pencil)]" dir="ltr">{x.email}</span><span className="block text-[12px] text-[var(--pencil)]">{x.lastLoginAt ? `آخرین ورود ${jDate(x.lastLoginAt)}` : 'هنوز وارد نشده'}{x.totp ? ' · دومرحله‌ای ✓' : ''}{x.disabled ? ' · غیرفعال' : ''}</span></span>
        {x.role === 'owner' ? <span className="rounded-full bg-[var(--wash)] px-3 py-1 text-[13px] font-bold">مالک</span> : <div className="flex flex-wrap gap-1.5">{['manager', 'teacher'].map(r => <Chip key={r} className="min-h-[32px] text-[13px]" active={x.role === r} onClick={() => act('role', x, { role: r })}>{r === 'manager' ? 'مدیر' : 'دبیر / مشاور'}</Chip>)}
          <Btn kind="ghost" className="min-h-[32px] text-[13px]" onClick={() => act(x.disabled ? 'enable' : 'disable', x)}>{x.disabled ? 'فعال کن' : 'غیرفعال'}</Btn><Btn kind="ghost" className="min-h-[32px] text-[13px] text-[var(--bad)]" onClick={() => act('delete', x)}>حذف</Btn></div>}
      </li>)}</ul>}</Card>
      <Card className="content-start">
        <p className="mb-3 text-[16px] font-black">افزودن همکار</p>
        <label className="block text-[14px] font-bold">نام<input className={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label className="mt-2 block text-[14px] font-bold">ایمیل<input dir="ltr" className={inp + ' text-left'} value={f.email} onChange={e => setF({ ...f, email: e.target.value.trim() })} /></label>
        <p className="mt-3 text-[14px] font-bold">نقش</p>
        <div className="mt-1 grid gap-2">{['manager', 'teacher'].map(r => <label key={r} className={`flex cursor-pointer items-start gap-2 rounded-[10px] p-3 text-[14px] ${f.role === r ? 'bg-[var(--wash)] outline outline-2 outline-[var(--ink)]' : 'outline outline-2 outline-[var(--rule)]'}`}><input type="radio" name="role" className="mt-1 accent-[var(--ink)]" checked={f.role === r} onChange={() => setF({ ...f, role: r })} /><span><b>{r === 'manager' ? 'مدیر' : 'دبیر / مشاور'}</b><span className="block text-[13px] text-[var(--pencil)]">{ROLE_HELP[r]}</span></span></label>)}</div>
        <Btn className="mt-3 w-full" disabled={!f.email} onClick={add}>افزودن و فرستادن دعوت</Btn>
        {temp && <div className="mt-3 rounded-[10px] bg-[var(--wash)] p-3 text-[14px]"><p>{temp.mailed ? `دعوت به ${temp.email} ایمیل شد.` : 'Gmail خاموش است؛ این رمز موقت را خودت به او بده:'}</p><p className="mt-1 select-all text-center font-mono text-[18px] font-black" dir="ltr">{temp.pw}</p><p className="mt-1 text-[12px] text-[var(--pencil)]">فقط همین یک بار نشان داده می‌شود. بعد از اولین ورود باید عوضش کند.</p></div>}
        {msg && <p className="mt-3 text-[14px] font-bold text-[var(--bad)]">{msg}</p>}
      </Card>
    </div>
  </div>;
}
