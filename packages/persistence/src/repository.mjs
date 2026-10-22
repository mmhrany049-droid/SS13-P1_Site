// SS 12 — Repository interface (report §9.2). Every adapter implements exactly this surface; the API and domain code
// never touch files, SQL or localStorage directly. All methods are async so a PostgreSQL adapter fits unchanged.
//
//   open()                         → load / recover (e.g. replay an unfinished journal)
//   close()
//   get(col, id)                   → doc | null
//   list(col, where?)              → doc[]   (where = object of equal fields, or a predicate function)
//   transaction(async tx => …)     → result of fn; tx = { get, list, put, insert, remove, append, nextSeq }
//                                    either every write inside commits, or none does (throw = rollback)
//   put(col, doc)                  → single-write transaction (doc.id required)
//
// Collections are named in DATA_MODEL.md. `events` is append-only: adapters refuse put/remove on it.
export const REPOSITORY_METHODS = ['open', 'close', 'get', 'list', 'transaction', 'put'];
export function assertRepository(r) {
  for (const m of REPOSITORY_METHODS) if (typeof r?.[m] !== 'function') throw new Error(`repository adapter is missing ${m}()`);
  return r;
}
export const APPEND_ONLY = new Set(['events', 'audit']);
export const matches = (doc, where) => !where ? true : typeof where === 'function' ? !!where(doc) : Object.entries(where).every(([k, v]) => doc?.[k] === v);
/** A tiny async mutex: transactions run strictly one after another inside one process (fixes the v12-spike race, S6). */
export function mutex() {
  let tail = Promise.resolve();
  return fn => { const run = tail.then(fn, fn); tail = run.catch(() => {}); return run; };
}
