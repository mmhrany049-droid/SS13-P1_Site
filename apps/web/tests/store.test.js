import { describe, it, expect } from 'vitest';
import * as S from '@ss/domain/store.js';

const demo = () => S.withDemo();
describe('migrations (hard rule 11)', () => {
  it('v3 → v5 keeps data and converts taught', () => {
    const v3 = { ...S.initialState(), v: 3, taught: { calc: { n1: true } }, settings: { dailyMin: 150, rewards: true } }; delete v3.dataVersion;
    const m = S.migrate(v3);
    expect(m.dataVersion).toBe(S.DATA_VERSION); expect(m.taught.calc.n1.state).toBe('taught'); expect(m.settings.weekdayMin).toBe(240);
  });
});
describe('practice: numbers → topics', () => {
  it('splits a range over two topics and reports gaps', () => {
    const s = demo(); const b = s.books[0]; const ls = S.leaves(b).filter(n => n.qStart != null);
    const r = S.mapRange(b, ls[0].qEnd - 2, ls[1].qStart + 1);
    expect(r.parts.map(p => p.nodeId)).toEqual([ls[0].id, ls[1].id]); expect(r.gaps).toEqual([]);
    const max = Math.max(...ls.map(n => n.qEnd)); expect(S.mapRange(b, max + 1, max + 5).gaps).toEqual([{ from: max + 1, to: max + 5 }]);
  });
});
describe('exams', () => {
  it('analysis uses only the latest sitting', () => {
    const s = demo(); const old = s.exams.find(e => e.kind === 'old');
    const atts = S.attemptsOf(s).filter(a => a.examId === old.id);
    const last = S.latestSitting(old); expect(atts.filter(a => a.result === 'C').length).toBe(last.sections.reduce((x, y) => x + y.C, 0));
  });
});
describe('planner', () => {
  it('proposals stay drafts and under the daily cap', () => {
    const s = demo(); s.placements = []; const r = S.proposeWeek(s, S.attemptsOf(s));
    expect(r.drafts.every(p => p.status === 'draft')).toBe(true);
    for (const d of new Set(r.drafts.map(p => p.date))) expect(r.drafts.filter(p => p.date === d).reduce((a, p) => a + p.minutes, 0)).toBeLessThanOrEqual(S.capFor(s, d));
  });
  it('lightening a day lowers its pressure', () => {
    const s = demo(); const days = Array.from({ length: 7 }, (_, i) => S.addDays(S.todayStr(), i));
    const day = [...days].sort((a, b) => S.dayPressure(s, b).load - S.dayPressure(s, a).load)[0];
    const before = S.dayPressure(s, day).pct; const r = S.planLighten(s, day, 50, days);
    expect(before).toBeGreaterThan(0);
    expect(S.dayPressure(S.applyMoves(s, r.moves), day).pct).toBeLessThan(before);
  });
});
describe('v5.1 planner fixes', () => {
  const week = () => Array.from({ length: 7 }, (_, i) => S.addDays(S.todayStr(), i));
  it('exam prep plan does not double-book days that already have approved work', () => {
    const s = demo(); const ex = S.upcomingExams(s)[0]; const fc = S.examForecast(s, ex, S.attemptsOf(s), { runs: 300 });
    const plan = S.buildPrepPlan(s, ex, fc);
    for (const d of plan) {
      const booked = S.dayPressure(s, d.date).load; const add = d.items.reduce((a, it) => a + it.minutes * (S.INTENSITY[it.kind] ?? 1), 0);
      if (add > 0) expect(booked + add).toBeLessThanOrEqual(S.capFor(s, d.date) * 0.85 + 1);
    }
    expect(plan.at(-1).items.every(it => it.kind === 'روز قبل آزمون')).toBe(true);
  });
  it('lightening never pushes work into a day the user made lighter', () => {
    const s = demo(); const days = week(); const easy = days[5];
    s.placements = s.placements.filter(p => p.date !== easy); s.dayRelief = { [easy]: 0.25 };
    const r = S.planLighten(s, days[2], 30, days); const after = S.applyMoves(s, r.moves);
    expect(S.dayPressure(after, easy).pct).toBeLessThanOrEqual(25);
  });
  it('re-proposing does not exceed repeat limits of already-approved tasks', () => {
    const s = demo(); const atts = S.attemptsOf(s); const days = week();
    const r = S.proposeWeek(s, atts); const all = [...s.placements.filter(p => days.includes(p.date)), ...r.drafts];
    const cnt = {}; for (const p of all) cnt[p.title] = (cnt[p.title] || 0) + 1;
    const first = S.proposeWeek({ ...s, placements: [] }, atts).drafts; const lim = {}; for (const p of first) lim[p.title] = (lim[p.title] || 0) + 1;
    for (const p of r.drafts) expect(cnt[p.title]).toBeLessThanOrEqual(Math.max(7, lim[p.title] || 0));
  });
});
