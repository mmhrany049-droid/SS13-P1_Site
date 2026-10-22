// Minimal Vitest-compatible surface on top of node:test + node:assert (only what the SS tests use).
import { describe, it, test, beforeEach, afterEach, before as beforeAll, after as afterAll } from 'node:test';
import assert from 'node:assert/strict';
export { describe, it, test, beforeEach, afterEach, beforeAll, afterAll };
const close = (a, b, digits = 2) => Math.abs(a - b) < 10 ** -digits / 2;
function matchers(v, neg = false) {
  const ok = (cond, msg) => { if (neg ? cond : !cond) throw new assert.AssertionError({ message: (neg ? 'NOT ' : '') + msg, actual: v }); };
  const deepEq = x => { try { assert.deepStrictEqual(v, x); return true; } catch { return false; } };
  return {
    toBe: x => ok(Object.is(v, x), `expected ${JSON.stringify(v)} to be ${JSON.stringify(x)}`),
    toEqual: x => ok(deepEq(x) || (() => { try { assert.deepEqual(JSON.parse(JSON.stringify(v)), JSON.parse(JSON.stringify(x))); return true; } catch { return false; } })(), `expected ${JSON.stringify(v)} to equal ${JSON.stringify(x)}`),
    toBeCloseTo: (x, d = 2) => ok(close(v, x, d), `expected ${v} ≈ ${x}`),
    toBeNull: () => ok(v === null, 'expected null'),
    toBeUndefined: () => ok(v === undefined, 'expected undefined'),
    toBeDefined: () => ok(v !== undefined, 'expected defined'),
    toBeTruthy: () => ok(!!v, 'expected truthy'),
    toBeFalsy: () => ok(!v, 'expected falsy'),
    toBeGreaterThan: x => ok(v > x, `expected ${v} > ${x}`),
    toBeGreaterThanOrEqual: x => ok(v >= x, `expected ${v} >= ${x}`),
    toBeLessThan: x => ok(v < x, `expected ${v} < ${x}`),
    toBeLessThanOrEqual: x => ok(v <= x, `expected ${v} <= ${x}`),
    toContain: x => ok(typeof v === 'string' ? v.includes(x) : [...v].includes(x), `expected to contain ${JSON.stringify(x)}`),
    toHaveLength: n => ok(v?.length === n, `expected length ${n}, got ${v?.length}`),
    toMatch: re => ok(new RegExp(re).test(v), `expected ${v} to match ${re}`),
    toThrow: () => { let threw = false; try { v(); } catch { threw = true; } ok(threw, 'expected to throw'); },
  };
}
export function expect(v) { const m = matchers(v); m.not = matchers(v, true); return m; }
export const vi = { fn: (impl = () => {}) => { const f = (...a) => { f.mock.calls.push(a); return impl(...a); }; f.mock = { calls: [] }; return f; } };
