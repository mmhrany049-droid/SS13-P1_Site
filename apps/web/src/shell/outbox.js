// SS 12 — offline command queue (report §13.2). Writes made on the device are queued in IndexedDB and replayed to
// POST /api/study/sessions with a stable Idempotency-Key, so a retry after a lost connection never double-counts.
// The student's personal engine data (answers, reviews, plan) stays local-first; what the organisation shares
// (study minutes, tests, accuracy → /api/today) gets its source of truth on the server.
import { subjectIdOf } from '@ss/domain/vocab.js';
import { call } from './api.js';
import { sessionStats, bookById } from '@ss/domain/store.js';

const DB = 'ss12-outbox', STORE = 'commands';
let dbp = null;
const idb = () => dbp ||= new Promise((ok, fail) => {
  if (typeof indexedDB === 'undefined') return fail(new Error('no-idb'));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'key' });
  r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
});
// localStorage fallback (private mode / old browsers)
const LS = 'ss12-outbox';
const lsAll = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
const lsSet = v => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* quota */ } };

async function tx(mode, fn) {
  try { const db = await idb(); return await new Promise((ok, fail) => { const t = db.transaction(STORE, mode); const st = t.objectStore(STORE); const out = fn(st); t.oncomplete = () => ok(out?.result ?? out); t.onerror = () => fail(t.error); }); }
  catch { return null; }
}
export async function all(userId) {
  const r = await tx('readonly', st => st.getAll());
  const list = Array.isArray(r) ? r : lsAll();
  return list.filter(c => c.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function put(cmd) { const ok = await tx('readwrite', st => st.put(cmd)); if (ok === null) lsSet([...lsAll().filter(c => c.key !== cmd.key), cmd]); }
export async function drop(key) { const ok = await tx('readwrite', st => st.delete(key)); if (ok === null) lsSet(lsAll().filter(c => c.key !== key)); }

/** Which local sessions were already accepted by the server (per user). */
const SENT = uid => `ss12-sent:${uid}`;
export const sentSet = uid => { try { return new Set(JSON.parse(localStorage.getItem(SENT(uid)) || '[]')); } catch { return new Set(); } };
const markSent = (uid, ids) => { const s = sentSet(uid); ids.forEach(i => s.add(i)); try { localStorage.setItem(SENT(uid), JSON.stringify([...s].slice(-5000))); } catch { /* */ } };

const safeId = id => String(id).replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 60) || 'x';
/** A local practice session → the validated server command (minutes 1..600, tests 0..500, topic required). */
export function toCommand(s, ses, userId) {
  const st = sessionStats(s, ses); const b = bookById(s, ses.bookId);
  const node = b?.nodes?.find?.(n => n.id === ses.nodeId) || null;
  const tests = Math.max(0, Math.min(500, st.N || Object.keys(ses.answers || {}).length));
  const minutes = Math.max(1, Math.min(600, Math.round(ses.minutes || Math.max(1, tests * 1.5))));
  const topic = String([b?.subject, node?.title].filter(Boolean).join(' · ') || b?.title || 'جلسه مطالعه').slice(0, 120);
  const id = safeId(ses.id);
  return { key: `ses:${id}`, userId, createdAt: new Date().toISOString(), tries: 0,
    body: { minutes, tests, correct: Math.min(tests, st.C || 0), wrong: Math.min(tests - Math.min(tests, st.C || 0), st.W || 0), topic, subject: String(b?.subject || '').slice(0, 60) || undefined, subjectId: (b?.subjectId || subjectIdOf(b?.subject) || undefined), origin: /^[a-z]+$/.test(ses.origin || '') ? ses.origin : undefined, at: ses.at, localId: id, timed: !!ses.minutes } };
}
/** Queue every local session the server has not confirmed yet. Historical/legacy imports are not «today» data. */
export async function enqueueNew(s, userId) {
  const sent = sentSet(userId); const queued = new Set((await all(userId)).map(c => c.key));
  let n = 0;
  for (const ses of s.sessions || []) {
    if (ses.legacy || ses.historical || !ses.at) continue;
    const cmd = toCommand(s, ses, userId); if (sent.has(cmd.key) || queued.has(cmd.key)) continue;
    if (Date.parse(ses.at) > Date.now() + 5 * 60e3) continue;
    await put(cmd); n++;
  }
  return n;
}
let flushing = null;
/** Replay the queue in order. 4xx (except 401/408/429) = permanently rejected → kept aside with the reason, never retried forever. */
export function flush(userId) {
  return flushing ||= (async () => {
    const out = { sent: 0, failed: 0, rejected: 0, offline: false };
    try {
      for (const c of await all(userId)) {
        if (c.rejected) { out.rejected++; continue; }
        try {
          await call('/api/study/sessions', { method: 'POST', body: c.body, headers: { 'Idempotency-Key': c.key, 'X-SS-Source': 'offline-queue' } });
          await drop(c.key); markSent(userId, [c.key]); out.sent++;
        } catch (e) {
          if (e.offline || e.status >= 500 || [401, 408, 429].includes(e.status)) { await put({ ...c, tries: c.tries + 1, lastError: e.code || 'offline' }); out.failed++; out.offline = !!e.offline; break; }
          if (e.code === 'idempotency-conflict') { await drop(c.key); markSent(userId, [c.key]); continue; } // already stored with an older body
          await put({ ...c, rejected: true, lastError: e.code || String(e.status) }); out.rejected++;
        }
      }
    } finally { flushing = null; }
    return out;
  })();
}
export async function pendingCount(userId) { const l = await all(userId); return { pending: l.filter(c => !c.rejected).length, rejected: l.filter(c => c.rejected).length }; }
