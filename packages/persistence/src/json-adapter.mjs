// SS 12 — JSON file adapter: demo, tests and small single-process installs. Not the production canonical store.
// Crash safety: a commit first writes ONE journal file containing the full new content of every touched collection
// (tmp → rename), then rewrites each collection file (tmp → rename), then deletes the journal. On open(), a leftover
// journal is rolled forward, so a crash can never leave events without their projection or idempotency record (S7).
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { APPEND_ONLY, matches, mutex } from './repository.mjs';

export function jsonRepository(dir, { onAfterJournal = null } = {}) {
  const root = path.resolve(dir); const base = new Map(); const lock = mutex(); let opened = false;
  const file = col => path.join(root, `${col}.json`);
  const JOURNAL = () => path.join(root, '_journal.json');
  const atomic = (f, text) => { const tmp = `${f}.${process.pid}.tmp`; writeFileSync(tmp, text); renameSync(tmp, f); };
  const colOf = col => {
    if (!/^[a-z_][a-z0-9_]*$/.test(col)) throw new Error('bad-collection-name');
    if (!base.has(col)) { let obj = {}; try { obj = JSON.parse(readFileSync(file(col), 'utf8')); } catch { /* new collection */ } base.set(col, new Map(Object.entries(obj))); }
    return base.get(col);
  };
  const clone = v => v == null ? v : structuredClone(v);
  function recover() {
    if (!existsSync(JOURNAL())) return false;
    let j; try { j = JSON.parse(readFileSync(JOURNAL(), 'utf8')); } catch { unlinkSync(JOURNAL()); return false; } // torn journal = commit never happened
    for (const [col, obj] of Object.entries(j.collections || {})) atomic(file(col), JSON.stringify(obj));
    unlinkSync(JOURNAL()); return true;
  }
  const api = {
    kind: 'json', dir: root,
    async open() { mkdirSync(root, { recursive: true }); api.recovered = recover(); base.clear(); opened = true; return api; },
    async close() { opened = false; },
    async get(col, id) { return clone(colOf(col).get(String(id)) ?? null); },
    async list(col, where) { return [...colOf(col).values()].filter(d => matches(d, where)).map(clone); },
    async put(col, doc) { return api.transaction(tx => tx.put(col, doc)); },
    collections() { return readdirSync(root).filter(f => f.endsWith('.json') && !f.startsWith('_journal')).map(f => f.slice(0, -5)); },
    transaction(fn) {
      if (!opened) throw new Error('repository-not-open');
      return lock(async () => {
        const over = new Map(); // col → Map(id → doc | null)
        const ov = col => { if (!over.has(col)) over.set(col, new Map()); return over.get(col); };
        const read = (col, id) => { const o = over.get(col); if (o?.has(id)) return o.get(id); return colOf(col).get(id) ?? null; };
        const tx = {
          async get(col, id) { return clone(read(col, String(id))); },
          async list(col, where) { const ids = new Set([...colOf(col).keys(), ...(over.get(col)?.keys() || [])]); return [...ids].map(id => read(col, id)).filter(d => d && matches(d, where)).map(clone); },
          async put(col, doc) { if (!doc?.id) throw new Error('doc-needs-id'); if (APPEND_ONLY.has(col) && read(col, String(doc.id))) throw new Error(`${col} is append-only`); ov(col).set(String(doc.id), clone(doc)); return doc; },
          async insert(col, doc) { if (read(col, String(doc.id))) throw Object.assign(new Error('duplicate'), { code: 'duplicate', status: 409 }); return tx.put(col, doc); },
          async remove(col, id) { if (APPEND_ONLY.has(col)) throw new Error(`${col} is append-only`); ov(col).set(String(id), null); },
          async nextSeq(name = 'events') { const m = read('_meta', 'seq:' + name) || { id: 'seq:' + name, value: 0 }; const n = { ...m, value: m.value + 1 }; ov('_meta').set(n.id, n); return n.value; },
          async append(event) { if (!event?.eventId || read('events', String(event.eventId))) throw Object.assign(new Error('duplicate-event'), { code: 'duplicate', status: 409 }); const seq = await tx.nextSeq('events'); const e = { ...event, id: event.eventId, seq }; ov('events').set(e.id, e); return e; },
        };
        const result = await fn(tx);
        if (!over.size) return result;
        const next = {};
        for (const [col, changes] of over) { const m = new Map(colOf(col)); for (const [id, d] of changes) d === null ? m.delete(id) : m.set(id, d); next[col] = m; }
        const journal = { at: new Date().toISOString(), collections: Object.fromEntries(Object.entries(next).map(([c, m]) => [c, Object.fromEntries(m)])) };
        atomic(JOURNAL(), JSON.stringify(journal));
        if (onAfterJournal) await onAfterJournal(); // test hook: simulate a crash between journal and apply
        for (const [col, m] of Object.entries(next)) { atomic(file(col), JSON.stringify(Object.fromEntries(m))); base.set(col, m); }
        unlinkSync(JOURNAL());
        return result;
      });
    },
  };
  return api;
}
