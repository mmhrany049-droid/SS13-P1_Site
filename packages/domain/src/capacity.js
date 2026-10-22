// SS 10 — «موتور توان» (capacity engine): the MAIN job of the habit system.
// It answers: how much work and how many tests can THIS student really do — this week, on each day, in one block?
// and turns the answer into «این هفته ۱۵٪ سبک‌تر», «پنج‌شنبه ۲۰٪ سبک‌تر», «حداکثر ۴۵ تست در روز», «بلوک‌های ۱۵ تستی».
// Inputs (all optional; the less data, the closer to the research prior and the lower the confidence):
//   • plan history: planned vs ticked tasks per day and the day's load → a learned neuron P(task done | load, context)
//   • test volume: tests per day and the within-day / within-block accuracy curve (fatigue point)
//   • questionnaires: self-control, procrastination, test anxiety, session preference, efficacy (brain.psychSignals)
//   • habits: their stage (automatic habits allow growth), late-night sessions, energy check-ins, exams ahead
// Output is a SUGGESTION until applied; applied capacity only affects NEW proposals (approved plans never move silently).
import { todayStr, addDays, daysFromTo, weekEnd, isOffDay, upcomingExams, daysBetween } from './store.js';
import { snapshot, trainNeuron, logit, dropPoint, percentile, lateNightDays, scoreOf } from './brain.js';
import { habitStage } from './habits.js';
import { capacityFactor } from './store.js';
export { capacityFactor };

export const TARGET = 0.8;               // we size a day so that ≈80% of its tasks get done (success breeds habit)
export const PLANNER_FILL = 0.85;        // the planner fills a day to 85% of its cap
export const CLAMP = [0.5, 1.15];
const F = ['bias', 'load', 'off', 'examSoon', 'lateBefore', 'recent', 'habit', 'energy'];
const round5 = x => Math.round(x * 20) / 20;
const clamp = (x, [a, b]) => Math.max(a, Math.min(b, x));

/** Research-based prior weights, shifted by questionnaires (they only move the PRIOR; behaviour wins with data). */
export function priorFor(s) {
  const p = snapshot(s).psych; let bias = 3.0; const why = [];
  if (p.selfctrl != null && p.selfctrl < 45) { bias -= 0.3; why.push(['خودکنترلی پایین‌تر (پرسشنامه)', -0.3]); }
  if (p.selfctrl != null && p.selfctrl > 70) { bias += 0.2; why.push(['خودکنترلی بالا (پرسشنامه)', 0.2]); }
  if (p.procr != null && p.procr >= 60) { bias -= 0.25; why.push(['اهمال‌کاری با کار بزرگ (پرسشنامه)', -0.25]); }
  if (p.distract != null && p.distract >= 60) { bias -= 0.15; why.push(['حواس‌پرتی بالا', -0.15]); }
  if (p.efficacy != null && p.efficacy < 45) { bias -= 0.15; why.push(['باور به توانایی هنوز پایین است؛ شروع سبک‌تر', -0.15]); }
  if (p.conscientious != null && p.conscientious < 40) { bias -= 0.2; why.push(['نظم و پیگیری (پنج عامل)', -0.2]); }
  return { mean: [bias, -2.0, -0.2, 0.3, -0.6, 2.0, 0.8, 0.4], sd: [1, 0.8, 0.5, 0.5, 0.5, 0.8, 0.6, 0.5], why };
}
const recentRate = (rows, d, n = 7) => { const r = rows.filter(x => x.d < d && daysBetween(x.d, d) <= n); if (!r.length) return 0.75; return r.reduce((a, x) => a + x.done, 0) / r.reduce((a, x) => a + x.n, 0); };
export function habitFactor(s) { const L = (s.habits?.list || []).filter(h => h.active !== false); if (!L.length) return 0.25; const st = L.map(h => { try { return habitStage(s, h).factor; } catch { return 0.25; } }); return st.reduce((a, x) => a + x, 0) / st.length; }
const lateCache = new WeakMap(); const lateSet = s => { if (!lateCache.has(s)) lateCache.set(s, lateNightDays(s)); return lateCache.get(s); };
const energyOn = (s, d) => (s.checkins || []).filter(c => c.date === d && c.energy).at(-1)?.energy ?? null;
/** Feature vector for one day (load given separately so we can solve for it). */
export function features(s, d, rows, load) {
  const ex = upcomingExams(s).concat((s.exams || []).filter(e => e.kind === 'old')).some(e => { const k = daysBetween(d, e.date); return k >= 0 && k <= 3; });
  const late = lateSet(s).has(addDays(d, -1));
  const e = energyOn(s, d);
  return [1, load, isOffDay(s, d) ? 1 : 0, ex ? 1 : 0, late ? 1 : 0, recentRate(rows, d) - 0.75, habitFactor(s) - 0.25, e == null ? 0 : (e - 3) / 2];
}
/** Learn P(task done | day) from MY plan history (MAP; prior = research + questionnaires). */
export function completionModel(s) {
  const rows = snapshot(s).plan; const prior = priorFor(s);
  const train = rows.flatMap(r => r.items.map(p => ({ x: features(s, r.d, rows, r.load), y: p.status === 'done' ? 1 : 0, w: 1 })));
  const m = trainNeuron(train, prior); return { ...m, prior, rows };
}
/** Highest load ratio (weighted minutes ÷ normal cap) at which P(done) ≥ TARGET. */
export function sustainableLoad(model, x) {
  const wl = Math.min(-0.3, model.wts[1]); const rest = model.wts.reduce((a, w, i) => i === 1 ? a : a + w * x[i], 0);
  return (logit(TARGET) - rest) / wl;
}

/** Tests per day and per block before accuracy drops (fatigue), from my own answer history. */
/** Typical tests/day: median for < 8 days of data, 20% trimmed mean afterwards (last 21 data days). */
export function baselineTests(counts) {
  const c = counts.filter(n => n > 0).slice(-21); if (c.length < 5) return null;
  const s = [...c].sort((a, b) => a - b);
  if (s.length < 8) return percentile(s, 0.5);
  const cut = Math.floor(s.length * 0.2); const mid = s.slice(cut, s.length - cut); return mid.reduce((a, x) => a + x, 0) / mid.length;
}
/** Growth only after 3–5 stable days in a row at/above the baseline without an accuracy drop: +5% (3–4 days) or +10% (5). */
export function growthStep(days) {
  const d = (days || []).filter(x => x.n > 0); if (d.length < 8) return { k: 1, stable: 0 };
  const base = baselineTests(d.map(x => x.n)); const acc = x => scoreOf(x.arr || []);
  const before = d.slice(0, -5).map(acc).filter(v => v != null); const ref = before.length ? before.reduce((a, x) => a + x, 0) / before.length : null;
  let stable = 0; for (const x of [...d].reverse()) { const a = acc(x); if (x.n >= base * 0.9 && (ref == null || a == null || a >= ref - 0.05)) stable++; else break; if (stable >= 5) break; }
  if (stable >= 5) return { k: 1.10, stable, text: '۵ روز پشت سر هم پایدار بودی؛ سقف ۱۰٪ بالاتر رفت' };
  if (stable >= 3) return { k: 1.05, stable, text: `${stable} روز پشت سر هم پایدار بودی؛ سقف ۵٪ بالاتر رفت` };
  return { k: 1, stable };
}
export function testVolume(s, factor = 1) {
  const { tests, psych, exp } = snapshot(s); const why = [];
  const counts = tests.days.map(d => d.n);
  const daily = dropPoint(tests.days.map(d => d.arr), { from: 20, step: 10, max: 250, minEach: 40, drop: 0.08 });
  const block = dropPoint(tests.sessions, { from: 10, step: 5, max: 40, minEach: 30, drop: 0.07 });
  // v12 (Blueprint §7): the baseline is a TYPICAL day (median / trimmed mean of recent days), never the best days.
  // v11 used percentile(75) × 1.1, which inflated busy days (report: «بزرگ‌نمایی روزهای پرکار» — forbidden).
  const base = baselineTests(counts); const grow = growthStep(tests.days);
  let perDay = base != null ? Math.round(base * grow.k) : null;
  if (daily) { perDay = perDay ? Math.min(perDay, daily.k) : daily.k; why.push(`بعد از تست ${daily.k}ام هر روز، درصدت از ${Math.round(daily.before * 100)}٪ به ${Math.round(daily.after * 100)}٪ می‌افتد`); }
  else if (base != null) why.push(`یک روز معمولی‌ات حدود ${Math.round(base)} تست است (میانه روزهای اخیر، نه بهترین روزها)`);
  if (grow.k > 1) why.push(grow.text);
  if (perDay == null) { perDay = (s.me?.grade || 11) >= 12 ? 50 : 40; why.push('هنوز داده تست روزانه کم است؛ عدد شروع پیش‌فرض است'); }
  let blk = block ? Math.max(10, Math.min(30, block.k)) : 15;
  if (block) why.push(`داخل یک جلسه، بعد از تست ${block.k}ام دقتت افت می‌کند`);
  if (!block && psych.shortSessions != null && psych.shortSessions >= 65) { blk = 10; why.push('جلسه کوتاه را ترجیح می‌دهی (پرسشنامه)'); }
  if (!block && psych.procr != null && psych.procr >= 60) { blk = Math.min(blk, 10); why.push('شروع با بلوک کوچک اهمال‌کاری را کم می‌کند'); }
  if (exp.stage === 'new') blk = Math.min(blk, 15);
  return { perDay: Math.max(10, Math.round(perDay * factor / 5) * 5), block: blk, why, dataDays: counts.length, daily, blockDrop: block };
}

/** The whole recommendation for the 7 days starting today. */
export function capacityPlan(s, today = todayStr()) {
  const model = completionModel(s); const rows = model.rows; const snap = snapshot(s);
  const days = daysFromTo(today, addDays(today, 6));
  const nTasks = rows.reduce((a, r) => a + r.n, 0);
  const confidence = nTasks >= 120 ? 'خوب' : nTasks >= 40 ? 'متوسط' : nTasks >= 10 ? 'کم' : 'فقط پیش‌فرض و پرسشنامه';
  // base = an ordinary working day in this context
  const baseX = features(s, today, rows, 0); baseX[2] = 0; baseX[3] = 0; baseX[4] = 0; baseX[7] = 0;
  const weekF = clamp(round5(sustainableLoad(model, baseX) / PLANNER_FILL), CLAMP);
  const perDay = days.map(d => {
    const x = features(s, d, rows, 0); const f = clamp(round5(sustainableLoad(model, x) / PLANNER_FILL), CLAMP);
    const why = []; if (x[4]) why.push('دیشب دیر خوابیدی'); if (x[7] < 0) why.push('انرژی امروز پایین ثبت شده'); if (x[7] > 0) why.push('انرژی امروز بالاست'); if (x[3]) why.push('آزمون نزدیک است');
    const wd = weekdayEffect(rows, d); let g = f; if (wd) { g = clamp(round5(f * wd.k), CLAMP); why.push(wd.text); }
    if (snap.psych.anxiety != null && snap.psych.anxiety >= 60 && upcomingExams(s).some(e => { const k = daysBetween(d, e.date); return k >= 1 && k <= 2; })) { g = clamp(round5(g - 0.1), CLAMP); why.push('استرس آزمون بالاست؛ دو روز قبل از آزمون سبک‌تر'); }
    if ((s.exams || []).some(e => addDays(e.date, 1) === d && (e.sittings || []).length)) { g = clamp(round5(g - 0.15), CLAMP); why.push('روز بعد از آزمون: ریکاوری'); }
    return { d, f: g, why, off: isOffDay(s, d) };
  });
  const tv = testVolume(s, weekF);
  // reasons for the week number, in plain Persian
  const reasons = [];
  const r7 = recentRate(rows, today, 7), r14 = recentRate(rows, today, 14);
  if (rows.length >= 3) reasons.push(r7 >= 0.85 ? `هفته گذشته ${pc(r7)} کارهای برنامه را انجام دادی` : `هفته گذشته فقط ${pc(r7)} کارهای برنامه انجام شد`);
  const heavy = rows.filter(r => r.load >= 0.9); const light = rows.filter(r => r.load < 0.6);
  if (heavy.length >= 3 && light.length >= 3) { const a = avg(heavy.map(r => r.rate)), b = avg(light.map(r => r.rate)); if (b - a >= 0.15) reasons.push(`روزهای پرفشار ${pc(a)} و روزهای سبک ${pc(b)} انجام می‌شود`); }
  for (const [t, v] of model.prior.why) reasons.push(`${t}${v < 0 ? ' (شروع محتاط‌تر)' : ''}`);
  const hf = habitFactor(s); if ((s.habits?.list || []).length) reasons.push(hf >= 0.5 ? 'عادت‌هایت جا افتاده‌اند؛ جا برای رشد هست' : 'عادت‌ها هنوز در مرحله شروع‌اند؛ حجم را یکباره بالا نبر');
  if (snap.exp.stage === 'new') reasons.push('هفته اول استفاده: عدد با داده‌های خودت دقیق‌تر می‌شود');
  const growth = weekF >= 1.02 ? 'up' : weekF <= 0.9 ? 'down' : 'hold';
  const lighter = Math.round((1 - weekF) * 100);
  return {
    at: new Date().toISOString(), from: today, to: days.at(-1), week: weekF, lighter, growth, confidence, tasks: nTasks, days: perDay,
    testsPerDay: tv.perDay, block: tv.block, testsWhy: tv.why, reasons, model: { wts: model.wts.map(w => +w.toFixed(3)), n: model.n, names: F },
    headline: lighter > 0 ? `این هفته کارها ${fa(lighter)}٪ سبک‌تر` : lighter < 0 ? `این هفته می‌توانی ${fa(-lighter)}٪ بیشتر کار کنی` : 'حجم این هفته همان حجم عادی است',
    r14,
  };
}
function weekdayEffect(rows, d) {
  const wd = new Date(d + 'T12:00:00').getDay(); const same = rows.filter(r => new Date(r.d + 'T12:00:00').getDay() === wd);
  if (same.length < 3 || rows.length < 10) return null;
  const all = avg(rows.map(r => r.rate)), mine = avg(same.map(r => r.rate)); const shrink = same.length / (same.length + 4);
  const k = 1 + (mine - all) * shrink; if (Math.abs(k - 1) < 0.05) return null;
  return { k: clamp(k, [0.8, 1.1]), text: k < 1 ? `این روز هفته معمولاً کمتر انجام می‌دهی (${pc(mine)})` : `این روز هفته معمولاً بهتر کار می‌کنی (${pc(mine)})` };
}
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const pc = x => `${fa(Math.round(x * 100))}٪`;
const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

// ---------- applying (stored in state so the planner reads it cheaply) ----------
export const DEFAULT_CAPACITY = { mode: 'suggest', applied: null, history: [], manualWeek: null };
/** Store a plan as the active capacity (until its `to` date). */
export function applyCapacity(s, plan, extra = {}) {
  const applied = { at: plan.at, from: plan.from, to: plan.to, week: plan.week, days: Object.fromEntries(plan.days.map(x => [x.d, x.f])), testsPerDay: plan.testsPerDay, block: plan.block, lighter: plan.lighter, headline: plan.headline, ...extra };
  const cap = { ...DEFAULT_CAPACITY, ...(s.capacity || {}) };
  return { ...s, capacity: { ...cap, applied, history: [...(cap.history || []), { at: plan.at, week: plan.week, testsPerDay: plan.testsPerDay, block: plan.block, confidence: plan.confidence }].slice(-26) } };
}
/** Student override: «this week n% lighter» by hand (wins over the model until the week ends). */
export function manualWeek(s, pct, today = todayStr()) {
  const f = clamp(1 - pct / 100, [0.3, 1.3]); const to = weekEnd(today);
  const cap = { ...DEFAULT_CAPACITY, ...(s.capacity || {}) }; const days = Object.fromEntries(daysFromTo(today, to).map(d => [d, f]));
  return { ...s, capacity: { ...cap, applied: { ...(cap.applied || {}), at: new Date().toISOString(), from: today, to, week: f, days, lighter: Math.round(pct), manual: true, testsPerDay: cap.applied?.testsPerDay ?? null, block: cap.applied?.block ?? null, headline: pct > 0 ? `این هفته کارها ${fa(Math.round(pct))}٪ سبک‌تر (انتخاب خودت)` : 'حجم عادی (انتخاب خودت)' } } };
}
export const clearCapacity = s => ({ ...s, capacity: { ...DEFAULT_CAPACITY, ...(s.capacity || {}), applied: null } });
export const testsCap = s => { const a = s.capacity?.applied; return a && s.capacity?.mode !== 'off' && todayStr() <= a.to ? a.testsPerDay || null : null; };
export const blockSize = (s, fallback = 15) => { const a = s.capacity?.applied; return a && s.capacity?.mode !== 'off' && a.block ? a.block : fallback; };
/** Auto mode: re-apply once the stored plan expired (or never applied). Returns new state or null. */
export function autoApply(s, today = todayStr()) {
  const c = s.capacity; if (!c || c.mode !== 'auto') return null;
  if (c.applied && c.applied.to >= today && !(c.applied.from < today && new Date(today + 'T12:00:00').getDay() === 6)) return null; // refresh on Saturday
  if (c.applied?.manual && c.applied.to >= today) return null;
  return applyCapacity(s, capacityPlan(s, today));
}

/** v12 (Blueprint §7): separate outputs instead of one number — today, stable week, one session, new / review / exam
 *  minutes, tests, and an honest confidence. Pure function of the state; the student sees it with 5 feedback buttons. */
export function capacityOutputs(s, today = todayStr()) {
  const plan = capacityPlan(s, today); const day = plan.days.find(x => x.d === today) || plan.days[0];
  const cap = Math.round((s.settings?.weekdayMin || 240) * day.f);
  const exam = upcomingExams(s).some(e => { const k = daysBetween(today, e.date); return k >= 0 && k <= 14; });
  const split = exam ? [0.35, 0.35, 0.30] : [0.5, 0.4, 0.1];
  return {
    today: { minutes: cap, factor: day.f, why: day.why }, week: { factor: plan.week, headline: plan.headline, growth: plan.growth },
    session: { tests: plan.block, minutes: Math.min(120, Math.max(25, s.settings?.sessionLen || 50)) },
    minutes: { newMaterial: Math.round(cap * split[0]), review: Math.round(cap * split[1]), exam: Math.round(cap * split[2]) },
    testsPerDay: plan.testsPerDay, confidence: plan.confidence, reasons: plan.reasons,
    feedback: ['سبک‌تر', 'همین خوب است', 'سخت‌تر', 'مناسب نیست', 'مانع دارم'],
  };
}
/** The 5 feedback buttons → a manual override that survives auto-refresh until the week ends (fixes the reset bug). */
export function capacityFeedback(s, kind, today = todayStr()) {
  const cur = s.capacity?.applied?.week ?? 1; const pct = Math.round((1 - cur) * 100);
  const step = { lighter: 10, same: 0, harder: -10, unfit: 15, blocked: 30 }[kind]; if (step == null) return s;
  const next = kind === 'same' ? pct : Math.max(-30, Math.min(70, pct + step));
  const y = manualWeek(s, next, today); return { ...y, capacity: { ...y.capacity, feedback: [...(s.capacity?.feedback || []), { at: new Date().toISOString(), kind }].slice(-50) } };
}
