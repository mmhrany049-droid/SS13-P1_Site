// File-based network (v6, spec 35/36 simplified): no server needed.
//   student app ──(.sspack: my books, keys, ranges, results, stats — only what I consented to)──► Hub (پروژه مرکز)
//   Hub ──(.ssbulletin: merged books, schools/classes, shared class exams, anonymous comparison, notices)──► every student
// Every file carries a SHA-256 checksum over its canonical JSON so damaged/edited files are detected.
import * as BK from '@ss/domain/book.js';
import { attemptsOf, topicMastery, latestSitting, uuid, leaves, todayStr, syncMockExams } from '@ss/domain/store.js';
import { buildSummary } from './summary.js';
import { buildDossier, fullStateForHub } from './dossier.js';

import { PACK, BULLETIN, FORMAT_V, MIN_GROUP, canonical, sha256, seal, verify, downloadJson, readJsonFile } from '@ss/domain/format.js';
export { PACK, BULLETIN, FORMAT_V, MIN_GROUP, canonical, sha256, seal, verify, downloadJson, readJsonFile };

const NODE_KEYS = ['id', 'title', 'kind', 'depth', 'parentId', 'order', 'isLeaf', 'qStart', 'qEnd', 'span', 'levels', 'covers', 'ownNumbering', 'scopeNo', 'tbRefs'];
/** The part of a book that is safe and useful to share (structure, ranges, keys). */
export function shareableBook(b, author) {
  return {
    uid: b.uid, title: b.title, publisher: b.publisher, subject: b.subject, subjectId: b.subjectId, grade: b.grade, stream: b.stream, textbookId: b.textbookId,
    numbering: b.numbering || 'global', levels: b.levels || 0, color: b.color || null, updatedAt: b.updatedAt || null, author: author || b.author || null,
    nodes: b.nodes.map(n => Object.fromEntries(NODE_KEYS.filter(k => n[k] !== undefined).map(k => [k, n[k]]))), keys: b.keys || {},
  };
}
/** Per-topic aggregate of MY results (no single answers leave the device). */
export function topicStats(s) {
  const atts = attemptsOf(s).filter(a => !a.isLegacy); const { res } = topicMastery(s, atts); const out = [];
  for (const [k, m] of Object.entries(res)) {
    const [bid, nid] = k.split('|'); const b = s.books.find(x => x.id === bid); const n = b?.nodes.find(x => x.id === nid); if (!b || !n) continue;
    const mine = atts.filter(a => a.bookId === bid && a.nodeId === nid);
    out.push({ bookUid: b.uid, nodeId: nid, refs: BK.refsOf(b, n), N: mine.length, C: mine.filter(a => a.result === 'C').length, W: mine.filter(a => a.result === 'W').length, pC: +m.pC.toFixed(3) });
  }
  return out;
}
export async function buildPack(s) {
  const me = s.me || {}; const c = me.consent || {};
  const books = c.books ? s.books.filter(b => b.origin !== 'seed' || b.nodes.some(n => n.qStart != null) || Object.keys(b.keys || {}).length).map(b => shareableBook(b, me.name)) : [];
  const results = c.results ? s.exams.filter(e => (e.hubExamId || e.mockKey) && latestSitting(e)).map(e => { const z = latestSitting(e); return { hubExamId: e.hubExamId || null, mockKey: e.mockKey || null, classId: e.classId || null, date: z.date, percent: z.percent, sections: z.sections.map(x => ({ subject: s.books.find(b => b.id === x.bookId)?.subject, C: x.C, W: x.W, B: x.B, P: x.P })) }; }) : [];
  return seal({ format: PACK, v: FORMAT_V, packId: uuid(), createdAt: new Date().toISOString(), app: 'SS',
    user: { id: me.id, name: me.name || s.settings?.name || '', phone: s.account?.phone || '', grade: me.grade, stream: me.stream, schoolId: me.schoolId, classIds: me.classIds || [], joinRequests: me.joinRequests || [] },
    consent: { books: !!c.books, results: !!c.results, compare: !!c.compare, telegram: c.telegram !== false, dossier: c.dossier !== false, full: !!c.full }, books, results, stats: c.compare ? topicStats(s) : null,
    summary: c.telegram !== false ? safeSummary(s) : null, requests: (s.hub?.requests || []),
    // v9: academic dossier (registration + planning style + commitment) and, only with explicit consent, the full data
    dossier: c.dossier !== false ? safeDossier(s) : null, fullState: c.full ? fullStateForHub(s) : null });
}
function safeSummary(s) { try { return buildSummary(s); } catch { return null; } }
function safeDossier(s) { try { return buildDossier(s); } catch { return null; } }

// ---------- student side: apply a bulletin from the hub ----------
/** Map a hub class-exam section (textbook refs) onto my own active books. */
export function resolveSection(s, sec) {
  const act = s.books.filter(b => b.active !== false);
  const b = act.find(x => x.uid === sec.bookUid) || act.find(x => sec.textbookId && x.textbookId === sec.textbookId) || act.find(x => sec.subjectId && x.subjectId === sec.subjectId);
  if (!b) return null;
  const refs = sec.tbRefs || [];
  const ids = sec.bookUid === b.uid && sec.nodeIds?.length ? sec.nodeIds.filter(id => b.nodes.some(n => n.id === id))
    : leaves(b).filter(n => n.kind === 'topic' && BK.refsOf(b, n).some(r => refs.some(x => r === x || r.startsWith(x + '/') || x.startsWith(r + '/')))).map(n => n.id);
  return { bookId: b.id, count: sec.count, nodeIds: ids };
}
function mergeBook(local, incoming) {
  const keys = { ...incoming.keys, ...local.keys }; // my own keys win; hub fills the gaps
  const mineHasRanges = local.nodes.some(n => n.qStart != null);
  const nodes = mineHasRanges ? local.nodes : incoming.nodes.map(n => ({ ...n }));
  return { ...local, keys, nodes: mineHasRanges ? nodes : nodes, numbering: mineHasRanges ? local.numbering : incoming.numbering, levels: local.levels || incoming.levels, updatedAt: new Date().toISOString() };
}
export async function applyBulletin(s, bulletin) {
  if (bulletin?.format !== BULLETIN) return { ok: false, error: 'این فایل اطلاع‌رسانی یا فایل مرجع مرکز نیست.' };
  if (bulletin.v > FORMAT_V) return { ok: false, error: 'این فایل با نسخه جدیدتر مرکز ساخته شده؛ اپ را به‌روز کن.' };
  if (!(await verify(bulletin))) return { ok: false, error: 'فایل دست‌کاری یا خراب شده (کنترل صحت رد شد).' };
  const partial = !!bulletin.partial; const seq = +bulletin.seq || 0; const lastSeq = +(s.hub?.lastSeq || 0);
  if (!partial && seq && seq <= lastSeq) return { ok: false, stale: true, error: `این اطلاع‌رسانی (شماره ${seq}) قدیمی‌تر یا همان چیزی است که داری (${lastSeq}).` };
  if (!partial && !seq && (s.hub?.bulletins || []).includes(bulletin.bulletinId)) return { ok: false, stale: true, error: 'این اطلاع‌رسانی قبلاً وارد شده.' };
  const sum = { booksNew: 0, booksUpdated: 0, exams: 0, mocks: 0, classes: 0, notices: 0, partial };
  let books = [...s.books];
  for (const ib of bulletin.books || []) {
    const i = books.findIndex(b => b.uid === ib.uid);
    if (i >= 0) { books[i] = mergeBook(books[i], ib); sum.booksUpdated++; }
    else { books.push({ ...ib, id: 'h' + Math.random().toString(36).slice(2, 8), active: false, origin: 'hub', keys: ib.keys || {} }); sum.booksNew++; } // student activates it
  }
  const me = { ...s.me }; let st = { ...s, books };
  if (!partial) {
    // membership comes ONLY from the hub (the student's own picks are sent as join requests)
    const classes = (bulletin.classes || []).map(c => ({ ...c, members: (c.members || []).map(m => typeof m === 'string' ? m : m.id) }));
    me.classIds = classes.filter(c => c.members.includes(me.id)).map(c => c.id);
    me.joinRequests = (me.joinRequests || []).filter(id => !me.classIds.includes(id) && classes.some(c => c.id === id));
    sum.classes = me.classIds.length;
    st = { ...st, me, org: { schools: bulletin.schools || [], classes }, compare: bulletin.compare || st.compare };
  }
  const myClasses = st.me.classIds || [];
  // shared class exams arrive as «pending»: they enter readiness/planner only after the student activates them
  const exams = [...st.exams];
  for (const ce of bulletin.classExams || []) {
    if (ce.classId && !myClasses.includes(ce.classId)) continue;
    if (exams.some(e => e.hubExamId === ce.id)) continue;
    const sections = (ce.sections || []).map(sec => resolveSection(st, sec)).filter(x => x && x.nodeIds.length);
    exams.push({ id: Math.random().toString(36).slice(2, 10), hubExamId: ce.id, classId: ce.classId, kind: ce.date < todayStr() ? 'old' : 'upcoming', title: ce.title, date: ce.date, target: ce.target || 60, sections, rawSections: ce.sections || [], sittings: [], unresolved: (ce.sections || []).length - sections.length, fromHub: true, pending: true });
    sum.exams++;
  }
  // mock-exam series (شبه‌کنکور) designed in the hub: kept inactive until the student turns them on
  let mockSeries = [...(st.mockSeries || [])];
  for (const ms of bulletin.mockSeries || []) {
    if (ms.classId && !myClasses.includes(ms.classId)) continue;
    const i = mockSeries.findIndex(m => m.id === ms.id);
    if (i >= 0) mockSeries[i] = { ...ms, active: mockSeries[i].active, fromHub: true }; else { mockSeries.push({ ...ms, active: false, fromHub: true }); sum.mocks++; }
  }
  if (!partial) mockSeries = mockSeries.filter(m => !m.fromHub || (bulletin.mockSeries || []).some(x => x.id === m.id));
  const seen = new Set((s.announcements || []).map(a => a.id));
  const notes = (bulletin.announcements || []).filter(a => !seen.has(a.id) && (!a.classId || myClasses.includes(a.classId)));
  sum.notices = notes.length;
  st = syncMockExams({ ...st, exams, mockSeries });
  // v9: the hub's textbook catalog layer (chapters/lessons it added or corrected)
  if (bulletin.catalog && typeof bulletin.catalog === 'object') { st = { ...st, catalogHub: bulletin.catalog }; sum.catalog = Object.keys(bulletin.catalog).filter(k => k !== '__extra').length; }
  st = { ...st, announcements: [...notes.map(a => ({ ...a, read: false })), ...(s.announcements || [])].slice(0, 80),
    hub: { ...(s.hub || {}), bulletins: [...(s.hub?.bulletins || []), bulletin.bulletinId].slice(-50), ...(partial ? {} : { lastBulletinAt: bulletin.createdAt, lastSeq: seq || lastSeq, hubName: bulletin.hubName, bot: bulletin.bot || null }) } };
  return { ok: true, state: st, summary: sum };
}
/** Activate a pending class exam (maps its topics onto my books again, in case I activated books since). */
export function activateHubExam(s, examId) {
  return { ...s, exams: s.exams.map(e => { if (e.id !== examId) return e; const sections = (e.rawSections || []).map(sec => resolveSection(s, sec)).filter(x => x && x.nodeIds.length); return { ...e, pending: false, sections: sections.length ? sections : e.sections, unresolved: (e.rawSections || []).length - sections.length }; }) };
}
/** Comparison row for one of my topics: group statistics published by the hub (or null). */
export function compareFor(s, b, n, classId) {
  const C = s.compare; if (!C || !b || !n) return null;
  const groups = classId && C.classes?.[classId] ? C.classes[classId] : C.all; if (!groups) return null;
  const k1 = `${b.uid}|${n.id}`; if (groups[k1]) return groups[k1];
  for (const r of BK.refsOf(b, n)) if (groups['ref:' + r]) return groups['ref:' + r];
  return null;
}

