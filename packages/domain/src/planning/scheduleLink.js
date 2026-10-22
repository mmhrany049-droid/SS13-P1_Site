// SS v13 — the link between the class timetable (6M, published by the school/institute) and the student's own planner (5S).
// Step 1 is READ-ONLY (as the project's own design says): class hours are shown on each planner day and never rewrite the plan silently.
import { busyIntervals } from './classSchedule.js';
import { dayKeyOfDate, streamCode } from '../vocab.js';

const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** The published timetable that belongs to this student: same grade and stream (canonical code), newest academic year, highest version. */
export function pickSchedule(items, me) {
  const grade = String(me?.grade ?? ''); const sc = streamCode(me?.stream); if (!grade) return null;
  const ok = (items || []).filter(v => v.status === 'published' && String(v.grade) === grade && (!sc || !streamCode(v.stream) || streamCode(v.stream) === sc));
  return ok.sort((a, z) => String(z.academicYear).localeCompare(String(a.academicYear)) || (z.version || 0) - (a.version || 0))[0] || null;
}
/** Class blocks of one calendar day, with printable times. Personal absences (exceptions) are honoured. */
export function classBlocks(s, dateStr) {
  const v = s?.classSchedule?.version; if (!v) return []; const key = dayKeyOfDate(dateStr);
  return busyIntervals(v, key, s.classSchedule.exceptions || []).filter(b => b.kind === 'class').map(b => ({ ...b, label: `${fmt(b.from)}–${fmt(b.to)}`, subject: b.subject || 'کلاس' }));
}
export const classMinutes = (s, dateStr) => classBlocks(s, dateStr).reduce((t, b) => t + (b.to - b.from), 0);
/** Store the fetched list (offline cache). Returns the same state when nothing changed. */
export function applySchedule(s, items, now = Date.now()) {
  const v = pickSchedule(items, s.me); const cur = s.classSchedule?.version;
  if (!v && !cur) return s; if (v && cur && v.id === cur.id && v.version === cur.version) return s;
  return { ...s, classSchedule: v ? { at: now, version: v, exceptions: s.classSchedule?.exceptions || [] } : null };
}
