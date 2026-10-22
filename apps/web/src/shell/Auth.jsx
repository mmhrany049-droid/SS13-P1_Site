// SS 12 — single login (report §13.1), first-run setup, role chooser with mandatory MFA for sensitive roles.
import { useEffect, useState } from 'react';
import { call, errFa } from './api.js';
import { Sheet, Cover, Field, Alert, btn, ghost, inp } from './Sheet.jsx';

const fa = n => Number(n).toLocaleString('fa-IR');

export function Login({ onDone, demoAllowed, go }) {
  const [f, setF] = useState({ identity: '', password: '', code: '', remember: false });
  const [needCode, setNeedCode] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const up = k => e => setF(x => ({ ...x, [k]: k === 'remember' ? e.target.checked : e.target.value }));
  const submit = async e => {
    e.preventDefault(); if (!f.identity.trim() || !f.password) return; setBusy(true); setErr('');
    try {
      const r = await call('/api/auth/login', { method: 'POST', body: { identity: f.identity.trim(), password: f.password, remember: f.remember, ...(f.code ? { code: f.code.replace(/\s/g, '') } : {}) } });
      onDone(r.next || '/choose-role');
    } catch (x) { if (x.code === 'totp-required') { setNeedCode(true); setErr(needCode ? errFa(x) : ''); } else setErr(errFa(x)); }
    finally { setBusy(false); }
  };
  return (
    <Sheet kicker="ورود واحد" title="وارد SS شو" sub="ایمیل یا شماره موبایل و رمز. نقش‌هایت بعد از ورود نشان داده می‌شود." aside={<Cover />}>
      <form onSubmit={submit} noValidate>
        <Field label="ایمیل یا شماره موبایل" autoComplete="username" inputMode="email" dir="ltr" className={`${inp} text-left`} value={f.identity} onChange={up('identity')} autoFocus />
        <Field label="رمز عبور" type="password" autoComplete="current-password" dir="ltr" className={`${inp} text-left`} value={f.password} onChange={up('password')} />
        {needCode && <Field label="کد ورود دومرحله‌ای (۶ رقم)" inputMode="numeric" autoComplete="one-time-code" dir="ltr" className={`${inp} text-left tracking-[.4em]`} maxLength={8} value={f.code} onChange={up('code')} autoFocus hint="از برنامه احراز هویت (Google Authenticator، Aegis و…)" />}
        <label className="mt-4 flex items-center gap-2.5 text-[15px]"><input type="checkbox" className="h-5 w-5 accent-[var(--ink)]" checked={f.remember} onChange={up('remember')} />مرا روی این دستگاه به خاطر بسپار</label>
        <Alert>{err}</Alert>
        <button className={`${btn} mt-6 w-full`} disabled={busy || !f.identity.trim() || !f.password}>{busy ? 'در حال ورود…' : 'ورود'}</button>
      </form>
      <p className="mt-5 text-[14px] leading-6 text-[var(--pencil)]">رمز را فراموش کرده‌ای؟ از مسئول مرکز یا مدرسه‌ات بخواه یک رمز موقت تازه برایت بسازد.</p>
      {demoAllowed && <button type="button" onClick={() => go('/demo')} className={`${ghost} mt-2 -mr-4`}>بدون حساب: حالت دموی محلی ←</button>}
    </Sheet>
  );
}

export function Setup({ onDone }) {
  const [f, setF] = useState({ setupToken: '', name: '', email: '', password: '', orgName: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const up = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await call('/api/setup', { method: 'POST', body: { ...f, setupToken: f.setupToken.trim() } });
      await call('/api/auth/login', { method: 'POST', body: { identity: f.email.trim(), password: f.password } });
      onDone('/choose-role');
    } catch (x) { setErr(x.code === 'forbidden' ? 'کد راه‌اندازی درست نیست. همان کدی است که هنگام اجرای سرور در ترمینال چاپ شد.' : errFa(x)); }
    finally { setBusy(false); }
  };
  return (
    <Sheet kicker="راه‌اندازی اولیه · فقط یک بار" title="مالک مرکز را بساز" sub="این حساب «رئیس (مالک)» است. بقیه افراد بعداً از میز کار با نقش خودشان اضافه می‌شوند." aside={<Cover />}>
      <form onSubmit={submit}>
        <Field label="کد راه‌اندازی" dir="ltr" className={`${inp} text-left font-mono`} value={f.setupToken} onChange={up('setupToken')} hint="هنگام اولین اجرای سرور در ترمینال چاپ می‌شود (یا SS_SETUP_TOKEN در فایل ‎.env)." autoFocus />
        <Field label="نام مرکز / مدرسه" value={f.orgName} onChange={up('orgName')} placeholder="آموزشگاه …" />
        <Field label="نام شما" value={f.name} onChange={up('name')} autoComplete="name" />
        <Field label="ایمیل" type="email" dir="ltr" className={`${inp} text-left`} value={f.email} onChange={up('email')} autoComplete="username" />
        <Field label="رمز عبور" type="password" dir="ltr" className={`${inp} text-left`} value={f.password} onChange={up('password')} autoComplete="new-password" hint="حداقل ۱۰ نویسه؛ ترکیب حرف و عدد." />
        <Alert>{err}</Alert>
        <button className={`${btn} mt-6 w-full`} disabled={busy || !f.setupToken || !f.email || f.password.length < 10}>{busy ? 'در حال ساخت…' : 'ساخت حساب مالک'}</button>
      </form>
    </Sheet>
  );
}

/** Choosing a role = filling a bubble. Sensitive roles need TOTP; first time, enrol right here. */
export function ChooseRole({ session, onDone, onLogout }) {
  const roles = session.roleAssignments || [];
  const [picked, setPicked] = useState(null); const [stage, setStage] = useState('pick'); const [code, setCode] = useState(''); const [mfa, setMfa] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const activate = async (ra, c) => {
    setPicked(ra.id); setBusy(true); setErr('');
    try { const r = await call('/api/auth/role', { method: 'POST', body: { roleAssignmentId: ra.id, ...(c ? { code: c } : {}) } }); setTimeout(() => onDone(r.next), 380); }
    catch (x) {
      if (x.code === 'mfa-setup-required') { try { setMfa(await call('/api/auth/mfa/setup', { method: 'POST', body: {} })); setStage('enrol'); } catch (y) { setErr(errFa(y)); } }
      else if (x.code === 'totp-required') setStage('code');
      else { setErr(errFa(x)); setPicked(null); }
    } finally { setBusy(false); }
  };
  const ra = roles.find(r => r.id === picked);
  const enable = async e => { e.preventDefault(); setBusy(true); setErr(''); try { await call('/api/auth/mfa/enable', { method: 'POST', body: { code: code.replace(/\s/g, '') } }); setStage('pick'); setCode(''); await activate(ra); } catch (x) { setErr(errFa(x)); } finally { setBusy(false); } };
  const withCode = e => { e.preventDefault(); activate(ra, code.replace(/\s/g, '')); };
  if (stage === 'enrol' && mfa) return (
    <Sheet kicker={`ورود دومرحله‌ای · ${ra?.label || ''}`} title="یک بار، برای همیشه امن" sub="نقش‌های مدیریتی بدون کد دومرحله‌ای فعال نمی‌شوند. این کلید را در برنامه احراز هویت گوشی وارد کن.">
      <ol className="space-y-3 text-[15px] leading-7">
        <li>۱. در Google Authenticator یا Aegis «افزودن با کلید» را بزن.</li>
        <li>۲. این کلید را وارد کن (یا روی گوشی همین لینک را باز کن):</li>
      </ol>
      <p dir="ltr" className="mt-3 select-all break-all rounded-[10px] bg-[var(--paper)] p-3 text-center font-mono text-[18px] font-bold tracking-[.12em] outline outline-2 outline-[var(--rule)]">{mfa.secret.replace(/(.{4})/g, '$1 ').trim()}</p>
      <a href={mfa.url} className="mt-2 block text-center text-[14px] font-bold text-[var(--ink-deep)] underline">باز کردن در برنامه احراز هویت</a>
      <form onSubmit={enable}>
        <Field label="۳. کد ۶ رقمی که برنامه نشان می‌دهد" inputMode="numeric" autoComplete="one-time-code" dir="ltr" className={`${inp} text-center tracking-[.5em]`} maxLength={8} value={code} onChange={e => setCode(e.target.value)} autoFocus />
        <Alert>{err}</Alert>
        <button className={`${btn} mt-5 w-full`} disabled={busy || code.replace(/\s/g, '').length < 6}>{busy ? '…' : 'فعال‌سازی و ورود'}</button>
      </form>
      <button type="button" className={`${ghost} mt-3 w-full`} onClick={() => { setStage('pick'); setPicked(null); setErr(''); }}>برگشت به نقش‌ها</button>
    </Sheet>
  );
  if (stage === 'code') return (
    <Sheet kicker={ra?.label || 'نقش'} title="کد دومرحله‌ای" sub="برای فعال کردن این نقش، کد فعلی برنامه احراز هویت را بزن.">
      <form onSubmit={withCode}>
        <Field label="کد ۶ رقمی" inputMode="numeric" autoComplete="one-time-code" dir="ltr" className={`${inp} text-center tracking-[.5em]`} maxLength={8} value={code} onChange={e => setCode(e.target.value)} autoFocus />
        <Alert>{err}</Alert>
        <button className={`${btn} mt-5 w-full`} disabled={busy || code.replace(/\s/g, '').length < 6}>ورود با این نقش</button>
      </form>
      <button type="button" className={`${ghost} mt-3 w-full`} onClick={() => { setStage('pick'); setPicked(null); setErr(''); setCode(''); }}>برگشت</button>
    </Sheet>
  );
  return (
    <Sheet kicker={`سلام ${session.user?.name || ''}`} title={roles.length ? 'با کدام نقش ادامه می‌دهی؟' : 'هنوز نقشی نداری'} sub={roles.length ? 'هر نقش فقط داده‌های محدوده خودش را می‌بیند.' : 'از مسئول مرکز یا مدرسه بخواه برای حسابت نقش ثبت کند.'}>
      <ul className="space-y-2.5" aria-label="نقش‌ها">
        {roles.map(r => (
          <li key={r.id}>
            <button type="button" disabled={busy} onClick={() => activate(r)} aria-pressed={picked === r.id}
              className="group flex w-full items-center gap-4 rounded-[12px] border-2 border-[var(--rule)] bg-[var(--paper)] px-4 py-3.5 text-right transition hover:border-[var(--ink)] disabled:opacity-70">
              <span className={`grid h-[24px] w-[38px] shrink-0 place-items-center rounded-full border-2 ${r.surface === 'workspace' ? 'border-[var(--pen)]' : 'border-[var(--ink)]'}`} aria-hidden>
                {picked === r.id && <span className={`bubble-ink h-full w-full rounded-full ${r.surface === 'workspace' ? 'bg-[var(--pen)]' : 'bg-[var(--ink)]'}`} />}
              </span>
              <span className="min-w-0 flex-1"><span className="block text-[17px] font-black">{r.label}</span>
                <span className="block truncate text-[14px] text-[var(--pencil)]">{r.organizationName || 'شخصی'}{r.sensitive ? ' · نیاز به کد دومرحله‌ای' : ''}</span></span>
              <span className={`text-[14px] font-bold ${r.surface === 'workspace' ? 'text-[var(--pen)]' : 'text-[var(--ink)]'}`}>{r.surface === 'workspace' ? 'میز کار' : 'امروز'} ←</span>
            </button>
          </li>))}
      </ul>
      <Alert>{err}</Alert>
      <button type="button" onClick={onLogout} className={`${ghost} mt-5 -mr-4`}>خروج از حساب</button>
    </Sheet>
  );
}
export { fa };
