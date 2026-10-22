// SS 12 — class timetable (Blueprint §9, report §9.8, CLASS_SCHEDULE_SPEC.md). New module.
// Per grade + stream + academic year; manual bells; 3 slot types: full (کامل), free (آزاد), split (دونیمه, max 2 parts);
// versioned and published by a manager; personal exceptions per student; a HARD input for the planner.
export const SLOT_TYPES = { full: 'کامل', free: 'آزاد', split: 'دونیمه' };
export const NON_STUDY = new Set(['free', 'class', 'commute', 'rest']); // never auto-create a study task
export const DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
export const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); if (!m) return null; const v = +m[1] * 60 + +m[2]; return +m[1] < 24 && +m[2] < 60 ? v : null; };
/** Validate one day of a version → list of Persian errors (empty = valid). */
export function validateDay(bells, slots = []) {
  const err = []; const bell = Object.fromEntries((bells || []).map(b => [b.no, b]));
  const iv = [];
  for (const s of slots) {
    const b = bell[s.bell]; if (!b) { err.push(`زنگ ${s.bell} تعریف نشده`); continue; }
    const from = toMin(b.from), to = toMin(b.to); if (from == null || to == null || to <= from) { err.push(`ساعت زنگ ${s.bell} نامعتبر است`); continue; }
    if (!SLOT_TYPES[s.type]) { err.push(`نوع اسلات «${s.type}» مجاز نیست`); continue; }
    if (s.type === 'split') {
      const parts = s.parts || []; if (parts.length !== 2) { err.push(`زنگ ${s.bell}: اسلات دونیمه دقیقاً دو بخش دارد`); continue; }
      let last = from;
      for (const p of parts) { const a = toMin(p.from), z = toMin(p.to);
        if (a == null || z == null || z <= a) { err.push(`زنگ ${s.bell}: ساعت بخش نامعتبر است`); continue; }
        if (a < from || z > to) err.push(`زنگ ${s.bell}: بخش «${p.subject}» بیرون از بازه زنگ است`);
        if (a < last) err.push(`زنگ ${s.bell}: دو بخش روی هم افتاده‌اند`); last = z; }
    }
    iv.push({ bell: s.bell, from, to });
  }
  iv.sort((a, b) => a.from - b.from); for (let i = 1; i < iv.length; i++) if (iv[i].from < iv[i - 1].to) err.push(`زنگ ${iv[i - 1].bell} و ${iv[i].bell} هم‌پوشانی دارند`);
  return err;
}
export function validateVersion(v) { const e = []; for (const d of DAYS) for (const x of validateDay(v.bells, v.days?.[d] || [])) e.push(`${d}: ${x}`); return e; }
/** Publish = freeze. A published version is immutable; editing creates version n+1 as a draft. */
export function publish(v, by, at = new Date().toISOString()) { const e = validateVersion(v); if (e.length) return { ok: false, errors: e }; return { ok: true, version: { ...v, status: 'published', publishedBy: by, publishedAt: at } }; }
export function nextDraft(v) { return { ...structuredClone(v), id: undefined, version: (v.version || 1) + 1, status: 'draft', publishedAt: null, publishedBy: null }; }
/** Busy intervals of one weekday for the planner (class time is blocked; free slots are NOT study tasks). */
export function busyIntervals(v, day, exceptions = []) {
  const bell = Object.fromEntries((v.bells || []).map(b => [b.no, b])); const out = [];
  for (const s of v.days?.[day] || []) { const b = bell[s.bell]; if (!b) continue; const ex = exceptions.find(x => x.day === day && x.bell === s.bell);
    if (ex?.type === 'absent') continue; const kind = s.type === 'free' ? 'free' : 'class';
    if (s.type === 'split') for (const p of s.parts) out.push({ from: toMin(p.from), to: toMin(p.to), kind, subject: p.subject, autoStudy: false });
    else out.push({ from: toMin(b.from), to: toMin(b.to), kind, subject: s.subject || null, autoStudy: false }); }
  return out.sort((a, z) => a.from - z.from);
}
