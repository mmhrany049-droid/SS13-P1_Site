// SS 12 — one identity for everybody: users, organisations, memberships, role assignments, entitlements (report §9.1, §12).
import { randomUUID } from 'node:crypto';
import * as SEC from '@ss/auth/security.mjs';
import { ROLES, isRole, grantable } from '@ss/contracts/roles.mjs';
import { envelope } from '@ss/contracts/events.mjs';
import { tehranDate } from '@ss/domain/dates.mjs';
export const newId = p => `${p}-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
const fa2en = s => String(s ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
export function normPhone(raw) { let d = fa2en(raw).replace(/\D/g, ''); if (d.startsWith('0098')) d = d.slice(2); if (d.startsWith('09')) d = '98' + d.slice(1); if (d.startsWith('9') && d.length === 10) d = '98' + d; return /^989\d{9}$/.test(d) ? d : null; }
export const normIdentity = raw => { const s = String(raw || '').trim(); return s.includes('@') ? { email: SEC.normEmail(s) } : { phone: normPhone(s) }; };
export const pubUser = u => u && ({ id: u.id, name: u.name, email: u.email || null, phone: u.phone || null, status: u.status, timezone: u.timezone || 'Asia/Tehran', mfa: !!u.totp?.enabled, createdAt: u.createdAt });
export async function findUserByIdentity(repo, identity) {
  const k = normIdentity(identity); if (!k.email && !k.phone) return null;
  return (await repo.list('users', k.email ? { email: k.email } : { phone: k.phone }))[0] || null;
}
export async function createUser(tx, { email = null, phone = null, name, password = null, passwordHash = null, legacy = null, actorId = null, source = 'api' }) {
  const id = newId('usr'); const at = new Date().toISOString();
  const u = { id, email: email ? SEC.normEmail(email) : null, phone: phone ? normPhone(phone) : null, name: String(name || '').slice(0, 80), status: 'active', timezone: 'Asia/Tehran', passwordHash: passwordHash || (password ? SEC.hashPw(password) : null), totp: null, createdAt: at, legacy };
  if (u.email && (await tx.list('users', { email: u.email })).length) throw Object.assign(new Error('email-taken'), { status: 409, code: 'email-taken' });
  if (u.phone && (await tx.list('users', { phone: u.phone })).length) throw Object.assign(new Error('phone-taken'), { status: 409, code: 'phone-taken' });
  await tx.insert('users', u);
  await tx.append(envelope({ type: 'identity.user.created', aggregateId: id, actorId, source, payload: { via: legacy ? 'import' : source } }));
  return u;
}
export async function ensureMembership(tx, { organizationId, userId }) {
  const m = (await tx.list('memberships', { organizationId, userId }))[0]; if (m) return m;
  const doc = { id: newId('mem'), organizationId, userId, status: 'active', joinedAt: new Date().toISOString() }; await tx.insert('memberships', doc);
  await tx.append(envelope({ type: 'org.membership.created', aggregateId: doc.id, actorId: null, organizationId, source: 'system', payload: { organizationId, userId } }));
  return doc;
}
/** One person can hold several scoped roles in one organisation — the v11 key (organization_id,user_id,role_id) could not (§14). */
export async function assignRole(tx, { userId, roleId, organizationId = null, scope = {}, grantedBy = null, validUntil = null, source = 'api' }) {
  if (!isRole(roleId)) throw Object.assign(new Error('bad-role'), { status: 422, code: 'invalid-input' });
  const membership = organizationId ? await ensureMembership(tx, { organizationId, userId }) : null;
  const dup = (await tx.list('role_assignments', { userId, roleId })).find(a => !a.revokedAt && a.organizationId === organizationId && JSON.stringify(a.scope || {}) === JSON.stringify(scope || {}));
  if (dup) return dup;
  const a = { id: newId('ra'), userId, roleId, organizationId, membershipId: membership?.id || null, scope: scope || {}, grantedBy, grantedAt: new Date().toISOString(), validUntil, revokedAt: null };
  await tx.insert('role_assignments', a);
  await tx.append(envelope({ type: 'identity.role.assigned', aggregateId: a.id, actorId: grantedBy, organizationId, source, payload: { userId, roleId, organizationId, scope: a.scope } }));
  return a;
}
export async function revokeRole(tx, a, by) {
  await tx.put('role_assignments', { ...a, revokedAt: new Date().toISOString(), revokedBy: by });
  await tx.append(envelope({ type: 'identity.role.revoked', aggregateId: a.id, actorId: by, organizationId: a.organizationId, source: 'api', payload: { userId: a.userId, roleId: a.roleId, organizationId: a.organizationId } }));
}
export async function activeAssignments(repo, userId) {
  const today = tehranDate(); // v12 fix: role validity is a Tehran calendar day, not UTC (S11)
  const list = (await repo.list('role_assignments', { userId })).filter(a => !a.revokedAt && (!a.validUntil || a.validUntil >= today));
  const orgs = Object.fromEntries((await repo.list('organizations')).map(o => [o.id, o]));
  return list.map(a => ({ id: a.id, roleId: a.roleId, label: ROLES[a.roleId]?.fa || a.roleId, surface: ROLES[a.roleId]?.surface || 'today', sensitive: !!ROLES[a.roleId]?.sensitive, organizationId: a.organizationId, organizationName: orgs[a.organizationId]?.name || null, scope: a.scope || {} }));
}
export { grantable };
