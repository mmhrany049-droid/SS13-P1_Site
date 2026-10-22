// SS v13 — the shared vocabulary of the network between systems (Layer 0). One place for names that used to differ between
// the student device and the server: subject ids, weekdays, consent kinds, streams. Conversions happen ONLY at system borders.
/** JS getDay() (0 = Sunday … 6 = Saturday) ↔ the class-schedule keys (Saturday first, the Iranian week). */
export const WEEK_KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
const JS_TO_KEY = { 6: 'sat', 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' };
export const dayKeyOf = jsDay => JS_TO_KEY[jsDay];
export const jsDayOf = key => +Object.entries(JS_TO_KEY).find(([, k]) => k === key)?.[0];
export const dayKeyOfDate = dateStr => JS_TO_KEY[new Date(dateStr + 'T12:00:00').getDay()];

/** Canonical subject ids. Books keep a free label («حسابان») AND a subjectId («riazi»): the network always sends the id. */
export const SUBJECT_ALIASES = { riazi: ['ریاضی', 'حسابان', 'ریاضیات', 'هندسه', 'گسسته', 'آمار'], fizik: ['فیزیک'], shimi: ['شیمی'], zist: ['زیست', 'زیست‌شناسی'], adabiat: ['ادبیات', 'فارسی'], arabi: ['عربی'], zaban: ['زبان', 'انگلیسی'], din: ['دینی', 'دین و زندگی'], zamin: ['زمین‌شناسی'] };
export function subjectIdOf(label) { if (!label) return null; const t = String(label).replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').trim(); for (const [id, ls] of Object.entries(SUBJECT_ALIASES)) if (id === t || ls.some(l => t.startsWith(l))) return id; return null; }

/** Streams: the schedule stores free text, the student profile stores a code. */
export const STREAM_ALIASES = { rf: ['rf', 'ریاضی', 'ریاضی فیزیک', 'ریاضی-فیزیک', 'ریاضیفیزیک'], tj: ['tj', 'تجربی', 'علوم تجربی'], ens: ['ens', 'انسانی', 'علوم انسانی'] };
export function streamCode(x) { if (!x) return null; const t = String(x).replace(/[ي]/g, 'ی').trim(); for (const [c, ls] of Object.entries(STREAM_ALIASES)) if (ls.some(l => l === t || t.includes(l))) return c; return null; }

/** Consent kinds: device (14S) ↔ import / org projections (7M, 5M). `compare` on the device is `topic_stats` at the centre, `telegram` is `summary`. */
export const CONSENT_DEVICE_TO_ORG = { books: 'books', results: 'results', compare: 'topic_stats', dossier: 'dossier', telegram: 'summary', requests: 'request' };
export const CONSENT_ORG_TO_DEVICE = Object.fromEntries(Object.entries(CONSENT_DEVICE_TO_ORG).map(([k, v]) => [v, k]));
export const consentToOrg = k => CONSENT_DEVICE_TO_ORG[k] ?? k;
export const consentToDevice = k => CONSENT_ORG_TO_DEVICE[k] ?? k;

/** Role vocabularies: v11 (legacy hub) ↔ v12 ↔ perms.js. One map so a new role (e.g. advisor) is added in ONE place. */
export const ROLE_ALIASES = { owner: ['owner', 'owner_admin'], administrator: ['administrator', 'system_admin'], institute_manager: ['institute_manager', 'institute_admin', 'manager'], school_manager: ['school_manager', 'school_admin'], program_manager: ['program_manager'], teacher_admin: ['teacher_admin', 'admin_teacher'], subject_teacher: ['subject_teacher', 'teacher'], independent_teacher: ['independent_teacher'], student: ['student'] };
export function canonicalRole(r) { for (const [c, ls] of Object.entries(ROLE_ALIASES)) if (ls.includes(r)) return c; return r; }
