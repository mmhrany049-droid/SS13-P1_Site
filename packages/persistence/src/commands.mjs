// SS 12 — one command = one transaction: idempotency check → events → outbox → projections → stored response.
// Idempotency is per user: the unique key is (userId, key). Same key + same request → the SAME response (replayed);
// same key + different request → 409 idempotency-conflict. Nothing is written twice (report §9.3, S6/S7).
import { createHash } from 'node:crypto';
export const requestHash = body => createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
export async function runCommand(repo, { userId, key, body, events = [], project = async () => {}, respond }) {
  if (!userId || !key) throw Object.assign(new Error('idempotency-key-required'), { status: 400, code: 'idempotency-key-required' });
  const id = `${userId}:${key}`; const h = requestHash(body);
  return repo.transaction(async tx => {
    const seen = await tx.get('idempotency', id);
    if (seen) { if (seen.requestHash !== h) throw Object.assign(new Error('idempotency-conflict'), { status: 409, code: 'idempotency-conflict' }); return { ...seen.response, replayed: true }; }
    const stored = [];
    for (const e of events) { const x = await tx.append({ ...e, idempotencyKey: key }); stored.push(x); await tx.put('outbox', { id: x.eventId, eventId: x.eventId, type: x.type, seq: x.seq, status: 'pending', createdAt: x.occurredAt }); }
    for (const x of stored) await project(tx, x);
    const response = await respond(stored, tx);
    await tx.insert('idempotency', { id, userId, key, requestHash: h, response, createdAt: new Date().toISOString() });
    return { ...response, replayed: false };
  });
}
/** Rebuild projections from the event log (replay). projectors: { name: { reset(), apply(state, event) → state, docs(state) → [docs] } } */
export async function replay(repo, projector) {
  const events = (await repo.list('events')).sort((a, b) => a.seq - b.seq);
  let state = projector.init(); for (const e of events) state = projector.apply(state, e);
  return projector.docs(state);
}
