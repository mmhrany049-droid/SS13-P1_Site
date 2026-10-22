import { describe, it, expect } from 'vitest';
import * as S from '@ss/domain/store.js';
import * as A from '@ss/domain/analysis.js';
import * as N from '@ss/domain/narrative.js';
import * as D from '@ss/domain/redo.js';
import * as R from '@ss/domain/reviewSet.js';

const NOW = new Date('2026-10-17T12:00:00').getTime(); const TODAY = S.todayStr(new Date(NOW));
const mkBook = (id = 'tb', subject = 'ریاضی') => ({ id, uid: id, subject, subjectId: 'riazi', title: 'کتاب', active: true, numbering: 'global', levels: 0, keys: Object.fromEntries(Array.from({ length: 4000 }, (_, i) => [i + 1, (i % 4) + 1])),
  nodes: [{ id: 'c1', title: 'فصل ۱', kind: 'chapter', isLeaf: false, parentId: null }, { id: 'n1', title: 'مبحث الف', kind: 'topic', isLeaf: true, parentId: 'c1', qStart: 1, qEnd: 600 }, { id: 'n2', title: 'مبحث ب', kind: 'topic', isLeaf: true, parentId: 'c1', qStart: 601, qEnd: 1200 }, { id: 'n3', title: 'مبحث ج', kind: 'topic', isLeaf: true, parentId: 'c1', qStart: 1201, qEnd: 1800 }, { id: 'n4', title: 'مبحث د', kind: 'topic', isLeaf: true, parentId: 'c1', qStart: 1801, qEnd: 2400 }] });
let cnt = 0;
/** n answers on date d with the given accuracy / blank share; `bias` forces wrong answers to a single option. Keys: key(num) = (num-1)%4+1. */
function ses(d, n, { acc = 0.7, blank = 0, node = 'n1', hour = 10, bias = null, origin = 'new' } = {}) {
  const b = mkBook(); const nd = b.nodes.find(x => x.id === node); const answers = {}; const nC = Math.round(n * acc), nB = Math.round(n * blank);
  for (let i = 0; i < n; i++) { const num = nd.qStart + ((cnt++) % (nd.qEnd - nd.qStart + 1)); const key = b.keys[num]; const sp = (k) => Math.floor(((i + 1) * k) / n) > Math.floor((i * k) / n);
    answers[num] = sp(n - nC - nB) ? (bias ?? (key % 4) + 1) : sp(nB) ? 0 : key; }
  return { id: 's' + (++cnt), bookId: 'tb', nodeId: node, answers, at: new Date(`${d}T${String(hour).padStart(2, '0')}:00:00`).toISOString(), minutes: n * 1.2, origin };
}
const state = sessions => { const s = S.initialState(); s.books = [mkBook()]; s.sessions = sessions; return s; };
const weeks = (accs, { n = 40, node = 'n1' } = {}) => accs.map((acc, i) => ses(S.addDays(TODAY, -(accs.length - 1 - i) * 7 - 5), n, { acc: acc > 1 ? acc / 100 : acc, node })); // one session per week, oldest first

describe('analysis statistics (AN)', () => {
  it('AN01 weekly points are pooled, not averaged', () => {
    const s = state([ses(S.addDays(TODAY, -3), 5, { acc: 1 }), ses(S.addDays(TODAY, -3), 50, { acc: 0.6, hour: 14 })]); const w = A.weeklyPooled(S.attemptsOf(s)); expect(w).toHaveLength(1); expect(w[0].N).toBe(55);
    const avgOfSessions = (100 + A.sessionSeries(s)[1].P) / 2; expect(Math.abs(w[0].P - avgOfSessions)).toBeGreaterThan(5);
  });
  it('AN02 a steady +2/week climb → slope ≈ 2 and class «improving»', () => {
    const s = state(weeks([40, 42, 44, 46, 48, 50, 52])); const v = A.velocity(A.weeklyPooled(S.attemptsOf(s)), {}); expect(v.slope).toBeGreaterThan(1.2); expect(v.slope).toBeLessThan(3.2); expect(v.cls).toBe('improving'); expect(v.provisional).toBe(false);
  });
  it('AN03 Theil–Sen is robust to one wild week', () => { const pts = [40, 42, 44, 90, 48, 50].map((y, i) => ({ x: i, y })); const m = A.theilSen(pts); expect(m).toBeGreaterThan(1.5); expect(m).toBeLessThan(2.6); });
  it('AN04 classification thresholds', () => {
    expect(A.classifyVelocity({ slope: 2, lo: 0.5, hi: 3, weeks: 6 })).toBe('improving'); expect(A.classifyVelocity({ slope: 0.5, lo: -1, hi: 1.5, weeks: 6 })).toBe('flat');
    expect(A.classifyVelocity({ slope: -2, lo: -3, hi: -0.4, weeks: 6 })).toBe('declining'); expect(A.classifyVelocity({ slope: 2, lo: 1, hi: 3, weeks: 3 })).toBe('unknown');
  });
  it('AN05 time to target: gap 10 at +2/week → 5 weeks; flat or negative slope → null', () => { const e = A.timeToTarget(50, 2, 60, { lo: 1, hi: 3 }); expect(e.weeks).toBe(5); expect(e.days).toBe(35); expect(A.timeToTarget(50, 0.3, 60)).toBeNull(); expect(A.timeToTarget(50, -2, 60)).toBeNull(); expect(A.timeToTarget(65, 2, 60).weeks).toBe(0); });
  it('AN06 plateau: three flat weeks with ≥30 tests', () => { const w = [{ P: 50, N: 40 }, { P: 50.2, N: 40 }, { P: 49.9, N: 40 }]; expect(A.plateau(w)).toBe(true); expect(A.plateau([{ P: 40, N: 40 }, { P: 50, N: 40 }, { P: 60, N: 40 }])).toBe(false); expect(A.plateau([{ P: 50, N: 10 }, { P: 50, N: 10 }, { P: 50, N: 10 }])).toBe(false); });
  it('AN07 acceleration needs 8 weeks', () => { const pts = [40, 41, 42, 43, 46, 49, 52, 55].map((y, i) => ({ x: i, y })); expect(A.accelerate(pts)).toBeGreaterThan(1.5); expect(A.accelerate(pts.slice(0, 6))).toBeNull(); });
  it('AN08 topic class: little data never reads as «very low»', () => { expect(A.classOf(0.2, 0.2, 3)).toBe('insufficient'); expect(A.classOf(0.2, 0.6, 3)).toBe('low'); expect(A.classOf(0.2, 0.6, 8)).toBe('veryLow'); expect(A.classOf(0.55, 0.6, 20)).toBe('mid'); expect(A.classOf(0.8, 0.6, 20)).toBe('high'); });
  it('AN09 mastery delta compares with the state two weeks ago', () => {
    const s = state([ses(S.addDays(TODAY, -40), 40, { acc: 0.3 }), ses(S.addDays(TODAY, -2), 40, { acc: 0.9 })]); const at = S.attemptsOf(s); const d = A.masteryDelta(s, at, 14, NOW); const row = Object.values(d)[0]; expect(row.delta).toBeGreaterThan(0.05);
  });
  it('AN10 option bias: χ² flags a 40/20/20/20 habit and stays quiet on a fair spread', () => {
    const books = [mkBook()]; const mk = dist => { const atts = []; let k = 0; for (let opt = 1; opt <= 4; opt++) for (let i = 0; i < dist[opt - 1]; i++) { k++; atts.push({ result: 'W', chosen: opt, bookId: 'tb', num: k, at: '2026-10-01T10:00:00Z' }); } return atts; };
    const bad = A.optionBias(mk([40, 20, 20, 20]), books); expect(bad.significant).toBe(true); expect(bad.topOption).toBe(1);
    expect(A.optionBias(mk([25, 25, 25, 25]), books).significant).toBe(false); expect(A.optionBias(mk([10, 10, 10, 10]), books)).toBeNull();
  });
  it('AN11 leaks sum to 100 − percent', () => {
    const s = state([ses(S.addDays(TODAY, -2), 60, { acc: 0.6, blank: 0.15 })]); const at = S.attemptsOf(s); const L = A.leaksBy(at, 'reason'); const c = A.counts(A.realAtts(at)); expect(L.total).toBeCloseTo(100 - c.P, 4);
  });
  it('AN12 repeat offenders: ≥2 bad results on the same question', () => { const mk = (r, d) => ({ ref: 'tb:1', bookId: 'tb', nodeId: 'n1', num: 1, result: r, at: `2026-10-${d}T10:00:00Z`, reasons: [] }); const o = A.repeatOffenders([mk('W', '01'), mk('B', '02'), mk('C', '03')]); expect(o).toHaveLength(1); expect(o[0].bad).toBe(2); });
  it('AN13 hour bands need 20 tests before they speak', () => { const s = state([ses(S.addDays(TODAY, -2), 30, { hour: 9 }), ses(S.addDays(TODAY, -3), 10, { hour: 22 })]); const b = A.hourBands(S.attemptsOf(s)); expect(b.find(x => x.k === 'morning').enough).toBe(true); expect(b.find(x => x.k === 'night').enough).toBe(false); });
  it('AN14 session size curve and fatigue deciles need enough data', () => { const sess = Array.from({ length: 7 }, (_, i) => ses(S.addDays(TODAY, -i - 1), 12)); const c = A.sessionSizeCurve(A.sessionSeries(state(sess))); expect(c.find(x => x.fa === '۱۱–۱۵').enough).toBe(true); expect(A.fatigueCurve(S.attemptsOf(state(sess))).every(r => r.score == null)).toBe(true); });
  it('AN14b speed bins need six timed sessions', () => { expect(A.speedBins(A.sessionSeries(state([ses(S.addDays(TODAY, -2), 20)])))).toBeNull(); const sess = Array.from({ length: 7 }, (_, i) => ses(S.addDays(TODAY, -i - 1), 20)); const sp = A.speedBins(A.sessionSeries(state(sess))); expect(sp.n).toBe(7); expect(sp.median).toBeGreaterThan(50); });
  it('AN15 learning curve: needs 15 tests and 3 sessions, error falls with practice', () => {
    expect(A.learningCurve([])).toBeNull(); const s = state([ses(S.addDays(TODAY, -9), 20, { acc: 0.4 }), ses(S.addDays(TODAY, -6), 20, { acc: 0.6 }), ses(S.addDays(TODAY, -3), 20, { acc: 0.85 })]); const lc = A.learningCurve(S.attemptsOf(s)); expect(lc).toBeTruthy(); expect(lc.b).toBeLessThan(0);
  });
  it('AN16 the narrative never shames, never says «باید», and is silent without data', () => {
    expect(N.buildNarrative(S.initialState(), {}, NOW).insufficient).toBe(true);
    const s = state(weeks([40, 42, 44, 46, 48, 50, 52])); const nar = N.buildNarrative(s, { range: '8w' }, NOW); expect(nar.n).toBeGreaterThan(2);
    const text = JSON.stringify(nar); for (const w of N.BANNED) expect(text.includes(w)).toBe(false);
    const sup = N.buildNarrative({ ...s, pace: { mode: 'protect' } }, { range: '8w' }, NOW); expect(sup.supportive).toBe(true); expect(sup.sections[0].items[0].id).toBe('N00'); expect(sup.sections.flatMap(x => x.items).some(i => i.tone === 'watch')).toBe(false);
  });
  it('AN17 weekly report is created once per week', () => { const s = state(weeks([40, 42, 44, 46, 48, 50, 52])); const a = N.ensureWeeklyReport(s, NOW); expect(a.analysis.reports).toHaveLength(1); const b = N.ensureWeeklyReport(a, NOW); expect(b).toBe(a); });
  it('AN18 filters: subject / range / origin never leak other data', () => { const s = state([ses(S.addDays(TODAY, -2), 20), ses(S.addDays(TODAY, -40), 20), ses(S.addDays(TODAY, -3), 10, { origin: 'review' })]); const at = S.attemptsOf(s); expect(A.applyFilter(at, { range: '4w' }, TODAY).length).toBe(30); expect(A.applyFilter(at, { range: '4w', origin: ['review'] }, TODAY).length).toBe(10); expect(A.applyFilter(at, { subjects: ['فیزیک'] }, TODAY).length).toBe(0); });
  it('AN19 analysisCtx is lazy and cached for the same state and filter', () => { const s = state(weeks([50, 52, 54, 56])); const c1 = A.analysisCtx(s, { range: '8w' }, NOW), c2 = A.analysisCtx(s, { range: '8w' }, NOW); expect(c1).toBe(c2); expect(c1.mastery.length).toBeGreaterThan(0); });
  it('AN20 every statistic is null-safe on an empty state', () => { const s = S.initialState(); const c = A.analysisCtx(s, {}, NOW); for (const f of [() => c.weekly, () => c.mastery, () => c.velocityAll, () => c.velocityBySubject, () => A.behaviorStats(s, TODAY), () => A.retentionCurve(s), () => A.stabilityHist(s), () => A.examGap(s, []), () => A.efficiency(s, [])]) expect(() => f()).not.toThrow(); });
});

describe('redo plans (RD)', () => {
  const base = () => { const s = state([ses(S.addDays(TODAY, -5), 60, { acc: 0.2 }), ses(S.addDays(TODAY, -5), 60, { acc: 0.25, node: 'n2', hour: 12 }), ses(S.addDays(TODAY, -5), 60, { acc: 0.3, node: 'n3', hour: 14 }), ses(S.addDays(TODAY, -5), 60, { acc: 0.35, node: 'n4', hour: 16 })]); s.settings.reviewSetSize = 20; return s; };
  it('RD01 topic tests: keyless questions are left out, scope wrongBlank keeps only the bad ones', () => {
    const s = base(); delete s.books[0].keys[10]; const all = D.topicTests(s, 'tb', 'n1', { scope: 'all' }); expect(all.includes('tb:10')).toBe(false); expect(all.length).toBe(599);
    const wb = D.topicTests(s, 'tb', 'n1', { scope: 'wrongBlank' }); expect(wb.length).toBeGreaterThan(30); expect(wb.length).toBeLessThan(60);
  });
  it('RD02 sets: 53 → 20/20/13 and 45 → 20/20/5 (the last set stays small)', () => { expect(D.chunkSets(Array.from({ length: 53 }, (_, i) => 'a:' + i), 20).map(x => x.refs.length)).toEqual([20, 20, 13]); expect(D.chunkSets(Array.from({ length: 45 }, (_, i) => 'a:' + i), 20).map(x => x.refs.length)).toEqual([20, 20, 5]); });
  it('RD03 at most 3 active plans; the weakest topics go first, the rest queue', () => {
    const s = base(); const keys = ['n1', 'n2', 'n3', 'n4'].map(n => 'tb|' + n); const r = D.planRedo(s, S.attemptsOf(s), keys, { scope: 'wrongBlank', now: NOW }); expect(r.plans.filter(p => p.status === 'active')).toHaveLength(3); expect(r.plans.filter(p => p.status === 'queued')).toHaveLength(1); expect(r.plans.find(p => p.status === 'queued').topicKey).toBe('tb|n4');
  });
  it('RD04 group redo is closed while the pace path protects; a single topic is still allowed', () => {
    const s = { ...base(), pace: { mode: 'protect', weekdays: [6, 0, 1, 2, 3] } }; const at = S.attemptsOf(s); expect(D.planRedo(s, at, ['tb|n1', 'tb|n2'], { now: NOW }).closed).toBe(true); expect(D.planRedo(s, at, ['tb|n1'], { now: NOW, scope: 'wrongBlank' }).plans).toHaveLength(1);
  });
  it('RD05 outcomes: recovered / improved / stuck', () => {
    const s = base(); const at = S.attemptsOf(s); const plan = { id: 'p', topicKey: 'tb|n1', round: 1, baseline: { pC: 0.3 } };
    const withSet = (C, W) => ({ ...s, reviewSets: [{ id: 'x', planId: 'p', round: 1, C, W, B: 0 }] });
    expect(D.measureRedo(withSet(16, 4), at, plan, NOW).outcome).toBe('recovered'); expect(D.measureRedo(withSet(8, 12), at, { ...plan, baseline: { pC: 0.05 } }, NOW).outcome).toBe('improved'); expect(D.measureRedo(withSet(6, 14), at, { ...plan, baseline: { pC: 0.9 } }, NOW).outcome).toBe('stuck');
  });
  it('RD06 finishing a recovered plan writes history, spaced reviews at +3 and +10 days, and wakes the queue', () => {
    let s = base(); const r = D.planRedo(s, S.attemptsOf(s), ['n1', 'n2', 'n3', 'n4'].map(n => 'tb|' + n), { scope: 'wrongBlank', now: NOW }); s = D.addPlans(s, r.plans); const p = s.redo.plans.find(x => x.topicKey === 'tb|n1'); s.reviewSets = [{ id: 'x', planId: p.id, round: 1, C: 18, W: 2, B: 0 }];
    const out = D.finishRound(s, p.id, NOW); expect(out.outcome).toBe('recovered'); expect(out.s.redo.history).toHaveLength(1); expect(out.s.redo.plans.find(x => x.id === p.id)).toBeUndefined(); expect(out.s.placements.filter(x => x.source === 'redo')).toHaveLength(2); expect(out.s.redo.plans.filter(x => x.status === 'active')).toHaveLength(3);
  });
  it('RD07 stuck: round 1 proposes the textbook, round 3 pauses and asks', () => {
    let s = base(); const r = D.planRedo(s, S.attemptsOf(s), ['tb|n1'], { scope: 'wrongBlank', now: NOW }); s = D.addPlans(s, r.plans); const p = s.redo.plans[0]; s.reviewSets = [{ id: 'x', planId: p.id, round: 1, C: 5, W: 15, B: 0 }]; s = { ...s, redo: { ...s.redo, plans: [{ ...p, baseline: { ...p.baseline, pC: 0.9 } }] } };
    const a = D.finishRound(s, p.id, NOW); expect(a.outcome).toBe('stuck'); expect(a.s.redo.plans[0].escalation).toBe('textbook'); expect(a.s.redo.plans[0].round).toBe(2);
    const b = { ...a.s, redo: { ...a.s.redo, plans: [{ ...a.s.redo.plans[0], round: 3, baseline: { pC: 0.9 } }] }, reviewSets: [{ id: 'y', planId: p.id, round: 3, C: 4, W: 16, B: 0 }] }; const c = D.finishRound(b, p.id, NOW); expect(c.s.redo.plans[0].status).toBe('paused'); expect(c.s.redo.plans[0].escalation).toBe('ask');
  });
  it('RD08 scheduling: one set per day, planned weekdays only, drafts only', () => {
    let s = base(); const r = D.planRedo(s, S.attemptsOf(s), ['tb|n1'], { scope: 'all', now: NOW, size: 20 }); const sch = D.schedulePlan(s, r.plans[0], '2026-10-17'); const days = sch.placements.map(x => x.date); expect(new Set(days).size).toBe(days.length); expect(sch.placements.every(x => x.status === 'draft' && x.source === 'redo')).toBe(true);
    for (const d of days) expect([6, 0, 1, 2, 3].includes(new Date(d + 'T12:00:00').getDay())).toBe(true);
  });
  it('RD09 end to end: grade a redo set → afterRedoSet marks it done and closes the round', () => {
    let s = base(); const r = D.planRedo(s, S.attemptsOf(s), ['tb|n1'], { scope: 'wrongBlank', now: NOW, size: 100 }); s = D.addPlans(s, r.plans); const p = s.redo.plans[0]; expect(p.sets).toHaveLength(1);
    const set = { ...R.buildReviewSet(s, S.attemptsOf(s), { refs: p.sets[0].refs, kind: 'redo', size: 100, now: NOW }), planId: p.id, redoSetId: p.sets[0].id }; set.answers = Object.fromEntries(set.order.map((ref, i) => [ref, i % 4 === 3 ? 4 : s.books[0].keys[R.splitRef(ref).num]]));
    const g = R.gradeReviewSet(s, set, { now: NOW, durationSec: set.order.length * 90 }); expect(g.s2.sessions.at(-1).origin).toBe('redo'); const out = D.afterRedoSet(g.s2, set, g.report, NOW); expect(['recovered', 'improved', 'stuck', 'mixed']).toContain(out.outcome);
  });
});
