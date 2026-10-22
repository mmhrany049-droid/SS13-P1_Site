/*
 SS 12 — personal study cockpit, the /today surface of the single site (was the separate «student site» up to v11).
 12: bound to the unified login (no local PIN when a server session exists), five primary sections (Blueprint §5:
 امروز · مطالعه و تست · مرور · برنامه · آزمون) + «بیشتر», study sessions mirrored to the server through the offline queue.
 Older notes — Design spine unchanged since v4: the Ghalamchi-style answer sheet
 (پاسخ‌برگ) — crimson print ink on off-white paper, graphite pencil bubbles, timing marks on the sheet's edge.
 7.1: real-site shell (hash routes, top bar, account menu, login/lock, signup → onboarding → dashboard),
 «روزهای من», past-test answer entry, starred tests, personalised rewards, one-tap sync with the hub (مرکز v2).
*/
import { useEffect, useMemo, useRef, useState } from 'react';
import { load, save, settleRewards, daysFromTo, addDays, todayStr, syncMockExams } from '@ss/domain/store.js';
import { ensureFirstUser, users, currentUserId, isUnlocked, lockNow, ensureBoundUser } from '@ss/domain/profiles.js';
import * as Q from '../shell/outbox.js';
import Today from './Today.jsx';
import { needsOnboarding, secretOf } from './account.js';
import { habitPlacements, pacePlacements } from '@ss/domain/habits.js';
import { personalCandidates } from './rewards.js';
import { syncNow, mergeConcurrentState, siteConfig, hubError } from './sync/client.js';
import Network from './Network.jsx';
import Review from './Review.jsx';
import Planner from './Planner.jsx';
import Topics from './Topics.jsx';
import Settings from './Settings.jsx';
import History from './History.jsx';
import More, { MORE } from './More.jsx';
import Home from './Home.jsx';
import Practice from './Practice.jsx';
import Books from './Books.jsx';
import Analytics from './AnalyticsHub.jsx';
import Pace, { CheckinSheet, needsCheckin } from './Pace.jsx';
import { rollTo } from '@ss/domain/testPace.js';
import { applySchedule } from '@ss/domain/planning/scheduleLink.js';
import { call as apiCall } from '../shell/api.js';
import Exam from './Exam.jsx';
import Rewards from './Rewards.jsx';
import Assistant from './Assistant.jsx';
import Profile from './Profile.jsx';
import Days from './Days.jsx';
import Habits from './Habits.jsx';
import Login from './Auth.jsx';
import AssistantWidget from './AssistantWidget.jsx';
import Onboarding from './Onboarding.jsx';
import Keys from './Keys.jsx';
import Textbooks from './Textbooks.jsx';
import { setCatalogLayers } from '@ss/domain/curriculum.js';
import { fa, jDate } from '@ss/ui/ui.jsx';

// Blueprint §5: five primary sections + one door to everything else (tools used rarely live under «بیشتر» / assistant).
const NAV = [
  ['today', 'امروز', '◉'], ['practice', 'مطالعه و تست', '✎'], ['review', 'مرور', '↻'], ['planner', 'برنامه', '▦'], ['exam', 'آزمون‌ها', '◎'], ['more', 'بیشتر', '⋯'],
];
const MOBILE = ['today', 'practice', 'review', 'planner', 'exam', 'more'];
const TITLES = Object.fromEntries([...NAV.map(([k, t]) => [k, t]), ...MORE.map(([k, t]) => [k, t])]);
const UNDER_MORE = new Set(MORE.map(m => m[0]));
const PAGES = new Set([...NAV.map(n => n[0]), ...MORE.map(m => m[0])]);
const fromHash = () => { const h = (location.hash || '').replace(/^#\/?/, '').split('?')[0]; return h === 'home' ? 'today' : PAGES.has(h) ? h : 'today'; };

export const THEME = `.ss{--paper:#F6F1EA;--card:#FFFCF8;--ink:#B3184A;--ink-deep:#7E0F33;--ink-faint:#E3A9BA;--graphite:#26232B;--pencil:#57515B;--wash:#F3E3E8;--rule:#EBD3DA;--ok:#2F7D4F;--bad:#C2362B;--amber:#B9800F;font-family:Vazirmatn,"Vazir",Tahoma,system-ui,sans-serif;font-size:16px}
.ss input,.ss button,.ss select,.ss textarea{font-family:inherit}
.ss .mark{display:inline-block;width:10px;height:4px;border-radius:1px;background:var(--graphite);opacity:.75}
.rail{background:repeating-linear-gradient(to bottom,var(--graphite) 0 5px,transparent 5px 22px)}
@keyframes drift{0%{transform:translateY(0)}100%{transform:translateY(22px)}}
.rail-live{animation:drift 6s linear infinite}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.page-in{animation:rise .34s cubic-bezier(.2,.8,.2,1)}
.rise-in{animation:rise .38s cubic-bezier(.2,.8,.2,1) both}
@keyframes pop{0%{opacity:0;transform:scale(.96)}100%{opacity:1;transform:none}}
.pop-in{animation:pop .22s cubic-bezier(.2,.9,.3,1.2) both}
.stagger>*{animation:rise .36s cubic-bezier(.2,.8,.2,1) both}
.stagger>*:nth-child(2){animation-delay:.04s}.stagger>*:nth-child(3){animation-delay:.08s}.stagger>*:nth-child(4){animation-delay:.12s}.stagger>*:nth-child(5){animation-delay:.16s}.stagger>*:nth-child(n+6){animation-delay:.2s}
@keyframes shake{0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.shake{animation:shake .32s ease-in-out}
@keyframes cpop{0%{transform:scale(1.35);color:var(--ink)}100%{transform:none}}
.count-pop{animation:cpop .3s ease-out}
@keyframes stamp{0%{transform:scale(2.2) rotate(-12deg);opacity:0}60%{transform:scale(.92) rotate(3deg);opacity:1}100%{transform:none}}
.stamp{animation:stamp .5s cubic-bezier(.2,.8,.2,1) both}
.celebrate{animation:pop .4s cubic-bezier(.2,.9,.3,1.3) both}
.lift{transition:transform .2s,box-shadow .2s}.lift:hover{transform:translateY(-2px)}
.sheet-row{transition:background-color .18s}
.ss button[aria-pressed=true]{animation:pop .18s ease-out}
.step.is-on{box-shadow:0 0 0 4px var(--wash);transition:box-shadow .3s}
@media (prefers-reduced-motion:reduce){.rail-live,.page-in,.rise-in,.pop-in,.stagger>*,.shake,.count-pop,.stamp,.celebrate,.ss button[aria-pressed=true]{animation:none}}`;

export default function App({ unified = null, localDemo = false, serverReachable = false, onExitDemo }) {
  // unified login: the server session is the lock → bind one local profile to the account, no PIN screen
  const [bound] = useState(() => unified ? ensureBoundUser(unified.user.id, unified.user.name) : null);
  if (bound) return <Main key={bound} unified={unified} />;
  return <LocalApp localDemo={localDemo} serverReachable={serverReachable} onExitDemo={onExitDemo} />;
}
function LocalApp({ localDemo, serverReachable, onExitDemo }) {
  const [uid, setUid] = useState(() => { ensureFirstUser(); return currentUserId(); });
  const me = users().find(u => u.id === uid);
  const [unlocked, setUnlocked] = useState(() => !secretOf(me) || isUnlocked(uid));
  const [chooser, setChooser] = useState(false);
  if (chooser || !unlocked) return <Shell><Login current={uid} chooser={chooser} onDone={id => { setUid(id); setUnlocked(true); setChooser(false); }} /></Shell>;
  const lock = () => { lockNow(); setUnlocked(!secretOf(users().find(u => u.id === uid))); };
  return <Main key={uid} onSwitch={() => { lockNow(); setChooser(true); }} onLock={lock} localDemo={localDemo} serverReachable={serverReachable} onExitDemo={onExitDemo} />;
}
const Shell = ({ children }) => <div dir="rtl" lang="fa" className="ss min-h-screen bg-[var(--paper)] text-[var(--graphite)]"><style>{THEME}</style>{children}</div>;

function Main({ onSwitch, onLock, unified = null, localDemo = false, serverReachable = false, onExitDemo }) {
  const [s, setS] = useState(() => {
    let x = load(); if (!unified) return x;
    // the account lives on the server: name comes from it, the device is «connected» through the session cookie
    const u = unified.user; x = { ...x, me: { ...x.me, name: x.me?.name || u.name }, account: { ...x.account, unifiedUserId: u.id, email: x.account?.email || u.email || '', phone: x.account?.phone || u.phone || '',
      server: { url: location.origin, unified: true, hubName: unified.activeRole?.organizationName || 'SS', registeredAt: x.account?.server?.registeredAt || new Date().toISOString() },
      ...(!x.account?.onboarded && !(x.account?.step > 0) ? { step: 1 } : {}) } }; // the signup step (name/phone/PIN) is the unified login itself
    return x;
  });
  const [queue, setQueue] = useState({ pending: 0, rejected: 0, sent: 0 });
  const quid = unified?.user.id;
  const refreshQueue = async () => { if (!quid) return; const c = await Q.pendingCount(quid); setQueue(q => ({ ...q, ...c })); };
  const sRef = useRef(s); sRef.current = s;
  const pushQueue = async () => { if (!quid) return; try { await Q.enqueueNew(sRef.current, quid); const r = await Q.flush(quid); const c = await Q.pendingCount(quid); setQueue(q => ({ ...c, sent: q.sent + r.sent })); } catch { /* queue stays; retried on the next tick */ } };
  useEffect(() => { pushQueue(); }, [s.sessions]);
  useEffect(() => { if (!quid) return; const f = () => pushQueue(); addEventListener('online', f); const t = setInterval(f, 60e3); return () => { removeEventListener('online', f); clearInterval(t); }; }, [quid]);
  const [page, setPage] = useState(fromHash);
  const [menu, setMenu] = useState(false);
  const [sync, setSync] = useState({ busy: false, msg: '' });
  const [saveErr, setSaveErr] = useState(false);
  useEffect(() => { const okSave = save(s); setSaveErr(okSave === false); }, [s]);
  // v8: auto-lock after inactivity (only for accounts with a secret)
  useEffect(() => { const me = users().find(u => u.id === currentUserId()); const min = me?.autoLockMin ?? (secretOf(me) ? 15 : 0); if (!secretOf(me) || !min) return; let last = Date.now();
    const bump = () => { last = Date.now(); }; const ev = ['pointerdown', 'keydown', 'scroll', 'touchstart']; ev.forEach(e => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => { if (Date.now() - last > min * 6e4) onLock(); }, 15e3); return () => { clearInterval(t); ev.forEach(e => window.removeEventListener(e, bump)); }; }, []);
  useEffect(() => { const h = () => { setPage(fromHash()); window.scrollTo?.({ top: 0 }); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  // mock-exam rounds (activated series) → exams; habit tasks → drafts for the next 7 days
  useEffect(() => { const y = syncMockExams(s); const ds = daysFromTo(todayStr(), addDays(todayStr(), 6)); let z = y; for (const h of y.habits?.list || []) { const ps = habitPlacements(z, h, ds); if (ps.length) z = { ...z, placements: [...z.placements, ...ps] }; } const pp = pacePlacements(z, ds); if (pp.length) z = { ...z, placements: [...z.placements, ...pp] }; if (z.exams !== s.exams || z.placements !== s.placements) setS(z); }, [s.mockSeries, s.habits?.list, s.books, s.pace?.target, s.pace?.mode]);
  // v13: morning roll-over of the pace path (closes finished days, applies last night's decision) + the end-of-day check-in prompt
  useEffect(() => { if (!s.pace?.enabled) return; const z = rollTo(s, todayStr(), new Date()); if (z !== s) setS(z); }, [s.pace?.lastClosed, s.pace?.enabled, s.sessions.length]);
  // v13 network: the published class timetable of the student's organisation (read-only) is cached on the device
  useEffect(() => { if (!unified || localDemo) return; let off = false; apiCall('/api/schedule').then(r => { if (!off) setS(x => applySchedule(x, r?.items || [])); }).catch(() => { /* offline: the cached copy stays */ }); return () => { off = true; }; }, [unified?.user?.id, s.me?.grade, s.me?.stream]);
  const [checkin, setCheckin] = useState(false);
  useEffect(() => { setCheckin(needsCheckin(s, new Date())); }, [s.sessions.length, s.dailyChecks?.length, s.pace?.target]);
  // append-only reward ledger (F-09) + 7.1 personal candidates (habits, personal quests, weekly challenge, badges)
  useEffect(() => { const add = settleRewards(s, personalCandidates(s)); if (add.length) setS(p => ({ ...p, ledger: [...p.ledger, ...add] })); }, [s.sessions, s.errorTasks, s.reviews, s.placements, s.settings.rewards, s.habits, s.starred, s.exams]);
  // auto-sync with the hub once per opening (if registered online)
  const synced = useRef(false);
  const doSync = async (quiet = false) => {
    if (!s.account?.server?.url || sync.busy) return; setSync({ busy: true, msg: '' });
    const startState = sRef.current;
    try { const r = await syncNow(startState, { getLatestState: () => sRef.current }); setS(prev => mergeConcurrentState(startState, prev, r.state)); setSync({ busy: false, msg: r.log.join(' · ') }); }
    catch (x) { setSync({ busy: false, msg: quiet ? '' : hubError(x) }); setS(p => ({ ...p, hub: { ...(p.hub || {}), lastSyncError: hubError(x) } })); }
  };
  useEffect(() => { siteConfig(); if (!synced.current && s.settings.syncAuto !== false && s.account?.onboarded) { synced.current = true; doSync(true); } }, []);
  setCatalogLayers({ hub: s.catalogHub || {}, mine: s.tbCustom || {} }); // v9: layered textbook catalog
  const set = fn => setS(prev => fn(prev));
  const go = p0 => { const p = p0 === 'home' ? 'today' : p0; if (location.hash !== '#/' + p) location.hash = '/' + p; else setPage(p); setMenu(false); };
  const P = { s, set, go, reload: st => setS(st), doSync, sync, unified, queue, refreshQueue };
  const active = k => page === k || (k === 'more' && UNDER_MORE.has(page) && !NAV.some(n => n[0] === page));
  if (needsOnboarding(s)) return <Shell><Onboarding s={s} set={set} onDone={() => go('today')} /></Shell>;
  const unread = (s.announcements || []).filter(a => !a.read).length;
  return (
    <Shell>
      <div className="mx-auto flex max-w-[1440px]">
        <nav aria-label="بخش‌ها" className="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col py-6 pr-0 md:flex">
          <div className="relative flex h-full">
            <div className="relative w-[18px] overflow-hidden" aria-hidden><div className="rail rail-live absolute inset-x-[4px] -top-[22px] bottom-0 opacity-80" /></div>
            <div className="flex flex-1 flex-col overflow-y-auto pr-4">
              <button type="button" onClick={() => go('today')} className="mb-7 text-right text-[26px] font-black leading-none text-[var(--ink)]">SS<span className="block text-[14px] font-bold text-[var(--pencil)]">{unified ? unified.activeRole?.organizationName || 'سیستم مطالعه ۱۲' : 'سیستم مطالعه ۱۲'}</span></button>
              {NAV.map(([k, t, i]) => (
                <a key={k} href={`#/${k}`} aria-current={active(k) ? 'page' : undefined}
                  className={`group relative mb-1 flex min-h-[42px] items-center gap-3 rounded-l-[10px] pr-3 text-right text-[15px] font-bold transition ${active(k) ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--graphite)] hover:bg-[var(--wash)]'}`}>
                  <span className={`absolute -right-[22px] h-[14px] w-[14px] rounded-full border-2 ${active(k) ? 'border-[var(--ink)] bg-[var(--ink)]' : 'border-[var(--ink-faint)] bg-[var(--paper)]'}`} aria-hidden />
                  <span className="w-5 text-center opacity-80">{i}</span>{t}
                </a>))}
              <p className="mt-auto pt-4 text-[13px] leading-6 text-[var(--pencil)]">{localDemo ? 'حالت دموی محلی · فقط همین مرورگر' : s.demo ? 'داده نمونه' : unified ? `وارد شده: ${unified.user.email || unified.user.phone || ''}` : s.account?.server ? `وصل به ${s.hub?.hubName || 'مرکز'}` : 'فقط روی همین دستگاه'}</p>
            </div>
          </div>
        </nav>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b-2 border-[var(--rule)] bg-[color-mix(in_srgb,var(--paper)_92%,transparent)] px-4 py-2.5 backdrop-blur sm:px-8">
            <button type="button" onClick={() => go('today')} className="text-[20px] font-black text-[var(--ink)] md:hidden">SS</button>
            <p className="truncate text-[15px] font-bold text-[var(--pencil)]">{TITLES[page]}<span className="hidden sm:inline"> · {jDate(new Date().toISOString())}</span></p>
            <div className="mr-auto flex items-center gap-2">
              {s.account?.server && <button type="button" onClick={() => doSync(false)} disabled={sync.busy} title={sync.msg || s.hub?.lastSyncError || ''} className="flex min-h-[36px] items-center gap-2 rounded-full bg-[var(--wash)] px-3 text-[13px] font-bold text-[var(--ink-deep)] disabled:opacity-60"><span className={sync.busy ? 'animate-spin' : ''}>⟳</span>{sync.busy ? 'همگام‌سازی…' : s.hub?.lastSyncAt ? 'همگام' : 'همگام‌سازی'}</button>}
              {unread > 0 && <button type="button" onClick={() => go('network')} className="relative grid h-9 w-9 place-items-center rounded-full bg-[var(--wash)]" aria-label={`${unread} اطلاعیه`}>📣<span className="absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--ink)] px-1 text-[11px] font-bold text-[var(--paper)]">{fa(unread)}</span></button>}
              <div className="relative">
                <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} className="flex min-h-[38px] items-center gap-2 rounded-full border-2 border-[var(--rule)] bg-[var(--card)] pl-3 pr-1 text-[14px] font-bold">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--ink)] text-[13px] text-[var(--paper)]">{(s.me?.name || 'ک').slice(0, 1)}</span><span className="hidden max-w-[120px] truncate sm:inline">{s.me?.name || 'کاربر'}</span></button>
                {menu && <div className="absolute left-0 top-[46px] z-30 w-56 rounded-[14px] bg-[var(--card)] p-2 shadow-[0_18px_40px_-14px_rgba(60,20,35,.45)] outline outline-1 outline-[var(--rule)]">
                  {[['profile', 'نیمرخ من'], ['habits', 'عادت‌ها'], ['rewards', 'پاداش'], ['network', 'مرکز و همگام‌سازی'], ['settings', 'تنظیمات و حساب']].map(([k, t]) => <button key={k} type="button" onClick={() => go(k)} className="block w-full rounded-[8px] px-3 py-2 text-right text-[14px] hover:bg-[var(--wash)]">{t}</button>)}
                  <hr className="my-1 border-[var(--rule)]" />
                  {unified ? <>
                    {unified.roles.length > 1 && <button type="button" onClick={unified.switchRole} className="block w-full rounded-[8px] px-3 py-2 text-right text-[14px] hover:bg-[var(--wash)]">تغییر نقش</button>}
                    <button type="button" onClick={unified.logout} className="block w-full rounded-[8px] px-3 py-2 text-right text-[14px] font-bold text-[var(--bad)] hover:bg-[var(--wash)]">خروج از حساب</button>
                  </> : <>
                  <button type="button" onClick={onSwitch} className="block w-full rounded-[8px] px-3 py-2 text-right text-[14px] hover:bg-[var(--wash)]">تعویض کاربر</button>
                  {secretOf(users().find(u => u.id === currentUserId())) && <button type="button" onClick={onLock} className="block w-full rounded-[8px] px-3 py-2 text-right text-[14px] hover:bg-[var(--wash)]">قفل کردن 🔒</button>}
                  {localDemo && serverReachable && <button type="button" onClick={onExitDemo} className="block w-full rounded-[8px] px-3 py-2 text-right text-[14px] hover:bg-[var(--wash)]">ورود با حساب واقعی</button>}
                  </>}
                </div>}
              </div>
            </div>
          </header>
          {saveErr && <p role="alert" className="mx-4 mt-3 rounded-[10px] bg-[var(--bad)] px-3 py-2 text-[14px] font-bold text-[var(--paper)] sm:mx-8">حافظه مرورگر پر است و آخرین تغییرها ذخیره نشد. از «تنظیمات» پشتیبان بگیر و عکس‌ها یا داده نمونه را پاک کن.</p>}
          {localDemo && <p role="status" className="mx-4 mt-3 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px] font-bold text-[var(--ink-deep)] sm:mx-8">حالت دموی محلی: داده‌ها فقط در همین مرورگر می‌ماند و به هیچ سروری فرستاده نمی‌شود.</p>}
          {sync.msg && <p role="status" className="mx-4 mt-3 rounded-[10px] bg-[var(--wash)] px-3 py-2 text-[14px] sm:mx-8">{sync.msg}</p>}
          <main key={page} className="page-in min-w-0 px-4 pb-28 pt-6 sm:px-8 md:pb-12 md:pt-8" onClick={() => menu && setMenu(false)}>
            {page === 'today' && <Today {...P} />}
            {page === 'practice' && <Practice {...P} />}
            {page === 'books' && <Books {...P} />}
            {page === 'keys' && <Keys {...P} />}
            {page === 'textbooks' && <Textbooks {...P} />}
            {page === 'analytics' && <Analytics {...P} />}
            {page === 'exam' && <Exam {...P} />}
            {page === 'rewards' && <Rewards {...P} />}
            {page === 'assistant' && <Assistant {...P} />}
            {page === 'profile' && <Profile {...P} />}
            {page === 'review' && <Review {...P} />}
            {page === 'planner' && <Planner {...P} />}
            {page === 'days' && <Days {...P} />}
            {page === 'habits' && <Habits {...P} />}
            {page === 'pace' && <Pace {...P} />}
            {page === 'topics' && <Topics {...P} />}
            {page === 'settings' && <Settings {...P} onLock={onLock} />}
            {page === 'history' && <History {...P} />}
            {page === 'more' && <More {...P} />}
            {page === 'network' && <Network {...P} />}
          </main>
        </div>
      </div>
      {checkin && <CheckinSheet s={s} set={set} onClose={() => setCheckin(false)} />}
      {page !== 'assistant' && <AssistantWidget s={s} set={set} go={go} page={page} />}
      <nav aria-label="بخش‌ها (موبایل)" className="fixed inset-x-0 bottom-0 z-20 flex border-t-2 border-[var(--rule)] bg-[var(--card)] md:hidden">
        {NAV.filter(n => MOBILE.includes(n[0])).map(([k, t, i]) => <a key={k} href={`#/${k}`} aria-current={active(k) ? 'page' : undefined} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[12px] font-bold ${active(k) ? 'text-[var(--ink)]' : 'text-[var(--pencil)]'}`}><span className="text-[17px]">{i}</span>{k === 'practice' ? 'تست' : t}</a>)}
      </nav>
    </Shell>
  );
}
