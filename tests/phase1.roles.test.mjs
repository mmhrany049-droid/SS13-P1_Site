// SS 13 — phase 1: roles, owner-admin approvals, golden tick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, setupOwner, OWNER } from './support/harness.mjs';
import { ROLES, grantable, GRANT_MATRIX, can, APPROVAL_GATED, GOLD_GATED } from '@ss/contracts/roles.mjs';
import { authorize } from '@ss/auth/policy.mjs';

const h = await boot({ SS_REQUIRE_MFA: '0' }); test.after(() => h.close());
const owner = await setupOwner(h);
const login = async (c, email, password) => { const r = await c('/api/auth/login', { method: 'POST', body: { identity: email, password } }); assert.equal(r.status, 200, JSON.stringify(r.body)); const ra = r.body.roleAssignments[0]; if (!r.body.activeRole) { const x = await c('/api/auth/role', { method: 'POST', body: { roleAssignmentId: ra.id } }); assert.equal(x.status, 200, JSON.stringify(x.body)); } return r; };
await login(owner, OWNER.email, OWNER.password);
const add = async (c, body) => c('/api/workspace/people', { method: 'POST', body });
const admin = h.client(), teacher = h.client(), mgrAdmin = h.client(); let adminPw, teacherPw, mgrAdminPw, adminId, teacherId, mgrAdminId;

test('P1-01 the role table: new names, the new «ادمین مدیر», and an explicit grant matrix', () => {
  assert.equal(ROLES.owner.fa, 'مالک'); assert.equal(ROLES.administrator.fa, 'ادمین مالک'); assert.equal(ROLES.manager_admin.fa, 'ادمین مدیر'); assert.equal(Object.keys(ROLES).length, 10);
  assert.ok(!grantable('administrator').includes('administrator')); assert.ok(!grantable('administrator').includes('owner')); assert.ok(grantable('administrator').includes('manager_admin'));
  assert.ok(grantable('owner').includes('owner') && grantable('owner').includes('administrator'));
  assert.ok(!grantable('manager_admin').includes('manager_admin')); assert.deepEqual(grantable('subject_teacher'), ['student']); assert.deepEqual(grantable('student'), []);
  for (const [g, list] of Object.entries(GRANT_MATRIX)) for (const r of list) assert.ok(ROLES[r], `${g} → unknown role ${r}`);
});
test('P1-02 the owner creates an owner-admin, a teacher and a manager-admin', async () => {
  const a = await add(owner, { email: 'admin1@ss.ir', name: 'ادمین یک', role: 'administrator' }); assert.equal(a.status, 201, JSON.stringify(a.body)); adminId = a.body.user.id; adminPw = a.body.tempPassword;
  const t = await add(owner, { email: 'teach1@ss.ir', name: 'معلم یک', role: 'subject_teacher', subjects: 'ریاضی' }); assert.equal(t.status, 201, JSON.stringify(t.body)); teacherId = t.body.user.id; teacherPw = t.body.tempPassword;
  const m = await add(owner, { email: 'madmin@ss.ir', name: 'ادمین مدیر', role: 'manager_admin' }); assert.equal(m.status, 201, JSON.stringify(m.body)); mgrAdminId = m.body.user.id; mgrAdminPw = m.body.tempPassword;
  await login(admin, 'admin1@ss.ir', adminPw); await login(teacher, 'teach1@ss.ir', teacherPw); await login(mgrAdmin, 'madmin@ss.ir', mgrAdminPw);
});
test('P1-03 an owner-admin can NOT create admins (owner-admin, owner, or any role outside its matrix)', async () => {
  for (const role of ['administrator', 'owner']) { const r = await add(admin, { email: `x-${role}@ss.ir`, role }); assert.equal(r.status, 403, role); }
  const ok = await add(admin, { email: 'new-teacher@ss.ir', name: 'م', role: 'subject_teacher' }); assert.equal(ok.status, 201);
});
test('P1-04 gated data needs an approved capability: before → refused, approved → allowed, revoked or expired → refused again', async () => {
  const r0 = await admin('/api/workspace/events'); assert.equal(r0.status, 403); assert.ok(r0.body.failed.includes('approval'));
  const rq = await admin('/api/workspace/approvals/request', { method: 'POST', body: { capability: 'events.read', reason: 'برای بررسی صحت داده' } }); assert.equal(rq.status, 201); assert.equal(rq.body.item.status, 'pending');
  const again = await admin('/api/workspace/approvals/request', { method: 'POST', body: { capability: 'events.read' } }); assert.equal(again.status, 200); assert.equal(again.body.item.id, rq.body.item.id);
  assert.equal((await admin('/api/workspace/approvals/request', { method: 'POST', body: { capability: 'made.up' } })).status, 422);
  assert.equal((await admin('/api/workspace/events')).status, 403, 'pending is not approved');
  assert.equal((await admin(`/api/workspace/approvals/${rq.body.item.id}/decide`, { method: 'POST', body: { decision: 'approve' } })).status, 403, 'an owner-admin can not approve itself');
  const seen = await owner('/api/workspace/approvals'); assert.equal(seen.status, 200); assert.ok(seen.body.items.some(g => g.id === rq.body.item.id && g.status === 'pending'));
  const ok = await owner(`/api/workspace/approvals/${rq.body.item.id}/decide`, { method: 'POST', body: { decision: 'approve', days: 30, note: 'تا پایان ماه' } }); assert.equal(ok.status, 200); assert.ok(ok.body.item.expiresAt);
  assert.equal((await admin('/api/workspace/events')).status, 200);
  assert.equal((await owner(`/api/workspace/approvals/${rq.body.item.id}/decide`, { method: 'POST', body: { decision: 'deny' } })).status, 409, 'a decision is final');
  const rv = await owner(`/api/workspace/approvals/${rq.body.item.id}/revoke`, { method: 'POST', body: {} }); assert.equal(rv.status, 200); assert.equal((await admin('/api/workspace/events')).status, 403);
  // expiry
  const rq2 = await admin('/api/workspace/approvals/request', { method: 'POST', body: { capability: 'events.read' } }); await owner(`/api/workspace/approvals/${rq2.body.item.id}/decide`, { method: 'POST', body: { decision: 'approve', days: 1 } });
  assert.equal((await admin('/api/workspace/events')).status, 200); const g = await h.app.db.get('capability_grants', rq2.body.item.id); await h.app.db.transaction(tx => tx.put('capability_grants', { ...g, expiresAt: '2020-01-01T00:00:00.000Z' }));
  assert.equal((await admin('/api/workspace/events')).status, 403, 'an expired approval does not count');
});
test('P1-05 denied requests stay denied; each owner-admin sees only its own requests; the audit log keeps every decision', async () => {
  const rq = await admin('/api/workspace/approvals/request', { method: 'POST', body: { capability: 'audit.read' } }); const d = await owner(`/api/workspace/approvals/${rq.body.item.id}/decide`, { method: 'POST', body: { decision: 'deny', note: 'فعلاً نه' } }); assert.equal(d.body.item.status, 'denied');
  const mine = await admin('/api/workspace/approvals'); assert.ok(mine.body.items.every(g => g.userId === adminId)); assert.equal(mine.body.canDecide, false);
  assert.equal((await teacher('/api/workspace/approvals')).status, 403);
  const audit = [...Object.values(JSON.parse((await import('node:fs')).readFileSync((await import('node:path')).join(h.dataDir, 'v12', 'audit.json'), 'utf8')))]; const acts = audit.map(a => a.action); for (const a of ['capability-request', 'capability-approved', 'capability-denied', 'capability-revoke']) assert.ok(acts.includes(a), a);
});
test('P1-06 golden tick: granted by the owner or an owner-admin, teachers only, revocable; a teacher can not give it to itself', async () => {
  assert.equal((await teacher('/api/workspace/badges/grant', { method: 'POST', body: { userId: teacherId } })).status, 403);
  assert.equal((await owner('/api/workspace/badges/grant', { method: 'POST', body: { userId: adminId } })).status, 422, 'not a teacher');
  const g = await admin('/api/workspace/badges/grant', { method: 'POST', body: { userId: teacherId, note: 'تأیید مدرک' } }); assert.equal(g.status, 200); assert.equal(g.body.gold, true);
  const list = await owner('/api/workspace/badges'); assert.equal(list.body.items.find(x => x.userId === teacherId).gold, true); assert.ok(list.body.features.some(f => f.id === 'books.write'));
  const rv = await owner('/api/workspace/badges/revoke', { method: 'POST', body: { userId: teacherId } }); assert.equal(rv.body.gold, false); assert.equal((await owner('/api/workspace/badges')).body.items.find(x => x.userId === teacherId).gold, false);
});
test('P1-07 policy: «books.write» needs the golden tick for teachers; managers and the owner do not need it; the owner-admin needs an approval', () => {
  const base = role => ({ user: { id: 'u', status: 'active' }, session: { expiresAt: new Date(Date.now() + 1e6).toISOString(), mfa: true }, assignment: { roleId: role, membershipId: 'm' }, membership: { id: 'm', status: 'active', organizationId: 'o' }, approvals: [], badges: [] });
  const act = (ctx) => authorize(ctx, { action: 'books.write', resource: { organizationId: 'o' } });
  assert.deepEqual(act(base('subject_teacher')).failed, ['badge']); assert.equal(act({ ...base('subject_teacher'), badges: ['gold'] }).allow, true);
  assert.equal(act(base('institute_manager')).allow, true); assert.equal(act(base('school_manager')).allow, true); assert.equal(act({ ...base('owner'), ownedOrgIds: ['o'] }).allow, true);
  assert.deepEqual(act(base('administrator')).failed, ['approval']); assert.equal(act({ ...base('administrator'), approvals: [{ capability: 'books.write', status: 'approved' }] }).allow, true);
  assert.equal(act({ ...base('administrator'), approvals: [{ capability: 'books.write', status: 'approved', expiresAt: '2020-01-01T00:00:00Z' }] }).allow, false);
  assert.equal(act(base('manager_admin')).allow, false); assert.equal(act(base('student')).allow, false);
  for (const r of Object.keys(APPROVAL_GATED)) for (const a of APPROVAL_GATED[r]) assert.ok(can(r, a), `${r} must hold ${a} for the gate to mean something`);
  for (const r of Object.keys(GOLD_GATED)) for (const a of GOLD_GATED[r]) assert.ok(can(r, a), `${r} must hold ${a}`);
});
test('P1-08 the manager-admin is shallow by design: runs classes and people, but no books, no data import, cannot create another manager-admin', async () => {
  assert.ok(can('manager_admin', 'class.write') && can('manager_admin', 'schedule.write') && can('manager_admin', 'org.members.manage'));
  assert.ok(!can('manager_admin', 'books.write') && !can('manager_admin', 'import.run') && !can('manager_admin', 'roles.grant'));
  assert.equal((await add(mgrAdmin, { email: 'another-ma@ss.ir', role: 'manager_admin' })).status, 403);
  assert.equal((await add(mgrAdmin, { email: 'stu1@ss.ir', name: 'دانش‌آموز', role: 'student' })).status, 201);
});
test('P1-09 an owner-admin can not take back an admin role, but can take back a teacher role; nobody revokes the owner', async () => {
  const people = await owner('/api/workspace/people'); const adminRole = people.body.items.find(p => p.id === adminId).roles[0]; const ownerRole = people.body.items.find(p => p.roles.some(r => r.roleId === 'owner')).roles.find(r => r.roleId === 'owner');
  assert.equal((await admin(`/api/workspace/roles/${adminRole.id}/revoke`, { method: 'POST', body: {} })).status, 403); assert.equal((await admin(`/api/workspace/roles/${ownerRole.id}/revoke`, { method: 'POST', body: {} })).status, 403);
  const newT = people.body.items.find(p => p.email === 'new-teacher@ss.ir'); assert.equal((await admin(`/api/workspace/roles/${newT.roles[0].id}/revoke`, { method: 'POST', body: {} })).status, 200);
});
test('P1-10 regression: a normal fresh install keeps the legacy centre bridge open (org-system is not a second tenant)', async () => {
  const orgs0 = await h.app.db.list('organizations'); const st = await owner('/api/admin/status'); assert.equal(st.status, 200, JSON.stringify(st.body) + ' ORGS ' + JSON.stringify(orgs0.map(o => [o.id, o.system, o.kind]))); assert.equal(st.body.authed, true);
  const orgs = await h.app.db.list('organizations'); assert.ok(orgs.some(o => o.kind === 'system'), 'the system org exists'); assert.equal(orgs.filter(o => !o.system && o.kind !== 'system').length, 1);
});
