// SS 12 — domain events (Blueprint §3, report §9.3). Versioned, append-only, idempotent; projections are rebuildable.
import { randomUUID } from 'node:crypto';
export const EVENT_TYPES = {
  'identity.user.created':        { aggregate: 'user',          v: 1 },
  'identity.session.created':     { aggregate: 'session',       v: 1 },
  'identity.session.revoked':     { aggregate: 'session',       v: 1 },
  'identity.role.assigned':       { aggregate: 'role_assignment', v: 1 },
  'identity.role.revoked':        { aggregate: 'role_assignment', v: 1 },
  'org.membership.created':       { aggregate: 'membership',    v: 1 },
  'study.session.logged':         { aggregate: 'study_session', v: 1 },
  'review.item.rated':            { aggregate: 'review_item',   v: 1 },
  'planner.proposal.created':     { aggregate: 'plan_proposal', v: 1 },
  'planner.proposal.decided':     { aggregate: 'plan_proposal', v: 1 },
  'legacy.imported':              { aggregate: 'import_job',    v: 1 },
  'legacy.import.rolled_back':    { aggregate: 'import_job',    v: 1 },
};
export const SOURCES = ['web', 'offline-queue', 'api', 'import', 'system', 'cli'];
/** Full envelope: eventId, type, schemaVersion, aggregateType, aggregateId, actorId, occurredAt, source, idempotencyKey, payload. */
export function envelope({ type, aggregateId, actorId, organizationId = null, payload = {}, source = 'api', idempotencyKey = null, occurredAt = new Date().toISOString() }) {
  const t = EVENT_TYPES[type]; if (!t) throw Object.assign(new Error('unknown-event-type: ' + type), { status: 500 });
  if (!SOURCES.includes(source)) throw new Error('bad-event-source');
  if (!aggregateId) throw new Error('event-needs-aggregate');
  return { eventId: randomUUID(), type, schemaVersion: t.v, aggregateType: t.aggregate, aggregateId: String(aggregateId), actorId: actorId ? String(actorId) : null, organizationId: organizationId ? String(organizationId) : null, occurredAt, source, idempotencyKey, payload };
}
export function isEnvelope(e) {
  return !!e && typeof e.eventId === 'string' && !!EVENT_TYPES[e.type] && e.schemaVersion === EVENT_TYPES[e.type].v && e.aggregateType === EVENT_TYPES[e.type].aggregate && typeof e.aggregateId === 'string' && typeof e.occurredAt === 'string' && SOURCES.includes(e.source) && typeof e.payload === 'object';
}
