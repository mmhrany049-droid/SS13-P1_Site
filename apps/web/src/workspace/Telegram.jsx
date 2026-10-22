import { useEffect, useState } from 'react';
import { adminApi } from './adminApi.js';
import { Btn, Card, Chip, Head, fa, jDate } from '@ss/ui/ui.jsx';
const inp = 'mt-1 w-full rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[15px]';
const ST = { running: ['روشن', 'var(--ok)'], starting: ['در حال اتصال', 'var(--amber)'], reconnecting: ['اتصال دوباره…', 'var(--amber)'], error: ['خطا', 'var(--bad)'], stopped: ['خاموش', 'var(--pencil)'], disabled: ['خاموش', 'var(--pencil)'], 'no-token': ['توکن ندارد', 'var(--pencil)'] };
/** ربات تلگرام + فهرست پروکسی مثل تلگرام + دانش‌آموزان آنلاین */
export default function Telegram() {
  const api = adminApi(); const [t, setT] = useState(null); const [stu, setStu] = useState([]); const [msg, setMsg] = useState('');
  const [tok, setTok] = useState(''); const [link, setLink] = useState(''); const [f, setF] = useState({ type: 'socks5', host: '', port: '', user: '', pass: '', name: '', share: false }); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => { try { setT(await api.telegram()); setStu((await api.students()).items); } catch (e) { setMsg('✗ ' + e.message); } };
  useEffect(() => { load(); const i = setInterval(load, 8000); return () => clearInterval(i); }, []);
  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); setMsg(ok ? (typeof ok === 'function' ? ok(r) : ok) : '✓'); } catch (e) { setMsg('✗ ' + ({ 'unrecognized': 'لینک پروکسی شناخته نشد', 'bad-host': 'آدرس نامعتبر', 'bad-port': 'پورت نامعتبر', 'bad-secret': 'secret نامعتبر', 'bot-not-running': 'ربات روشن نیست' }[e.code] || e.message)); } setBusy(false); load(); };
  if (!t) return <Card><p>{msg || 'در حال بارگذاری…'}</p></Card>;
  const [stTxt, stCol] = ST[t.status.state] || [t.status.state, 'var(--pencil)'];
  return <div>
    <Head kicker="مرکز" title="ربات تلگرام" />
    {msg && <p role="status" className="mb-4 rounded-[10px] bg-[var(--wash)] p-3 text-[14px] font-bold">{msg}</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><div className="mb-2 flex items-center justify-between"><p className="text-[16px] font-black">ربات</p><span className="rounded-full px-3 py-0.5 text-[13px] font-bold text-[var(--paper)]" style={{ background: stCol }}>{stTxt}{t.status.username ? ` · @${t.status.username}` : ''}</span></div>
        {t.status.error && <p className="mb-2 text-[13px] text-[var(--bad)]">{t.status.error}</p>}
        <label className="text-[14px] font-bold">توکن از @BotFather {t.hasToken ? `(فعلی: ${t.token})` : ''}<input dir="ltr" className={inp} placeholder="123456:ABC…" value={tok} onChange={e => setTok(e.target.value.trim())} /></label>
        <div className="mt-2 flex flex-wrap gap-2"><Btn disabled={!tok || busy} onClick={() => run(() => api.call('/api/admin/telegram', 'POST', { token: tok, enabled: true }), '✓ توکن ذخیره و ربات روشن شد')}>ذخیره توکن</Btn>
          <Btn kind="soft" disabled={!t.hasToken || busy} onClick={() => run(() => api.call('/api/admin/telegram', 'POST', { enabled: !t.enabled }))}>{t.enabled ? 'خاموش کن' : 'روشن کن'}</Btn>
          <Btn kind="ghost" disabled={busy} onClick={() => run(() => api.call('/api/admin/telegram/direct-test', 'POST'), r => r.ok ? `✓ اتصال مستقیم: ${fa(r.ms)} میلی‌ثانیه` : `✗ اتصال مستقیم: ${r.error}`)}>آزمایش اتصال مستقیم</Btn></div>
        <label className="mt-3 flex items-center gap-2 text-[14px]"><input type="checkbox" checked={!!t.notifyOnPublish} onChange={e => run(() => api.call('/api/admin/telegram', 'POST', { notifyOnPublish: e.target.checked }))} />اطلاعیه‌های جدید هنگام انتشار برای دانش‌آموزان فرستاده شود</label>
        <p className="mt-3 text-[13px] leading-6 text-[var(--pencil)]">دانش‌آموز در ربات «Start» می‌زند و با دکمه «ارسال شماره من» وصل می‌شود؛ شماره باید با شماره ثبت‌نام در اپ SS یکی باشد. پاسخ‌ها از آخرین همگام‌سازی اپ می‌آید.</p></Card>
      <Card><p className="mb-2 text-[16px] font-black">پروکسی</p>
        <div className="mb-3 flex flex-wrap gap-2">{[['direct', 'بدون پروکسی'], ['manual', 'پروکسی انتخاب‌شده'], ['auto', 'خودکار (سریع‌ترین سالم)']].map(([k, l]) => <Chip key={k} active={t.proxyMode === k} onClick={() => run(() => api.call('/api/admin/telegram', 'POST', { proxyMode: k }))}>{l}</Chip>)}</div>
        <ul className="grid gap-2">{t.proxies.map(p => <li key={p.id} className={`rounded-[10px] p-3 text-[14px] ${t.activeProxyId === p.id && t.proxyMode === 'manual' ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[var(--wash)]'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className="text-right" disabled={p.type === 'mtproto'} onClick={() => run(() => api.call('/api/admin/telegram', 'POST', { proxyMode: 'manual', activeProxyId: p.id }), '✓ پروکسی فعال شد')}><b dir="ltr">{p.name || `${p.host}:${p.port}`}</b> <span className="text-[12px] opacity-80">{p.type === 'mtproto' ? 'MTProto (فقط برای اپ تلگرام)' : p.type === 'http' ? 'HTTP' : 'SOCKS5'}{p.user ? ' · با رمز' : ''}</span></button>
            <span className="text-[12px] font-bold">{p.lastTest ? (p.lastTest.ok ? `${fa(p.lastTest.ms)}ms ✓` : 'ناموفق ✗') : 'تست نشده'}</span></div>
          <div className="mt-1 flex flex-wrap gap-3 text-[12px] font-bold"><button type="button" onClick={() => run(() => api.call(`/api/admin/telegram/proxies/${p.id}/test`, 'POST'), r => r.ok ? `✓ ${fa(r.ms)} میلی‌ثانیه${r.bot ? ` · @${r.bot}` : ''}` : `✗ ${r.error}`)}>تست</button>
            <button type="button" onClick={() => run(() => api.call(`/api/admin/telegram/proxies/${p.id}/update`, 'POST', { share: !p.share }))}>{p.share ? 'اشتراک با دانش‌آموزان ✓' : 'اشتراک با دانش‌آموزان'}</button>
            <button type="button" onClick={() => navigator.clipboard?.writeText(p.link)}>کپی لینک</button><button type="button" className="text-[var(--bad)]" onClick={() => confirm('حذف شود؟') && run(() => api.call(`/api/admin/telegram/proxies/${p.id}/delete`, 'POST'))}>حذف</button></div></li>)}</ul>
        {t.proxies.length > 1 && <Btn kind="ghost" className="mt-2" disabled={busy} onClick={() => run(() => api.call('/api/admin/telegram/test-all', 'POST'), '✓ همه تست شدند')}>تست همه</Btn>}
        <p className="mt-4 text-[14px] font-bold">افزودن با لینک (مثل تلگرام)</p>
        <div className="flex gap-2"><input dir="ltr" className={inp + ' mt-0'} placeholder="tg://socks?server=…  ·  socks5://user:pass@host:port  ·  https://t.me/proxy?…" value={link} onChange={e => setLink(e.target.value)} /><Btn disabled={!link} onClick={() => run(() => api.call('/api/admin/telegram/proxies', 'POST', { link }), () => { setLink(''); return '✓ اضافه شد'; })}>افزودن</Btn></div>
        <p className="mt-3 text-[14px] font-bold">یا دستی</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><select className={inp} value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="socks5">SOCKS5</option><option value="http">HTTP</option></select>
          <input dir="ltr" className={inp} placeholder="host" value={f.host} onChange={e => setF({ ...f, host: e.target.value.trim() })} /><input dir="ltr" className={inp} placeholder="port" value={f.port} onChange={e => setF({ ...f, port: e.target.value.replace(/\D/g, '') })} />
          <input dir="ltr" className={inp} placeholder="user (اختیاری)" value={f.user} onChange={e => setF({ ...f, user: e.target.value })} /><input dir="ltr" type="password" className={inp} placeholder="pass" value={f.pass} onChange={e => setF({ ...f, pass: e.target.value })} /><input className={inp} placeholder="نام" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <Btn kind="soft" className="mt-2" disabled={!f.host || !f.port} onClick={() => run(() => api.call('/api/admin/telegram/proxies', 'POST', f), () => { setF({ ...f, host: '', port: '', user: '', pass: '', name: '' }); return '✓ اضافه شد'; })}>افزودن پروکسی</Btn>
        <p className="mt-2 text-[12px] text-[var(--pencil)]">ربات از SOCKS5 و HTTP استفاده می‌کند. MTProto فقط در اپ تلگرام کار می‌کند؛ برای اشتراک با دانش‌آموزان نگه داشته می‌شود.</p></Card>
      <Card><p className="mb-2 text-[16px] font-black">پیام همگانی</p><textarea rows={3} className={inp} value={text} onChange={e => setText(e.target.value)} /><Btn className="mt-2" disabled={!text.trim() || busy} onClick={() => run(() => api.call('/api/admin/telegram/broadcast', 'POST', { text }), r => `✓ برای ${fa(r.sent)} نفر فرستاده شد`)}>ارسال</Btn></Card>
      <Card><p className="mb-2 text-[16px] font-black">دانش‌آموزان ({fa(stu.length)})</p><ul className="grid max-h-[50vh] gap-1.5 overflow-auto text-[14px]">{stu.map(x => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-[var(--wash)] px-3 py-1.5"><span><b>{x.name || 'بی‌نام'}</b> <span dir="ltr" className="text-[12px]">{x.phone ? '0' + x.phone.slice(2) : '—'}</span><span className="block text-[12px] text-[var(--pencil)]">{x.online ? 'ثبت آنلاین' : 'از فایل'}{x.telegram ? ' · تلگرام ✓' : ''}{x.hasSummary ? '' : ' · خلاصه ندارد'}{x.lastPackAt ? ` · ${jDate(x.lastPackAt)}` : ''}</span></span>
        <span className="flex gap-2 text-[12px] font-bold"><button type="button" onClick={() => confirm('دستگاه این دانش‌آموز بازنشانی شود؟ (برای ثبت دوباره با همان شماره)') && run(() => api.call(`/api/admin/students/${x.id}/reset`, 'POST'))}>بازنشانی دستگاه</button><button type="button" className="text-[var(--bad)]" onClick={() => confirm('حذف شود؟') && run(() => api.call(`/api/admin/students/${x.id}/delete`, 'POST'))}>حذف</button></span></li>)}</ul>
        <p className="mt-3 text-[13px] text-[var(--pencil)]">وصل‌شده در تلگرام: {fa(t.links.length)} نفر</p></Card>
    </div></div>;
}
