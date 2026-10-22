/*
 SS 12 — /workspace, the organisation desk of the single site (was the separate «admin site» up to v11).
 12: no own login — the unified session decides; new pages on the unified API: people & nine roles, class schedule,
 migration of v9–v11 data, events & integrity. Preserved v11 pages run on the same session through the hub bridge.
 Older notes — the hub's control room. Subject: the people who run an SS study center (school counsellor, institute owner).
 Design: same answer-sheet spine as the student site (timing-mark rail, bubble nav, 900 headlines) in fountain-pen blue.
 Layout: rail + nav (left in RTL = right edge) | top bar (search-free, account menu) | page. Signature: the drifting rail.
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errText } from './adminApi.js';
import { THEME } from './theme.js';
import * as H from './hubStore.js';
import { Setup, Login } from './Auth.jsx';
import Desk from './Desk.jsx';
import Students from './Students.jsx';
import Messages from './Messages.jsx';
import Mail from './Mail.jsx';
import Team from './Team.jsx';
import Account from './Account.jsx';
import SettingsPage from './Settings.jsx';
import Audit from './Audit.jsx';
import Telegram from './Telegram.jsx';
import AdminAssistant from './Assistant.jsx';
import { People, Classes, Library, ClassExams, MockExams, Compare, Notes } from './HubPages.jsx';
import { fa, jDate } from '@ss/ui/ui.jsx';
import { canDo } from './perms.js';
import { People12, Schedules, Imports, Integrity, Progress, may } from './V12Pages.jsx';
import Network from './Network.jsx';
import { Approvals, Badges } from './Approvals.jsx';

const NAV = [
  ['g', 'روزانه'], ['desk', 'میز کار', '◉'], ['students', 'دانش‌آموزان', '◍'], ['messages', 'پیام‌ها', '✉'], ['mail', 'ایمیل (Gmail)', '@'],
  ['g', 'آموزش'], ['classes', 'مدارس و کلاس‌ها', '▣'], ['people', 'گروه‌بندی افراد', '◐'], ['books', 'کتاب‌های تست', '▥'], ['exams', 'آزمون‌های مشترک', '◎'], ['mock', 'شبه‌کنکور', '◇'], ['compare', 'مقایسه', '▤'], ['notes', 'اطلاعیه‌ها', '✦'],
  ['g', 'سازمان'], ['people12', 'افراد و نقش‌ها', '♜', null, 'org.members.manage'], ['progress', 'پیوند مطالعه و کلاس', '◴', null, 'progress.read'], ['schedules', 'برنامه کلاس', '▦', null, 'class.read'], ['imports', 'انتقال داده قدیمی', '⇪', null, 'import.run'], ['integrity', 'رویدادها و صحت داده', '◈', null, 'events.read'], ['network', 'شبکه سیستم‌ها', '⌘', null, 'events.read'], ['approvals', 'مجوزها و تأییدها', '✓', null, 'approvals.*'], ['badges', 'تیک طلایی', '★', null, 'badge.grant'],
  ['g', 'سیستم'], ['telegram', 'ربات تلگرام', '✈'], ['team', 'مدیران و نقش‌ها', '♜', 'team'], ['settings', 'تنظیمات و پشتیبان', '⚙', 'config'], ['audit', 'گزارش فعالیت', '☰', 'audit'], ['account', 'حساب من و امنیت', '⚿'],
];
const PAGES = NAV.filter(n => n[0] !== 'g');
const TITLES = Object.fromEntries(PAGES.map(([k, t]) => [k, t]));
const fromHash = () => { const h = (location.hash || '').replace(/^#\/?/, '').split('?')[0]; return TITLES[h] ? h : 'desk'; };

const Wrap = ({ children }) => <div dir="rtl" lang="fa" className="ss min-h-screen bg-[var(--paper)] text-[var(--graphite)]"><style>{THEME}</style>{children}</div>;

export default function App({ unified = null }) {
  const [st, setSt] = useState(null);
  const check = useCallback(() => api('/api/admin/status').then(setSt).catch(() => setSt({ offline: true })), []);
  useEffect(() => { check(); }, [check]);
  // SS 12: one identity — if the unified session is gone, go back to the single login (no second admin login)
  useEffect(() => { if (unified && st && !st.offline && !st.authed) unified.logout(); }, [unified, st]);
  if (unified && st && !st.offline) return <Wrap>{st.authed ? <Main me={st.me} st={st} onOut={unified.logout} unified={unified} /> : <div className="grid min-h-screen place-items-center text-[18px] font-black text-[var(--ink)]">SS…</div>}</Wrap>;
  if (unified && st?.offline) return <Wrap><Main me={{ role: unified.activeRole?.roleId === 'owner' ? 'owner' : 'manager', name: unified.user?.name || '', email: unified.user?.email || '' }} st={{ name: 'میز کار', authed: true, legacyOff: true }} onOut={unified.logout} unified={unified} /></Wrap>; // v13: never «file mode» behind a real login
  if (!st) return <Wrap><div className="grid min-h-screen place-items-center text-[18px] font-black text-[var(--ink)]">SS…</div></Wrap>;
  if (st.offline) return <Wrap><Main me={{ role: 'owner', name: 'حالت فایل', email: '' }} st={{ name: 'مرکز (بدون سرور)', offline: true }} onOut={check} /></Wrap>;
  if (!st.setup) return <Wrap><Setup onDone={check} /></Wrap>;
  if (!st.authed) return <Wrap><Login st={{ ...st, legacyHint: true }} onDone={check} /></Wrap>;
  return <Wrap><Main me={st.me} st={st} onOut={check} /></Wrap>;
}

/** Hub data (classes, books, exams, announcements…) lives on the server since v3; autosaved with revision checks. */
function useHub(offline, canWrite) {
  const [h, setHraw] = useState(null); const [save, setSave] = useState({ state: 'idle' }); const rev = useRef(0); const dirty = useRef(false); const tmr = useRef(null); const latest = useRef(null);
  const load = useCallback(async () => {
    if (offline) { setHraw(H.loadHub()); return; }
    try { const r = await api('/api/admin/state'); rev.current = r.rev || 0; let hub = r.hub;
      if (!hub) { const local = localStorage.getItem('ss-hub-v1'); hub = local ? H.loadHub() : H.initialHub(); if (local && canWrite) dirty.current = true; } // one-time move of v2 browser data to the server
      setHraw({ ...H.initialHub(), ...hub }); setSave({ state: dirty.current ? 'pending' : 'saved', at: r.savedAt, by: r.savedBy });
    } catch (e) { setSave({ state: 'error', msg: errText(e) }); setHraw(H.loadHub()); }
  }, [offline, canWrite]);
  useEffect(() => { load(); }, [load]);
  const flush = useCallback(async (force = false) => {
    if (offline) { H.saveHub(latest.current); return; }
    if (!dirty.current || !latest.current) return; dirty.current = false; setSave({ state: 'saving' });
    try { const r = await api('/api/admin/state', { method: 'POST', body: { rev: rev.current, hub: latest.current, force } }); rev.current = r.rev; setSave({ state: 'saved', at: r.savedAt }); H.saveHub(latest.current); }
    catch (e) { if (e.code === 'conflict') setSave({ state: 'conflict', by: e.data?.savedBy, at: e.data?.savedAt }); else { dirty.current = true; setSave({ state: 'error', msg: errText(e) }); } }
  }, [offline]);
  useEffect(() => { latest.current = h; if (h && dirty.current) { clearTimeout(tmr.current); tmr.current = setTimeout(flush, 700); } }, [h, flush]);
  useEffect(() => { const f = e => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', f); return () => window.removeEventListener('beforeunload', f); }, []);
  const setH = useCallback(fn => { if (!canWrite) { setSave({ state: 'readonly' }); return; } dirty.current = true; setHraw(p => typeof fn === 'function' ? fn(p) : fn); }, [canWrite]);
  return { h, setH, save, reload: load, overwrite: () => { dirty.current = true; flush(true); } };
}

function Main({ me, st, onOut, unified = null }) {
  const [page, setPage] = useState(() => (st.legacyOff && (fromHash() === 'desk' || !fromHash()) ? 'people12' : fromHash())); const [menu, setMenu] = useState(false); const [counts, setCounts] = useState({});
  const canWrite = canDo(me, 'state:write');
  const hub = useHub(!!st.offline || !!st.legacyOff, canWrite);
  useEffect(() => { const f = () => { setPage(fromHash()); window.scrollTo?.({ top: 0 }); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const refreshCounts = useCallback(() => { if (!st.offline && !st.legacyOff) api('/api/admin/overview').then(setCounts).catch(() => {}); }, [st.offline]);
  useEffect(() => { refreshCounts(); const i = setInterval(refreshCounts, 30000); return () => clearInterval(i); }, [refreshCounts]);
  const go = p => { if (location.hash !== '#/' + p) location.hash = '/' + p; else setPage(p); setMenu(false); };
  const logout = async () => { if (unified) return unified.logout(); try { await api('/api/admin/logout', { method: 'POST', body: {} }); } catch { /* */ } onOut(); };
  const roleId = unified?.activeRole?.roleId;
  const allowed = n => n[4] ? !!unified && (n[4] === 'progress.read' ? may(roleId, 'student.progress.read') || may(roleId, 'reports.read') : n[4] === 'approvals.*' ? may(roleId, 'approvals.decide') || may(roleId, 'approvals.request') : may(roleId, n[4])) : (!n[3] || canDo(me, n[3])) && !(unified && n[0] === 'team') && !st.legacyOff; // «team» is superseded by «افراد و نقش‌ها»
  const visible = NAV.filter(n => n[0] === 'g' || allowed(n)).filter((n, i, a) => n[0] !== 'g' || (a[i + 1] && a[i + 1][0] !== 'g'));
  const P = { ...hub, me, st, go, canWrite, counts, refreshCounts, offline: !!st.offline };
  const S = hub.save; const saveTxt = { saving: 'در حال ذخیره…', saved: 'ذخیره شد', pending: 'در انتظار ذخیره', error: 'ذخیره نشد', conflict: 'تداخل ویرایش', readonly: 'فقط خواندنی' }[S.state];
  const hubPages = { people: People, classes: Classes, books: Library, exams: ClassExams, mock: MockExams, compare: Compare, notes: Notes };
  const HubPage = hubPages[page];
  return <>
    <div className="mx-auto flex max-w-[1480px]">
      <nav aria-label="بخش‌های مدیریت" className="sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col py-6 md:flex">
        <div className="relative flex h-full">
          <div className="relative w-[18px] overflow-hidden" aria-hidden><div className="rail rail-live absolute inset-x-[4px] -top-[22px] bottom-0 opacity-70" /></div>
          <div className="flex flex-1 flex-col overflow-y-auto pr-4">
            <button type="button" onClick={() => go('desk')} className="mb-5 text-right text-[26px] font-black leading-none text-[var(--ink)]">SS<span className="block text-[14px] font-bold text-[var(--pencil)]">میز کار · {unified?.activeRole?.organizationName || st.name}</span></button>
            {visible.map((n, i) => n[0] === 'g' ? <p key={'g' + i} className="mb-1 mt-3 pr-3 text-[12px] font-black tracking-wide text-[var(--pencil)] opacity-80">{n[1]}</p> :
              <a key={n[0]} href={`#/${n[0]}`} aria-current={page === n[0] ? 'page' : undefined} className={`relative mb-0.5 flex min-h-[40px] items-center gap-3 rounded-l-[10px] pr-3 text-right text-[15px] font-bold transition ${page === n[0] ? 'bg-[var(--ink)] text-[var(--paper)]' : 'hover:bg-[var(--wash)]'}`}>
                <span className={`absolute -right-[22px] h-[14px] w-[14px] rounded-full border-2 ${page === n[0] ? 'border-[var(--ink)] bg-[var(--ink)]' : 'border-[var(--ink-faint)] bg-[var(--paper)]'}`} aria-hidden />
                <span className="w-5 text-center opacity-80">{n[2]}</span>{n[1]}
                {n[0] === 'messages' && counts.unreadMessages > 0 && <span className={`mr-auto ml-2 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] ${page === n[0] ? 'bg-[var(--paper)] text-[var(--ink)]' : 'bg-[var(--ink)] text-[var(--paper)]'}`}>{fa(counts.unreadMessages)}</span>}
              </a>)}
            {unified ? <p className="mt-auto pt-4 text-[13px] leading-6 text-[var(--pencil)]">نقش فعال: <b>{unified.activeRole?.label}</b></p> : st.appMounted && <a href="/app/" className="mt-auto pt-4 text-[14px] font-bold text-[var(--pencil)] underline">← SS</a>}
          </div>
        </div>
      </nav>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b-2 border-[var(--rule)] bg-[color-mix(in_srgb,var(--paper)_92%,transparent)] px-4 py-2.5 backdrop-blur sm:px-8">
          <button type="button" onClick={() => go('desk')} className="text-[20px] font-black text-[var(--ink)] md:hidden">SS</button>
          <p className="truncate text-[15px] font-bold text-[var(--pencil)]">{TITLES[page]}<span className="hidden sm:inline"> · {jDate(new Date().toISOString())}</span></p>
          <div className="mr-auto flex items-center gap-2">
            {saveTxt && !st.offline && <span title={S.msg || (S.by ? `آخرین ذخیره: ${S.by}` : '')} className={`hidden rounded-full px-3 py-1 text-[13px] font-bold sm:inline ${S.state === 'error' || S.state === 'conflict' ? 'bg-[color-mix(in_srgb,var(--bad)_14%,transparent)] text-[var(--bad)]' : 'bg-[var(--wash)] text-[var(--ink-deep)]'}`}>{S.state === 'saved' ? '✓ ' : ''}{saveTxt}</span>}
            <div className="relative">
              <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} className="flex min-h-[38px] items-center gap-2 rounded-full border-2 border-[var(--rule)] bg-[var(--card)] pl-3 pr-1 text-[14px] font-bold">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--ink)] text-[13px] text-[var(--paper)]">{(me.name || 'م').slice(0, 1)}</span><span className="hidden max-w-[140px] truncate sm:inline">{me.name}</span><span className="hidden text-[12px] font-normal text-[var(--pencil)] lg:inline">{me.roleFa}</span></button>
              {menu && <div className="pop-in absolute left-0 top-[46px] z-30 w-60 rounded-[14px] bg-[var(--card)] p-2 shadow-[0_18px_40px_-14px_var(--shadow)] outline outline-1 outline-[var(--rule)]">
                <p className="px-3 py-1 text-[13px] text-[var(--pencil)]" dir="ltr">{me.email}</p>
                {[['account', 'حساب من و امنیت'], ['messages', 'پیام‌ها'], ['mail', 'ایمیل']].map(([k, t]) => <button key={k} type="button" onClick={() => go(k)} className="block w-full rounded-[8px] px-3 py-2 text-right text-[14px] hover:bg-[var(--wash)]">{t}</button>)}
                {unified?.roles.length > 1 && <button type="button" onClick={unified.switchRole} className="block w-full rounded-[8px] px-3 py-2 text-right text-[14px] hover:bg-[var(--wash)]">تغییر نقش</button>}
                {!st.offline && <><hr className="my-1 border-[var(--rule)]" /><button type="button" onClick={logout} className="block w-full rounded-[8px] px-3 py-2 text-right text-[14px] font-bold text-[var(--bad)] hover:bg-[var(--wash)]">خروج</button></>}
              </div>}
            </div>
          </div>
        </header>
        {st.offline && <p className="bg-[var(--amber)] px-4 py-2 text-[14px] font-bold text-white sm:px-8">سرور مرکز در دسترس نیست؛ حالت فایل (داده فقط در همین مرورگر). برای حالت کامل: node server/index.mjs</p>}
        {me.mustChange && <p className="bg-[var(--ink)] px-4 py-2 text-[14px] font-bold text-white sm:px-8">با رمز موقت وارد شده‌ای. <a href="#/account" className="underline">همین حالا رمزت را عوض کن</a>.</p>}
        {me.legacy && <p className="bg-[var(--ink)] px-4 py-2 text-[14px] font-bold text-white sm:px-8">حساب از نسخه ۲ آمده: <a href="#/account" className="underline">ایمیل واقعی‌ات را ثبت کن</a> تا بازیابی رمز با Gmail کار کند.</p>}
        {S.state === 'conflict' && <div className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-[12px] bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] p-3 text-[14px] sm:mx-8"><b>{S.by || 'یک مدیر دیگر'} همزمان داده مرکز را تغییر داده.</b><button type="button" className="font-bold underline" onClick={hub.reload}>بارگذاری نسخه جدید</button><button type="button" className="font-bold text-[var(--bad)] underline" onClick={hub.overwrite}>تغییرات من جایگزین شود</button></div>}
        <div className="mx-4 mt-3 flex gap-2 overflow-x-auto pb-1 md:hidden">{PAGES.filter(allowed).map(([k, t]) => <a key={k} href={`#/${k}`} className={`shrink-0 rounded-full border-2 px-3 py-1.5 text-[13px] font-bold ${page === k ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--rule)] bg-[var(--card)]'}`}>{t}</a>)}</div>
        <main key={page} className="page-in min-w-0 px-4 pb-28 pt-6 sm:px-8 md:pt-8" onClick={() => menu && setMenu(false)}>
          {!hub.h ? <p className="text-[16px] font-bold text-[var(--pencil)]">در حال بارگذاری داده مرکز…</p> : <>
            {page === 'desk' && <Desk {...P} />}
            {page === 'students' && <Students {...P} />}
            {page === 'messages' && <Messages {...P} />}
            {page === 'mail' && <Mail {...P} />}
            {page === 'team' && <Team {...P} />}
            {page === 'account' && <Account {...P} onOut={onOut} />}
            {page === 'settings' && <SettingsPage {...P} />}
            {page === 'audit' && <Audit {...P} />}
            {page === 'people12' && unified && <People12 unified={unified} />}
            {page === 'progress' && unified && <Progress />}
            {page === 'schedules' && unified && <Schedules unified={unified} />}
            {page === 'imports' && unified && <Imports />}
            {page === 'integrity' && unified && <Integrity />}
            {page === 'network' && unified && <Network />}
            {page === 'approvals' && unified && <Approvals />}
            {page === 'badges' && unified && <Badges />}
            {page === 'telegram' && (st.offline ? <p>ربات تلگرام فقط با سرور کار می‌کند.</p> : <Telegram />)}
            {HubPage && <>{!canWrite && <p className="mb-4 rounded-[10px] bg-[var(--wash)] p-3 text-[14px] font-bold">نقش «{me.roleFa}»: این بخش فقط خواندنی است.</p>}<HubPage h={hub.h} setH={hub.setH} /></>}
          </>}
        </main>
      </div>
    </div>
    {hub.h && <AdminAssistant {...P} />}
  </>;
}
