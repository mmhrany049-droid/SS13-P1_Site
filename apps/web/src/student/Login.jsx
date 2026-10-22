import { useState } from 'react';
import { users, switchUser, addUser, markUnlocked, currentUserId } from '@ss/domain/profiles.js';
import { checkPin } from './account.js';
import { initialState, save } from '@ss/domain/store.js';
import * as E from '@ss/domain/engine.js';
import { Btn, Card, fa } from '@ss/ui/ui.jsx';

/** «ورود»: choose the account on this device, unlock with PIN, or create a new account (→ signup). */
export default function Login({ current, chooser, onDone }) {
  const list = users();
  const [sel, setSel] = useState(chooser ? null : current);
  const [pin, setPin] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false); const [name, setName] = useState('');
  const u = list.find(x => x.id === sel);
  const enter = async id => {
    const x = list.find(y => y.id === id); setErr('');
    if (x?.pinHash) { setSel(id); return; }
    switchUser(id); markUnlocked(id); onDone(id);
  };
  const unlock = async () => { setBusy(true); const ok = await checkPin(pin, u.pinHash); setBusy(false); if (!ok) { setErr('رمز درست نیست.'); setPin(''); return; } switchUser(u.id); markUnlocked(u.id); onDone(u.id); };
  const create = () => { const nu = addUser(name.trim() || 'کاربر جدید'); switchUser(nu.id); const st = initialState(); save({ ...st, me: { ...st.me, name: nu.name } }); markUnlocked(nu.id); onDone(nu.id); };
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-[460px]">
        <p className="mb-1 text-center text-[44px] font-black leading-none text-[var(--ink)]">SS</p>
        <p className="mb-6 text-center text-[15px] font-bold text-[var(--pencil)]">سیستم مطالعه · ورود</p>
        <Card>
          {u?.pinHash && !creating ? <>
            <p className="text-[18px] font-black">{u.name}</p>
            <p className="mb-3 text-[14px] text-[var(--pencil)]">رمز ۴ تا ۶ رقمی این حساب را بزن.</p>
            <input autoFocus type="password" inputMode="numeric" aria-label="رمز" className="w-full rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-3 text-center text-[24px] tracking-[0.5em]" value={pin} onChange={e => setPin(E.normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 6))} onKeyDown={e => e.key === 'Enter' && pin.length >= 4 && unlock()} />
            {err && <p role="alert" className="mt-2 text-[14px] font-bold text-[var(--bad)]">{err}</p>}
            <div className="mt-4 flex gap-2"><Btn className="flex-1" disabled={pin.length < 4 || busy} onClick={unlock}>ورود</Btn>{list.length > 1 && <Btn kind="ghost" onClick={() => { setSel(null); setPin(''); }}>حساب دیگر</Btn>}</div>
          </> : creating ? <>
            <p className="mb-3 text-[18px] font-black">حساب جدید روی این دستگاه</p>
            <input autoFocus aria-label="نام" placeholder="نام و نام خانوادگی" className="w-full rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-3 text-[16px]" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && name.trim() && create()} />
            <p className="mt-2 text-[13px] text-[var(--pencil)]">بعد از این، ثبت‌نام (شماره موبایل، پایه و رشته) و پرسشنامه کوتاه می‌آید. داده هر حساب جداست.</p>
            <div className="mt-4 flex gap-2"><Btn className="flex-1" disabled={!name.trim()} onClick={create}>ادامه ثبت‌نام</Btn><Btn kind="ghost" onClick={() => setCreating(false)}>برگشت</Btn></div>
          </> : <>
            <p className="mb-3 text-[18px] font-black">کدام حساب؟</p>
            <ul className="grid gap-2">{list.map(x => <li key={x.id}><button type="button" onClick={() => enter(x.id)} className={`flex w-full items-center justify-between rounded-[12px] px-4 py-3 text-right ${x.id === currentUserId() ? 'bg-[var(--wash)]' : 'hover:bg-[var(--wash)]'}`}><span><b className="text-[16px]">{x.name}</b>{x.phone && <span className="block text-[13px] text-[var(--pencil)]">{fa('0' + x.phone.slice(2))}</span>}</span><span className="text-[var(--pencil)]">{x.pinHash ? '🔒' : '←'}</span></button></li>)}</ul>
            <Btn kind="line" className="mt-4 w-full" onClick={() => setCreating(true)}>+ ثبت‌نام حساب جدید</Btn>
          </>}
        </Card>
        <p className="mt-4 text-center text-[13px] text-[var(--pencil)]">همه داده‌ها روی همین دستگاه می‌ماند؛ فقط اگر به مرکز وصل شوی، بسته‌ات با رضایت خودت فرستاده می‌شود.</p>
      </div>
    </div>
  );
}
