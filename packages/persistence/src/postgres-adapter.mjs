// SS 12 — PostgreSQL adapter: NOT IMPLEMENTED in this build (status: documented-only).
// Why: it needs the `pg` driver (npm, network) and the owner's decision on PostgreSQL + object storage (OPEN_DECISIONS #1).
// The schema lives in migrations/postgres/001_init.sql. Implementing it = the same Repository surface + the shared
// contract test in tests/persistence.contract.test.mjs, which every adapter must pass before it may be used.
export async function postgresRepository() {
  throw Object.assign(new Error('PostgreSQL adapter is not implemented in SS 13.0.0 (see IMPLEMENTATION_STATUS.md)'), { code: 'not-implemented' });
}
