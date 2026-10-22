// State, persistence and derived computations for the SS prototype.
import * as SC from './schedule.js';
import * as E from './engine.js';
import { SEEDS } from './seeds.js';
import * as BK from './book.js';
import { textbookById, subjectLabel, refSimilarity } from './curriculum.js';
import { storageKey, legacyKeys } from './profiles.js';
import { newPace, medianCounts, PACE_CONST } from './paceState.js';

export const DAY = 864e5;
export const uid = () => Math.random().toString(36).slice(2, 10);
/** Globally unique id for things that travel between users (books, packs, classes). */
export const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
export const todayStr = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

export const REASONS = [
  { id: 'unknown', fa: 'بلد نبودم', w: 5 }, { id: 'conceptual', fa: 'مفهومی', w: 4 }, { id: 'forgotFormula', fa: 'فرمول یادم رفت', w: 3.5 },
  { id: 'timeShortage', fa: 'کمبود وقت', w: 3 }, { id: 'calculation', fa: 'محاسبه', w: 2.5 }, { id: 'carelessness', fa: 'بی‌دقتی', w: 2 },
  { id: 'misread', fa: 'بد خواندن صورت', w: 2 }, { id: 'wrongGuess', fa: 'حدس غلط', w: 1.5 },
];

/** Build a test book from SSB text (meta #شماره‌گذاری: فصلی → per-chapter numbering; #سختی: 3 → levels 1–3). */
export function bookFromSSB(text, extra = {}) {
  const p = E.parseSSB(text); const m = p.meta; const now = new Date().toISOString();
  const tb = textbookById(extra.textbookId);
  let b = {
    id: extra.id || uid(), uid: extra.uid || uuid(), title: m['کتاب'] || extra.title || 'کتاب تست', publisher: m['ناشر'] || extra.publisher || '',
    subject: extra.subject || subjectLabel(m['درس'] || tb?.title || m['کتاب']), subjectId: extra.subjectId || tb?.subjectId || null,
    grade: extra.grade || +E.normalizeDigits(m['پایه'] || '') || tb?.grade || null, stream: extra.stream || (/تجربی/.test(m['رشته'] || '') ? 'tj' : 'rf'),
    textbookId: extra.textbookId || null, numbering: /فصل/.test(m['شماره‌گذاری'] || '') ? 'perChapter' : 'global', levels: /[3۳]/.test(m['سختی'] || '') ? 3 : 0,
    active: extra.active ?? true, origin: extra.origin || 'user', color: extra.color || null,
    nodes: p.nodes.map(n => ({ ...n, qStart: null, qEnd: null })), keys: {}, createdAt: now, updatedAt: now,
  };
  b = BK.ensureScopeNos(b); if (tb) b = BK.autoRefs(b, tb);
  return { book: b, errors: p.errors };
}
const SEED_DEFS = [
  { id: 'calc', subject: 'حسابان', subjectId: 'riazi', textbookId: 'tb.11.hesaban1', color: '#7A3B8F' },
  { id: 'phys', subject: 'فیزیک', subjectId: 'fizik', textbookId: 'tb.11.fizik2.rf', color: '#1F5F8B' },
  { id: 'chem', subject: 'شیمی', subjectId: 'shimi', textbookId: 'tb.11.shimi2', color: '#2F7D4F' },
];
function buildBooks() {
  return SEED_DEFS.map(d => bookFromSSB(SEEDS[d.id], { ...d, uid: 'seed-' + d.id, origin: 'seed', grade: 11, stream: 'rf' }).book);
}

export const DATA_VERSION = 10; // v10 (SS 10): capacity engine, assessment schedule, approximate history, book files
const { KEY, DEMO_KEY, MODE_KEY, V3_KEY } = legacyKeys;
export const DEFAULT_SETTINGS = { weekdayMin: 240, weekendMin: 360, sleepH: 8, sessionLen: 50, rewards: true, coins: true, fsrs: '4.5', backupAt: null, name: '', reviewLimit: 40, reviewNewLimit: 20,
  offDays: [4, 5], planWeeks: 4, syncUrl: '',
  // v7: per-weekday study windows (null = old minute caps), study sessions 60–120 min with breaks
  studyWindows: null, sessionMin: 60, sessionMax: 120, breakMin: 15,
  // 7.1: «روزهای من» (per weekday + per date). null → built from the caps above on load.
  dayPlan: null, syncAuto: true,
  // v13: end-of-day check-in hour (pace), review mode (set of 20 vs one card), review-set size
  checkinHour: '21:30', reviewMode: 'set', reviewSetSize: 20 }; // offDays: getDay() numbers (4 = پنج‌شنبه، 5 = جمعه) = catch-up days, no new planning

export function initialState() {
  return {
    dataVersion: DATA_VERSION, books: buildBooks(), taught: {}, sessions: [], errorTasks: [], exams: [],
    shop: [
      { id: 's1', title: '۳۰ دقیقه بازی', emoji: '🎮', price: 90 }, { id: 's2', title: 'یک قسمت سریال', emoji: '🎬', price: 120 },
      { id: 's3', title: 'بیرون رفتن با دوستان', emoji: '🚶', price: 400 }, { id: 's4', title: 'خرید کوچک', emoji: '🛍️', price: 600 },
    ],
    redemptions: [], swaps: {}, profile: { ipip: null }, settings: { ...DEFAULT_SETTINGS, dayPlan: SC.defaultDayPlan(DEFAULT_SETTINGS) }, demo: false,
    ledger: [], reviews: {}, placements: [], historyBatches: [], checkins: [], dayRelief: {},
    // v6: identity for the hub network, schools/classes, comparison data and notices from the hub
    me: { id: uuid(), name: '', grade: 11, stream: 'rf', schoolId: null, classIds: [], consent: { books: true, results: false, compare: false } },
    org: { schools: [], classes: [] }, compare: null, announcements: [], hub: { bulletins: [], lastPackAt: null },
    // v7: fixed/personal events, mock-exam series (شبه‌کنکور), habit system
    events: [], mockSeries: [], habits: { list: [], answers: {}, quizAt: null, checks: [] },
    // 7.1: account (signup + onboarding), starred «good» questions, personal reward profile
    account: { phone: '', registeredAt: null, onboarded: false, step: 0, pinHash: null, server: null },
    profileCheckins: [],
    starred: {}, rewardProfile: { motivators: [], leisurePerDay: 60, ratio: 3, goal: null, limits: {} },
    // v9: answer-key entry (its own system, like test entry), my textbooks + my catalog additions, academic dossier
    keyDraft: null, keyLog: [], myTextbooks: null, tbCustom: {}, catalogHub: {}, edu: { ...EDU_DEFAULT },
    // v10: «موتور توان» (applied capacity + history), questionnaire schedule (student decides when), first-use date, book-file inbox
    capacity: { mode: 'suggest', applied: null, history: [], manualWeek: null }, assess: { plan: {}, cadence: 'auto' }, startedAt: new Date().toISOString().slice(0, 10), bookInbox: [],
    // v13: test pace path (+ end-of-day / weekly check-ins), review sets of 20, redo plans, analysis centre
    classSchedule: null, // v13: published class timetable fetched from the server (read-only link to the planner)
    pace: null, dailyChecks: [], weeklyChecks: [], reviewSet: null, reviewSets: [], lastReviewSet: null,
    redo: { plans: [], history: [], max: 3 }, focus: {}, analysis: { goals: {}, views: [], reports: [], prefs: { lowPc: 0.45, veryLowPc: 0.35, minConf: 0.4 } },
  };
}
/** v9 «پرونده تحصیلی»: everything a study center needs to register, follow and plan with a student. */
export const EDU_DEFAULT = { school: '', city: '', province: '', gpa: '', gpaLast: '', konkurYear: '', targetMajor: '', targetUni: '', targetRank: '', institute: '', advisor: '', advisorPhone: '', parentName: '', parentPhone: '',
  mockProviders: [], planningStyle: '', planner: '', studyTime: '', dailyGoalH: '', commitment: 0, pledges: [], strengths: '', weaknesses: '', notes: '', updatedAt: null };
export const PLANNING_STYLES = { daily: 'روزانه، هر شب برای فردا', weekly: 'هفتگی، یک‌جا برای کل هفته', advisor: 'مشاور برایم می‌چیند', app: 'برنامه‌ریز همین اپ', flexible: 'منعطف، بدون برنامه ثابت' };
export const STUDY_TIMES = { morning: 'صبح‌ها', noon: 'بعدازظهر', night: 'شب‌ها', late: 'دیروقت شب', mixed: 'فرقی نمی‌کند' };
export const PLEDGES = [
  ['log', 'هر روز تست‌ها و کارهایم را ثبت می‌کنم'], ['plan', 'برنامه هفتگی را تأیید و طبقش جلو می‌روم'], ['review', 'مرورهای روزانه را عقب نمی‌اندازم'],
  ['errors', 'تحلیل خطای هر جلسه را همان روز انجام می‌دهم'], ['mock', 'در همه آزمون‌های آزمایشی شرکت می‌کنم'], ['sleep', 'خوابم را کمتر از حداقل نمی‌کنم'], ['phone', 'موقع مطالعه گوشی را کنار می‌گذارم'],
];

/** Migrations by dataVersion (hard rule 11, F-06). Never drops data. */
export const MIGRATIONS = {
  3: x => {
    const taught = {};
    for (const [b, m] of Object.entries(x.taught || {})) { taught[b] = {}; for (const [n, v] of Object.entries(m)) if (v) taught[b][n] = typeof v === 'object' ? v : { state: 'taught', at: null }; }
    const { dailyMin, ...rest } = x.settings || {};
    const exams = (x.exams || []).map(({ plan, planApproved, ...e }) => e);
    const placements = (x.exams || []).filter(e => e.planApproved && e.plan).flatMap(e => e.plan.flatMap(d => d.items.map(it => ({ id: uid(), date: d.date, title: it.title, minutes: it.minutes, kind: it.kind, subject: it.subject, reason: 'از برنامه آمادگی قبلی', status: 'approved', source: 'exam:' + e.id }))));
    const { v, ...keep } = x;
    return { ...initialState(), ...keep, taught, exams, placements, settings: { ...DEFAULT_SETTINGS, ...rest }, dataVersion: 4 };
  },
  4: x => ({
    ...x, dataVersion: 5, dayRelief: x.dayRelief || {},
    exams: (x.exams || []).map(e => ({ kind: 'upcoming', sittings: e.actual != null ? [{ id: uid(), date: e.date, sections: [], percent: e.actual }] : [], ...e })),
    placements: (x.placements || []).map((p, i) => ({ order: i, ...p })),
  }),
  5: x => {
    const base = initialState();
    const books = (x.books || []).map(b => {
      const d = SEED_DEFS.find(z => z.id === b.id); const seedNew = d ? bookFromSSB(SEEDS[d.id], { ...d, uid: 'seed-' + d.id, origin: 'seed', grade: 11, stream: 'rf' }).book : null;
      const hasRanges = b.nodes.some(n => n.qStart != null);
      let nb = { uid: d ? 'seed-' + d.id : uuid(), subjectId: d?.subjectId ?? null, textbookId: d?.textbookId ?? null, grade: 11, stream: 'rf', active: true, origin: d ? 'seed' : 'user', levels: seedNew?.levels ?? 0, ...b,
        // never silently re-interpret saved numbers: books with saved ranges keep global numbering + a hint
        numbering: b.numbering || (hasRanges ? 'global' : seedNew?.numbering || 'global'), numberingHint: !b.numbering && hasRanges && seedNew?.numbering === 'perChapter' ? 'perChapter' : undefined };
      nb = BK.ensureScopeNos(nb); const tb = textbookById(nb.textbookId); if (tb) nb = BK.autoRefs(nb, tb);
      return nb;
    });
    return { ...base, ...x, books, dataVersion: 6, me: { ...base.me, name: x.settings?.name || '', ...(x.me || {}) }, org: x.org || base.org, compare: x.compare ?? null, announcements: x.announcements || [], hub: x.hub || base.hub };
  },
};
MIGRATIONS[6] = x => {
  const base = initialState(); const hasData = (x.sessions || []).length > 0 || (x.exams || []).length > 0;
  return { ...x, dataVersion: 7, events: x.events || [], mockSeries: (x.mockSeries || []).map(m => ({ active: true, ...m })), habits: { ...base.habits, ...(x.habits || {}) },
    starred: x.starred || {}, rewardProfile: { ...base.rewardProfile, ...(x.rewardProfile || {}) },
    account: { ...base.account, ...(x.account || {}), phone: x.account?.phone || x.me?.phone || '', legacyData: hasData },
    settings: { ...DEFAULT_SETTINGS, ...(x.settings || {}), dayPlan: x.settings?.dayPlan || SC.defaultDayPlan(x.settings || {}) } };
};
MIGRATIONS[7] = x => ({ ...x, dataVersion: 8, books: (x.books || []).map(b => BK.deriveSpans(b)), keyDraft: null, keyLog: x.keyLog || [], myTextbooks: x.myTextbooks ?? null, tbCustom: x.tbCustom || {}, catalogHub: x.catalogHub || {},
  edu: { ...EDU_DEFAULT, school: x.me?.schoolName || '', ...(x.edu || {}) } });
MIGRATIONS[8] = x => {
  const first = [x.account?.registeredAt, ...(x.sessions || []).filter(z => !z.legacy && !z.historical).map(z => z.at)].filter(Boolean).map(v => String(v).slice(0, 10)).sort()[0];
  // keep every past questionnaire result as the first entry of its history (re-tests are compared with it)
  const inst = Object.fromEntries(Object.entries(x.profile?.instruments || {}).map(([k, v]) => [k, { ...v, history: v.history || [{ at: v.at, scores: v.scores }] }]));
  return { ...x, dataVersion: 9, capacity: x.capacity || { mode: 'suggest', applied: null, history: [], manualWeek: null }, assess: x.assess || { plan: {}, cadence: 'auto' },
    startedAt: x.startedAt || first || new Date().toISOString().slice(0, 10), bookInbox: x.bookInbox || [], profile: { ...(x.profile || {}), instruments: inst } };
};
MIGRATIONS[9] = x => {
  // v13: the «daily-tests» habit (fixed ladder) is replaced by the pace path. Other habits and their logs stay untouched.
  const base = initialState(); const habits = { ...base.habits, ...(x.habits || {}) }; const list = habits.list || [];
  const old = list.find(h => h.templateId === 'daily-tests');
  const placements = (x.placements || []).filter(p => !(old && p.habitId === old.id && p.status === 'draft'));
  let pace = x.pace ?? null;
  if (!pace && old) {
    const byDay = {}; for (const z of x.sessions || []) { if (z.legacy || z.historical || !z.at) continue; const d = todayStr(new Date(z.at)); byDay[d] = (byDay[d] || 0) + Object.keys(z.answers || {}).length; }
    const med = medianCounts(Object.keys(byDay).sort().map(d => byDay[d]));
    pace = newPace({ startedAt: todayStr(), start: med ?? PACE_CONST.START_DEFAULT, mode: med != null ? 'normal' : 'calibrate', calibDaysLeft: med != null ? 0 : PACE_CONST.CALIB_DAYS });
  }
  return { ...x, dataVersion: 10, habits: { ...habits, list: list.filter(h => h.templateId !== 'daily-tests') }, placements, pace,
    dailyChecks: x.dailyChecks || [], weeklyChecks: x.weeklyChecks || [], reviewSet: x.reviewSet ?? null, reviewSets: x.reviewSets || [], lastReviewSet: x.lastReviewSet ?? null,
    redo: x.redo || base.redo, focus: x.focus || {}, analysis: { ...base.analysis, ...(x.analysis || {}) },
    settings: { ...DEFAULT_SETTINGS, ...(x.settings || {}) } };
};
export function migrate(x) {
  if (!x) return null; let cur = x; let ver = cur.dataVersion ?? cur.v ?? 3;
  while (ver < DATA_VERSION) { const m = MIGRATIONS[ver]; if (!m) break; cur = m(cur); ver = cur.dataVersion; }
  const settings = { ...DEFAULT_SETTINGS, ...(cur.settings || {}) }; if (!settings.dayPlan) settings.dayPlan = SC.defaultDayPlan(settings);
  const base = initialState();
  return { ...base, ...cur, settings, account: { ...base.account, ...(cur.account || {}) }, rewardProfile: { ...base.rewardProfile, ...(cur.rewardProfile || {}) }, starred: cur.starred || {}, edu: { ...EDU_DEFAULT, ...(cur.edu || {}) }, tbCustom: cur.tbCustom || {}, catalogHub: cur.catalogHub || {} };
}
const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
export function loadReal() {
  const k = storageKey(); const mine = read(k); if (mine) return migrate(mine);
  if (k !== KEY) return initialState(); // a newly added user starts empty (never sees the first user's data)
  const v4 = read(KEY); if (v4) return migrate(v4);
  const v3 = read(V3_KEY); if (v3 && !v3.demo) { const m = migrate(v3); save(m); return m; }
  return initialState();
}
export function loadDemo() { const d = read(DEMO_KEY); return d ? migrate({ ...d, demo: true }) : withDemo(); }
export function load() { let mode = 'real'; try { mode = localStorage.getItem(MODE_KEY) || 'real'; } catch { /* */ } return mode === 'demo' ? loadDemo() : loadReal(); }
export function setMode(mode) { try { localStorage.setItem(MODE_KEY, mode); } catch { /* */ } return mode === 'demo' ? loadDemo() : loadReal(); }
/** v8: returns false when the browser refused (storage full) so the app can warn instead of losing data silently. */
export function save(s) { try { localStorage.setItem(s.demo ? DEMO_KEY : storageKey(), JSON.stringify(s)); return true; } catch { return false; } }
export function resetDemo() { try { localStorage.removeItem(DEMO_KEY); } catch { /* */ } return withDemo(); }

// ---------- local dates (F-16): never Date.parse('YYYY-MM-DD') ----------
export function parseLocal(d) { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, dd).getTime(); }
export const addDays = (dateStr, n) => todayStr(new Date(parseLocal(dateStr) + n * DAY + 3 * 36e5));
export const daysBetween = (a, b) => Math.round((parseLocal(b) - parseLocal(a)) / DAY);
export const isWeekend = dateStr => new Date(parseLocal(dateStr)).getDay() === 5; // Friday
/** v6: Thursday + Friday (settings.offDays) are catch-up days: no new planning, used for unfinished work or working ahead. */
/** 7.1: a day is «off» for NEW planning when it is a catch-up day or a day off in «روزهای من». */
export const isOffDay = (s, dateStr) => s.settings.dayPlan ? SC.dayCfg(s, dateStr).mode !== 'normal' : (s.settings.offDays ?? [4, 5]).includes(new Date(parseLocal(dateStr)).getDay());
export const isRestDay = (s, dateStr) => !!s.settings.dayPlan && SC.dayCfg(s, dateStr).mode === 'off';
const legacyCap = (s, dateStr) => isOffDay(s, dateStr) || isWeekend(dateStr) ? s.settings.weekendMin : s.settings.weekdayMin;
/** v7: with study windows the cap = minutes of usable 60–120 min sessions left after events; otherwise the old caps. */
export const baseCap = (s, dateStr) => s.settings.dayPlan ? SC.studyMinutes(s, dateStr) : legacyCap(s, dateStr);
/** Friday that ends the (Saturday-first) week containing dateStr. */
export const weekEnd = (dateStr = todayStr()) => addDays(dateStr, (5 - new Date(parseLocal(dateStr)).getDay() + 7) % 7);
export const daysFromTo = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; };
/** Capacity for NEW planned work (0 on catch-up days). */
export const planCap = (s, dateStr) => isOffDay(s, dateStr) ? 0 : capFor(s, dateStr);
/** Cap after the user's «take this day easier» relief (1 = normal). */
/** v10: «موتور توان» multiplier for one date (1 = normal); written by capacity.applyCapacity / manualWeek. */
export function capacityFactor(s, d) {
  const a = s.capacity?.applied; if (!a || s.capacity?.mode === 'off' || d < a.from || d > a.to) return 1;
  return a.days?.[d] ?? a.week ?? 1;
}
/** Combined limit for a day: my manual «سبک‌تر گرفتن» × the capacity engine (both 1 = a normal day). */
export const testsCapOf = (s, d) => {
  const p = s.pace; // v13 priority: pace path > capacity engine > nothing
  if (p?.enabled) {
    if (p.mode === 'freeze' && p.freeze && d >= p.freeze.from && d <= p.freeze.to) return 0;
    if (!(p.weekdays || [6, 0, 1, 2, 3]).includes(new Date(parseLocal(d)).getDay())) return null; // catch-up days: no new tests planned
    const nt = p.nextTarget; return Math.round(nt && nt.for <= d && d > (p.asOf || '') ? nt.value : p.target);
  }
  const a = s.capacity?.applied; if (!a || s.capacity?.mode === 'off' || !a.testsPerDay || d < a.from || d > a.to) return null; return Math.round(a.testsPerDay * ((a.days?.[d] ?? a.week ?? 1) / (a.week || 1))); };
export const dayLimit = (s, dateStr) => (s.dayRelief?.[dateStr] ?? 1) * capacityFactor(s, dateStr);
export const capFor = (s, dateStr) => Math.round(baseCap(s, dateStr) * dayLimit(s, dateStr));
/** Saturday that starts the week containing dateStr. */
export function weekStart(dateStr = todayStr()) { const wd = new Date(parseLocal(dateStr)).getDay(); return addDays(dateStr, -((wd + 1) % 7)); }
export function isTaught(s, bId, nId) {
  const b = s.books.find(x => x.id === bId);
  let node = b?.nodes.find(x => x.id === nId);
  while (node) {
    if (s.taught?.[bId]?.[node.id]) return true;
    node = node.parentId ? b.nodes.find(x => x.id === node.parentId) : null;
  }
  return false;
}

// ---------- book helpers ----------
export const bookById = (s, id) => s.books.find(b => b.id === id);
export const leaves = b => b.nodes.filter(n => n.isLeaf && n.kind !== 'theory');
export function nodePath(b, n) {
  const out = []; let cur = n;
  while (cur) { out.unshift(cur.title); cur = b.nodes.find(x => x.id === cur.parentId); }
  return out;
}
export function label(b, n) {
  if (!n) return '';
  const fd = t => t.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  if (/^(پرسش‌ها|درس‌نامه)$/.test(n.title)) { const p = b.nodes.find(x => x.id === n.parentId); return fd(p ? p.title : n.title); }
  return fd(n.title);
}
export function chapterOf(b, n) { let cur = n; while (cur && cur.parentId) cur = b.nodes.find(x => x.id === cur.parentId); return cur; }
export function nodeForNumber(b, num) { return leaves(b).find(n => n.qStart != null && num >= n.qStart && num <= n.qEnd) || null; }
export function rangeOverlap(b, nodeId, from, to) {
  return leaves(b).find(n => n.id !== nodeId && n.qStart != null && !(to < n.qStart || from > n.qEnd)) || null;
}

// ---------- attempts (derived from sessions; raw truth = sessions) ----------
export function attemptsOf(s) {
  const out = []; const seen = {};
  const sorted = [...s.sessions].sort((a, b) => a.at.localeCompare(b.at));
  for (const ses of sorted) {
    const b = bookById(s, ses.bookId); if (!b) continue;
    if (ses.legacy) { // history import L1: counts only, weight 0.3 (spec 33)
      let i = 0; for (const r of ['C', 'W', 'B']) for (let k = 0; k < (ses.counts?.[r] || 0); k++) out.push({ ref: `${ses.id}:${i++}`, num: null, bookId: b.id, subject: b.subject, nodeId: ses.nodeId, sessionId: ses.id, at: ses.at, chosen: null, result: r, isGuess: false, reasons: [], isLegacy: true, repeatWithin24h: false, mixed: false });
      continue;
    }
    for (const [numS, chosen] of Object.entries(ses.answers)) {
      const num = +numS, ref = `${b.id}:${num}`;
      const node = nodeForNumber(b, num) || b.nodes.find(n => n.id === ses.nodeId);
      const result = E.correct(chosen, b.keys[num] ?? null);
      const prev = seen[ref]; seen[ref] = ses.at;
      const level = BK.levelOf(b, node, num), examLike = BK.isExamLike(node);
      out.push({
        ref, num, bookId: b.id, subject: b.subject, nodeId: node?.id, sessionId: ses.id, at: ses.at, chosen, result, level, examLike, w: (BK.LEVEL_W[level] ?? 1) * (ses.historical ? 0.8 : 1), historical: !!ses.historical, starred: !!s.starred?.[ref],
        isGuess: !!ses.guesses?.[num], reasons: ses.reasons?.[num] || [],
        repeatWithin24h: ses.origin === 'repeat' || (prev ? (Date.parse(ses.at) - Date.parse(prev)) < DAY : false), mixed: ses.mixed, origin: ses.origin || 'new',
      });
    }
  }
  // Exam results (L3): only the latest sitting feeds analysis; allocate aggregate
  // counts by the current ranges of the linked test-book topics.
  for (const ex of s.exams || []) {
    const sit = latestSitting(ex); if (!sit) continue;
    for (const sec of sit.sections || []) {
      const bp = ex.sections.find(x => x.bookId === sec.bookId); const b = bookById(s, sec.bookId); if (!bp || !b || !bp.nodeIds.length) continue;
      const nodes = BK.topicLeavesForSelection(b, bp.nodeIds).map(id => b.nodes.find(n => n.id === id));
      if (!nodes.length) continue;
      const weights = nodes.map(n => BK.questionCountForNode(b, n).count ?? 10);
      const allocate = count => {
        const total = weights.reduce((a, x) => a + x, 0);
        const raw = weights.map(w => total ? count * w / total : count / weights.length);
        const values = raw.map(Math.floor); let left = count - values.reduce((a, x) => a + x, 0);
        raw.map((x, i) => [x - Math.floor(x), i]).sort((a, z) => z[0] - a[0]).slice(0, left).forEach(([, i]) => values[i]++);
        return values;
      };
      const allocated = Object.fromEntries(['C', 'W', 'B'].map(r => [r, allocate(sec[r] || 0)]));
      let attemptNo = 0;
      for (let i = 0; i < nodes.length; i++) {
        for (const r of ['C', 'W', 'B']) {
          for (let k = 0; k < allocated[r][i]; k++) out.push({
            ref: `ex:${ex.id}:${sec.bookId}:${attemptNo++}`, num: null, bookId: b.id, subject: b.subject, nodeId: nodes[i].id,
            sessionId: null, examId: ex.id, at: new Date(parseLocal(sit.date) + 12 * 36e5).toISOString(),
            chosen: null, result: r, isGuess: false, reasons: [], isLegacy: true, repeatWithin24h: false, mixed: true,
            rangeSource: BK.questionCountForNode(b, nodes[i]).source,
          });
        }
      }
    }
  }
  return out;
}
/**
 * Question-level coverage for a test book, optionally scoped to exam-selected topics.
 * Unique question numbers are counted once; repeats do not inflate progress.
 * Aggregate exam scores are deliberately reported separately because they have no
 * question-number map and cannot prove which exact questions were attempted.
 */
export function questionCoverage(s, bookId, { nodeIds = null } = {}) {
  const b = bookById(s, bookId);
  if (!b) return { ok: false, reason: 'book-not-found', exact: false, totalQuestions: null };
  const topicIds = BK.topicLeavesForSelection(b, nodeIds || leaves(b).filter(n => n.kind === 'topic').map(n => n.id));
  const topicSet = new Set(topicIds);
  const topicNodes = topicIds.map(id => b.nodes.find(n => n.id === id)).filter(Boolean);
  const buildCoverage = ids => {
    const selected = new Set(ids);
    const selectedLeaves = topicNodes.filter(n => selected.has(n.id));
    const intervals = selectedLeaves.filter(n => n.qStart != null).map(n => [n.qStart, n.qEnd]);
    const spanCovered = new Set();
    for (const parent of b.nodes.filter(n => n.span)) {
      const desc = b.nodes.filter(n => n.isLeaf && n.kind === 'topic' && BK.isDescendant(b, n, parent));
      if (desc.length && desc.every(n => selected.has(n.id))) {
        intervals.push([parent.span.from, parent.span.to]);
        for (const n of desc) spanCovered.add(n.id);
      }
    }
    const unknownIds = selectedLeaves.filter(n => n.qStart == null && !spanCovered.has(n.id)).map(n => n.id);
    intervals.sort((a, z) => a[0] - z[0] || a[1] - z[1]);
    const merged = [];
    for (const [from, to] of intervals) {
      const last = merged.at(-1);
      if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
      else merged.push([from, to]);
    }
    const total = merged.reduce((sum, [from, to]) => sum + Math.max(0, to - from + 1), 0);
    const includes = question => merged.some(([from, to]) => question >= from && question <= to);
    return { intervals: merged, total, exact: unknownIds.length === 0, unknownIds, includes };
  };
  const available = buildCoverage(topicIds);
  const taughtIds = topicNodes.filter(n => isTaught(s, b.id, n.id)).map(n => n.id);
  const taught = buildCoverage(taughtIds);
  const latest = new Map();
  for (const ses of [...(s.sessions || [])].filter(x => x.bookId === b.id && !x.legacy).sort((a, z) => String(a.at || '').localeCompare(String(z.at || '')) || String(a.id).localeCompare(String(z.id)))) {
    for (const [key, chosen] of Object.entries(ses.answers || {})) {
      const question = Number(key);
      if (Number.isSafeInteger(question) && question > 0 && available.includes(question)) latest.set(question, { chosen: Number(chosen) || 0, at: ses.at || '' });
    }
  }
  const recordedQuestions = latest.size;
  let answeredQuestions = 0, blankQuestions = 0, correctQuestions = 0, wrongQuestions = 0, missingKeyQuestions = 0;
  for (const [question, answer] of latest) {
    if (answer.chosen > 0) {
      answeredQuestions++;
      if (b.keys?.[question] == null) missingKeyQuestions++;
      else if (answer.chosen === b.keys[question]) correctQuestions++;
      else wrongQuestions++;
    } else blankQuestions++;
  }
  let unlocatedExamResultQuestions = 0;
  for (const exam of s.exams || []) {
    const sitting = latestSitting(exam);
    if (!sitting) continue;
    for (const result of sitting.sections || []) if (result.bookId === b.id) {
      unlocatedExamResultQuestions += (result.C || 0) + (result.W || 0) + (result.B || 0);
    }
  }
  return {
    ok: true, bookId, bookTitle: b.title, selectedTopics: topicIds.length,
    exact: available.exact, totalQuestions: available.exact ? available.total : null,
    knownQuestions: available.total, unknownTopicIds: available.unknownIds,
    taughtExact: taught.exact, taughtQuestions: taught.exact ? taught.total : null,
    untaughtQuestions: available.exact && taught.exact ? Math.max(0, available.total - taught.total) : null,
    recordedQuestions, answeredQuestions, blankQuestions,
    notAttemptedQuestions: available.exact ? Math.max(0, available.total - recordedQuestions) : null,
    notAnsweredQuestions: available.exact ? Math.max(0, available.total - answeredQuestions) : null,
    correctQuestions, wrongQuestions, missingKeyQuestions, unlocatedExamResultQuestions,
  };
}
export function sessionStats(s, ses) {
  const b = bookById(s, ses.bookId);
  if (ses.legacy) { const c = ses.counts || {}; const C = c.C || 0, W = c.W || 0, B = c.B || 0; return { C, W, B, U: 0, N: C + W + B, P: E.percent(C, W, C + W + B) }; }
  return E.stats(Object.entries(ses.answers).map(([n, c]) => E.correct(c, b.keys[+n] ?? null)));
}

// ---------- mastery per topic ----------
export function topicMastery(s, atts, now = Date.now()) {
  const bySubject = {}, byNode = {};
  for (const a of atts) { (bySubject[a.subject] ||= []).push(a); if (a.nodeId) (byNode[`${a.bookId}|${a.nodeId}`] ||= []).push(a); }
  const subjPrior = {};
  for (const [sub, arr] of Object.entries(bySubject)) {
    const c = arr.filter(a => a.result !== 'U');
    if (c.length < 20) subjPrior[sub] = [0.4, 0.3, 0.3];
    else { const n = c.length; subjPrior[sub] = ['C', 'W', 'B'].map(r => Math.max(0.05, c.filter(a => a.result === r).length / n)); const t = subjPrior[sub].reduce((x, y) => x + y); subjPrior[sub] = subjPrior[sub].map(x => x / t); }
  }
  // v6 (spec 31 TB-5): exam-like questions (checkup/جامع/مخلوط/آزمون فصل) are attributed to the topics they COVER,
  // probabilistically: P(topic | result) ∝ share × P(result | blocked mastery), at 0.7 weight (transfer context).
  const blocked = {};
  for (const [key, arr] of Object.entries(byNode)) { if (arr.every(a => a.examLike)) continue; const v = arr.filter(a => !a.examLike && a.result !== 'U'); blocked[key] = v.length ? v.filter(a => a.result === 'C').length / v.length : null; }
  for (const key of Object.keys(byNode)) {
    const arr = byNode[key]; const ex = arr.filter(a => a.examLike); if (!ex.length) continue;
    const b = bookById(s, ex[0].bookId); const node = b?.nodes.find(n => n.id === ex[0].nodeId); const cov = b && node ? BK.coversOf(b, node) : [];
    byNode[key] = arr.filter(a => !a.examLike); if (!byNode[key].length) delete byNode[key];
    if (!cov.length) continue;
    const size = id => { const n = b.nodes.find(x => x.id === id); return n?.qStart != null ? n.qEnd - n.qStart + 1 : 10; };
    const tot = cov.reduce((x, id) => x + size(id), 0);
    for (const a of ex) {
      if (a.result === 'U') continue;
      const lik = cov.map(id => { const p = blocked[`${b.id}|${id}`] ?? 0.4; return (size(id) / tot) * (a.result === 'C' ? Math.max(0.05, p) : Math.max(0.05, 1 - p)); });
      const z = lik.reduce((x, y) => x + y, 0);
      cov.forEach((id, i) => { const k = `${b.id}|${id}`; (byNode[k] ||= []).push({ ...a, nodeId: id, w: (a.w ?? 1) * 0.7 * lik[i] / z, attributed: true }); });
    }
  }
  const res = {};
  for (const [key, arr] of Object.entries(byNode)) {
    const valid = arr.filter(a => a.result !== 'U');
    const m = E.mastery(valid.map(a => ({ ...a, ageDays: (now - Date.parse(a.at)) / DAY })), subjPrior[arr[0].subject]);
    const lastAt = Math.max(...arr.map(a => Date.parse(a.at)));
    const lv = {}; for (const a of valid) if (a.level && !a.attributed) { const x = lv[a.level] ||= { C: 0, N: 0 }; x.N++; if (a.result === 'C') x.C++; }
    res[key] = { ...m, n: valid.filter(a => !a.attributed).length + valid.filter(a => a.attributed).reduce((x, a) => x + a.w, 0), lastAt, distinct: new Set(arr.map(a => a.ref)).size, levels: lv };
  }
  return { res, subjPrior };
}

// ---------- rewards (spec 11) ----------
/** Candidate reward events with stable keys. Ledger is append-only (F-09); caps applied at settle time. */
function rewardCandidates(s, atts) {
  const out = []; const today = todayStr();
  for (const ses of s.sessions) {
    if (ses.legacy || ses.historical) continue; // imported past tests are analysed but not rewarded
    const day = todayStr(new Date(ses.at)), st = sessionStats(s, ses);
    if (ses.flags?.length) continue; // anti-gaming: stored, never rewarded
    const viaReview = ses.origin === 'review' || ses.origin === 'redo'; // R-2: review cards already earn 'reviewDone' XP
    if (!viaReview && st.C + st.W + st.B >= 5) out.push({ key: `sl:${ses.id}`, kind: 'sessionLogged', xp: 3, coins: 0, day, cap: ['sl', 15, 0], fa: 'ثبت جلسه تست' });
    if (ses.mixed && !viaReview) out.push({ key: `mx:${ses.id}`, kind: 'mixedPractice', xp: 8, coins: 5, day, cap: ['mx', 16, 10], fa: 'جلسه مخلوط' });
    for (const [num, rs] of Object.entries(ses.reasons || {})) if (rs.length) {
      const d = ses.reasonAt?.[num] ? todayStr(new Date(ses.reasonAt[num])) : day;
      out.push({ key: `ea:${ses.id}:${num}`, kind: 'errorAnalyzed', xp: 1, coins: 0.5, day: d, cap: ['ea', 40, 20], fa: 'تحلیل یک خطا' });
    }
  }
  for (const t of s.errorTasks.filter(t => t.status === 'done')) out.push({ key: `et:${t.id}`, kind: 'errorTaskClosed', xp: 5, coins: 5, day: todayStr(new Date(t.doneAt)), cap: ['et', 25, 25], fa: 'بستن تحلیل خطای معوق' });
  for (const [ref, r] of Object.entries(s.reviews || {})) for (const h of r.history || []) {
    out.push({ key: `rv:${ref}:${h.at}`, kind: 'reviewDone', xp: h.retrieved ? 3 : 1, coins: 0, day: todayStr(new Date(h.at)), cap: ['rv', 30, 0], fa: h.retrieved ? 'مرور با بازیابی قبل از دیدن جواب' : 'مرور' });
  }
  // F-10: coins only from completed PLANNED minutes, cap 360/day
  for (const p of s.placements.filter(p => p.status === 'done')) out.push({ key: `pl:${p.id}`, kind: 'plannedMinutesDone', xp: 5, coins: p.minutes, day: todayStr(new Date(p.doneAt)), cap: ['pl', 60, 360], fa: `${E.toFa(p.minutes)} دقیقه از برنامه` });
  for (const q of questsFor(s, atts, today).filter(q => q.done)) out.push({ key: `q:${today}:${q.id}`, kind: 'quest', xp: q.xp, coins: q.coins, day: today, cap: ['q', 100, 100], fa: 'ماموریت: ' + q.title });
  return out;
}
/** Returns new ledger entries to append (or [] if none). Never rewrites past entries. */
export function settleRewards(s, extra = []) {
  if (!s.settings.rewards) return [];
  const atts = attemptsOf(s); const have = new Set(s.ledger.map(e => e.key)); const used = {};
  for (const e of s.ledger) { const k = e.capKey + e.day; used[k] = used[k] || { xp: 0, coins: 0 }; used[k].xp += e.xp; used[k].coins += e.coins; }
  const add = [];
  for (const c of [...rewardCandidates(s, atts), ...extra]) {
    if (have.has(c.key)) continue;
    const [ck, xpCap, coinCap] = c.cap; const k = ck + c.day; const u = used[k] = used[k] || { xp: 0, coins: 0 };
    const xp = Math.max(0, Math.min(c.xp, xpCap - u.xp)), coins = s.settings.coins ? Math.max(0, Math.min(c.coins, coinCap - u.coins)) : 0;
    u.xp += xp; u.coins += coins;
    add.push({ key: c.key, kind: c.kind, xp, coins, day: c.day, capKey: ck, fa: c.fa, at: new Date().toISOString() });
  }
  return add;
}
export function rewardSummary(s) {
  const ev = s.ledger;
  const xp = ev.reduce((a, e) => a + e.xp, 0), earned = ev.reduce((a, e) => a + e.coins, 0);
  const spent = s.redemptions.reduce((a, r) => a + r.price, 0);
  const days = new Set(s.sessions.filter(x => !x.legacy && Date.now() - Date.parse(x.at) < 14 * DAY).map(x => todayStr(new Date(x.at)))).size;
  return { ev, xp, coins: Math.max(0, Math.floor(earned - spent)), ...E.levelFromXp(xp), consistency: days };
}

// deterministic daily quests (seed = date)
export function questsFor(s, atts, date = todayStr()) {
  const today = atts.filter(a => !a.isLegacy && todayStr(new Date(a.at)) === date);
  const { res } = topicMastery(s, atts);
  const weak = Object.entries(res).filter(([, m]) => m.confidence >= 0.4).sort((a, b) => a[1].pC - b[1].pC)[0];
  let weakNode = null, weakBook = null;
  if (weak) { const [bId, nId] = weak[0].split('|'); weakBook = bookById(s, bId); weakNode = weakBook?.nodes.find(n => n.id === nId); }
  const rng = E.mulberry32([...date].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) + (s.swaps[date] || 0));
  const pool = [
    weakNode && { id: 'weak', title: `۱۵ تست از «${label(weakBook, weakNode)}»`, target: 15, progress: today.filter(a => a.nodeId === weakNode.id).length, xp: 20, coins: 20 },
    { id: 'analyze', title: 'علت ۵ خطا را مشخص کن', target: 5, progress: s.sessions.reduce((n, x) => n + Object.entries(x.reasonAt || {}).filter(([k, t]) => (x.reasons?.[k] || []).length && todayStr(new Date(t)) === date).length, 0), xp: 10, coins: 10 },
    { id: 'mixed', title: 'یک جلسه مخلوط (چند مبحث) بزن', target: 1, progress: s.sessions.filter(x => !x.legacy && todayStr(new Date(x.at)) === date && x.mixed).length, xp: 15, coins: 15 },
    { id: 'volume', title: '۸ غلط یا نزدهٔ امروز را کامل تحلیل کن', target: 8, progress: today.filter(a => (a.result === 'W' || a.result === 'B') && a.reasons.length).length, xp: 12, coins: 12 },
    { id: 'tasks', title: 'یک تحلیل خطای معوق را ببند', target: 1, progress: s.errorTasks.filter(t => t.status === 'done' && t.doneAt && todayStr(new Date(t.doneAt)) === date).length, xp: 10, coins: 10 },
  ].filter(Boolean);
  const picked = [];
  while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return picked.map(q => ({ ...q, done: q.progress >= q.target }));
}

// ---------- exam readiness (spec 24 + 26) ----------
export function examForecast(s, exam, atts, opts = {}) {
  const now = Date.now(), daysLeft = Math.max(0, daysBetween(todayStr(), exam.date)); const decay = E.FSRS_PARAMS[s.settings.fsrs]?.decay ?? -0.5;
  const { res, subjPrior } = topicMastery(s, atts);
  const topics = [], gaps = { untaught: [], untested: [], weak: [], fading: [], openErrors: [] };
  for (const sec of exam.sections) {
    const b = bookById(s, sec.bookId); if (!b || !sec.nodeIds.length) continue;
    const ids = BK.topicLeavesForSelection(b, sec.nodeIds);
    if (!ids.length) continue;
    // Use live leaf ranges or their enclosing parent span, so book range edits flow into exams.
    const sizes = ids.map(id => BK.questionCountForNode(b, id).count ?? 10);
    const tot = sizes.reduce((a, x) => a + x, 0); const raw = sizes.map(x => sec.count * x / tot);
    const cnt = raw.map(Math.floor); let rem = sec.count - cnt.reduce((a, x) => a + x, 0);
    raw.map((x, i) => [x - Math.floor(x), i]).sort((a, z) => z[0] - a[0]).slice(0, rem).forEach(([, i]) => cnt[i]++);
    ids.forEach((id, i) => {
      const node = b.nodes.find(x => x.id === id); const m = res[`${b.id}|${id}`]; const taught = isTaught(s, b.id, id);
      const questionCounts = questionCoverage(s, b.id, { nodeIds: [id] });
      const weight = cnt[i] / exam.sections.reduce((a, x) => a + x.count, 0);
      let p, eff, state;
      const q = cnt[i];
      if (!taught && !m) { p = { pC: 0.10, pW: 0.15, pB: 0.75 }; eff = 1; state = 'untaught'; if (q) gaps.untaught.push({ b, node, weight, q, questionCounts }); }
      else if (!m || m.n === 0) { const pr = subjPrior[b.subject] || [0.4, 0.3, 0.3]; p = { pC: pr[0] * 0.85, pW: pr[1], pB: 1 - pr[0] * 0.85 - pr[1] }; eff = 1; state = 'untested'; if (q) gaps.untested.push({ b, node, weight, q, questionCounts }); }
      else {
        const S = 3 * (1 + 0.5 * Math.log2(1 + m.n)); const gap = (now - m.lastAt) / DAY + daysLeft;
        p = E.forecastToExam(m, gap, S, decay); eff = m.effectiveN; state = 'tested';
        if (q && m.pC < 0.5 && m.confidence >= 0.4) gaps.weak.push({ b, node, weight, m, q, questionCounts });
        if (q && p.R < 0.8) gaps.fading.push({ b, node, weight, R: p.R, q, questionCounts });
      }
      if (cnt[i] > 0) {
        const range = BK.questionCountForNode(b, id);
        topics.push({ id: `${b.id}|${id}`, n: cnt[i], ...p, effectiveN: eff, section: b.subject, state, node, b, weight, rangeCount: range.count, rangeSource: range.source, rangeExact: range.exact, questionCounts });
      }
    });
  }
  const openErr = atts.filter(a => (a.result === 'W' || a.result === 'B') && topics.some(t => t.id === `${a.bookId}|${a.nodeId}`));
  gaps.openErrors = openErr;
  if (!topics.length) return null;
  const sim = E.simulate(topics, { runs: opts.runs || 3000, seed: 11 });
  const testedW = topics.filter(t => t.state === 'tested').reduce((a, t) => a + t.weight, 0);
  const totalW = topics.reduce((a, t) => a + t.weight, 0);
  // F-15: Ret over ALL exam topics (untested/untaught use prior R = 0.5)
  const ret = topics.map(t => ({ ...t, R: t.R ?? 0.5 }));
  const target = exam.target || defaultTarget(s);
  // Mock = timed, mixed, full-length-ish sessions only (≥ 20 questions with minutes)
  const mocks = s.sessions.filter(x => !x.legacy && x.mixed && x.minutes && Object.keys(x.answers || {}).length >= 20 && now - Date.parse(x.at) < 14 * DAY).length;
  // Err: an error closes when it was reviewed OR analyzed (reason chosen)
  const isClosed = a => a.reasons.length > 0 || (s.reviews[a.ref]?.reps || 0) > 0;
  const comps = {
    A: Math.max(0, Math.min(1, sim.total.P50 / target)), Cov: totalW ? testedW / totalW : 0,
    Ret: ret.length ? ret.reduce((a, t) => a + t.R * t.weight, 0) / ret.reduce((a, t) => a + t.weight, 0) : 0,
    Mock: Math.min(1, mocks / 2), Err: openErr.length ? 1 - openErr.filter(a => !isClosed(a)).length / openErr.length : 1,
  };
  const subjAtt = {}; for (const t of topics) if (t.state === 'tested') subjAtt[t.section] = (subjAtt[t.section] || 0) + (res[t.id]?.n || 0);
  // action plan: gain per minute (spec 24 §6)
  const actions = topics.map(t => {
    const minutes = t.state === 'untaught' ? 45 : 20;
    const sW = t.pW / Math.max(1e-9, t.pW + t.pB), sB = 1 - sW;
    // F-01/F-02: single gain implementation in the engine (spec 24 §6), velocity = subject default 0.06/h
    const gain = E.expectedGain({ weight: t.weight, pW: t.pW, pB: t.pB, velocityPerHour: t.state === 'untaught' ? 0.2 : 0.06 * 2.5, minutes });
    const kind = t.state === 'untaught' ? 'مطالعه درسنامه' : t.state === 'untested' ? 'تست نزده' : (t.R != null && t.R < 0.8) ? 'مرور فراموشی' : 'تست هدفمند';
    return { t, minutes, gain, gpm: gain / minutes, kind };
  }).sort((a, z) => z.gpm - a.gpm);
  gaps.openErrors = openErr.filter(a => !isClosed(a));
  return { daysLeft, sim, topics, gaps, comps: Object.fromEntries(Object.entries(comps).map(([k, v]) => [k, E.clamp01(v)])), RI: E.readiness(comps), actions, subjAtt, target };
}

export function buildPrepPlan(s, exam, fc) {
  const days = Math.max(1, fc.daysLeft); const plan = [];
  const queue = fc.actions.map(a => ({ ...a })); const used = {};
  for (let d = 0; d < days; d++) {
    // v5.1: respect what is already booked that day (approved/done), fill only up to 85% of the (relieved) cap
    const date = addDays(todayStr(), d); const booked = activeOn(s, date).filter(COMMITTED).reduce((a, p) => a + p.minutes * intensityOf(p), 0);
    const perDay = Math.max(0, Math.round(capFor(s, date) * 0.85 - booked)); let left = perDay; const items = [];
    if (isOffDay(s, date) && d !== days - 1) { plan.push({ date, items: [], off: true }); continue; } // v6: catch-up day
    if (d === days - 1) { // day before the exam (or exam day itself) is always light
      if (perDay >= 15) items.push({ title: 'مرور سبک خطاهای مهم + خواب کافی', minutes: Math.min(fc.daysLeft === 0 ? 30 : 60, perDay), kind: 'روز قبل آزمون' }); plan.push({ date, items }); continue; }
    const mixedDay = d >= Math.floor(days * 0.8) && days >= 5;
    if (mixedDay && perDay >= 40) { const mm = Math.min(perDay, 60); items.push({ title: 'آزمون شبیه‌ساز زمان‌دار مخلوط', minutes: mm, kind: 'شرایط آزمون' }); left -= mm * INTENSITY['شرایط آزمون']; }
    for (const a of queue) {
      const w = a.minutes * (INTENSITY[a.kind] ?? 1);
      if (left < 20) break; if (w > left) continue; const k = a.t.id; if ((used[k] || 0) >= 3) continue;
      if (a.t.state === 'untaught' && d >= days - 2) continue;
      items.push({ title: `${a.kind}: ${a.t.section}، ${label(a.t.b, a.t.node)}`, subject: a.t.section, bookId: a.t.b.id, nodeId: a.t.node.id, count: a.t.state === 'untaught' ? 0 : Math.max(6, Math.round(a.minutes * 60 / 75)), minutes: a.minutes, gain: a.gain, kind: a.kind });
      left -= w; used[k] = (used[k] || 0) + 1; a.gpm *= 0.6;
    }
    queue.sort((a, z) => z.gpm - a.gpm);
    plan.push({ date, items });
  }
  return plan;
}

// ---------- behavior signals (spec 21 Layer B, subset) ----------
export function behavior(s0, atts0) {
  // 7.1: past tests imported without a date say nothing about WHEN or HOW FAST you study
  const s = { ...s0, sessions: s0.sessions.filter(x => !x.historical) }; const atts = atts0.filter(a => !a.historical);
  const out = [];
  const timed = s.sessions.filter(x => x.minutes);
  const blocks = { 'بامداد': [0, 6], 'صبح': [6, 12], 'بعدازظهر': [12, 16], 'عصر': [16, 20], 'شب': [20, 24] };
  const blockStats = Object.entries(blocks).map(([k, [a, z]]) => {
    const ss = s.sessions.filter(x => { const h = new Date(x.at).getHours(); return h >= a && h < z; }).map(x => sessionStats(s, x).P).filter(p => p != null);
    return { k, n: ss.length, mean: ss.length ? ss.reduce((x, y) => x + y, 0) / ss.length : null };
  });
  const all = blockStats.filter(b => b.n).flatMap(b => Array(b.n).fill(b.mean)); const g = all.length ? all.reduce((a, x) => a + x, 0) / all.length : 0;
  const shrunk = blockStats.map(b => ({ ...b, m: b.n ? (b.n * b.mean + 5 * g) / (b.n + 5) : null })).filter(b => b.m != null).sort((a, z) => z.m - a.m);
  out.push({ id: 'best', fa: 'بهترین ساعت مطالعه', minN: 12, n: s.sessions.length, value: shrunk.length >= 2 && shrunk[0].m - shrunk[1].m > 3 ? shrunk[0].k : 'تفاوت معنادار نیست', detail: shrunk.map(b => `${b.k}: ${E.toFa(b.m.toFixed(0))}٪ (${E.toFa(b.n)} جلسه)`).join('، ') });
  const days14 = new Set(s.sessions.filter(x => Date.now() - Date.parse(x.at) < 14 * DAY).map(x => todayStr(new Date(x.at)))).size;
  out.push({ id: 'consistency', fa: 'ثبات (روز فعال از ۱۴)', minN: 1, n: s.sessions.length, value: E.toFa(days14) + ' روز' });
  const g2 = atts.filter(a => a.isGuess && a.result !== 'U'); const gq = g2.length ? g2.filter(a => a.result === 'C').length / g2.length : null;
  out.push({ id: 'guess', fa: 'بازده حدس', minN: 15, n: g2.length, value: gq == null ? '' : `${E.toFa((gq * 100).toFixed(0))}٪ درست — ${gq > 0.25 ? 'حدس‌هایت سود دارد' : 'حدس نزن'}` });
  const c = atts.filter(a => a.result !== 'U'); const blank = c.length ? c.filter(a => a.result === 'B').length / c.length : 0;
  out.push({ id: 'blank', fa: 'سهم نزده‌ها', minN: 40, n: c.length, value: E.toFa((blank * 100).toFixed(0)) + '٪' });
  const pts = timed.map(x => ({ spq: E.secPerQ(x.minutes * 60, sessionStats(s, x)), p: sessionStats(s, x).P })).filter(x => x.spq && x.p != null);
  const rho = pts.length >= 6 ? E.spearman(pts.map(x => x.spq), pts.map(x => x.p)) : null;
  out.push({ id: 'speed', fa: 'رابطه سرعت و دقت', minN: 10, n: pts.length, value: rho == null ? '' : rho > 0.3 ? 'آهسته‌تر = دقیق‌تر؛ عجله نکن' : rho < -0.3 ? 'سریع‌تر = دقیق‌تر (تسلط)' : 'رابطه روشنی نیست', detail: rho == null ? '' : `ρ = ${E.toFa(rho.toFixed(2))}` });
  const analyzed = atts.filter(a => (a.result === 'W' || a.result === 'B')); const share = analyzed.length ? analyzed.filter(a => a.reasons.length).length / analyzed.length : 0;
  out.push({ id: 'follow', fa: 'پیگیری خطا', minN: 30, n: analyzed.length, value: E.toFa((share * 100).toFixed(0)) + '٪ خطاها تحلیل شده' });
  return out;
}

// ---------- demo data ----------
export function withDemo(s0) {
  const s = JSON.parse(JSON.stringify(initialState())); s.demo = true; s.settings.name = 'مهران';
  const rng = E.mulberry32(2026);
  for (const b of s.books) {
    let num = 1, lastScope; // per-chapter books restart at 1 in each chapter (internal number = scope offset + printed)
    for (const n of leaves(b)) {
      const sc = BK.scopeNodeOf(b, n)?.id ?? null; if (sc !== lastScope) { num = 1; lastScope = sc; } const base = BK.toInternal(b, sc, 0);
      const size = n.kind === 'checkup' || n.kind === 'comprehensive' ? 20 : n.kind === 'final' ? 40 : 15 + Math.floor(rng() * 16); n.qStart = base + num; n.qEnd = base + num + size - 1;
      for (let q = n.qStart; q <= n.qEnd; q++) b.keys[q] = 1 + Math.floor(rng() * 4); num += size;
    }
    const ls = leaves(b).filter(n => n.kind === 'topic'); s.taught[b.id] = {};
    ls.slice(0, Math.ceil(ls.length * 0.45)).forEach((n, i) => s.taught[b.id][n.id] = { state: i % 4 === 3 ? 'self' : 'taught', at: addDays(todayStr(), -40 + i) });
  }
  const skill = { calc: 0.55, phys: 0.42, chem: 0.62 };
  for (let i = 0; i < 34; i++) {
    const b = s.books[i % 3]; const taughtLeaves = leaves(b).filter(n => s.taught[b.id][n.id]);
    const node = taughtLeaves[Math.floor(rng() * taughtLeaves.length)]; const size = 10 + Math.floor(rng() * 11);
    const from = node.qStart + Math.floor(rng() * Math.max(1, node.qEnd - node.qStart - size)); const to = Math.min(node.qEnd, from + size - 1);
    const daysAgo = 30 - Math.floor(i * 30 / 34); const hour = [8, 10, 15, 17, 18, 21, 22][Math.floor(rng() * 7)];
    const at = new Date(Date.now() - daysAgo * DAY); at.setHours(hour, 10, 0, 0);
    const ability = skill[b.id] + (30 - daysAgo) * 0.006 + (node.order % 5) * 0.03 - 0.06;
    const answers = {}, guesses = {}, reasons = {};
    for (let q = from; q <= to; q++) {
      const u = rng(); const k = b.keys[q];
      if (u < ability) answers[q] = k; else if (u < ability + 0.18) { answers[q] = 0; } else { answers[q] = ((k + Math.floor(rng() * 3)) % 4) + 1; if (answers[q] === k) answers[q] = (k % 4) + 1; }
      if (rng() < 0.12 && answers[q] > 0) guesses[q] = true;
      if (answers[q] !== k && rng() < 0.7) reasons[q] = [REASONS[Math.floor(rng() * REASONS.length)].id];
    }
    const n = to - from + 1; const minutes = Math.round(n * (55 + rng() * 50) / 60 / 5) * 5 || 10;
    s.sessions.push({ id: uid(), bookId: b.id, nodeId: node.id, ranges: [{ nodeId: node.id, from, to }], answers, guesses, reasons, minutes, timeSource: 'estimated', at: at.toISOString(), mixed: rng() < 0.15 });
  }
  const exam = { id: uid(), title: 'آزمون قلمچی (نمونه)', date: addDays(todayStr(), 9), target: 60, sections: s.books.map(b => ({ bookId: b.id, count: b.id === 'calc' ? 20 : 15, nodeIds: leaves(b).filter(n => n.kind === 'topic').slice(0, Math.ceil(leaves(b).filter(n => n.kind === 'topic').length * 0.55)).map(n => n.id) })) };
  s.exams.push(exam);
  s.redemptions = []; s.errorTasks = [{ id: uid(), sessionId: s.sessions.at(-1).id, status: 'open', at: s.sessions.at(-1).at }];
  exam.kind = 'upcoming'; exam.sittings = [];
  // an old exam taken twice (history); analysis uses the latest sitting
  const oldSecs = s.books.map(b => ({ bookId: b.id, count: 10, nodeIds: leaves(b).filter(n => n.kind === 'topic').slice(0, 4).map(n => n.id) }));
  const sit = (date, k) => { const sections = oldSecs.map((x, i) => { const C = 3 + k + i, W = 3 - Math.min(2, k), B = 10 - C - W; return { bookId: x.bookId, C, W, B, P: E.percent(C, W, 10) }; }); return { id: uid(), date, at: date + 'T10:00', isRepeat: k > 0, mode: 'counts', percent: sittingPercent(sections), sections }; };
  s.exams.push({ id: uid(), kind: 'old', title: 'قلمچی ۲۸ شهریور', date: addDays(todayStr(), -14), target: 60, sections: oldSecs, sittings: [sit(addDays(todayStr(), -14), 0), sit(addDays(todayStr(), -4), 2)] });
  // some review history (so retention/streak/leeches are visible)
  const wrongs = attemptsOf(s).filter(a => (a.result === 'W' || a.result === 'B') && a.num != null).slice(0, 60);
  wrongs.forEach((a, i) => { let it = {}; const hist = []; const reps = 1 + (i % 5); for (let k = 0; k < reps; k++) { const t = Date.now() - (reps - k) * 2.5 * DAY - i * 6e5; const r = i % 11 === 0 ? 1 : [3, 2, 3, 4, 1][(i + k) % 5]; it = E.fsrsNext(it, r, t); hist.push({ at: t, rating: r, retrieved: r >= 3 }); } s.reviews[a.ref] = { ...it, history: hist, streak: 0 }; });
  const w = proposeWeek(s, attemptsOf(s));
  s.placements = w.drafts.map(p => ({ ...p, status: 'approved', approvedAt: new Date().toISOString(), locked: true }));
  // the following week as if already approved, the rest as a tentative outline
  const outline = planOutline(s, attemptsOf(s), 4); const nextEnd = addDays(weekEnd(todayStr()), 7);
  s.placements = [...s.placements, ...outline.map(p => p.date <= nextEnd ? { ...p, status: 'approved', approvedAt: new Date().toISOString() } : p)];
  // one overloaded day so the planner assistant has something to suggest
  const d2 = addDays(todayStr(), 2); const extra = s.placements.filter(p => p.date === addDays(todayStr(), 3)).slice(0, 3);
  s.placements = s.placements.map(p => extra.includes(p) ? { ...p, date: d2 } : p);
  return s;
}

export function defaultTarget(s) {
  const past = s.exams.map(e => latestSitting(e)).filter(x => x?.percent != null).sort((a, z) => z.date.localeCompare(a.date)).slice(0, 3);
  return past.length ? Math.round(past.reduce((a, x) => a + x.percent, 0) / past.length + 5) : 60;
}

// ---------- review queue (MRS, FSRS) ----------
/** Every W/B attempt becomes a review item keyed by question ref; due immediately until first review. */
export function reviewQueue(s, atts, now = Date.now()) {
  const last = {};
  for (const a of atts) if (!a.isLegacy && a.num != null) last[a.ref] = a;
  const items = [];
  for (const a of Object.values(last)) {
    const r = s.reviews[a.ref];
    const star = s.starred?.[a.ref];
    if (!r && a.result !== 'W' && a.result !== 'B' && !star) continue;
    if (r?.suspended) continue;
    const due = r ? r.dueAt : Date.parse(star?.at || a.at) + (a.result === 'W' || a.result === 'B' ? 6 * 36e5 : 3 * DAY);
    const b = bookById(s, a.bookId); const n = b?.nodes.find(x => x.id === a.nodeId);
    const w = Math.max(0, ...a.reasons.map(id => REASONS.find(x => x.id === id)?.w || 0));
    items.push({ ref: a.ref, a, b, node: n, due, isNew: !r, item: r, starred: !!star, priority: E.reviewPriority({ reasonWeights: a.reasons.map(id => REASONS.find(x => x.id === id)?.w || 3), wrongCount: a.result === 'W' ? 1 : 0, blankCount: a.result === 'B' ? 1 : 0, daysOverdue: (now - due) / DAY, correctStreak: r?.streak || 0 }), w });
  }
  const dueNow = items.filter(x => x.due <= now).sort((x, y) => y.priority - x.priority);
  const later = items.filter(x => x.due > now).sort((x, y) => x.due - y.due);
  return { dueNow, later, all: items };
}
export const LEECH_LAPSES = 4;
export const isLeech = r => (r?.lapses || 0) >= LEECH_LAPSES;
/** Preview of the next interval (days) for each rating, for the rating buttons. */
export function previewIntervals(s, ref) {
  const now = Date.now(); const decay = E.FSRS_PARAMS[s.settings.fsrs]?.decay ?? -0.5; const prev = s.reviews[ref] || {};
  return [1, 2, 3, 4].map(r => { const nx = E.fsrsNext(prev, r, now, decay); return (nx.dueAt - now) / DAY; });
}
export function retrievabilityNow(s, item, now = Date.now()) {
  if (!item?.lastAt || !item.S) return null; const decay = E.FSRS_PARAMS[s.settings.fsrs]?.decay ?? -0.5;
  return E.forgettingCurve((now - item.lastAt) / DAY, item.S, decay);
}
export function reviewStats(s, all, now = Date.now()) {
  const hist = Object.values(s.reviews).flatMap(r => r.history || []).filter(h => now - h.at < 30 * DAY);
  const retention = hist.length ? hist.filter(h => h.rating >= 3).length / hist.length : null;
  const forecast = Array.from({ length: 7 }, (_, i) => all.filter(x => { const d = Math.floor((x.due - now) / DAY); return i === 0 ? x.due <= now + DAY : d === i; }).length);
  const days = new Set(Object.values(s.reviews).flatMap(r => (r.history || []).map(h => todayStr(new Date(h.at)))));
  let streak = 0; for (let d = todayStr(); days.has(d); d = addDays(d, -1)) streak++;
  return { retention, forecast, reviewed30: hist.length, streak, leeches: all.filter(x => isLeech(x.item)).length, todayDone: hist.filter(h => todayStr(new Date(h.at)) === todayStr()).length };
}
export function applyReview(s, ref, rating, retrieved) {
  const now = Date.now(); const decay = E.FSRS_PARAMS[s.settings.fsrs]?.decay ?? -0.5;
  const prev = s.reviews[ref] || {};
  const nx = E.fsrsNext(prev, rating, now, decay);
  return { ...s, lastReview: { ref, prev: s.reviews[ref] ?? null }, reviews: { ...s.reviews, [ref]: { ...nx, note: prev.note, streak: rating >= 3 ? (prev.streak || 0) + 1 : 0, history: [...(prev.history || []), { at: now, rating, retrieved: !!retrieved }] } } };
}
export function undoReview(s) {
  const l = s.lastReview; if (!l) return s; const reviews = { ...s.reviews };
  if (l.prev) reviews[l.ref] = l.prev; else delete reviews[l.ref];
  return { ...s, reviews, lastReview: null };
}

// ---------- planner v6 (spec 10 + owner rules v6) ----------
// • The CURRENT week (today → Friday) is proposed once, approved and then stays put (approved items are «locked»).
// • Later weeks (up to settings.planWeeks, or until the last upcoming exam) get a tentative OUTLINE that is rebuilt freely.
// • Thursday + Friday get no new work: they are catch-up days (unfinished tasks) and you may pull future tasks into them.
// • Several upcoming exams are planned together: a topic in two exams (same node or linked textbook topic) is worth more,
//   and each day is packed around RELATED topics (same chapter / linked textbook lessons), continuing yesterday's thread.
export const COMMITTED = p => p.status === 'approved' || p.status === 'done';
const relOf = (a, b) => {
  if (!a || !b) return 0;
  if (a.bookId && a.bookId === b.bookId && a.chapterId && a.chapterId === b.chapterId) return a.nodeId === b.nodeId ? 0.3 : 0.8;
  return a.refs?.length && b.refs?.length ? refSimilarity(a.refs, b.refs) : 0;
};
export function planCandidates(s, atts, { maxDays = 70 } = {}) {
  const today = todayStr(); const cand = new Map();
  const add = (key, c) => {
    const x = cand.get(key); if (!x) { cand.set(key, { ...c, exams: c.exams || [] }); return; }
    x.u += c.u; x.exams = [...new Set([...x.exams, ...(c.exams || [])])]; x.examTitles = [...new Set([...(x.examTitles || []), ...(c.examTitles || [])])];
    if (c.deadline && (!x.deadline || c.deadline < x.deadline)) x.deadline = c.deadline; x.repeat = Math.max(x.repeat || 1, c.repeat || 1);
    x.reason = `مشترک بین ${x.examTitles.map(t => `«${t}»`).join(' و ')}؛ ${c.reason}`;
  };
  const rq = reviewQueue(s, atts);
  if (rq.dueNow.length) add('review', { title: `مرور ${E.toFa(Math.min(15, rq.dueNow.length))} خطای سررسید`, minutes: Math.min(30, 10 + rq.dueNow.length), kind: 'مرور', u: 3, reason: `${E.toFa(rq.dueNow.length)} کارت مرور سررسید شده؛ مرور فاصله‌دار جلوی فراموشی را می‌گیرد`, repeat: 5, light: true });
  for (const t of s.errorTasks.filter(t => t.status === 'open')) add('err:' + t.id, { title: 'تحلیل خطاهای یک جلسه معوق', minutes: 10, kind: 'تحلیل خطا', u: 2.5, reason: 'تحلیل علت خطا مهم‌ترین منبع پیشرفت است', light: true });
  const upcoming = upcomingExams(s).filter(e => daysBetween(today, e.date) <= maxDays);
  const examCands = [];
  for (const ex of upcoming) {
    const fc = examForecast(s, ex, atts, { runs: 400 }); if (!fc) continue;
    const dl = Math.max(1, fc.daysLeft);
    for (const a of fc.actions.slice(0, upcoming.length > 1 ? 12 : 16)) {
      const u = (1 + 14 / dl) * (1 + (1 - a.t.pC)) * (1 + 10 * a.gpm);
      const count = a.t.state === 'untaught' ? 0 : Math.max(6, Math.round(a.minutes * 60 / 75));
      const c = { key: a.t.id, title: `${a.kind}: ${a.t.section}، ${label(a.t.b, a.t.node)}`, subject: a.t.section, bookId: a.t.b.id, nodeId: a.t.node.id, count, minutes: a.minutes, kind: a.kind, u, uBase: u,
        reason: `+${E.toFa(a.gain.toFixed(1))} درصد پیش‌بینی‌شده در ${E.toFa(a.minutes)} دقیقه؛ ${E.toFa(fc.daysLeft)} روز تا ${ex.title}`, newMaterial: a.t.state === 'untaught', repeat: 2,
        deadline: ex.date, exams: [ex.id], examTitles: [ex.title], examId: ex.id, refs: BK.refsOf(a.t.b, a.t.node), chapterId: chapterOf(a.t.b, a.t.node)?.id, nodeOrder: a.t.node.order };
      examCands.push(c); add(a.t.id, c);
    }
  }
  // cross-book / cross-stream overlap: linked textbook topics in DIFFERENT exams strengthen each other
  const list = [...cand.values()].filter(c => c.exams?.length);
  for (const a of list) for (const b of list) {
    if (a === b || a.exams.some(e => b.exams.includes(e))) continue;
    const sim = a.refs && b.refs ? refSimilarity(a.refs, b.refs) : 0;
    if (sim >= 0.8) { a.u += 0.35 * sim * (b.uBase || b.u); a.shared = [...new Set([...(a.shared || []), ...b.examTitles])]; }
  }
  for (const a of list) if (a.shared?.length) a.reason = `هم‌مبحث با ${a.shared.map(t => `«${t}»`).join('، ')}؛ ${a.reason}`;
  const { res } = topicMastery(s, atts);
  for (const [k, m] of Object.entries(res).filter(([, m]) => m.pC < 0.5 && m.confidence >= 0.4).slice(0, 6)) {
    const [bId, nId] = k.split('|'); const b = bookById(s, bId); const n = b?.nodes.find(x => x.id === nId);
    if (b && n && b.active !== false && !cand.has(k)) add(k, { title: `۱۲ تست هدفمند: ${b.subject}، ${label(b, n)}`, subject: b.subject, bookId: b.id, nodeId: n.id, count: 12, minutes: 25, kind: 'تست هدفمند', u: 1.5 * (1 + (1 - m.pC)), reason: `تسلط فعلی ${E.toFa(Math.round(m.pC * 100))}٪؛ اگر وقت کم بود فقط ۶ تست`, repeat: 2, refs: BK.refsOf(b, n), chapterId: chapterOf(b, n)?.id, nodeOrder: n.order });
  }
  return [...cand.values()];
}
/** Pack candidates into days. `existing` = committed placements already on those days (count toward caps & repeats). */
export function packDays(s, cands, days, { status = 'draft', source = 'planner' } = {}) {
  const out = []; const count = {}; const upcoming = upcomingExams(s);
  for (const p of s.placements) if (COMMITTED(p) && days.includes(p.date)) count[p.title] = (count[p.title] || 0) + 1;
  let prevDay = [];
  for (const d of days) {
    if (isOffDay(s, d) || upcoming.some(e => e.date === d)) { prevDay = []; continue; }
    const examTomorrow = upcoming.some(e => addDays(d, 1) === e.date);
    let left = planCap(s, d) * 0.85 - activeOn(s, d).filter(COMMITTED).reduce((x, p) => x + p.minutes * intensityOf(p), 0);
    // 7.1: real clock minutes must also fit into the day's sessions (light tasks have intensity < 1)
    let leftRaw = planCap(s, d) - activeOn(s, d).filter(COMMITTED).reduce((x, p) => x + p.minutes, 0);
    if (examTomorrow) left = Math.min(left, 45); // day before an exam: light review only
    // v10: «موتور توان» daily test budget (null = no limit); committed test tasks already on the day count against it
    const tcap = testsCapOf(s, d); let testsLeft = tcap == null ? Infinity : Math.max(0, tcap - activeOn(s, d).filter(COMMITTED).reduce((x, p) => x + (p.count || 0), 0));
    const today = []; let lastSub = null, streak = 0;
    for (;;) {
      let best = null, bs = -Infinity, br = 0;
      for (const c of cands) {
        const w = c.minutes * (INTENSITY[c.kind] ?? 1);
        if (w > left || c.minutes > leftRaw || (count[c.title] || 0) >= (c.repeat || 1) || today.includes(c)) continue;
        if (c.count > 0 && c.count > testsLeft && testsLeft < 6) continue;
        if (examTomorrow && (c.newMaterial || !c.light)) continue;
        if (c.deadline && d >= c.deadline) continue;
        if (c.subject && c.subject === lastSub && streak >= 2) continue; // no >2 consecutive same subject
        const r = Math.max(0, ...today.map(x => relOf(c, x)), ...prevDay.map(x => 0.5 * relOf(c, x)));
        const score = (c.u / c.minutes) * (1 + 0.6 * r) - (c.nodeOrder ?? 0) * 1e-6;
        if (score > bs) { bs = score; best = c; br = r; }
      }
      if (!best) break;
      // v10: shrink a test task to the day's remaining test budget (minutes scale with it)
      const fitCount = best.count > 0 && best.count > testsLeft ? testsLeft : best.count;
      const fitMin = fitCount !== best.count ? Math.max(10, Math.round(best.minutes * fitCount / best.count)) : best.minutes;
      const w = fitMin * (INTENSITY[best.kind] ?? 1);
      if (best.count > 0) testsLeft -= fitCount;
      out.push({ id: uid(), date: d, order: out.filter(o => o.date === d).length + 100, title: fitCount !== best.count ? best.title.replace(/^۱۲ تست/, `${E.toFa(fitCount)} تست`) : best.title, minutes: fitMin, kind: best.kind, subject: best.subject, bookId: best.bookId, nodeId: best.nodeId, count: fitCount, trimmed: fitCount !== best.count || undefined, examId: best.examId, exams: best.exams, deadline: best.deadline, u: best.u, reason: best.reason + (br >= 0.5 ? ' · کنار مبحث مرتبط چیده شد' : ''), related: br >= 0.5, status, source });
      left -= w; leftRaw -= fitMin; count[best.title] = (count[best.title] || 0) + 1; today.push(best);
      streak = best.subject === lastSub ? streak + 1 : 1; lastSub = best.subject;
    }
    prevDay = today;
  }
  return out;
}
/** Builds DRAFT placements for the rest of the current week (today → Friday). Approved items are never touched. */
export function proposeWeek(s, atts, ws = todayStr()) {
  const today = todayStr(); const start = ws > today ? ws : today;
  const days = daysFromTo(start, weekEnd(start));
  const cand = planCandidates(s, atts);
  const out = packDays(s, cand, days, { status: 'draft' });
  const plannable = days.filter(d => !isOffDay(s, d));
  const used = Object.fromEntries(plannable.map(d => [d, activeOn(s, d).filter(COMMITTED).reduce((a, p) => a + p.minutes, 0)]));
  const required = cand.reduce((a, c) => a + c.minutes * Math.min(c.repeat || 1, 2), 0);
  const available = plannable.reduce((a, d) => a + Math.max(0, planCap(s, d) - used[d]), 0);
  const ratio = available ? required / available : Infinity;
  const placedTitles = new Set(out.map(p => p.title));
  return { drafts: out, days, ratio, verdict: ratio < 0.8 ? 'ok' : ratio <= 1 ? 'tight' : 'overloaded', dropped: cand.filter(c => !placedTitles.has(c.title)).slice(0, 5) };
}
/** Number of weeks to outline: settings.planWeeks, extended to cover the last upcoming exam (max 12). */
export function horizonWeeks(s, today = todayStr()) {
  const last = upcomingExams(s).at(-1); const toExam = last ? Math.ceil((daysBetween(weekEnd(today), last.date) + 1) / 7) + 1 : 1;
  return Math.max(1, Math.min(12, Math.max(s.settings.planWeeks ?? 4, toExam)));
}
/** Tentative plan for the weeks after the current one (status 'outline'); rebuilt whenever you ask. */
export function planOutline(s, atts, weeks = horizonWeeks(s)) {
  const today = todayStr(); const cand = planCandidates(s, atts, { maxDays: weeks * 7 + 7 }); const out = [];
  let ws = addDays(weekEnd(today), 1);
  for (let w = 1; w < weeks; w++, ws = addDays(ws, 7)) {
    const days = daysFromTo(ws, addDays(ws, 6));
    const week = packDays(s, cand, days, { status: 'outline', source: 'outline' }).map(p => ({ ...p, week: ws }));
    for (const p of week) { const c = cand.find(x => x.title === p.title); if (c) c.u *= 0.75; } // rotate topics week to week
    out.push(...week);
  }
  return out;
}
export const withOutline = (s, outline) => ({ ...s, placements: [...s.placements.filter(p => p.status !== 'outline'), ...outline] });
/** Outline items that now fall inside the current week become drafts (to approve once). */
export function promoteOutline(s, today = todayStr()) {
  const end = weekEnd(today);
  return { ...s, placements: s.placements.map(p => p.status === 'outline' && p.date <= end ? (p.date < today ? { ...p, status: 'skipped' } : { ...p, status: 'draft' }) : p) };
}
export const approveDrafts = (s, today = todayStr()) => ({ ...s, placements: s.placements.map(p => p.status === 'draft' ? { ...p, status: 'approved', approvedAt: new Date().toISOString(), locked: p.date <= weekEnd(today) } : p) });
/** Unfinished approved work → the next catch-up day(s) (Thu/Fri) of this week, within their cap. Returns moves. */
export function catchUpMoves(s, today = todayStr()) {
  const overdue = s.placements.filter(p => p.status === 'approved' && p.date < today).sort((a, z) => (z.u ?? 1) - (a.u ?? 1));
  const offs = daysFromTo(today, weekEnd(today)).filter(d => isOffDay(s, d));
  const load = Object.fromEntries(offs.map(d => [d, activeOn(s, d).filter(COMMITTED).reduce((a, p) => a + p.minutes * intensityOf(p), 0)]));
  const moves = [];
  for (const p of overdue) {
    const w = p.minutes * intensityOf(p); const d = offs.find(x => load[x] + w <= capFor(s, x) && (!p.deadline || x < p.deadline));
    if (!d) continue; load[d] += w; moves.push({ id: p.id, title: p.title, from: p.date, to: d });
  }
  return { moves, left: overdue.length - moves.length, offDays: offs };
}
/** Future tasks you could pull into a catch-up day (working ahead). */
export const aheadCandidates = (s, d) => s.placements.filter(p => (p.status === 'approved' || p.status === 'outline') && p.date > d && (!p.deadline || d < p.deadline)).sort((a, z) => a.date.localeCompare(z.date)).slice(0, 12);

// ---------- exams: three kinds (v5) ----------
// kind 'old' = past exam entered for history (many sittings, analysis uses the latest);
// kind 'upcoming' = registered future exam (blueprint → readiness → planner); after its date + result it is «برگزارشده».
export const latestSitting = ex => [...(ex.sittings || [])].sort((a, z) => (a.date + (a.at || '')).localeCompare(z.date + (z.at || ''))).at(-1) || null;
export function examStatus(ex, today = todayStr()) {
  if (ex.pending) return 'pending'; // 7.1: from the hub, waiting for the student to activate it
  if (ex.kind === 'old') return 'old';
  if ((ex.sittings || []).length) return 'done';
  return ex.date >= today ? 'upcoming' : 'awaiting';
}
export const upcomingExams = s => s.exams.filter(e => examStatus(e) === 'upcoming').sort((a, z) => a.date.localeCompare(z.date));
export function sittingPercent(sections) {
  const C = sections.reduce((a, x) => a + (x.C || 0), 0), W = sections.reduce((a, x) => a + (x.W || 0), 0), N = sections.reduce((a, x) => a + (x.C || 0) + (x.W || 0) + (x.B || 0), 0);
  return E.percent(C, W, N);
}

// ---------- practice: number range → topics (v5) ----------
/** Split a numeric range over the book's leaf topics using their saved question ranges. */
export function mapRange(b, from, to) {
  const ls = leaves(b).filter(n => n.qStart != null).sort((x, y) => x.qStart - y.qStart);
  const parts = [], gaps = []; let cur = from;
  while (cur <= to) {
    const n = ls.find(x => cur >= x.qStart && cur <= x.qEnd);
    if (n) { const end = Math.min(to, n.qEnd); parts.push({ nodeId: n.id, from: cur, to: end }); cur = end + 1; continue; }
    const nxt = ls.find(x => x.qStart > cur); const end = Math.min(to, nxt ? nxt.qStart - 1 : to);
    gaps.push({ from: cur, to: end }); cur = end + 1;
  }
  return { parts, gaps };
}
/** Try to attach a gap range to a topic: new range if empty, or extend if adjacent. Returns {ok, books|error}. */
export function assignGap(s, bookId, nodeId, gap) {
  const b = bookById(s, bookId); const n = b.nodes.find(x => x.id === nodeId);
  let qStart, qEnd;
  if (n.qStart == null) { qStart = gap.from; qEnd = gap.to; }
  else if (n.qEnd + 1 === gap.from) { qStart = n.qStart; qEnd = gap.to; }
  else if (gap.to + 1 === n.qStart) { qStart = gap.from; qEnd = n.qEnd; }
  else return { ok: false, error: `«${n.title}» قبلاً بازه ${E.toFa(n.qStart)} تا ${E.toFa(n.qEnd)} دارد و این بازه به آن نمی‌چسبد.` };
  const ov = rangeOverlap(b, nodeId, qStart, qEnd);
  if (ov) return { ok: false, error: `با «${ov.title}» (${E.toFa(ov.qStart)} تا ${E.toFa(ov.qEnd)}) تداخل دارد.` };
  const chk = BK.checkRange(b, n, qStart, qEnd); if (!chk.ok) return chk; // v9: stay inside the chapter's span
  return { ok: true, books: s.books.map(bb => bb.id !== bookId ? bb : { ...bb, nodes: bb.nodes.map(x => x.id === nodeId ? { ...x, qStart, qEnd } : x) }) };
}
export function nextBlockFor(s, atts, b, node, size = 15, opts = {}) {
  if (node?.qStart == null) return null;
  const done = new Set(atts.filter(a => a.bookId === b.id && a.num != null).map(a => a.num));
  // v6: books with difficulty levels → climb levels: weak topic (pC < .5) starts at level 1–2, strong at 2–3
  if (b.levels && node.levels?.length) {
    const m = opts.mastery; const want = opts.level || (m == null ? 1 : m < 0.5 ? 1 : m < 0.7 ? 2 : 3);
    const order = [want, ...[1, 2, 3].filter(x => x !== want)];
    for (const L of order) { const lr = node.levels.find(x => x.L === L); if (!lr) continue; let f = lr.from; while (f <= lr.to && done.has(f)) f++; if (f <= lr.to) return { from: f, to: Math.min(lr.to, f + size - 1), level: L, repeat: false }; }
  }
  let from = node.qStart; while (from <= node.qEnd && done.has(from)) from++;
  if (from > node.qEnd) from = node.qStart; // finished: start a repeat pass
  return { from, to: Math.min(node.qEnd, from + size - 1), repeat: done.has(from), level: BK.levelOf(b, node, from) };
}

// ---------- planner pressure (v5) ----------
export const INTENSITY = { 'عادت': 0.9, 'کار دستی': 1, 'مطالعه درسنامه': 1.25, 'تست نزده': 1.1, 'تست هدفمند': 1.0, 'شرایط آزمون': 1.3, 'مرور فراموشی': 0.8, 'مرور': 0.7, 'تحلیل خطا': 0.6, 'روز قبل آزمون': 0.5 };
export const intensityOf = p => INTENSITY[p.kind] ?? 1;
export const activeOn = (s, d) => s.placements.filter(p => p.date === d && p.status !== 'skipped').sort((a, z) => (a.order ?? 0) - (z.order ?? 0));
/** Daily pressure % = weighted minutes / normal cap. 100% = a full normal day. */
export function dayPressure(s, d) {
  const items = activeOn(s, d); const load = items.reduce((a, p) => a + p.minutes * intensityOf(p), 0);
  const cap = Math.max(1, baseCap(s, d));
  return { items, load, cap, pct: Math.round(100 * load / cap), minutes: items.reduce((a, p) => a + p.minutes, 0), limitPct: Math.round(100 * dayLimit(s, d)), reliefPct: Math.round(100 * (s.dayRelief?.[d] ?? 1)), capacityPct: Math.round(100 * capacityFactor(s, d)) };
}
export function weekPressure(s, days) {
  const ds = days.map(d => dayPressure(s, d));
  const load = ds.reduce((a, x) => a + x.load, 0), cap = ds.reduce((a, x) => a + x.cap, 0);
  return { days: ds, pct: Math.round(100 * load / Math.max(1, cap)), count: ds.reduce((a, x) => a + x.items.length, 0) };
}
export const pressureTone = pct => pct > 100 ? 'var(--bad)' : pct > 80 ? 'var(--amber)' : pct > 0 ? 'var(--ok)' : 'var(--rule)';
/** Moves (not done, movable) items out of `date` until its pressure ≤ targetPct; returns list of moves {id, to}. */
export function planLighten(s, date, targetPct, days) {
  const moves = []; const sim = JSON.parse(JSON.stringify(s));
  const pr = d => dayPressure(sim, d).pct;
  const movable = activeOn(sim, date).filter(p => p.status !== 'done' && p.kind !== 'روز قبل آزمون').sort((a, z) => (a.u ?? 1) - (z.u ?? 1));
  let movedAtTarget = false;
  for (const p of movable) {
    // An explicit "make this day easier" action moves at least one low-priority item even when
    // the day is already under the requested threshold. This also makes the action predictable
    // instead of silently doing nothing.
    if (pr(date) <= targetPct && movedAtTarget) break;
    // v5.1: check the DESTINATION day's own cap and relief limit; keep exam days and the day before them light
    const heavy = intensityOf(p) >= 1;
    const opts = days.filter(d => d !== date && d >= todayStr() && (!p.deadline || d < p.deadline))
      .filter(d => !(sim.exams || []).some(e => e.kind !== 'old' && (e.date === d || (heavy && addDays(d, 1) === e.date))))
      .filter(d => !isOffDay(sim, d)) // catch-up days stay free for unfinished work
      .map(d => [d, pr(d)])
      .filter(([d, v]) => v + Math.round(100 * p.minutes * intensityOf(p) / Math.max(1, baseCap(sim, d))) <= Math.min(100, Math.round(100 * dayLimit(sim, d))))
      .sort((a, z) => a[1] - z[1]);
    if (!opts.length) continue;
    const to = opts[0][0]; moves.push({ id: p.id, title: p.title, from: date, to });
    sim.placements = sim.placements.map(x => x.id === p.id ? { ...x, date: to, order: 999 } : x);
    if (pr(date) <= targetPct) movedAtTarget = true;
  }
  return { moves, after: pr(date) };
}
export function applyMoves(s, moves) {
  const m = Object.fromEntries(moves.map(x => [x.id, x.to]));
  return { ...s, placements: s.placements.map(p => m[p.id] ? { ...p, date: m[p.id], order: 999, moves: (p.moves || 0) + 1 } : p) };
}
/** Planner assistant: overview + per-day details + concrete move suggestions. */
export function plannerAdvice(s, days) {
  const w = weekPressure(s, days); const sugg = [];
  const heavy = w.days.map((x, i) => ({ ...x, d: days[i] })).filter(x => x.pct > Math.max(90, x.limitPct));
  for (const h of heavy) { const r = planLighten(s, h.d, Math.min(85, h.limitPct), days); if (r.moves.length) sugg.push({ id: 'heavy-' + h.d, day: h.d, text: `فشار این روز ${E.toFa(h.pct)}٪ است. با ${E.toFa(r.moves.length)} جابه‌جایی به ${E.toFa(r.after)}٪ می‌رسد.`, moves: r.moves }); }
  for (const ex of upcomingExams(s)) {
    const before = addDays(ex.date, -1); if (!days.includes(before)) continue;
    const it = activeOn(s, before).filter(p => p.status !== 'done' && (INTENSITY[p.kind] ?? 1) >= 1);
    if (it.length) { const r = planLighten({ ...s, placements: s.placements.map(p => it.some(q => q.id === p.id) ? { ...p, u: 0 } : p) }, before, 25, days); if (r.moves.length) sugg.push({ id: 'pre-' + ex.id, day: before, text: `روز قبل از «${ex.title}» باید سبک باشد؛ کارهای سنگین را جلوتر ببر.`, moves: r.moves }); }
  }
  for (let i = 0; i < days.length; i++) { const items = activeOn(s, days[i]); let run = 1;
    for (let k = 1; k < items.length; k++) { run = items[k].subject && items[k].subject === items[k - 1].subject ? run + 1 : 1;
      if (run >= 3) { sugg.push({ id: 'mix-' + days[i], day: days[i], text: `${E.toFa(run)} کار پشت سر هم از ${items[k].subject}؛ ترتیب را مخلوط کن تا خسته نشوی.`, reorder: true }); break; } } }
  const light = w.days.map((x, i) => ({ ...x, d: days[i] })).filter(x => x.pct < 35 && !isOffDay(s, x.d));
  const heaviest = [...w.days.map((x, i) => ({ ...x, d: days[i] }))].sort((a, z) => z.pct - a.pct)[0];
  return { week: w, heaviest, light, suggestions: sugg };
}

// ---------- v7: mock-exam series → exams ----------
/** v9: mock exams are entered by their ORGANISER (قلم‌چی، ماز، گاج…), not by class. */
export const MOCK_PROVIDERS = [
  ['ghalamchi', 'قلم‌چی (کانون فرهنگی آموزش)'], ['maz', 'ماز'], ['gaj', 'گاج'], ['sanjesh', 'سنجش'], ['gozine2', 'گزینه ۲'], ['mahan', 'ماهان'],
  ['hamian', 'حامیان'], ['kheilisabz', 'خیلی سبز'], ['mehrmah', 'مهروماه'], ['school', 'آزمون مدرسه'], ['center', 'آزمون مرکز/آموزشگاه'], ['other', 'دیگر'],
];
export const providerName = id => MOCK_PROVIDERS.find(p => p[0] === id)?.[1]?.replace(/ \(.*\)$/, '') || (id && id !== 'other' ? id : '');
/** Map a section ({bookId,nodeIds} from me, or {textbookId,subjectId,tbRefs} from the hub) onto my active books. */
export function resolveMockSection(s, sec) {
  const act = s.books.filter(b => b.active !== false);
  if (sec.bookId) { const b = act.find(x => x.id === sec.bookId); return b ? { bookId: b.id, count: +sec.count || 0, nodeIds: (sec.nodeIds || []).filter(id => b.nodes.some(n => n.id === id)) } : null; }
  const b = act.find(x => sec.bookUid && x.uid === sec.bookUid) || act.find(x => sec.textbookId && x.textbookId === sec.textbookId) || act.find(x => sec.subjectId && x.subjectId === sec.subjectId);
  if (!b) return null; const refs = sec.tbRefs || [];
  const ids = leaves(b).filter(n => n.kind === 'topic' && BK.refsOf(b, n).some(r => refs.some(x => r === x || r.startsWith(x + '/') || x.startsWith(r + '/')))).map(n => n.id);
  return { bookId: b.id, count: +sec.count || 0, nodeIds: ids };
}
/** Keep one exam per (active series, round with topics). Rounds already sat are never rewritten. */
export function syncMockExams(s) {
  let exams = [...(s.exams || [])]; const keep = new Set();
  for (const ms of s.mockSeries || []) {
    if (ms.active !== true) continue; // hub series stay off until the student activates them
    for (const r of SC.mockRounds(ms)) {
      const key = `${ms.id}:${r.no}`; // v9: rounds whose topics are not announced yet still become exams (date blocked, prep later)
      if (r.date < addDays(todayStr(), -7) && !exams.some(e => e.mockKey === key)) continue; // activated mid-way: skip long-past rounds
      keep.add(key);
      const sections = r.sections.map(x => resolveMockSection(s, x)).filter(x => x && x.nodeIds.length && x.count > 0);
      const unresolved = r.sections.length - sections.length;
      const title = `${ms.provider && !ms.title.includes(providerName(ms.provider)) ? providerName(ms.provider) + ' · ' : ''}${ms.title}، مرحله ${E.toFa(r.no)}${r.title ? ` (${r.title})` : ''}`;
      const i = exams.findIndex(e => e.mockKey === key);
      if (i < 0) exams.push({ id: uid(), mockKey: key, mockSeriesId: ms.id, roundNo: r.no, kind: 'upcoming', title, date: r.date, target: ms.target || defaultTarget(s), sections, sittings: [], unresolved, fromHub: !!ms.fromHub, provider: ms.provider || null, topicsPending: !sections.length });
      else if (!(exams[i].sittings || []).length) exams[i] = { ...exams[i], title, date: r.date, sections: sections.length ? sections : exams[i].sections, unresolved, target: ms.target || exams[i].target, provider: ms.provider || null, topicsPending: !(sections.length || exams[i].sections?.length) };
    }
  }
  // series switched off / round removed → drop its exams that have no result yet
  exams = exams.filter(e => !e.mockKey || keep.has(e.mockKey) || (e.sittings || []).length);
  return { ...s, exams };
}
