import { describe, it, expect } from 'vitest';
import * as S from '@ss/domain/store.js';
import * as P from '@ss/domain/testPace.js';

// ---- fixtures: one test book with 3000 keyed questions (key = option 1); Saturday-based calendar of Oct 2026 ----
const KEYS = Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [i + 1, 1]));
const book = () => ({ id: 'tb', uid: 'tb', subject: 'ریاضی', subjectId: 'riazi', active: true, numbering: 'global', levels: 0, keys: { ...KEYS }, nodes: [{ id: 'n1', title: 'مبحث', isLeaf: true, kind: 'topic', parentId: null, qStart: 1, qEnd: 3000 }] });
const at = (d, h = 10) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).toISOString();
let counter = 0;
/** n answers on day d; `acc` = share correct, `blank` = share left blank; `pattern` overrides (array of 1|2|0 by position). */
function day(d, n, { acc = 0.75, blank = 0, hour = 10, pattern = null } = {}) {
  const answers = {}; const nC = Math.round(n * acc), nB = Math.round(n * blank);
  const nW = n - nC - nB; const spread = (i, k) => Math.floor(((i + 1) * k) / n) > Math.floor((i * k) / n); // evenly interleaved
  for (let i = 0; i < n; i++) { const num = ++counter; answers[num] = pattern ? pattern[i] : spread(i, nW) ? 2 : spread(i, nB) ? 0 : 1; }
  return { id: `s${counter}`, bookId: 'tb', nodeId: 'n1', answers, at: at(d, hour), minutes: n * 1.5, origin: 'new' };
}
const SAT = '2026-10-03';
const D = { sat1: '2026-10-03', sun1: '2026-10-04', mon1: '2026-10-05', tue1: '2026-10-06', wed1: '2026-10-07', thu1: '2026-10-08', fri1: '2026-10-09', sat2: '2026-10-10', sun2: '2026-10-11', mon2: '2026-10-12', tue2: '2026-10-13' };
function mk({ sessions = [], pace = {}, checks = [], exams = [] } = {}) {
  const s = S.initialState(); s.books = [book()]; s.sessions = sessions; s.exams = exams;
  s.pace = { ...P.newPace({ startedAt: '2026-09-26', start: 20, mode: 'normal', calibDaysLeft: 0 }), ...pace };
  s.dailyChecks = checks.map(c => ({ difficulty: 2, energy: 3, liking: 4, tomorrow: 'same', missReason: null, note: null, ...c }));
  return s;
}
const good = days => days.map(d => day(d, 20));
const run7 = [D.sat1, D.sun1, D.mon1, D.tue1, D.wed1, D.sat2, D.sun2]; // seven planned data days, today = sun2
const chk3 = [D.sat2, D.sun2, D.wed1].map(d => ({ d }));

describe('start point (T01–T04)', () => {
  it('T01 no data and no questionnaire → 20', () => { expect(P.startTarget(mk({ pace: {} }), null, null)).toBe(20); });
  it('T02 O1 maps to 10 / 20 / 25 / 30', () => { const s = mk(); for (const [a, v] of [['0-10', 10], ['11-20', 20], ['21-35', 25], ['>35', 30]]) expect(P.startTarget(s, { answers: { O1: a } })).toBe(v); });
  it('T03 real average of 20 tests/day → 20, not 30 (v12 bug D-1)', () => { const days = []; for (let i = 0; i < 14; i++) days.push(S.addDays('2026-09-20', i)); expect(P.startTarget(mk({ sessions: days.map(d => day(d, 20)) }))).toBe(20); });
  it('T04 one study hour caps the start at floor(0.5·60/1.6)=18 (≥10)', () => { const v = P.startTarget(mk(), { answers: { O3: 1 } }); expect(v).toBeLessThanOrEqual(18); expect(v).toBeGreaterThanOrEqual(10); });
});

describe('daily decision', () => {
  it('T05 calibration days never grow', () => { const s = mk({ sessions: good([D.sat1, D.sun1]), pace: { mode: 'calibrate', calibDaysLeft: 3 }, checks: [{ d: D.sat1 }, { d: D.sun1 }] }); const r = P.decideTomorrow(s, D.sun1); expect(r.decision).toBe('hold'); expect(r.codes).toContain('calibrating'); expect(r.value).toBe(20); });
  it('T06 three good days in four, no soft sign → 20 → 22', () => { const s = mk({ sessions: good(run7), checks: chk3 }); const r = P.decideTomorrow(s, D.sun2); expect(r.decision).toBe('grow'); expect(r.value).toBe(22); expect(r.growth.from).toBe(20); });
  it('T07 40 at g=0.1 grows by 4, but the ceiling 42 wins', () => { const s = mk({ sessions: run7.map(d => day(d, 40, { acc: 1 })), pace: { target: 40, comfort: 40, ceiling: 42 }, checks: chk3 }); const r = P.decideTomorrow(s, D.sun2); expect(r.value).toBe(42); });
  it('T08 accuracy below own average → hold with blocker', () => { const sess = [...good(run7.slice(0, 6)), day(D.sun2, 20, { acc: 0.5 })]; const r = P.decideTomorrow(mk({ sessions: sess, checks: chk3 }), D.sun2); expect(r.decision).toBe('hold'); expect(r.codes).toContain('accuracy_drop'); });
  it('T09 end-of-day fatigue → hold', () => { const pat = [...Array(12).fill(1), ...Array(12).fill(1), ...Array(12).fill(2)]; const sess = [...good(run7.slice(0, 6)), day(D.sun2, 36, { pattern: pat })]; const r = P.decideTomorrow(mk({ sessions: sess, checks: chk3 }), D.sun2); expect(r.decision).toBe('hold'); expect(r.codes).toContain('fatigue'); });
  it('T10 a late night before → hold', () => { const sess = [...good(run7), day(D.sun2, 1, { hour: 2 })]; const r = P.decideTomorrow(mk({ sessions: sess, checks: chk3 }), D.sun2); expect(r.codes).toContain('late_night'); expect(r.decision).toBe('hold'); });
  it('T11 exam in two days → hold', () => { const s = mk({ sessions: good(run7), checks: chk3, exams: [{ id: 'e1', date: D.tue2, kind: 'upcoming', sittings: [], sections: [] }] }); const r = P.decideTomorrow(s, D.sun2); expect(r.decision).toBe('hold'); expect(r.codes).toContain('exam_near'); });
  it('T12 two days after the last growth → hold (gap)', () => { const s = mk({ sessions: good(run7), checks: chk3, pace: { growth: [{ at: D.fri1, kind: 'tests', from: 20, to: 20, evaluated: false, ok: null }] } }); const r = P.decideTomorrow(s, D.sun2); expect(r.decision).toBe('hold'); expect(r.codes).toContain('gap'); });
  it('T13 one missed day: hold, no debt', () => { const sess = [...good(run7.slice(0, 6)), day(D.sun2, 6)]; const r = P.decideTomorrow(mk({ sessions: sess, checks: chk3 }), D.sun2); expect(r.decision).toBe('hold'); expect(r.codes).toContain('one_miss'); expect(r.value).toBeLessThanOrEqual(20); });
  it('T14 two misses in a row → recover at half the comfort level', () => { const sess = [...good(run7.slice(0, 5)), day(D.sat2, 6), day(D.sun2, 6)]; const s = mk({ sessions: sess, checks: chk3 }); const r = P.decideTomorrow(s, D.sun2); expect(r.mode).toBe('recover'); expect(r.value).toBe(Math.max(10, Math.round(0.5 * P.comfortLevel(s, D.sun2)))); expect(r.askDialog).toBeFalsy(); });
  it('T15 three misses → recover + dialog + 7-day lock', () => { const sess = [...good(run7.slice(0, 4)), day(D.wed1, 5), day(D.sat2, 5), day(D.sun2, 5)]; const r = P.decideTomorrow(mk({ sessions: sess, checks: chk3 }), D.sun2); expect(r.mode).toBe('recover'); expect(r.askDialog).toBe(true); expect(r.lock.until).toBe(S.addDays(D.sun2, 7)); });
  it('T16 days without data are not misses; two in a row → only a gentle ping', () => { const s = mk({ sessions: good(run7.slice(0, 5)), checks: [] }); expect(P.consecutiveMiss(s, D.sun2)).toBe(0); expect(P.missedPlan(s, D.sun2).gentlePing).toBe(true); expect(P.decideTomorrow(s, D.sun2).decision).toBe('hold'); });
  it('T17 freeze: nothing is counted; after it → one soft recovery day at 0.8·comfort', () => {
    const s = mk({ sessions: good(run7.slice(0, 5)), pace: { mode: 'freeze', freeze: { from: D.sat2, to: D.sun2, why: 'مریضی' } } });
    expect(P.consecutiveMiss(s, D.sun2)).toBe(0); expect(P.decideTomorrow(s, D.sun2).codes).toContain('freeze');
    const after = P.decideTomorrow(s, D.mon2); expect(after.mode).toBe('recover'); expect(after.value).toBe(Math.round(0.8 * P.comfortLevel(s, D.mon2)));
  });
  it('T18 two of the last three days under 60% → ease to 0.8·comfort', () => { const sess = [day(D.sat1, 20), day(D.sun1, 20), day(D.mon1, 20), day(D.tue1, 11), day(D.wed1, 11), day(D.sat2, 20)]; const s = mk({ sessions: sess }); const r = P.decideTomorrow(s, D.sat2); expect(r.decision).toBe('ease'); expect(r.value).toBe(16); });
  it('T19 «very hard» twice in three check-ins → ease', () => { const s = mk({ sessions: good(run7), checks: [{ d: D.sat2, difficulty: 5 }, { d: D.sun2, difficulty: 5 }, { d: D.wed1, difficulty: 2 }] }); const r = P.decideTomorrow(s, D.sun2); expect(r.decision).toBe('ease'); expect(r.value).toBe(16); });
  it('T20 liking 2,2,2 → protection with a 7-day lock and no growth', () => { const s = mk({ sessions: good(run7), checks: [D.wed1, D.sat2, D.sun2].map(d => ({ d, liking: 2 })) }); const r = P.decideTomorrow(s, D.sun2); expect(r.mode).toBe('protect'); expect(r.lock.until).toBe(S.addDays(D.sun2, 7)); expect(r.decision).toBe('ease'); expect(r.growth).toBeUndefined(); });
  it('T21 «no desire» three times in a week → protection', () => { const s = mk({ sessions: good(run7), checks: [D.mon1, D.tue1, D.sun2].map(d => ({ d, missReason: 'no_desire' })) }); expect(P.protectMode(s, D.sun2).on).toBe(true); expect(P.decideTomorrow(s, D.sun2).mode).toBe('protect'); });
  it('T22 growth factor: a stable growth ×1.25 (cap 0.20); an unstable one ×0.6 (floor 0.03)', () => {
    const okS = mk({ sessions: [D.sat2, D.sun2, D.mon2].map(d => day(d, 22)), pace: { target: 22, g: 0.1, comfort: 20, growth: [{ at: D.wed1, kind: 'tests', from: 20, to: 22, evaluated: false, ok: null }] }, checks: [D.sat2, D.sun2, D.mon2].map(d => ({ d })) });
    const a = P.updateGrowthRate(okS, D.mon2).pace; expect(a.g).toBeCloseTo(0.125, 3); expect(a.comfort).toBeGreaterThanOrEqual(22); expect(a.growth[0].ok).toBe(true);
    const badS = mk({ sessions: [D.sat2, D.sun2, D.mon2].map(d => day(d, 12)), pace: { target: 22, g: 0.1, comfort: 20, growth: [{ at: D.wed1, kind: 'tests', from: 20, to: 22, evaluated: false, ok: null }] } });
    const b = P.updateGrowthRate(badS, D.mon2).pace; expect(b.g).toBeCloseTo(0.06, 3); expect(b.growth[0].ok).toBe(false);
    expect(P.updateGrowthRate(mk({ pace: { g: 0.19, growth: [] } }), D.mon2).pace.g).toBeCloseTo(0.19, 3);
  });
  it('T23 comfort level = highest number kept 3 planned days in a row', () => { const s = mk({ sessions: [D.sat1, D.sun1, D.mon1].map(d => day(d, 30)), pace: { target: 30, comfort: 20 }, checks: [D.sat1, D.sun1, D.mon1].map(d => ({ d, difficulty: 2 })) }); expect(P.comfortLevel(s, D.mon1)).toBeGreaterThanOrEqual(30); });
  it('T24 one dial per week: a tests growth blocks minutes, and the other way round', () => {
    const t = mk({ sessions: good(run7), checks: chk3, pace: { growth: [{ at: D.sat2, kind: 'tests', from: 20, to: 22, evaluated: false, ok: null }] } }); expect(P.readiness(t, D.sun2, { kind: 'minutes' }).blockers).toContain('one_dial');
    const m = mk({ sessions: good(run7), checks: chk3, pace: { growth: [{ at: D.sat2, kind: 'minutes', from: 60, to: 70, evaluated: false, ok: null }] } }); expect(P.readiness(m, D.sun2, { kind: 'tests' }).blockers).toContain('one_dial');
  });
  it('T25 «a bit more»: ignored with a soft sign, at most one step above the suggestion otherwise', () => {
    const flagged = mk({ sessions: good(run7), checks: [{ d: D.sat2 }, { d: D.wed1 }, { d: D.sun2, tomorrow: 'harder', energy: 1 }] }); const a = P.decideTomorrow(flagged, D.sun2); expect(a.codes).toContain('harder_ignored'); expect(a.value).toBeLessThanOrEqual(20);
    const clean = mk({ sessions: good(run7), checks: [{ d: D.sat2 }, { d: D.wed1 }, { d: D.sun2, tomorrow: 'harder' }] }); const b = P.decideTomorrow(clean, D.sun2); expect(b.value).toBeGreaterThan(22 - 1); expect(b.value).toBeLessThanOrEqual(24);
  });
  it('T26 «lighter» is applied at once: 0.8·target, never below 10', () => { const s = mk({ sessions: good(run7), checks: [{ d: D.sun2, tomorrow: 'lighter' }] }); expect(P.decideTomorrow(s, D.sun2).value).toBe(16); expect(P.requestLighter(s, D.sun2).pace.target).toBe(16); expect(P.decideTomorrow(mk({ sessions: good(run7), pace: { target: 12 }, checks: [{ d: D.sun2, tomorrow: 'lighter' }] }), D.sun2).value).toBe(10); });
  it('T27 Thursday / Friday: no decision and no miss', () => { const s = mk({ sessions: good(run7.slice(0, 5)) }); expect(P.isPlanned(s, D.thu1)).toBe(false); expect(P.isPlanned(s, D.fri1)).toBe(false); const r = P.decideTomorrow(s, D.thu1); expect(r.decision).toBe('hold'); expect(r.value).toBe(20); expect(P.dayOutcome(s, D.thu1).miss).toBe(false); });
  it('T28 deterministic', () => { const s = mk({ sessions: good(run7), checks: chk3 }); expect(JSON.stringify(P.decideTomorrow(s, D.sun2))).toBe(JSON.stringify(P.decideTomorrow(s, D.sun2))); });
  it('T29 migration: the daily-tests habit is replaced; other habits untouched; pace built from the last 14 days', () => {
    const old = { ...S.initialState(), dataVersion: 9, pace: undefined, books: [book()], sessions: Array.from({ length: 8 }, (_, i) => day(S.addDays(S.todayStr(), -i - 1), 20)),
      habits: { list: [{ id: 'h1', templateId: 'daily-tests', title: 'x', type: 'build', weekdays: [6], log: {}, ladder: [[20, 'a']], level: 0, active: true }, { id: 'h2', templateId: 'review', title: 'r', type: 'build', weekdays: [6], log: { '2026-10-01': 1 }, ladder: [[5, 'a']], level: 0, active: true }], answers: {}, quizAt: null, checks: [] },
      placements: [{ id: 'p1', date: S.todayStr(), title: 't', minutes: 30, kind: 'عادت', habitId: 'h1', status: 'draft' }, { id: 'p2', date: S.todayStr(), title: 'u', minutes: 30, kind: 'عادت', habitId: 'h2', status: 'draft' }] };
    const m = S.migrate(old); expect(m.dataVersion).toBe(S.DATA_VERSION); expect(m.habits.list.map(h => h.id)).toEqual(['h2']); expect(m.habits.list[0].log['2026-10-01']).toBe(1);
    expect(m.placements.map(p => p.id)).toEqual(['p2']); expect(m.pace).toBeTruthy(); expect(m.pace.target).toBe(20); expect(m.pace.mode).toBe('normal');
  });
  it('T30 every function is null-safe on a state without pace / dailyChecks', () => {
    const s = S.initialState(); delete s.pace; delete s.dailyChecks; const d = D.sun2;
    for (const f of [() => P.dayOutcome(s, d), () => P.decideTomorrow(s, d), () => P.readiness(s, d), () => P.protectMode(s, d), () => P.consecutiveMiss(s, d), () => P.missedPlan(s, d), () => P.comfortLevel(s, d), () => P.softFlags(s, d), () => P.weeklyPatterns(s), () => P.closeDay(s, d), () => P.rollTo(s, d), () => P.updateGrowthRate(s, d), () => S.testsCapOf(s, d)]) expect(() => f()).not.toThrow();
  });
});

describe('roll-over, apply and integration', () => {
  it('closeDay records the day and shows tomorrow with reasons; rollTo applies it once (idempotent)', () => {
    const s0 = mk({ sessions: good(run7), checks: chk3 }); const s1 = P.closeDay(s0, D.sun2); expect(s1.pace.history.at(-1).d).toBe(D.sun2); expect(s1.pace.nextTarget.reasons.length).toBeGreaterThan(0); expect(s1.pace.nextTarget.value).toBe(22);
    const s2 = P.rollTo(s0, D.mon2); const s3 = P.rollTo(s2, D.mon2); expect(s2.pace.target).toBe(s3.pace.target); expect(s2.pace.lastClosed).toBe(D.sun2);
  });
  it('testsCapOf follows the pace target; catch-up days and a freeze are respected', () => {
    const s = mk({ pace: { target: 24, asOf: D.sun2 } }); expect(S.testsCapOf(s, D.sun2)).toBe(24); expect(S.testsCapOf(s, D.thu1)).toBeNull();
    const f = mk({ pace: { mode: 'freeze', freeze: { from: D.sat2, to: D.sun2 } } }); expect(S.testsCapOf(f, D.sat2)).toBe(0);
  });
  it('ensurePace builds a state from the questionnaire; the numbers are never shown as labels', () => {
    const base = S.initialState(); const s = P.ensurePace(base, D.sat1, { onboard: { answers: { O1: '21-35', O2: 25, O13: 5, O14: 5, O15: 5 } } });
    expect(s.pace.target).toBe(25); expect(s.pace.mode).toBe('calibrate'); expect(s.pace.g).toBeCloseTo(0.12, 2); expect(P.ensurePace(s, D.sat1)).toBe(s);
  });
  it('a daily check-in is saved once per day (the last answer wins) and the cap holds', () => { let s = mk(); s = P.saveDailyCheck(s, { d: D.sun2, difficulty: 3 }); s = P.saveDailyCheck(s, { d: D.sun2, difficulty: 4 }); expect(s.dailyChecks.filter(c => c.d === D.sun2)).toHaveLength(1); expect(P.checkOf(s, D.sun2).difficulty).toBe(4); });
});
