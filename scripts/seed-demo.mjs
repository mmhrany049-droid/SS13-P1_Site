#!/usr/bin/env node
// SS 12 — demo seed (Blueprint §14 «seed/reset»). Only for DATA_DIR of a demo; refuses to touch a store that already
// has non-demo users. Creates one institute with every surface represented and a week of study for the first student.
import path from 'node:path';
import { createApp } from '../apps/api/src/app.mjs';
import { createUser, assignRole } from '../apps/api/src/identity.mjs';
import { envelope } from '@ss/contracts/events.mjs';
import { runCommand } from '@ss/persistence/index.mjs';
import { projectToday } from '@ss/domain/projections.mjs';

const dataDir = process.env.DATA_DIR || path.resolve('data-demo');
export const DEMO = [
  { email: 'owner@demo.ss', name: 'نگار مالکی', password: 'Sabz-Kooh-1405', roles: ['owner'] },
  { email: 'manager@demo.ss', name: 'رضا مدیری', password: 'Abi-Darya-1405', roles: ['institute_manager'] },
  { email: 'teacher@demo.ss', name: 'مینا معلمی', password: 'Narenj-Bagh-1405', roles: ['subject_teacher'], scope: { subjects: ['ریاضی'] } },
  { email: 'sara@demo.ss', name: 'سارا احمدی', password: 'Golab-Sorkh-1405', roles: ['student'], scope: { classIds: ['c-12r'] } },
  { email: 'dual@demo.ss', name: 'امید دونقشی', password: 'Do-Naghsh-1405', roles: ['student', 'subject_teacher'], scope: { subjects: ['فیزیک'] } },
];
const app = await createApp({ dataDir, env: { ...process.env, SS_SETUP_TOKEN: 'demo-seed-only' }, log: () => {}, startBot: false });
const db = app.db;
const users = await db.list('users');
if (users.length && !users.every(u => String(u.email || '').endsWith('@demo.ss'))) { console.error('این پوشه داده واقعی دارد؛ seed دمو اجرا نشد. DATA_DIR را روی پوشه دمو بگذار.'); process.exit(2); }
if (!users.length) {
  await db.transaction(async tx => {
    const ids = {};
    for (const p of DEMO) { const u = await createUser(tx, { email: p.email, name: p.name, password: p.password, source: 'cli' }); ids[p.email] = u.id; }
    const org = { id: 'org-demo', kind: 'institute', name: 'آموزشگاه نمونه البرز', ownerUserId: ids['owner@demo.ss'], createdAt: new Date().toISOString() };
    await tx.insert('organizations', org);
    for (const p of DEMO) for (const r of p.roles) await assignRole(tx, { userId: ids[p.email], roleId: r, organizationId: org.id, scope: r === 'student' ? (p.scope?.classIds ? { classIds: p.scope.classIds } : {}) : (p.scope?.subjects ? { subjects: p.scope.subjects } : {}), grantedBy: ids['owner@demo.ss'], source: 'cli' });
  });
  // a week of study for سارا, through the same command path the API uses (event + projection + idempotency)
  const sara = (await db.list('users', { email: 'sara@demo.ss' }))[0];
  const topics = [['ریاضی', 'حسابان · مشتق'], ['فیزیک', 'فیزیک · حرکت'], ['شیمی', 'شیمی · استوکیومتری'], ['ریاضی', 'هندسه · بردار'], ['فیزیک', 'فیزیک · نوسان'], ['شیمی', 'شیمی · تعادل']];
  for (let d = 6; d >= 1; d--) {
    const [subject, topic] = topics[d % topics.length]; const at = new Date(Date.now() - d * 86400e3).toISOString(); const tests = 15 + d * 3; const correct = Math.round(tests * (0.45 + d * 0.04));
    const body = { minutes: 40 + d * 12, tests, correct, wrong: Math.round((tests - correct) * 0.6), topic, subject, at, localId: `seed-${d}`, timed: true };
    await runCommand(db, { userId: sara.id, key: `seed:${d}`, body, project: projectToday, respond: async st => ({ seq: st[0].seq }),
      events: [envelope({ type: 'study.session.logged', aggregateId: `${sara.id}/seed-${d}`, actorId: sara.id, source: 'cli', payload: { ...body } })] });
  }
}
await app.close();
console.log('\n  SS 12 · حالت دمو (داده: ' + dataDir + ')\n  ورود دومرحله‌ای در دمو خاموش است. هرگز روی داده واقعی استفاده نکن.\n');
for (const p of DEMO) console.log(`  ${p.roles.join(' + ').padEnd(28)} ${p.email.padEnd(18)} ${p.password}`);
console.log('');
