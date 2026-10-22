// SS 10 — «مغز یادگیرنده» (Learner Brain, spec 34, simplified for one device).
// One connected place that turns the raw log (sessions, plan ticks, reviews, questionnaires, habits, exams, check-ins)
// into SIGNALS every module reads: capacity engine, planner, habits, assessment scheduler, assistant, admin summary.
//
// Engineering position (kept from spec 34): a deep network trained on ONE student's data learns noise. So the learning
// part here is a single neuron (logistic regression) with a Gaussian prior = MAP estimate: on day 1 it behaves like the
// research-based prior, and every ticked or skipped task moves the weights a little. Small, explainable, deterministic.
import { todayStr, addDays, daysBetween, attemptsOf, sessionStats, upcomingExams, baseCap, isOffDay, COMMITTED, intensityOf } from './store.js';

// ---------- the neuron ----------
export const sigmoid = z => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
export const logit = p => Math.log(p / (1 - p));
/** MAP logistic regression: rows [{x:number[], y:0|1, w?:number}], prior {mean:number[], sd:number[]}. Deterministic batch GD. */
export function trainNeuron(rows, prior, { epochs = 300, lr = 0.25 } = {}) {
  const k = prior.mean.length; const wts = [...prior.mean];
  if (!rows.length) return { wts, n: 0 };
  const W = rows.reduce((a, r) => a + (r.w ?? 1), 0);
  for (let e = 0; e < epochs; e++) {
    const g = new Array(k).fill(0);
    for (const r of rows) { const p = sigmoid(dot(wts, r.x)); const d = (p - r.y) * (r.w ?? 1); for (let j = 0; j < k; j++) g[j] += d * r.x[j]; }
    for (let j = 0; j < k; j++) { const pr = (wts[j] - prior.mean[j]) / (prior.sd[j] ** 2); wts[j] -= lr * (g[j] + pr) / (W + 1); }
  }
  return { wts, n: rows.length };
}
export const dot = (a, b) => a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
export const predict = (model, x) => sigmoid(dot(model.wts, x));

// ---------- psych signals (questionnaires are optional; null = unknown) ----------
const ins = (s, id, sub) => s.profile?.instruments?.[id]?.scores?.[sub]?.score ?? null;
export function psychSignals(s) {
  const ipip = s.profile?.ipip; let C = null, N = null;
  if (ipip) { // Mini-IPIP keyed items: quick trait estimate without importing the item bank here
    const tr = s.profile?.ipipScores; if (tr) { C = tr.C?.sc ?? null; N = tr.N?.sc ?? null; }
  }
  const q = s.habits?.scores || null; // habit questionnaire (0–100 per subscale)
  return {
    selfctrl: avgOf(ins(s, 'selfcontrol.study', 'start'), ins(s, 'selfcontrol.study', 'persist'), q?.selfctrl?.sc),
    distract: ins(s, 'selfcontrol.study', 'distract') != null ? 100 - ins(s, 'selfcontrol.study', 'distract') : q?.distract?.sc ?? null,
    procr: avgOf(ins(s, 'procrastination.triggers', 'big'), ins(s, 'procrastination.triggers', 'unclear'), q?.procr?.sc),
    tiredTrigger: ins(s, 'procrastination.triggers', 'tired'),
    anxiety: avgOf(ins(s, 'testanxiety.short', 'worry'), ins(s, 'testanxiety.short', 'emotion'), q?.anxiety?.sc),
    shortSessions: ins(s, 'session.preference', 'short'), dip: ins(s, 'session.preference', 'dip'),
    morning: ins(s, 'chronotype.custom', 'morning'), autonomy: ins(s, 'motivation.sdt', 'auto'), efficacy: ins(s, 'selfefficacy.subject', 'general'),
    conscientious: C, neurotic: N,
  };
}
function avgOf(...v) { const a = v.filter(x => x != null); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }

// ---------- experience (how long and how much the student has used SS) ----------
export function experience(s, today = todayStr()) {
  const real = (s.sessions || []).filter(x => !x.legacy && !x.historical);
  const firstSes = real.map(x => x.at).sort()[0];
  const start = [s.startedAt, s.account?.registeredAt, firstSes].filter(Boolean).map(x => String(x).slice(0, 10)).sort()[0] || today;
  const days = Math.max(0, daysBetween(start, today));
  const ticked = (s.placements || []).filter(p => p.status === 'done').length;
  const stage = days < 7 || real.length < 3 ? 'new' : days < 28 ? 'early' : days < 90 ? 'settled' : 'veteran';
  return { start, days, sessions: real.length, ticked, stage, label: STAGE_FA[stage] };
}
export const STAGE_FA = { new: 'تازه‌وارد (هفته اول)', early: 'هفته‌های اول', settled: 'جاافتاده', veteran: 'باتجربه' };

// ---------- daily history of the plan: what was planned vs done ----------
/** One row per past day that had committed work: load ratio (weighted minutes / normal cap), completion, context. */
export function planDays(s, { days = 42, today = todayStr() } = {}) {
  const out = []; const lateDays = lateNightDays(s);
  const exams = (s.exams || []).map(e => e.date);
  for (let i = days; i >= 1; i--) {
    const d = addDays(today, -i); const items = (s.placements || []).filter(p => p.date === d && COMMITTED(p) && p.source !== 'habit');
    if (!items.length) continue;
    const cap = Math.max(30, baseCap(s, d)); const load = items.reduce((a, p) => a + p.minutes * intensityOf(p), 0) / cap;
    const done = items.filter(p => p.status === 'done'); const doneLoad = done.reduce((a, p) => a + p.minutes * intensityOf(p), 0) / cap;
    out.push({ d, items, load, done: done.length, n: items.length, rate: done.length / items.length, doneLoad, off: isOffDay(s, d), examSoon: exams.some(x => { const k = daysBetween(d, x); return k >= 0 && k <= 3; }), lateBefore: lateDays.has(addDays(d, -1)) });
  }
  return out;
}
/** Days (by the «study day», 5am boundary) on which a session was logged after midnight. */
export function lateNightDays(s) {
  const set = new Set();
  for (const x of s.sessions || []) { if (x.legacy || x.historical) continue; const z = new Date(x.at); if (z.getHours() < 4) set.add(todayStr(new Date(z.getTime() - 5 * 36e5))); }
  return set;
}

// ---------- test volume: how many tests a day / per block before accuracy drops ----------
/** Per real day: count of tests + score; within-day index of every attempt (for the fatigue curve). */
export function testDays(s) {
  const atts = attemptsOf(s).filter(a => !a.isLegacy && !a.historical && a.num != null && a.result !== 'U');
  const sesById = Object.fromEntries((s.sessions || []).map(x => [x.id, x]));
  const byDay = {}; const bySes = {};
  for (const a of atts) { const ses = sesById[a.sessionId]; if (!ses) continue; const d = todayStr(new Date(ses.at)); (byDay[d] ||= []).push(a); (bySes[a.sessionId] ||= []).push(a); }
  const dayRows = Object.entries(byDay).map(([d, arr]) => ({ d, n: arr.length, score: scoreOf(arr), arr: arr.sort((x, y) => x.at.localeCompare(y.at) || x.num - y.num) }));
  return { days: dayRows.sort((a, z) => a.d.localeCompare(z.d)), sessions: Object.values(bySes).map(arr => arr.sort((x, y) => x.num - y.num)) };
}
export const scoreOf = arr => { const N = arr.length; if (!N) return null; const C = arr.filter(a => a.result === 'C').length, W = arr.filter(a => a.result === 'W').length; return (3 * C - W) / (3 * N); };
/** Smallest index k after which the score drops by ≥ drop (both sides need enough tests). null = no drop seen. */
export function dropPoint(seqs, { from = 10, step = 5, max = 200, minEach = 30, drop = 0.08 } = {}) {
  for (let k = from; k <= max; k += step) {
    const before = [], after = [];
    for (const seq of seqs) seq.forEach((a, i) => (i < k ? before : after).push(a));
    if (before.length < minEach || after.length < minEach) continue;
    if (scoreOf(before) - scoreOf(after) >= drop) return { k, before: scoreOf(before), after: scoreOf(after), n: before.length + after.length };
  }
  return null;
}
export function percentile(a, q) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (i - lo) * (s[Math.min(lo + 1, s.length - 1)] - s[lo]); }

// ---------- one snapshot for every consumer ----------
const cache = new WeakMap();
/** Cached per state object: experience, psych, plan history, test volume. Cheap to call from many components. */
export function snapshot(s) {
  if (cache.has(s)) return cache.get(s);
  const snap = { exp: experience(s), psych: psychSignals(s), plan: planDays(s), tests: testDays(s), upcoming: upcomingExams(s) };
  cache.set(s, snap); return snap;
}
export { sessionStats };
