import { describe, it, expect } from 'vitest';
import * as E from '@ss/domain/engine.js';

describe('scoring (hard rule 4)', () => {
  it('P = (3C − W) / 3N × 100', () => { expect(E.percent(10, 3, 20)).toBeCloseTo(45); expect(E.percent(0, 0, 0)).toBeNull(); });
  it('parses Persian/Arabic digits', () => { expect(E.parseAnswerString('۳۱٤0', 4)).toEqual({ ok: true, values: [3, 1, 4, 0] }); });
});
describe('spec 38 fixes', () => {
  it('F-04 readiness clamps components', () => { expect(E.readiness({ A: -0.2, Cov: 1, Ret: 1, Mock: 1, Err: 1 })).toBeCloseTo(60); });
  it('F-01 gain uses s_W·4/3 + s_B', () => { expect(E.expectedGain({ weight: 1, pW: 0.3, pB: 0.1, minutes: 60 })).toBeCloseTo(6 * (0.75 * 4 / 3 + 0.25)); });
  it('F-03 FSRS-6 curve differs from 4.5', () => { expect(E.fsrsR(5, 3, -0.1542)).not.toBeCloseTo(E.fsrsR(5, 3, -0.5), 3); expect(E.fsrsR(3, 3)).toBeCloseTo(0.9, 2); });
  it('F-13 tooFast counts U answers', () => { expect(E.antiGamingFlags({ C: 0, W: 0, B: 0, U: 12, N: 0 }, 5, Array(12).fill(2))).toContain('tooFast'); });
  it('F-19 spearman handles ties', () => { expect(E.spearman([1, 1, 2, 3], [1, 1, 2, 3])).toBeCloseTo(1); });
  it('F-21 safety matches after normalization', () => { expect(E.safetyMatch('ميخوام  بمیرم', ['میخوام بمیرم'])).toBe(true); });
});
