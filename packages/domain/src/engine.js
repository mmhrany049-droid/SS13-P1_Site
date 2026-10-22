// SS reference engine (v3). Pure functions, no I/O. Mirrors specs 07, 11, 20–26.
// Coding agent: port 1:1 to `src/engine/*.ts`; outputs must match tests/test_vectors*.json.

export const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹', AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export function normalizeDigits(s) {
  return String(s ?? '').replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d));
}
export function toFa(x) { return String(x).replace(/\d/g, d => FA_DIGITS[d]).replace(/\./g, '٫').replace(/-/g, '−'); }

// ---------- PRNG (mulberry32) ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- scoring (spec 07 §1–2) ----------
export function correct(chosen, answer) {
  if (!chosen) return 'B';
  if (answer == null) return 'U';
  return chosen === answer ? 'C' : 'W';
}
export function percent(C, W, N) { return N ? (3 * C - W) / (3 * N) * 100 : null; }
export function stats(results) {
  const s = { C: 0, W: 0, B: 0, U: 0 };
  for (const r of results) s[r]++;
  s.N = s.C + s.W + s.B; s.P = percent(s.C, s.W, s.N); return s;
}
/** Parse an answer string («۳۱۴۰۲۲» / "3 1 4 - 2") into array of 0..4. Returns {ok, values, error}. */
export function parseAnswerString(str, expectedLen) {
  const clean = normalizeDigits(str).replace(/\s+/g, '').replace(/-/g, '0');
  if (/[^0-4]/.test(clean)) return { ok: false, error: 'E_KEY_CHAR' };
  const values = [...clean].map(Number);
  if (expectedLen != null && values.length !== expectedLen) return { ok: false, error: 'E_KEY_LENGTH', got: values.length };
  return { ok: true, values };
}

// ---------- time (spec 20, ADR-028) ----------
export function secPerQ(durationSec, s) { const n = s.C + s.W + s.B + (s.U || 0); return durationSec && n ? durationSec / n : null; }
export function weightedMedian(pairs) { // [{v,w}]
  const a = pairs.filter(p => p.v != null).sort((x, y) => x.v - y.v); if (!a.length) return null;
  const tot = a.reduce((s, p) => s + p.w, 0); let acc = 0;
  for (const p of a) { acc += p.w; if (acc >= tot / 2) return p.v; } return a.at(-1).v;
}
export function userMedianSecPerQ(sessions, nowMs, subjectId) {
  const pick = ss => ss.filter(s => s.secPerQ != null && (nowMs - Date.parse(s.at)) / 864e5 <= 60)
    .map(s => ({ v: s.secPerQ, w: s.timeSource === 'estimated' ? 0.5 : 1 }));
  const sub = pick(sessions.filter(s => s.subjectId === subjectId));
  if (subjectId && sub.length >= 3) return weightedMedian(sub);
  const all = pick(sessions); return all.length >= 3 ? weightedMedian(all) : 72;
}

// ---------- mastery (spec 07 §4 + spec 25 REP-2) ----------
export const timeWeight = (ageDays, H = 21, legacy = false) => legacy ? 0.3 : Math.pow(0.5, ageDays / H);
export function mastery(attempts, prior = [0.4, 0.3, 0.3], k = 4, H = 21) {
  let c = 0, w = 0, b = 0, sw = 0;
  for (const a of attempts) {
    // v6: a.w = extra evidence weight (difficulty level, exam-like attribution share); default 1
    let wt = timeWeight(a.ageDays, H, a.isLegacy) * (a.repeatWithin24h ? 0.5 : 1) * (a.w ?? 1);
    sw += wt;
    if (a.result === 'C' && a.isGuess) { c += 0.5 * wt; w += 0.5 * wt; }
    else if (a.result === 'C') c += wt; else if (a.result === 'W') w += wt; else if (a.result === 'B') b += wt;
  }
  const d = sw + k;
  return { pC: (c + k * prior[0]) / d, pW: (w + k * prior[1]) / d, pB: (b + k * prior[2]) / d, effectiveN: sw, confidence: sw / (sw + k) };
}

// ---------- coverage, review priority, strategy, similarity, workload ----------
export function coverage(taughtQ, doneQ) { return { coverage: taughtQ ? doneQ / taughtQ : null, remaining: taughtQ - doneQ }; }
export function reviewPriority({ reasonWeights = [], wrongCount = 0, blankCount = 0, important = false, daysOverdue = 0, correctStreak = 0 }) {
  const sorted = [...reasonWeights].sort((a, b) => b - a);
  const R = sorted.length ? sorted[0] + 0.5 * sorted.slice(1).reduce((s, x) => s + x, 0) : 3;
  const F = 1 + 0.5 * (wrongCount + blankCount - 1);
  return R * F * (important ? 1.5 : 1) * (1 + Math.max(0, daysOverdue) / 7) * Math.max(0.3, 1 - 0.15 * correctStreak);
}
export function strategyItem(pC, pW) { const q = pC + pW ? pC / (pC + pW) : 0; const E = 3 * q - (1 - q); return { q, E, answer: q > 0.25 }; }
export function weightedJaccard(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]); let mn = 0, mx = 0;
  for (const k of keys) { mn += Math.min(a[k] || 0, b[k] || 0); mx += Math.max(a[k] || 0, b[k] || 0); }
  return mx ? mn / mx : 0;
}
export function workload({ untouchedQ, secPerQ, dueReviews, daysLeft, freeMinPerDay }) {
  const workMin = untouchedQ * secPerQ / 60 + dueReviews * 1.5, perDay = workMin / Math.max(1, daysLeft);
  const ratio = freeMinPerDay ? perDay / freeMinPerDay : Infinity;
  return { workMin, perDay, ratio, verdict: ratio < 0.8 ? 'ok' : ratio <= 1 ? 'tight' : 'overloaded' };
}

// ---------- analytics v2 (spec 23) ----------
export function pointsLost(N, W, B) { return { perW: 400 / (3 * N), perB: 300 / (3 * N), total: W * 400 / (3 * N) + B * 300 / (3 * N) }; }
export const guessGain = q => (4 * q - 1) / 3;

// ---------- rewards (spec 11) ----------
export const levelThreshold = L => Math.round(120 * Math.pow(L, 1.45));
export function levelFromXp(xp) { let L = 0; while (xp >= levelThreshold(L + 1)) L++; return { level: L, next: levelThreshold(L + 1), prev: L ? levelThreshold(L) : 0 }; }
// F-13: thresholds use the ANSWERED count (incl. U = no key yet), so missing keys can't hide «tooFast».
export function antiGamingFlags(s, secPerQv, answers) {
  const f = []; const answered = s.C + s.W + s.B + (s.U || 0);
  if (secPerQv != null && secPerQv < 8 && answered >= 10) f.push('tooFast');
  const nonBlank = answers.filter(x => x > 0);
  if (nonBlank.length >= 10 && new Set(nonBlank).size === 1) f.push('allSame');
  if (answers.length >= 10 && s.B / answers.length > 0.9) f.push('mostlyBlank');
  return f;
}

// ---------- memory / forecast (spec 24) ----------
// F-03: forgetting curve driven by the active FSRS parameter set (never hardcoded).
// FSRS-4.5/5: decay=-0.5, factor=19/81. FSRS-6: decay is fitted (w20); factor = 0.9^(1/decay) - 1.
export const FSRS_PARAMS = { '4.5': { decay: -0.5 }, '6': { decay: -0.1542 } };
export function forgettingCurve(t, S, decay = -0.5) { const factor = Math.pow(0.9, 1 / decay) - 1; return Math.pow(1 + factor * t / S, decay); }
export const fsrsR = (t, S, decay = -0.5) => forgettingCurve(t, S, decay);
export function forecastToExam(p, daysGap, S, decay = -0.5) {
  const R = fsrsR(daysGap, S, decay), floor = 0.25 * (1 - p.pB);
  if (p.pC <= floor) return { ...p, R };
  const pC = floor + (p.pC - floor) * R, lost = p.pC - pC;
  return { pC, pW: p.pW + 0.6 * lost, pB: p.pB + 0.4 * lost, R };
}
// F-04: every component clamped to [0,1] inside the engine.
export const clamp01 = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
export function readiness(c) { const k = { A: clamp01(c.A), Cov: clamp01(c.Cov), Ret: clamp01(c.Ret), Mock: clamp01(c.Mock), Err: clamp01(c.Err) };
  return 100 * (0.40 * k.A + 0.25 * k.Cov + 0.15 * k.Ret + 0.10 * k.Mock + 0.10 * k.Err); }

// Gamma/Dirichlet/Binomial samplers (Marsaglia–Tsang), seeded
function normal(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function gamma(rng, a) {
  if (a < 1) return gamma(rng, a + 1) * Math.pow(rng() || 1e-12, 1 / a);
  const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = normal(rng); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
function dirichlet(rng, al) { const g = al.map(a => gamma(rng, Math.max(a, 1e-3))); const s = g.reduce((x, y) => x + y, 0); return g.map(x => x / s); }
function multinomial(rng, n, p) { const out = [0, 0, 0]; for (let i = 0; i < n; i++) { const u = rng(); out[u < p[0] ? 0 : u < p[0] + p[1] ? 1 : 2]++; } return out; }
const quantile = (s, q) => { const h = (s.length - 1) * q, lo = Math.floor(h); return s[lo] + (h - lo) * ((s[Math.min(lo + 1, s.length - 1)]) - s[lo]); };

/** topics: [{id, n, pC,pW,pB, effectiveN, section}] → per-section and total P10/P50/P90. spec 07 §6 + 24 §3 + 26. */
export function simulate(topics, { runs = 5000, seed = 1, k = 4, widen = 1, bias = 0 } = {}) {
  const rng = mulberry32(seed), sections = [...new Set(topics.map(t => t.section))];
  const tot = [], per = Object.fromEntries(sections.map(s => [s, []]));
  for (let r = 0; r < runs; r++) {
    const acc = Object.fromEntries(sections.map(s => [s, [0, 0, 0]]));
    for (const t of topics) {
      const conc = (t.effectiveN + k) / widen;
      const p = dirichlet(rng, [t.pC * conc, t.pW * conc, t.pB * conc]);
      const m = multinomial(rng, t.n, p); const a = acc[t.section]; a[0] += m[0]; a[1] += m[1]; a[2] += m[2];
    }
    let C = 0, W = 0, N = 0;
    for (const s of sections) { const [c, w, b] = acc[s]; const n = c + w + b; per[s].push(percent(c, w, n) - bias); C += c; W += w; N += n; }
    tot.push(percent(C, W, N) - bias);
  }
  const summ = arr => { const s = [...arr].sort((a, b) => a - b); return { P10: quantile(s, 0.1), P50: quantile(s, 0.5), P90: quantile(s, 0.9), mean: arr.reduce((x, y) => x + y, 0) / arr.length }; };
  return { total: summ(tot), sections: Object.fromEntries(sections.map(s => [s, summ(per[s])])) };
}
/** gain in total-percent points per minute for a test block on topic t (spec 24 §6). */
// F-01: spec 24 §6. g = w × Δp × 100 × (s_W·4/3 + s_B), Δp = min(0.15, v·c/60). Single implementation.
export function expectedGain({ weight, pW = 0.5, pB = 0.5, velocityPerHour = 0.06, minutes }) {
  const sW = pW + pB > 0 ? pW / (pW + pB) : 0.5, sB = 1 - sW;
  const dp = Math.min(0.15, velocityPerHour * minutes / 60);
  return weight * dp * 100 * (sW * 4 / 3 + sB);
}
export function gainPerMin(o) { return o.minutes ? expectedGain(o) / o.minutes : 0; }

// ---------- BKT (spec 13, with spec 25 multi-skill split) ----------
export function bktUpdate(pL, correctObs, { pT = 0.15, pG = 0.25, pS = 0.1, pF = 0.01, days = 0, weight = 1, blank = false } = {}) {
  pL = pL * Math.pow(1 - pF, days);
  const g = blank ? 0 : pG; let post;
  if (correctObs) post = pL * (1 - pS) / (pL * (1 - pS) + (1 - pL) * g);
  else post = pL * pS / (pL * pS + (1 - pL) * (1 - g));
  const full = post + (1 - post) * pT;
  return pL + weight * (full - pL);
}

// ---------- SSB parser (spec 08, minimal) ----------
export function parseSSB(text) {
  const meta = {}, nodes = [], stack = [], errors = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim(); if (!line || line.startsWith('//')) return;
    if (line.startsWith('#')) { const [k, ...v] = line.slice(1).split(':'); meta[k.trim()] = v.join(':').trim(); return; }
    const m = line.match(/^(=+)\s+(.+)$/); if (!m) { errors.push({ line: i + 1, code: 'E_SYNTAX' }); return; }
    const depth = m[1].length - 1; let title = m[2], kind = 'topic';
    const tag = title.match(/\{([^}]*)\}/);
    let flags = [];
    if (tag) { const t = tag[1]; flags = t.split('|').map(x => x.trim()); kind = { 'مخلوط': 'mixed', 'چکاپ': 'checkup', 'جامع': 'comprehensive', 'نهایی': 'final', 'آزمون': 'final', 'درسنامه': 'theory' }[flags[0]] || 'topic'; title = title.replace(tag[0], '').trim(); }
    if (depth > (stack.length)) errors.push({ line: i + 1, code: 'E_DEPTH_JUMP' });
    stack.length = depth;
    const node = { id: `n${nodes.length + 1}`, title, kind, depth, parentId: stack[depth - 1]?.id ?? null, order: nodes.length };
    if (flags.includes('شماره‌جدا') || flags.includes('شماره جدا')) node.ownNumbering = true; // spec 31 TB-2
    nodes.push(node); stack[depth] = node;
  });
  for (const n of nodes) n.isLeaf = !nodes.some(c => c.parentId === n.id);
  return { meta, nodes, errors };
}

// ---------- raw publisher TOC → nodes (spec 08 raw detection, v3) ----------
const ORD = { 'اول': 1, 'دوم': 2, 'سوم': 3, 'چهارم': 4, 'پنجم': 5, 'ششم': 6, 'هفتم': 7, 'هشتم': 8, 'نهم': 9, 'دهم': 10 };
export function rawTocToNodes(text) {
  const out = []; let last = { chapter: -1, lesson: -1 };
  for (let raw of text.split(/\r?\n/)) {
    let l = normalizeDigits(raw).replace(/\u00a0/g, ' ').trim();
    if (!l || /^[=\-]+$/.test(l) || /^(کتاب|توجه|فهرست|پایان کل کتاب)/.test(l)) continue;
    let m;
    if ((m = l.match(/^فصل\s*(\S+?)[\s:ـ\-–]+(.+)$/))) { out.push({ depth: 0, title: `فصل ${ORD[m[1]] ?? m[1]}: ${m[2].trim()}`, kind: 'topic' }); last = { chapter: 0, lesson: -1 }; continue; }
    if ((m = l.match(/^درس(?:‌های|های)?\s*(.+?)\s*:\s*(.+)$/))) { out.push({ depth: 1, title: `درس ${m[1]}: ${m[2]}`.replace(/(اول|دوم|سوم|چهارم|پنجم)/g, w => ORD[w]), kind: 'topic' }); last.lesson = 1; continue; }
    if ((m = l.match(/^زیرعنوان\s*([\d\-]+)\s*:?\s*(.+)$/))) { out.push({ depth: 2, title: `${m[1]} ${m[2]}`, kind: /تست‌های مخلوط/.test(m[2]) ? 'mixed' : 'topic' }); continue; }
    if ((m = l.match(/^بخش\s*(\d+|اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم)\s*:?\s*(.+)$/))) { const d = last.lesson === 1 ? 2 : 1; out.push({ depth: d, title: `بخش ${ORD[m[1]] ?? m[1]}: ${m[2]}`, kind: 'topic' }); continue; }
    if ((m = l.match(/^[•·]\s*(آزمون.+)$/))) { const t = m[1]; out.push({ depth: 1, title: t, kind: /چکاپ/.test(t) ? 'checkup' : /جامع/.test(t) ? 'comprehensive' : 'final' }); continue; }
    if ((m = l.match(/^-\s*(آزمون.+)$/))) { out.push({ depth: 0, title: m[1], kind: 'final' }); continue; }
    if ((m = l.match(/^(\d+)[.\-)]\s*(.+)$/))) { out.push({ depth: 1, title: `${m[1]}. ${m[2]}`, kind: 'topic' }); continue; }
  }
  return out;
}

// ---------- Persian text normalization (F-21) ----------
export function normalizeFa(t) {
  return String(t ?? '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[\u200c\u200f\u200e]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function safetyMatch(text, phrases) {
  const t = ' ' + normalizeFa(text) + ' ';
  return phrases.some(p => { const q = normalizeFa(p); return q && t.includes(q); });
}
// ---------- FSRS-lite scheduler for review items (spec 07 §8; ratings 1..4) ----------
export function fsrsNext(item, rating, nowMs, decay = -0.5) {
  const elapsed = item.lastAt ? (nowMs - item.lastAt) / 864e5 : 0;
  let S = item.S ?? [0.4, 1.2, 3.2, 15.7][rating - 1], D = item.D ?? 5;
  if (item.reps) {
    const R = forgettingCurve(elapsed, S, decay);
    D = Math.min(10, Math.max(1, D - 0.8 * (rating - 3)));
    if (rating === 1) S = Math.max(0.2, 0.3 * Math.pow(S, 0.4));
    else S = S * (1 + Math.exp(1.2) * (11 - D) / 10 * Math.pow(S, -0.2) * (Math.exp((1 - R) * 1.5) - 1) * (rating === 2 ? 0.6 : rating === 4 ? 1.4 : 1)) + 0.1;
  }
  const factor = Math.pow(0.9, 1 / decay) - 1;
  const interval = Math.max(1, Math.round(S / factor * (Math.pow(0.9, 1 / decay) - 1)));
  return { ...item, S, D, reps: (item.reps || 0) + 1, lapses: (item.lapses || 0) + (rating === 1 ? 1 : 0), lastAt: nowMs, dueAt: nowMs + (rating === 1 ? 10 * 6e4 : interval * 864e5), lastRating: rating };
}
// Spearman with average ranks for ties (F-19)
export function spearman(x, y) {
  const rank = arr => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = Array(arr.length); let i = 0;
    while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; };
  const a = rank(x), b = rank(y), n = x.length; const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
