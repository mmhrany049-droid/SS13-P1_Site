// 002 — event store bookkeeping: make sure the sequence counter exists and is ≥ the highest stored seq (repair after restore).
export default { id: '002_event_seq', async up(tx) {
  const max = (await tx.list('events')).reduce((a, e) => Math.max(a, e.seq || 0), 0);
  const cur = await tx.get('_meta', 'seq:events'); if (!cur || cur.value < max) await tx.put('_meta', { id: 'seq:events', value: max });
} };
