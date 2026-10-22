// v8 — «حساب کاربری»: profile info, email (Gmail), password/PIN with current-secret check, recovery code, auto-lock,
// email report through the hub (or a Gmail draft), other accounts on this device.
import { useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { normalizePhone, phoneLabel, validEmail, checkSecret, secretOf, secretKind, hashSecret, newRecoveryCode, normRecovery } from './account.js';
import { users, currentUserId, setUserMeta, renameUser, removeUser } from '@ss/domain/profiles.js';
import { SecretPicker, SecretInput, applySecret, RecoveryCard } from './Auth.jsx';
import { hubClient, hubError, gmailCompose } from './sync/client.js';
import { buildSummary } from './summary.js';
import { Btn, Card, fa } from '@ss/ui/ui.jsx';

const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px] font-normal';
const LOCKS = [[0, 'خاموش'], [5, '۵ دقیقه'], [15, '۱۵ دقیقه'], [30, '۳۰ دقیقه'], [60, '۱ ساعت']];

export function reportText(s) {
  let sm = null; try { sm = buildSummary(s); } catch { /* */ }
  const L = [`گزارش SS · ${s.me?.name || ''}`, ''];
  if (sm) {
    L.push(`۷ روز اخیر: ${fa(sm.last7.tests)} تست${sm.last7.percent != null ? `، درصد ${fa(sm.last7.percent)}` : ''}`, `مرور آماده: ${fa(sm.reviewsDue)} · تست ستاره‌دار: ${fa(sm.starred)}`, `سطح ${fa(sm.rewards.level)} · ${fa(sm.rewards.coins)} سکه`, '');
    if (sm.today.items.length) L.push('برنامه امروز:', ...sm.today.items.map(i => `• ${i.title} (${fa(i.minutes)} دقیقه)${i.done ? ' ✓' : ''}`), '');
    if (sm.exams.length) L.push('آزمون‌های پیش‌رو:', ...sm.exams.map(e => `• ${e.title}: ${fa(e.daysLeft)} روز مانده${e.P50 != null ? `، پیش‌بینی حدود ${fa(e.P50)}٪` : ''}`));
  }
  return L.join('\n');
}

export function AccountCard({ s, set, onLock }) {
  const id = currentUserId(); const [, bump] = useState(0); const u = users().find(x => x.id === id) || {};
  const has = !!secretOf(u); const kind = secretKind(u);
  const [name, setName] = useState(s.me?.name || ''); const [phone, setPhone] = useState(s.account?.phone ? '0' + s.account.phone.slice(2) : ''); const [email, setEmail] = useState(s.account?.email || '');
  const [cur, setCur] = useState(''); const [pick, setPick] = useState(null); const [code, setCode] = useState(null);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const ok = t => { setErr(''); setMsg(t); }; const bad = t => { setMsg(''); setErr(t); };
  const saveInfo = async () => {
    const p = normalizePhone(phone); if (name.trim().length < 2) return bad('نام را کامل بنویس.'); if (!p) return bad('شماره موبایل معتبر نیست.'); if (email.trim() && !validEmail(email)) return bad('ایمیل معتبر نیست.');
    const em = email.trim().toLowerCase(); set(x => ({ ...x, me: { ...x.me, name: name.trim() }, account: { ...x.account, phone: p, email: em } })); renameUser(id, name.trim()); setUserMeta(id, { phone: p, email: em });
    const c = hubClient(s); if (c) { try { await c.updateProfile({ name: name.trim(), phone: p, email: em }); return ok('ذخیره شد و در مرکز هم به‌روز شد.'); } catch (x) { return ok('ذخیره شد؛ به‌روزرسانی مرکز: ' + hubError(x)); } }
    ok('ذخیره شد.');
  };
  const saveSecret = async () => {
    if (has && !(await checkSecret(cur, secretOf(u)))) return bad('رمز فعلی درست نیست.');
    if (pick?.kind !== 'none' && !pick?.ok) return bad('رمز جدید و تکرارش را درست وارد کن.');
    setBusy(true); const c = await applySecret(id, pick); setBusy(false); set(x => ({ ...x, account: { ...x.account, hasSecret: !!c, pinHash: false } }));
    setCur(''); setPick(null); setCode(c); bump(n => n + 1); ok(c ? 'رمز ذخیره شد. کد بازیابی جدید را نگه دار.' : 'رمز برداشته شد.');
  };
  const regen = async () => { if (!(await checkSecret(cur, secretOf(u)))) return bad('برای ساخت کد جدید، رمز فعلی را بزن.'); const c = newRecoveryCode(); setUserMeta(id, { recoveryHash: await hashSecret(normRecovery(c)) }); setCode(c); setCur(''); ok('کد بازیابی قبلی باطل شد.'); };
  const sendReport = async () => {
    const c = hubClient(s); setBusy(true);
    try { if (!c) throw Object.assign(new Error(''), { code: 'no-hub' }); await c.emailReport(); ok(`گزارش به ${s.account?.email} فرستاده شد.`); }
    catch (x) { if (x.code === 'no-hub' || x.code === 'mail-off') { window.open(gmailCompose({ to: s.account?.email || '', subject: `گزارش SS · ${s.me?.name || ''}`, body: reportText(s) }), '_blank', 'noopener'); ok('پیش‌نویس در جیمیل خودت باز شد؛ «ارسال» را بزن.'); } else bad(hubError(x)); }
    setBusy(false);
  };
  const others = users().filter(x => x.id !== id);
  return (
    <Card className="lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-[18px] font-black">حساب کاربری</p><p className="text-[13px] text-[var(--pencil)]">{u.lastLoginAt ? `آخرین ورود: ${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(u.lastLoginAt))}` : ''}</p></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="grid content-start gap-2">
          <p className="text-[15px] font-black">مشخصات</p>
          <label className="text-[14px] font-bold">نام<input className={inp} value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="text-[14px] font-bold">شماره موبایل (ربات تلگرام)<input dir="ltr" className={inp + ' text-left'} value={fa(phone)} onChange={e => setPhone(E.normalizeDigits(e.target.value))} /></label>
          <label className="text-[14px] font-bold">ایمیل (جیمیل)<input dir="ltr" type="email" className={inp + ' text-left'} placeholder="name@gmail.com" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <p className="text-[12px] text-[var(--pencil)]">فعلی: {s.account?.phone ? phoneLabel(s.account.phone) : '—'}{s.account?.email ? ` · ${s.account.email}` : ''}</p>
          <Btn kind="soft" onClick={saveInfo}>ذخیره مشخصات</Btn>
          <Btn kind="line" disabled={busy || !s.account?.email} onClick={sendReport}>✉ ارسال گزارش به جیمیلم</Btn>
          {!s.account?.email && <p className="text-[12px] text-[var(--pencil)]">برای گزارش ایمیلی، اول ایمیل را ذخیره کن.</p>}
        </section>
        <section className="grid content-start gap-2">
          <p className="text-[15px] font-black">رمز و امنیت {has ? <span className="text-[13px] text-[var(--ok)]">· فعال ({kind === 'pin' ? 'عددی' : 'گذرواژه'}) 🔒</span> : <span className="text-[13px] text-[var(--bad)]">· بدون رمز</span>}</p>
          {has && <SecretInput kind={kind} label="رمز فعلی" value={cur} onChange={setCur} />}
          <SecretPicker value={pick} onChange={setPick} allowNone={has} />
          <div className="flex flex-wrap gap-2"><Btn kind="soft" disabled={busy || !pick || (has && !cur)} onClick={saveSecret}>{pick?.kind === 'none' ? 'برداشتن رمز' : 'ذخیره رمز'}</Btn>{has && <Btn kind="ghost" disabled={!cur} onClick={regen}>کد بازیابی جدید</Btn>}</div>
          <label className="mt-2 text-[14px] font-bold">قفل خودکار بعد از بی‌کاری<select className={inp} value={u.autoLockMin ?? (has ? 15 : 0)} disabled={!has} onChange={e => { setUserMeta(id, { autoLockMin: +e.target.value }); bump(n => n + 1); }}>{LOCKS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
          {has && <Btn kind="ghost" onClick={onLock}>قفل کن / خروج 🔒</Btn>}
          {code && <RecoveryCard code={code} name={s.me?.name} />}
        </section>
        <section className="grid content-start gap-2">
          <p className="text-[15px] font-black">حساب‌های دیگر این دستگاه</p>
          {!others.length ? <p className="text-[13px] text-[var(--pencil)]">فقط همین حساب. از منوی بالا «تعویض کاربر» ← «ثبت‌نام حساب جدید».</p> :
            <ul className="grid gap-1.5">{others.map(o => <li key={o.id} className="flex items-center justify-between rounded-[8px] bg-[var(--wash)] px-3 py-1.5 text-[14px]"><span>{o.name}{secretOf(o) ? ' 🔒' : ''}</span><button type="button" className="text-[13px] font-bold text-[var(--bad)]" onClick={() => { if (confirm(`همه داده‌های «${o.name}» از این دستگاه پاک شود؟ قابل برگشت نیست.`)) { removeUser(o.id); bump(n => n + 1); } }}>حذف</button></li>)}</ul>}
          <p className="mt-2 text-[12px] leading-5 text-[var(--pencil)]">رمز، حساب را روی همین دستگاه قفل می‌کند. داده‌ها در مرورگر ذخیره است؛ برای امنیت کامل از دستگاه شخصی استفاده کن و پشتیبان بگیر.</p>
        </section>
      </div>
      {err && <p role="alert" className="mt-4 text-[14px] font-bold text-[var(--bad)]">{err}</p>}
      {msg && <p role="status" className="mt-4 text-[14px] font-bold text-[var(--ok)]">{msg}</p>}
    </Card>
  );
}
