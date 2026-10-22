// SS 12 — numbered, idempotent migrations with a log (report §9.2, A4). Each migration: { id: '001_x', up(tx, ctx), down?(tx, ctx) }.
export async function runMigrations(repo, list, { log = () => {}, ctx = {} } = {}) {
  const done = new Set((await repo.list('_migrations')).filter(m => m.status === 'applied').map(m => m.id)); const ran = [];
  for (const m of [...list].sort((a, b) => a.id.localeCompare(b.id))) {
    if (done.has(m.id)) continue;
    await repo.transaction(async tx => { await m.up(tx, ctx); await tx.put('_migrations', { id: m.id, status: 'applied', at: new Date().toISOString() }); });
    log(`migration ${m.id} applied`); ran.push(m.id);
  }
  return ran;
}
export async function rollbackMigration(repo, m, { log = () => {}, ctx = {} } = {}) {
  if (!m.down) throw new Error(`migration ${m.id} has no down(); restore from backup instead`);
  await repo.transaction(async tx => { await m.down(tx, ctx); await tx.put('_migrations', { id: m.id, status: 'rolled_back', at: new Date().toISOString() }); });
  log(`migration ${m.id} rolled back`);
}
