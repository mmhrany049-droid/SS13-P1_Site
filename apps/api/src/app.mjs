// SS 12 — the single API. One site, one identity, two experiences (today = student, workspace = organisation).
// Order of every request: safe URL → security headers → CSRF/Origin → rate limit → session → policy → handler,
// wrapped in an error boundary that never leaks stacks or secrets. Legacy v11 hub routes are mounted behind it.
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as SEC from '@ss/auth/security.mjs';
import { sessionService, COOKIE, TTL } from '@ss/auth/sessions.mjs';
import { authorize } from '@ss/auth/policy.mjs';
import { ROLES, PERMISSIONS, grantable, isRole } from '@ss/contracts/roles.mjs';
import { envelope } from '@ss/contracts/events.mjs';
import { check, S } from '@ss/contracts/validate.mjs';
import { flagsFrom } from '@ss/contracts/flags.mjs';
import { openRepository, runMigrations, runCommand } from '@ss/persistence/index.mjs';
import { projectToday, projectOrgToday, rebuildOrgToday, todayView, todayProjector } from '@ss/domain/projections.mjs';
import { tehranDate } from '@ss/domain/dates.mjs';
import * as CS from '@ss/domain/planning/classSchedule.js';
import { createHub } from './legacy/index.mjs';
import { HttpError, bad, parseUrl, sendJson, errorBody, readJson, parseCookies, cookie, csrfOk, originOk, reqId, SEC_HEADERS } from './http.mjs';
import { registerApprovals } from './approvals.mjs';
import { newId, pubUser, findUserByIdentity, createUser, assignRole, revokeRole, activeAssignments } from './identity.mjs';
import { previewImport, applyImport, rollbackImport, publicJob, legacyDataPresent } from './import/legacy.mjs';
import { MIGRATIONS } from '../../../migrations/index.mjs';

export const VERSION = '13.0.0';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

export async function createApp({ dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'), env = process.env, log = console.log, startBot = false, mailTransport = null, webDist = env.WEB_DIST || path.join(ROOT, 'apps', 'web', 'dist'), repo = null } = {}) {
  const flags = flagsFrom(env);
  const requireMfa = env.SS_REQUIRE_MFA !== '0';
  const trustProxy = env.TRUST_PROXY === '1';
  const db = repo || await openRepository({ kind: env.SS_DB || 'json', dataDir });
  await runMigrations(db, MIGRATIONS, { log });
  await rebuildOrgToday(db);
  const sessions = sessionService(db);
  const KEY = SEC.secretKey(dataDir);
  const loginLimit = SEC.limiter({ max: +(env.SS_LOGIN_RATE || 20) }); const writeLimit = SEC.limiter({ max: +(env.SS_WRITE_RATE || 600) });
  const lock = SEC.lockout({ max: 5, lockMs: 15 * 60e3 });
  const corsList = () => String(env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  let setupToken = null;
  if (!(await db.list('users')).length) { setupToken = env.SS_SETUP_TOKEN || SEC.token(12); if (!env.SS_SETUP_TOKEN) log(`\n  راه‌اندازی اولیه: کد یک‌بارمصرف «${setupToken}» (فقط همین‌جا نمایش داده می‌شود)\n`); }

  const audit = async (tx, actorId, action, entity = '', ip = '') => tx.put('audit', { id: newId('aud'), at: new Date().toISOString(), actorId, action, entity: String(entity).slice(0, 200), ip });
  // the v11 hub, now behind the v12 identity
  const hub = createHub({ dataDir, log, startBot, mailTransport, flags: { legacyAdminLogin: flags.legacyAdminLogin, legacyStudentApi: flags.legacyStudentApi },
    resolveAdmin: req => req._ssAdmin || null, resolveStudent: req => req._ssStudent || null });
  await hub.ready;

  const ipOf = req => trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
  const https = req => trustProxy ? req.headers['x-forwarded-proto'] === 'https' : !!req.socket.encrypted || env.SS_COOKIE_SECURE === '1';
  const setSid = (req, t, remember) => ({ 'Set-Cookie': cookie(COOKIE, t, { maxAgeMs: remember ? TTL.remember : TTL.normal, secure: https(req) }) });
  const clearSid = req => ({ 'Set-Cookie': cookie(COOKIE, '', { maxAgeMs: 0, secure: https(req) }) });

  /** Who is calling? → { user, session, assignment, membership, entitlements, consents } or null */
  async function contextOf(req) {
    const t = parseCookies(req.headers.cookie)[COOKIE]; if (!t) return null;
    const s = await sessions.resolve(t, async ss => ss.roleAssignmentId ? ROLES[(await db.get('role_assignments', ss.roleAssignmentId))?.roleId]?.surface : 'today');
    if (!s) return null; const user = await db.get('users', s.userId); if (!user || user.status !== 'active') return null;
    const assignment = s.roleAssignmentId ? await db.get('role_assignments', s.roleAssignmentId) : null;
    const membership = assignment?.membershipId ? await db.get('memberships', assignment.membershipId) : null;
    const entitlements = (await db.list('entitlements', e => e.subjectId === user.id || (membership && e.subjectId === membership.organizationId)));
    const consents = await db.list('consents', { granteeUserId: user.id });
    const ownedOrgIds = assignment?.roleId === 'owner' ? (await db.list('organizations', { ownerUserId: user.id })).map(o => o.id) : [];
    const approvals = (await db.list('capability_grants', { userId: user.id })).filter(g => g.status === 'approved'); const badges = (await db.list('teacher_badges', { userId: user.id })).filter(b => b.status === 'active').map(b => b.kind);
    // v13 fix: with SS_REQUIRE_MFA=0 (demo only) the session counts as second-factor-checked, otherwise management roles were refused by the policy even though login let them in
    return { user, session: requireMfa ? s : { ...s, mfa: true }, assignment: assignment && !assignment.revokedAt ? assignment : null, membership, entitlements, consents, ownedOrgIds, approvals, badges, token: t };
  }
  const need = (ctx, action, resource, feature) => { if (!ctx) bad(401, 'unauthorized'); if (!ctx.assignment) bad(403, 'no-active-role'); const d = authorize(ctx, { action, resource, feature }); if (!d.allow) bad(403, 'forbidden', { failed: d.failed }); return d; };
  const sessionView = async ctx => ({ authenticated: true, user: pubUser(ctx.user), roleAssignments: await activeAssignments(db, ctx.user.id), activeRole: ctx.assignment ? { id: ctx.assignment.id, roleId: ctx.assignment.roleId, label: ROLES[ctx.assignment.roleId].fa, surface: ROLES[ctx.assignment.roleId].surface, organizationId: ctx.assignment.organizationId } : null, mfaRequired: requireMfa, demo: env.SS_DEMO === '1' });
  const nextOf = role => ROLES[role]?.surface === 'workspace' ? '/workspace' : '/today';

  async function activateRole(req, ctx, a, code) {
    if (!a || a.userId !== ctx.user.id || a.revokedAt || (a.validUntil && a.validUntil < tehranDate())) bad(404, 'role-not-found');
    let mfa = ctx.session.mfa;
    if (ROLES[a.roleId].sensitive && requireMfa && !mfa) {
      if (!ctx.user.totp?.enabled) bad(403, 'mfa-setup-required');
      if (!code) bad(401, 'totp-required');
      if (!SEC.totpCheck(SEC.unseal(KEY, ctx.user.totp.secretBox), code)) { lock.fail('u:' + ctx.user.id); bad(401, 'bad-code'); }
      mfa = true;
    }
    return db.transaction(async tx => { const n = await sessions.rotate(tx, ctx.session, { roleAssignmentId: a.id, mfa }); await audit(tx, ctx.user.id, 'role-activate', a.roleId, ipOf(req)); return n; });
  }

  // ------------------------------------------------------------------ routes
  const R = []; const route = (method, pattern, fn, opts = {}) => R.push({ method, re: typeof pattern === 'string' ? new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, '([a-zA-Z0-9_-]+)') + '$') : pattern, fn, opts });

  route('GET', '/api/health', async () => [200, { ok: true, version: VERSION, db: db.kind, time: new Date().toISOString(), today: tehranDate(), timeZone: 'Asia/Tehran', flags: { onlineExam: flags.onlineExam, onlineAI: flags.onlineAI } }]);
  route('GET', '/api/setup/status', async () => [200, { needsSetup: !(await db.list('users')).length, legacyData: legacyDataPresent(dataDir), version: VERSION }]);
  route('POST', '/api/setup', async (req, { body }) => {
    if ((await db.list('users')).length) bad(409, 'already-setup');
    if (!setupToken || body.setupToken !== setupToken) bad(403, 'forbidden', { field: 'setupToken' });
    const { setupToken: _t, ...rest } = body; const v = check(S.setup, rest); if (!v.ok) bad(422, v.error, v);
    const email = SEC.normEmail(v.value.email); if (!email) bad(422, 'invalid-input', { field: 'email' });
    const prob = SEC.pwProblem(v.value.password, { email, min: 10 }); if (prob) bad(422, 'weak-password', { detail: prob });
    const out = await db.transaction(async tx => {
      const u = await createUser(tx, { email, name: v.value.name || 'مالک', password: v.value.password, source: 'web' });
      const org = { id: newId('org'), kind: 'institute', name: v.value.orgName || 'مرکز SS', ownerUserId: u.id, createdAt: new Date().toISOString() }; await tx.insert('organizations', org);
      const a = await assignRole(tx, { userId: u.id, roleId: 'owner', organizationId: org.id, grantedBy: u.id, source: 'web' });
      await audit(tx, u.id, 'setup', org.name, ipOf(req)); return { user: pubUser(u), organization: org, assignment: a };
    });
    setupToken = null; return [201, out];
  });

  // ---- single login (report §13.1) ----
  route('POST', '/api/auth/login', async (req, { body, ip }) => {
    const v = check(S.login, body); if (!v.ok) bad(422, v.error, v);
    if (loginLimit('ip:' + ip)) bad(429, 'rate-limited');
    const key = 'id:' + String(v.value.identity).toLowerCase(); const left = lock.locked(key); if (left) bad(423, 'locked', { minutes: left });
    const u = await findUserByIdentity(db, v.value.identity);
    const ok = SEC.checkPw(v.value.password, u?.passwordHash); // runs scrypt even for unknown users (similar timing)
    if (!u || !ok || u.status !== 'active') { lock.fail(key); await db.transaction(tx => audit(tx, u?.id || null, 'login-failed', String(v.value.identity).slice(0, 60), ip)); bad(401, 'wrong-login'); }
    let mfa = false;
    if (u.totp?.enabled) { if (!v.value.code) bad(401, 'totp-required'); if (!SEC.totpCheck(SEC.unseal(KEY, u.totp.secretBox), v.value.code)) { lock.fail(key); bad(401, 'bad-code'); } mfa = true; }
    lock.ok(key);
    const roles = await activeAssignments(db, u.id);
    const auto = roles.length === 1 && (!roles[0].sensitive || !requireMfa || mfa) ? roles[0] : null;
    const { token } = await db.transaction(async tx => { const r = await sessions.create(tx, { userId: u.id, roleAssignmentId: auto?.id || null, remember: !!v.value.remember, ip, ua: req.headers['user-agent'], mfa });
      await tx.append(envelope({ type: 'identity.session.created', aggregateId: r.session.id.slice(0, 24), actorId: u.id, source: 'web', payload: { role: auto?.roleId || null } })); await audit(tx, u.id, 'login', '', ip); await tx.put('users', { ...(await tx.get('users', u.id)), lastLoginAt: new Date().toISOString() }); return r; });
    return [200, { user: pubUser(u), roleAssignments: roles, activeRole: auto ? auto.roleId : null, next: auto ? nextOf(auto.roleId) : '/choose-role' }, setSid(req, token, v.value.remember)];
  });
  route('POST', '/api/auth/role', async (req, { body, ctx }) => {
    if (!ctx) bad(401, 'unauthorized'); const v = check(S.role, body); if (!v.ok) bad(422, v.error, v);
    const a = await db.get('role_assignments', v.value.roleAssignmentId); const n = await activateRole(req, ctx, a, v.value.code);
    return [200, { activeRole: a.roleId, next: nextOf(a.roleId) }, setSid(req, n.token)];
  });
  route('POST', '/api/auth/logout', async (req, { ctx }) => { if (ctx) await db.transaction(async tx => { await sessions.revoke(tx, ctx.session); await tx.append(envelope({ type: 'identity.session.revoked', aggregateId: ctx.session.id.slice(0, 24), actorId: ctx.user.id, source: 'web', payload: { why: 'logout' } })); }); return [200, { ok: true }, clearSid(req)]; });
  route('GET', '/api/auth/session', async (req, { ctx }) => ctx ? [200, await sessionView(ctx)] : [200, { authenticated: false, needsSetup: !(await db.list('users')).length, demo: env.SS_DEMO === '1' }]);
  route('GET', '/api/me', async (req, { ctx }) => {
    if (!ctx) bad(401, 'unauthorized');
    const memberships = await db.list('memberships', { userId: ctx.user.id }); const orgs = Object.fromEntries((await db.list('organizations')).map(o => [o.id, o]));
    return [200, { user: pubUser(ctx.user), memberships: memberships.map(m => ({ ...m, organizationName: orgs[m.organizationId]?.name })), grants: await activeAssignments(db, ctx.user.id), activeRole: ctx.assignment?.roleId || null, entitlements: ctx.entitlements }];
  });
  route('POST', '/api/auth/password', async (req, { body, ctx }) => {
    if (!ctx) bad(401, 'unauthorized'); if (ctx.user.passwordHash && !SEC.checkPw(body.old, ctx.user.passwordHash)) bad(401, 'wrong-login');
    const prob = SEC.pwProblem(body.password, { email: ctx.user.email || '', name: ctx.user.name }); if (prob) bad(422, 'weak-password', { detail: prob });
    await db.transaction(async tx => { await tx.put('users', { ...ctx.user, passwordHash: SEC.hashPw(body.password), needsPassword: false }); for (const s of await tx.list('sessions', { userId: ctx.user.id })) if (s.id !== ctx.session.id && !s.revokedAt) await sessions.revoke(tx, s, 'password-changed'); await audit(tx, ctx.user.id, 'password-change'); });
    return [200, { ok: true }];
  });
  route('POST', '/api/auth/mfa/setup', async (req, { ctx }) => { if (!ctx) bad(401, 'unauthorized'); const secret = SEC.newTotpSecret(); await db.put('users', { ...ctx.user, totpPending: SEC.seal(KEY, secret) }); return [200, { secret, url: SEC.otpauthUrl(secret, ctx.user.email || ctx.user.phone || ctx.user.id, 'SS') }]; });
  route('POST', '/api/auth/mfa/enable', async (req, { body, ctx }) => {
    if (!ctx) bad(401, 'unauthorized'); const sec = SEC.unseal(KEY, ctx.user.totpPending); if (!sec || !SEC.totpCheck(sec, body.code)) bad(422, 'bad-code');
    await db.transaction(async tx => { await tx.put('users', { ...ctx.user, totp: { secretBox: SEC.seal(KEY, sec), enabled: true, at: new Date().toISOString() }, totpPending: null }); await tx.put('sessions', { ...ctx.session, mfa: true }); await audit(tx, ctx.user.id, '2fa-on'); });
    return [200, { ok: true }];
  });
  route('GET', '/api/auth/sessions', async (req, { ctx }) => { if (!ctx) bad(401, 'unauthorized'); const list = (await db.list('sessions', { userId: ctx.user.id })).filter(s => !s.revokedAt && Date.parse(s.expiresAt) > Date.now()); return [200, { items: list.map(s => ({ id: s.id.slice(0, 12), current: s.id === ctx.session.id, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, ip: s.ip, ua: s.ua })) }]; });
  route('POST', '/api/auth/sessions/revoke-others', async (req, { ctx }) => { if (!ctx) bad(401, 'unauthorized'); await db.transaction(async tx => { for (const s of await tx.list('sessions', { userId: ctx.user.id })) if (s.id !== ctx.session.id) await sessions.revoke(tx, s, 'user-revoked'); }); return [200, { ok: true }]; });

  // ---- student daily loop (B) ----
  route('GET', '/api/today', async (req, { ctx }) => { need(ctx, 'self.read', { type: 'today', ownerId: ctx?.user.id }); const docs = await db.list('proj_today', { userId: ctx.user.id }); return [200, todayView(docs, ctx.user.id)]; });
  route('GET', '/api/study/sessions', async (req, { ctx }) => { need(ctx, 'self.read', { ownerId: ctx?.user.id }); const ev = (await db.list('events', e => e.type === 'study.session.logged' && e.aggregateId.startsWith(ctx.user.id + '/'))).sort((a, b) => b.seq - a.seq).slice(0, 100); return [200, { items: ev.map(e => ({ id: e.aggregateId.split('/')[1], at: e.payload.at || e.occurredAt, ...e.payload, seq: e.seq })) }]; });
  route('POST', '/api/study/sessions', async (req, { body, ctx }) => {
    need(ctx, 'self.study.write', { ownerId: ctx?.user.id });
    const key = String(req.headers['idempotency-key'] || ''); if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(key)) bad(400, 'idempotency-key-required');
    const v = check(S.studySession, body); if (!v.ok) bad(422, v.error, { field: v.field, code: v.code });
    if ((v.value.correct || 0) + (v.value.wrong || 0) > v.value.tests) bad(422, 'invalid-input', { field: 'correct', code: 'more-than-tests' });
    if (v.value.at && Date.parse(v.value.at) > Date.now() + 5 * 60e3) bad(422, 'invalid-input', { field: 'at', code: 'in-future' });
    const localId = v.value.localId || newId('ses');
    const r = await runCommand(db, { userId: ctx.user.id, key, body: v.value,
      events: [envelope({ type: 'study.session.logged', aggregateId: `${ctx.user.id}/${localId}`, actorId: ctx.user.id, organizationId: ctx.assignment?.organizationId || null, source: req.headers['x-ss-source'] === 'offline-queue' ? 'offline-queue' : 'web', payload: { ...v.value, localId, organizationId: ctx.assignment?.organizationId || null, at: v.value.at || new Date().toISOString() } })],
      project: async (tx, event) => { await projectToday(tx, event); await projectOrgToday(tx, event); },
      respond: async (stored, tx) => ({ id: localId, seq: stored[0].seq, today: todayView(await tx.list('proj_today', { userId: ctx.user.id }), ctx.user.id).today }) });
    return [r.replayed ? 200 : 201, r];
  });
  route('GET', '/api/schedule', async (req, { ctx }) => { need(ctx, 'self.read', { ownerId: ctx?.user.id }); const orgId = ctx.assignment.organizationId; const list = orgId ? (await db.list('schedule_versions', { organizationId: orgId, status: 'published' })) : []; return [200, { items: list }]; });
  route('GET', '/api/exams/online', async (req, { ctx }) => { if (!flags.onlineExam) bad(403, 'feature-disabled', { gates: 'docs/EXAM_SPEC.md §gates' }); need(ctx, 'self.exam.take'); return [200, { items: [] }]; });

  // ---- workspace (A3 scope, D seeds) ----
  const orgScope = ctx => ctx.assignment?.organizationId;
  const eventOrg = e => e.organizationId || e.payload?.organizationId || null;
  const uniqueStudentOrgs = async () => {
    const grouped = new Map();
    for (const a of await db.list('role_assignments', { roleId: 'student' })) {
      if (a.revokedAt || !a.organizationId) continue;
      const m = a.membershipId ? await db.get('memberships', a.membershipId) : null;
      if (m?.status !== 'active') continue;
      const ids = grouped.get(a.userId) || new Set(); ids.add(a.organizationId); grouped.set(a.userId, ids);
    }
    return new Map([...grouped].filter(([, ids]) => ids.size === 1).map(([id, ids]) => [id, [...ids][0]]));
  };
  const scopedEvent = (e, org, inferred) => {
    const explicit = eventOrg(e);
    if (explicit) return explicit === org;
    return e.type === 'study.session.logged' && inferred.get(e.aggregateId.split('/')[0]) === org;
  };
  route('GET', '/api/workspace/overview', async (req, { ctx }) => {
    need(ctx, 'org.read', { organizationId: orgScope(ctx) }); const org = await db.get('organizations', orgScope(ctx)); const mem = await db.list('memberships', { organizationId: org?.id, status: 'active' });
    const ras = (await db.list('role_assignments', { organizationId: org?.id })).filter(a => !a.revokedAt);
    return [200, { organization: org, members: mem.length, students: ras.filter(a => a.roleId === 'student').length, staff: ras.filter(a => a.roleId !== 'student').length, imports: (await db.list('import_jobs', { organizationId: org?.id })).length }];
  });
  registerApprovals({ route, db, need, bad, audit, newId, pubUser }); // v13 phase 1
  route('GET', '/api/workspace/people', async (req, { ctx }) => {
    need(ctx, 'org.members.manage', { organizationId: orgScope(ctx) });
    const org = orgScope(ctx); const ras = (await db.list('role_assignments', { organizationId: org })).filter(a => !a.revokedAt); const ids = [...new Set(ras.map(a => a.userId))];
    const users = (await Promise.all(ids.map(id => db.get('users', id)))).filter(Boolean);
    return [200, { items: users.map(u => ({ ...pubUser(u), needsPassword: !!u.needsPassword, roles: ras.filter(a => a.userId === u.id).map(a => ({ id: a.id, roleId: a.roleId, label: ROLES[a.roleId].fa, scope: a.scope })) })), grantable: grantable(ctx.assignment.roleId).map(r => ({ id: r, label: ROLES[r].fa })) }];
  });
  route('POST', '/api/workspace/people', async (req, { body, ctx }) => {
    need(ctx, 'org.members.manage', { organizationId: orgScope(ctx) });
    const role = String(body.role || ''); if (!isRole(role) || !grantable(ctx.assignment.roleId).includes(role)) bad(403, 'forbidden', { field: 'role' });
    const email = SEC.normEmail(body.email); if (!email && !body.phone) bad(422, 'invalid-input', { field: 'email' });
    const temp = 'Ss' + SEC.token(9).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + '7';
    const out = await db.transaction(async tx => {
      let u = email ? (await tx.list('users', { email }))[0] : null; let created = false;
      if (!u) { created = true; u = await createUser(tx, { email, phone: body.phone, name: String(body.name || email || '').slice(0, 80), password: temp, actorId: ctx.user.id, source: 'web' }); await tx.put('users', { ...u, needsPassword: true }); }
      const a = await assignRole(tx, { userId: u.id, roleId: role, organizationId: orgScope(ctx), scope: { classIds: splitList(body.classIds), subjects: splitList(body.subjects) }, grantedBy: ctx.user.id, source: 'web' });
      await audit(tx, ctx.user.id, 'role-grant', `${u.id} ${role}`, ''); return { user: pubUser(u), assignment: a, tempPassword: created ? temp : null, existing: !created }; // v12 fix: never hand out a «temp password» that was not set
    });
    return [201, out];
  });
  route('POST', '/api/workspace/roles/:id/revoke', async (req, { ctx, params }) => {
    need(ctx, 'org.members.manage', { organizationId: orgScope(ctx) }); const a = await db.get('role_assignments', params[0]);
    if (!a || a.organizationId !== orgScope(ctx)) bad(404, 'not-found'); if (a.roleId === 'owner' || !grantable(ctx.assignment.roleId).includes(a.roleId)) bad(403, 'forbidden'); // v13: you can only take back a role you could hand out
    await db.transaction(async tx => { await revokeRole(tx, a, ctx.user.id); for (const s of await tx.list('sessions', { roleAssignmentId: a.id })) await sessions.revoke(tx, s, 'role-revoked'); await audit(tx, ctx.user.id, 'role-revoke', a.id); }); return [200, { ok: true }];
  });
  route('GET', '/api/workspace/students/:id/today', async (req, { ctx, params }) => {
    if (!ctx) bad(401, 'unauthorized');
    const target = params[0]; const org = orgScope(ctx);
    const sa = (await db.list('role_assignments', { userId: target, roleId: 'student', organizationId: org })).filter(a => !a.revokedAt);
    if (!sa.length) bad(403, 'forbidden', { failed: ['org_membership', 'resource_scope'] });
    const classIdsOf = () => sa.flatMap(a => a.scope?.classIds || []);
    const d = authorize({ ...ctx, studentClassIds: classIdsOf }, { action: 'student.progress.read', resource: { type: 'student', ownerId: target, organizationId: org } });
    const d2 = d.allow ? d : authorize({ ...ctx, studentClassIds: classIdsOf }, { action: 'reports.read', resource: { type: 'student', ownerId: target, organizationId: org } });
    if (!d2.allow) bad(403, 'forbidden', { failed: d2.failed }); // IDOR guard: another org's student is never readable
    return [200, todayView(await db.list('org_today', { organizationId: org, userId: target }), target)];
  });
  route('GET', '/api/workspace/progress', async (req, { ctx, url }) => {
    const organizationId = orgScope(ctx);
    if (!organizationId) bad(403, 'forbidden');
    const action = ['student.progress.read', 'reports.read'].find(a => PERMISSIONS[ctx?.assignment?.roleId]?.includes(a));
    if (!action) bad(403, 'forbidden');
    need(ctx, action, { organizationId });
    const classId = url.searchParams.get('classId') || null;
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 100));
    const studentRoles = (await db.list('role_assignments', { organizationId, roleId: 'student' })).filter(a => !a.revokedAt);
    const byUser = new Map();
    for (const a of studentRoles) {
      const m = await db.get('memberships', a.membershipId);
      if (m?.status !== 'active') continue;
      const row = byUser.get(a.userId) || { classIds: new Set() };
      for (const id of a.scope?.classIds || []) row.classIds.add(id);
      byUser.set(a.userId, row);
    }
    const allOrgDocs = await db.list('org_today', { organizationId });
    const items = [];
    for (const [userId, scope] of byUser) {
      if (classId && !scope.classIds.has(classId)) continue;
      const user = await db.get('users', userId);
      if (!user || user.status !== 'active') continue;
      const decision = authorize({ ...ctx, studentClassIds: () => [...scope.classIds] }, {
        action, resource: { type: 'student', ownerId: userId, organizationId, ...(classId ? { classId } : {}) },
      });
      if (!decision.allow) continue;
      const docs = allOrgDocs.filter(d => d.userId === userId);
      const records = await db.list('integration_records', { organizationId, ownerId: userId, status: 'active' });
      items.push({
        user: { id: user.id, name: user.name, email: user.email || null },
        classIds: [...scope.classIds],
        progress: todayView(docs, userId),
        sharedData: [...new Set(records.map(r => r.kind))],
      });
      if (items.length >= limit) break;
    }
    return [200, { organizationId, items }];
  });
  route('GET', '/api/workspace/progress/:id', async (req, { ctx, params }) => {
    const organizationId = orgScope(ctx); const userId = params[0];
    const action = ['student.progress.read', 'reports.read'].find(a => PERMISSIONS[ctx?.assignment?.roleId]?.includes(a));
    if (!organizationId || !action) bad(403, 'forbidden');
    const assignments = (await db.list('role_assignments', { organizationId, userId, roleId: 'student' })).filter(a => !a.revokedAt);
    if (!assignments.length) bad(404, 'not-found');
    const classIds = [...new Set(assignments.flatMap(a => a.scope?.classIds || []))];
    const decision = authorize({ ...ctx, studentClassIds: () => classIds }, { action, resource: { type: 'student', ownerId: userId, organizationId } });
    if (!decision.allow) bad(403, 'forbidden', { failed: decision.failed });
    const user = await db.get('users', userId); if (!user || user.status !== 'active') bad(404, 'not-found');
    const sharedData = (await db.list('integration_records', { organizationId, ownerId: userId, status: 'active' }))
      .filter(r => r.kind !== 'full_state')
      .map(({ id, kind, body, createdAt, sourceJobId }) => ({ id, kind, body, createdAt, sourceJobId }));
    return [200, { user: { id: user.id, name: user.name, email: user.email || null }, classIds, progress: todayView(await db.list('org_today', { organizationId, userId }), userId), sharedData }];
  });
  route('GET', '/api/workspace/events', async (req, { ctx, url }) => {
    need(ctx, 'events.read', { organizationId: orgScope(ctx) });
    const org = orgScope(ctx); const n = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 100));
    const inferred = await uniqueStudentOrgs();
    const ev = (await db.list('events')).filter(e => scopedEvent(e, org, inferred)).sort((a, b) => b.seq - a.seq).slice(0, n);
    return [200, { items: ev.map(({ payload, ...e }) => ({ ...e, payloadKeys: Object.keys(payload || {}) })) }];
  });
  route('GET', '/api/workspace/events/verify', async (req, { ctx }) => { need(ctx, 'events.read', { organizationId: orgScope(ctx) }); return [200, await verifyProjections(orgScope(ctx))]; });
  // imports (A6)
  route('GET', '/api/workspace/imports', async (req, { ctx }) => { need(ctx, 'import.run', { organizationId: orgScope(ctx) }); return [200, { items: (await db.list('import_jobs', { organizationId: orgScope(ctx) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicJob), legacyData: legacyDataPresent(dataDir) }]; });
  route('POST', '/api/workspace/imports', async (req, { body, ctx }) => {
    need(ctx, 'import.run', { organizationId: orgScope(ctx) });
    const input = body.source === 'server-data' ? { kind: 'server-data', dir: dataDir } : { kind: 'file', content: body.content };
    const r = await previewImport(db, input, { actorId: ctx.user.id, organizationId: orgScope(ctx) }); if (!r.ok) bad(422, 'unknown-format', { reason: r.reason }); return [201, r.job];
  });
  route('POST', '/api/workspace/imports/:id/apply', async (req, { ctx, params }) => { need(ctx, 'import.run', { organizationId: orgScope(ctx) }); const job = await db.get('import_jobs', params[0]); if (!job || job.organizationId !== orgScope(ctx)) bad(404, 'import-not-found'); const org = await db.get('organizations', orgScope(ctx)); return [200, await applyImport(db, params[0], { actorId: ctx.user.id, orgName: org?.name, secretKey: KEY })]; });
  route('POST', '/api/workspace/imports/:id/rollback', async (req, { ctx, params }) => { need(ctx, 'import.run', { organizationId: orgScope(ctx) }); const job = await db.get('import_jobs', params[0]); if (!job || job.organizationId !== orgScope(ctx)) bad(404, 'import-not-found'); return [200, await rollbackImport(db, params[0], { actorId: ctx.user.id })]; });
  // a student imports their own old device data (DATA_VERSION 8/9) into the server history
  route('POST', '/api/study/import', async (req, { body, ctx }) => {
    need(ctx, 'self.study.write', { ownerId: ctx?.user.id });
    if (body.jobId) { const j = await db.get('import_jobs', body.jobId); if (!j || j.requester !== ctx.user.id) bad(404, 'import-not-found'); return [200, body.rollback ? await rollbackImport(db, j.id, { actorId: ctx.user.id }) : await applyImport(db, j.id, { actorId: ctx.user.id })]; }
    const r = await previewImport(db, { kind: 'file', content: body.content }, { actorId: ctx.user.id, requester: ctx.user.id, organizationId: orgScope(ctx) }); if (!r.ok) bad(422, 'unknown-format', { reason: r.reason });
    if (!r.job.kind.startsWith('student-state')) bad(403, 'forbidden'); return [201, r.job];
  }, { bodyLimit: 8 * 1024 * 1024 });
  // class schedule (C1)
  route('GET', '/api/workspace/schedules', async (req, { ctx }) => { need(ctx, 'class.read', { organizationId: orgScope(ctx) }); return [200, { items: await db.list('schedule_versions', { organizationId: orgScope(ctx) }), slotTypes: CS.SLOT_TYPES }]; });
  route('POST', '/api/workspace/schedules', async (req, { body, ctx }) => {
    need(ctx, 'schedule.write', { organizationId: orgScope(ctx) });
    const base = { id: newId('sch'), organizationId: orgScope(ctx), grade: +body.grade || null, stream: String(body.stream || '').slice(0, 20), academicYear: String(body.academicYear || '').slice(0, 9), version: 1, status: 'draft', bells: body.bells || [], days: body.days || {}, createdBy: ctx.user.id, createdAt: new Date().toISOString() };
    const prev = (await db.list('schedule_versions', { organizationId: base.organizationId, grade: base.grade, stream: base.stream, academicYear: base.academicYear })).sort((a, b) => b.version - a.version)[0];
    if (prev) { if (prev.status === 'draft') bad(409, 'import-state', { reason: 'draft-exists', id: prev.id }); base.version = prev.version + 1; }
    const errors = CS.validateVersion(base); await db.put('schedule_versions', { ...base, errors }); return [201, { ...base, errors }];
  });
  route('POST', '/api/workspace/schedules/:id', async (req, { body, ctx, params }) => {
    need(ctx, 'schedule.write', { organizationId: orgScope(ctx) }); const v = await db.get('schedule_versions', params[0]); if (!v || v.organizationId !== orgScope(ctx)) bad(404, 'not-found');
    if (v.status !== 'draft') bad(409, 'import-state', { reason: 'published-is-immutable' });
    const next = { ...v, bells: body.bells ?? v.bells, days: body.days ?? v.days }; next.errors = CS.validateVersion(next); await db.put('schedule_versions', next); return [200, next];
  });
  route('POST', '/api/workspace/schedules/:id/publish', async (req, { ctx, params }) => {
    need(ctx, 'schedule.write', { organizationId: orgScope(ctx) }); const v = await db.get('schedule_versions', params[0]); if (!v || v.organizationId !== orgScope(ctx)) bad(404, 'not-found');
    if (v.status !== 'draft') bad(409, 'import-state'); const r = CS.publish(v, ctx.user.id); if (!r.ok) bad(422, 'invalid-input', { errors: r.errors });
    await db.transaction(async tx => { for (const o of await tx.list('schedule_versions', { organizationId: v.organizationId, grade: v.grade, stream: v.stream, academicYear: v.academicYear, status: 'published' })) await tx.put('schedule_versions', { ...o, status: 'superseded' }); await tx.put('schedule_versions', r.version); await audit(tx, ctx.user.id, 'schedule-publish', v.id); });
    return [200, r.version];
  });

  // ---- legacy admin pages on the unified identity: account + team endpoints are answered by v12 ----
  const legacyPub = (u, a) => ({ id: u.id, email: u.email, name: u.name, role: ROLES[a.roleId]?.legacy || 'teacher', roleFa: ROLES[a.roleId]?.fa, totp: !!u.totp?.enabled, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null, disabled: u.status !== 'active', mustChange: !!u.needsPassword, legacy: false });
  route('GET', '/api/admin/admins', async (req, { ctx }) => {
    need(ctx, 'org.members.manage', { organizationId: orgScope(ctx) }); const ras = (await db.list('role_assignments', { organizationId: orgScope(ctx) })).filter(a => !a.revokedAt && a.roleId !== 'student');
    const items = []; for (const a of ras) { const u = await db.get('users', a.userId); if (u) items.push({ ...legacyPub(u, a), id: a.id }); }
    return [200, { items, roles: { owner: 'مالک', manager: 'مدیر', teacher: 'دبیر / مشاور' } }];
  });
  route('POST', '/api/admin/logout', async (req, { ctx }) => { if (ctx) await db.transaction(tx => sessions.revoke(tx, ctx.session)); return [200, { ok: true }, clearSid(req)]; });
  const fnOf = (m, p) => R.find(r => r.method === m && r.re.test(p)).fn;
  route('POST', '/api/admin/me/password', async (req, x) => fnOf('POST', '/api/auth/password')(req, x));
  route('POST', '/api/admin/me/totp/setup', async (req, x) => fnOf('POST', '/api/auth/mfa/setup')(req, x));
  route('POST', '/api/admin/me/totp/enable', async (req, x) => fnOf('POST', '/api/auth/mfa/enable')(req, x));
  route('POST', '/api/admin/me/totp/disable', async () => bad(403, 'forbidden', { reason: 'MFA is mandatory for workspace roles in SS 12' }));
  route('GET', '/api/admin/me/sessions', async (req, x) => fnOf('GET', '/api/auth/sessions')(req, x));
  route('POST', '/api/admin/me/sessions/revoke', async (req, x) => fnOf('POST', '/api/auth/sessions/revoke-others')(req, x));
  route('POST', '/api/admin/me/profile', async (req, { body, ctx }) => { if (!ctx) bad(401, 'unauthorized'); const patch = {}; if (body.name) patch.name = String(body.name).slice(0, 80); if (body.email !== undefined) { const e = SEC.normEmail(body.email); if (!e) bad(422, 'invalid-input', { field: 'email' }); if ((await db.list('users', { email: e })).some(u => u.id !== ctx.user.id)) bad(409, 'email-taken'); patch.email = e; } await db.put('users', { ...ctx.user, ...patch }); return [200, { ok: true }]; });
  const LEGACY_TO_V12 = { manager: 'institute_manager', teacher: 'subject_teacher' };
  route('POST', '/api/admin/admins', async (req, x) => { const role = LEGACY_TO_V12[x.body.role]; if (!role) bad(422, 'invalid-input', { field: 'role' }); const [st, out] = await fnOf('POST', '/api/workspace/people')(req, { ...x, body: { email: x.body.email, name: x.body.name, role } }); return [st, { id: out.assignment.id, tempPassword: out.tempPassword, mailed: false }]; });
  route('POST', /^\/api\/admin\/admins\/([a-zA-Z0-9_-]+)\/(role|disable|enable|delete)$/, async (req, { body, ctx, params }) => {
    need(ctx, 'org.members.manage', { organizationId: orgScope(ctx) }); const [id, act] = params; const a = await db.get('role_assignments', id);
    if (!a || a.organizationId !== orgScope(ctx)) bad(404, 'not-found'); if (a.roleId === 'owner') bad(403, 'forbidden');
    await db.transaction(async tx => {
      if (act === 'role') { const role = LEGACY_TO_V12[body.role]; if (!role) bad(422, 'invalid-input'); await revokeRole(tx, a, ctx.user.id); await assignRole(tx, { userId: a.userId, roleId: role, organizationId: a.organizationId, scope: a.scope, grantedBy: ctx.user.id }); }
      if (act === 'disable' || act === 'delete') { await revokeRole(tx, a, ctx.user.id); }
      for (const s of await tx.list('sessions', { roleAssignmentId: a.id })) await sessions.revoke(tx, s, 'role-changed'); await audit(tx, ctx.user.id, 'admin-' + act, a.id);
    }); return [200, { ok: true }];
  });

  // ------------------------------------------------------------------ projections check (A5)
  async function verifyProjections(organizationId = null) {
    const rolled = new Set((await db.list('import_jobs', { status: 'rolled_back' })).map(j => j.id));
    const inferred = organizationId ? await uniqueStudentOrgs() : new Map();
    const events = (await db.list('events', e => e.type === 'study.session.logged' && !rolled.has(e.payload?.importJobId))).filter(e => !organizationId || scopedEvent(e, organizationId, inferred)).sort((a, b) => a.seq - b.seq);
    let st = todayProjector.init(); for (const e of events) st = todayProjector.apply(st, e);
    const rebuilt = todayProjector.docs(st).map(({ lastSeq, ...d }) => organizationId ? { ...d, id: `${organizationId}:${d.userId}:${d.date}`, organizationId } : d);
    const live = (await db.list(organizationId ? 'org_today' : 'proj_today', organizationId ? { organizationId } : undefined)).sort((a, b) => a.id.localeCompare(b.id)).map(({ lastSeq, ...d }) => d);
    const same = JSON.stringify(rebuilt) === JSON.stringify(live);
    const keys = (await db.list('events')).filter(e => e.idempotencyKey && e.source !== 'import' && (!organizationId || scopedEvent(e, organizationId, inferred))).map(e => e.actorId + ':' + e.idempotencyKey);
    return { ok: same && keys.length === new Set(keys).size, projectionMatchesReplay: same, events: events.length, duplicates: keys.length - new Set(keys).size };
  }

  // ------------------------------------------------------------------ the handler
  async function handle(req, res) {
    const rid = reqId(); const parsed = parseUrl(req);
    try {
      if (!parsed) bad(400, 'bad-url');
      const { url, path: p } = parsed; const ip = ipOf(req);
      if (!p.startsWith('/api/')) return serveWeb(req, res, p);
      if (req.method === 'OPTIONS') { res.writeHead(204, { ...SEC_HEADERS }); return res.end(); }
      const isUnified = R.some(r => r.re.test(p) && r.method === req.method);
      const loginNoCookie = p === '/api/auth/login' && !req.headers.cookie?.includes(COOKIE + '='); // older student apps log in without the custom header
      if (!(loginNoCookie ? originOk(req, corsList()) : csrfOk(req, corsList())) && (isUnified || req.headers.cookie?.includes(COOKIE + '='))) bad(403, 'csrf');
      if (req.method !== 'GET' && writeLimit('w:' + ip)) bad(429, 'rate-limited');
      const ctx = await contextOf(req);
      // legacy /api/auth/login with {email} from older installed student apps → hub (only when that API is still on)
      if (p === '/api/auth/login' && req.method === 'POST') { const body = await readJson(req); if (body.email && !body.identity) { if (!flags.legacyStudentApi) bad(410, 'not-found'); req._ssBody = body; return await hub.handleApi(req, res, url); } return await run(req, res, p, url, ctx, ip, body); }
      if (p === '/api/auth/logout' && !ctx && String(req.headers.authorization || '').startsWith("Bearer ")) return await hub.handleApi(req, res, url);
      if (isUnified) return await run(req, res, p, url, ctx, ip);
      // everything else = preserved v11 hub routes; identity is injected from the v12 session
      if (ctx?.assignment && (await db.list('organizations')).filter(o => !o.system && o.kind !== 'system').length > 1) bad(410, 'forbidden', { reason: 'legacy-routes-disabled-multi-tenant' }); // v13 fix: org-system (created by migration 001) is not a tenant; v12 counted it, so every fresh install closed the legacy bridge
      if (ctx?.assignment) { const role = ctx.assignment.roleId; const legacyRole = ROLES[role]?.legacy;
        if (legacyRole) req._ssAdmin = { id: 'v12:' + ctx.user.id, email: ctx.user.email || ctx.user.id, name: ctx.user.name, role: legacyRole, totp: { enabled: !!ctx.user.totp?.enabled }, sid: ctx.session.id, unified: true };
        if (role === 'student') req._ssStudent = { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, emailVerified: !!ctx.user.email, phone: ctx.user.phone, status: 'active', sid: null }; }
      return await hub.handleApi(req, res, url);
    } catch (e) {
      if (e instanceof HttpError || (e.status && e.status < 500 && e.code)) return sendJson(res, e.status, errorBody(e.code, { ...(e.extra || {}), requestId: rid }));
      log(`[${rid}] ${req.method} ${parsed?.path || '?'} → ${e.stack || e.message}`.slice(0, 2000)); // never the body, never cookies
      return sendJson(res, 500, errorBody('internal', { requestId: rid }));
    }
  }
  async function run(req, res, p, url, ctx, ip, preBody) {
    for (const r of R) { const m = r.re.exec(p); if (!m) continue; if (r.method !== req.method) continue;
      const body = preBody ?? (req.method === 'GET' ? {} : await readJson(req, r.opts?.bodyLimit));
      const [status, out, headers] = await r.fn(req, { body, ctx, ip, url, params: m.slice(1) }); return sendJson(res, status, out, headers); }
    bad(404, 'not-found');
  }

  const CSP = `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'${env.SS_CONNECT_SRC ? ' ' + env.SS_CONNECT_SRC : ''}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
  function serveWeb(req, res, p) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, errorBody('not-found'));
    let rel; try { rel = decodeURIComponent(p); } catch { return sendJson(res, 400, errorBody('bad-url')); }
    if (rel === '/config.json') return sendJson(res, 200, { hubUrl: '', siteName: env.SS_SITE_NAME || 'SS', unified: true, version: VERSION, contactEmail: env.SS_CONTACT_EMAIL || '' });
    let file = path.join(webDist, path.normalize(rel).replace(/^([/\\]*\.\.[/\\])+/, ''));
    if (!file.startsWith(webDist)) return sendJson(res, 403, errorBody('forbidden'));
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // SPA route tree only for the real routes (report §20: /today, /workspace/…); anything else is a plain 404, never index.html
      if (!SPA_ROUTES.test(rel)) return sendJson(res, 404, errorBody('not-found'));
      file = path.join(webDist, 'index.html');
    }
    if (!existsSync(file)) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('SS 12: رابط کاربری هنوز ساخته نشده — npm run build'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': /[/\\]assets[/\\]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache', ...SEC_HEADERS, 'Content-Security-Policy': CSP, ...(https(req) ? { 'Strict-Transport-Security': 'max-age=15552000' } : {}) });
    if (req.method === 'HEAD') return res.end(); createReadStream(file).pipe(res);
  }
  const close = async () => { hub.bot?.stop?.(); await db.close(); };
  return { handle, db, hub, close, flags, verifyProjections, get setupToken() { return setupToken; }, sessions };
}
const SPA_ROUTES = /^\/(|login|setup|choose-role|mfa|demo|today|workspace|features|pace|privacy|terms|contact)(\/[a-zA-Z0-9_-]*)*$/;
const splitList = s => String(s || '').split(/[,،\s]+/).map(x => x.trim()).filter(Boolean).slice(0, 40);
