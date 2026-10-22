// SS 12 — authorization policy (Blueprint §4, report §14). Deny by default. Hiding a menu is NOT authorization.
// allow = authenticated ∧ account_active ∧ active_session ∧ mfa_ok ∧ role_grant ∧ org_membership ∧ resource_scope
//         ∧ consent_policy ∧ entitlement ∧ approval ∧ badge                                  (eleven factors in v13)
import { can, ROLES, APPROVAL_GATED, GOLD_GATED } from '@ss/contracts/roles.mjs';
/**
 * ctx: { user, session, assignment, membership, entitlements[], consents[] }
 * req: { action: 'perm.name', resource?: { type, ownerId?, organizationId?, classId?, subject?, sensitive? }, feature? }
 */
export function authorize(ctx, req) {
  const f = {};
  f.authenticated = !!ctx?.user;
  f.account_active = f.authenticated && ctx.user.status === 'active';
  f.active_session = !!ctx?.session && !ctx.session.revokedAt && Date.parse(ctx.session.expiresAt) > Date.now();
  const a = ctx?.assignment; const role = a?.roleId;
  f.mfa_ok = !role || !ROLES[role]?.sensitive || !!ctx.session?.mfa;
  f.role_grant = !!a && !a.revokedAt && (!a.validUntil || a.validUntil >= new Date().toISOString().slice(0, 10)) && can(role, req.action);
  // membership: self-only actions need no organisation; everything else needs an ACTIVE membership in the resource's org
  const selfOnly = req.action.startsWith('self.');
  const m = ctx?.membership;
  f.org_membership = selfOnly ? true : !!m && m.status === 'active' && m.id === a?.membershipId && (!req.resource?.organizationId || req.resource.organizationId === m.organizationId || role === 'owner' && (ctx.ownedOrgIds || []).includes(req.resource.organizationId));
  f.resource_scope = inScope(a, req, ctx);
  f.consent_policy = !req.resource?.sensitive || (ctx.consents || []).some(c => c.subjectUserId === req.resource.ownerId && c.granteeUserId === ctx.user?.id && c.scope === req.resource.sensitive && !c.withdrawnAt);
  f.entitlement = !req.feature || (ctx.entitlements || []).some(e => e.featureCode === req.feature && (!e.endsAt || e.endsAt >= new Date().toISOString()));
  // v13: two extra gates. approval = the owner approved this capability for this owner-admin; badge = the teacher holds the golden tick.
  const now = new Date().toISOString();
  f.approval = !APPROVAL_GATED[role]?.includes(req.action) || (ctx.approvals || []).some(g => g.capability === req.action && g.status === 'approved' && (!g.expiresAt || g.expiresAt >= now));
  f.badge = !GOLD_GATED[role]?.includes(req.action) || (ctx.badges || []).includes('gold');
  const failed = Object.entries(f).filter(([, v]) => !v).map(([k]) => k);
  return { allow: failed.length === 0, failed, factors: f };
}
function inScope(a, req, ctx) {
  if (!a) return false; const r = req.resource; if (!r) return true; const sc = a.scope || {};
  if (req.action.startsWith('self.')) return !r.ownerId || r.ownerId === ctx.user?.id;          // students: only their own data (IDOR guard)
  if (r.ownerId && r.ownerId === ctx.user?.id) return true;
  if (sc.classIds?.length && r.classId && !sc.classIds.includes(r.classId)) return false;     // teachers / program managers: their classes only
  if (sc.classIds?.length && !r.classId && r.type === 'student') return (ctx.studentClassIds?.(r.ownerId) || []).some(c => sc.classIds.includes(c));
  if (sc.subjects?.length && r.subject && !sc.subjects.includes(r.subject)) return false;
  if (sc.academicYear && r.academicYear && sc.academicYear !== r.academicYear) return false;
  return true;
}
export const explain = d => d.allow ? 'allowed' : 'denied: ' + d.failed.join(', ');
