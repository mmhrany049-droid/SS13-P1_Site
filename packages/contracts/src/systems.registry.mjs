// SS v13 — the network of the 29 systems: what each one PROVIDES and what each one NEEDS (its inputs).
// `connections()` matches every need with a provider; the contract test (tests/network.contract.test.mjs) fails the build when
// a required need has no provider or a provided datum is never consumed (unless it is a declared `sink`: a screen, a file, a human).
// status: live = built and tested · partial = built, limited · planned = designed here, not built yet.
export const SYSTEMS = [
  // ---- student device (SS) ----
  { id: 'S1', fa: 'امروز و پوسته', part: 'SS', provides: [{ id: 'ui.today', sink: true }], needs: [{ id: 'org.today', status: 'live' }, { id: 'practice.sessions', status: 'live' }, { id: 'pace.target', status: 'live' }, { id: 'plan.tasks', status: 'live' }] },
  { id: 'S2', fa: 'ثبت تست و پاسخنامه', part: 'SS', provides: [{ id: 'practice.sessions' }, { id: 'practice.attempts' }], needs: [{ id: 'books.catalog', status: 'live' }, { id: 'books.keys', status: 'live' }, { id: 'topics.tree', status: 'live' }, { id: 'storage.local', status: 'live' }] },
  { id: 'S3', fa: 'کتاب‌ها و مباحث', part: 'SS', provides: [{ id: 'books.catalog' }, { id: 'books.keys' }, { id: 'topics.tree' }], needs: [{ id: 'hub.library', status: 'partial', required: false }, { id: 'storage.local', status: 'live' }] },
  { id: 'S4', fa: 'مرور فاصله‌دار و مجموعه‌های مرور', part: 'SS', provides: [{ id: 'review.cards' }, { id: 'review.sets' }], needs: [{ id: 'practice.attempts', status: 'live' }, { id: 'books.keys', status: 'live' }, { id: 'redo.plans', status: 'live', required: false }] },
  { id: 'S5', fa: 'برنامه‌ریز و روزهای من', part: 'SS', provides: [{ id: 'plan.tasks' }, { id: 'plan.adherence' }], needs: [{ id: 'capacity.factor', status: 'live' }, { id: 'pace.target', status: 'live' }, { id: 'exam.prep', status: 'live' }, { id: 'class.schedule', status: 'live', required: false, note: 'v13: فقط‌خواندنی؛ پیشنهاد غیرقطعی در نسخهٔ بعد' }, { id: 'redo.plans', status: 'live', required: false }] },
  { id: 'S6', fa: 'آزمون‌ها و آمادگی', part: 'SS', provides: [{ id: 'exam.list' }, { id: 'exam.prep' }], needs: [{ id: 'practice.attempts', status: 'live' }, { id: 'analysis.mastery', status: 'live' }, { id: 'flags', status: 'live', required: false, note: 'آزمون آنلاین پشت پرچم' }, { id: 'hub.exams', status: 'partial', required: false }] },
  { id: 'S7', fa: 'مرکز تحلیل', part: 'SS', provides: [{ id: 'analysis.mastery' }, { id: 'analysis.report', sink: true }, { id: 'redo.plans' }], needs: [{ id: 'practice.attempts', status: 'live' }, { id: 'review.cards', status: 'live' }, { id: 'exam.list', status: 'live' }, { id: 'plan.adherence', status: 'live', required: false }, { id: 'pace.target', status: 'live', required: false }] },
  { id: 'S8', fa: 'موتور توان', part: 'SS', provides: [{ id: 'capacity.factor' }], needs: [{ id: 'practice.attempts', status: 'live' }, { id: 'habit.adherence', status: 'live' }, { id: 'profile.bands', status: 'live', required: false }] },
  { id: 'S9', fa: 'عادت‌ها و مسیر رشد', part: 'SS', provides: [{ id: 'habit.adherence' }, { id: 'pace.target' }], needs: [{ id: 'practice.attempts', status: 'live' }, { id: 'review.cards', status: 'live' }, { id: 'profile.bands', status: 'live', required: false }] },
  { id: 'S10', fa: 'پاداش', part: 'SS', provides: [{ id: 'rewards.ledger', sink: true }], needs: [{ id: 'practice.sessions', status: 'live' }, { id: 'review.sets', status: 'live' }, { id: 'habit.adherence', status: 'live' }] },
  { id: 'S11', fa: 'دستیار', part: 'SS', provides: [{ id: 'ui.assistant', sink: true }], needs: [{ id: 'plan.tasks', status: 'live' }, { id: 'review.cards', status: 'live' }, { id: 'exam.list', status: 'live' }] },
  { id: 'S12', fa: 'نیمرخ و ایمنی', part: 'SS', provides: [{ id: 'profile.bands' }], needs: [{ id: 'storage.local', status: 'live' }] },
  { id: 'S13', fa: 'حساب و ورود', part: 'SS', provides: [{ id: 'account.identity' }], needs: [{ id: 'identity.session', status: 'live', required: false }] },
  { id: 'S14', fa: 'تبادل با مرکز', part: 'SS', provides: [{ id: 'exchange.pack' }, { id: 'sync.queue' }], needs: [{ id: 'practice.sessions', status: 'live' }, { id: 'account.identity', status: 'live' }, { id: 'consent.kinds', status: 'live' }, { id: 'hub.library', status: 'partial', required: false }] },
  { id: 'S15', fa: 'ذخیره محلی و صف', part: 'SS', provides: [{ id: 'storage.local' }], needs: [] },
  // ---- organisation workspace (M) ----
  { id: 'M1', fa: 'هویت و نشست', part: 'M', provides: [{ id: 'identity.session' }], needs: [{ id: 'db.repository', status: 'live' }] },
  { id: 'M2', fa: 'نقش و مجوز', part: 'M', provides: [{ id: 'access.policy' }, { id: 'role.vocab' }], needs: [{ id: 'identity.session', status: 'live' }, { id: 'people.memberships', status: 'live' }] },
  { id: 'M3', fa: 'افراد و عضویت', part: 'M', provides: [{ id: 'people.memberships' }], needs: [{ id: 'access.policy', status: 'live' }, { id: 'role.vocab', status: 'live' }, { id: 'db.repository', status: 'live' }] },
  { id: 'M4', fa: 'رویدادها و پروجکشن', part: 'M', provides: [{ id: 'events.log' }, { id: 'org.today' }, { id: 'outbox.rows' }], needs: [{ id: 'practice.sessions', status: 'live' }, { id: 'sync.queue', status: 'live' }, { id: 'db.repository', status: 'live' }, { id: 'subject.vocab', status: 'live' }] },
  { id: 'M5', fa: 'پیوند مطالعه و کلاس', part: 'M', provides: [{ id: 'progress.view', sink: true }, { id: 'alerts.activity', status: 'live' }], needs: [{ id: 'org.today', status: 'live' }, { id: 'people.memberships', status: 'live' }, { id: 'access.policy', status: 'live' }, { id: 'consent.kinds', status: 'live' }] },
  { id: 'M6', fa: 'برنامه کلاس', part: 'M', provides: [{ id: 'class.schedule' }], needs: [{ id: 'access.policy', status: 'live' }, { id: 'db.repository', status: 'live' }, { id: 'week.vocab', status: 'live' }] },
  { id: 'M7', fa: 'انتقال داده قدیمی', part: 'M', provides: [{ id: 'import.jobs' }], needs: [{ id: 'exchange.pack', status: 'live' }, { id: 'consent.kinds', status: 'live' }, { id: 'events.log', status: 'live' }] },
  { id: 'M8', fa: 'مرکز آموزشی', part: 'M', provides: [{ id: 'hub.library' }, { id: 'hub.exams' }, { id: 'hub.announcements' }], needs: [{ id: 'import.jobs', status: 'live' }, { id: 'access.policy', status: 'live' }] },
  { id: 'M9', fa: 'ارتباطات', part: 'M', provides: [{ id: 'comm.messages', sink: true }], needs: [{ id: 'hub.announcements', status: 'live' }, { id: 'alerts.activity', status: 'partial', required: false, note: 'dispatcher رویداد outbox هنوز ساخته نشده' }, { id: 'outbox.rows', status: 'partial', required: false }] },
  { id: 'M10', fa: 'میز کار', part: 'M', provides: [{ id: 'ui.desk', sink: true }], needs: [{ id: 'access.policy', status: 'live' }, { id: 'progress.view', status: 'live' }] },
  { id: 'M11', fa: 'تنظیمات و پشتیبان', part: 'M', provides: [{ id: 'settings.backup', sink: true }], needs: [{ id: 'access.policy', status: 'live' }, { id: 'db.repository', status: 'live' }] },
  { id: 'M12', fa: 'لایهٔ ذخیره', part: 'M', provides: [{ id: 'db.repository' }], needs: [] },
  { id: 'M13', fa: 'زیرساخت', part: 'M', provides: [{ id: 'infra.http', sink: true }], needs: [{ id: 'db.repository', status: 'live' }] },
  { id: 'M14', fa: 'پرچم‌ها', part: 'M', provides: [{ id: 'flags' }], needs: [] },
  // ---- shared vocabulary (Layer 0): provided to everyone ----
  { id: 'V', fa: 'واژگان مشترک', part: 'V', provides: [{ id: 'subject.vocab' }, { id: 'week.vocab' }, { id: 'consent.kinds' }], needs: [] },
];
/** Every need matched with its providers; plus the data nobody consumes. */
export function connections(reg = SYSTEMS) {
  const prov = new Map(); for (const s of reg) for (const p of s.provides) (prov.get(p.id) || prov.set(p.id, []).get(p.id)).push(s.id);
  const used = new Set(); const links = []; const unmet = [];
  for (const s of reg) for (const n of s.needs) { used.add(n.id); const from = prov.get(n.id) || []; const l = { to: s.id, id: n.id, from, required: n.required !== false, status: n.status || 'live', note: n.note || null }; links.push(l); if (!from.length && l.required) unmet.push(l); }
  const orphans = []; for (const s of reg) for (const p of s.provides) if (!used.has(p.id) && !p.sink) orphans.push({ id: p.id, system: s.id });
  return { links, unmet, orphans, byStatus: links.reduce((m, l) => ((m[l.status] = (m[l.status] || 0) + 1), m), {}) };
}
