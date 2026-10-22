// SS 12 — legacy import (milestone A6, report §15): snapshot → detect → staging → map → preview → apply → verify → rollback.
// Nothing reaches the canonical store without a preview and an explicit apply. Original files are never modified.
// Readers: v10/v11 hub data dir (admins.json + students.json, hub 4.0.0), .sspack v3 (sha256 checked),
//          student app state DATA_VERSION 8 / 9 (localStorage backup or ss-cloud-backup).
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import * as SEC from '@ss/auth/security.mjs';
import { envelope } from '@ss/contracts/events.mjs';
import { tehranDate } from '@ss/domain/dates.mjs';
import { newId, normPhone, createUser, assignRole } from '../identity.mjs';
const LEGACY_ROLE = { owner: 'owner', manager: 'institute_manager', teacher: 'subject_teacher' };
const sha = s => createHash('sha256').update(s).digest('hex');
const canonical = x => Array.isArray(x) ? '[' + x.map(canonical).join(',') + ']' : x && typeof x === 'object' ? '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}' : JSON.stringify(x ?? null);
const readJsonFile = f => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

/** 1. detect */
export function detect(input) {
  if (input?.kind === 'server-data') {
    const admins = readJsonFile(path.join(input.dir, 'admins.json')) || {}; const students = readJsonFile(path.join(input.dir, 'students.json')) || {}; const config = readJsonFile(path.join(input.dir, 'config.json')) || {};
    if (!Object.keys(admins).length && !Object.keys(students).length) return { format: 'none', reason: 'داده‌ای از نسخه‌های قبل در پوشه داده پیدا نشد.' };
    return { format: 'hub-v4', label: 'داده سرور مرکز (v10/v11، سرور 4.0.0)', raw: { admins, students, config }, hash: sha(canonical({ admins, students })) };
  }
  const o = input?.content;
  if (o?.format === 'sspack') { const { sum, ...rest } = o; const ok = sum && sha(canonical(rest)) === sum; if (!ok) return { format: 'reject', reason: 'کنترل صحت فایل .sspack رد شد.' }; if (+o.v > 3 || !String(o.user?.id || '').trim()) return { format: 'reject', reason: 'نسخه یا شناسه دانش‌آموز در .sspack معتبر نیست.' }; return { format: 'sspack-v3', label: `بسته دانش‌آموز .sspack نسخه ${o.v || 3}`, raw: o, hash: sum }; }
  const st = o?.format === 'ss-cloud-backup' ? o.state : o;
  if (st && typeof st === 'object' && [8, 9].includes(st.dataVersion) && Array.isArray(st.sessions)) return { format: `student-state-v${st.dataVersion}`, label: `داده برنامه دانش‌آموز (DATA_VERSION ${st.dataVersion})`, raw: st, hash: sha(canonical({ s: st.sessions.map(x => x.id), me: st.me?.id })) };
  return { format: 'reject', reason: 'نوع یا نسخه این فایل شناخته نشد؛ چیزی وارد نشد.' };
}

/** 2+3. staging + mapping (pure read of the canonical store; no writes) */
async function stage(repo, det, { requester, organizationId }) {
  const rows = []; const users = await repo.list('users');
  const byEmail = new Map(users.filter(u => u.email).map(u => [u.email, u])); const byPhone = new Map(users.filter(u => u.phone).map(u => [u.phone, u]));
  const byLegacy = new Map(users.flatMap(u => [u.legacy?.adminId && ['adm:' + u.legacy.adminId, u], u.legacy?.studentId && ['st:' + u.legacy.studentId, u]].filter(Boolean)));
  if (det.format === 'hub-v4') {
    const seen = new Map(); // same e-mail in admins + students → ONE person with two roles (unified identity)
    for (const a of Object.values(det.raw.admins)) {
      const email = SEC.normEmail(a.email); const k = 'adm:' + a.id; const role = LEGACY_ROLE[a.role];
      if (byLegacy.has(k)) { rows.push({ op: 'unchanged', entity: 'user', key: k, label: a.email }); continue; }
      if (!role) { rows.push({ op: 'unmapped', entity: 'user', key: k, label: a.email, why: `نقش ناشناخته ${a.role}` }); continue; }
      if (email && byEmail.has(email)) { rows.push({ op: 'conflict', entity: 'user', key: k, label: email, why: 'این ایمیل در نسخه ۱۲ حساب دیگری دارد' }); continue; }
      const r = { op: 'add', entity: 'user', key: k, label: email || a.email, data: { email, name: a.name, passwordHash: a.pw?.salt ? a.pw : null, disabled: !!a.disabled, totp: a.totp?.enabled ? a.totp.secret : null, legacy: { adminId: a.id } }, roles: [role] };
      rows.push(r); if (email) seen.set(email, r);
    }
    for (const st of Object.values(det.raw.students)) {
      const email = SEC.normEmail(st.email); const phone = normPhone(st.phone); const k = 'st:' + st.id;
      if (byLegacy.has(k)) { rows.push({ op: 'unchanged', entity: 'user', key: k, label: st.name }); continue; }
      if (email && seen.has(email)) { const r = seen.get(email); if (st.pw?.hash && r.data.passwordHash?.hash && st.pw.hash !== r.data.passwordHash.hash) { rows.push({ op: 'conflict', entity: 'user', key: k, label: email, why: 'همین ایمیل مدیر هم هست ولی رمز دانش‌آموزی فرق دارد؛ حساب مدیر نگه داشته شد' }); continue; } r.roles.push('student'); r.data.legacy.studentId = st.id; r.merged = true; continue; }
      if ((email && byEmail.has(email)) || (phone && byPhone.has(phone))) { rows.push({ op: 'conflict', entity: 'user', key: k, label: email || phone, why: 'ایمیل یا موبایل در نسخه ۱۲ حساب دیگری دارد' }); continue; }
      rows.push({ op: 'add', entity: 'user', key: k, label: st.name || email || phone, data: { email, phone, name: st.name, passwordHash: st.pw?.salt ? st.pw : null, disabled: st.status === 'suspended', legacy: { studentId: st.id } }, roles: ['student'], needsPassword: !st.pw?.salt });
    }
  } else if (det.format === 'sspack-v3') {
    const u = det.raw.user || {}; const k = 'st:' + u.id; const phone = normPhone(u.phone);
    const existing = byLegacy.get(k) || null; const phoneOwner = phone ? byPhone.get(phone) : null;
    const existingRole = existing && organizationId ? (await repo.list('role_assignments', { userId: existing.id, organizationId, roleId: 'student' })).find(a => !a.revokedAt) : null;
    const canAssociate = (!phoneOwner || phoneOwner.id === existing?.id) && (!organizationId || !existing || !!existingRole);
    if (!canAssociate) rows.push({ op: 'conflict', entity: 'user', key: k, label: u.name || u.id, why: phoneOwner && phoneOwner.id !== existing?.id ? 'این موبایل به حساب دیگری تعلق دارد' : 'این شناسه در سازمان مقصد نقش دانش‌آموز ندارد؛ هویت را از بخش افراد و نقش‌ها پیوند بده' });
    else if (existing) rows.push({ op: 'unchanged', entity: 'user', key: k, label: u.name });
    else rows.push({ op: 'add', entity: 'user', key: k, label: u.name || u.id, data: { phone, name: u.name, passwordHash: null, legacy: { studentId: u.id } }, roles: ['student'], needsPassword: true });
    const consent = det.raw.consent || {};
    const addRecord = (kind, key, body, label) => {
      if (body == null || (Array.isArray(body) && !body.length)) return;
      rows.push({ op: 'add', entity: 'integration_record', key: `${kind}:${key}`, ownerKey: k, label, data: { kind, recordKey: String(key), body } });
    };
    if (canAssociate && consent.books) addRecord('books', u.id, det.raw.books || [], `${(det.raw.books || []).length} کتاب`);
    if (canAssociate && consent.results) addRecord('results', u.id, det.raw.results || [], `${(det.raw.results || []).length} نتیجه آزمون`);
    if (canAssociate && consent.compare) addRecord('topic_stats', u.id, det.raw.stats || [], 'آمار مباحث');
    if (canAssociate && consent.dossier) addRecord('dossier', u.id, det.raw.dossier, 'پرونده تحصیلی');
    if (canAssociate && consent.telegram) addRecord('summary', u.id, det.raw.summary, 'خلاصه مطالعه');
    if (canAssociate && consent.full) addRecord('full_state', u.id, det.raw.fullState, 'پشتیبان کامل با رضایت');
    if (canAssociate && Array.isArray(det.raw.requests) && det.raw.requests.length) addRecord('requests', u.id, det.raw.requests, `${det.raw.requests.length} درخواست`);
  } else if (det.format.startsWith('student-state')) {
    if (!requester) throw Object.assign(new Error('import-state'), { status: 409, code: 'import-state' });
    const already = new Set((await repo.list('events', e => e.type === 'study.session.logged' && e.actorId === requester)).map(e => e.payload.localId));
    const books = Object.fromEntries((det.raw.books || []).map(b => [b.id, b]));
    for (const x of det.raw.sessions) {
      if (x.legacy) continue; const localId = 'v9:' + String(x.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60); const tests = Object.keys(x.answers || {}).length; const minutes = Math.round(x.minutes || 0);
      if (already.has(localId)) { rows.push({ op: 'unchanged', entity: 'study_session', key: localId, label: x.at }); continue; }
      if (!minutes || minutes > 600 || tests > 500 || !x.at || Number.isNaN(Date.parse(x.at))) { rows.push({ op: 'unmapped', entity: 'study_session', key: localId, label: x.at, why: 'زمان یا تعداد تست نامعتبر یا ثبت‌نشده' }); continue; }
      const b = books[x.bookId]; rows.push({ op: 'add', entity: 'study_session', key: localId, label: `${b?.subject || 'مطالعه'} · ${tehranDate(x.at)}`, data: { minutes, tests, topic: (b?.title || b?.subject || 'مطالعه').slice(0, 120), subject: (b?.subject || '').slice(0, 60), at: new Date(x.at).toISOString(), localId } });
    }
  }
  return rows;
}

/** 4. preview — counts + sample rows, stored as an ImportJob (status previewed). */
export async function previewImport(repo, input, { actorId, requester = null, organizationId = null }) {
  const det = detect(input); if (det.format === 'reject' || det.format === 'none') return { ok: false, error: 'unknown-format', reason: det.reason };
  const rows = await stage(repo, det, { requester, organizationId });
  const count = op => rows.filter(r => r.op === op).length;
  const plannedEvents = rows.filter(r => r.op === 'add').reduce((n, r) => n + (r.entity === 'study_session' ? 1 : r.entity === 'user' ? 2 + (r.roles?.length || 0) : 0), 1);
  const job = { id: newId('imp'), kind: det.format, label: det.label, sourceHash: det.hash, status: 'previewed', createdBy: actorId, requester, organizationId, createdAt: new Date().toISOString(),
    preview: { added: count('add'), unchanged: count('unchanged'), unmapped: count('unmapped'), conflict: count('conflict'), merged: rows.filter(r => r.merged).length, records: rows.filter(r => r.op === 'add' && r.entity === 'integration_record').length, events: plannedEvents, samples: rows.slice(0, 12).map(({ data, ...r }) => r) },
    staged: rows, applied: null };
  await repo.put('import_jobs', job);
  return { ok: true, job: publicJob(job) };
}
export const publicJob = j => { const { staged, ...rest } = j; return { ...rest, conflicts: (staged || []).filter(r => r.op === 'conflict' || r.op === 'unmapped').map(({ data, ...r }) => r) }; };

/** 5+6. apply in ONE transaction, then verify inside it (mismatch → throw → nothing written). */
export async function applyImport(repo, jobId, { actorId, orgName = 'مرکز SS', secretKey }) {
  return repo.transaction(async tx => {
    const job = await tx.get('import_jobs', jobId); if (!job) throw Object.assign(new Error('import-not-found'), { status: 404, code: 'import-not-found' });
    if (job.status !== 'previewed') throw Object.assign(new Error('import-state'), { status: 409, code: 'import-state' });
    const dupe = (await tx.list('import_jobs', { sourceHash: job.sourceHash })).find(j => j.status === 'applied' && j.id !== job.id && (j.requester || null) === (job.requester || null) && (j.organizationId || null) === (job.organizationId || null));
    if (dupe) throw Object.assign(new Error('import-state'), { status: 409, code: 'import-state', extra: { duplicateOf: dupe.id } });
    const created = { userIds: [], assignmentIds: [], eventIds: [], integrationRecordIds: [] };
    const legacyOwners = new Map((await tx.list('users')).flatMap(u => u.legacy?.studentId ? [['st:' + u.legacy.studentId, u.id]] : []));
    let org = job.organizationId ? await tx.get('organizations', job.organizationId) : (await tx.list('organizations', { kind: 'institute', importedFrom: 'hub-v4' }))[0];
    for (const r of job.staged.filter(x => x.op === 'add')) {
      if (r.entity === 'user') {
        if (!org) { org = { id: newId('org'), kind: 'institute', name: orgName, ownerUserId: null, importedFrom: 'hub-v4', createdAt: new Date().toISOString() }; await tx.insert('organizations', org); }
        const u = await createUser(tx, { email: r.data.email, phone: r.data.phone, name: r.data.name, passwordHash: r.data.passwordHash, legacy: { ...r.data.legacy, importJobId: job.id }, actorId, source: 'import' });
        const patch = { ...u, status: r.data.disabled ? 'disabled' : 'active', needsPassword: !!r.needsPassword, totp: r.data.totp && secretKey ? { secretBox: SEC.seal(secretKey, r.data.totp), enabled: true } : null };
        await tx.put('users', patch); created.userIds.push(u.id); if (r.key) legacyOwners.set(r.key, u.id);
        for (const role of r.roles) { const a = await assignRole(tx, { userId: u.id, roleId: role, organizationId: org.id, grantedBy: actorId, source: 'import' }); created.assignmentIds.push(a.id); }
        if (r.roles.includes('owner') && !org.ownerUserId) { org = { ...org, ownerUserId: u.id }; await tx.put('organizations', org); }
      } else if (r.entity === 'study_session') {
        const e = await tx.append(envelope({ type: 'study.session.logged', aggregateId: `${job.requester}/${r.data.localId}`, actorId: job.requester, organizationId: job.organizationId, source: 'import', payload: { ...r.data, organizationId: job.organizationId, importJobId: job.id } }));
        created.eventIds.push(e.eventId);
        const { projectToday, projectOrgToday } = await import('@ss/domain/projections.mjs'); await projectToday(tx, e); await projectOrgToday(tx, e);
      } else if (r.entity === 'integration_record') {
        const ownerId = legacyOwners.get(r.ownerKey);
        if (!ownerId) throw Object.assign(new Error('import-owner-missing'), { status: 409, code: 'import-state' });
        const recordId = `${job.id}:${r.data.kind}:${sha(r.data.recordKey).slice(0, 16)}`;
        await tx.insert('integration_records', { id: recordId, organizationId: job.organizationId, ownerId, kind: r.data.kind, sourceKey: r.data.recordKey, body: r.data.body, consented: true, sourceJobId: job.id, createdAt: new Date().toISOString(), status: 'active' });
        created.integrationRecordIds.push(recordId);
      }
    }
    const ev = await tx.append(envelope({ type: 'legacy.imported', aggregateId: job.id, actorId, organizationId: job.organizationId, source: 'import', payload: { kind: job.kind, users: created.userIds.length, sessions: created.eventIds.length, records: created.integrationRecordIds.length } }));
    // 6. verify against the staged plan — a mismatch aborts the whole transaction
    const wantUsers = job.staged.filter(x => x.op === 'add' && x.entity === 'user').length; const wantSes = job.staged.filter(x => x.op === 'add' && x.entity === 'study_session').length;
    const gotUsers = (await tx.list('users', u => u.legacy?.importJobId === job.id)).length; const gotSes = (await tx.list('events', e => e.payload?.importJobId === job.id)).length;
    const wantRecords = job.staged.filter(x => x.op === 'add' && x.entity === 'integration_record').length;
    const gotRecords = (await tx.list('integration_records', { sourceJobId: job.id, status: 'active' })).length;
    const verification = { users: { expected: wantUsers, actual: gotUsers }, sessions: { expected: wantSes, actual: gotSes }, records: { expected: wantRecords, actual: gotRecords } };
    if (gotUsers !== wantUsers || gotSes !== wantSes || gotRecords !== wantRecords) throw Object.assign(new Error('verification-mismatch'), { status: 500, code: 'internal', extra: verification });
    const done = { ...job, status: 'applied', appliedAt: new Date().toISOString(), appliedBy: actorId, applied: created, verification, eventId: ev.eventId };
    await tx.put('import_jobs', done); return publicJob(done);
  });
}

/** 7. rollback — no hard delete: users are deactivated (recovery copy kept), roles revoked, imported sessions excluded from projections. */
export async function rollbackImport(repo, jobId, { actorId }) {
  return repo.transaction(async tx => {
    const job = await tx.get('import_jobs', jobId); if (!job) throw Object.assign(new Error('import-not-found'), { status: 404, code: 'import-not-found' });
    if (job.status !== 'applied') throw Object.assign(new Error('import-state'), { status: 409, code: 'import-state' });
    for (const id of job.applied.userIds) { const u = await tx.get('users', id); if (u) await tx.put('users', { ...u, status: 'rolled_back', recovery: { status: u.status, at: new Date().toISOString() } }); for (const s of await tx.list('sessions', { userId: id })) if (!s.revokedAt) await tx.put('sessions', { ...s, revokedAt: new Date().toISOString(), revokedWhy: 'import-rollback' }); }
    for (const id of job.applied.assignmentIds) { const a = await tx.get('role_assignments', id); if (a && !a.revokedAt) await tx.put('role_assignments', { ...a, revokedAt: new Date().toISOString(), revokedBy: actorId, revokedWhy: 'import-rollback' }); }
    for (const id of job.applied.integrationRecordIds || []) { const r = await tx.get('integration_records', id); if (r && r.status === 'active') await tx.put('integration_records', { ...r, status: 'rolled_back', rolledBackAt: new Date().toISOString() }); }
    await tx.append(envelope({ type: 'legacy.import.rolled_back', aggregateId: job.id, actorId, source: 'import', payload: { users: job.applied.userIds.length, sessions: job.applied.eventIds.length } }));
    if (job.applied.eventIds.length && job.requester) { // restore the projection by replay without this job's events
      const { todayProjector, projectOrgToday } = await import('@ss/domain/projections.mjs');
      const rolled = new Set([...(await tx.list('import_jobs', { status: 'rolled_back' })).map(j => j.id), job.id]);
      const evs = (await tx.list('events', e => e.type === 'study.session.logged' && e.aggregateId.startsWith(job.requester + '/') && !rolled.has(e.payload?.importJobId))).sort((a, b) => a.seq - b.seq);
      let st = {}; for (const e of evs) st = todayProjector.apply(st, e);
      for (const d of await tx.list('proj_today', { userId: job.requester })) await tx.remove('proj_today', d.id);
      for (const d of todayProjector.docs(st)) await tx.put('proj_today', d);
      if (job.organizationId) {
        const tenantEvents = evs.filter(e => (e.organizationId || e.payload?.organizationId) === job.organizationId);
        for (const d of await tx.list('org_today', { organizationId: job.organizationId, userId: job.requester })) await tx.remove('org_today', d.id);
        for (const e of tenantEvents) await projectOrgToday(tx, e);
      }
    }
    const done = { ...job, status: 'rolled_back', rolledBackAt: new Date().toISOString(), rolledBackBy: actorId }; await tx.put('import_jobs', done); return publicJob(done);
  });
}
export const legacyDataPresent = dir => existsSync(path.join(dir, 'admins.json')) || existsSync(path.join(dir, 'students.json'));
