// SS 13 — phase 1: capability approvals for owner-admins («ادمین مالک») and the teacher «golden tick» (تیک طلایی).
// Owner-admins cannot create admins; to SEE or CHANGE some data they ask for a capability and the owner approves or denies it
// (revocable at any time, optional expiry). The golden tick is a person-level badge given by the owner or an owner-admin; the actions
// that need it are listed in contracts/roles.mjs (GOLD_GATED) so more features can be attached later in ONE place.
import { ROLES, CAPABILITY_FA, GOLD_FEATURES_FA } from '@ss/contracts/roles.mjs';

const TEACHER_ROLES = ['subject_teacher', 'independent_teacher', 'teacher_admin'];
export function registerApprovals({ route, db, need, bad, audit, newId, pubUser }) {
  const names = async ids => Object.fromEntries((await Promise.all([...new Set(ids)].map(async id => [id, await db.get('users', id)]))).map(([id, u]) => [id, u ? pubUser(u).name || pubUser(u).email : id]));
  const view = (g, who) => ({ id: g.id, userId: g.userId, userName: who[g.userId], capability: g.capability, label: CAPABILITY_FA[g.capability], status: g.status, reason: g.reason, requestedAt: g.requestedAt, decidedBy: g.decidedBy ? who[g.decidedBy] : null, decidedAt: g.decidedAt || null, expiresAt: g.expiresAt || null, note: g.note || null });

  // ---- approvals
  route('GET', '/api/workspace/approvals', async (req, { ctx }) => {
    if (!ctx) bad(401, 'unauthorized'); const owner = ctx.assignment?.roleId === 'owner'; need(ctx, owner ? 'approvals.decide' : 'approvals.request');
    const all = (await db.list('capability_grants')).filter(g => owner || g.userId === ctx.user.id).sort((a, z) => String(z.requestedAt).localeCompare(String(a.requestedAt)));
    const who = await names(all.flatMap(g => [g.userId, g.decidedBy].filter(Boolean)));
    return [200, { items: all.map(g => view(g, who)), capabilities: Object.entries(CAPABILITY_FA).map(([id, label]) => ({ id, label })), canDecide: owner }];
  });
  route('POST', '/api/workspace/approvals/request', async (req, { body, ctx }) => {
    need(ctx, 'approvals.request'); const capability = String(body.capability || ''); if (!CAPABILITY_FA[capability]) bad(422, 'invalid-input', { field: 'capability' });
    const reason = String(body.reason || '').trim().slice(0, 200);
    const out = await db.transaction(async tx => {
      const live = (await tx.list('capability_grants', { userId: ctx.user.id })).find(g => g.capability === capability && ['pending', 'approved'].includes(g.status));
      if (live) return { g: live, created: false };
      const g = { id: newId('cap'), userId: ctx.user.id, capability, status: 'pending', reason, requestedAt: new Date().toISOString() }; await tx.insert('capability_grants', g); await audit(tx, ctx.user.id, 'capability-request', capability); return { g, created: true };
    });
    return [out.created ? 201 : 200, { item: view(out.g, await names([out.g.userId])) }];
  });
  route('POST', '/api/workspace/approvals/:id/decide', async (req, { body, ctx, params }) => {
    need(ctx, 'approvals.decide'); const g = await db.get('capability_grants', params[0]); if (!g) bad(404, 'not-found'); if (g.status !== 'pending') bad(409, 'already-decided');
    const decision = body.decision === 'approve' ? 'approved' : body.decision === 'deny' ? 'denied' : null; if (!decision) bad(422, 'invalid-input', { field: 'decision' });
    const days = body.days == null || body.days === '' ? null : Math.max(1, Math.min(365, Math.trunc(+body.days) || 0)); const now = new Date();
    const upd = { ...g, status: decision, decidedBy: ctx.user.id, decidedAt: now.toISOString(), note: String(body.note || '').slice(0, 200) || null, expiresAt: decision === 'approved' && days ? new Date(now.getTime() + days * 864e5).toISOString() : null };
    await db.transaction(async tx => { await tx.put('capability_grants', upd); await audit(tx, ctx.user.id, 'capability-' + decision, g.capability + ':' + g.userId); });
    return [200, { item: view(upd, await names([upd.userId, ctx.user.id])) }];
  });
  route('POST', '/api/workspace/approvals/:id/revoke', async (req, { ctx, params }) => {
    need(ctx, 'approvals.decide'); const g = await db.get('capability_grants', params[0]); if (!g) bad(404, 'not-found'); if (g.status !== 'approved') bad(409, 'not-approved');
    const upd = { ...g, status: 'revoked', revokedBy: ctx.user.id, revokedAt: new Date().toISOString() }; await db.transaction(async tx => { await tx.put('capability_grants', upd); await audit(tx, ctx.user.id, 'capability-revoke', g.capability + ':' + g.userId); });
    return [200, { item: view(upd, await names([upd.userId])) }];
  });

  // ---- golden tick
  route('GET', '/api/workspace/badges', async (req, { ctx }) => {
    need(ctx, 'badge.grant'); const org = ctx.assignment.organizationId;
    const ras = (await db.list('role_assignments')).filter(a => !a.revokedAt && TEACHER_ROLES.includes(a.roleId) && (ctx.assignment.roleId === 'owner' || ctx.assignment.roleId === 'administrator' || a.organizationId === org));
    const ids = [...new Set(ras.map(a => a.userId))]; const who = await names(ids); const badges = await db.list('teacher_badges');
    return [200, { items: ids.map(id => { const b = badges.find(x => x.userId === id && x.kind === 'gold'); return { userId: id, name: who[id], roles: ras.filter(a => a.userId === id).map(a => ROLES[a.roleId].fa), gold: !!b && b.status === 'active', since: b?.status === 'active' ? b.grantedAt : null }; }), features: Object.entries(GOLD_FEATURES_FA).map(([id, label]) => ({ id, label })) }];
  });
  const setTick = async (ctx, userId, on, note) => {
    need(ctx, 'badge.grant'); const u = await db.get('users', String(userId || '')); if (!u) bad(404, 'not-found');
    const isTeacher = (await db.list('role_assignments', { userId: u.id })).some(a => !a.revokedAt && TEACHER_ROLES.includes(a.roleId)); if (!isTeacher) bad(422, 'invalid-input', { field: 'userId', code: 'not-a-teacher' });
    const prev = (await db.list('teacher_badges', { userId: u.id })).find(b => b.kind === 'gold'); const now = new Date().toISOString();
    const b = on ? { ...(prev || {}), id: prev?.id || newId('bdg'), userId: u.id, kind: 'gold', status: 'active', grantedBy: ctx.user.id, grantedAt: now, note: String(note || '').slice(0, 200) || null, revokedAt: null } : prev && { ...prev, status: 'revoked', revokedBy: ctx.user.id, revokedAt: now };
    if (!b) return { userId: u.id, gold: false };
    await db.transaction(async tx => { await tx.put('teacher_badges', b); await audit(tx, ctx.user.id, on ? 'gold-tick-grant' : 'gold-tick-revoke', u.id); }); return { userId: u.id, gold: on };
  };
  route('POST', '/api/workspace/badges/grant', async (req, { body, ctx }) => [200, await setTick(ctx, body.userId, true, body.note)]);
  route('POST', '/api/workspace/badges/revoke', async (req, { body, ctx }) => [200, await setTick(ctx, body.userId, false)]);
}
