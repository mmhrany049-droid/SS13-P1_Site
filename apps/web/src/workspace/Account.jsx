// حساب من و امنیت: profile + email, change password (strength meter), 2-step login (TOTP), open sessions with revoke.
import { useEffect, useState } from 'react';
import { api, errText } from './adminApi.js';
import { Btn, Card, Head, fa, jDate } from '@ss/ui/ui.jsx';
import { PwField } from './Auth.jsx';
import { inp } from './theme.js';

const device = ua => /iPhone|Android/i.test(ua) ? '📱 موبایل' : /Mac/i.test(ua) ? '💻 مک' : /Windows/i.test(ua) ? '💻 ویندوز' : /Linux/i.test(ua) ? '💻 لینوکس' : '🌐 مرورگر';
export default function Account({ me, offline, onOut }) {
  const [p, setP] = useState({ name: me.name || '', email: me.legacy ? '' : me.email || '' }); const [pw, setPw] = useState({ old: '', a: '', b: '' }); const [t, setT] = useState(null); const [code, setCode] = useState(''); const [ss, setSs] = useState([]); const [msg, setMsg] = useState({});
  const say = (k, m) => setMsg(x => ({ ...x, [k]: m }));
  const loadS = () => api('/api/admin/me/sessions').then(r => setSs(r.items)).catch(() => {});
  useEffect(() => { if (!offline) loadS(); }, []);
  if (offline) return <div><Head kicker="سیستم" title="حساب من" /><Card><p>در حالت فایل حساب کاربری وجود ندارد.</p></Card></div>;
  const saveProfile = async () => { try { await api('/api/admin/me/profile', { method: 'POST', body: p }); say('p', '✓ ذخیره شد'); onOut(); } catch (e) { say('p', '✗ ' + errText(e)); } };
  const savePw = async () => { if (pw.a !== pw.b) return say('pw', '✗ تکرار رمز یکی نیست.'); try { await api('/api/admin/me/password', { method: 'POST', body: { old: pw.old, password: pw.a } }); setPw({ old: '', a: '', b: '' }); say('pw', '✓ رمز عوض شد؛ بقیه نشست‌ها بسته شدند.'); loadS(); onOut(); } catch (e) { say('pw', '✗ ' + errText(e)); } };
  const setup2 = async () => { try { setT(await api('/api/admin/me/totp/setup', { method: 'POST', body: {} })); } catch (e) { say('t', '✗ ' + errText(e)); } };
  const enable2 = async () => { try { await api('/api/admin/me/totp/enable', { method: 'POST', body: { code } }); setT(null); setCode(''); say('t', '✓ ورود دومرحله‌ای روشن شد.'); onOut(); } catch (e) { say('t', '✗ ' + errText(e)); } };
  const disable2 = async () => { const password = prompt('برای خاموش کردن، رمزت را بزن:'); if (!password) return; try { await api('/api/admin/me/totp/disable', { method: 'POST', body: { password } }); say('t', 'ورود دومرحله‌ای خاموش شد.'); onOut(); } catch (e) { say('t', '✗ ' + errText(e)); } };
  const revoke = async id => { try { await api('/api/admin/me/sessions/revoke', { method: 'POST', body: { id } }); loadS(); } catch (e) { say('s', '✗ ' + errText(e)); } };
  const M = ({ k }) => msg[k] ? <p className={`mt-2 text-[14px] font-bold ${msg[k].startsWith('✗') ? 'text-[var(--bad)]' : 'text-[var(--ok)]'}`}>{msg[k]}</p> : null;
  return <div>
    <Head kicker={me.roleFa} title="حساب من و امنیت" />
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><p className="mb-3 text-[16px] font-black">مشخصات</p>
        <label className="block text-[14px] font-bold">نام<input className={inp} value={p.name} onChange={e => setP({ ...p, name: e.target.value })} /></label>
        <label className="mt-2 block text-[14px] font-bold">ایمیل ورود و بازیابی<input dir="ltr" className={inp + ' text-left'} placeholder="you@gmail.com" value={p.email} onChange={e => setP({ ...p, email: e.target.value.trim() })} /></label>
        <Btn kind="soft" className="mt-3" onClick={saveProfile}>ذخیره</Btn><M k="p" /></Card>
      <Card><p className="mb-3 text-[16px] font-black">تغییر رمز</p>
        <div className="grid gap-2"><PwField label="رمز فعلی" value={pw.old} onChange={v => setPw({ ...pw, old: v })} /><PwField label="رمز جدید (حداقل ۱۰ کاراکتر)" meter autoComplete="new-password" value={pw.a} onChange={v => setPw({ ...pw, a: v })} /><PwField label="تکرار رمز جدید" autoComplete="new-password" value={pw.b} onChange={v => setPw({ ...pw, b: v })} onEnter={savePw} /></div>
        <Btn kind="soft" className="mt-3" disabled={!pw.old || !pw.a} onClick={savePw}>عوض کردن رمز</Btn><M k="pw" /></Card>
      <Card><div className="mb-2 flex items-center justify-between"><p className="text-[16px] font-black">ورود دومرحله‌ای</p><span className={`rounded-full px-3 py-0.5 text-[13px] font-bold text-white ${me.totp ? 'bg-[var(--ok)]' : 'bg-[var(--pencil)]'}`}>{me.totp ? 'روشن' : 'خاموش'}</span></div>
        <p className="mb-3 text-[14px] text-[var(--pencil)]">بعد از رمز، یک کد ۶ رقمی از برنامه Google Authenticator یا Microsoft Authenticator گوشی‌ات هم لازم می‌شود. حتی اگر رمزت لو برود، کسی وارد نمی‌شود.</p>
        {me.totp ? <Btn kind="ghost" className="text-[var(--bad)]" onClick={disable2}>خاموش کردن</Btn> : !t ? <Btn onClick={setup2}>روشن کردن</Btn> : <div className="grid gap-3">
          <p className="text-[14px]">۱) در برنامه Authenticator «افزودن حساب ← وارد کردن کلید» را بزن و این کلید را وارد کن (یا روی گوشی همین لینک را باز کن):</p>
          <p className="select-all rounded-[10px] bg-[var(--wash)] p-3 text-center font-mono text-[17px] font-black tracking-[0.15em]" dir="ltr">{t.secret.match(/.{1,4}/g).join(' ')}</p>
          <a href={t.url} className="text-[14px] font-bold text-[var(--ink)] underline">باز کردن در برنامه Authenticator</a>
          <p className="text-[14px]">۲) کد ۶ رقمی که برنامه نشان می‌دهد:</p>
          <div className="flex gap-2"><input inputMode="numeric" dir="ltr" aria-label="کد" className={inp + ' mt-0 text-center text-[20px] tracking-[0.4em]'} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /><Btn disabled={code.length < 6} onClick={enable2}>تأیید</Btn></div></div>}
        <M k="t" /></Card>
      <Card><div className="mb-2 flex items-center justify-between"><p className="text-[16px] font-black">نشست‌های باز</p>{ss.length > 1 && <button type="button" className="text-[14px] font-bold text-[var(--bad)]" onClick={() => revoke('others')}>بستن همه به جز این</button>}</div>
        <ul className="grid gap-2">{ss.map(x => <li key={x.id} className="flex items-center justify-between gap-2 rounded-[10px] bg-[var(--wash)] p-3 text-[14px]"><span><b>{device(x.ua)}</b>{x.current && <span className="mr-2 text-[var(--ok)]">· همین دستگاه</span>}<span className="block text-[12px] text-[var(--pencil)]" dir="auto">{x.ip} · آخرین فعالیت {jDate(x.lastSeen)}</span></span>{!x.current && <button type="button" className="text-[13px] font-bold text-[var(--bad)]" onClick={() => revoke(x.id)}>بستن</button>}</li>)}</ul><M k="s" /></Card>
    </div>
  </div>;
}
