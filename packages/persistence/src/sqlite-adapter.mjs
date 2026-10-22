// SS 12 — SQLite adapter on Node's built-in node:sqlite (Node ≥ 22.5, no npm dependency). Real ACID transactions.
// Good for a single school/institute server. PostgreSQL remains the documented production target (OPEN_DECISIONS #1).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { APPEND_ONLY, matches, mutex } from './repository.mjs';

export async function sqliteRepository(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const lock = mutex(); let db = null;
  const api = {
    kind: 'sqlite', file,
    async open() {
      if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      db = new DatabaseSync(file);
      db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, doc TEXT NOT NULL, PRIMARY KEY (col, id));
        CREATE TABLE IF NOT EXISTS seqs (name TEXT PRIMARY KEY, value INTEGER NOT NULL);`);
      return api;
    },
    async close() { db?.close(); db = null; },
    async get(col, id) { const r = db.prepare('SELECT doc FROM docs WHERE col=? AND id=?').get(col, String(id)); return r ? JSON.parse(r.doc) : null; },
    async list(col, where) { return db.prepare('SELECT doc FROM docs WHERE col=? ORDER BY rowid').all(col).map(r => JSON.parse(r.doc)).filter(d => matches(d, where)); },
    async put(col, doc) { return api.transaction(tx => tx.put(col, doc)); },
    transaction(fn) {
      return lock(async () => {
        const exists = (col, id) => !!db.prepare('SELECT 1 FROM docs WHERE col=? AND id=?').get(col, String(id));
        const tx = {
          get: api.get, list: api.list,
          async put(col, doc) { if (!doc?.id) throw new Error('doc-needs-id'); if (APPEND_ONLY.has(col) && exists(col, doc.id)) throw new Error(`${col} is append-only`); db.prepare('INSERT INTO docs (col,id,doc) VALUES (?,?,?) ON CONFLICT(col,id) DO UPDATE SET doc=excluded.doc').run(col, String(doc.id), JSON.stringify(doc)); return doc; },
          async insert(col, doc) { if (exists(col, doc.id)) throw Object.assign(new Error('duplicate'), { code: 'duplicate', status: 409 }); return tx.put(col, doc); },
          async remove(col, id) { if (APPEND_ONLY.has(col)) throw new Error(`${col} is append-only`); db.prepare('DELETE FROM docs WHERE col=? AND id=?').run(col, String(id)); },
          async nextSeq(name = 'events') { db.prepare('INSERT INTO seqs (name,value) VALUES (?,1) ON CONFLICT(name) DO UPDATE SET value=value+1').run(name); return db.prepare('SELECT value FROM seqs WHERE name=?').get(name).value; },
          async append(event) { const seq = await tx.nextSeq('events'); const e = { ...event, id: event.eventId, seq }; await tx.put('events', e); return e; },
        };
        db.exec('BEGIN IMMEDIATE');
        try { const r = await fn(tx); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
      });
    },
  };
  return api;
}
