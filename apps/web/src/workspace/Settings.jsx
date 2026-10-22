// تنظیمات مرکز (owner): registration, verification, cloud backup, public address (used in e-mailed links), CORS, daily mail cap; full backup / restore.
import { useEffect, useState } from 'react';
import { api, errText } from './adminApi.js';
import { downloadJson, readJsonFile } from '@ss/domain/format.js';
import { Btn, Card, Head, fa } from '@ss/ui/ui.jsx';
import { inp } from './theme.js';

export default function SettingsPage({ offline, h, setH }) {
  const [c, setC] = useState(null); const [msg, setMsg] = useState('');
  useEffect(() => { if (!offline) api('/api/admin/config').then(setC).catch(e => setMsg('✗ ' + errText(e))); }, []);
  if (offline) return <div><Head kicker="سیستم" title="تنظیمات" /><Card><label className="text-[14px] font-bold">نام مرکز<input className={inp} value={h.name} onChange={e => setH(x => ({ ...x, name: e.target.value }))} /></label></Card></div>;
  if (!c) return <p>{msg || '…'}</p>;
  const save = async patch => { setC(x => ({ ...x, ...patch })); try { await api('/api/admin/config', { method: 'POST', body: patch }); if (patch.name) setH(x => ({ ...x, name: patch.name })); setMsg('✓ ذخیره شد'); } catch (e) { setMsg('✗ ' + errText(e)); } };
  const Tog = ({ k, t, d }) => <label className="flex cursor-pointer items-start gap-3 rounded-[10px] bg-[var(--wash)] p-3 text-[15px]"><input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--ink)]" checked={!!c[k]} onChange={e => save({ [k]: e.target.checked })} /><span><b>{t}</b><span className="block text-[13px] text-[var(--pencil)]">{d}</span></span></label>;
  const backup = async () => { try { const b = await api('/api/admin/backup'); downloadJson(b, `SS-hub-backup-${new Date().toISOString().slice(0, 10)}.json`); setMsg('✓ پشتیبان دانلود شد (رمزها و توکن‌ها داخلش نیست).'); } catch (e) { setMsg('✗ ' + errText(e)); } };
  const restore = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f || !confirm('همه داده‌های فعلی مرکز با این پشتیبان جایگزین شود؟')) return; try { const r = await api('/api/admin/restore', { method: 'POST', body: await readJsonFile(f) }); setMsg(`✓ بازیابی شد (${fa(r.packs)} بسته). صفحه را تازه کن.`); } catch (x) { setMsg('✗ ' + errText(x)); } };
  return <div>
    <Head kicker="سیستم" title="تنظیمات و پشتیبان">{msg && <span className={`text-[14px] font-bold ${msg.startsWith('✗') ? 'text-[var(--bad)]' : 'text-[var(--ok)]'}`}>{msg}</span>}</Head>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><p className="mb-3 text-[16px] font-black">مرکز</p>
        <label className="block text-[14px] font-bold">نام مرکز<input className={inp} defaultValue={c.name} onBlur={e => e.target.value !== c.name && save({ name: e.target.value })} /></label>
        <label className="mt-3 block text-[14px] font-bold">آدرس عمومی سایت مدیریت <span className="font-normal text-[var(--pencil)]">(برای لینک‌های ایمیل)</span><input dir="ltr" className={inp + ' text-left'} placeholder="https://hub.example.ir" defaultValue={c.publicUrl} onBlur={e => e.target.value !== c.publicUrl && save({ publicUrl: e.target.value.trim().replace(/\/+$/, '') })} /></label>
        <label className="mt-3 block text-[14px] font-bold">آدرس سایت دانش‌آموز<input dir="ltr" className={inp + ' text-left'} placeholder="https://hub.example.ir/app/" defaultValue={c.studentSiteUrl} onBlur={e => e.target.value !== c.studentSiteUrl && save({ studentSiteUrl: e.target.value.trim() })} /></label>
        <label className="mt-3 block text-[14px] font-bold">سقف ایمیل روزانه<input inputMode="numeric" className={inp} defaultValue={c.mailDailyCap} onBlur={e => save({ mailDailyCap: Math.max(10, +e.target.value || 450) })} /></label>
        <label className="mt-3 block text-[14px] font-bold">دامنه‌های مجاز برنامه‌های بیرونی (CORS) <span className="font-normal text-[var(--pencil)]">(خالی = فقط همین سایت؛ * = همه، توصیه نمی‌شود)</span><input dir="ltr" className={inp + ' text-left'} defaultValue={c.corsOrigins} onBlur={e => e.target.value !== c.corsOrigins && save({ corsOrigins: e.target.value.trim() })} /></label></Card>
      <Card><p className="mb-3 text-[16px] font-black">حساب دانش‌آموزان</p><div className="grid gap-2">
        <Tog k="registrationOpen" t="ثبت‌نام آنلاین باز است" d="بستنش جلوی ثبت‌نام تازه را می‌گیرد؛ حساب‌های موجود کار می‌کنند." />
        <Tog k="requireVerify" t="تأیید ایمیل لازم است" d="تا ایمیل تأیید نشود، دانش‌آموز نمی‌تواند برنامه‌اش را به ایمیل خودش بفرستد." />
        <Tog k="cloudBackup" t="پشتیبان ابری" d="داده برنامه هر دانش‌آموز (با رضایت خودش) روی سرور نگه داشته می‌شود تا روی دستگاه دیگر با ورود برگردد." />
        <Tog k="allowAnonymousPacks" t="قبول بسته بدون حساب" d="فقط برای سازگاری با دستگاه‌های قدیمی؛ پیشنهاد نمی‌شود." /></div></Card>
      <Card className="lg:col-span-2"><p className="mb-1 text-[16px] font-black">پشتیبان کامل مرکز</p><p className="mb-3 text-[14px] text-[var(--pencil)]">داده مرکز، دانش‌آموزان، بسته‌ها، پیام‌ها و تنظیمات تلگرام (بدون رمزها، توکن‌ها و App Password). هفته‌ای یک بار دانلود کن.</p>
        <div className="flex flex-wrap gap-2"><Btn onClick={backup}>دانلود پشتیبان</Btn><label className="inline-flex min-h-[42px] cursor-pointer items-center rounded-[10px] bg-[var(--wash)] px-4 text-[15px] font-bold text-[var(--ink-deep)]">بازیابی از فایل<input type="file" accept=".json" className="sr-only" onChange={restore} /></label></div></Card>
    </div>
  </div>;
}
