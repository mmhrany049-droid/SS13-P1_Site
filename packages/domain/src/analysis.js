// SS v13 — analysis centre: pure, deterministic statistics (no Date.now inside, `now`/`today` are parameters).
// Every number carries its sample size; with too little data a function returns null / 'insufficient' — never a made-up number.
import * as E from './engine.js';
import { attemptsOf, topicMastery, todayStr, addDays, daysBetween, parseLocal, bookById, label, chapterOf, reviewQueue, isLeech, latestSitting, defaultTarget, REASONS, DAY } from './store.js';
import { scoreOf, dropPoint } from './brain.js';

export const ANALYSIS_CONST = { LOW_PC: 0.45, VERY_LOW_PC: 0.35, MID_PC: 0.65, MIN_CONF: 0.4, MIN_DISTINCT: 6, WEEK_MIN_N: 15, K: 4, CHI2_DF3_5PCT: 7.81 };
export const prefsOf = s => ({ lowPc: ANALYSIS_CONST.LOW_PC, veryLowPc: ANALYSIS_CONST.VERY_LOW_PC, minConf: ANALYSIS_CONST.MIN_CONF, ...(s?.analysis?.prefs || {}) });
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = a => { if (!a.length) return null; const t = [...a].sort((x, y) => x - y); const m = t.length >> 1; return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2; };
const dateOf = a => todayStr(new Date(a.at));
export const dowOf = d => new Date(parseLocal(d)).getDay();
/** Saturday-based week start (the Iranian week). */
export const weekKey = d => addDays(d, -((dowOf(d) + 1) % 7));
export const pct = (C, W, N) => (N ? E.percent(C, W, N) : null);

// ---------- series source: real, numbered, corrected attempts ----------
export const realAtts = atts => atts.filter(a => !a.isLegacy && a.num != null && a.result !== 'U' && a.at);
export function applyFilter(atts, F = {}, today = todayStr()) {
  const f = { range: 'all', subjects: null, bookIds: null, levels: null, origin: null, includeHistorical: true, includeLegacy: false, ...F };
  let from = null, to = null; const w = { '4w': 28, '8w': 56, '12w': 84 }[f.range];
  if (w) { from = addDays(today, -w + 1); to = today; } else if (f.range && f.range.from) { from = f.range.from; to = f.range.to || today; }
  return atts.filter(a => {
    if (!f.includeLegacy && (a.isLegacy || a.num == null)) return false; if (a.result === 'U') return false;
    if (!f.includeHistorical && a.historical) return false;
    const d = dateOf(a); if (from && d < from) return false; if (to && d > to) return false;
    if (f.subjects?.length && !f.subjects.includes(a.subject)) return false; if (f.bookIds?.length && !f.bookIds.includes(a.bookId)) return false;
    if (f.levels?.length && !f.levels.includes(a.level)) return false;
    if (f.origin?.length && !f.origin.includes(a.examId ? 'exam' : a.origin || 'new')) return false; return true;
  });
}
/** Current period and the previous period of the same length (for «compared to before»). */
export function splitPeriods(atts, F = {}, today = todayStr()) {
  const w = { '4w': 28, '8w': 56, '12w': 84 }[F.range] || 28; const curFrom = addDays(today, -w + 1), prevFrom = addDays(today, -2 * w + 1), prevTo = addDays(today, -w);
  const base = { ...F, range: 'all' }; const all = applyFilter(atts, base, today);
  return { cur: all.filter(a => dateOf(a) >= curFrom && dateOf(a) <= today), prev: all.filter(a => dateOf(a) >= prevFrom && dateOf(a) <= prevTo), curFrom, prevFrom, days: w };
}
export const counts = arr => { let C = 0, W = 0, B = 0; for (const a of arr) { if (a.result === 'C') C++; else if (a.result === 'W') W++; else if (a.result === 'B') B++; } const N = C + W + B; return { C, W, B, N, P: pct(C, W, N), acc: N ? C / (C + W || 1) : null, blank: N ? B / N : null }; };

/** Pooled (not averaged) weekly series: a 5-test and a 50-test session must not weigh the same (R-6). */
export function weeklyPooled(atts, { by = 'all' } = {}) {
  const m = new Map();
  for (const a of realAtts(atts)) { const w = weekKey(dateOf(a)); const k = by === 'all' ? '' : by === 'subject' ? a.subject : `${a.bookId}|${a.nodeId}`; const key = k + '@' + w; const o = m.get(key) || { key: k, week: w, C: 0, W: 0, B: 0 }; o[a.result]++; m.set(key, o); }
  return [...m.values()].map(o => { const N = o.C + o.W + o.B; return { ...o, N, P: pct(o.C, o.W, N), acc: o.C / Math.max(1, o.C + o.W), blank: o.B / N }; }).sort((a, z) => a.week.localeCompare(z.week) || String(a.key).localeCompare(String(z.key)));
}
export function sessionSeries(s, F = {}, today = todayStr()) {
  return (s.sessions || []).filter(x => !x.legacy && x.at && !x.historical).map(x => {
    const b = bookById(s, x.bookId); if (!b) return null; const st = E.stats(Object.entries(x.answers || {}).map(([n, c]) => E.correct(c, b.keys?.[+n] ?? null))); const N = st.C + st.W + st.B; if (!N) return null;
    const secPerQ = x.secPerQ ?? (x.minutes ? (x.minutes * 60) / N : null);
    return { id: x.id, at: x.at, d: dateOf(x), subject: b.subject, bookId: x.bookId, P: st.P, N, C: st.C, W: st.W, B: st.B, acc: st.C / Math.max(1, st.C + st.W), secPerQ, timeSource: x.timeSource || 'none', hour: new Date(x.at).getHours(), size: N, origin: x.origin || 'new' };
  }).filter(Boolean).filter(r => (!F.subjects?.length || F.subjects.includes(r.subject)) && (!F.origin?.length || F.origin.includes(r.origin))).sort((a, z) => a.at.localeCompare(z.at));
}

// ---------- slopes ----------
/** Weighted least squares, weight = 0.5^(age/halfLife) · min(1, N/minN). Unit: percent-points per WEEK. */
export function slopeWLS(points, { halfLifeDays = 28, minN = 15, today = null } = {}) {
  const pts = points.filter(p => p.y != null && p.x != null); if (pts.length < 3) return null; const xmax = today != null ? today : Math.max(...pts.map(p => p.x));
  const w = pts.map(p => Math.pow(0.5, (xmax - p.x) / halfLifeDays) * Math.min(1, (p.n ?? minN) / minN)); const W = w.reduce((a, b) => a + b, 0); if (!W) return null;
  const mx = pts.reduce((a, p, i) => a + w[i] * p.x, 0) / W, my = pts.reduce((a, p, i) => a + w[i] * p.y, 0) / W;
  const sxx = pts.reduce((a, p, i) => a + w[i] * (p.x - mx) ** 2, 0), sxy = pts.reduce((a, p, i) => a + w[i] * (p.x - mx) * (p.y - my), 0); if (sxx < 1e-9) return null;
  return (sxy / sxx) * 7;
}
/** Theil–Sen on weekly points (x in weeks): robust to one outlier. */
export function theilSen(points) {
  const p = points.filter(q => q.y != null); if (p.length < 2) return null; const sl = [];
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[j].x !== p[i].x) sl.push((p[j].y - p[i].y) / (p[j].x - p[i].x)); return sl.length ? median(sl) : null;
}
export function ewma(values, alpha) { const out = []; let cur = null; for (const v of values) { cur = cur == null ? v : alpha * v + (1 - alpha) * cur; out.push(cur); } return out; }
export function bootstrapSlope(points, { runs = 200, seed = 1 } = {}) {
  const p = points.filter(q => q.y != null); if (p.length < 4) return { slope: theilSen(p), lo: null, hi: null }; const rnd = E.mulberry32(seed); const ss = [];
  for (let r = 0; r < runs; r++) { const s = Array.from({ length: p.length }, () => p[Math.floor(rnd() * p.length)]); const v = theilSen(s); if (v != null) ss.push(v); }
  ss.sort((a, b) => a - b); const q = f => ss[Math.min(ss.length - 1, Math.max(0, Math.floor(f * (ss.length - 1))))];
  return { slope: theilSen(p), lo: ss.length ? q(0.025) : null, hi: ss.length ? q(0.975) : null };
}
export function classifyVelocity({ slope, lo, hi, weeks }) {
  if (weeks < 4 || slope == null) return 'unknown'; if (slope >= 1 && lo != null && lo > 0) return 'improving'; if (slope <= -1 && hi != null && hi < 0) return 'declining'; return 'flat';
}
export function accelerate(points) { const p = points.filter(q => q.y != null); if (p.length < 8) return null; const last = theilSen(p.slice(-4)), prev = theilSen(p.slice(-8, -4)); return last == null || prev == null ? null : last - prev; }
export function plateau(weeks) { const w = weeks.slice(-3); if (w.length < 3 || weeks.length < 3) return false; const sl = theilSen(w.map((r, i) => ({ x: i, y: r.P }))); return sl != null && Math.abs(sl) < 0.5 && avg(w.map(r => r.N)) >= 30; }
export function timeToTarget(current, slope, target, ci = {}) {
  if (current == null || slope == null || slope <= 0.5) return null; if (current >= target) return { weeks: 0, days: 0, lo: 0, hi: 0 };
  const wk = (target - current) / slope; return { weeks: +wk.toFixed(1), days: Math.round(wk * 7), lo: ci.hi > 0 ? Math.round(((target - current) / ci.hi) * 7) : null, hi: ci.lo > 0 ? Math.round(((target - current) / ci.lo) * 7) : null };
}
/** Velocity block for one series of pooled weekly points. */
export function velocity(weekly, { target = null, seed = 1 } = {}) {
  const pts = weekly.filter(w => w.N >= ANALYSIS_CONST.WEEK_MIN_N); const t0 = pts[0]?.week; const xs = pts.map(w => ({ x: daysBetween(t0, w.week) / 7, y: w.P, n: w.N }));
  const bs = bootstrapSlope(xs, { seed }); const weeks = pts.length; const current = avg(pts.slice(-2).map(w => w.P));
  const slope = weeks >= 4 ? bs.slope : null; const provisional = weeks < 4; const wls = slopeWLS(weekly.map(w => ({ x: daysBetween(weekly[0].week, w.week), y: w.P, n: w.N })), {});
  const cls = classifyVelocity({ slope, lo: bs.lo, hi: bs.hi, weeks });
  return { weeks, slope: slope ?? (wls != null ? wls : null), provisional: provisional && wls != null, lo: bs.lo, hi: bs.hi, cls, accel: accelerate(xs), plateau: plateau(pts), current, eta: target != null ? timeToTarget(current, slope ?? wls, target, bs) : null, ewmaFast: ewma(pts.map(w => w.P), 0.5), ewmaSlow: ewma(pts.map(w => w.P), 0.2) };
}

// ---------- mastery ----------
export function classOf(pC, confidence, distinct, prefs = {}) {
  const p = { lowPc: 0.45, veryLowPc: 0.35, minConf: 0.4, ...prefs };
  if (confidence < p.minConf) return 'insufficient'; if (pC < p.veryLowPc && distinct >= ANALYSIS_CONST.MIN_DISTINCT) return 'veryLow'; if (pC < p.lowPc) return 'low'; return pC < ANALYSIS_CONST.MID_PC ? 'mid' : 'high';
}
export const ciOf = (pC, effN) => { const se = Math.sqrt(pC * (1 - pC) / (effN + ANALYSIS_CONST.K)); return [Math.max(0, pC - 1.96 * se), Math.min(1, pC + 1.96 * se)]; };
/** Mastery change over the last `days` days: topicMastery recomputed on the attempts that existed back then. */
export function masteryDelta(s, atts, days = 14, now = Date.now()) {
  const past = now - days * DAY; const before = topicMastery(s, atts.filter(a => Date.parse(a.at) <= past), past).res; const after = topicMastery(s, atts, now).res; const out = {};
  for (const [k, r] of Object.entries(after)) { const b = before[k]; out[k] = { before: b ? b.pC : null, after: r.pC, delta: b ? r.pC - b.pC : null }; } return out;
}
export function masteryTable(s, atts, { now = Date.now(), withDelta = true } = {}) {
  const prefs = prefsOf(s); const res = topicMastery(s, atts, now).res; const d14 = withDelta ? masteryDelta(s, atts, 14, now) : {}; const q = reviewQueue(s, atts, now); const cards = {};
  for (const x of q.all) { const k = x.a.bookId + '|' + x.a.nodeId; (cards[k] ||= []).push(x); }
  const reasons = {}; for (const a of atts) if (a.result === 'W' || a.result === 'B') for (const r of a.reasons || []) { const k = a.bookId + '|' + a.nodeId; (reasons[k] ||= {})[r] = (reasons[k][r] || 0) + 1; }
  return Object.entries(res).map(([key, r]) => {
    const [bookId, nodeId] = key.split('|'); const b = bookById(s, bookId); const node = b?.nodes.find(n => n.id === nodeId); if (!b || !node) return null;
    const [lo, hi] = ciOf(r.pC, r.effectiveN ?? r.n); const rs = (cards[key] || []).map(x => x.item && x.item.S ? E.forgettingCurve((now - x.item.lastAt) / DAY, x.item.S, E.FSRS_PARAMS[s.settings?.fsrs]?.decay ?? -0.5) : null).filter(v => v != null);
    const top = Object.entries(reasons[key] || {}).sort((a, z) => z[1] - a[1])[0];
    return { key, bookId, nodeId, subject: b.subject, chapter: chapterOf(b, node)?.title || '', label: label(b, node), pC: r.pC, pW: r.pW ?? 0, pB: r.pB ?? 0, Pk: 100 * (r.pC - (r.pW ?? 0) / 3), lo, hi, confidence: r.confidence, effN: r.effectiveN ?? r.n, n: Math.round(r.n), distinct: r.distinct, lastAt: r.lastAt, delta14: d14[key]?.delta ?? null,
      meanR: avg(rs), topReason: top ? { id: top[0], n: top[1], fa: REASONS.find(z => z.id === top[0])?.fa || top[0] } : null, levels: r.levels, cls: classOf(r.pC, r.confidence, r.distinct, prefs), size: node.qStart != null ? node.qEnd - node.qStart + 1 : null, dueCards: (cards[key] || []).filter(x => x.due <= now).length };
  }).filter(Boolean);
}
/** Topics that need a redo: very low, enough data. */
export const needRedo = rows => rows.filter(r => r.cls === 'veryLow').sort((a, z) => a.pC - z.pC);
export const stagnant = (rows, now = Date.now()) => rows.filter(r => r.lastAt && (now - r.lastAt) / DAY >= 21 && r.pC < 0.6 && r.confidence >= 0.4);

// ---------- learning curve, efficiency ----------
export function learningCurve(arr) {
  const a = arr.filter(x => x.num != null && x.result !== 'U').sort((x, y) => x.at.localeCompare(y.at)); const sess = new Set(a.map(x => x.sessionId)).size; if (a.length < 15 || sess < 3) return null;
  const pts = []; let err = 0; a.forEach((x, i) => { if (x.result !== 'C') err++; const n = i + 1; if (n >= 5 && (n % 5 === 0 || n === a.length)) pts.push({ n, e: Math.max(0.02, err / n) }); }); if (pts.length < 3) return null;
  const lx = pts.map(p => Math.log(p.n)), ly = pts.map(p => Math.log(p.e)); const mx = avg(lx), my = avg(ly); const sxx = lx.reduce((s, v) => s + (v - mx) ** 2, 0); if (sxx < 1e-9) return null; const b = lx.reduce((s, v, i) => s + (v - mx) * (ly[i] - my), 0) / sxx;
  return { a: my - b * mx, b, doubleGain: 1 - Math.pow(2, b), n: a.length, sessions: sess, points: pts };
}
export function efficiency(s, atts, { window = 28, now = Date.now() } = {}) {
  const cut = now - window * DAY; const recent = atts.filter(a => Date.parse(a.at) >= cut && a.num != null); const tests = recent.length; if (tests < 30) return null;
  const rows = masteryTable(s, atts, { now, withDelta: true }).filter(r => r.delta14 != null); if (rows.length < 3) return null; const gain = avg(rows.map(r => r.delta14)) * 100;
  const mins = (s.sessions || []).filter(x => Date.parse(x.at) >= cut && x.minutes).reduce((t, x) => t + x.minutes, 0);
  return { per100Tests: gain / (tests / 100), perHour: mins >= 60 ? gain / (mins / 60) : null, tests, minutes: mins, gain };
}

// ---------- time, errors, behaviour ----------
export function calendarHeat(atts, weeks = 26, today = todayStr()) {
  const by = {}; for (const a of realAtts(atts)) { const d = dateOf(a); by[d] = (by[d] || 0) + 1; }
  const start = weekKey(addDays(today, -(weeks - 1) * 7)); const cells = []; for (let w = 0; w < weeks; w++) for (let r = 0; r < 7; r++) { const d = addDays(start, w * 7 + r); if (d <= today) cells.push({ d, n: by[d] || 0, col: w, row: r }); } return cells;
}
const BANDS = [['morning', 'صبح', 5, 12], ['noon', 'ظهر', 12, 16], ['evening', 'عصر', 16, 21], ['night', 'شب', 21, 29]];
export const hourOf = a => { const h = new Date(a.at).getHours(); return h < 5 ? h + 24 : h; };
export function hourBands(atts) {
  const a = realAtts(atts); return BANDS.map(([k, fa, lo, hi]) => { const arr = a.filter(x => { const h = hourOf(x); return h >= lo && h < hi; }); const c = counts(arr); return { k, fa, ...c, enough: c.N >= 20 }; });
}
export function sessionSizeCurve(series) {
  const bins = [[0, 10, '≤۱۰'], [11, 15, '۱۱–۱۵'], [16, 20, '۱۶–۲۰'], [21, 30, '۲۱–۳۰'], [31, 999, '>۳۰']];
  return bins.map(([lo, hi, fa]) => { const r = series.filter(x => x.size >= lo && x.size <= hi); const N = r.reduce((t, x) => t + x.N, 0); const C = r.reduce((t, x) => t + x.C, 0), W = r.reduce((t, x) => t + x.W, 0); return { fa, sessions: r.length, N, P: N ? pct(C, W, N) : null, enough: r.length >= 6 }; });
}
/** Seconds per test (sessions with a real or estimated time) against the percent: speed bins + the median. Needs ≥ 6 timed sessions. */
export function speedBins(series) {
  const rows = series.filter(r => r.secPerQ != null && r.secPerQ > 5 && r.secPerQ < 600 && r.N >= 10); if (rows.length < 6) return null;
  const bins = [[0, 45, 'کمتر از ۴۵ ثانیه'], [45, 70, '۴۵ تا ۷۰'], [70, 100, '۷۰ تا ۱۰۰'], [100, 1e9, 'بیش از ۱۰۰ ثانیه']];
  return { median: median(rows.map(r => r.secPerQ)), n: rows.length, bins: bins.map(([lo, hi, fa]) => { const r = rows.filter(x => x.secPerQ >= lo && x.secPerQ < hi); const N = r.reduce((s, x) => s + x.N, 0); const C = r.reduce((s, x) => s + x.C, 0), W = r.reduce((s, x) => s + x.W, 0); return { fa, sessions: r.length, N, P: N ? pct(C, W, N) : null, enough: r.length >= 3 }; }) };
}
export function fatigueCurve(atts) {
  const bySes = {}; for (const a of realAtts(atts)) if (a.sessionId) (bySes[a.sessionId] ||= []).push(a); const dec = Array.from({ length: 10 }, () => []);
  for (const arr of Object.values(bySes)) { if (arr.length < 20) continue; arr.sort((x, y) => x.num - y.num); arr.forEach((a, i) => dec[Math.min(9, Math.floor((i * 10) / arr.length))].push(a)); }
  return dec.map((arr, i) => ({ decile: i + 1, n: arr.length, score: arr.length >= 10 ? scoreOf(arr) : null }));
}
/** Which option do I choose compared with the answer key (χ², df = 3, 5% critical value 7.81)? Needs ≥ 60 chosen answers. */
export function optionBias(atts, books) {
  const keyOf = {}; for (const b of books) keyOf[b.id] = b.keys || {}; const obs = [0, 0, 0, 0], exp = [0, 0, 0, 0]; let n = 0;
  for (const a of realAtts(atts)) { if (!a.chosen || a.chosen < 1 || a.chosen > 4) continue; const key = keyOf[a.bookId]?.[a.num]; if (!key || key > 4) continue; obs[a.chosen - 1]++; exp[key - 1]++; n++; }
  if (n < 60) return null; let chi2 = 0; for (let i = 0; i < 4; i++) if (exp[i] > 0) chi2 += (obs[i] - exp[i]) ** 2 / exp[i];
  const top = obs.indexOf(Math.max(...obs)); return { n, observed: obs, expected: exp, chi2, significant: chi2 > ANALYSIS_CONST.CHI2_DF3_5PCT, topOption: top + 1, topShare: obs[top] / n, keyShare: exp[top] / n };
}
export function repeatOffenders(atts, limit = 20) {
  const by = {}; for (const a of realAtts(atts)) { const o = by[a.ref] ||= { ref: a.ref, bookId: a.bookId, nodeId: a.nodeId, num: a.num, bad: 0, W: 0, B: 0, reasons: {}, last: a.result }; if (a.result !== 'C') { o.bad++; o[a.result]++; for (const r of a.reasons || []) o.reasons[r] = (o.reasons[r] || 0) + 1; } o.last = a.result; }
  return Object.values(by).filter(o => o.bad >= 2).sort((a, z) => z.bad - a.bad || z.W - a.W || a.ref.localeCompare(z.ref)).slice(0, limit);
}
export function costliestMistakes(atts, limit = 10) {
  const N = realAtts(atts).length; if (!N) return []; const by = {}; for (const a of realAtts(atts)) { if (a.result === 'C') continue; const o = by[a.ref] ||= { ref: a.ref, bookId: a.bookId, nodeId: a.nodeId, num: a.num, cost: 0, times: 0 }; o.cost += (a.result === 'W' ? 400 : 300) / (3 * N); o.times++; }
  return Object.values(by).sort((a, z) => z.cost - a.cost || a.ref.localeCompare(z.ref)).slice(0, limit);
}
/** Where do my percent points go? Same arithmetic as pointsLost (400/(3N) per wrong, 300/(3N) per blank). */
export function leaksBy(atts, by = 'reason') {
  const a = realAtts(atts); const N = a.length; const m = {}; if (!N) return { total: 0, rows: [], N };
  for (const x of a) { if (x.result === 'C') continue; const cost = (x.result === 'W' ? 400 : 300) / (3 * N); const keys = by === 'reason' ? (x.result === 'B' && !(x.reasons || []).length ? ['blank'] : (x.reasons || []).length ? x.reasons : ['unknown']) : [by === 'subject' ? x.subject : `${x.bookId}|${x.nodeId}`];
    for (const k of keys) { const o = m[k] ||= { key: k, cost: 0, n: 0 }; o.cost += cost / keys.length; o.n++; } }
  const rows = Object.values(m).sort((p, q) => q.cost - p.cost); return { N, total: rows.reduce((t, r) => t + r.cost, 0), rows };
}
export function retentionCurve(s, now = Date.now()) {
  const decay = E.FSRS_PARAMS[s.settings?.fsrs]?.decay ?? -0.5; const bySub = {};
  for (const [ref, it] of Object.entries(s.reviews || {})) { if (!it.S) continue; const b = bookById(s, ref.slice(0, ref.lastIndexOf(':'))); (bySub[b?.subject || '—'] ||= []).push(it.S); }
  return Object.entries(bySub).filter(([, v]) => v.length >= 10).map(([subject, v]) => { const S = avg(v); return { subject, n: v.length, S, points: Array.from({ length: 31 }, (_, t) => ({ t, R: E.forgettingCurve(t, S, decay) })) }; });
}
export function stabilityHist(s) {
  const S = Object.values(s.reviews || {}).filter(r => r.S).map(r => r.S), D = Object.values(s.reviews || {}).filter(r => r.D).map(r => r.D); if (S.length < 20) return null;
  const bins = [[0, 1], [1, 3], [3, 7], [7, 15], [15, 30], [30, 1e9]]; return { S: bins.map(([a, b]) => ({ lo: a, hi: b, n: S.filter(v => v >= a && v < b).length })), D: Array.from({ length: 5 }, (_, i) => ({ lo: i * 2 + 1, hi: i * 2 + 3, n: D.filter(v => v >= i * 2 + 1 && v < i * 2 + 3).length })), n: S.length };
}
export function reviewLoadForecast(s, atts, days = 30, now = Date.now()) {
  const q = reviewQueue(s, atts, now); const out = Array.from({ length: days }, (_, i) => ({ day: i, n: 0 })); let overdue = 0;
  for (const x of q.all) { if (x.due <= now) overdue++; else { const i = Math.floor((x.due - now) / DAY); if (i < days) out[i].n++; } } out[0].n += overdue; return { days: out, overdue, total: q.all.length };
}
export function examGap(s, atts) {
  const rows = []; for (const ex of s.exams || []) { const sit = latestSitting(ex); if (!sit || sit.percent == null) continue; const from = addDays(sit.date, -14); const daily = counts(realAtts(atts).filter(a => !a.examId && dateOf(a) >= from && dateOf(a) < sit.date));
    rows.push({ id: ex.id, title: ex.title, date: sit.date, examP: sit.percent, dailyP: daily.P, n: daily.N, gap: daily.P != null && daily.N >= 30 ? sit.percent - daily.P : null }); } return rows.sort((a, z) => a.date.localeCompare(z.date));
}
export function behaviorStats(s, today = todayStr()) {
  const real = (s.sessions || []).filter(x => !x.legacy && !x.historical && x.at); const days = new Set(real.map(dateOf)); let active28 = 0; for (let i = 0; i < 28; i++) if (days.has(addDays(today, -i))) active28++;
  let best = 0, cur = 0; for (let i = 120; i >= 0; i--) { if (days.has(addDays(today, -i))) { cur++; best = Math.max(best, cur); } else cur = 0; }
  const pl = (s.placements || []).filter(p => p.date >= addDays(today, -56) && p.date < today && ['done', 'approved', 'late', 'missed', 'skipped'].includes(p.status)); const byDow = {};
  for (const p of pl) { const o = byDow[dowOf(p.date)] ||= { n: 0, done: 0 }; o.n++; if (p.status === 'done') o.done++; }
  const origin = { new: 0, review: 0, redo: 0, other: 0 }; for (const x of real) { if (x.date === today || dateOf(x) < addDays(today, -28)) continue; const n = Object.keys(x.answers || {}).length; origin[x.origin === 'review' ? 'review' : x.origin === 'redo' ? 'redo' : x.origin === 'planned' || x.origin === 'new' || !x.origin ? 'new' : 'other'] += n; }
  const late = real.filter(x => new Date(x.at).getHours() < 4).length; const sizes = real.map(x => Object.keys(x.answers || {}).length).filter(Boolean);
  const checked = (s.dailyChecks || []).length; const analysed = (s.sessions || []).reduce((t, x) => t + Object.values(x.reasons || {}).filter(r => r.length).length, 0);
  return { active28, best, planDone: byDow, late, lateShare: real.length ? late / real.length : null, sizes: { median: median(sizes), n: sizes.length }, origin, checked, analysed, sessions: real.length };
}
export const goalOf = (s, subject) => s.analysis?.goals?.[subject] ?? Number(defaultTarget(s)) ?? 60;

/** One lazily computed context per (state, filter): every tab asks only for what it draws. */
const cache = new WeakMap();
export function analysisCtx(s, F = {}, now = Date.now()) {
  const fkey = JSON.stringify(F); const hit = cache.get(s)?.get(fkey + '|' + Math.floor(now / 36e5)); if (hit) return hit;
  const today = todayStr(new Date(now)); const memo = {}; const lazy = (k, f) => (memo[k] ||= { v: f() }).v;
  const ctx = { s, F, now, today,
    get allAtts() { return lazy('all', () => attemptsOf(s)); },
    get atts() { return lazy('f', () => applyFilter(ctx.allAtts, F, today)); },
    get real() { return lazy('r', () => realAtts(ctx.atts)); },
    get totals() { return lazy('t', () => counts(ctx.real)); },
    get periods() { return lazy('p', () => splitPeriods(ctx.allAtts, F, today)); },
    get weekly() { return lazy('w', () => weeklyPooled(ctx.atts)); },
    get weeklyBySubject() { return lazy('ws', () => { const m = {}; for (const w of weeklyPooled(ctx.atts, { by: 'subject' })) (m[w.key] ||= []).push(w); return m; }); },
    get series() { return lazy('ss', () => sessionSeries(s, F, today)); },
    get velocityAll() { return lazy('va', () => ctx.weekly.length ? velocity(ctx.weekly, { target: goalOf(s, null) }) : null); },
    get velocityBySubject() { return lazy('vs', () => Object.fromEntries(Object.entries(ctx.weeklyBySubject).map(([k, w]) => [k, velocity(w, { target: goalOf(s, k) })]))); },
    get mastery() { return lazy('m', () => masteryTable(s, ctx.allAtts, { now })); },
    get books() { return s.books || []; },
  };
  const m = cache.get(s) || new Map(); m.set(fkey + '|' + Math.floor(now / 36e5), ctx); cache.set(s, m); return ctx;
}
