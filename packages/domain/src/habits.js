// v7 — Habit system (سیستم عادت): identify → choose target habits → auto-drafted plan → weekly program,
// break bad habits / build good ones, habit stage, «بهترین درصد ممکن», progress stages, personalised questionnaire.
// Research basis (see docs/handoff/reference/HABITS_RESEARCH_fa.md):
//   habit = cue-triggered automaticity (Wood & Neal 2007; Gardner 2012); automaticity measured with a short self-report
//   in the spirit of SRBAI (Gardner et al. 2012); time to automaticity: median ≈ 59–66 days, range 4–335 (Lally 2010;
//   Singh et al. 2024 meta-analysis); implementation intentions «اگر… آنگاه…» d≈0.65 (Gollwitzer & Sheeran 2006);
//   breaking habits works best by changing/removing the cue + a replacement routine (Wood & Rünger 2016);
//   learning strategies: retrieval practice, spacing, interleaving (Dunlosky 2013; Brunmair & Richter 2019);
//   procrastination (Steel 2007), test anxiety (Cassady & Johnson 2002; expressive writing: Ramirez & Beilock 2011),
//   brief self-control (Tangney 2004). Items here are SS's own Persian wording (unvalidated, non-clinical).
import * as E from './engine.js';
import { attemptsOf, behavior, todayStr, addDays, daysBetween, uid, DAY, sessionStats, upcomingExams, examForecast, isOffDay } from './store.js';
import { WEEKDAYS_FA, dow } from './schedule.js';

const ALL_DAYS = [6, 0, 1, 2, 3];
// ---------- templates ----------
// metric: how the app checks a day automatically from your data (manual tick always overrides)
export const TEMPLATES = [
  { id: 'daily-tests', deprecated: true, type: 'build', title: 'تست زدن روزانه', why: 'تست زدن منظم = تمرین بازیابی؛ قوی‌ترین روش یادگیری (Dunlosky 2013)', cue: 'وقتی ساعت مطالعه‌ام شروع شد و پشت میز نشستم', routine: 'اول یک بلوک تست زمان‌دار می‌زنم', reward: 'ثبت نتیجه و دیدن نوار پیشرفت', metric: 'tests',
    ladder: [[10, '۱۰ تست'], [15, '۱۵ تست'], [20, '۲۰ تست'], [30, '۳۰ تست'], [40, '۴۰ تست (دو بلوک)']], unit: 'تست', minutesPer: 1.6, weekdays: ALL_DAYS },
  { id: 'timed', type: 'build', title: 'تست زمان‌دار مثل سر جلسه', why: 'تمرین در شرایط آزمون انتقال به جلسه واقعی را بیشتر می‌کند و اضطراب را کم', cue: 'روزهای مشخص، اول جلسه دوم', routine: 'یک بلوک ۱۵ تستی با زمان‌سنج', reward: 'مقایسه سرعت با هفته قبل', metric: 'timed',
    ladder: [[1, '۱ بلوک در هفته، زمان ۱٫۳ برابر'], [2, '۲ بلوک، زمان ۱٫۱ برابر'], [3, '۳ بلوک، زمان استاندارد'], [4, '۴ بلوک، ۰٫۹ زمان استاندارد']], unit: 'بلوک', minutesPer: 25, weekdays: [0, 2] },
  { id: 'error-analysis', type: 'build', title: 'تحلیل خطا همان روز', why: 'تحلیل علت خطا مهم‌ترین منبع افزایش درصد است', cue: 'بلافاصله بعد از ثبت هر بلوک تست', routine: 'برای هر غلط و نزده دلیل می‌زنم', reward: '+۵ امتیاز بستن تحلیل', metric: 'analysis',
    ladder: [[50, 'نصف خطاها'], [75, '۷۵٪ خطاها'], [100, 'همه خطاها']], unit: '٪', minutesPer: 0.1, weekdays: ALL_DAYS },
  { id: 'review', type: 'build', title: 'مرور فاصله‌دار روزانه', why: 'مرور با فاصله جلوی فراموشی را می‌گیرد (اثر فاصله‌گذاری)', cue: 'اول هر جلسه مطالعه، قبل از درس جدید', routine: 'کارت‌های مرور سررسید را می‌زنم', reward: 'تمام شدن صف مرور', metric: 'review',
    ladder: [[5, '۵ کارت'], [10, '۱۰ کارت'], [20, '۲۰ کارت'], [30, 'کل صف سررسید']], unit: 'کارت', minutesPer: 1, weekdays: [6, 0, 1, 2, 3, 4, 5] },
  { id: 'start-on-time', type: 'build', title: 'شروع سر وقت (قانون ۲ دقیقه)', why: 'سخت‌ترین قسمت شروع است؛ کار خیلی کوچک شروع را خودکار می‌کند', cue: 'وقتی زنگ ساعت مطالعه زد', routine: 'فقط کتاب را باز می‌کنم و اولین تست را می‌خوانم', reward: 'تیک امروز', metric: 'started',
    ladder: [[2, '۲ دقیقه'], [10, '۱۰ دقیقه'], [25, '۲۵ دقیقه بی‌وقفه'], [60, 'یک جلسه کامل']], unit: 'دقیقه', minutesPer: 1, weekdays: ALL_DAYS },
  { id: 'mixed', type: 'build', title: 'تست مخلوط (چند مبحث با هم)', why: 'مخلوط زدن تشخیص نوع سؤال را تقویت می‌کند (Brunmair & Richter 2019)', cue: 'آخر هفته، بعد از جلسه اول', routine: 'یک بلوک تست مخلوط از مباحث هفته', reward: 'دیدن درصد مخلوط', metric: 'mixed',
    ladder: [[1, 'هفته‌ای ۱ بار'], [2, 'هفته‌ای ۲ بار'], [3, 'هفته‌ای ۳ بار']], unit: 'بلوک', minutesPer: 25, weekdays: [3] },
  { id: 'sleep', type: 'build', title: 'خواب منظم', why: 'خواب کافی برای تثبیت حافظه لازم است', cue: 'ساعت ۲۳:۰۰', routine: 'گوشی را بیرون اتاق می‌گذارم و می‌خوابم', reward: 'شروع صبح با انرژی', metric: 'sleep',
    ladder: [[1, 'خواب قبل از ۰۰:۳۰'], [2, 'خواب قبل از ۲۴:۰۰'], [3, 'خواب قبل از ۲۳:۳۰']], unit: '', minutesPer: 0, weekdays: [6, 0, 1, 2, 3, 4, 5] },
  // ----- bad habits to break (replacement routine + cue change) -----
  { id: 'phone', type: 'break', title: 'گوشی وسط مطالعه', why: 'هر بار چک کردن گوشی تمرکز را چند دقیقه از بین می‌برد', cue: 'نوتیفیکیشن یا حوصله‌سربر شدن تست', replacement: 'گوشی در اتاق دیگر؛ وسوسه را روی کاغذ می‌نویسم و در استراحت بین جلسه نگاه می‌کنم', removeCue: 'حالت پرواز + گوشی بیرون اتاق قبل از شروع', metric: 'manual', weekdays: [6, 0, 1, 2, 3, 4, 5],
    ladder: [[1, 'جلسه اول بدون گوشی'], [2, 'همه جلسه‌ها بدون گوشی'], [3, 'همه جلسه‌ها + استراحت کوتاه بدون شبکه اجتماعی']] },
  { id: 'procrastinate', type: 'break', title: 'دست‌دست کردن برای شروع', why: 'اهمال‌کاری با کار مبهم و بزرگ بیشتر می‌شود (Steel 2007)', cue: 'کار بزرگ یا مبهم', replacement: 'کار را به اولین قدم ۲ دقیقه‌ای تبدیل می‌کنم و همان را انجام می‌دهم', removeCue: 'برنامه امروز را شب قبل با کار دقیق می‌نویسم', metric: 'started', weekdays: ALL_DAYS,
    ladder: [[1, 'شروع با حداکثر ۱۵ دقیقه تأخیر'], [2, 'حداکثر ۵ دقیقه تأخیر'], [3, 'شروع سر وقت']] },
  { id: 'late-night', type: 'break', title: 'مطالعه بعد از نیمه‌شب', why: 'کم‌خوابی دقت و حافظه روز بعد را کم می‌کند', cue: 'عقب افتادن از برنامه', replacement: 'کار جامانده به روز جبرانی (پنج‌شنبه/جمعه) می‌رود، نه به نیمه‌شب', removeCue: 'آخرین جلسه را با زنگ ساعت تمام می‌کنم', metric: 'no-late', weekdays: [6, 0, 1, 2, 3, 4, 5],
    ladder: [[1, 'پایان قبل از ۰۱:۰۰'], [2, 'پایان قبل از ۲۴:۰۰'], [3, 'پایان قبل از ۲۳:۰۰']] },
  { id: 'random-guess', type: 'break', title: 'حدس بی‌حساب', why: 'هر غلط یک‌سوم یک درست را می‌سوزاند؛ حدس فقط وقتی سود دارد که گزینه‌ها را حذف کنی', cue: 'تست سخت و کمبود وقت', replacement: 'فقط بعد از حذف حداقل دو گزینه حدس می‌زنم', removeCue: 'دور اول: فقط مطمئن‌ها؛ دور دوم: تست‌های علامت‌دار', metric: 'guess', weekdays: ALL_DAYS,
    ladder: [[1, 'حدس فقط با حذف ۱ گزینه'], [2, 'حدس فقط با حذف ۲ گزینه']] },
  { id: 'careless', type: 'break', title: 'عجله و بی‌دقتی', why: 'بی‌دقتی، بد خواندن صورت و اشتباه محاسبه درصدی است که «بلد بودی»', cue: 'تست آسان یا عجله آخر وقت', replacement: 'زیر کلمه‌های کلیدی صورت خط می‌کشم و واحد/علامت را قبل از انتخاب گزینه چک می‌کنم', removeCue: 'هدف سرعت را فقط در بلوک‌های زمان‌دار دنبال می‌کنم', metric: 'careless', weekdays: ALL_DAYS,
    ladder: [[1, 'چک کردن در تست‌های آسان'], [2, 'چک کردن همه تست‌ها'], [3, 'چک کردن بدون افت سرعت']] },
  { id: 'over-blank', type: 'break', title: 'نزدن تست‌هایی که بلدم', why: 'وقتی دقتت بالاست، نزدن زیاد یعنی درصد از دست رفته', cue: 'ترس از غلط', replacement: 'اگر بین دو گزینه مانده‌ام و یکی را ترجیح می‌دهم، می‌زنم', removeCue: 'تحلیل هفتگی «نزده‌هایی که بلد بودم»', metric: 'blank', weekdays: ALL_DAYS,
    ladder: [[1, 'نزده زیر ۳۰٪'], [2, 'نزده زیر ۲۰٪'], [3, 'نزده زیر ۱۲٪']] },
  { id: 'cramming', type: 'break', title: 'شب امتحانی خواندن', why: 'فشرده خواندن آخر کار زود فراموش می‌شود؛ پخش کردن بهتر است', cue: 'نزدیک شدن آزمون', replacement: 'برنامه آمادگی آزمون را از دو هفته قبل تأیید می‌کنم', removeCue: 'آزمون‌های پیش‌رو را ثبت می‌کنم تا برنامه‌ریز زودتر بچیند', metric: 'manual', weekdays: ALL_DAYS,
    ladder: [[1, 'شروع آمادگی ۷ روز قبل'], [2, '۱۴ روز قبل'], [3, 'آمادگی پیوسته']] },
];
export const tpl = id => TEMPLATES.find(t => t.id === id) || null;

// ---------- stages (habit formation) ----------
export const STAGES = [
  { k: 0, name: 'آماده‌سازی', fa: 'هدف و نشانه تعیین شده، هنوز شروع نشده', factor: 0.1 },
  { k: 1, name: 'شروع', fa: 'هفته‌های اول؛ هر روز با یادآوری و تلاش', factor: 0.25 },
  { k: 2, name: 'تکرار', fa: 'منظم انجام می‌شود ولی هنوز به اراده نیاز دارد', factor: 0.5 },
  { k: 3, name: 'تثبیت', fa: 'بیشتر روزها بی‌فکر انجام می‌شود', factor: 0.75 },
  { k: 4, name: 'خودکار', fa: 'عادت شده؛ وقتش است مرحله بعد (دوز بالاتر) را شروع کنی', factor: 1 },
];
export const AUTO_ITEMS = ['این کار را خودبه‌خود انجام می‌دهم.', 'بدون اینکه کسی یا چیزی یادم بیندازد انجامش می‌دهم.', 'انجامش دادن فکر و تصمیم زیادی نمی‌خواهد.', 'قبل از اینکه متوجه شوم شروعش کرده‌ام.'];

const sessionsOnDay = (s, d) => s.sessions.filter(x => !x.legacy && !x.historical && todayStr(new Date(x.at)) === d);

// ---- v12 auto-check helpers (HABIT_ENGINE_SPEC.md) ----
export const isTimedSession = x => !!x.minutes && (x.timed === true || x.timeSource === 'timer' || x.timeSource === 'exam' || (x.limitMinutes > 0 && x.timeSource !== 'estimated' && x.timeSource !== 'none' && x.minutes <= x.limitMinutes * 1.1));
const hm = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
function plannedStart(s, d) { const ps = (s.placements || []).filter(p => p.date === d && (p.from || p.start)).map(p => hm(p.from || p.start)).filter(v => v != null); return ps.length ? Math.min(...ps) : null; }
function firstStart(ses) { const t = ses.map(x => { const z = new Date(x.at); return z.getHours() * 60 + z.getMinutes() - (x.minutes || 0); }); return t.length ? Math.min(...t) : null; }
function guessesOn(s, ses) { const ids = new Set(ses.map(x => x.id)); const g = attemptsOf(s).filter(a => ids.has(a.sessionId) && a.isGuess); return { n: g.length, right: g.filter(a => a.result === 'C').length }; }
/** Automatic check of one day from your data: true / false / null (no data → only manual). */
export function autoCheck(s, h, d) {
  const t = tpl(h.templateId); const dose = h.ladder?.[h.level ?? 0]?.[0] ?? 0; const ses = sessionsOnDay(s, d);
  switch (t?.metric || h.metric) {
    case 'tests': { const n = ses.reduce((a, x) => a + Object.keys(x.answers || {}).length, 0); return n ? n >= dose : (d < todayStr() ? false : null); }
    // v12 fix: a session with ANY minutes used to count as «timed». Now: a real timer (timed flag / timer source) or an
    // actual duration within +10% of the planned limit. Estimated/none time never counts. Days with sessions but no timed one → false.
    case 'timed': { if (!ses.length) return null; const ok = ses.some(isTimedSession); return ok ? true : (d < todayStr() || ses.length >= 2 ? false : null); }
    case 'mixed': return ses.some(x => x.mixed) || null;
    case 'analysis': { const st = ses.map(x => sessionStats(s, x)); const bad = st.reduce((a, x) => a + x.W + x.B, 0); if (!bad) return null; const done = ses.reduce((a, x) => a + Object.keys(x.reasons || {}).filter(k => (x.reasons[k] || []).length).length, 0); return 100 * done / bad >= dose; }
    case 'review': { const n = Object.values(s.reviews || {}).reduce((a, r) => a + (r.history || []).filter(z => todayStr(new Date(z.at)) === d).length, 0); return n ? n >= dose : null; }
    // v12 fix: «started» now compares the real start with the planned start (±10 min). Without a planned time, the old rule applies.
    case 'started': { const plan = plannedStart(s, d); const first = firstStart(ses); const p = (s.placements || []).filter(x => x.date === d && x.status === 'done');
      if (plan != null && first != null) return first <= plan + 10; if (plan != null && !ses.length && d < todayStr()) return false; return ses.length || p.length ? true : null; }
    case 'no-late': { const late = s.sessions.some(x => { const z = new Date(x.at); const h0 = z.getHours(); return h0 < 4 && todayStr(new Date(z.getTime() - 5 * 36e5)) === d; }); return late ? false : (ses.length ? true : null); }
    // v12 fix: «guess» used to answer null whenever a guess existed (never false). Now: ≥3 guesses → success only if at least
    // a third of them were right (better than blind 25%: options were eliminated). No guesses on a study day → true.
    case 'guess': { const g = guessesOn(s, ses); if (!g.n) return ses.length ? true : null; if (g.n < 3) return null; return g.right / g.n >= 1 / 3; }
    // v12 new: sleep = check-in (sleep hours / bedtime) or, without a check-in, no session after midnight that night.
    case 'sleep': { const c = (s.checkins || []).filter(x => x.date === d).at(-1); const need = s.settings?.sleepH || 8;
      if (c?.sleepH != null) return c.sleepH >= need - 0.5; if (c?.bedtime) { const [hh, mm] = String(c.bedtime).split(':').map(Number); const m = (hh < 12 ? hh + 24 : hh) * 60 + (mm || 0); return m <= 24 * 60; }
      const late = s.sessions.some(x => { const z = new Date(x.at); return z.getHours() < 5 && todayStr(new Date(z.getTime() - 6 * 36e5)) === d; }); return late ? false : (ses.length ? true : null); }
    case 'blank': { const st = ses.map(x => sessionStats(s, x)); const N = st.reduce((a, x) => a + x.N, 0); if (!N) return null; const B = st.reduce((a, x) => a + x.B, 0); const lim = [30, 20, 12][h.level ?? 0] ?? 20; return 100 * B / N < lim; }
    case 'careless': { const r = ses.flatMap(x => Object.values(x.reasons || {}).flat()); if (!r.length) return null; return r.filter(z => ['carelessness', 'misread', 'calculation'].includes(z)).length / r.length < 0.3; }
    default: return null;
  }
}
export const planned = (h, d) => (h.weekdays || []).includes(dow(d)) && d >= (h.startDate || d);
export function dayDone(s, h, d) { const m = h.log?.[d]; if (m === 1 || m === 0) return !!m; const a = autoCheck(s, h, d); return a; }
/** Adherence over the last n planned days (today excluded until done). */
export function adherence(s, h, n = 14, today = todayStr()) {
  const days = []; for (let i = 0, d = today; days.length < n && i < 120; i++, d = addDays(d, -1)) if (planned(h, d) && !(d === today && !dayDone(s, h, d))) days.push(d);
  if (!days.length) return { rate: null, n: 0, done: 0 };
  const done = days.filter(d => dayDone(s, h, d)).length; return { rate: done / days.length, n: days.length, done };
}
export function streak(s, h, today = todayStr()) { let k = 0; for (let d = today, i = 0; i < 400; i++, d = addDays(d, -1)) { if (!planned(h, d)) continue; const v = dayDone(s, h, d); if (v) k++; else if (d === today) continue; else break; } return k; }
export const lastAuto = h => { const a = (h.auto || []).at(-1); return a ? a.score : null; };
/** Stage from days since start + adherence + self-reported automaticity (1–5). */
export function habitStage(s, h, today = todayStr()) {
  if (!h.startDate || h.startDate > today) return { ...STAGES[0], next: 'از امروز شروع کن' };
  const days = daysBetween(h.startDate, today) + 1; const ad = adherence(s, h, 14, today).rate ?? 0; const au = lastAuto(h) ?? 1;
  let k = 1;
  if (days >= 14 && ad >= 0.6) k = 2;
  if (days >= 42 && ad >= 0.8 && au >= 3) k = 3;
  if (days >= 66 && ad >= 0.85 && au >= 4) k = 4;
  const need = [null, `۱۴ روز و پایبندی ۶۰٪ (الان ${E.toFa(days)} روز، ${E.toFa(Math.round(ad * 100))}٪)`, `۴۲ روز، پایبندی ۸۰٪ و خودکاری ۳ از ۵ (الان ${E.toFa(au.toFixed(1))})`, `۶۶ روز، پایبندی ۸۵٪ و خودکاری ۴ از ۵`, 'دوز را یک پله بالا ببر'][k];
  return { ...STAGES[k], days, adherence: ad, auto: au, next: need };
}
/** Suggest a ladder change: up after 10 planned days ≥80%, down after <50%. */
export function ladderAdvice(s, h) {
  const a = adherence(s, h, 10); if (a.n < 7) return null;
  if (a.rate >= 0.8 && (h.level ?? 0) < (h.ladder?.length || 1) - 1) return { dir: 1, text: `۱۰ روز اخیر ${E.toFa(Math.round(a.rate * 100))}٪ انجام شده؛ وقت پله بعد: ${h.ladder[(h.level ?? 0) + 1][1]}` };
  if (a.rate < 0.5 && (h.level ?? 0) > 0) return { dir: -1, text: `پایبندی ${E.toFa(Math.round(a.rate * 100))}٪ است؛ یک پله پایین بیا تا دوباره منظم شود. عقب‌گرد موقت شکست نیست.` };
  return null;
}

// ---------- identification from your own data ----------
export function detectHabits(s) {
  const atts = attemptsOf(s).filter(a => !a.isLegacy); const out = []; const beh = behavior(s, atts); const B = id => beh.find(b => b.id === id);
  const real = s.sessions.filter(x => !x.legacy && !x.historical);
  if (real.length >= 8) {
    const late = real.filter(x => new Date(x.at).getHours() < 4).length / real.length;
    if (late >= 0.15) out.push({ templateId: 'late-night', bad: true, evidence: `${E.toFa(Math.round(late * 100))}٪ جلسه‌ها بعد از نیمه‌شب ثبت شده`, strength: late > 0.3 ? 'قوی' : 'متوسط' });
    const days14 = new Set(real.filter(x => Date.now() - Date.parse(x.at) < 14 * DAY).map(x => todayStr(new Date(x.at)))).size;
    if (days14 < 7) out.push({ templateId: 'pace', bad: true, evidence: `فقط ${E.toFa(days14)} روز از ۱۴ روز اخیر تست ثبت شده`, strength: days14 < 4 ? 'قوی' : 'متوسط' });
    else if (days14 >= 11) out.push({ templateId: 'pace', bad: false, evidence: `${E.toFa(days14)} روز از ۱۴ روز اخیر تست زده‌ای`, strength: 'قوی' });
    const timed = real.filter(x => x.minutes).length / real.length;
    if (timed < 0.3) out.push({ templateId: 'timed', bad: true, evidence: `فقط ${E.toFa(Math.round(timed * 100))}٪ جلسه‌ها زمان‌دار بوده`, strength: 'متوسط' });
    const mixed = real.filter(x => x.mixed).length;
    if (mixed === 0 && real.length >= 15) out.push({ templateId: 'mixed', bad: true, evidence: 'هنوز بلوک تست مخلوط ثبت نکرده‌ای', strength: 'ضعیف' });
  }
  const g = atts.filter(a => a.isGuess && a.result !== 'U');
  if (g.length >= 15) { const q = g.filter(a => a.result === 'C').length / g.length; if (q <= 0.25) out.push({ templateId: 'random-guess', bad: true, evidence: `فقط ${E.toFa(Math.round(q * 100))}٪ حدس‌هایت درست بوده (زیر ۲۵٪ = ضرر)`, strength: q < 0.2 ? 'قوی' : 'متوسط' }); }
  const c = atts.filter(a => a.result !== 'U');
  if (c.length >= 40) {
    const C = c.filter(a => a.result === 'C').length, W = c.filter(a => a.result === 'W').length, Bk = c.filter(a => a.result === 'B').length; const acc = C / Math.max(1, C + W);
    if (Bk / c.length > 0.3 && acc > 0.6) out.push({ templateId: 'over-blank', bad: true, evidence: `${E.toFa(Math.round(100 * Bk / c.length))}٪ نزده با دقت ${E.toFa(Math.round(acc * 100))}٪ در زده‌ها`, strength: 'متوسط' });
    const rs = c.flatMap(a => a.reasons || []); if (rs.length >= 15) { const cl = rs.filter(r => ['carelessness', 'misread', 'calculation'].includes(r)).length / rs.length; if (cl >= 0.35) out.push({ templateId: 'careless', bad: true, evidence: `${E.toFa(Math.round(cl * 100))}٪ دلیل خطاها بی‌دقتی/بد خواندن/محاسبه است`, strength: cl > 0.5 ? 'قوی' : 'متوسط' }); }
  }
  const f = B('follow'); if (f && f.n >= f.minN) { const v = parseInt(E.normalizeDigits(f.value)); if (v < 40) out.push({ templateId: 'error-analysis', bad: true, evidence: `فقط ${E.toFa(v)}٪ خطاها تحلیل شده`, strength: 'قوی' }); else if (v >= 75) out.push({ templateId: 'error-analysis', bad: false, evidence: `${E.toFa(v)}٪ خطاها تحلیل شده`, strength: 'قوی' }); }
  const due = Object.values(s.reviews || {}).filter(r => r.dueAt && r.dueAt < Date.now() && !r.suspended).length; if (due >= 30) out.push({ templateId: 'review', bad: true, evidence: `${E.toFa(due)} کارت مرور عقب افتاده`, strength: 'متوسط' });
  for (const ex of (s.exams || []).filter(e => (e.sittings || []).length)) { const before = real.filter(x => { const k = daysBetween(todayStr(new Date(x.at)), ex.date); return k >= 0 && k <= 2; }).length; const base = real.filter(x => { const k = daysBetween(todayStr(new Date(x.at)), ex.date); return k > 2 && k <= 16; }).length / 14 * 3; if (before >= 6 && before > 2.5 * Math.max(1, base)) { out.push({ templateId: 'cramming', bad: true, evidence: `قبل از «${ex.title}» حجم تست ${E.toFa(Math.round(before / Math.max(1, base)))} برابر شد`, strength: 'متوسط' }); break; } }
  return out.map(x => ({ ...x, source: 'data', title: x.templateId === 'pace' ? 'مسیر رشد تست (جایگزین «تست روزانه»)' : tpl(x.templateId).title }));
}

// ---------- personalised questionnaire ----------
export const QUIZ_SCALE = ['هرگز', 'به‌ندرت', 'گاهی', 'اغلب', 'تقریباً همیشه'];
export const SUBSCALES = {
  procr: ['اهمال‌کاری و شروع دیرهنگام', 'Steel 2007; Tuckman 1991'], distract: ['حواس‌پرتی و گوشی', 'Wood & Rünger 2016'],
  testStrat: ['راهبرد سر جلسه (مدیریت زمان، دور اول/دوم، حذف گزینه)', 'Dodeen 2015; ادبیات test-wiseness'], careless: ['عجله و بی‌دقتی', 'تحلیل خطای SS'],
  anxiety: ['اضطراب امتحان (نگرانی و نشانه‌های بدنی)', 'Cassady & Johnson 2002; Driscoll 2007'], selfctrl: ['خودکنترلی و پایبندی', 'Tangney et al. 2004'],
  strategy: ['راهبرد یادگیری (بازیابی، فاصله‌گذاری، مخلوط)', 'Dunlosky et al. 2013'], routine: ['خواب و نظم روزانه', 'پژوهش‌های خواب و حافظه'],
};
// key: +1 = higher = more of the subscale's construct (procr/distract/careless/anxiety = bad; testStrat/selfctrl/strategy/routine = good)
export const BANK = [
  { id: 'p1', sub: 'procr', fa: 'کار درسی را تا آخرین لحظه عقب می‌اندازم.', key: 1, core: true },
  { id: 'p2', sub: 'procr', fa: 'وقتی ساعت مطالعه‌ام می‌رسد، بلافاصله شروع می‌کنم.', key: -1, core: true },
  { id: 'p3', sub: 'procr', fa: 'وقتی نمی‌دانم دقیقاً از کجا شروع کنم، کار را رها می‌کنم.', key: 1, tags: ['procr'] },
  { id: 'p4', sub: 'procr', fa: 'به خودم می‌گویم «بعداً جبران می‌کنم» ولی نمی‌کنم.', key: 1, tags: ['procr', 'lowC'] },
  { id: 'd1', sub: 'distract', fa: 'وسط مطالعه گوشی‌ام را چک می‌کنم.', key: 1, core: true },
  { id: 'd2', sub: 'distract', fa: 'وقتی تست سخت می‌شود، سراغ کار دیگری (گوشی، خوراکی، …) می‌روم.', key: 1, core: true },
  { id: 'd3', sub: 'distract', fa: 'گوشی را قبل از مطالعه از دسترس دور می‌کنم.', key: -1, tags: ['phone'] },
  { id: 'd4', sub: 'distract', fa: 'یک بلوک ۲۰ دقیقه‌ای را بدون قطع شدن تمام می‌کنم.', key: -1, tags: ['phone', 'procr'] },
  { id: 't1', sub: 'testStrat', fa: 'سر جلسه اول تست‌هایی را که مطمئنم می‌زنم و بعد سراغ بقیه می‌روم.', key: 1, core: true },
  { id: 't2', sub: 'testStrat', fa: 'روی یک تست سخت آن‌قدر می‌مانم که برای بقیه وقت کم می‌آورم.', key: -1, core: true },
  { id: 't3', sub: 'testStrat', fa: 'قبل از حدس زدن، گزینه‌های غلط را حذف می‌کنم.', key: 1, tags: ['guess'] },
  { id: 't4', sub: 'testStrat', fa: 'بدون حذف گزینه، فقط برای اینکه نزده نماند حدس می‌زنم.', key: -1, tags: ['guess'] },
  { id: 't5', sub: 'testStrat', fa: 'تستی را که بین دو گزینه مانده‌ام و یکی را ترجیح می‌دهم، نزده می‌گذارم.', key: -1, tags: ['blank'] },
  { id: 't6', sub: 'testStrat', fa: 'برای هر درس سر جلسه زمان مشخصی در نظر می‌گیرم.', key: 1, tags: ['konkur'] },
  { id: 'c1', sub: 'careless', fa: 'تستی را که بلد بودم به خاطر بد خواندن صورت غلط می‌زنم.', key: 1, core: true },
  { id: 'c2', sub: 'careless', fa: 'قبل از انتخاب گزینه، واحد، علامت و «نیست/است» صورت را چک می‌کنم.', key: -1, core: true },
  { id: 'c3', sub: 'careless', fa: 'وقتی وقت کم می‌آید، محاسبه‌ها را با عجله و ذهنی انجام می‌دهم.', key: 1, tags: ['careless'] },
  { id: 'a1', sub: 'anxiety', fa: 'قبل از آزمون آن‌قدر نگرانم که تمرکزم به هم می‌ریزد.', key: 1, core: true },
  { id: 'a2', sub: 'anxiety', fa: 'سر جلسه چیزهایی که بلد بودم یادم می‌رود.', key: 1, core: true },
  { id: 'a3', sub: 'anxiety', fa: 'سر جلسه قلبم تند می‌زند یا دستم می‌لرزد.', key: 1, tags: ['highN'] },
  { id: 'a4', sub: 'anxiety', fa: 'بعد از یک تست غلط، بقیه آزمون را هم خراب می‌کنم.', key: 1, tags: ['highN', 'konkur'] },
  { id: 's1', sub: 'selfctrl', fa: 'وقتی برنامه‌ای می‌گذارم، تا آخر هفته پایش می‌مانم.', key: 1, core: true },
  { id: 's2', sub: 'selfctrl', fa: 'کارهای خوشایند لحظه‌ای مرا از هدف بلندمدتم دور می‌کنند.', key: -1, core: true },
  { id: 's3', sub: 'selfctrl', fa: 'وقتی خسته‌ام هم کار کوچکی از برنامه را انجام می‌دهم.', key: 1, tags: ['lowC'] },
  { id: 'g1', sub: 'strategy', fa: 'به جای دوباره خواندن درسنامه، خودم را با تست و سؤال امتحان می‌کنم.', key: 1, core: true },
  { id: 'g2', sub: 'strategy', fa: 'خطاهایم را چند روز بعد دوباره حل می‌کنم.', key: 1, core: true },
  { id: 'g3', sub: 'strategy', fa: 'مبحثی را که تمام کرده‌ام دیگر مرور نمی‌کنم تا امتحان.', key: -1, tags: ['review'] },
  { id: 'g4', sub: 'strategy', fa: 'تست‌های چند مبحث را مخلوط با هم می‌زنم.', key: 1, tags: ['mixed'] },
  { id: 'g5', sub: 'strategy', fa: 'بعد از هر بلوک تست، دلیل غلط‌ها و نزده‌ها را می‌نویسم.', key: 1, tags: ['analysis'] },
  { id: 'r1', sub: 'routine', fa: 'شب‌های قبل از مدرسه کمتر از ۷ ساعت می‌خوابم.', key: -1, core: true },
  { id: 'r2', sub: 'routine', fa: 'ساعت مطالعه‌ام هر روز تقریباً ثابت است.', key: 1, core: true },
  { id: 'r3', sub: 'routine', fa: 'وقتی عقب می‌افتم تا دیروقت شب بیدار می‌مانم و درس می‌خوانم.', key: -1, tags: ['late'] },
];
const SUBJ_ITEMS = sub => [
  { id: `x-${sub}-1`, sub: 'anxiety', fa: `وقتی به تست‌های ${sub} می‌رسم، احساس می‌کنم «این را نمی‌توانم».`, key: 1, personal: true },
  { id: `x-${sub}-2`, sub: 'procr', fa: `مطالعه ${sub} را بیشتر از درس‌های دیگر عقب می‌اندازم.`, key: 1, personal: true },
];
/** Build MY item set: core items + extra items for what my data/profile flags + my weakest subject. */
export function buildQuiz(s, ipipTraits = null) {
  const det = detectHabits(s); const tags = new Set();
  const map = { 'late-night': 'late', 'random-guess': 'guess', 'over-blank': 'blank', careless: 'careless', 'error-analysis': 'analysis', review: 'review', mixed: 'mixed', 'daily-tests': 'procr', phone: 'phone' };
  for (const d of det.filter(x => x.bad)) if (map[d.templateId]) tags.add(map[d.templateId]);
  if (ipipTraits?.C && ipipTraits.C.sc < 45) tags.add('lowC'); if (ipipTraits?.N && ipipTraits.N.sc > 55) tags.add('highN');
  if ((s.me?.grade || 11) >= 11 || (s.mockSeries || []).length) tags.add('konkur');
  if (!det.length) ['procr', 'phone', 'guess', 'review'].forEach(t => tags.add(t)); // no data yet → ask more broadly
  const items = BANK.filter(i => i.core || (i.tags || []).some(t => tags.has(t)));
  const weak = weakestSubject(s); if (weak) items.push(...SUBJ_ITEMS(weak));
  return { items, tags: [...tags], weak, detected: det };
}
function weakestSubject(s) {
  const by = {}; for (const ses of s.sessions.slice(-80)) { const b = s.books.find(x => x.id === ses.bookId); if (!b) continue; const st = sessionStats(s, ses); if (st.P == null) continue; (by[b.subject] ||= []).push(st.P); }
  const arr = Object.entries(by).filter(([, v]) => v.length >= 3).map(([k, v]) => [k, v.reduce((a, x) => a + x, 0) / v.length]).sort((a, z) => a[1] - z[1]);
  return arr[0]?.[0] || null;
}
export function scoreQuiz(items, ans) {
  const by = {}; for (const it of items) { const v = ans[it.id]; if (!v) continue; (by[it.sub] ||= []).push(it.key < 0 ? 6 - v : v); }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => { const m = v.reduce((a, x) => a + x, 0) / v.length; const sc = (m - 1) / 4 * 100; const band = 1.96 * 18 * Math.sqrt(1 - 0.7) / Math.sqrt(Math.max(1, v.length / 3)); return [k, { sc, lo: Math.max(0, sc - band), hi: Math.min(100, sc + band), n: v.length }]; }));
}
/** Turn questionnaire scores into concrete habit suggestions with the reason. */
export function quizFindings(sc) {
  const out = []; const hi = k => sc[k] && sc[k].sc >= 60, lo = k => sc[k] && sc[k].sc <= 40;
  if (hi('procr')) out.push({ templateId: 'procrastinate', text: 'شروع دیرهنگام الگوی غالب توست؛ با «قانون ۲ دقیقه» و برنامه شب قبل شروع کن.' }, { templateId: 'start-on-time' });
  if (hi('distract')) out.push({ templateId: 'phone', text: 'حواس‌پرتی بالاست؛ حذف نشانه (گوشی بیرون اتاق) از اراده مؤثرتر است.' });
  if (lo('testStrat')) out.push({ templateId: 'timed', text: 'راهبرد سر جلسه ضعیف است؛ تست زمان‌دار با دو دور (مطمئن‌ها، بعد علامت‌دارها) تمرین کن.' }, { templateId: 'random-guess' });
  if (hi('careless')) out.push({ templateId: 'careless', text: 'بی‌دقتی درصدی است که بلد بودی؛ چک‌لیست ۳ ثانیه‌ای صورت سؤال را عادت کن.' });
  if (hi('anxiety')) out.push({ templateId: 'timed', text: 'اضطراب امتحان بالاست؛ آزمون‌های شبیه‌سازی‌شده بیشتر و ۱۰ دقیقه نوشتن نگرانی‌ها قبل از آزمون (Ramirez & Beilock 2011). اگر اضطراب زندگی روزمره را مختل می‌کند با مشاور مدرسه صحبت کن.' });
  if (lo('selfctrl')) out.push({ templateId: null, text: 'خودکنترلی پایین‌تر است؛ پله‌های عادت را کوچک‌تر شروع کن و فقط یک عادت جدید در هر زمان.' });
  if (lo('strategy')) out.push({ templateId: 'review', text: 'روش یادگیری بیشتر «دوباره خواندن» است؛ مرور فاصله‌دار و تست مخلوط اضافه کن.' }, { templateId: 'error-analysis' });
  if (lo('routine')) out.push({ templateId: 'sleep', text: 'خواب و نظم روزانه ضعیف است؛ ساعت ثابت مطالعه و پایان قبل از نیمه‌شب.' }, { templateId: 'late-night' });
  const seen = new Set(); return out.filter(x => !x.templateId || (seen.has(x.templateId) ? false : seen.add(x.templateId)));
}

// ---------- create a habit + its auto-drafted plan ----------
/** Start level chosen from what you already do (e.g. average tests/day over 14 days). */
function startLevel(s, t) {
  if (t.metric !== 'tests') return 0;
  const real = s.sessions.filter(x => !x.legacy && !x.historical && Date.now() - Date.parse(x.at) < 14 * DAY);
  const perDay = real.reduce((a, x) => a + Object.keys(x.answers || {}).length, 0) / 14;
  let k = 0; t.ladder.forEach(([v], i) => { if (perDay * 1.1 >= v) k = Math.min(i + 1, t.ladder.length - 1); }); return k;
}
export function newHabit(s, templateId, extra = {}) {
  const t = tpl(templateId) || { id: null, type: extra.type || 'build', title: extra.title || 'عادت جدید', ladder: [[1, 'قدم ۱'], [2, 'قدم ۲'], [3, 'قدم ۳']], weekdays: ALL_DAYS, cue: '', routine: '', metric: 'manual' };
  const best = behavior(s, attemptsOf(s)).find(b => b.id === 'best');
  return { id: uid(), templateId: t.id, type: t.type, title: t.title, goal: extra.goal || '', cue: t.cue || '', routine: t.routine || '', replacement: t.replacement || '', removeCue: t.removeCue || '', reward: t.reward || '',
    weekdays: [...(t.weekdays || ALL_DAYS)], at: extra.at || '', ladder: t.ladder.map(x => [...x]), level: startLevel(s, t), startDate: extra.startDate || todayStr(), log: {}, auto: [], active: true,
    bestHour: best?.value && best.value !== 'تفاوت معنادار نیست' ? best.value : null, minutesPer: t.minutesPer ?? 0, unit: t.unit || '', ...extra };
}
/** «پیش‌نویس چگونه رسیدن»: built automatically from the template + your data, no input needed. */
export function draftPlan(s, h) {
  const t = tpl(h.templateId) || {}; const L = h.ladder[h.level ?? 0];
  const steps = [];
  const when = h.at ? `ساعت ${E.toFa(h.at)}` : h.bestHour ? `در بازه «${h.bestHour}» که بهترین درصدهایت را آنجا داری` : 'در اولین جلسه مطالعه روز';
  if (h.type === 'build') {
    steps.push(`نیت اجرایی: «اگر ${h.cue || when}، آنگاه ${h.routine || h.title}.»`);
    steps.push(`دوز فعلی: ${L?.[1] || ''}. کوچک شروع کن؛ اول منظم بودن مهم است، بعد مقدار.`);
    steps.push(`زمان: ${when}، روزهای ${h.weekdays.map(d => WEEKDAYS_FA.find(w => w[0] === d)?.[1]).filter(Boolean).join('، ')}.`);
    if (h.reward) steps.push(`پاداش فوری: ${h.reward}.`);
  } else {
    steps.push(`نشانه را بشناس: ${h.cue}.`);
    if (h.removeCue) steps.push(`نشانه را حذف یا سخت کن: ${h.removeCue}.`);
    steps.push(`رفتار جایگزین: «اگر ${h.cue}، آنگاه ${h.replacement}.»`);
    steps.push(`مرحله فعلی: ${L?.[1] || ''}.`);
  }
  steps.push('قانون جاماندن: یک روز جا ماندن عیبی ندارد؛ هرگز دو روز پشت هم نه.');
  steps.push('هر هفته ۴ سؤال خودکاری را جواب بده تا مرحله عادت دقیق‌تر شود.');
  const ladder = h.ladder.map(([, lbl], i) => ({ i, label: lbl, state: i < (h.level ?? 0) ? 'done' : i === (h.level ?? 0) ? 'now' : 'next' }));
  return { steps, ladder, why: t.why || h.goal || '', eta: 'معمولاً حدود ۲ ماه (میانه ۵۹ تا ۶۶ روز) تا خودکار شدن طول می‌کشد، ولی بین افراد از ۴ تا بیش از ۳۰۰ روز فرق دارد؛ کند بودن تو طبیعی است.' };
}
/** Weekly program: build-habits become planner tasks (draft) on their weekdays, at their time if set. */
export function habitPlacements(s, h, days) {
  if (h.type !== 'build' || h.active === false) return [];
  const t = tpl(h.templateId) || {}; const dose = h.ladder[h.level ?? 0]?.[0] ?? 0;
  const perWeek = t.metric === 'timed' || t.metric === 'mixed' ? dose : null; let placed = 0;
  const minutes = Math.max(10, Math.round((t.metric === 'timed' || t.metric === 'mixed' ? 1 : dose) * (h.minutesPer || 1))) || 15;
  return days.filter(d => (h.weekdays || []).includes(dow(d)) && !(s.placements || []).some(p => p.habitId === h.id && p.date === d) && (t.id !== 'sleep'))
    .filter(() => perWeek == null || placed++ < perWeek)
    .map(d => ({ id: uid(), date: d, order: -1, title: `عادت: ${h.title}${h.ladder[h.level ?? 0] ? ` (${h.ladder[h.level ?? 0][1]})` : ''}`, minutes: Math.min(120, minutes), kind: 'عادت', habitId: h.id, at: h.at || null, status: 'draft', source: 'habit', reason: draftPlan(s, h).steps[0] }));
}
/** v13: the daily-tests habit is replaced by the pace path — one draft task per planned day with today's target (never a fixed ladder). */
export function pacePlacements(s, days) {
  const p = s.pace; if (!p?.enabled || p.mode === 'freeze') return [];
  return days.filter(d => (p.weekdays || ALL_DAYS).includes(dow(d)) && !(s.placements || []).some(x => x.habitId === 'pace' && x.date === d))
    .map(d => { const nt = p.nextTarget; const v = Math.round(nt && nt.for <= d && d > (p.asOf || '') ? nt.value : p.target); return { id: uid(), date: d, order: -1, title: `تست روزانه: ${E.toFa(v)} تست`, minutes: Math.max(10, Math.min(120, Math.round(v * 1.6))), kind: 'عادت', habitId: 'pace', at: null, status: 'draft', source: 'habit', reason: `مسیر رشد · بلوک پیشنهادی ${E.toFa(p.block || 15)} تست` }; });
}
/** Daily rules shown on the planner day card for habits that are not tasks (break habits, sleep). */
export const dayRules = (s, d) => (s.habits?.list || []).filter(h => h.active !== false && planned(h, d) && (h.type === 'break' || h.templateId === 'sleep')).map(h => ({ id: h.id, text: h.type === 'break' ? h.replacement : h.ladder[h.level ?? 0]?.[1], title: h.title }));

// ---------- «بهترین درصد ممکن» ----------
/** Realistic best percent given ALL your data and the stage of your habits.
 *  current = Konkur percent of recent tests; potential = what is recoverable (careless errors, smart answering of
 *  blanks, your own demonstrated best sessions); bestNow = current + (potential − current) × habit factor. */
export function bestPossible(s, opts = {}) {
  const since = Date.now() - (opts.days || 60) * DAY;
  const atts = attemptsOf(s).filter(a => !a.isLegacy && a.result !== 'U' && Date.parse(a.at) >= since);
  const habits = (s.habits?.list || []).filter(h => h.active !== false);
  const factor = habits.length ? habits.reduce((a, h) => a + habitStage(s, h).factor, 0) / habits.length : STAGES[0].factor;
  const calc = arr => {
    const N = arr.length; if (N < 20) return null;
    const C = arr.filter(a => a.result === 'C').length, W = arr.filter(a => a.result === 'W').length, B = N - C - W;
    const cur = E.percent(C, W, N);
    const careless = arr.filter(a => a.result === 'W' && (a.reasons || []).some(r => ['carelessness', 'misread', 'calculation'].includes(r))).length;
    const gCareless = careless * 4 / (3 * N) * 100;
    const q = C / Math.max(1, C + W); const gBlank = Math.max(0, (3 * q - (1 - q))) * B * 0.3 / (3 * N) * 100; // ~30% of blanks are «half-known»
    const ses = [...new Set(arr.map(a => a.sessionId))].map(id => s.sessions.find(x => x.id === id)).filter(Boolean).map(x => sessionStats(s, x)).filter(x => x.N >= 8 && x.P != null).map(x => x.P).sort((a, z) => a - z);
    const top = ses.length >= 5 ? ses[Math.floor(ses.length * 0.8)] : cur;
    const potential = Math.min(100, Math.max(top, cur + gCareless + gBlank));
    return { N, current: cur, potential, bestNow: cur + (potential - cur) * factor, parts: { careless: gCareless, blank: gBlank, top } };
  };
  const all = calc(atts);
  const subs = [...new Set(atts.map(a => a.subject))].map(sub => ({ subject: sub, ...(calc(atts.filter(a => a.subject === sub)) || {}) })).filter(x => x.N);
  let exam = null; const ex = upcomingExams(s)[0];
  if (ex) { try { const fc = examForecast(s, ex, attemptsOf(s), { runs: 400 }); if (fc) { const P50 = fc.sim.total.P50, P90 = fc.sim.total.P90; exam = { title: ex.title, date: ex.date, P50, P90, best: P50 + (P90 - P50) * factor }; } } catch { /* */ } }
  return { ok: !!all, factor, habits: habits.length, ...(all || {}), bySubject: subs.sort((a, z) => a.current - z.current), exam };
}
/** Overall test-skill progress stages (D) derived from the best-possible numbers. */
export const SKILL_STAGES = [[0, 'پایه: تسلط بر مفاهیم و درسنامه'], [20, 'تست‌های ساده و منظم'], [40, 'تست‌های متوسط + تحلیل خطا'], [60, 'سرعت و دقت در شرایط آزمون'], [80, 'تست‌های سخت و پایداری در آزمون جامع']];
export function skillStage(p) { let k = 0; SKILL_STAGES.forEach(([v], i) => { if ((p ?? 0) >= v) k = i; }); return { k, name: SKILL_STAGES[k][1], next: SKILL_STAGES[k + 1] || null }; }
