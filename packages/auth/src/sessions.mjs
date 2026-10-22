// SS 12 — sessions (report §9.1, S1/S8). 32-byte random token in an HttpOnly cookie; ONLY sha256(token) is stored.
// Absolute expiry + idle timeout + rotation after login and after every role change + revoke + purge of expired rows.
import { token as rnd, sha } from './security.mjs';
export const COOKIE = 'ss_sid';
export const TTL = { normal: 12 * 3600e3, remember: 30 * 864e5, idleStudent: 7 * 864e5, idleWorkspace: 2 * 3600e3 };
export function sessionService(repo, { now = () => Date.now() } = {}) {
  const iso = t => new Date(t).toISOString();
  async function create(tx, { userId, roleAssignmentId = null, remember = false, ip = '', ua = '', mfa = false }) {
    const t = rnd(32); const id = sha(t); const at = now();
    const doc = { id, userId, roleAssignmentId, createdAt: iso(at), lastSeenAt: iso(at), expiresAt: iso(at + (remember ? TTL.remember : TTL.normal)), revokedAt: null, mfa: !!mfa, ip: String(ip).slice(0, 64), ua: String(ua).slice(0, 160) };
    await tx.put('sessions', doc); return { token: t, session: doc };
  }
  const alive = (s, surface) => { if (!s || s.revokedAt) return false; const t = now(); if (Date.parse(s.expiresAt) <= t) return false; const idle = surface === 'workspace' ? TTL.idleWorkspace : TTL.idleStudent; return t - Date.parse(s.lastSeenAt) <= idle; };
  return {
    create,
    async resolve(rawToken, surfaceOf = () => 'today') {
      if (!rawToken || typeof rawToken !== 'string' || rawToken.length > 200) return null;
      const s = await repo.get('sessions', sha(rawToken)); if (!s) return null;
      if (!alive(s, await surfaceOf(s))) return null;
      if (now() - Date.parse(s.lastSeenAt) > 60e3) await repo.put('sessions', { ...s, lastSeenAt: iso(now()) });
      return s;
    },
    /** Rotation: the old token dies, a new one carries the same user (and the new role). */
    async rotate(tx, old, patch = {}) { await tx.put('sessions', { ...old, revokedAt: iso(now()), revokedWhy: 'rotated' }); return create(tx, { userId: old.userId, remember: Date.parse(old.expiresAt) - Date.parse(old.createdAt) > TTL.normal, ip: old.ip, ua: old.ua, mfa: old.mfa, roleAssignmentId: old.roleAssignmentId, ...patch }); },
    async revoke(tx, s, why = 'logout') { if (s && !s.revokedAt) await tx.put('sessions', { ...s, revokedAt: iso(now()), revokedWhy: why }); },
    async revokeAllForUser(tx, userId, why = 'security') { for (const s of await tx.list('sessions', { userId })) if (!s.revokedAt) await tx.put('sessions', { ...s, revokedAt: iso(now()), revokedWhy: why }); },
    async purge() { const t = now(); let n = 0; await repo.transaction(async tx => { for (const s of await tx.list('sessions')) if (Date.parse(s.expiresAt) < t - 864e5 || (s.revokedAt && Date.parse(s.revokedAt) < t - 7 * 864e5)) { await tx.remove('sessions', s.id); n++; } }); return n; },
  };
}
