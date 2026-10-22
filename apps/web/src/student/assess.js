// SS 10 — «زمان‌بندی تست‌های روان‌شناسی»: WHEN to take (or retake) each questionnaire, from the student's stage of
// experience, time since the last result and what the data shows. The app only SUGGESTS; the student decides:
// «الان»، «یادم بنداز در …»، «این دور نه»، or a personal interval. Nothing is ever locked.
// Rules of thumb (see docs/handoff/specs/21 + reference/RESEARCH_BASIS.md):
//   • traits (Mini-IPIP) are stable → once in the first weeks, then every ~6 months
//   • rhythm/preference (chronotype, ideal session) → first week (the planner uses them at once), then every 3–4 months
//   • experience-dependent states (motivation, procrastination triggers, self-control, study strategies, efficacy)
//     need some weeks of real studying before the answers mean something → first after 1–2 weeks, then every 4–8 weeks
//   • test anxiety is about exams → first when an exam is near (or after the first one), then before each big exam
//   • data triggers bring a retest forward: plan completion falling, a weak exam result, behaviour contradicting answers
import { todayStr, addDays, daysBetween, upcomingExams, latestSitting } from '@ss/domain/store.js';
import { experience, snapshot } from '@ss/domain/brain.js';
import { INSTRUMENTS } from './instruments.js';
import * as E from '@ss/domain/engine.js';

const STAGES = ['new', 'early', 'settled', 'veteran'];
const atLeast = (stage, min) => STAGES.indexOf(stage) >= STAGES.indexOf(min);
/** Per questionnaire: from which stage it makes sense, and the retest interval (days) per stage. */
export const RULES = {
  'chronotype.custom': { from: 'new', every: { new: 120, early: 120, settled: 120, veteran: 150 }, why: 'برنامه‌ریز از همان روز اول ساعت کار سنگین را با آن می‌چیند' },
  'session.preference': { from: 'new', every: { new: 60, early: 60, settled: 90, veteran: 120 }, why: 'طول بلوک‌ها و استراحت‌ها را تنظیم می‌کند' },
  'motivation.sdt': { from: 'early', every: { early: 30, settled: 45, veteran: 60 }, why: 'انگیزه بعد از چند هفته درس خواندن واقعی معنا پیدا می‌کند' },
  'procrastination.triggers': { from: 'early', every: { early: 30, settled: 45, veteran: 60 }, why: 'وقتی چند بار با برنامه روبه‌رو شدی، محرک‌های عقب انداختن معلوم می‌شود' },
  'selfcontrol.study': { from: 'early', every: { early: 30, settled: 45, veteran: 60 }, why: 'روی «موتور توان» و حجم کار اثر مستقیم دارد' },
  'strategy.selfreport': { from: 'early', minDays: 14, every: { early: 45, settled: 60, veteran: 90 }, why: 'بعد از دو هفته معلوم است بیشتر با چه روشی می‌خوانی' },
  'selfefficacy.subject': { from: 'early', every: { early: 30, settled: 45, veteran: 60 }, why: 'بعد از هر آزمون مهم ممکن است عوض شود' },
  'testanxiety.short': { from: 'new', exam: true, every: { new: 45, early: 45, settled: 45, veteran: 60 }, why: 'نزدیک آزمون‌ها معنا دارد؛ قبل از هر آزمون بزرگ دوباره' },
  ipip: { from: 'early', every: { early: 180, settled: 180, veteran: 240 }, why: 'ویژگی‌های پایدار؛ سالی دو بار کافی است', title: 'پنج عامل شخصیت', emoji: '🧩', minutes: 3 },
  habitQuiz: { from: 'early', minSessions: 8, every: { early: 28, settled: 42, veteran: 60 }, why: 'سؤال‌هایش از داده‌های خودت ساخته می‌شود؛ با داده بیشتر دقیق‌تر است', title: 'پرسشنامه عادت و تست‌زدن', emoji: '🌱', minutes: 4 },
};
export const ITEMS = () => [...INSTRUMENTS.map(x => ({ id: x.id, title: x.title, emoji: x.emoji, minutes: x.minutes })), { id: 'ipip', ...RULES.ipip }, { id: 'habitQuiz', ...RULES.habitQuiz }];
export function lastTaken(s, id) {
  if (id === 'ipip') return s.profile?.ipipAt || (s.profile?.ipip ? s.startedAt : null);
  if (id === 'habitQuiz') return s.habits?.quizAt || null;
  return s.profile?.instruments?.[id]?.at || null;
}
export function historyOf(s, id) {
  if (id === 'ipip') return s.profile?.ipipHistory || [];
  if (id === 'habitQuiz') return s.habits?.quizHistory || [];
  return s.profile?.instruments?.[id]?.history || [];
}
/** Data triggers that bring a retest forward (each returns a Persian reason or null). */
function triggers(s, id, today) {
  const out = []; const snap = snapshot(s); const plan = snap.plan;
  const rate = (from, to) => { const r = plan.filter(x => daysBetween(x.d, today) > from && daysBetween(x.d, today) <= to); const n = r.reduce((a, x) => a + x.n, 0); return n >= 5 ? r.reduce((a, x) => a + x.done, 0) / n : null; };
  const r7 = rate(0, 7), r28 = rate(7, 35);
  if (['procrastination.triggers', 'selfcontrol.study', 'motivation.sdt'].includes(id) && r7 != null && r28 != null && r28 - r7 >= 0.2) out.push(`انجام برنامه از ${E.toFa(Math.round(r28 * 100))}٪ به ${E.toFa(Math.round(r7 * 100))}٪ افتاده`);
  if (id === 'procrastination.triggers' && r7 != null && r7 < 0.5) out.push('هفته اخیر کمتر از نصف برنامه انجام شده');
  const lastEx = (s.exams || []).filter(e => latestSitting(e)).map(e => ({ e, z: latestSitting(e) })).sort((a, z) => z.z.date.localeCompare(a.z.date))[0];
  const since = lastTaken(s, id);
  if (['selfefficacy.subject', 'testanxiety.short'].includes(id) && lastEx && (!since || since.slice(0, 10) < lastEx.z.date) && daysBetween(lastEx.z.date, today) <= 10) {
    const fc = lastEx.e.forecastP50; if (fc != null && lastEx.z.percent != null && lastEx.z.percent < fc - 8) out.push(`نتیجه «${lastEx.e.title}» از پیش‌بینی پایین‌تر بود`);
    else if (id === 'selfefficacy.subject') out.push(`بعد از «${lastEx.e.title}» دیدت به توانایی‌ات ممکن است عوض شده باشد`);
  }
  if (id === 'chronotype.custom') { const m = s.profile?.instruments?.[id]?.scores?.morning?.score; const best = (s.behaviorCache?.best || ''); if (m != null && ((m >= 65 && /شب|عصر/.test(best)) || (m <= 35 && /صبح/.test(best)))) out.push('بهترین ساعت واقعی‌ات با جواب‌های قبلی جور نیست'); }
  if (id === 'strategy.selfreport') { const due = Object.values(s.reviews || {}).filter(r => r.dueAt && r.dueAt < Date.now() && !r.suspended).length; if (due >= 40) out.push(`${E.toFa(due)} کارت مرور عقب افتاده`); }
  return out;
}
/** Status of every questionnaire: due / soon / ok / later (stage) / snoozed — with the reason and next date. */
export function schedule(s, today = todayStr()) {
  const exp = experience(s, today); const plan = s.assess?.plan || {};
  const nextExam = upcomingExams(s)[0]; const examIn = nextExam ? daysBetween(today, nextExam.date) : null;
  return ITEMS().map(it => {
    const R = RULES[it.id] || { from: 'early', every: { early: 45, settled: 60, veteran: 90 } }; const p = plan[it.id] || {};
    const last = lastTaken(s, it.id); const lastD = last ? String(last).slice(0, 10) : null;
    const every = p.every || R.every[exp.stage] || R.every.settled || 60;
    let status, reason, next = null;
    const ready = atLeast(exp.stage, R.from) && (!R.minDays || exp.days >= R.minDays) && (!R.minSessions || exp.sessions >= R.minSessions);
    const trig = lastD ? triggers(s, it.id, today) : [];
    if (!lastD) {
      if (R.exam && (examIn == null || examIn > 21) && !(s.exams || []).some(e => latestSitting(e))) { status = 'later'; reason = 'وقتی آزمونی در ۳ هفته آینده ثبت کنی پیشنهاد می‌شود'; }
      else if (ready) { status = 'due'; reason = R.exam && examIn != null ? `${E.toFa(examIn)} روز تا «${nextExam.title}»` : R.why; next = today; }
      else { status = 'later'; reason = R.minSessions && exp.sessions < R.minSessions ? `بعد از ${E.toFa(R.minSessions)} جلسه تست (الان ${E.toFa(exp.sessions)})` : R.from === 'early' ? 'بعد از هفته اول (وقتی کمی تجربه داشتی) معنادارتر است' : R.why; next = addDays(exp.start, R.minDays || 7); }
    } else {
      next = addDays(lastD, every);
      if (R.exam && nextExam && examIn <= 14 && examIn >= 2 && daysBetween(lastD, today) >= 21) { status = 'due'; reason = `قبل از «${nextExam.title}» (${E.toFa(examIn)} روز دیگر)`; next = today; }
      else if (trig.length && daysBetween(lastD, today) >= 10) { status = 'due'; reason = trig[0]; next = today; }
      else if (next <= today) { status = 'due'; reason = `${E.toFa(daysBetween(lastD, today))} روز از آخرین بار گذشته (هر ${E.toFa(every)} روز)`; }
      else if (daysBetween(today, next) <= 7) { status = 'soon'; reason = `حدود ${E.toFa(daysBetween(today, next))} روز دیگر`; }
      else { status = 'ok'; reason = `دفعه بعد حدود ${E.toFa(daysBetween(today, next))} روز دیگر`; }
    }
    if (p.snoozedUntil && p.snoozedUntil > today && (status === 'due' || status === 'soon')) { status = 'snoozed'; reason = `خودت گفتی ${E.toFa(daysBetween(today, p.snoozedUntil))} روز دیگر`; next = p.snoozedUntil; }
    if (p.off) { status = 'off'; reason = 'یادآوری این پرسشنامه را خاموش کرده‌ای'; }
    return { ...it, status, reason, next, last: lastD, every, custom: !!p.every, stage: exp.stage, triggers: trig, count: historyOf(s, it.id).length || (lastD ? 1 : 0) };
  });
}
export const dueNow = s => schedule(s).filter(x => x.status === 'due');
export const STATUS_FA = { due: 'وقتش است', soon: 'به‌زودی', ok: 'به‌روز', later: 'فعلاً زود است', snoozed: 'عقب انداختی', off: 'خاموش' };
const setPlan = (s, id, patch) => ({ ...s, assess: { ...(s.assess || {}), plan: { ...(s.assess?.plan || {}), [id]: { ...(s.assess?.plan?.[id] || {}), ...patch } } } });
export const snooze = (s, id, days) => setPlan(s, id, { snoozedUntil: addDays(todayStr(), days) });
export const setEvery = (s, id, days) => setPlan(s, id, { every: days || null });
export const setOff = (s, id, off) => setPlan(s, id, { off: !!off, snoozedUntil: null });
/** After a questionnaire is saved: clear the snooze. */
export const markTaken = (s, id) => setPlan(s, id, { snoozedUntil: null });
/** How a result changed since the previous time (for «مقایسه با دفعه قبل»). */
export function changeSince(s, id) {
  const h = historyOf(s, id); if (h.length < 2) return null; const a = h.at(-2).scores || {}, b = h.at(-1).scores || {};
  return Object.keys(b).filter(k => a[k]).map(k => ({ k, name: b[k].name || k, before: a[k].score ?? a[k].sc, after: b[k].score ?? b[k].sc })).filter(x => x.before != null && x.after != null).map(x => ({ ...x, delta: x.after - x.before }));
}
