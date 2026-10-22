// SS v13 — «مسیر رشد تست»: constants + pure state constructors.
// Kept free of any import from store.js so store.js (migrations) and testPace.js (engine) can both use it without a cycle.

/** All values are configurable first guesses (spec §2-4), not validated numbers: tune them with 10–20 real users. */
export const PACE_CONST = {
  START_DEFAULT: 20, START_MIN: 10, START_MAX: 30, CALIB_DAYS: 3,
  STEP_MIN: 2, STEP_MAX: 10, MIN_STEP_MIN: 10, MIN_STEP_MAX: 30,
  G0: 0.10, G_MIN: 0.03, G_MAX: 0.20, G_UP: 1.25, G_DOWN: 0.60,
  COMPLETE_OK: 0.90, COMPLETE_LOW: 0.60, MISS_BELOW: 0.50,
  ACC_TOL: 3, FATIGUE_DROP: 0.08, FATIGUE_MIN_N: 30, BLANK_UP: 10, ACC_MIN_N: 10,
  DIFF_OK: 3, DIFF_HIGH: 4,
  GROW_WINDOW: 4, GROW_NEED: 3, MIN_GAP_DAYS: 3, ONE_DIAL_DAYS: 7,
  EASE_FACTOR: 0.80, RECOVER_FACTOR: 0.50, RECOVER_DAYS: 2, RECOVER_MIN: 10, PROTECT_DAYS: 7,
  HARDER_MAX_STEPS: 1, EXAM_NEAR_DAYS: 3, BASE_WINDOW: 14, MIN_DATA_DAYS: 3, BASE_MIN_DAYS: 5,
  MINUTES_PER_TEST: 1.6,
  /** R-4 (review spec): review / redo answers count as «tests of the day» for the pace. Set false to count only new tests. */
  REVIEW_COUNTS_AS_TESTS: true,
  HISTORY_MAX: 120, CHECKS_MAX: 200, GROWTH_MAX: 60, WEEKLY_MAX: 60,
  DEFAULT_WEEKDAYS: [6, 0, 1, 2, 3],
};
const C = PACE_CONST;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** A brand-new pace state. `start` is the first daily-test target. */
export function newPace({ startedAt, start = C.START_DEFAULT, g0 = C.G0, block = 15, onboard = null, mode = 'calibrate', calibDaysLeft = C.CALIB_DAYS, weekdays = C.DEFAULT_WEEKDAYS } = {}) {
  const t = clamp(Math.round(start), C.START_MIN, C.START_MAX);
  return {
    v: 1, enabled: true, mode, dial: 'tests', target: t, asOf: startedAt, nextTarget: null, comfort: t, minutes: null, g: g0, weekdays: [...weekdays],
    startedAt, calibDaysLeft, lock: null, freeze: null, recover: null, growth: [], ceiling: null, onboard, block, history: [], lastClosed: null,
  };
}

/** Median of the last ≤14 daily test counts (days with tests only); null when fewer than 3 days. Used by the v12 → v13 migration. */
export function medianCounts(counts) {
  const c = counts.filter(n => n > 0).slice(-14).sort((a, b) => a - b); if (c.length < 3) return null;
  const m = c.length >> 1; return c.length % 2 ? c[m] : (c[m - 1] + c[m]) / 2;
}
