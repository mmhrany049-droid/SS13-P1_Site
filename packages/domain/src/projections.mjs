// SS 12 — projections are pure reducers over events, so replay(events) must equal the live projection (tested).
import { tehranDate, addDaysISO } from './dates.mjs';
export const todayProjector = {
  init: () => ({}),
  /** state: { [userId:date]: doc } */
  apply(state, e) {
    if (e.type !== 'study.session.logged') return state;
    const p = e.payload; const date = tehranDate(p.at || e.occurredAt); const id = `${e.aggregateId.split('/')[0]}:${date}`;
    const cur = state[id] || { id, userId: e.aggregateId.split('/')[0], date, minutes: 0, tests: 0, correct: 0, wrong: 0, sessions: 0, subjects: {}, lastSeq: 0 };
    const subjects = { ...cur.subjects }; const k = p.subjectId || p.subject || p.topic; // v13: canonical subject id first (the device used to send free text → fragmented per-subject totals) subjects[k] = (subjects[k] || 0) + p.minutes;
    return { ...state, [id]: { ...cur, minutes: cur.minutes + p.minutes, tests: cur.tests + p.tests, correct: cur.correct + (p.correct || 0), wrong: cur.wrong + (p.wrong || 0), sessions: cur.sessions + 1, subjects, lastSeq: Math.max(cur.lastSeq, e.seq || 0) } };
  },
  docs: state => Object.values(state).sort((a, b) => a.id.localeCompare(b.id)),
};
/** Apply one event to the stored projection inside the same transaction as the event (live path). */
export async function projectToday(tx, e) {
  if (e.type !== 'study.session.logged') return;
  const date = tehranDate(e.payload.at || e.occurredAt); const id = `${e.aggregateId.split('/')[0]}:${date}`;
  const cur = await tx.get('proj_today', id); const next = todayProjector.apply(cur ? { [id]: cur } : {}, e)[id];
  await tx.put('proj_today', next);
}
/**
 * Tenant-scoped mirror used by the organisation workspace. Personal projections remain private;
 * only sessions explicitly linked to the active organisation enter this projection.
 */
export async function projectOrgToday(tx, e) {
  if (e.type !== 'study.session.logged') return;
  const organizationId = e.organizationId || e.payload?.organizationId;
  if (!organizationId) return;
  const userId = e.aggregateId.split('/')[0];
  const date = tehranDate(e.payload.at || e.occurredAt);
  const id = `${organizationId}:${userId}:${date}`;
  const baseId = `${userId}:${date}`;
  const cur = await tx.get('org_today', id);
  const projected = todayProjector.apply(cur ? { [baseId]: { ...cur, id: baseId } } : {}, e)[baseId];
  await tx.put('org_today', { ...projected, id, organizationId, userId });
}
/** Safe one-time bridge for older study events: infer a tenant only when a learner has one active org. */
export async function rebuildOrgToday(repo) {
  return repo.transaction(async tx => {
    const marker = await tx.get('_meta', 'projection:org_today:v1');
    if (marker?.version === 1) return { rebuilt: false, events: 0 };
    for (const d of await tx.list('org_today')) await tx.remove('org_today', d.id);
    const rolledBack = new Set((await tx.list('import_jobs', { status: 'rolled_back' })).map(j => j.id));
    const orgsByUser = new Map();
    for (const a of await tx.list('role_assignments', { roleId: 'student' })) {
      if (a.revokedAt || !a.organizationId) continue;
      const membership = a.membershipId ? await tx.get('memberships', a.membershipId) : null;
      if (membership?.status !== 'active') continue;
      const set = orgsByUser.get(a.userId) || new Set(); set.add(a.organizationId); orgsByUser.set(a.userId, set);
    }
    let count = 0;
    const events = (await tx.list('events', e => e.type === 'study.session.logged' && !rolledBack.has(e.payload?.importJobId))).sort((a, b) => a.seq - b.seq);
    for (const e of events) {
      const userId = e.aggregateId.split('/')[0];
      const inferred = e.organizationId || e.payload?.organizationId || (orgsByUser.get(userId)?.size === 1 ? [...orgsByUser.get(userId)][0] : null);
      if (!inferred) continue;
      await projectOrgToday(tx, { ...e, organizationId: inferred });
      count++;
    }
    await tx.put('_meta', { id: 'projection:org_today:v1', version: 1, builtAt: new Date().toISOString(), events: count });
    return { rebuilt: true, events: count };
  });
}
/** The /api/today response: today + last 7 days, everything scoped to ONE user and Asia/Tehran. */
export function todayView(docs, userId, now = new Date()) {
  const date = tehranDate(now); const by = Object.fromEntries(docs.filter(d => d.userId === userId).map(d => [d.date, d]));
  const empty = d => ({ date: d, minutes: 0, tests: 0, correct: 0, wrong: 0, sessions: 0, subjects: {} });
  const week = Array.from({ length: 7 }, (_, i) => addDaysISO(date, i - 6)).map(d => { const x = by[d] || empty(d); const { id, userId: _u, lastSeq, ...rest } = x; return rest; });
  let streak = 0; for (let i = 0; ; i++) { const d = addDaysISO(date, -i); if (by[d]?.sessions) streak++; else if (i === 0) continue; else break; if (i > 400) break; }
  return { date, timeZone: 'Asia/Tehran', today: week.at(-1), week, streakDays: streak };
}
