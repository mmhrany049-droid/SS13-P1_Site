// v9 — «پرونده تحصیلی»: one structured record per student that travels inside .sspack (consent «پرونده») so the
// study center can register, follow and plan with every participant, online (hub database) or with plain files.
// Pure function of state; nothing here talks to the network.
import { todayStr, addDays, sessionStats, DAY, PLANNING_STYLES, STUDY_TIMES, PLEDGES, EDU_DEFAULT, latestSitting, providerName } from '@ss/domain/store.js';
import * as SC from '@ss/domain/schedule.js';
import { myTextbookIds, textbookById, GRADE_FA, STREAMS } from '@ss/domain/curriculum.js';

export const DOSSIER_V = 1;
const WEEK = [[6, 'شنبه'], [0, 'یکشنبه'], [1, 'دوشنبه'], [2, 'سه‌شنبه'], [3, 'چهارشنبه'], [4, 'پنج‌شنبه'], [5, 'جمعه']];

/** Commitment = what was promised (approved plan) vs. what was done, last `days` days. */
export function commitmentStats(s, days = 28, today = todayStr()) {
  const from = addDays(today, -days + 1);
  const due = (s.placements || []).filter(p => p.date >= from && p.date <= today && (p.status === 'approved' || p.status === 'done' || p.status === 'skipped'));
  const done = due.filter(p => p.status === 'done');
  const ses = (s.sessions || []).filter(x => !x.legacy && !x.historical && x.at && x.at.slice(0, 10) >= from);
  const activeDays = new Set(ses.map(x => x.at.slice(0, 10))).size;
  let streak = 0; for (let d = today; ; d = addDays(d, -1)) { if (ses.some(x => x.at.slice(0, 10) === d)) streak++; else if (d !== today) break; if (streak > 400) break; }
  const st = ses.map(x => sessionStats(s, x)); const N = st.reduce((a, x) => a + x.N, 0), C = st.reduce((a, x) => a + x.C, 0), W = st.reduce((a, x) => a + x.W, 0);
  return { days, planned: due.length, done: done.length, adherence: due.length ? Math.round(done.length / due.length * 100) : null,
    plannedMin: due.reduce((a, p) => a + (p.minutes || 0), 0), doneMin: done.reduce((a, p) => a + (p.actualMin || p.minutes || 0), 0),
    sessions: ses.length, tests: N, percent: N ? Math.round((3 * C - W) / (3 * N) * 100) : null, studyMin: ses.reduce((a, x) => a + (x.minutes || 0), 0), activeDays, streak };
}

export function buildDossier(s, now = new Date()) {
  const e = { ...EDU_DEFAULT, ...(s.edu || {}) }; const st = s.settings || {};
  const plan = SC.dayPlanOf(s);
  const week = WEEK.map(([d, name]) => { const c = plan.template?.[d] || {}; return { day: name, mode: c.mode || 'normal', targetMin: +c.target || 0, windows: (c.windows || []).map(w => `${w.from}–${w.to}${w.type === 'can' ? ' (اگر لازم شد)' : ''}`) }; });
  return {
    v: DOSSIER_V, at: now.toISOString(),
    identity: { id: s.me?.id, name: s.me?.name || '', phone: s.account?.phone || '', email: s.account?.email || '', grade: s.me?.grade, gradeFa: GRADE_FA[s.me?.grade] || '', stream: s.me?.stream, streamFa: STREAMS[s.me?.stream] || '', school: e.school || s.me?.schoolName || '', city: e.city, province: e.province, registeredAt: s.account?.registeredAt || null },
    education: { gpa: e.gpa, gpaLast: e.gpaLast, konkurYear: e.konkurYear, targetMajor: e.targetMajor, targetUni: e.targetUni, targetRank: e.targetRank, institute: e.institute, advisor: e.advisor, advisorPhone: e.advisorPhone,
      mockProviders: (e.mockProviders || []).map(providerName), strengths: e.strengths, weaknesses: e.weaknesses, textbooks: myTextbookIds(s).map(id => textbookById(id)?.title || id) },
    family: { parentName: e.parentName, parentPhone: e.parentPhone },
    planning: { style: e.planningStyle, styleFa: PLANNING_STYLES[e.planningStyle] || '', planner: e.planner, studyTime: e.studyTime, studyTimeFa: STUDY_TIMES[e.studyTime] || '', dailyGoalH: e.dailyGoalH,
      week, weeklyTargetMin: week.reduce((a, d) => a + (d.mode === 'off' ? 0 : d.targetMin), 0), sessionMin: st.sessionMin, sessionMax: st.sessionMax, breakMin: st.breakMin, sleepH: st.sleepH, planWeeks: st.planWeeks,
      fixedEvents: (s.events || []).filter(x => x.active !== false).slice(0, 40).map(x => ({ title: x.title, kind: x.kind, repeat: x.repeat, weekdays: x.weekdays, from: x.from, to: x.to })) },
    commitment: { selfRating: +e.commitment || 0, pledges: (e.pledges || []).map(id => PLEDGES.find(p => p[0] === id)?.[1] || id), last28: commitmentStats(s, 28), last7: commitmentStats(s, 7) },
    books: (s.books || []).filter(b => b.active !== false).map(b => ({ title: b.title, publisher: b.publisher, subject: b.subject, grade: b.grade })),
    exams: (s.exams || []).slice(-30).map(x => { const z = latestSitting(x); return { title: x.title, date: x.date, kind: x.kind, provider: x.provider ? providerName(x.provider) : null, target: x.target, percent: z?.percent ?? null }; }),
    mockSeries: (s.mockSeries || []).filter(m => m.active === true).map(m => ({ title: m.title, provider: providerName(m.provider), everyWeeks: m.everyWeeks, count: m.count })),
    habits: (s.habits?.list || []).filter(h => h.active !== false).map(h => ({ title: h.title, kind: h.kind || null })),
    notes: e.notes, eduUpdatedAt: e.updatedAt,
  };
}

/** Full private copy for the hub database (consent «پشتیبان کامل»): everything except secrets and big photos. */
export function fullStateForHub(s) {
  const { draft, keyDraft, account, ...rest } = s;
  const { pinHash, secret, server, recoveryHash, ...acc } = account || {};
  return { ...rest, account: { ...acc, server: server ? { url: server.url } : null } };
}

/** Completeness of the dossier (0..100) + what is missing — drives the «کامل کن» hints. */
export function dossierCompleteness(s) {
  const e = { ...EDU_DEFAULT, ...(s.edu || {}) };
  const checks = [['نام', s.me?.name], ['موبایل', s.account?.phone], ['مدرسه', e.school || s.me?.schoolName], ['شهر', e.city], ['معدل', e.gpa], ['هدف (رشته یا دانشگاه)', e.targetMajor || e.targetUni], ['سال کنکور', e.konkurYear],
    ['شیوه برنامه‌ریزی', e.planningStyle], ['زمان مطالعه ترجیحی', e.studyTime], ['هدف ساعت روزانه', e.dailyGoalH], ['میزان تعهد', +e.commitment > 0], ['تعهدها', (e.pledges || []).length > 0]];
  const missing = checks.filter(c => !c[1]).map(c => c[0]);
  return { pct: Math.round((checks.length - missing.length) / checks.length * 100), missing };
}
