import test from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEMS, connections } from '@ss/contracts/systems.registry.mjs';
import * as V from '@ss/domain/vocab.js';
import * as SL from '@ss/domain/planning/scheduleLink.js';

test('network: every required input has a provider and no provided datum is orphaned', () => {
  const c = connections(SYSTEMS);
  assert.deepEqual(c.unmet.map(l => `${l.to}←${l.id}`), [], 'inputs without a provider');
  assert.deepEqual(c.orphans.map(o => `${o.system}:${o.id}`), [], 'provided data nobody consumes (declare sink:true if a screen/file/human uses it)');
  assert.equal(SYSTEMS.filter(s => s.part !== 'V').length, 29);
});
test('network: only the documented gaps remain "partial"', () => {
  const partial = connections(SYSTEMS).links.filter(l => l.status !== 'live').map(l => `${l.to}←${l.id}`).sort();
  assert.deepEqual(partial, ['M9←alerts.activity', 'M9←outbox.rows', 'S14←hub.library', 'S3←hub.library', 'S6←hub.exams'].sort());
});
test('vocab: weekday keys follow the Saturday-first convention and round-trip', () => {
  assert.equal(V.dayKeyOfDate('2026-10-17'), 'sat'); assert.equal(V.dayKeyOfDate('2026-10-18'), 'sun'); assert.equal(V.dayKeyOfDate('2026-10-23'), 'fri');
  for (const k of V.WEEK_KEYS) assert.equal(V.dayKeyOf(V.jsDayOf(k)), k);
});
test('vocab: subject labels map to canonical ids; consent kinds map both ways', () => {
  assert.equal(V.subjectIdOf('حسابان'), 'riazi'); assert.equal(V.subjectIdOf('فيزيک'), 'fizik'); assert.equal(V.subjectIdOf('شیمی ۲'), 'shimi'); assert.equal(V.subjectIdOf('چیز دیگر'), null);
  assert.equal(V.consentToOrg('compare'), 'topic_stats'); assert.equal(V.consentToDevice('topic_stats'), 'compare'); assert.equal(V.consentToOrg('telegram'), 'summary');
  assert.equal(V.canonicalRole('admin_teacher'), 'teacher_admin'); assert.equal(V.canonicalRole('school_admin'), 'school_manager'); assert.equal(V.canonicalRole('teacher'), 'subject_teacher');
});
test('schedule link: picks the student\'s own published timetable and shows class blocks read-only', () => {
  const v = (o) => ({ id: 'v' + o.version + o.stream, status: 'published', grade: '11', stream: 'ریاضی فیزیک', academicYear: '1405', version: 1, bells: [{ no: 1, from: '08:00', to: '09:00' }], days: { sat: [{ bell: 1, type: 'class', subject: 'فیزیک' }] }, ...o });
  const items = [v({ version: 1 }), v({ version: 2 }), v({ version: 9, stream: 'تجربی' }), v({ version: 3, status: 'draft' })];
  const pick = SL.pickSchedule(items, { grade: 11, stream: 'rf' }); assert.equal(pick.version, 2);
  assert.equal(SL.pickSchedule(items, { grade: 12, stream: 'rf' }), null);
  const s = { classSchedule: { version: pick, exceptions: [] } }; const b = SL.classBlocks(s, '2026-10-17'); assert.equal(b.length, 1); assert.equal(b[0].label, '08:00–09:00'); assert.equal(SL.classBlocks(s, '2026-10-18').length, 0);
  assert.equal(SL.applySchedule({ me: { grade: 11, stream: 'rf' }, classSchedule: null }, items).classSchedule.version.version, 2);
});
