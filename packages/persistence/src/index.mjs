export * from './repository.mjs';
export { jsonRepository } from './json-adapter.mjs';
export { sqliteRepository } from './sqlite-adapter.mjs';
export { postgresRepository } from './postgres-adapter.mjs';
export * from './commands.mjs';
export * from './migrate.mjs';
/** Pick an adapter from env: SS_DB=json (default, data/v12) | sqlite (data/v12.sqlite). */
export async function openRepository({ kind = process.env.SS_DB || 'json', dataDir }) {
  const path = await import('node:path');
  if (kind === 'sqlite') { const { sqliteRepository } = await import('./sqlite-adapter.mjs'); return (await sqliteRepository(path.join(dataDir, 'v12.sqlite'))).open(); }
  if (kind === 'postgres') { const { postgresRepository } = await import('./postgres-adapter.mjs'); return postgresRepository(); }
  const { jsonRepository } = await import('./json-adapter.mjs'); return jsonRepository(path.join(dataDir, 'v12')).open();
}
