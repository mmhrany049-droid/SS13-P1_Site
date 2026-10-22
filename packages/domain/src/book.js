// Test-book structure helpers (v6): numbering scopes, difficulty levels, exam-like coverage, textbook refs.
// Pure functions; no React. Internal question number = scopeNo × SCOPE + printed number, so every other
// module (keys, attempts, ranges, reviews) keeps working with one integer per question (spec 31 TB-1/TB-2).
import { toFa } from './engine.js';

export const SCOPE = 100000;
export const EXAM_LIKE = new Set(['mixed', 'checkup', 'comprehensive', 'final']);
export const KIND_FA = { topic: 'مبحث', theory: 'درس‌نامه', mixed: 'تست‌های مخلوط', checkup: 'آزمون چکاپ', comprehensive: 'آزمون جامع', final: 'آزمون پایانی/فصل' };
export const NUMBERING_FA = { global: 'سراسری (کل کتاب پشت هم)', perChapter: 'هر فصل از ۱' };
export const LEVEL_FA = { 1: 'سطح ۱ (آسان)', 2: 'سطح ۲ (متوسط)', 3: 'سطح ۳ (سخت)' };
/** Evidence weight of a question by difficulty level (assumption, owner-tunable). */
export const LEVEL_W = { 1: 0.8, 2: 1, 3: 1.2 };

export const isExamLike = n => !!n && EXAM_LIKE.has(n.kind);
export const nodeById = (b, id) => b.nodes.find(n => n.id === id) || null;
export const chapterNode = (b, n) => { let cur = n; while (cur?.parentId) cur = nodeById(b, cur.parentId); return cur || null; };
export const topLevel = b => b.nodes.filter(n => !n.parentId);

/** Scope node of a node: nearest ancestor-or-self with ownNumbering; else its chapter in per-chapter books; else null (global). */
export function scopeNodeOf(b, n) {
  let cur = n;
  while (cur) { if (cur.ownNumbering) return cur; cur = cur.parentId ? nodeById(b, cur.parentId) : null; }
  return b.numbering === 'perChapter' ? chapterNode(b, n) : null;
}
/** Every scope a user can type numbers in (for the «which chapter?» selector). */
export function scopesOf(b) {
  const out = [];
  if (b.numbering !== 'perChapter') out.push({ id: null, title: 'شماره‌های کل کتاب' });
  else for (const c of topLevel(b)) out.push({ id: c.id, title: c.title });
  for (const n of b.nodes) if (n.ownNumbering && !(b.numbering === 'perChapter' && !n.parentId)) out.push({ id: n.id, title: n.title, own: true });
  return out;
}
export const hasScopes = b => b.numbering === 'perChapter' || b.nodes.some(n => n.ownNumbering);

/** Give every scope node a stable number (never reused). Returns a NEW book if anything changed. */
export function ensureScopeNos(b) {
  let max = Math.max(0, ...b.nodes.map(n => n.scopeNo || 0)); let changed = false;
  const need = new Set();
  if (b.numbering === 'perChapter') topLevel(b).forEach(c => need.add(c.id));
  b.nodes.forEach(n => n.ownNumbering && need.add(n.id));
  const nodes = b.nodes.map(n => { if (need.has(n.id) && !n.scopeNo) { changed = true; return { ...n, scopeNo: ++max }; } return n; });
  return changed ? { ...b, nodes } : b;
}
export function scopeNoById(b, scopeId) { if (!scopeId) return 0; const n = nodeById(b, scopeId); return n?.scopeNo || 0; }
export const toInternal = (b, scopeId, printed) => scopeNoById(b, scopeId) * SCOPE + (+printed);
export const printedOf = num => num % SCOPE;
export const scopeNoOfNum = num => Math.floor(num / SCOPE);
export function scopeOfNum(b, num) { const k = scopeNoOfNum(num); return k ? b.nodes.find(n => n.scopeNo === k) || null : null; }
/** Short Persian label of a question: «۱۵» or «۱۵ · ف۲» in per-chapter books. */
export function qLabel(b, num, { long = false } = {}) {
  if (num == null) return '';
  const p = toFa(printedOf(num)); const sc = b ? scopeOfNum(b, num) : null; if (!sc) return p;
  const m = String(sc.title).match(/فصل\s*([0-9۰-۹]+)/);
  const tag = m ? `ف${toFa(m[1])}` : (long ? sc.title : sc.title.slice(0, 12));
  return long ? `${p} (${sc.title})` : `${p}·${tag}`;
}
export const rangeLabel = (b, from, to) => `${toFa(printedOf(from))} تا ${toFa(printedOf(to))}${scopeOfNum(b, from) ? ` (${scopeOfNum(b, from).title})` : ''}`;

// ---------- difficulty levels (e.g. نشر الگو: سطح ۱/۲/۳ per بخش) ----------
export function levelOf(b, node, num) {
  if (!b?.levels || !node?.levels?.length) return null;
  const l = node.levels.find(x => num >= x.from && num <= x.to); return l ? l.L : null;
}
/** Validate and normalize level ranges of a node → {ok, levels, qStart, qEnd} or {ok:false, error}. */
export function normalizeLevels(levels) {
  const ls = levels.filter(l => l.from && l.to).map(l => ({ L: +l.L, from: +l.from, to: +l.to })).sort((a, z) => a.from - z.from);
  if (!ls.length) return { ok: false, error: 'حداقل یک سطح را وارد کن.' };
  for (const l of ls) if (l.from > l.to) return { ok: false, error: `بازه ${LEVEL_FA[l.L]} نامعتبر است.` };
  for (let i = 1; i < ls.length; i++) if (ls[i].from <= ls[i - 1].to) return { ok: false, error: 'بازه سطح‌ها روی هم افتاده‌اند.' };
  return { ok: true, levels: ls, qStart: ls[0].from, qEnd: ls.at(-1).to };
}

// ---------- exam-like coverage (TB-7) ----------
/** Default coverage: topic leaves between the previous exam-like node (same parent chain) and this one, in book order. */
export function defaultCovers(b, node) {
  const ordered = [...b.nodes].sort((a, z) => a.order - z.order); const i = ordered.findIndex(n => n.id === node.id);
  const out = [];
  const sameChapter = node.parentId ? chapterNode(b, node) : null;
  for (let k = i - 1; k >= 0; k--) {
    const n = ordered[k];
    if (isExamLike(n) && n.kind === node.kind && n.kind !== 'mixed') break;
    if (sameChapter && chapterNode(b, n)?.id !== sameChapter.id) break;
    if (n.isLeaf && n.kind === 'topic') out.unshift(n.id);
  }
  if (!out.length && node.kind === 'mixed' && node.parentId) return b.nodes.filter(n => n.parentId === node.parentId && n.isLeaf && n.kind === 'topic').map(n => n.id);
  return out;
}
export const coversOf = (b, node) => (node?.covers?.length ? node.covers : defaultCovers(b, node)).filter(id => nodeById(b, id));

// ---------- textbook refs ----------
const digits = t => String(t).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
/** Best-effort mapping of a book's chapters/lessons to textbook node ids by «فصل N» / «درس M» numbers. */
export function autoRefs(b, tb) {
  if (!tb?.nodes?.length) return b;
  const chOf = n => { const m = digits(n.title).match(/فصل\s*(\d+)/); return m ? +m[1] : null; };
  const lsOf = n => { const m = digits(n.title).match(/درس\s*(\d+)|^(\d+)[-.]/); return m ? +(m[1] || m[2]) : null; };
  const nodes = b.nodes.map(n => {
    if (n.tbRefs?.length) return n;
    const ch = chapterNode(b, n); const c = ch ? chOf(ch) : null; if (!c) return n;
    const cRef = `${tb.id}/c${c}`; if (!tb.nodes.some(x => x.id === cRef)) return n;
    if (n.id === ch.id) return { ...n, tbRefs: [cRef] };
    const l = lsOf(n); const cand = tb.nodes.find(x => x.id.startsWith(cRef + '/') && x.order === l && x.depth === 1);
    return { ...n, tbRefs: [cand ? cand.id : cRef] };
  });
  return { ...b, nodes, textbookId: b.textbookId || tb.id };
}
/** Effective refs of a node: own refs, else nearest ancestor's. */
export function refsOf(b, n) { let cur = n; while (cur) { if (cur.tbRefs?.length) return cur.tbRefs; cur = cur.parentId ? nodeById(b, cur.parentId) : null; } return b.textbookId ? [b.textbookId] : []; }

// ---------- numbering mode conversion (keeps every attempt; TB-T2) ----------
/** Convert a book between global and per-chapter numbering. Returns {ok, map(old→new), book} or {ok:false, error}. */
export function convertNumbering(b, mode) {
  if (b.numbering === mode) return { ok: true, map: {}, book: b };
  let nb = ensureScopeNos({ ...b, numbering: mode });
  const map = {}; const used = new Set();
  const leavesR = b.nodes.filter(n => n.qStart != null);
  for (const n of leavesR) for (let q = n.qStart; q <= n.qEnd; q++) {
    const printed = printedOf(q); const sc = scopeNodeOf(nb, nodeById(nb, n.id)); const nq = scopeNoById(nb, sc?.id) * SCOPE + printed;
    if (used.has(nq)) return { ok: false, error: `شماره ${toFa(printed)} در دو مبحث تکرار می‌شود؛ تبدیل ممکن نیست.` };
    used.add(nq); map[q] = nq;
  }
  const mv = q => map[q] ?? q;
  // v9: spans are moved by scope (they may contain numbers no leaf owns yet)
  const mvSpan = (n, v) => { const sc = scopeNodeOf(nb, nodeById(nb, n.id)); return scopeNoById(nb, sc?.id) * SCOPE + printedOf(v); };
  nb = { ...nb, nodes: nb.nodes.map(n => { const z = n.span ? { ...n, span: { ...n.span, from: mvSpan(n, n.span.from), to: mvSpan(n, n.span.to) } } : n; return z.qStart == null ? z : { ...z, qStart: mv(z.qStart), qEnd: mv(z.qEnd), levels: z.levels?.map(l => ({ ...l, from: mv(l.from), to: mv(l.to) })) }; }),
    keys: Object.fromEntries(Object.entries(b.keys || {}).map(([k, v]) => [mv(+k), v])) };
  return { ok: true, map, book: nb };
}
/** Apply a number map to everything in state that references questions of a book. */
export function remapState(s, bookId, map) {
  const mv = q => map[q] ?? q; const re = obj => obj ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [mv(+k), v])) : obj;
  const sessions = s.sessions.map(x => x.bookId !== bookId || x.legacy ? x : { ...x, answers: re(x.answers), guesses: re(x.guesses), reasons: re(x.reasons), reasonAt: re(x.reasonAt), ranges: (x.ranges || []).map(r => ({ ...r, from: mv(r.from), to: mv(r.to) })) });
  const reviews = Object.fromEntries(Object.entries(s.reviews || {}).map(([ref, v]) => { const [bid, n] = ref.split(':'); return [bid === bookId ? `${bid}:${mv(+n)}` : ref, v]; }));
  return { ...s, sessions, reviews };
}

// ---------- v9: hierarchical ranges («اول بخش‌های بزرگ، بعد بخش‌های کوچک») ----------
// A parent node (chapter, section) may own a SPAN {from, to} (internal numbers). Leaves keep qStart/qEnd as before, so
// attempts, keys, reviews and analysis never change. Rules: a child's range lies inside its nearest ancestor's span;
// siblings never overlap; a span may not shrink past a child range that is already saved.
export const childrenOf = (b, id) => b.nodes.filter(n => (n.parentId ?? null) === id && n.kind !== 'theory').sort((a, z) => a.order - z.order);
export const rangeOfNode = n => !n ? null : n.isLeaf ? (n.qStart != null ? { from: n.qStart, to: n.qEnd } : null) : (n.span || null);
export const isDescendant = (b, n, anc) => { let cur = n?.parentId ? nodeById(b, n.parentId) : null; while (cur) { if (cur.id === anc.id) return true; cur = cur.parentId ? nodeById(b, cur.parentId) : null; } return false; };
/** Resolve saved exam selections against the current book hierarchy; selected parents expand to topic leaves. */
export function topicLeavesForSelection(b, ids = []) {
  const out = new Set();
  for (const id of ids) {
    const n = nodeById(b, id);
    if (!n) continue;
    if (n.isLeaf && n.kind === 'topic') { out.add(n.id); continue; }
    for (const x of b.nodes) if (x.isLeaf && x.kind === 'topic' && isDescendant(b, x, n)) out.add(x.id);
  }
  return [...out];
}
/** Nearest ancestor (not self) that owns a span. */
export function spanAncestor(b, n) { let cur = n?.parentId ? nodeById(b, n.parentId) : null; while (cur) { if (cur.span) return cur; cur = cur.parentId ? nodeById(b, cur.parentId) : null; } return null; }
/**
 * Current question-count weight for an exam topic. Explicit leaf ranges are exact;
 * if only a parent span is set, its still-unassigned questions are split across
 * descendant topic leaves without their own ranges.
 */
export function questionCountForNode(b, nodeOrId) {
  const n = typeof nodeOrId === 'string' ? nodeById(b, nodeOrId) : nodeOrId;
  if (!b || !n) return { count: null, exact: false, range: null, source: 'missing-node' };
  const own = rangeOfNode(n);
  if (own) return { count: Math.max(0, own.to - own.from + 1), exact: true, range: own, source: 'leaf-range' };
  const ancestor = spanAncestor(b, n);
  if (!ancestor) return { count: null, exact: false, range: null, source: 'unranged' };
  const topics = b.nodes.filter(x => x.isLeaf && x.kind === 'topic' && isDescendant(b, x, ancestor));
  const ranged = topics.filter(x => x.qStart != null);
  const known = ranged.reduce((sum, x) => sum + Math.max(0, x.qEnd - x.qStart + 1), 0);
  const missing = topics.filter(x => x.qStart == null);
  const available = Math.max(0, ancestor.span.to - ancestor.span.from + 1 - known);
  return {
    count: missing.includes(n) && missing.length ? available / missing.length : 0,
    exact: false,
    range: ancestor.span,
    source: 'parent-span-estimate',
    estimated: true,
    knownDescendants: ranged.length,
    missingDescendants: missing.length,
    unassignedQuestions: available,
  };
}
/** Deepest node whose span contains this internal number (for «این شماره‌ها داخل فصل ۲ هستند»). */
export function spanOfNumber(b, num) {
  let best = null; for (const n of b.nodes) if (n.span && num >= n.span.from && num <= n.span.to && (!best || n.depth > best.depth)) best = n; return best;
}
/** Is [from,to] allowed for node n? → { ok } | { ok:false, error } */
export function checkRange(b, n, from, to) {
  if (!(from > 0) || !(to > 0) || from > to) return { ok: false, error: 'بازه نامعتبر است.' };
  const anc = spanAncestor(b, n);
  if (anc && (from < anc.span.from || to > anc.span.to)) return { ok: false, error: `باید داخل بازه «${anc.title}» (${toFa(printedOf(anc.span.from))} تا ${toFa(printedOf(anc.span.to))}) باشد.` };
  const others = b.nodes.filter(x => x.id !== n.id && x.kind !== 'theory' && !isDescendant(b, x, n) && !isDescendant(b, n, x));
  for (const x of others) { const r = rangeOfNode(x); if (r && !(to < r.from || from > r.to)) return { ok: false, error: `با «${x.title}» (${toFa(printedOf(r.from))} تا ${toFa(printedOf(r.to))}) تداخل دارد.` }; }
  if (!n.isLeaf) for (const x of b.nodes.filter(y => isDescendant(b, y, n))) { const r = rangeOfNode(x); if (r && (r.from < from || r.to > to)) return { ok: false, error: `«${x.title}» بازه ${toFa(printedOf(r.from))} تا ${toFa(printedOf(r.to))} دارد و بیرون این بازه می‌افتد.` }; }
  return { ok: true };
}
/** Fill missing spans of parents from their descendants (old books, or after children were entered first). */
export function deriveSpans(b) {
  let changed = false; const nodes = b.nodes.map(n => ({ ...n }));
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const desc = n => nodes.filter(x => { let c = x.parentId ? byId[x.parentId] : null; while (c) { if (c.id === n.id) return true; c = c.parentId ? byId[c.parentId] : null; } return false; });
  for (const n of [...nodes].sort((a, z) => z.depth - a.depth)) {
    if (n.isLeaf || n.span) continue;
    const rs = desc(n).map(x => x.isLeaf ? (x.qStart != null ? [x.qStart, x.qEnd] : null) : x.span ? [x.span.from, x.span.to] : null).filter(Boolean);
    if (rs.length) { n.span = { from: Math.min(...rs.map(r => r[0])), to: Math.max(...rs.map(r => r[1])), derived: true }; changed = true; }
  }
  return changed ? { ...b, nodes } : b;
}
/** Ordered children + the «تا» numbers typed for them → ranges laid back to back from start. Last empty end = parent end. */
export function sequentialRanges(start, ends, parentEnd = null) {
  const out = []; let cur = start;
  ends.forEach((e, i) => { const last = i === ends.length - 1; const to = e ? +e : last && parentEnd ? parentEnd : null; if (to == null) { out.push(null); return; } out.push({ from: cur, to }); cur = to + 1; });
  return out;
}
/** Progress of the two-stage range entry. */
export function rangeProgress(b) {
  const tops = topLevel(b).filter(n => n.kind !== 'theory'); const parents = b.nodes.filter(n => !n.isLeaf && n.kind !== 'theory');
  const lv = b.nodes.filter(n => n.isLeaf && n.kind !== 'theory');
  return { tops: tops.length, topsDone: tops.filter(n => rangeOfNode(n)).length, parents: parents.length, parentsDone: parents.filter(n => n.span).length, leaves: lv.length, leavesDone: lv.filter(n => n.qStart != null).length };
}
