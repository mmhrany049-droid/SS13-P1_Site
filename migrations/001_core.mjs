// 001 — schema marker + the system organisation. Idempotent: running it twice changes nothing.
export default { id: '001_core', async up(tx) {
  if (!(await tx.get('_meta', 'schema'))) await tx.put('_meta', { id: 'schema', version: 1, createdAt: new Date().toISOString(), app: 'SS 13.0.0' });
  if (!(await tx.get('organizations', 'org-system'))) await tx.put('organizations', { id: 'org-system', kind: 'system', name: 'SS (سیستم)', ownerUserId: null, createdAt: new Date().toISOString() });
}, async down(tx) { /* never deletes data; marker only */ const m = await tx.get('_meta', 'schema'); if (m) await tx.put('_meta', { ...m, version: 0 }); } };
