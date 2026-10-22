// SS 7.1 — a compact, privacy-light snapshot that travels inside .sspack (only with the «telegram» consent)
// so the hub's Telegram bot can answer «برنامه امروز»، «آزمون‌ها»، «وضعیت» for the phone number of this student.
import { attemptsOf, todayStr, addDays, activeOn, upcomingExams, examForecast, reviewQueue, rewardSummary, sessionStats, daysBetween, DAY, dayPressure } from '@ss/domain/store.js';
import * as SC from '@ss/domain/schedule.js';
import { habitStage, adherence } from '@ss/domain/habits.js';

export function buildSummary(s, now = new Date()) {
  const today = todayStr(now); const atts = attemptsOf(s);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const items = d => activeOn(s, d).filter(p => p.status === 'approved' || p.status === 'done').map(p => ({ title: p.title, minutes: p.minutes, at: p.at || null, done: p.status === 'done' }));
  const exams = upcomingExams(s).slice(0, 5).map(e => { let P50 = null; try { const fc = examForecast(s, e, atts, { runs: 300 }); P50 = fc ? Math.round(fc.sim.total.P50) : null; } catch { /* */ } return { title: e.title, date: e.date, daysLeft: daysBetween(today, e.date), P50 }; });
  const week = s.sessions.filter(x => !x.legacy && !x.historical && Date.now() - Date.parse(x.at) < 7 * DAY);
  const st = week.map(x => sessionStats(s, x)); const N = st.reduce((a, x) => a + x.N, 0), C = st.reduce((a, x) => a + x.C, 0), W = st.reduce((a, x) => a + x.W, 0);
  let best = null; // v13: «بهترین درصد ممکن» is no longer shown or exported (pressure-free pace path)
  const r = rewardSummary(s);
  return {
    at: now.toISOString(), name: s.me?.name || '',
    today: { date: today, mode: SC.dayCfg(s, today).mode, sessions: SC.sessionsOn(s, today).map(x => `${x.from}–${x.to}`), items: items(today), events: SC.eventsOn(s, today).map(e => ({ title: e.title, from: e.from, to: e.to })) },
    week: days.map(d => ({ date: d, count: items(d).length, minutes: items(d).reduce((a, x) => a + x.minutes, 0), pct: dayPressure(s, d).pct })),
    exams, reviewsDue: reviewQueue(s, atts).dueNow.length, starred: Object.keys(s.starred || {}).length,
    last7: { tests: N, percent: N ? Math.round((3 * C - W) / (3 * N) * 100) : null },
    best, habits: (s.habits?.list || []).filter(h => h.active !== false).map(h => { const g = habitStage(s, h); const a = adherence(s, h); return { title: h.title, stage: g.name, adherence: a.rate == null ? null : Math.round(a.rate * 100) }; }),
    rewards: { level: r.level, coins: r.coins },
  };
}
