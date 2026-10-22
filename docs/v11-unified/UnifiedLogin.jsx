import { useState } from 'react';

// SS 11: one site, one login, role is resolved by the server from the account.
export default function UnifiedLogin({ onSubmit, error = '' }) {
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (!identity.trim() || !password) return;
    setBusy(true);
    try { await onSubmit({ identity: identity.trim(), password }); }
    finally { setBusy(false); }
  };
  return <main dir="rtl" lang="fa" className="ss-login">
    <section className="ss-login-card" aria-labelledby="login-title">
      <p className="ss-kicker">SS 11</p>
      <h1 id="login-title">یک ورود برای همه</h1>
      <p>دانش‌آموز، معلم، مدرسه، آموزشگاه یا رئیس؟ با همان حساب وارد شو.</p>
      <form onSubmit={submit}>
        <label>ایمیل یا شماره موبایل<input autoComplete="username" value={identity} onChange={e => setIdentity(e.target.value)} /></label>
        <label>رمز عبور<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        {error && <p role="alert" className="ss-error">{error}</p>}
        <button disabled={busy || !identity.trim() || !password}>{busy ? 'در حال ورود…' : 'ورود به SS'}</button>
      </form>
      <a href="/forgot-password">رمز را فراموش کرده‌ای؟</a>
    </section>
  </main>;
}
