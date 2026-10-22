// Curriculum layer (spec 30): school textbooks are the reference TOC for every test book.
// Source: owner's TOC screenshots (books.rar, edition 1405) for grades 10–11; grade 12 (both streams) from the official
// 1405 tables of contents published online (v9). Chapters always exist; lessons/sections are added over time.
// v9: the catalog is LAYERED — base (this file) ← hub layer (published by the admin site) ← my layer (my own additions).
//   layer = { [textbookId]: { nodes?: full replacement TOC, add?: [{ id, parentId, title }], rename?: { nodeId: title }, hidden?: [nodeId] } }
//   + layer.__extra = [textbook…] for brand-new textbooks (e.g. a new edition published by the hub).
import CATALOG from './data/curriculum/catalog.json' with { type: 'json' };
import LINKS from './data/curriculum/links.json' with { type: 'json' };

/** The seven specialty subjects the app supports (owner request, v6). */
export const SUBJECTS = [
  { id: 'riazi', fa: 'ریاضی' }, { id: 'fizik', fa: 'فیزیک' }, { id: 'shimi', fa: 'شیمی' }, { id: 'hendese', fa: 'هندسه' },
  { id: 'amar', fa: 'آمار و احتمال' }, { id: 'gosaste', fa: 'گسسته' }, { id: 'zist', fa: 'زیست‌شناسی' },
];
export const STREAMS = { rf: 'ریاضی‌فیزیک', tj: 'علوم تجربی' };
export const GRADES = [10, 11, 12];
export const GRADE_FA = { 10: 'دهم', 11: 'یازدهم', 12: 'دوازدهم' };

const SUBJECT_OF = id => {
  const k = id.split('.')[2] || '';
  if (/^(riazi|hesaban)/.test(k)) return 'riazi';
  if (k.startsWith('hendese')) return 'hendese';
  if (k.startsWith('amar')) return 'amar';
  if (k.startsWith('gosaste')) return 'gosaste';
  if (k.startsWith('fizik')) return 'fizik';
  if (k.startsWith('shimi')) return 'shimi';
  if (k.startsWith('zist')) return 'zist';
  return 'riazi';
};

const BASE = CATALOG.textbooks.map(t => ({ ...t, subjectId: t.subjectId || SUBJECT_OF(t.id) }));
/** Live list (mutated in place by setCatalogLayers so every importer sees the same array). */
export const TEXTBOOKS = BASE.map(t => ({ ...t, nodes: t.nodes.map(n => ({ ...n })) }));
let LAYERS = { hub: {}, mine: {} }; let LAYER_SIG = '';
const parentOf = id => id.split('/').slice(0, -1).join('/');
/** Insert a node right after the last descendant of its parent (keeps the flat TOC in book order). */
function insertNode(nodes, add) {
  const par = nodes.find(n => n.id === add.parentId); if (!par || nodes.some(n => n.id === add.id)) return nodes;
  let at = nodes.indexOf(par); while (at + 1 < nodes.length && nodes[at + 1].id.startsWith(par.id + '/')) at++;
  const order = nodes.filter(n => parentOf(n.id) === par.id).length + 1;
  const n = { id: add.id, depth: par.depth + 1, kind: par.depth === 0 ? 'lesson' : 'subtopic', title: String(add.title || '').trim() || 'بخش بی‌نام', order, mine: !!add.mine };
  return [...nodes.slice(0, at + 1), n, ...nodes.slice(at + 1)];
}
export function applyLayer(tb, L) {
  if (!L) return tb; let nodes = L.nodes?.length ? L.nodes.map(n => ({ ...n })) : tb.nodes;
  for (const a of L.add || []) nodes = insertNode(nodes, a);
  if (L.rename) nodes = nodes.map(n => L.rename[n.id] ? { ...n, title: L.rename[n.id] } : n);
  if (L.hidden?.length) nodes = nodes.filter(n => !L.hidden.some(h => n.id === h || n.id.startsWith(h + '/')));
  const lessons = nodes.some(n => n.depth > 0);
  return { ...tb, ...(L.title ? { title: L.title } : {}), nodes, granularity: lessons ? 'lesson' : 'chapter', layered: true };
}
/** Rebuild TEXTBOOKS from base + hub layer + my layer. Cheap; skips work when nothing changed. */
export function setCatalogLayers({ hub = {}, mine = {} } = {}) {
  const sig = JSON.stringify([hub, mine]); if (sig === LAYER_SIG) return TEXTBOOKS; LAYER_SIG = sig; LAYERS = { hub, mine };
  const extra = [...(hub.__extra || []), ...(mine.__extra || [])].filter(t => t?.id && Array.isArray(t.nodes)).map(t => ({ grade: 12, streams: ['rf', 'tj'], ...t, subjectId: t.subjectId || SUBJECT_OF(t.id) }));
  const list = [...BASE.filter(b => !extra.some(x => x.id === b.id)), ...extra].map(t => applyLayer(applyLayer(t, hub[t.id]), mine[t.id]));
  TEXTBOOKS.splice(0, TEXTBOOKS.length, ...list);
  return TEXTBOOKS;
}
export const catalogLayers = () => LAYERS;
/** Next free id for a node I add under parentId. */
export function newNodeId(tb, parentId) { let k = 1; while (tb.nodes.some(n => n.id === `${parentId}/u${k}`)) k++; return `${parentId}/u${k}`; }
/** Textbooks of a program (grade + stream) in official order. */
export function programTextbooks(grade, stream) { const p = (CATALOG.programs || []).find(x => x.grade === +grade && x.stream === stream); const ids = p?.textbooks || []; return ids.map(id => TEXTBOOKS.find(t => t.id === id)).filter(Boolean); }
/** My chosen textbooks (default: my grade + stream program). */
export const myTextbookIds = s => s.myTextbooks?.length ? s.myTextbooks : programTextbooks(s.me?.grade || 11, s.me?.stream || 'rf').map(t => t.id);
/** How detailed a TOC is: chapters only, or with lessons (and how many). */
export function detailOf(tb) { const ch = tb.nodes.filter(n => n.depth === 0).length; const ls = tb.nodes.filter(n => n.depth > 0).length; return { chapters: ch, lessons: ls, level: ls ? (tb.nodes.some(n => n.depth > 1) ? 'deep' : 'lesson') : 'chapter' }; }
export const textbookById = id => TEXTBOOKS.find(t => t.id === id) || null;

/** Textbooks for a grade + stream (+ optional subject). */
export function textbooksFor(grade, stream, subjectId) {
  return TEXTBOOKS.filter(t => t.grade === +grade && (!stream || t.streams.includes(stream)) && (!subjectId || t.subjectId === subjectId));
}
export function subjectsFor(grade, stream) {
  const ids = new Set(textbooksFor(grade, stream).map(t => t.subjectId));
  return SUBJECTS.filter(x => ids.has(x.id));
}
export const isPending = tb => !tb || tb.status === 'pending-owner-input' || !tb.nodes?.length;
/** Short subject label from a textbook title: «فیزیک ۲ (ریاضی‌فیزیک)» → «فیزیک». */
export const subjectLabel = title => String(title || '').replace(/\(.*?\)/g, '').replace(/[0-9۰-۹]/g, '').trim();

// ---------- topic links (help.txt: shared topics of the two streams in one grade) ----------
const LINK_W = { identical: 1, equivalent: 0.8, partial: 0.5 };
const adj = new Map();
for (const l of LINKS.links) {
  if (l.type === 'prerequisite') continue;
  const w = (LINK_W[l.type] ?? 0.5) * (l.overlap ?? 1);
  for (const [a, b] of [[l.a, l.b], [l.b, l.a]]) { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ id: b, type: l.type, w }); }
}
/** Ref and every linked ref (same content in the other stream), with weights. */
export function linkedRefs(ref) {
  const out = new Map([[ref, 1]]);
  for (const x of adj.get(ref) || []) out.set(x.id, Math.max(out.get(x.id) || 0, x.w));
  // a lesson is also related to its chapter's links (c1/l2 ↔ links on c1)
  const ch = ref.split('/').slice(0, 2).join('/');
  if (ch !== ref) for (const x of adj.get(ch) || []) if (!out.has(x.id)) out.set(x.id, x.w * 0.5);
  return out;
}
/** Similarity of two sets of textbook refs (0..1). Same chapter = 0.6, same lesson/linked = 1. */
export function refSimilarity(as = [], bs = []) {
  let best = 0;
  for (const a of as) {
    const la = linkedRefs(a);
    for (const b of bs) {
      if (la.has(b)) best = Math.max(best, la.get(b));
      else if (b.startsWith(a + '/') || a.startsWith(b + '/')) best = Math.max(best, 0.9);
      else { const ca = a.split('/').slice(0, 2).join('/'), cb = b.split('/').slice(0, 2).join('/'); if (ca === cb) best = Math.max(best, 0.6); else if (linkedRefs(ca).has(cb)) best = Math.max(best, 0.5); }
    }
  }
  return best;
}
export const prerequisitesOf = ref => LINKS.links.filter(l => l.type === 'prerequisite' && l.b === ref).map(l => l.a);

/** Turn a textbook TOC into a test-book node skeleton (chapters → lessons as topics). Each node keeps tbRefs. */
export function skeletonFromTextbook(tb) {
  if (!tb?.nodes?.length) return [];
  const out = []; let chap = null;
  for (const n of tb.nodes) {
    if (n.kind === 'problemSet') continue;
    const id = 'n' + (out.length + 1);
    if (n.depth === 0) { chap = { id, title: n.title, kind: 'topic', depth: 0, parentId: null, order: out.length, tbRefs: [n.id] }; out.push(chap); continue; }
    out.push({ id, title: n.title, kind: 'topic', depth: Math.min(n.depth, 2), parentId: n.depth === 1 ? chap?.id ?? null : out.filter(x => x.depth === n.depth - 1).at(-1)?.id ?? chap?.id ?? null, order: out.length, tbRefs: [n.id] });
  }
  for (const n of out) n.isLeaf = !out.some(c => c.parentId === n.id);
  return out;
}
export { CATALOG, LINKS };
