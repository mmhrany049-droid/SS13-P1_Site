// SS v13 — «دوباره تست‌های این مبحث را بزن»: a redo plan splits a weak topic's tests into sets, schedules them as DRAFT placements
// (the student confirms; nothing changes silently), measures before/after and changes route instead of repeating the same thing.
import { attemptsOf, topicMastery, addDays, todayStr, bookById, nodeForNumber, label, testsCapOf, uid, upcomingExams } from './store.js';
import { ciOf, ANALYSIS_CONST } from './analysis.js';
import { setSizeOf, splitRef, busyRefs } from './reviewSet.js';

export const REDO_MAX_ACTIVE = 3, REDO_MAX_ROUNDS = 3, REDO_HISTORY_MAX = 40, REDO_LAST_MIN = 5;
export const OUTCOME = { RECOVERED_ACC: 0.70, RECOVERED_PC: 0.65, IMPROVED_DELTA: 0.15, STUCK_DELTA: 0.10, STUCK_ACC: 0.45 };
const GENTLE = new Set(['protect', 'recover', 'freeze']);
const WEEKDAYS = s => s.pace?.weekdays || [6, 0, 1, 2, 3];
const dowOf = d => new Date(d + 'T12:00:00').getDay();
export const topicKeyOf = (bookId, nodeId) => `${bookId}|${nodeId}`;

/** Group (many topics at once) redo is closed while the pace path protects / recovers / is frozen. A single topic stays possible, slowly. */
export const groupRedoClosed = s => GENTLE.has(s?.pace?.mode);

/** The question refs of one topic, in the chosen order. Keyless questions are left out unless asked for. */
export function topicTests(s, bookId, nodeId, { scope = 'all', order = 'interleaved', includeKeyless = false, exclude = null, atts = null } = {}) {
  const b = bookById(s, bookId); const node = b?.nodes.find(n => n.id === nodeId); if (!b || !node || node.qStart == null) return [];
  const all = atts || attemptsOf(s); const last = {}; for (const a of all) if (a.bookId === bookId && a.num != null && !a.isLegacy) last[a.num] = a;
  const busy = exclude || busyRefs(s); const out = [];
  for (let n = node.qStart; n <= node.qEnd; n++) {
    if (!includeKeyless && b.keys?.[n] == null) continue; const ref = `${bookId}:${n}`; if (busy.has(ref)) continue; const l = last[n];
    if (scope === 'wrongBlank' && !(l && (l.result === 'W' || l.result === 'B'))) continue;
    if (scope === 'wrongBlankGuess' && !(l && (l.result === 'W' || l.result === 'B' || (l.result === 'C' && l.isGuess)))) continue;
    out.push({ ref, num: n, level: l?.level ?? 2, bad: l && l.result !== 'C' ? 1 : 0 });
  }
  if (order === 'sequential') return out.map(x => x.ref);
  if (order === 'hardFirst') return out.sort((a, z) => z.level - a.level || z.bad - a.bad || a.num - z.num).map(x => x.ref);
  const easy = out.filter(x => x.level <= 1), hard = out.filter(x => x.level >= 3), mid = out.filter(x => x.level === 2); const lanes = [easy, mid, hard].filter(l => l.length); const mixed = [];
  for (let i = 0; lanes.some(l => i < l.length); i++) for (const l of lanes) if (i < l.length) mixed.push(l[i]); return mixed.map(x => x.ref);
}
export function chunkSets(refs, size) { const sets = []; for (let i = 0; i < refs.length; i += size) sets.push({ id: uid(), refs: refs.slice(i, i + size), status: 'pending', scheduledDate: null, resultP: null }); return sets; }

/** Preview + plans. topicKeys = ['bookId|nodeId', …]. Plans beyond REDO_MAX_ACTIVE wait in the queue (weakest first). */
export function planRedo(s, atts, topicKeys, { scope = 'all', order = 'interleaved', size = setSizeOf(s), now = Date.now(), mastery = null } = {}) {
  const res = mastery || topicMastery(s, atts, now).res; const active = (s.redo?.plans || []).filter(p => p.status === 'active').length; const have = new Set((s.redo?.plans || []).filter(p => ['active', 'queued', 'paused'].includes(p.status)).map(p => p.topicKey));
  const keys = [...new Set(topicKeys)].filter(k => !have.has(k)).sort((a, z) => (res[a]?.pC ?? 1) - (res[z]?.pC ?? 1)); const plans = []; let slots = Math.max(0, REDO_MAX_ACTIVE - active); const blocked = [];
  if (keys.length > 1 && groupRedoClosed(s)) return { plans: [], preview: [], blocked: ['group_closed'], closed: true };
  for (const k of keys) {
    const [bookId, nodeId] = k.split('|'); const b = bookById(s, bookId); const node = b?.nodes.find(n => n.id === nodeId); if (!b || !node) continue;
    const refs = topicTests(s, bookId, nodeId, { scope, order, atts }); if (!refs.length) { blocked.push(k); continue; }
    const m = res[k]; const [lo, hi] = m ? ciOf(m.pC, m.effectiveN ?? 0) : [null, null];
    plans.push({ id: uid(), createdAt: now, topicKey: k, bookId, nodeId, subject: b.subject, label: label(b, node), scope, order, size, total: refs.length, sets: chunkSets(refs, size), baseline: { pC: m?.pC ?? null, Pk: m ? 100 * (m.pC - (m.pW ?? 0) / 3) : null, n: m ? Math.round(m.n) : 0, at: now, ci: [lo, hi] }, round: 1, status: slots-- > 0 ? 'active' : 'queued', escalation: null });
  }
  return { plans, preview: plans.map(p => ({ topicKey: p.topicKey, label: `${p.subject}، ${p.label}`, total: p.total, sets: p.sets.length, pC: p.baseline.pC, status: p.status })), blocked, closed: false };
}
export const addPlans = (s, plans) => ({ ...s, redo: { ...(s.redo || { plans: [], history: [], max: 3 }), plans: [...(s.redo?.plans || []), ...plans] } });
const patchPlan = (s, id, f) => ({ ...s, redo: { ...s.redo, plans: s.redo.plans.map(p => (p.id === id ? f(p) : p)) } });
export const cancelPlan = (s, id) => ({ ...s, redo: { ...s.redo, plans: s.redo.plans.filter(p => p.id !== id) }, placements: (s.placements || []).filter(p => !(p.redoPlanId === id && p.status === 'draft')) });
export const pausePlan = (s, id) => patchPlan(s, id, p => ({ ...p, status: 'paused' }));
export const resumePlan = (s, id) => patchPlan(s, id, p => ({ ...p, status: 'active' }));

/** Draft placements for the pending sets of a plan: ≤ 1 set per day per plan, planned weekdays only, within the day's test cap. Under protection: ≥ 2 days apart. */
export function schedulePlan(s, plan, today = todayStr()) {
  const gap = GENTLE.has(s.pace?.mode) ? 2 : 1; const out = []; const sets = plan.sets.map(x => ({ ...x })); const exams = upcomingExams(s); let prev = null;
  sets.forEach((st, i) => {
    if (st.status === 'done') { prev = st.scheduledDate || prev; return; }
    if (st.status === 'scheduled' && st.scheduledDate >= today) { prev = st.scheduledDate; return; }
    let d = prev ? addDays(prev, gap) : today;
    for (let g = 0; g < 60; g++, d = addDays(d, 1)) {
      const cap = testsCapOf(s, d); const busy = [...(s.placements || []), ...out].filter(p => p.date === d).reduce((t, p) => t + (p.count || 0), 0);
      if (!WEEKDAYS(s).includes(dowOf(d)) || exams.some(e => e.date === d) || cap === 0) continue; if (cap != null && busy + st.refs.length > cap * 1.5) continue; break;
    }
    st.status = 'scheduled'; st.scheduledDate = d; prev = d;
    out.push({ id: uid(), date: d, order: 60, title: `دوباره بزن: ${plan.label} (مجموعه ${i + 1} از ${sets.length})`, minutes: Math.max(10, Math.min(60, Math.round(st.refs.length * 1.6))), kind: 'مرور', subject: plan.subject, bookId: plan.bookId, nodeId: plan.nodeId, count: st.refs.length,
      reason: 'پیشنهاد «دوباره بزن»؛ تأیید یا جابه‌جایی با خودت است', status: 'draft', source: 'redo', redoPlanId: plan.id, redoSetId: st.id });
  });
  return { sets, placements: out };
}
export function scheduleAll(s, today = todayStr()) {
  let cur = s; for (const p of s.redo?.plans || []) { if (p.status !== 'active') continue; const r = schedulePlan(cur, p, today); if (!r.placements.length) continue; cur = patchPlan({ ...cur, placements: [...(cur.placements || []), ...r.placements] }, p.id, q => ({ ...q, sets: r.sets })); } return cur;
}

// ---------- measuring ----------
/** After a round: accuracy of the redo sets of this round, and the topic mastery now versus the baseline. */
export function measureRedo(s, atts, plan, now = Date.now()) {
  const sets = (s.reviewSets || []).filter(x => x.planId === plan.id && x.round === plan.round); const N = sets.reduce((t, x) => t + (x.C + x.W + x.B), 0), C = sets.reduce((t, x) => t + x.C, 0);
  const roundAcc = N ? C / N : null; const m = topicMastery(s, atts, now).res[plan.topicKey]; const afterPc = m ? m.pC : null; const delta = afterPc != null && plan.baseline?.pC != null ? afterPc - plan.baseline.pC : null;
  let outcome = 'mixed';
  if ((roundAcc != null && roundAcc >= OUTCOME.RECOVERED_ACC) || (afterPc != null && afterPc >= OUTCOME.RECOVERED_PC)) outcome = 'recovered';
  else if (delta != null && delta >= OUTCOME.IMPROVED_DELTA && afterPc < OUTCOME.RECOVERED_PC) outcome = 'improved';
  else if (delta != null && delta < OUTCOME.STUCK_DELTA && roundAcc != null && roundAcc < OUTCOME.STUCK_ACC) outcome = 'stuck';
  return { roundAcc, afterPc, delta, outcome, n: N };
}
const ESCALATION = ['textbook', 'easier', 'ask'];
export function escalationFor(round) { return ESCALATION[Math.min(round, 3) - 1]; }
/** Called when every set of the round is done: records before/after, finishes or starts the next round, wakes the next queued plan. */
export function finishRound(s, planId, now = Date.now()) {
  const plan = s.redo?.plans.find(p => p.id === planId); if (!plan) return { s, outcome: null };
  const atts = attemptsOf(s); const m = measureRedo(s, atts, plan, now); let next = s;
  if (m.outcome === 'recovered') {
    const hist = { id: plan.id, topicKey: plan.topicKey, label: plan.label, subject: plan.subject, rounds: plan.round, before: plan.baseline?.pC ?? null, after: m.afterPc, roundAcc: m.roundAcc, at: now, outcome: 'recovered' };
    const d3 = addDays(todayStr(new Date(now)), 3), d10 = addDays(todayStr(new Date(now)), 10);
    const spaced = [d3, d10].map(date => ({ id: uid(), date, order: 55, title: `مرور فاصله‌دار: ${plan.label}`, minutes: 15, kind: 'مرور', subject: plan.subject, bookId: plan.bookId, nodeId: plan.nodeId, count: 10, reason: 'بعد از بازسازی مبحث، مرور ۳ و ۱۰ روزه حافظه را محکم می‌کند', status: 'draft', source: 'redo' }));
    next = { ...s, redo: { ...s.redo, plans: s.redo.plans.filter(p => p.id !== planId), history: [...(s.redo.history || []), hist].slice(-REDO_HISTORY_MAX) }, placements: [...(s.placements || []), ...spaced] };
    next = activateQueued(next);
  } else if (plan.round >= REDO_MAX_ROUNDS && m.outcome !== 'improved') {
    next = patchPlan(s, planId, p => ({ ...p, status: 'paused', escalation: 'ask', last: m })); next = activateQueued(next);
  } else {
    const esc = m.outcome === 'stuck' ? escalationFor(plan.round) : null; const scope = esc === 'easier' ? 'wrongBlank' : 'wrongBlank'; const refs = topicTests(s, plan.bookId, plan.nodeId, { scope, order: esc === 'easier' ? 'sequential' : plan.order, atts, exclude: new Set() });
    next = patchPlan(s, planId, p => ({ ...p, round: p.round + 1, escalation: esc, last: m, baseline: { ...p.baseline, pC: m.afterPc ?? p.baseline.pC }, sets: refs.length ? chunkSets(refs, p.size) : [], status: esc === 'ask' || !refs.length ? 'paused' : 'active', total: refs.length }));
  }
  return { s: next, outcome: m.outcome, measure: m };
}
export function activateQueued(s) {
  const plans = s.redo?.plans || []; let active = plans.filter(p => p.status === 'active').length; if (active >= REDO_MAX_ACTIVE) return s;
  const res = topicMastery(s, attemptsOf(s)).res; const queued = plans.filter(p => p.status === 'queued').sort((a, z) => (res[a.topicKey]?.pC ?? 1) - (res[z.topicKey]?.pC ?? 1)); const wake = new Set(queued.slice(0, REDO_MAX_ACTIVE - active).map(p => p.id));
  return wake.size ? { ...s, redo: { ...s.redo, plans: plans.map(p => (wake.has(p.id) ? { ...p, status: 'active' } : p)) } } : s;
}
/** After a redo set was corrected: mark it done, remember its result, close the round when it was the last one. */
export function afterRedoSet(s, set, report, now = Date.now()) {
  const plan = s.redo?.plans.find(p => p.id === set.planId); if (!plan) return { s, outcome: null };
  let cur = patchPlan(s, plan.id, p => ({ ...p, sets: p.sets.map(x => (x.id === set.redoSetId ? { ...x, status: 'done', resultP: report.P } : x)) }));
  cur = { ...cur, reviewSets: (cur.reviewSets || []).map(x => (x.id === set.id ? { ...x, planId: plan.id, round: plan.round, topicKey: plan.topicKey } : x)) };
  const left = cur.redo.plans.find(p => p.id === plan.id).sets.some(x => x.status !== 'done'); if (left) return { s: cur, outcome: null };
  return finishRound(cur, plan.id, now);
}
/** Student starts a planned set: it becomes the open review set (kind 'redo'). */
export { splitRef };
