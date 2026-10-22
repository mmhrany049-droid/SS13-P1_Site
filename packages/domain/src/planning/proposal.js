// SS 12 — PlannerProposal (Blueprint §8, report §9.7). The planner only PROPOSES. An approved plan never moves silently:
// every change is a proposal with a diff that the student accepts or rejects. Changed inputs mark the plan stale.
import { activeOn, applyMoves, capFor, daysFromTo, addDays, isRestDay, intensityOf } from '../store.js';
const fp = p => `${p.id}|${p.date}|${p.status}|${p.minutes}`;
/** moves: [{ id, to, title?, from? }]. Returns a proposal object (not applied). */
export function makeProposal(s, moves, { kind = 'manual', reason = '' } = {}) {
  const byId = Object.fromEntries(s.placements.map(p => [p.id, p]));
  const rows = moves.filter(m => byId[m.id] && byId[m.id].date !== m.to).map(m => { const p = byId[m.id]; const rem = remainingMinutes(p);
    return { id: p.id, title: p.title, from: p.date, to: m.to, minutes: p.minutes, moveMinutes: rem, remainingOnly: rem < p.minutes, fingerprint: fp(p) }; });
  return { id: 'pp-' + Math.random().toString(36).slice(2, 10), kind, reason, createdAt: new Date().toISOString(), status: 'pending', moves: rows };
}
/** Minutes still to do: a task with progress moves only its remainder (never the finished part). */
export const remainingMinutes = p => Math.max(0, Math.round((p.minutes || 0) - (p.doneMinutes || 0)));
/** Per-day minutes before/after, for the diff table. */
export function proposalDiff(s, prop) {
  const days = [...new Set(prop.moves.flatMap(m => [m.from, m.to]))].sort();
  const load = (st, d) => activeOn(st, d).reduce((a, p) => a + (p.minutes || 0) * intensityOf(p), 0);
  const after = previewState(s, prop);
  return days.map(d => ({ date: d, before: Math.round(load(s, d)), after: Math.round(load(after, d)), cap: capFor(s, d) }));
}
function previewState(s, prop) {
  let y = s; const split = prop.moves.filter(m => m.remainingOnly && m.moveMinutes > 0);
  if (split.length) y = { ...y, placements: y.placements.flatMap(p => { const m = split.find(x => x.id === p.id); if (!m) return [p];
    return [{ ...p, minutes: p.doneMinutes, status: 'done', splitFrom: p.id }, { ...p, id: p.id + '-r', minutes: m.moveMinutes, doneMinutes: 0, date: m.to, order: 999, moves: (p.moves || 0) + 1, remainderOf: p.id }]; }) };
  return applyMoves(y, prop.moves.filter(m => !m.remainingOnly).map(m => ({ id: m.id, to: m.to })));
}
/** Accept: refuses (stale) if any task changed since the proposal was made. */
export function acceptProposal(s, prop) {
  const byId = Object.fromEntries(s.placements.map(p => [p.id, p]));
  const stale = prop.moves.some(m => !byId[m.id] || fp(byId[m.id]) !== m.fingerprint);
  if (stale) return { state: s, stale: true };
  const y = previewState(s, prop);
  return { state: { ...y, planLog: [...(s.planLog || []), { at: new Date().toISOString(), proposalId: prop.id, kind: prop.kind, decision: 'accepted', moves: prop.moves.length }].slice(-200) }, stale: false };
}
export const rejectProposal = (s, prop) => ({ ...s, planLog: [...(s.planLog || []), { at: new Date().toISOString(), proposalId: prop.id, kind: prop.kind, decision: 'rejected', moves: prop.moves.length }].slice(-200) });
/** Inputs changed (key revised, exam added, class schedule published): the plan is flagged, never rewritten. */
export const markStale = (s, why) => ({ ...s, planStale: { at: new Date().toISOString(), why } });
export const clearStale = s => { const { planStale, ...rest } = s; return rest; };
/** Overdue work → a proposal that spreads it over the coming days within each day's cap — never everything on one day. */
export function spreadOverdue(s, today, horizon = 7, { perDayMax = 2 } = {}) {
  const overdue = s.placements.filter(p => p.status === 'approved' && p.date < today && remainingMinutes(p) > 0).sort((a, z) => (z.u ?? 1) - (a.u ?? 1));
  const days = daysFromTo(addDays(today, 1), addDays(today, horizon)).filter(d => !isRestDay(s, d));
  const load = Object.fromEntries(days.map(d => [d, activeOn(s, d).reduce((a, p) => a + (p.minutes || 0) * intensityOf(p), 0)])); const count = Object.fromEntries(days.map(d => [d, 0]));
  const moves = [];
  for (const p of overdue) { const w = remainingMinutes(p) * intensityOf(p); const d = days.find(x => count[x] < perDayMax && load[x] + w <= capFor(s, x) * 0.85 && (!p.deadline || x < p.deadline)); if (!d) continue; load[d] += w; count[d]++; moves.push({ id: p.id, to: d }); }
  return { proposal: makeProposal(s, moves, { kind: 'overdue', reason: 'کارهای جامانده، پخش در روزهای پیش رو با رعایت سقف هر روز' }), left: overdue.length - moves.length };
}
