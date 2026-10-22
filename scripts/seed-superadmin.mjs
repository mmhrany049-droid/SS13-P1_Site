#!/usr/bin/env node
// SS 13 — creates the PLATFORM super-admin («مدیر کل برنامه»): the owner of the whole product, not the manager of one school.
// It is one real account (roles owner + administrator + student, so the same login can also open the student cabin and see the student version) in its own system organisation. Idempotent: running it again changes nothing.
//   SS_SUPERADMIN_EMAIL     login (e-mail form; the product signs in with e-mail or an Iranian mobile)   default: ss.admin@ss-site.ir
//   SS_SUPERADMIN_PASSWORD  the first password                                                         default: printed by `npm run superadmin` after you set it
//   SS_SUPERADMIN_NAME      display name                                                               default: مدیر کل SS
// Security: the password is FORCED to change at the first sign-in (needsPassword) and owner/system_admin are sensitive roles, so
// two-step verification (Authenticator / Aegis) is mandatory unless SS_REQUIRE_MFA=0 (demo only). Do not keep the first password anywhere.
import path from 'node:path';
import { createApp } from '../apps/api/src/app.mjs';
import { createUser, assignRole, ensureMembership } from '../apps/api/src/identity.mjs';

const dataDir = process.env.DATA_DIR || path.resolve('data');
const email = process.env.SS_SUPERADMIN_EMAIL || 'ss.admin@ss-site.ir'; const name = process.env.SS_SUPERADMIN_NAME || 'مدیر کل SS'; const password = process.env.SS_SUPERADMIN_PASSWORD;
if (!password || password.length < 12) { console.error('رمز اولیه لازم است: SS_SUPERADMIN_PASSWORD (دست‌کم ۱۲ نویسه، حرف و عدد).'); process.exit(2); }
const app = await createApp({ dataDir, env: { ...process.env, SS_SETUP_TOKEN: process.env.SS_SETUP_TOKEN || 'superadmin-seed-only' }, log: () => {}, startBot: false });
const db = app.db; let created = false;
await db.transaction(async tx => {
  const have = (await tx.list('users', { email: email.toLowerCase() }))[0]; if (have) return;
  const u = await createUser(tx, { email, name, password, source: 'cli' }); created = true;
  await tx.put('users', { ...u, needsPassword: true });
  let org = (await tx.list('organizations', { id: 'org-platform' }))[0];
  if (!org) { org = { id: 'org-platform', kind: 'institute', name: 'مدیریت کل SS', ownerUserId: u.id, system: true, createdAt: new Date().toISOString() }; await tx.insert('organizations', org); }
  await ensureMembership(tx, { organizationId: org.id, userId: u.id });
  for (const r of ['owner', 'administrator', 'student']) await assignRole(tx, { userId: u.id, roleId: r, organizationId: org.id, scope: {}, grantedBy: u.id, source: 'cli' });
});
await app.close();
console.log(created ? `\n  حساب مدیر کل ساخته شد: ${email}\n  در اولین ورود، تغییر رمز و فعال‌سازی ورود دومرحله‌ای اجباری است.\n` : `\n  حساب ${email} از قبل وجود دارد؛ چیزی تغییر نکرد.\n`);
