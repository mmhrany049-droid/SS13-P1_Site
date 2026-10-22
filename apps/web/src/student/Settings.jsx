import { useEffect, useState } from 'react';
import * as E from '@ss/domain/engine.js';
import { migrate, setMode, initialState, resetDemo, DATA_VERSION } from '@ss/domain/store.js';
import { Btn, Card, Head, fa, jDate } from '@ss/ui/ui.jsx';
import { AccountCard } from './AccountCard.jsx';
import { exportPhotos, importPhotos } from './media.js';

const inp = 'w-24 rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-center text-[15px]';
function Num({ label: l, value, onChange, min, max, unit }) {
  return <label className="flex items-center justify-between gap-3 text-[15px]"><span>{l}</span><span className="flex items-center gap-2"><input inputMode="numeric" className={inp} value={fa(value)} onChange={e => { const v = +E.normalizeDigits(e.target.value); if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v))); }} /><span className="w-12 text-[14px] text-[var(--pencil)]">{unit}</span></span></label>;
}
function Toggle({ label: l, on, onChange, hint }) {
  return <label className="flex cursor-pointer items-center justify-between gap-3 text-[15px]"><span>{l}{hint && <span className="block text-[13px] text-[var(--pencil)]">{hint}</span>}</span>
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-[var(--ink)]' : 'bg-[var(--rule)]'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-[var(--paper)] transition-all ${on ? 'right-1' : 'right-6'}`} /></button></label>;
}

export default function Settings({ s, set, onLock }) {
  const st = s.settings; const up = p => set(x => ({ ...x, settings: { ...x.settings, ...p } }));
  const [persist, setPersist] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [incomingPhotos, setIncomingPhotos] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { navigator.storage?.persisted?.().then(setPersist).catch(() => setPersist(null)); }, []);
  const askPersist = () => navigator.storage?.persist?.().then(setPersist);
  const exportBak = async () => {
    const ids = s.exams.flatMap(e => (e.sittings || []).flatMap(z => z.photos || []));
    const photos = ids.length ? await exportPhotos(ids).catch(() => ({})) : {};
    const { secret, pinHash, recoveryHash, server, ...safeAccount } = s.account || {};
    const safeData = { ...s, account: { ...safeAccount, ...(server ? { server: { url: server.url, unified: !!server.unified } } : {}) } };
    const blob = new Blob([JSON.stringify({ format: 'ssbak', dataVersion: DATA_VERSION, exportedAt: new Date().toISOString(), data: safeData, photos })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `SS-backup-${new Date().toISOString().slice(0, 10)}.ssbak`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    up({ backupAt: new Date().toISOString() }); setMsg('فایل پشتیبان ساخته شد.');
  };
  const pick = e => { const f = e.target.files?.[0]; if (!f) return; f.text().then(t => { try { const j = JSON.parse(t); const d = migrate(j.data || j); setIncoming(d); setIncomingPhotos(j.photos || null); setMsg(''); } catch { setMsg('این فایل پشتیبان SS نیست.'); } }); e.target.value = ''; };
  const daysSinceBackup = st.backupAt ? Math.floor((Date.now() - Date.parse(st.backupAt)) / 864e5) : null;
  return (
    <div>
      <Head kicker="تنظیمات" title="تنظیمات و پشتیبان" />
      <div className="grid gap-5 lg:grid-cols-2">
        <AccountCard s={s} set={set} onLock={onLock} />
        <Card>
          <p className="mb-4 text-[16px] font-black">برنامه‌ریز</p>
          <div className="grid gap-3">
            <p className="rounded-[10px] bg-[var(--wash)] p-3 text-[14px]">ساعت‌های مطالعه، هدف هر روز، روزهای جبرانی و تعطیل و کلاس‌های ثابت حالا در <a href="#/days" className="font-bold text-[var(--ink)] underline">روزهای من</a> تنظیم می‌شوند.</p>

            <Num label="افق برنامه‌ریزی" value={st.planWeeks ?? 4} min={1} max={12} unit="هفته" onChange={v => up({ planWeeks: v })} />


            <Num label="حداقل خواب" value={st.sleepH} min={3} max={11} unit="ساعت" onChange={v => up({ sleepH: v })} />
          </div>
        </Card>
        <Card>
          <p className="mb-4 text-[16px] font-black">پاداش و حافظه</p>
          <div className="grid gap-4">
            <Toggle label="پاداش‌ها" on={st.rewards} onChange={v => up({ rewards: v })} />
            <Toggle label="سکه" hint="خاموش = فقط امتیاز تجربه" on={st.coins} onChange={v => up({ coins: v })} />
            <Num label="سقف مرور روزانه" value={st.reviewLimit ?? 40} min={5} max={300} unit="کارت" onChange={v => up({ reviewLimit: v })} />
            <Num label="سقف کارت جدید در روز" value={st.reviewNewLimit ?? 20} min={0} max={200} unit="کارت" onChange={v => up({ reviewNewLimit: v })} />
            <label className="flex items-center justify-between gap-3 text-[15px]"><span>منحنی فراموشی</span>
              <select className="rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2" value={st.fsrs} onChange={e => up({ fsrs: e.target.value })}><option value="4.5">FSRS-4.5</option><option value="6">FSRS-6</option></select></label>
          </div>
        </Card>
        <Card>
          <p className="mb-1 text-[16px] font-black">پشتیبان</p>
          <p className="mb-4 text-[14px] text-[var(--pencil)]">{st.backupAt ? `آخرین پشتیبان: ${jDate(st.backupAt)}` : 'هنوز پشتیبان نگرفته‌ای.'}{daysSinceBackup != null && daysSinceBackup >= 7 ? ' وقتشه دوباره بگیری.' : ''}</p>
          <div className="flex flex-wrap gap-2"><Btn onClick={exportBak}>ساخت فایل پشتیبان</Btn>
            <label className="inline-flex min-h-[42px] cursor-pointer items-center rounded-[10px] border-2 border-[var(--ink)] px-4 text-[15px] font-bold text-[var(--ink)] hover:bg-[var(--wash)]">بازگردانی از فایل<input type="file" accept=".ssbak,.json" className="sr-only" onChange={pick} /></label></div>
          {incoming && <div className="mt-4 rounded-[12px] bg-[var(--wash)] p-4 text-[15px]">
            <p className="font-bold">این فایل شامل {fa(incoming.sessions.length)} جلسه، {fa(incoming.exams.length)} آزمون و {fa(incoming.books.length)} کتاب است.</p>
            <p className="mt-1 text-[14px] text-[var(--pencil)]">جایگزین داده‌های فعلی می‌شود. قبلش از وضع فعلی پشتیبان بگیر.</p>
            <div className="mt-3 flex gap-2"><Btn onClick={async () => { if (incomingPhotos) await importPhotos(incomingPhotos).catch(() => {}); set(() => ({ ...incoming, account: { ...incoming.account, secret: s.account?.secret, pinHash: s.account?.pinHash, recoveryHash: s.account?.recoveryHash, server: s.account?.server || null, unifiedUserId: s.account?.unifiedUserId }, demo: s.demo })); setIncoming(null); setIncomingPhotos(null); setMsg('بازگردانی شد.'); }}>جایگزین کن</Btn><Btn kind="ghost" onClick={() => { setIncoming(null); setIncomingPhotos(null); }}>لغو</Btn></div></div>}
          <p className="mt-4 text-[14px]">ذخیره ماندگار مرورگر: <b>{persist == null ? 'نامشخص' : persist ? 'فعال' : 'غیرفعال'}</b>{persist === false && <button type="button" className="mr-2 font-bold text-[var(--ink)] underline" onClick={askPersist}>فعال کن</button>}</p>
          {msg && <p className="mt-2 text-[14px] font-bold text-[var(--ok)]" role="status">{msg}</p>}
          <p className="mt-4 text-[14px]">اتصال به سایت مدیریت و ربات تلگرام: <a href="#/network" className="font-bold text-[var(--ink)] underline">مرکز و همگام‌سازی</a></p>
        </Card>
        <Card>
          <p className="mb-4 text-[16px] font-black">داده‌ها</p>
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]"><span>{s.demo ? 'الان داده نمونه را می‌بینی.' : 'الان داده‌های خودت را می‌بینی.'}</span>
              <div className="flex gap-2">{s.demo ? <><Btn kind="soft" onClick={() => set(() => setMode('real'))}>برگشت به داده‌های خودم</Btn><Btn kind="ghost" onClick={() => set(() => resetDemo())}>نمونه از نو</Btn></> : <Btn kind="soft" onClick={() => set(() => setMode('demo'))}>دیدن داده نمونه</Btn>}</div></div>
            {!s.demo && <div className="rounded-[12px] border-2 border-[var(--ink-faint)] p-4">
              <p className="text-[15px] font-bold text-[var(--bad)]">پاک کردن همه داده‌های خودم</p>
              <p className="mb-3 text-[14px] text-[var(--pencil)]">برگشت‌پذیر نیست. برای تأیید بنویس «پاک کن».</p>
              <div className="flex gap-2"><input aria-label="تأیید پاک کردن" className="min-w-0 flex-1 rounded-[10px] border-2 border-[var(--rule)] bg-[var(--paper)] px-3 py-2" value={confirm} onChange={e => setConfirm(e.target.value)} />
                <Btn disabled={E.normalizeFa(confirm) !== 'پاک کن'} className="bg-[var(--bad)]" onClick={() => { set(() => initialState()); setConfirm(''); setMsg('همه داده‌ها پاک شد.'); }}>پاک کن</Btn></div></div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
