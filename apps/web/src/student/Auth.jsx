// v8 — «ورود»: one design with the rest of SS (paper, crimson ink, timing-mark rail, bubbles).
// Account chooser → password/PIN with lockout → forgot (recovery code, or email code through the hub) → new account.
import { useEffect, useId, useState } from 'react';
import { users, switchUser, addUser, markUnlocked, currentUserId, setUserMeta } from '@ss/domain/profiles.js';
import { checkSecret, secretOf, secretKind, lockoutMs, hashSecret, validPassword, validPin, strength, normRecovery, newRecoveryCode } from './account.js';
import { initialState, save, loadReal } from '@ss/domain/store.js';
import { client } from './sync/client.js';
import * as E from '@ss/domain/engine.js';
import { Btn, Card, fa } from '@ss/ui/ui.jsx';

export const inpA = 'mt-1 w-full rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-3 text-[16px] font-normal transition focus:border-[var(--ink)] focus:outline-none';

/** The shared frame for login, sign-up and onboarding. `steps` = [[key,label]], `at` = current index. */
export function AuthLayout({ steps, at = 0, title, kicker, children }) {
  return (
    <div className="grid min-h-screen md:grid-cols-[minmax(300px,400px)_1fr]">
      <aside className="relative hidden overflow-hidden bg-[var(--ink)] text-[var(--paper)] md:block">
        <div className="absolute inset-y-0 left-0 w-[18px] overflow-hidden opacity-60" aria-hidden><div className="rail rail-live absolute inset-x-[4px] -top-[22px] bottom-0" style={{ background: 'repeating-linear-gradient(to bottom,var(--paper) 0 5px,transparent 5px 22px)' }} /></div>
        <div className="flex h-full flex-col px-10 py-12">
          <p className="text-[64px] font-black leading-none tracking-[-0.04em]">SS</p>
          <p className="mt-2 text-[16px] font-bold opacity-85">سیستم مطالعه · نسخه ۸</p>
          <p className="mt-10 text-[30px] font-black leading-[1.3]">پاسخ‌برگ تو،<br />هر روز یک خانه پرتر.</p>
          {steps && <ol className="mt-12 grid gap-4" aria-label="مراحل">{steps.map(([k, t], i) => (
            <li key={k} className={`flex items-center gap-3 text-[16px] font-bold ${i === at ? '' : 'opacity-60'}`}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-[var(--paper)] text-[13px] ${i < at ? 'bg-[var(--paper)] text-[var(--ink)]' : i === at ? 'bg-white/20' : ''}`}>{i < at ? '✓' : fa(i + 1)}</span>{t}</li>))}</ol>}
          <p className="mt-auto text-[14px] leading-7 opacity-75">داده‌هایت روی همین دستگاه می‌ماند. فقط اگر خودت به مرکز وصل شوی، چیزی با رضایتت فرستاده می‌شود.</p>
        </div>
      </aside>
      <main className="flex min-w-0 flex-col px-4 py-8 sm:px-10 md:py-14">
        <div className="mb-6 flex items-end justify-between md:hidden"><p className="text-[40px] font-black leading-none text-[var(--ink)]">SS</p>{steps && <p className="text-[14px] font-bold text-[var(--pencil)]">مرحله {fa(at + 1)} از {fa(steps.length)}</p>}</div>
        {steps && <div className="mb-6 h-[6px] overflow-hidden rounded-full bg-[var(--wash)] md:hidden"><div className="h-full bg-[var(--ink)] transition-[width]" style={{ width: `${((at + 1) / steps.length) * 100}%` }} /></div>}
        <div className="page-in mx-auto w-full max-w-[720px]">
          {(kicker || title) && <header className="mb-6">{kicker && <p className="mb-1 text-[14px] font-bold text-[var(--ink)]">{kicker}</p>}{title && <h1 className="text-[34px] font-black leading-[1.15] tracking-[-0.02em] sm:text-[42px]">{title}</h1>}</header>}
          {children}
        </div>
      </main>
    </div>
  );
}

export function SecretInput({ value, onChange, kind = 'password', label, autoFocus, onEnter, id }) {
  const [show, setShow] = useState(false); const auto = useId(); const iid = id || auto;
  return (
    <div className="block">
      <label className="block text-[15px] font-bold" htmlFor={iid}>{label}</label>
      <span className="relative block">
        <input id={iid} autoFocus={autoFocus} type={show ? 'text' : 'password'} inputMode={kind === 'pin' ? 'numeric' : undefined} autoComplete={kind === 'pin' ? 'off' : 'current-password'}
          className={inpA + (kind === 'pin' ? ' text-center text-[24px] tracking-[0.5em]' : ' pl-16')} value={value}
          onChange={e => onChange(kind === 'pin' ? E.normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 6) : e.target.value)} onKeyDown={e => e.key === 'Enter' && onEnter?.()} />
        {kind !== 'pin' && <button type="button" aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'} onClick={() => setShow(x => !x)} className="absolute left-2 top-1/2 mt-[2px] -translate-y-1/2 rounded-[8px] px-2 py-1 text-[13px] font-bold text-[var(--ink)] hover:bg-[var(--wash)]">{show ? 'پنهان' : 'نمایش'}</button>}
      </span>
    </div>
  );
}
export function StrengthBar({ pw }) {
  const st = strength(pw); const c = ['var(--bad)', 'var(--bad)', 'var(--amber)', 'var(--ok)', 'var(--ok)'][st.score];
  if (!pw) return null;
  return <div className="mt-2" aria-live="polite"><div className="flex gap-1">{[0, 1, 2, 3].map(i => <span key={i} className="h-[6px] flex-1 rounded-full" style={{ background: i < st.score ? c : 'var(--wash)' }} />)}</div><p className="mt-1 text-[13px]" style={{ color: c }}>{st.label}{st.tips.length ? ` · ${st.tips.join('، ')}` : ''}</p></div>;
}
/** Choose none / PIN / password. Returns via onChange({kind, a, b, ok}). */
export function SecretPicker({ value, onChange, allowNone = true }) {
  const v = value || { kind: allowNone ? 'none' : 'password', a: '', b: '' };
  const up = p => { const n = { ...v, ...p }; n.ok = n.kind === 'none' || ((n.kind === 'pin' ? validPin(n.a) : validPassword(n.a)) && n.a === n.b); onChange(n); };
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="نوع رمز">{[...(allowNone ? [['none', 'بدون رمز']] : []), ['pin', 'رمز عددی ۴ تا ۶ رقم'], ['password', 'گذرواژه (پیشنهادی)']].map(([k, t]) => (
        <button key={k} type="button" role="radio" aria-checked={v.kind === k} onClick={() => up({ kind: k, a: '', b: '' })} className={`min-h-[40px] rounded-full border-2 px-4 text-[14px] font-bold ${v.kind === k ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--rule)] bg-[var(--card)] hover:border-[var(--ink)]'}`}>{t}</button>))}</div>
      {v.kind !== 'none' && <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><SecretInput kind={v.kind} label={v.kind === 'pin' ? 'رمز عددی' : 'گذرواژه'} value={v.a} onChange={a => up({ a })} />{v.kind === 'password' && <StrengthBar pw={v.a} />}</div>
        <div><SecretInput kind={v.kind} label="تکرار" value={v.b} onChange={b => up({ b })} />{v.b && v.a !== v.b && <p className="mt-1 text-[13px] font-bold text-[var(--bad)]">تکرار یکی نیست.</p>}</div>
      </div>}
    </div>
  );
}
/** Stores the secret in the device registry; returns the one-time recovery code (or null). */
export async function applySecret(id, pick) {
  if (!pick || pick.kind === 'none') { setUserMeta(id, { secret: null, pinHash: null, recoveryHash: null, failed: 0, lockedUntil: 0 }); return null; }
  const code = newRecoveryCode();
  setUserMeta(id, { secret: { kind: pick.kind, hash: await hashSecret(pick.a), at: new Date().toISOString() }, pinHash: null, recoveryHash: await hashSecret(normRecovery(code)), failed: 0, lockedUntil: 0 });
  return code;
}
export function RecoveryCard({ code, name }) {
  const [copied, setCopied] = useState(false);
  const dl = () => { const blob = new Blob([`SS · کد بازیابی رمز\nحساب: ${name}\n\n${code}\n\nاین کد را جایی امن نگه دار. با آن می‌توانی رمز را عوض کنی.`], { type: 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'SS-recovery-code.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  return <div className="rounded-[14px] border-2 border-dashed border-[var(--ink)] bg-[var(--wash)] p-4">
    <p className="text-[16px] font-black">کد بازیابی رمز</p>
    <p className="mt-1 text-[14px] text-[var(--pencil)]">فقط همین یک بار نشان داده می‌شود. اگر رمز را فراموش کنی، با این کد رمز جدید می‌گذاری.</p>
    <p dir="ltr" className="mt-3 select-all text-center font-mono text-[24px] font-black tracking-[0.12em] text-[var(--ink-deep)]">{code}</p>
    <div className="mt-3 flex flex-wrap justify-center gap-2"><Btn kind="soft" onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); }}>{copied ? 'کپی شد ✓' : 'کپی'}</Btn><Btn kind="line" onClick={dl}>دانلود فایل</Btn></div>
  </div>;
}

function useCountdown(until) { const [now, setNow] = useState(Date.now()); useEffect(() => { if (until <= now) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [until]); return Math.max(0, Math.ceil((until - now) / 1000)); }

/** Login: account list → secret → (forgot). `chooser` = opened from «تعویض کاربر». */
export default function Login({ current, chooser, onDone }) {
  const [list, setList] = useState(users());
  const [sel, setSel] = useState(chooser ? null : current);
  const [mode, setMode] = useState('login'); // login | forgot | new
  const [secret, setSecret] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const u = list.find(x => x.id === sel); const hash = secretOf(u); const kind = secretKind(u);
  const wait = useCountdown(u?.lockedUntil || 0);
  const refresh = () => setList(users());
  const enter = id => { const x = list.find(y => y.id === id); setErr(''); setSecret(''); setMode('login'); if (secretOf(x)) { setSel(id); return; } switchUser(id); markUnlocked(id); onDone(id); };
  const unlock = async () => {
    if (wait || busy || !secret) return; setBusy(true); const ok = await checkSecret(secret, hash); setBusy(false);
    if (!ok) { const failed = (u.failed || 0) + 1; const ms = lockoutMs(failed); setUserMeta(u.id, { failed, lockedUntil: ms ? Date.now() + ms : 0 }); refresh(); setSecret(''); return setErr(ms ? `رمز اشتباه بود. برای امنیت ${fa(Math.round(ms / 1000))} ثانیه صبر کن.` : `رمز درست نیست (${fa(5 - failed)} تلاش دیگر تا قفل موقت).`); }
    setUserMeta(u.id, { failed: 0, lockedUntil: 0, lastLoginAt: new Date().toISOString() }); switchUser(u.id); markUnlocked(u.id); onDone(u.id);
  };
  const create = name => { const nu = addUser(name.trim() || 'کاربر جدید'); switchUser(nu.id); const st = initialState(); save({ ...st, me: { ...st.me, name: nu.name } }); markUnlocked(nu.id); onDone(nu.id); };

  if (mode === 'new') return <AuthLayout kicker="ثبت‌نام" title="حساب جدید روی این دستگاه"><NewAccount onCreate={create} onBack={() => setMode('login')} /></AuthLayout>;
  if (mode === 'forgot' && u) return <AuthLayout kicker={u.name} title="بازیابی رمز"><Forgot u={u} onBack={() => { refresh(); setMode('login'); }} onDone={() => { refresh(); switchUser(u.id); markUnlocked(u.id); onDone(u.id); }} /></AuthLayout>;
  return (
    <AuthLayout kicker="ورود" title={u && hash ? `سلام ${u.name}` : 'کدام حساب؟'}>
      {u && hash ? <Card className="p-6">
        <SecretInput id="login-secret" autoFocus kind={kind} label={kind === 'pin' ? 'رمز عددی' : 'گذرواژه'} value={secret} onChange={v => { setSecret(v); setErr(''); }} onEnter={unlock} />
        {wait > 0 && <p role="alert" className="mt-3 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px] font-bold text-[var(--bad)]">قفل موقت: {fa(wait)} ثانیه دیگر دوباره امتحان کن.</p>}
        {err && !wait && <p role="alert" className="mt-3 text-[14px] font-bold text-[var(--bad)]">{err}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-2"><Btn className="min-h-[50px] flex-1 text-[16px]" disabled={!secret || busy || wait > 0} onClick={unlock}>{busy ? 'در حال بررسی…' : 'ورود'}</Btn>{list.length > 1 && <Btn kind="ghost" onClick={() => { setSel(null); setSecret(''); setErr(''); }}>حساب دیگر</Btn>}</div>
        <button type="button" className="mt-4 text-[14px] font-bold text-[var(--ink)] underline" onClick={() => setMode('forgot')}>رمز را فراموش کردم</button>
      </Card> : <>
        <ul className="grid gap-3">{list.map(x => <li key={x.id}><button type="button" onClick={() => enter(x.id)} className="flex w-full items-center gap-4 rounded-[14px] bg-[var(--card)] p-4 text-right shadow-[0_1px_0_var(--rule),0_8px_24px_-18px_rgba(60,20,35,.35)] transition hover:-translate-y-0.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[20px] font-black text-[var(--paper)]">{(x.name || 'ک').slice(0, 1)}</span>
          <span className="min-w-0 flex-1"><b className="block truncate text-[17px]">{x.name}</b><span className="block text-[13px] text-[var(--pencil)]">{x.phone ? fa('0' + x.phone.slice(2)) : 'بدون شماره'}{x.lastLoginAt ? ' · آخرین ورود ' + new Intl.DateTimeFormat('fa-IR', { month: 'long', day: 'numeric' }).format(new Date(x.lastLoginAt)) : ''}</span></span>
          <span className="text-[13px] font-bold text-[var(--pencil)]">{secretOf(x) ? '🔒 رمز دارد' : 'بدون رمز'}</span><span className="text-[22px] text-[var(--ink)]">←</span></button></li>)}</ul>
        <Btn kind="line" className="mt-5 min-h-[50px] w-full text-[16px]" onClick={() => setMode('new')}>+ ثبت‌نام حساب جدید</Btn>
      </>}
    </AuthLayout>
  );
}

function NewAccount({ onCreate, onBack }) {
  const [name, setName] = useState('');
  return <Card className="p-6"><label className="block text-[15px] font-bold">نام و نام خانوادگی<input autoFocus className={inpA} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && name.trim().length > 1 && onCreate(name)} /></label>
    <p className="mt-2 text-[14px] text-[var(--pencil)]">بعد از این: شماره، ایمیل، رمز، پرسشنامه کوتاه و روزهای تو. داده هر حساب کاملاً جداست.</p>
    <div className="mt-5 flex gap-2"><Btn className="min-h-[50px] flex-1" disabled={name.trim().length < 2} onClick={() => onCreate(name)}>ادامه ثبت‌نام</Btn><Btn kind="ghost" onClick={onBack}>برگشت</Btn></div></Card>;
}

/** Two ways back in: the offline recovery code, or a 6-digit code emailed by the hub (if this profile is connected & has an email). */
function Forgot({ u, onBack, onDone }) {
  const st = (() => { const cur = currentUserId(); try { switchUser(u.id); return loadReal(); } finally { switchUser(cur); } })();
  const srv = st.account?.server; const email = st.account?.email;
  const [way, setWay] = useState('code'); const [code, setCode] = useState(''); const [ok, setOk] = useState(false); const [pick, setPick] = useState(null);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [newCode, setNewCode] = useState(null);
  const verifyRecovery = async () => { setErr(''); if (!u.recoveryHash) return setErr('برای این حساب کد بازیابی ساخته نشده.'); setBusy(true); const good = await checkSecret(normRecovery(code), u.recoveryHash); setBusy(false); if (!good) return setErr('کد بازیابی درست نیست.'); setOk(true); };
  const sendMail = async () => { setErr(''); setMsg(''); setBusy(true); try { const r = await client(srv.url, srv).emailCode('reset'); setMsg(`کد ۶ رقمی به ${r?.to || 'ایمیلت'} فرستاده شد (۱۵ دقیقه اعتبار).`); } catch (x) { setErr(x.code === 'mail-off' ? 'ایمیل مرکز راه‌اندازی نشده.' : x.code === 'no-email' ? 'ایمیلی در مرکز ثبت نشده.' : 'ارسال نشد: ' + (x.message || '')); } setBusy(false); };
  const verifyMail = async () => { setErr(''); setBusy(true); try { await client(srv.url, srv).emailVerify(E.normalizeDigits(code)); setOk(true); } catch { setErr('کد درست نیست یا منقضی شده.'); } setBusy(false); };
  const finish = async () => { if (!pick?.ok) return; setBusy(true); const c = await applySecret(u.id, pick); setBusy(false); if (c) setNewCode(c); else onDone(); };
  if (newCode) return <Card className="p-6"><p className="mb-4 text-[18px] font-black">رمز جدید ذخیره شد ✓</p><RecoveryCard code={newCode} name={u.name} /><Btn className="mt-5 w-full min-h-[50px]" onClick={onDone}>کد را نگه داشتم، ورود</Btn></Card>;
  return <Card className="p-6">
    {!ok ? <>
      <div className="mb-4 flex flex-wrap gap-2">{[['code', 'با کد بازیابی'], ...(srv && email ? [['mail', 'با کد ایمیل']] : [])].map(([k, t]) => <button key={k} type="button" onClick={() => { setWay(k); setCode(''); setErr(''); }} className={`min-h-[40px] rounded-full border-2 px-4 text-[14px] font-bold ${way === k ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--rule)]'}`}>{t}</button>)}</div>
      {way === 'code' ? <><label className="block text-[15px] font-bold">کد بازیابی<input dir="ltr" autoFocus className={inpA + ' text-center font-mono tracking-[0.15em]'} placeholder="XXXX-XXXX-XXXX-XXXX" value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && verifyRecovery()} /></label>
        <Btn className="mt-4 w-full min-h-[48px]" disabled={busy || normRecovery(code).length < 16} onClick={verifyRecovery}>بررسی کد</Btn>
        {!srv || !email ? <p className="mt-3 text-[13px] text-[var(--pencil)]">برای بازیابی با ایمیل، حساب باید به مرکز وصل باشد و ایمیل ثبت کرده باشی.</p> : null}</>
      : <><p className="mb-3 text-[15px]">کد به ایمیل ثبت‌شده در مرکز ({email}) فرستاده می‌شود.</p><Btn kind="soft" disabled={busy} onClick={sendMail}>ارسال کد به ایمیلم</Btn>
        <label className="mt-4 block text-[15px] font-bold">کد ۶ رقمی<input inputMode="numeric" className={inpA + ' text-center text-[22px] tracking-[0.4em]'} value={fa(code)} onChange={e => setCode(E.normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 6))} /></label>
        <Btn className="mt-4 w-full min-h-[48px]" disabled={busy || code.length !== 6} onClick={verifyMail}>تأیید کد</Btn></>}
    </> : <><p className="mb-3 text-[17px] font-black">رمز جدید بگذار</p><SecretPicker value={pick} onChange={setPick} /><Btn className="mt-5 w-full min-h-[50px]" disabled={!pick?.ok || busy} onClick={finish}>ذخیره رمز جدید</Btn></>}
    {msg && <p role="status" className="mt-3 text-[14px] font-bold text-[var(--ok)]">{msg}</p>}
    {err && <p role="alert" className="mt-3 text-[14px] font-bold text-[var(--bad)]">{err}</p>}
    <button type="button" className="mt-4 text-[14px] font-bold text-[var(--pencil)] underline" onClick={onBack}>برگشت به ورود</button>
  </Card>;
}
