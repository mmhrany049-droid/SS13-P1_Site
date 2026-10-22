// SS v13 — «مسیر رشد تست» (Test Pace Path). Replaces the fixed 10/15/20/30/40 ladder of the v12 «daily-tests» habit.
// Pure, deterministic functions: no Date.now inside (today is a parameter), null-safe on states without s.pace.
// Principle: nothing is changed silently — every decision carries its reasons, and «lighter» is always immediate.
import { attemptsOf, todayStr, addDays, daysBetween, baseCap } from './store.js';
import { dow } from './schedule.js';
import { scoreOf, lateNightDays, dropPoint, percentile } from './brain.js';
import { baselineTests } from './capacity.js';
import { PACE_CONST, newPace, clamp } from './paceState.js';
export { PACE_CONST, newPace };
const C = PACE_CONST;

// ---------- Persian text for reason / blocker codes ----------
export const REASON_FA = {
  freeze: 'یخ‌زدن فعال است؛ هیچ چیزی جریمه یا شمرده نمی‌شود', after_freeze: 'بعد از یخ‌زدن، یک روز سبک‌تر شروع می‌کنیم', student_lighter: 'خودت سبک‌تر خواستی؛ همین‌جا اعمال شد',
  calibrating: 'روزهای اول برای یادگرفتن سطح توست؛ عدد بالا نمی‌رود', protect: 'حالت حفاظت: اول حال خوب درس‌خواندن، بعد عدد', protect_lock: 'حالت حفاظت هنوز تمام نشده',
  miss2: 'دو روز پشت‌سر هم سخت بود؛ دو روز «شروع مجدد کوچک» بدون هیچ بدهی', miss3: 'چند روز جا ماند؛ رشد دست‌کم ۷ روز متوقف و یک گفتگوی کوتاه پیشنهاد می‌شود',
  recovering: 'در شروع مجدد کوچک هستی', recover_done: 'شروع مجدد خوب پیش رفت؛ با ۸۰٪ سطح راحت و رشد کندتر ادامه می‌دهیم', one_miss: 'یک روز جا ماند؛ بدون جریمه و بدون اضافه‌شدن به فردا',
  low_two_of_three: 'در سه روز اخیر دو روز کمتر از ۶۰٪ هدف انجام شد؛ هدف را سبک می‌کنیم', hard_twice: 'دو بار «خیلی سخت» گفتی؛ هدف را سبک می‌کنیم', growth_failed: 'افزایش قبلی پایدار نبود؛ به سطح راحت برمی‌گردیم',
  grow: 'چند روز پشت‌سر هم راحت انجام دادی و نشانهٔ مشکلی نبود', hold: 'همین عدد را نگه می‌داریم', catchup_day: 'پنجشنبه و جمعه روز جبرانی‌اند؛ عدد تغییر نمی‌کند',
  harder_ignored: 'درخواست «کمی بیشتر» الان اجرا نشد چون نشانهٔ نرمی روشن است', harder_ok: 'طبق درخواستت یک پله بیشتر',
  // blockers (why we did not grow)
  not_normal: 'هنوز در حالت عادی نیستی', few_data: 'هنوز دادهٔ کافی نیست (حداقل سه روز)', low_completion: 'هنوز سه روز از چهار روز اخیر هدف انجام نشده',
  accuracy_drop: 'دقت امروز از میانگین خودت پایین‌تر بود', fatigue: 'آخر روز دقتت افت کرده بود', blank_up: 'تعداد نزده‌هایت بیشتر از همیشه بود', late_night: 'دیشب دیر خوابیدی',
  energy_low: 'انرژی امروز پایین ثبت شد', exam_near: 'آزمون نزدیک است (یا دیروز بود)', difficulty_high: 'سختی دو روز اخیر زیاد بود', time_limit: 'این مقدار از زمان مطالعهٔ امروزت بیشتر می‌شود',
  gap: 'از آخرین افزایش هنوز سه روز نگذشته', no_checkin: 'چک پایان روز ثبت نشده', insufficient_baseline: 'هنوز برای مقایسهٔ دقت داده کم است', lock: 'قفل رشد هنوز تمام نشده', no_recent_data: 'امروز تستی ثبت نشده', one_dial: 'در هر هفته فقط یک دکمه بالا می‌رود',
};
export const reasonText = codes => (codes || []).map(c => REASON_FA[c] || c);

// ---------- raw day table (cached per state object) ----------
const real = s => (s?.sessions || []).filter(x => x && !x.legacy && !x.historical && x.at);
const countsAsTest = x => C.REVIEW_COUNTS_AS_TESTS || !['review', 'redo'].includes(x.origin);
const tcache = new WeakMap();
function table(s) {
  if (tcache.has(s)) return tcache.get(s);
  const days = new Map(); const sesDay = new Map();
  for (const x of real(s).filter(countsAsTest)) {
    const d = todayStr(new Date(x.at)); sesDay.set(x.id, d);
    const r = days.get(d) || { d, tests: 0, minutes: 0, arr: [] }; r.tests += Object.keys(x.answers || {}).length; r.minutes += x.minutes || 0; days.set(d, r);
  }
  if (days.size) for (const a of attemptsOf(s)) { if (a.isLegacy || a.historical || a.num == null || a.result === 'U' || !a.sessionId) continue; const d = sesDay.get(a.sessionId); if (d) days.get(d).arr.push(a); }
  for (const r of days.values()) r.arr.sort((x, y) => String(x.at).localeCompare(String(y.at)) || x.num - y.num);
  tcache.set(s, days); return days;
}
export const testsOn = (s, d) => table(s).get(d)?.tests || 0;

// ---------- calendar / planned days ----------
const weekdays = s => s?.pace?.weekdays || C.DEFAULT_WEEKDAYS;
export const isFrozen = (s, d) => { const f = s?.pace?.freeze; return !!f && d >= f.from && d <= f.to; };
export const isPlanned = (s, d) => !!s?.pace && weekdays(s).includes(dow(d)) && d >= (s.pace.startedAt || d) && !isFrozen(s, d);
export const checkOf = (s, d) => (s?.dailyChecks || []).find(c => c.d === d) || null;
const targetOn = (s, d) => (s?.pace?.history || []).find(r => r.d === d)?.target ?? s?.pace?.target ?? C.START_DEFAULT;
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

// ---------- one day's outcome ----------
function core(s, d) {
  const t = table(s).get(d); const target = targetOn(s, d); const done = t?.tests || 0; const arr = t?.arr || [];
  const N = arr.length; const Cc = arr.filter(a => a.result === 'C').length, W = arr.filter(a => a.result === 'W').length, B = arr.filter(a => a.result === 'B').length;
  const planned = isPlanned(s, d); const chk = checkOf(s, d);
  const completion = target > 0 ? Math.min(1, done / target) : 1;
  const nodata = planned && done === 0 && !chk;
  let fatigue = false;
  if (N >= C.FATIGUE_MIN_N) { const k = Math.floor(N / 3); fatigue = scoreOf(arr.slice(0, k)) - scoreOf(arr.slice(N - k)) >= C.FATIGUE_DROP; }
  return { d, target, done, completion, N, P: N ? 100 * scoreOf(arr) : null, blankRate: Cc + W + B ? B / (Cc + W + B) : null, fatigue, planned, nodata, miss: planned && !nodata && completion < C.MISS_BELOW };
}
export function dayOutcome(s, d) { const o = core(s, d); return { ...o, flags: softFlags(s, d) }; }
function plannedWithData(s, today, n) { // most recent first
  const out = []; for (let i = 0; i < 70 && out.length < n; i++) { const d = addDays(today, -i); if (!isPlanned(s, d)) continue; const o = core(s, d); if (o.done > 0) out.push(o); } return out;
}
const dataDays = (s, today) => { let k = 0; for (let i = 0; i < 70; i++) { const d = addDays(today, -i); if (isPlanned(s, d) && core(s, d).done > 0) k++; } return k; };
function baseStats(s, d) { // mean of P / blank over ≤ BASE_WINDOW earlier days with data
  const rows = []; for (let i = 1; i < 70 && rows.length < C.BASE_WINDOW; i++) { const o = core(s, addDays(d, -i)); if (o.N > 0) rows.push(o); }
  if (rows.length < C.BASE_MIN_DAYS) return { P: null, blank: null, n: rows.length };
  return { P: avg(rows.map(o => o.P)), blank: avg(rows.filter(o => o.blankRate != null).map(o => o.blankRate)), n: rows.length };
}
const diffsUpTo = (s, today, n) => (s?.dailyChecks || []).filter(c => c.d <= today && c.difficulty != null).sort((a, b) => b.d.localeCompare(a.d)).slice(0, n);
const lastGrowth = s => (s?.pace?.growth || []).reduce((m, g) => (!m || g.at > m.at ? g : m), null);
const daysSinceGrowth = (s, d) => { const g = lastGrowth(s); return g ? daysBetween(g.at, d) : Infinity; };

/** Soft signals that make us hold rather than grow (spec §2-5). */
export function softFlags(s, d) {
  const f = new Set(); const o = core(s, d); const base = baseStats(s, d); const chk = checkOf(s, d);
  if (o.N >= C.ACC_MIN_N && base.P != null && o.P < base.P - C.ACC_TOL) f.add('accuracy_drop');
  if (o.fatigue) f.add('fatigue');
  if (o.N >= 20 && base.blank != null && o.blankRate != null && o.blankRate - base.blank >= C.BLANK_UP / 100) f.add('blank_up');
  if (lateNightDays(s).has(addDays(d, -1))) f.add('late_night');
  if (chk?.energy != null && chk.energy <= 2) f.add('energy_low');
  if ((s.exams || []).some(e => { const k = daysBetween(d, e.date); return (k >= 1 && k <= C.EXAM_NEAR_DAYS) || k === -1; })) f.add('exam_near');
  const two = diffsUpTo(s, d, 2); if (two.length === 2 && avg(two.map(c => c.difficulty)) >= C.DIFF_HIGH) f.add('difficulty_high');
  const t = s.pace?.target; if (t && isPlanned(s, d) && t * C.MINUTES_PER_TEST > baseCap(s, d)) f.add('time_limit');
  if (daysSinceGrowth(s, d) < C.MIN_GAP_DAYS) f.add('gap');
  return f;
}
export function protectMode(s, today) {
  const p = s?.pace; const why = []; if (!p) return { on: false, triggered: false, why };
  const checks = [...(s.dailyChecks || [])].filter(c => c.d <= today).sort((a, b) => b.d.localeCompare(a.d));
  const l3 = checks.filter(c => c.liking != null).slice(0, 3);
  if (l3.length === 3 && l3.every(c => c.liking <= 2)) why.push('P1');
  if (checks.filter(c => c.missReason === 'no_desire' && daysBetween(c.d, today) >= 0 && daysBetween(c.d, today) < 7).length >= 3) why.push('P2');
  const d3 = checks.slice(0, 3); if (d3.filter(c => c.difficulty >= 4 && c.energy != null && c.energy <= 2).length >= 2) why.push('P3');
  const triggered = why.length > 0; const lock = p.lock?.why === 'protect' && p.lock.until >= today;
  if (triggered) return { on: true, triggered, why };
  if (lock) return { on: true, triggered: false, why: ['lock'] };
  if (p.mode === 'protect') { const mean = avg(l3.map(c => c.liking)); if (mean != null && mean < 3) return { on: true, triggered: false, why: ['liking_low'] }; }
  return { on: false, triggered: false, why };
}
export function consecutiveMiss(s, today) {
  let k = 0; for (let i = 0; i < 45; i++) { const d = addDays(today, -i); if (!isPlanned(s, d)) continue; const o = core(s, d); if (o.nodata) continue; if (o.miss) k++; else break; } return k;
}
/** Highest daily-test number that was kept ≥3 planned days in a row at ≥90% with difficulty ≤ 3. */
export function comfortLevel(s, today = todayStr()) {
  const rows = plannedWithData(s, today, 60).reverse(); let best = 0;
  for (let i = 0; i + 2 < rows.length; i++) { const w = rows.slice(i, i + 3); if (w.every(o => o.completion >= C.COMPLETE_OK && (checkOf(s, o.d)?.difficulty ?? 0) <= C.DIFF_OK)) best = Math.max(best, Math.min(...w.map(o => o.target))); }
  return Math.max(best, s?.pace?.comfort || 0) || s?.pace?.target || C.START_DEFAULT;
}
const oneDialBlocked = (s, today, kind) => (s?.pace?.growth || []).some(g => g.kind !== kind && daysBetween(g.at, today) >= 0 && daysBetween(g.at, today) < C.ONE_DIAL_DAYS);
export function readiness(s, today, { kind = 'tests', mode = null } = {}) {
  const p = s?.pace; const b = []; if (!p) return { ok: false, blockers: ['not_normal'], evidence: {} };
  const m = mode ?? p.mode; if (m !== 'normal' || (mode == null && (p.calibDaysLeft ?? 0) > 0)) b.push(m === 'calibrate' ? 'calibrating' : 'not_normal');
  const dd = dataDays(s, today); if (dd < C.MIN_DATA_DAYS) b.push('few_data');
  if (isPlanned(s, today) && core(s, today).done === 0) b.push('no_recent_data'); // a silent day never counts as progress
  const win = plannedWithData(s, today, C.GROW_WINDOW); const okN = win.filter(o => o.completion >= C.COMPLETE_OK).length;
  if (!win.length || okN < C.GROW_NEED || win[0].completion < C.COMPLETE_OK) b.push('low_completion');
  if (win.length) for (const f of softFlags(s, win[0].d)) b.push(f);
  const d3 = diffsUpTo(s, today, 3); if (!d3.length) b.push('no_checkin'); else if (avg(d3.map(c => c.difficulty)) > C.DIFF_OK) b.push('difficulty_high');
  if (baseStats(s, today).P == null && dd < C.BASE_MIN_DAYS) b.push('insufficient_baseline');
  if (protectMode(s, today).on) b.push('protect');
  if (oneDialBlocked(s, today, kind)) b.push('one_dial');
  if (p.lock && p.lock.until >= today) b.push('lock');
  const uniq = [...new Set(b)]; return { ok: !uniq.length, blockers: uniq, evidence: { dataDays: dd, window: win.map(o => ({ d: o.d, completion: o.completion })) } };
}
/** Personal growth factor: evaluate each unevaluated growth after ≥3 planned data days (spec updateGrowthRate). */
export function updateGrowthRate(s, today) {
  const p = s?.pace; if (!p || !(p.growth || []).some(g => !g.evaluated)) return s;
  let g = p.g, comfort = p.comfort; const growth = p.growth.map(r => {
    if (r.evaluated) return r;
    const rows = plannedWithData(s, today, 40).filter(o => o.d > r.at).reverse().slice(0, 3); if (rows.length < 3) return r;
    const diffs = rows.map(o => checkOf(s, o.d)?.difficulty).filter(v => v != null);
    const eased = rows.some(o => ['ease', 'recover'].includes((p.history || []).find(h => h.d === o.d)?.decision));
    const ok = avg(rows.map(o => o.completion)) >= C.COMPLETE_OK && (!diffs.length || avg(diffs) <= C.DIFF_OK) && !eased;
    if (ok) { g = Math.min(C.G_MAX, g * C.G_UP); comfort = Math.max(comfort || 0, r.to); } else g = Math.max(C.G_MIN, g * C.G_DOWN);
    return { ...r, evaluated: true, ok };
  });
  return { ...s, pace: { ...p, g, comfort, growth } };
}
export function missedPlan(s, today) {
  const miss = consecutiveMiss(s, today); const nd = (() => { let k = 0; for (let i = 0; i < 6; i++) { const d = addDays(today, -i); if (!isPlanned(s, d)) continue; if (core(s, d).nodata) k++; else break; } return k; })();
  const level = miss >= 3 ? 3 : miss; const plans = ['', 'یک روز جا ماند؛ بدون جریمه و بدون بدهی، فردا همان سطح راحت یا کمتر.', 'دو روز پشت‌سر هم: دو روز «شروع مجدد کوچک» با نصف سطح راحت (حداقل ۱۰ تست).', 'سه روز یا بیشتر: رشد دست‌کم ۷ روز متوقف و یک گفتگوی کوتاه سه‌سؤالی پیشنهاد می‌شود.'];
  return { level, plan: plans[level], askDialog: level >= 3, nodataDays: nd, gentlePing: nd >= 2 };
}

// ---------- the nightly decision ----------
function mk(p, decision, value, codes, extra = {}) {
  const v = extra.keepMin ? Math.round(value) : Math.max(C.RECOVER_MIN, Math.round(value));
  return { decision, value: v, codes, reasons: reasonText(codes), mode: extra.mode ?? p.mode, dial: p.dial || 'tests', lock: extra.lock !== undefined ? extra.lock : p.lock || null, ...extra };
}
/** Decision made on the evening of `today` for tomorrow. Pure and deterministic. */
export function decideTomorrow(s, today) {
  const p = s?.pace; const tomorrow = addDays(today, 1);
  if (!p) return { decision: 'hold', value: C.START_DEFAULT, codes: [], reasons: ['مسیر رشد هنوز فعال نشده'], mode: 'calibrate', dial: 'tests', lock: null, for: tomorrow, on: today };
  const fin = r => ({ ...r, for: tomorrow, on: today });
  const target = p.target, comfort = comfortLevel(s, today), chk = checkOf(s, today);
  // 1) freeze (illness / event): nothing is counted
  if (p.mode === 'freeze' && p.freeze) {
    if (today <= p.freeze.to) return fin(mk(p, 'hold', target, ['freeze'], { mode: 'freeze', keepMin: true }));
    return fin(mk(p, 'recover', C.EASE_FACTOR * comfort, ['after_freeze'], { mode: 'recover', recover: { left: 1, value: Math.max(C.RECOVER_MIN, Math.round(C.EASE_FACTOR * comfort)) }, freeze: null }));
  }
  // 1b) «lighter» requested by the student is applied at once
  if (chk?.tomorrow === 'lighter') return fin(mk(p, 'ease', C.EASE_FACTOR * target, ['student_lighter']));
  // Thursday / Friday (catch-up days): no growth, no miss
  if (!isPlanned(s, today)) return fin(mk(p, 'hold', target, ['catchup_day'], { keepMin: true }));
  // 2) calibration
  if (p.mode === 'calibrate') { const left = Math.max(0, Math.min(p.calibDaysLeft ?? C.CALIB_DAYS, C.CALIB_DAYS - dataDays(s, today))); if (left > 0) return fin(mk(p, 'hold', target, ['calibrating'], { mode: 'calibrate', calibLeft: left })); }
  const mode0 = p.mode === 'calibrate' ? 'normal' : p.mode;
  // 3) protect
  const pr = protectMode(s, today);
  if (pr.on) { const lock = pr.triggered ? { until: [p.lock?.until || '', addDays(today, C.PROTECT_DAYS)].sort().at(-1), why: 'protect' } : p.lock; return fin(mk(p, 'ease', Math.min(target, C.EASE_FACTOR * comfort), [pr.triggered ? 'protect' : 'protect_lock'], { mode: 'protect', lock, protect: pr })); }
  // 4) missed days
  const miss = consecutiveMiss(s, today);
  if (miss >= 2) {
    const value = Math.max(C.RECOVER_MIN, Math.round(C.RECOVER_FACTOR * comfort));
    return fin(mk(p, 'recover', value, [miss >= 3 ? 'miss3' : 'miss2'], { mode: 'recover', recover: { left: C.RECOVER_DAYS, value }, askDialog: miss >= 3, lock: miss >= 3 ? { until: addDays(today, C.PROTECT_DAYS), why: 'recover' } : p.lock, gDown: true }));
  }
  if (p.mode === 'recover') {
    const o = core(s, today); let left = p.recover?.left ?? C.RECOVER_DAYS; if (o.planned && !o.nodata && o.completion >= C.COMPLETE_OK) left -= 1;
    if (left <= 0) return fin(mk(p, 'ease', C.EASE_FACTOR * comfort, ['recover_done'], { mode: 'normal', recover: null, gDown: true, lock: p.lock?.why === 'recover' && p.lock.until >= tomorrow ? p.lock : null }));
    return fin(mk(p, 'recover', p.recover?.value ?? C.RECOVER_FACTOR * comfort, ['recovering'], { mode: 'recover', recover: { left, value: p.recover?.value ?? Math.max(C.RECOVER_MIN, Math.round(C.RECOVER_FACTOR * comfort)) } }));
  }
  if (miss === 1) return fin(mk(p, 'hold', Math.min(target, comfort), ['one_miss'], { mode: mode0 }));
  // a failed growth sends us back to the comfort level
  const lg = lastGrowth(s); if (lg && lg.evaluated && lg.ok === false && target > comfort) return fin(mk(p, 'ease', comfort, ['growth_failed'], { mode: mode0 }));
  // 5) ease
  const last3 = plannedWithData(s, today, 3);
  if (last3.filter(o => o.completion < C.COMPLETE_LOW).length >= 2) return fin(mk(p, 'ease', Math.min(target, C.EASE_FACTOR * comfort), ['low_two_of_three'], { mode: mode0 }));
  if (diffsUpTo(s, today, 3).filter(c => c.difficulty === 5).length >= 2) return fin(mk(p, 'ease', Math.min(target, C.EASE_FACTOR * comfort), ['hard_twice'], { mode: mode0 }));
  // 6) growth
  const r = readiness(s, today, { mode: mode0 }); const step = clamp(Math.round(target * p.g), C.STEP_MIN, C.STEP_MAX);
  const cap = v => (p.ceiling != null ? Math.min(v, p.ceiling) : v);
  const wantsMore = chk?.tomorrow === 'harder'; const flags = softFlags(s, today);
  const base = r.ok ? cap(target + step) : target; // what the system itself suggests for tomorrow
  if (wantsMore && !flags.size) { const value = cap(base + step * C.HARDER_MAX_STEPS); if (value > target) return fin(mk(p, 'grow', value, ['harder_ok'], { mode: mode0, step, growth: { kind: 'tests', from: target, to: value } })); }
  if (r.ok && base > target) return fin(mk(p, 'grow', base, ['grow'], { mode: mode0, step, growth: { kind: 'tests', from: target, to: base } }));
  if (wantsMore) return fin(mk(p, 'hold', target, ['harder_ignored', ...r.blockers], { mode: mode0 }));
  return fin(mk(p, 'hold', target, r.blockers.length ? r.blockers : ['hold'], { mode: mode0 }));
}
/** Apply a decision to the state (auto-accept or after the student confirmed it). */
export function applyDecision(s, dec) {
  const p = s?.pace; if (!p || !dec) return s;
  let g = p.g; if (dec.gDown) g = Math.max(C.G_MIN, g * C.G_DOWN);
  const growth = dec.growth ? [...(p.growth || []), { at: dec.on, kind: dec.growth.kind, from: dec.growth.from, to: dec.growth.to, evaluated: false, ok: null }].slice(-C.GROWTH_MAX) : p.growth || [];
  const next = { ...p, g, growth, target: dec.value, asOf: dec.for, mode: dec.mode ?? p.mode, lock: dec.lock === undefined ? p.lock : dec.lock, recover: dec.recover === undefined ? p.recover : dec.recover, freeze: dec.freeze === undefined ? p.freeze : dec.freeze,
    calibDaysLeft: dec.mode === 'calibrate' ? dec.calibLeft ?? p.calibDaysLeft : 0, nextTarget: null };
  if (next.lock && next.lock.until < dec.for) next.lock = null;
  return { ...s, pace: next };
}
/** Close one finished day: record its outcome, learn the growth factor, decide tomorrow (shown with reasons, applied at the next morning). */
export function closeDay(s, d, now = null) {
  let p = s?.pace; if (!p) return s; let cur = updateGrowthRate(s, d); p = cur.pace;
  const o = core(cur, d); const dec = decideTomorrow(cur, d);
  const row = { d, target: o.target, done: o.done, completion: +o.completion.toFixed(3), P: o.P == null ? null : +o.P.toFixed(1), blankRate: o.blankRate == null ? null : +o.blankRate.toFixed(3), fatigue: o.fatigue, decision: dec.decision };
  const history = [...p.history.filter(r => r.d !== d), row].sort((a, b) => a.d.localeCompare(b.d)).slice(-C.HISTORY_MAX);
  return { ...cur, pace: { ...p, history, lastClosed: d, nextTarget: { for: dec.for, value: dec.value, decision: dec.decision, reasons: dec.reasons, codes: dec.codes, at: now ? now.toISOString() : null, dec } } };
}
/** Morning roll-over: close every finished day since the last close, applying each decision in order. Idempotent. */
export function rollTo(s, today, now = null) {
  if (!s?.pace?.enabled) return s; let cur = s; const nt = cur.pace.nextTarget; if (nt && nt.for <= today && nt.dec) cur = applyDecision(cur, nt.dec); // last night's decision takes effect this morning
  const from = cur.pace.lastClosed ? addDays(cur.pace.lastClosed, 1) : cur.pace.startedAt;
  for (let d = from, i = 0; d < today && i < 400; d = addDays(d, 1), i++) { cur = closeDay(cur, d, now); cur = applyDecision(cur, cur.pace.nextTarget?.dec); }
  return cur;
}
/** Student actions. */
export function requestLighter(s, today) { const p = s.pace; if (!p) return s; const v = Math.max(C.RECOVER_MIN, Math.round(C.EASE_FACTOR * p.target)); return { ...s, pace: { ...p, target: v, asOf: today } }; }
export function setFreeze(s, from, to, why = '') { const p = s.pace; if (!p) return s; return { ...s, pace: { ...p, mode: 'freeze', freeze: { from, to, why } } }; }
export function endFreeze(s, today) { const p = s.pace; if (!p?.freeze) return s; return { ...s, pace: { ...p, freeze: { ...p.freeze, to: addDays(today, -1) } } }; }
export function saveDailyCheck(s, chk) { const row = { difficulty: null, energy: null, liking: null, tomorrow: null, missReason: null, note: null, ...chk, at: chk.at || null }; return { ...s, dailyChecks: [...(s.dailyChecks || []).filter(c => c.d !== row.d), row].sort((a, b) => a.d.localeCompare(b.d)).slice(-C.CHECKS_MAX) }; }
export function saveWeeklyCheck(s, row) { return { ...s, weeklyChecks: [...(s.weeklyChecks || []).filter(c => c.w !== row.w), row].sort((a, b) => a.w.localeCompare(b.w)).slice(-C.WEEKLY_MAX) }; }
export const setTarget = (s, v, today) => ({ ...s, pace: { ...s.pace, target: clamp(Math.round(v), C.RECOVER_MIN, 200), asOf: today } });
/** Weekly ceiling from the daily drop point (brain.dropPoint over days). */
export function updateCeiling(s) {
  const p = s?.pace; if (!p) return s; const seqs = [...table(s).values()].map(r => r.arr); const dp = dropPoint(seqs, { from: 20, step: 10, max: 250, minEach: 40, drop: 0.08 });
  return { ...s, pace: { ...p, ceiling: dp ? dp.k : null } };
}

// ---------- start point + onboarding ----------
export const ONBOARD_ITEMS = [
  { id: 'O1', group: 'a', fa: 'در یک روز درسی خوب معمولاً چند تست می‌زنی؟', type: 'single', options: ['0-10', '11-20', '21-35', '>35'], labels: ['۰ تا ۱۰', '۱۱ تا ۲۰', '۲۱ تا ۳۵', 'بیش از ۳۵'] },
  { id: 'O2', group: 'a', fa: 'وقتی پشت‌سر هم تست می‌زنی، بعد از حدود چند تست احساس می‌کنی دقتت می‌افتد؟', type: 'single', options: [10, 15, 25, 40, 'none'], labels: ['۱۰', '۱۵', '۲۵', '۴۰', 'حس نمی‌کنم'] },
  { id: 'O3', group: 'a', fa: 'معمولاً هر روز چند ساعت خالص درس می‌خوانی؟', type: 'number', min: 0.5, max: 12 },
  { id: 'O4', group: 'a', fa: 'بهترین ساعت روزت برای تست زدن؟', type: 'single', options: ['morning', 'noon', 'evening', 'night'], labels: ['صبح', 'ظهر', 'عصر', 'شب'] },
  { id: 'O5', group: 'b', fa: 'قبل از حدس زدن، گزینه‌های غلط را حذف می‌کنم.', type: 'scale5', key: 1 },
  { id: 'O6', group: 'b', fa: 'وقتی بین دو گزینه مانده‌ام ولی یکی را ترجیح می‌دهم، می‌زنم.', type: 'scale5', key: 1 },
  { id: 'O7', group: 'b', fa: 'روی یک تست سخت آن‌قدر می‌مانم که وقت بقیه کم می‌آید.', type: 'scale5', key: -1 },
  { id: 'O8', group: 'b', fa: 'صورت سؤال را دوباره می‌خوانم و واحد و علامت را چک می‌کنم.', type: 'scale5', key: 1 },
  { id: 'O9', group: 'b', fa: 'بعد از هر بلوک، دلیل غلط‌هایم را می‌نویسم یا بررسی می‌کنم.', type: 'scale5', key: 1 },
  { id: 'O10', group: 'b', fa: 'تستی را که بلدم ولی از ترس غلط نمی‌زنم، نزده می‌گذارم.', type: 'scale5', key: -1 },
  { id: 'O11', group: 'c', fa: 'بلوک‌های چند تایی برایت راحت‌ترند؟', type: 'single', options: [10, 15, 20, 30], labels: ['۱۰', '۱۵', '۲۰', '۳۰'] },
  { id: 'O12', group: 'c', fa: 'وقتی خسته می‌شوی معمولاً چه می‌کنی؟', type: 'single', options: ['rest', 'less', 'quit'], labels: ['استراحت کوتاه و ادامه', 'کم می‌کنم', 'رها می‌کنم'] },
  { id: 'O13', group: 'd', fa: 'تست زدن برایم بیشتر حس چالش دارد تا فشار.', type: 'scale5', key: 1 },
  { id: 'O14', group: 'd', fa: 'بعد از یک تست غلط، معمولاً ادامه می‌دهم.', type: 'scale5', key: 1 },
  { id: 'O15', group: 'd', fa: 'الان تست زدن را چقدر دوست داری؟ (۱ اصلاً … ۵ خیلی)', type: 'scale5', key: 1, scale: 'like' },
];
export const CALIB_SPEC = { n: 15, timed: true, showScore: false, note: '۱۵ تست از کتاب فعال خودت، زمان‌دار؛ فقط اندازه می‌گیریم، نمره نشان داده نمی‌شود.' };
export const buildOnboard = () => ({ items: ONBOARD_ITEMS, calibSpec: CALIB_SPEC });
const sc = (items, ans, ids) => { const v = ids.map(id => { const it = items.find(i => i.id === id); const a = ans?.[id]; if (a == null) return null; return it.key === -1 ? 6 - a : a; }).filter(x => x != null); return v.length ? Math.round((avg(v) - 1) / 4 * 100) : null; };
const O1MAP = { '0-10': 10, '11-20': 20, '21-35': 25, '>35': 30 };
export function scoreOnboard(items, answers, calib = null) {
  const a = answers || {}; const feeling = sc(items, a, ['O13', 'O14', 'O15']);
  const stamina = (() => { const parts = []; if (a.O1) parts.push(({ '0-10': 15, '11-20': 45, '21-35': 70, '>35': 90 })[a.O1]); if (a.O2) parts.push(a.O2 === 'none' ? 85 : clamp((a.O2 - 5) / 40 * 100, 0, 100)); if (a.O12) parts.push(({ rest: 80, less: 50, quit: 20 })[a.O12]); return parts.length ? Math.round(avg(parts)) : null; })();
  const scores = { stamina, strategy: sc(items, a, ['O5', 'O6', 'O7', 'O8', 'O9', 'O10']), feeling, accuracy: calib?.P ?? null, speed: calib?.secPerTest ?? null };
  const start = startTarget({ sessions: [], pace: null }, { answers: a }, calib);
  const fall = calib && calib.secondHalfP != null && calib.firstHalfP != null && calib.firstHalfP - calib.secondHalfP >= 8;
  let block = fall ? 10 : (() => { const c = [a.O11, typeof a.O2 === 'number' ? a.O2 : null].filter(x => x != null); return c.length ? clamp(Math.min(...c), 10, 30) : 15; })();
  let g0 = C.G0; if (feeling != null && feeling < 40) g0 = 0.07; else if (feeling != null && feeling > 70 && ['21-35', '>35'].includes(a.O1) && (a.O2 === 'none' || a.O2 >= 25)) g0 = 0.12;
  return { scores, startTarget: start, block, g0 };
}
/** First daily target. Without any input: 20. Real data (≥5 days) takes over from the questionnaire by wq = max(0, 1 − dataDays/10). */
export function startTarget(s, onboard = null, calib = null) {
  const a = onboard?.answers || {}; let base = C.START_DEFAULT; let q = null;
  if (a.O1 && O1MAP[a.O1] != null) { q = O1MAP[a.O1]; base = q; }
  const counts = [...table(s).values()].filter(r => r.tests > 0).sort((x, y) => x.d.localeCompare(y.d)).map(r => r.tests); const dd = counts.length;
  const data = baselineTests(counts);
  if (data != null) { const wq = q == null ? 0 : Math.max(0, 1 - dd / 10); base = data * (1 - wq) + q * wq; }
  if (calib && data == null && q == null && calib.P != null) base = C.START_DEFAULT;
  if (a.O3 != null) base = Math.min(base, Math.floor(0.5 * a.O3 * 60 / C.MINUTES_PER_TEST));
  return clamp(Math.round(base), C.START_MIN, C.START_MAX);
}
/** Create s.pace (idempotent). Seeds from the last 14 days (median) when the v12 daily-tests habit existed. */
export function ensurePace(s, today, { onboard = null, calib = null } = {}) {
  if (s.pace) return s; const sc0 = onboard ? scoreOnboard(ONBOARD_ITEMS, onboard.answers || {}, calib) : null;
  const start = startTarget(s, onboard, calib);
  const pace = newPace({ startedAt: today, start, g0: sc0?.g0 ?? C.G0, block: sc0?.block ?? 15, onboard: onboard ? { at: today, answers: onboard.answers || {}, scores: sc0?.scores || {}, calib } : null });
  return { ...s, pace, dailyChecks: s.dailyChecks || [], weeklyChecks: s.weeklyChecks || [] };
}

// ---------- patterns for the weekly review ----------
export function weeklyPatterns(s) {
  const days = [...table(s).values()]; const bands = { morning: [5, 12], noon: [12, 16], evening: [16, 21], night: [21, 29] };
  const hourOf = a => { const h = new Date(a.at).getHours(); return h < 5 ? h + 24 : h; };
  const all = days.flatMap(r => r.arr); const bandRows = Object.entries(bands).map(([k, [lo, hi]]) => { const arr = all.filter(a => { const h = hourOf(a); return h >= lo && h < hi; }); return { k, n: arr.length, score: arr.length >= 20 ? scoreOf(arr) : null }; });
  const bestHour = bandRows.filter(b => b.score != null).sort((x, y) => y.score - x.score)[0]?.k || null;
  const byDow = {}; for (const r of days) if (r.arr.length >= 10) (byDow[dow(r.d)] ||= []).push(100 * scoreOf(r.arr));
  const dowRows = Object.entries(byDow).filter(([, v]) => v.length >= 2).map(([k, v]) => ({ dow: +k, P: avg(v), n: v.length })).sort((x, y) => y.P - x.P);
  const dp = dropPoint(days.map(r => r.arr), { from: 20, step: 10, max: 250, minEach: 40, drop: 0.08 });
  const rec = days.filter(r => r.arr.length >= 10).sort((a, b) => a.d.localeCompare(b.d)).slice(-14).map(r => 100 * scoreOf(r.arr));
  const slope = rec.length >= 5 ? (avg(rec.slice(-Math.floor(rec.length / 2))) - avg(rec.slice(0, Math.floor(rec.length / 2)))) : null;
  return { bestHour, bands: bandRows, strongDays: dowRows.slice(0, 2), weakDays: dowRows.slice(-2).reverse(), dropPoint: dp ? dp.k : null, accTrend: slope };
}
export const weekOf = d => addDays(d, -((dow(d) + 1) % 7)); // Saturday-based week start
export { percentile };
