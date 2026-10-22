// پروژه مرکز (Hub) — collects many students' .sspack files, manages schools/classes/books/shared exams,
// and publishes ONE .ssbulletin that every student imports. Pure logic (testable in Node).
import { PACK, BULLETIN, FORMAT_V, MIN_GROUP, seal, verify } from '@ss/domain/format.js';
import { uuid } from '@ss/domain/store.js';

const KEY = 'ss-hub-v1';
export function initialHub() {
  return { v: 2, name: 'مرکز SS', packs: {}, people: {}, schools: [], classes: [], library: {}, textbooks: [], approved: {}, classExams: [], mockSeries: [], announcements: [], published: [], minGroup: MIN_GROUP };
}
export function loadHub() { try { return { ...initialHub(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return initialHub(); } }
export function saveHub(h) { try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* quota */ } }
export const addTextbook = (h, tb) => ({ ...h, textbooks: [...(h.textbooks || []), { ...tb, id: 'custom-tb-' + uuid().slice(0, 8), createdAt: new Date().toISOString() }] });
export const updateTextbook = (h, id, patch) => ({ ...h, textbooks: (h.textbooks || []).map(t => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t) });

/** Import one student pack. Keeps only the newest pack per person. */
export async function importPack(h, pack) {
  if (pack?.format !== PACK) return { ok: false, error: 'این فایل بسته دانش‌آموز (.sspack) نیست.' };
  if (pack.v > FORMAT_V) return { ok: false, error: 'نسخه فایل جدیدتر از مرکز است؛ مرکز را به‌روز کن.' };
  if (!(await verify(pack))) return { ok: false, error: 'کنترل صحت فایل رد شد (خراب یا دست‌کاری‌شده).' };
  const uidv = pack.user?.id; if (!uidv) return { ok: false, error: 'فایل شناسه کاربر ندارد.' };
  const old = h.packs[uidv]; if (old && old.createdAt >= pack.createdAt) return { ok: false, error: `فایل جدیدتری از «${pack.user.name}» قبلاً وارد شده.` };
  const people = { ...h.people, [uidv]: { id: uidv, name: pack.user.name || 'بی‌نام', grade: pack.user.grade, stream: pack.user.stream, phone: pack.user.phone || h.people[uidv]?.phone || '', schoolId: h.people[uidv]?.schoolId ?? pack.user.schoolId ?? null, lastPackAt: pack.createdAt, consent: pack.consent } };
  // the student's own class claims are suggestions; hub membership is the source of truth, but auto-add if the class exists
  const classes = h.classes; // v2: no auto-membership from student claims
  const joinRequests = { ...(h.joinRequests || {}), [uidv]: [...new Set([...(pack.user.joinRequests || []), ...(pack.user.classIds || [])])].filter(id => h.classes.some(c => c.id === id && !c.members.includes(uidv))) };
  const library = { ...h.library };
  for (const b of pack.books || []) {
    const cur = library[b.uid]; const src = { ...b, from: uidv, proposal: true, proposedAt: pack.createdAt }; // v12 (S9): a student's book/key is a PROPOSAL; only an approved version is published
    library[b.uid] = cur ? { ...cur, versions: [...(cur.versions || []).filter(v => v.from !== uidv), src] } : { uid: b.uid, versions: [src] };
  }
  return { ok: true, hub: { ...h, packs: { ...h.packs, [uidv]: pack }, people, classes, library, joinRequests }, name: pack.user.name };
}

/** Merge the versions of one book: structure from the newest version with ranges; keys by majority vote per question. */
export function mergeBookVersions(entry) {
  const vs = [...(entry.versions || [])].sort((a, z) => String(z.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (!vs.length) return null;
  const base = vs.find(v => v.nodes.some(n => n.qStart != null)) || vs[0];
  const votes = {};
  for (const v of vs) for (const [q, k] of Object.entries(v.keys || {})) if (k) { const t = votes[q] ||= {}; t[k] = (t[k] || 0) + 1; }
  const keys = {}, disputed = [];
  for (const [q, t] of Object.entries(votes)) { const arr = Object.entries(t).sort((a, z) => z[1] - a[1]); keys[q] = +arr[0][0]; if (arr.length > 1 && arr[1][1] === arr[0][1]) disputed.push(+q); }
  const { from, ...book } = base;
  return { ...book, keys, disputed, contributors: vs.map(v => v.from).filter(Boolean), versions: undefined };
}
export function libraryBooks(h) {
  return Object.values(h.library).map(e => {
    const merged = e.versions?.length ? mergeBookVersions(e) : null;
    if (!e.hubBook) return merged;
    if (!merged) return e.hubBook;
    // hub-defined book: structure stays the hub's; ranges/keys contributed by people fill the gaps
    const hasRanges = e.hubBook.nodes.some(n => n.qStart != null);
    return { ...e.hubBook, nodes: hasRanges ? e.hubBook.nodes : merged.nodes, keys: { ...merged.keys, ...(e.hubBook.keys || {}) }, disputed: merged.disputed, contributors: merged.contributors };
  }).filter(Boolean);
}

// ---------- schools / classes ----------
export const addSchool = (h, name, city = '') => ({ ...h, schools: [...h.schools, { id: 'sch-' + uuid().slice(0, 8), name: name.trim(), city }] });
export const addClass = (h, c) => ({ ...h, classes: [...h.classes, { id: 'cls-' + uuid().slice(0, 8), kind: c.kind || 'outside', name: c.name.trim(), schoolId: c.schoolId || null, institute: c.institute || '', teacher: c.teacher || '', grade: c.grade || null, stream: c.stream || null, subjectIds: c.subjectIds || [], members: [] }] });
export const setMember = (h, classId, personId, on) => ({ ...h, classes: h.classes.map(c => c.id !== classId ? c : { ...c, members: on ? [...new Set([...c.members, personId])] : c.members.filter(x => x !== personId) }) });
export const setPersonSchool = (h, personId, schoolId) => ({ ...h, people: { ...h.people, [personId]: { ...h.people[personId], schoolId } } });
/** Groups for the people view: by school, then by outside class. */
export function groupPeople(h) {
  const ps = Object.values(h.people);
  return {
    bySchool: [...h.schools.map(sc => ({ school: sc, people: ps.filter(p => p.schoolId === sc.id) })), { school: { id: null, name: 'بدون مدرسه' }, people: ps.filter(p => !p.schoolId || !h.schools.some(sc => sc.id === p.schoolId)) }],
    byClass: h.classes.map(c => ({ cls: c, people: c.members.map(id => h.people[id]).filter(Boolean) })),
  };
}

// ---------- comparison (only consenting users; groups smaller than minGroup are dropped) ----------
function quant(a, q) { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (i - lo) * ((s[Math.min(lo + 1, s.length - 1)]) - s[lo]); }
export function compareStats(h, members = null) {
  const per = {};
  for (const [id, p] of Object.entries(h.packs)) {
    if (!p.consent?.compare || !p.stats || (members && !members.includes(id))) continue;
    for (const t of p.stats) { if (t.N < 5) continue; for (const k of [`${t.bookUid}|${t.nodeId}`, ...(t.refs || []).map(r => 'ref:' + r)]) (per[k] ||= {})[id] = t.pC; }
  }
  const out = {};
  for (const [k, m] of Object.entries(per)) { const v = Object.values(m); if (v.length < h.minGroup) continue; out[k] = { n: v.length, mean: +(v.reduce((a, x) => a + x, 0) / v.length).toFixed(3), p25: +quant(v, 0.25).toFixed(3), p50: +quant(v, 0.5).toFixed(3), p75: +quant(v, 0.75).toFixed(3) }; }
  return out;
}
export function examResults(h, hubExamId) {
  const rows = Object.values(h.packs).filter(p => p.consent?.results).flatMap(p => (p.results || []).filter(r => r.hubExamId === hubExamId).map(r => ({ person: p.user.name, id: p.user.id, ...r })));
  const v = rows.map(r => r.percent).filter(x => x != null);
  return { rows, n: v.length, mean: v.length ? v.reduce((a, x) => a + x, 0) / v.length : null };
}

// ---------- shared class exams ----------
export const addClassExam = (h, ex) => ({ ...h, classExams: [...h.classExams, { id: 'cex-' + uuid().slice(0, 8), createdAt: new Date().toISOString(), ...ex }] });
export const addAnnouncement = (h, a) => ({ ...h, announcements: [{ id: 'ann-' + uuid().slice(0, 8), at: new Date().toISOString(), ...a }, ...h.announcements].slice(0, 100) });

/** Build the bulletin every student imports. Only approved library books are published. */
export async function buildBulletin(h, extra = {}) {
  const books = libraryBooks(h).filter(b => h.approved[b.uid]);
  const classes = h.classes.map(c => ({ ...c, members: [...c.members] })); // v2: ids only (privacy)
  const compare = { k: h.minGroup, all: compareStats(h), classes: Object.fromEntries(h.classes.map(c => [c.id, compareStats(h, c.members)])) };
  return seal({ format: BULLETIN, v: FORMAT_V, bulletinId: uuid(), createdAt: new Date().toISOString(), hubName: h.name, schools: h.schools, classes, textbooks: h.textbooks || [], books, classExams: h.classExams, mockSeries: h.mockSeries || [], compare, announcements: h.announcements, ...extra });
}
