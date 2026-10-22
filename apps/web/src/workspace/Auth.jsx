// Admin v3 entry: first-run setup, login (+ 2-step code), forgot password, reset from the e-mailed link.
import { useEffect, useState } from 'react';
import { api, errText } from './adminApi.js';
import { Btn, Card, fa } from '@ss/ui/ui.jsx';
import { inp } from './theme.js';

export function strength(pw) {
  const p = String(pw || ''); let sc = 0;
  if (p.length >= 8) sc++; if (p.length >= 12) sc++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) sc++; if (/\d/.test(p)) sc++; if (/[^A-Za-z0-9]/.test(p)) sc++;
  return [[0, 'خیلی ضعیف', 'var(--bad)'], [1, 'ضعیف', 'var(--bad)'], [2, 'متوسط', 'var(--amber)'], [3, 'خوب', 'var(--ok)'], [4, 'قوی', 'var(--ok)'], [5, 'خیلی قوی', 'var(--ok)']][sc];
}
export function PwField({ label = 'رمز', value, onChange, meter = false, autoFocus, onEnter, autoComplete = 'current-password' }) {
  const [show, setShow] = useState(false); const [caps, setCaps] = useState(false); const [sc, t, c] = strength(value);
  return <label className="block text-[14px] font-bold">{label}
    <div className="relative mt-1"><input type={show ? 'text' : 'password'} dir="ltr" autoComplete={autoComplete} autoFocus={autoFocus} className={inp + ' mt-0 pl-16 text-left'} value={value} onChange={e => onChange(e.target.value)} onKeyUp={e => setCaps(e.getModifierState?.('CapsLock'))} onKeyDown={e => e.key === 'Enter' && onEnter?.()} />
      <button type="button" onClick={() => setShow(x => !x)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-[8px] px-2 py-1 text-[13px] font-bold text-[var(--ink)] hover:bg-[var(--wash)]" aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'}>{show ? 'پنهان' : 'نمایش'}</button></div>
    {caps && <span className="mt-1 block text-[13px] font-bold text-[var(--amber)]">Caps Lock روشن است</span>}
    {meter && value && <span className="mt-1.5 flex items-center gap-2 text-[13px] font-normal"><span className="flex flex-1 gap-1">{[1, 2, 3, 4, 5].map(i => <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= sc ? c : 'var(--wash)' }} />)}</span><span style={{ color: c }} className="font-bold">{t}</span></span>}
  </label>;
}

function Frame({ title, sub, children, foot }) {
  return <div className="grid min-h-screen place-items-center p-4">
    <div className="flex w-full max-w-[460px]">
      <div className="relative ml-3 w-[14px] overflow-hidden rounded-full" aria-hidden><div className="rail rail-live absolute inset-x-[3px] -top-[22px] bottom-0 opacity-70" /></div>
      <div className="flex-1">
        <p className="text-[46px] font-black leading-none text-[var(--ink)]">SS<span className="mr-2 align-middle text-[15px] font-bold text-[var(--pencil)]">سایت مدیریت ۳</span></p>
        <h1 className="mb-1 mt-4 text-[30px] font-black leading-tight">{title}</h1>
        {sub && <p className="mb-5 text-[15px] text-[var(--pencil)]">{sub}</p>}
        <Card className="pop-in">{children}</Card>
        {foot && <div className="mt-4 text-center text-[14px] text-[var(--pencil)]">{foot}</div>}
      </div>
    </div>
  </div>;
}
const Err = ({ e }) => e ? <p role="alert" className="mt-3 rounded-[10px] bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] px-3 py-2 text-[14px] font-bold text-[var(--bad)]">{e}</p> : null;
const Ok = ({ m }) => m ? <p role="status" className="mt-3 rounded-[10px] bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] px-3 py-2 text-[14px] font-bold text-[var(--ok)]">{m}</p> : null;

export function Setup({ onDone }) {
  const [f, setF] = useState({ hubName: 'مرکز SS', name: '', email: '', password: '', password2: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => { setErr(''); if (f.password !== f.password2) return setErr('تکرار رمز یکی نیست.'); setBusy(true); try { await api('/api/admin/setup', { method: 'POST', body: f }); onDone(); } catch (e) { setErr(errText(e)); } setBusy(false); };
  return <Frame title="راه‌اندازی مرکز" sub="اولین اجرا: حساب مالک را بساز. بعداً مدیر و دبیر دیگر هم اضافه می‌کنی.">
    <div className="grid gap-3">
      <label className="text-[14px] font-bold">نام مرکز (مدرسه / آموزشگاه)<input className={inp} value={f.hubName} onChange={e => setF({ ...f, hubName: e.target.value })} /></label>
      <label className="text-[14px] font-bold">نام تو<input className={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <label className="text-[14px] font-bold">ایمیل (ترجیحاً Gmail)<input dir="ltr" type="email" autoComplete="username" className={inp + ' text-left'} placeholder="you@gmail.com" value={f.email} onChange={e => setF({ ...f, email: e.target.value.trim() })} /></label>
      <PwField label="رمز (حداقل ۱۰ کاراکتر، حرف و عدد)" meter autoComplete="new-password" value={f.password} onChange={v => setF({ ...f, password: v })} />
      <PwField label="تکرار رمز" autoComplete="new-password" value={f.password2} onChange={v => setF({ ...f, password2: v })} onEnter={go} />
    </div>
    <Err e={err} /><Btn className="mt-4 w-full min-h-[48px]" disabled={busy || !f.email || !f.password} onClick={go}>{busy ? 'در حال ساخت…' : 'ساخت حساب مالک و ورود'}</Btn>
  </Frame>;
}

export function Login({ st, onDone }) {
  const hash = location.hash; const resetToken = /[?&]token=([A-Za-z0-9_-]+)/.exec(hash)?.[1];
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login');
  const [f, setF] = useState({ email: localStorage.getItem('ss-admin-email') || '', password: '', code: '', remember: true, p1: '', p2: '' });
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [need2fa, setNeed2fa] = useState(false);
  useEffect(() => { setErr(''); setMsg(''); }, [mode]);
  const login = async () => { setErr(''); setBusy(true); try { await api('/api/admin/login', { method: 'POST', body: { email: f.email, password: f.password, code: need2fa ? f.code : undefined, remember: f.remember } }); localStorage.setItem('ss-admin-email', f.email); onDone(); } catch (e) { if (e.code === 'totp-required') { setNeed2fa(true); setErr(''); } else setErr(errText(e)); } setBusy(false); };
  const forgot = async () => { setErr(''); setBusy(true); try { await api('/api/admin/forgot', { method: 'POST', body: { email: f.email } }); setMsg('اگر این ایمیل در مرکز ثبت باشد، لینک ساختن رمز جدید تا چند دقیقه دیگر می‌رسد (پوشه Spam را هم ببین).'); } catch (e) { setErr(e.code === 'mail-off' ? 'Gmail مرکز هنوز تنظیم نشده؛ از مالک مرکز بخواه رمزت را عوض کند، یا روی سرور ADMIN_PASSWORD بگذار.' : errText(e)); } setBusy(false); };
  const reset = async () => { setErr(''); if (f.p1 !== f.p2) return setErr('تکرار رمز یکی نیست.'); setBusy(true); try { await api('/api/admin/reset', { method: 'POST', body: { token: resetToken, password: f.p1 } }); history.replaceState(null, '', location.pathname); setMode('login'); setMsg('رمز جدید ذخیره شد. حالا وارد شو.'); } catch (e) { setErr(errText(e)); } setBusy(false); };
  if (mode === 'reset') return <Frame title="رمز جدید" sub="رمز جدید حساب مدیریت را بساز. همه نشست‌های قبلی بسته می‌شوند.">
    <div className="grid gap-3"><PwField label="رمز جدید" meter autoFocus autoComplete="new-password" value={f.p1} onChange={v => setF({ ...f, p1: v })} /><PwField label="تکرار رمز" autoComplete="new-password" value={f.p2} onChange={v => setF({ ...f, p2: v })} onEnter={reset} /></div>
    <Err e={err} /><Btn className="mt-4 w-full min-h-[48px]" disabled={busy || !f.p1} onClick={reset}>ذخیره رمز</Btn></Frame>;
  if (mode === 'forgot') return <Frame title="فراموشی رمز" sub="ایمیل حسابت را بزن تا لینک یک‌بارمصرف ساختن رمز جدید برایت فرستاده شود." foot={<button type="button" className="font-bold text-[var(--ink)] underline" onClick={() => setMode('login')}>برگشت به ورود</button>}>
    <label className="text-[14px] font-bold">ایمیل<input dir="ltr" type="email" autoFocus className={inp + ' text-left'} value={f.email} onChange={e => setF({ ...f, email: e.target.value.trim() })} onKeyDown={e => e.key === 'Enter' && forgot()} /></label>
    <Err e={err} /><Ok m={msg} /><Btn className="mt-4 w-full min-h-[48px]" disabled={busy || !f.email} onClick={forgot}>فرستادن لینک</Btn></Frame>;
  return <Frame title="ورود مدیر" sub={st.name} foot={<>سایت دانش‌آموز: {st.appMounted ? <a className="font-bold text-[var(--ink)] underline" href="/app/">باز کردن</a> : '—'}</>}>
    <form className="grid gap-3" onSubmit={e => { e.preventDefault(); login(); }}>
      {!need2fa ? <>
        <label className="text-[14px] font-bold">ایمیل<input dir="ltr" type="text" autoComplete="username" autoFocus={!f.email} className={inp + ' text-left'} placeholder="you@gmail.com" value={f.email} onChange={e => setF({ ...f, email: e.target.value.trim() })} /></label>
        <PwField value={f.password} autoFocus={!!f.email} onChange={v => setF({ ...f, password: v })} />
        <div className="flex items-center justify-between text-[14px]"><label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={f.remember} onChange={e => setF({ ...f, remember: e.target.checked })} />مرا ۳۰ روز به خاطر بسپار</label>
          <button type="button" className="font-bold text-[var(--ink)]" onClick={() => setMode('forgot')}>رمز را فراموش کردم</button></div>
      </> : <>
        <p className="text-[15px]">کد ۶ رقمی برنامه Authenticator گوشی‌ات را بزن.</p>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" dir="ltr" aria-label="کد دومرحله‌ای" className={inp + ' text-center text-[26px] tracking-[0.5em]'} value={f.code} onChange={e => setF({ ...f, code: e.target.value.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\D/g, '').slice(0, 6) })} />
        <button type="button" className="justify-self-start text-[14px] font-bold text-[var(--pencil)]" onClick={() => { setNeed2fa(false); setF({ ...f, code: '' }); }}>← تغییر ایمیل</button>
      </>}
      {st.legacyHint && <p className="text-[13px] text-[var(--pencil)]">از نسخه ۲ آمده‌ای؟ با ایمیل <b dir="ltr">admin</b> و رمز قبلی وارد شو و بعد ایمیلت را ثبت کن.</p>}
      <Err e={err} /><Ok m={msg} />
      <Btn type="submit" className="w-full min-h-[48px]" disabled={busy || !f.email || !f.password || (need2fa && f.code.length < 6)}>{busy ? 'در حال ورود…' : 'ورود'}</Btn>
    </form>
  </Frame>;
}
