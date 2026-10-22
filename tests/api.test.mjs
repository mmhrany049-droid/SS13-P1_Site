// SS 12 — unified API: identity, sessions, policy, validation, idempotency, events, Tehran dates, IDOR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { boot, setupOwner, OWNER } from './support/harness.mjs';
import { totpAt } from '@ss/auth/security.mjs';
import { canonical } from '@ss/domain/format.js';

const h = await boot({ SS_REQUIRE_MFA: '1' });
test.after(() => h.close());
const owner = await setupOwner(h);
let ownerSecret;

test('setup runs once and needs the one-time token', async () => {
  const c = h.client();
  assert.equal((await c('/api/setup', { method: 'POST', body: { ...OWNER, email: 'x@y.ir', setupToken: 'setup-token-123' } })).status, 409);
});
test('health + query string does not break routing (S12)', async () => {
  const c = h.client(); const r = await c('/api/health?x=1&y=2'); assert.equal(r.status, 200); assert.equal(r.body.version, '13.0.0'); assert.equal(r.body.timeZone, 'Asia/Tehran');
});
test('bad URL and path traversal are rejected, not 500', async () => {
  const c = h.client(); assert.equal((await c('/api/%E0%A4%A')).status, 404); assert.equal((await c('/api/../etc/passwd')).status, 404);
});
test('owner login → sensitive role needs MFA setup first', async () => {
  const r = await owner('/api/auth/login', { method: 'POST', body: { identity: OWNER.email, password: OWNER.password } });
  assert.equal(r.status, 200); assert.equal(r.body.activeRole, null); assert.equal(r.body.next, '/choose-role');
  assert.match(r.cookie, /ss_sid=.*HttpOnly.*SameSite=Strict/);
  const ra = r.body.roleAssignments[0]; assert.equal(ra.roleId, 'owner');
  const x = await owner('/api/auth/role', { method: 'POST', body: { roleAssignmentId: ra.id } }); assert.equal(x.status, 403); assert.equal(x.body.error, 'mfa-setup-required');
  const s = await owner('/api/auth/mfa/setup', { method: 'POST', body: {} }); ownerSecret = s.body.secret;
  assert.equal((await owner('/api/auth/mfa/enable', { method: 'POST', body: { code: totpAt(ownerSecret) } })).status, 200);
  const y = await owner('/api/auth/role', { method: 'POST', body: { roleAssignmentId: ra.id } }); assert.equal(y.status, 200); assert.equal(y.body.next, '/workspace');
});
test('session cookie is rotated on role change and only its hash is stored (S1)', async () => {
  const sessions = JSON.parse(readFileSync(path.join(h.dataDir, 'v12', 'sessions.json'), 'utf8'));
  const raw = (await owner('/api/auth/session')).headers; assert.ok(raw);
  for (const id of Object.keys(sessions)) assert.match(id, /^[a-f0-9]{64}$/);
  const alive = Object.values(sessions).filter(s => !s.revokedAt); const rotated = Object.values(sessions).filter(s => s.revokedWhy === 'rotated');
  assert.ok(rotated.length >= 1); assert.ok(alive.length >= 1);
});
test('CSRF: write without the custom header is refused', async () => {
  const r = await owner('/api/workspace/people', { method: 'POST', body: { email: 'a@b.ir', role: 'student' }, csrf: false }); assert.equal(r.status, 403); assert.equal(r.body.error, 'csrf');
  const o = await owner('/api/workspace/people', { method: 'POST', body: { email: 'a@b.ir', role: 'student' }, headers: { Origin: 'https://evil.example' } }); assert.equal(o.body.error, 'csrf');
});
let studentId, studentPw, teacherId, otherOrgManager;
test('owner grants roles inside own organisation; temp password returned once', async () => {
  const r = await owner('/api/workspace/people', { method: 'POST', body: { email: 'sara@ss.ir', name: 'سارا', role: 'student' } }); assert.equal(r.status, 201); studentId = r.body.user.id; studentPw = r.body.tempPassword; assert.ok(studentPw);
  const t = await owner('/api/workspace/people', { method: 'POST', body: { email: 'teach@ss.ir', name: 'معلم', role: 'subject_teacher', subjects: 'ریاضی' } }); teacherId = t.body.user.id;
  const p = await owner('/api/workspace/people'); assert.equal(p.status, 200); assert.equal(p.body.items.length, 3);
});
const student = h.client();
test('lockout after 5 wrong passwords (S2)', async () => {
  const c = h.client(); let last;
  for (let i = 0; i < 6; i++) last = await c('/api/auth/login', { method: 'POST', body: { identity: 'teach@ss.ir', password: 'wrong-' + i } });
  assert.equal(last.status, 423); assert.equal(last.body.error, 'locked');
});
test('student logs in with the single login and lands on /today', async () => {
  const r = await student('/api/auth/login', { method: 'POST', body: { identity: 'sara@ss.ir', password: studentPw } });
  assert.equal(r.status, 200); assert.equal(r.body.activeRole, 'student'); assert.equal(r.body.next, '/today');
  const me = await student('/api/me'); assert.equal(me.body.user.email, 'sara@ss.ir'); assert.equal(me.body.activeRole, 'student');
});
test('input validation: negative minutes / text tests are rejected (S5)', async () => {
  const k = { 'Idempotency-Key': 'k-invalid-0001' };
  assert.equal((await student('/api/study/sessions', { method: 'POST', body: { minutes: -500, tests: 10, topic: 'ریاضی' }, headers: k })).status, 422);
  assert.equal((await student('/api/study/sessions', { method: 'POST', body: { minutes: 30, tests: 'abc', topic: 'ریاضی' }, headers: k })).status, 422);
  assert.equal((await student('/api/study/sessions', { method: 'POST', body: { minutes: 30, tests: 10, topic: 'ریاضی', admin: true }, headers: k })).status, 422);
  assert.equal((await student('/api/study/sessions', { method: 'POST', body: { minutes: 30, tests: 10, topic: 'ریاضی' } })).body.error, 'idempotency-key-required');
});
test('idempotency per user: same key → same response, no duplicate event (S6)', async () => {
  const body = { minutes: 45, tests: 20, correct: 12, wrong: 4, topic: 'ریاضی ۳', subject: 'ریاضی', localId: 'ses-a1' };
  const a = await student('/api/study/sessions', { method: 'POST', body, headers: { 'Idempotency-Key': 'ses:ses-a1' } });
  const b = await student('/api/study/sessions', { method: 'POST', body, headers: { 'Idempotency-Key': 'ses:ses-a1' } });
  assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.body.replayed, true); assert.equal(a.body.seq, b.body.seq);
  const c = await student('/api/study/sessions', { method: 'POST', body: { ...body, minutes: 50 }, headers: { 'Idempotency-Key': 'ses:ses-a1' } }); assert.equal(c.status, 409);
  const t = await student('/api/today'); assert.equal(t.body.today.minutes, 45); assert.equal(t.body.today.tests, 20);
});
test('concurrent writes: 20 parallel commands, no lost update', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => student('/api/study/sessions', { method: 'POST', body: { minutes: 10, tests: 1, topic: 'شیمی' }, headers: { 'Idempotency-Key': 'par-' + String(i).padStart(4, '0') } })));
  const t = await student('/api/today'); assert.equal(t.body.today.minutes, 45 + 200); assert.equal(t.body.today.sessions, 21);
});
test('projection rebuilt from the event log equals the live projection (A5)', async () => {
  const v = await h.app.verifyProjections(); assert.equal(v.projectionMatchesReplay, true); assert.equal(v.duplicates, 0); assert.equal(v.events, 21);
});
test('student activity is projected into a tenant-scoped workspace feed', async () => {
  const p = await owner('/api/workspace/progress');
  assert.equal(p.status, 200);
  const sara = p.body.items.find(x => x.user.id === studentId);
  assert.ok(sara); assert.equal(sara.progress.today.sessions, 21); assert.equal(sara.progress.today.minutes, 245);
  const detail = await owner(`/api/workspace/progress/${studentId}`);
  assert.equal(detail.status, 200); assert.equal(detail.body.progress.today.tests, 40);
  const verify = await owner('/api/workspace/events/verify');
  assert.equal(verify.status, 200); assert.equal(verify.body.projectionMatchesReplay, true);
});
test('Tehran date: a session at 22:00 UTC belongs to the NEXT Tehran day (S11)', async () => {
  const r = await student('/api/study/sessions', { method: 'POST', body: { minutes: 20, tests: 0, topic: 'زیست', at: '2026-01-10T22:00:00Z' }, headers: { 'Idempotency-Key': 'tz-test-0001' } });
  assert.equal(r.status, 201);
  const p = JSON.parse(readFileSync(path.join(h.dataDir, 'v12', 'proj_today.json'), 'utf8')); assert.ok(p[`${studentId}:2026-01-11`]); assert.equal(p[`${studentId}:2026-01-10`], undefined);
});
test('event envelope is complete', async () => {
  const ev = Object.values(JSON.parse(readFileSync(path.join(h.dataDir, 'v12', 'events.json'), 'utf8'))).find(e => e.type === 'study.session.logged');
  for (const k of ['eventId', 'type', 'schemaVersion', 'aggregateType', 'aggregateId', 'actorId', 'occurredAt', 'source', 'idempotencyKey', 'payload', 'seq']) assert.ok(k in ev, k);
});
test('policy: a student cannot use workspace endpoints; role from client is ignored', async () => {
  assert.equal((await student('/api/workspace/people')).status, 403);
  assert.equal((await student('/api/workspace/events')).status, 403);
  const r = await student('/api/auth/role', { method: 'POST', body: { roleAssignmentId: 'ra-doesnotexist00' } }); assert.equal(r.status, 404);
});
test('IDOR: a manager of ANOTHER organisation cannot read this student', async () => {
  const h2 = await boot({ SS_REQUIRE_MFA: '0' }); // second, separate org on the same code path is simulated with a second org in this store instead:
  await h2.close();
  // create org B + its manager directly through the repository (as an owner would)
  const { assignRole, createUser } = await import('../apps/api/src/identity.mjs');
  const mgrPw = 'Manager-pass-2026'; let mgr;
  await h.app.db.transaction(async tx => { await tx.insert('organizations', { id: 'org-b', kind: 'school', name: 'مدرسه ب', ownerUserId: null }); mgr = await createUser(tx, { email: 'mgr-b@ss.ir', name: 'مدیر ب', password: mgrPw }); await assignRole(tx, { userId: mgr.id, roleId: 'school_manager', organizationId: 'org-b' }); });
  const m = h.client(); const l = await m('/api/auth/login', { method: 'POST', body: { identity: 'mgr-b@ss.ir', password: mgrPw } });
  // MFA is required for a manager in this instance: activate with TOTP after setup
  const s = await m('/api/auth/mfa/setup', { method: 'POST', body: {} }); await m('/api/auth/mfa/enable', { method: 'POST', body: { code: totpAt(s.body.secret) } });
  await m('/api/auth/role', { method: 'POST', body: { roleAssignmentId: l.body.roleAssignments[0].id } });
  otherOrgManager = m;
  const r = await m(`/api/workspace/students/${studentId}/today`); assert.equal(r.status, 403); assert.ok(r.body.failed.includes('org_membership'));
  const own = await owner(`/api/workspace/students/${studentId}/today`); assert.equal(own.status, 200);
  const ppl = await m('/api/workspace/people'); assert.ok(ppl.body.items.every(u => u.id !== studentId));
});
test('sspack import preserves consented data and stays inside its organisation', async () => {
  const raw = {
    format: 'sspack', v: 3, packId: 'pack-test-001', createdAt: new Date().toISOString(), app: 'SS',
    user: { id: 'legacy-student-001', name: 'لیلا آزمون', phone: '09123456789', grade: 12, stream: 'tajrobi' },
    consent: { books: true, results: true, compare: false, dossier: true, telegram: false, full: false },
    books: [{ uid: 'book-test-1', title: 'زیست نمونه', nodes: [], keys: {} }],
    results: [{ hubExamId: 'exam-test-1', date: '2026-10-13', percent: 82, sections: [] }],
    dossier: { identity: { gradeFa: 'دوازدهم' }, education: { targetMajor: 'پزشکی' } },
    stats: null, summary: null, requests: [],
  };
  raw.sum = createHash('sha256').update(canonical(raw)).digest('hex');
  const preview = await owner('/api/workspace/imports', { method: 'POST', body: { content: raw } });
  assert.equal(preview.status, 201); assert.equal(preview.body.preview.records, 3);
  const applied = await owner(`/api/workspace/imports/${preview.body.id}/apply`, { method: 'POST', body: {} });
  assert.equal(applied.status, 200); assert.equal(applied.body.verification.records.actual, 3);
  const progress = await owner('/api/workspace/progress');
  const imported = progress.body.items.find(x => x.user.name === 'لیلا آزمون');
  assert.ok(imported); assert.deepEqual(new Set(imported.sharedData), new Set(['books', 'results', 'dossier']));
  const jobs = await otherOrgManager('/api/workspace/imports');
  assert.equal(jobs.status, 200); assert.ok(jobs.body.items.every(x => x.id !== preview.body.id));
  const stolen = await otherOrgManager(`/api/workspace/imports/${preview.body.id}/apply`, { method: 'POST', body: {} });
  assert.equal(stolen.status, 404);
  const rollback = await owner(`/api/workspace/imports/${preview.body.id}/rollback`, { method: 'POST', body: {} });
  assert.equal(rollback.status, 200); assert.equal(rollback.body.status, 'rolled_back');
  const afterRollback = await owner('/api/workspace/progress');
  assert.ok(!afterRollback.body.items.some(x => x.user.name === 'لیلا آزمون'));
});
test('body limit: 2 MB JSON → 413, not a crash (S8)', async () => {
  const r = await student('/api/study/sessions', { method: 'POST', raw: JSON.stringify({ topic: 'x'.repeat(2 * 1024 * 1024) }), headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'big-body-0001' } });
  assert.equal(r.status, 413);
});
test('online exam stays behind its gates', async () => { assert.equal((await student('/api/exams/online')).body.error, 'feature-disabled'); });
test('logout revokes the session server-side', async () => {
  const c = h.client(); await c('/api/auth/login', { method: 'POST', body: { identity: 'sara@ss.ir', password: studentPw } });
  assert.equal((await c('/api/today')).status, 200); await c('/api/auth/logout', { method: 'POST', body: {} }); assert.equal((await c('/api/today')).status, 401);
});
test('legacy hub bridge is closed when multiple organisations share one database', async () => {
  const st = await owner('/api/admin/status'); assert.equal(st.status, 410);
  const s = await owner('/api/admin/state', { method: 'PUT', body: { rev: 0, hub: { name: 'x', classes: [] } }, headers: { 'X-SS-Admin': '1' } }); assert.equal(s.status, 410);
  const cfg = await owner('/api/admin/config'); assert.equal(cfg.status, 410);
  const old = await h.client()('/api/admin/login', { method: 'POST', body: { email: OWNER.email, password: OWNER.password }, headers: { 'X-SS-Admin': '1' } }); assert.equal(old.status, 410);
});
