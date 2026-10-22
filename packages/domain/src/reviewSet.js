// SS v13 — Review in sets of N (default 20) instead of card-by-card.
// Flow: build a frozen set from the due queue → the student solves the tests in the book → enters all answers at once →
// we correct with the keys and give every card its FSRS rating automatically (right = good, wrong/blank = again; «not sure» = hard,
// «very easy» = easy). Pure functions: `now` is always a parameter. reviewMode 'card' keeps the v12 one-card UI untouched.
import * as E from './engine.js';
import * as BK from './book.js';
import { reviewQueue, reviewStats, isLeech, chapterOf, label, bookById, nodeForNumber, upcomingExams, uid } from './store.js';

export const REVIEW_SIZES = [10, 15, 20, 25, 30];
export const REVIEW_SET_CAP = 60;
export const setSizeOf = s => (REVIEW_SIZES.includes(s?.settings?.reviewSetSize) ? s.settings.reviewSetSize : 20);
export const splitRef = ref => { const i = String(ref).lastIndexOf(':'); return { bookId: ref.slice(0, i), num: +ref.slice(i + 1) }; };

/** Two consecutive items never share a chapter when an alternative exists. */
export function interleave(items) {
  const pool = [...items]; const out = []; let last = null;
  while (pool.length) { const i = pool.findIndex(x => x.ch !== last); const k = i < 0 ? 0 : i; out.push(pool[k]); last = pool[k].ch; pool.splice(k, 1); }
  return out;
}
const deco = x => ({ ...x, ch: x.b && x.node ? chapterOf(x.b, x.node)?.id ?? null : null });

/** The list of cards a mode would show (same logic as the v12 Review page, moved here so it can be tested). */
export function listForMode(s, atts, { mode = 'today', subject = null, type = null, now = Date.now(), exclude = null } = {}) {
  const q = reviewQueue(s, atts, now); const st = reviewStats(s, q.all, now); const exam = upcomingExams(s)[0];
  let base = mode === 'leech' ? q.all.filter(x => isLeech(x.item)) : mode === 'starred' ? [...q.all.filter(x => x.starred)].sort((a, z) => a.due - z.due) : q.dueNow;
  base = base.map(deco).filter(x => x.b && x.b.active !== false); // an inactive book never enters a set
  if (mode === 'starred') base = interleave(base);
  if (mode === 'exam' && exam) { const ids = new Set(exam.sections.flatMap(sec => sec.nodeIds.map(n => sec.bookId + '|' + n))); base = base.filter(x => ids.has(x.a.bookId + '|' + x.a.nodeId)); }
  if (subject) base = base.filter(x => x.b?.subject === subject);
  if (type) base = base.filter(x => x.a.result === type);
  if (mode === 'today') { const left = Math.max(0, (s.settings.reviewLimit ?? 40) - st.todayDone); let newLeft = s.settings.reviewNewLimit ?? 20; base = base.filter(x => !x.isNew || newLeft-- > 0).slice(0, left); }
  if (mode === 'mixed') base = interleave(base);
  if (exclude?.size) base = base.filter(x => !exclude.has(x.ref));
  return { list: base, q, st };
}
/** Refs that are already in an open set / an active redo plan today (never duplicated). */
export function busyRefs(s) { const out = new Set(s.reviewSet?.refs || []); for (const p of s.redo?.plans || []) if (p.status === 'active') for (const st of p.sets || []) if (st.status !== 'done') for (const r of st.refs) out.add(r); return out; }

/** Build a frozen set. refs/order never change afterwards, even if the queue changes. */
export function buildReviewSet(s, atts, { mode = 'today', subject = null, type = null, size = setSizeOf(s), now = Date.now(), exclude = null, kind = 'review', refs: given = null } = {}) {
  let picked;
  if (given) picked = given.map(ref => { const { bookId, num } = splitRef(ref); const b = bookById(s, bookId); const node = b ? nodeForNumber(b, num) : null; return { ref, b, node, a: { bookId, num, nodeId: node?.id }, item: s.reviews?.[ref] || null, isNew: !s.reviews?.[ref], ch: b && node ? chapterOf(b, node)?.id ?? null : null }; }).filter(x => x.b && x.b.active !== false).slice(0, size);
  else picked = listForMode(s, atts, { mode, subject, type, now, exclude: exclude || busyRefs(s) }).list.slice(0, size);
  const items = interleave(picked);
  const secPerQ = E.userMedianSecPerQ(s.sessions || [], now, null) ?? 72;
  const byBook = new Map(); for (const x of [...picked].sort((a, z) => a.a.num - z.a.num)) { const k = x.a.bookId; (byBook.get(k) || byBook.set(k, []).get(k)).push(x); }
  const groups = [...byBook.entries()].map(([bookId, xs]) => ({ bookId, title: xs[0].b?.title || '', subject: xs[0].b?.subject || '', items: xs.map(x => ({ ref: x.ref, num: x.a.num, label: BK.qLabel(x.b, x.a.num), topic: x.node ? label(x.b, x.node) : '' })) }));
  return { id: uid(), kind, mode, createdAt: now, startedAt: null, refs: items.map(x => x.ref), order: items.map(x => x.ref), groups, answers: {}, guess: {}, mark: {}, reasons: {}, status: 'open', minutes: null,
    meta: { n: items.length, newCount: picked.filter(x => x.isNew).length, leechCount: picked.filter(x => isLeech(x.item)).length, estMinutes: Math.max(1, Math.round(items.length * secPerQ / 60)) } };
}
/** Open a set (idempotent per kind: only one open set at a time). */
export const openSet = (s, set) => ({ ...s, reviewSet: set });
export const patchOpenSet = (s, patch) => (s.reviewSet ? { ...s, reviewSet: { ...s.reviewSet, ...patch } } : s);
export const startSet = (s, now) => (s.reviewSet && !s.reviewSet.startedAt ? patchOpenSet(s, { startedAt: now }) : s);
export const setAnswer = (s, ref, v) => (s.reviewSet ? patchOpenSet(s, { answers: { ...s.reviewSet.answers, [ref]: v } }) : s);
export const discardSet = s => ({ ...s, reviewSet: null });

/** «۳۱۴۰۲…» → answers by solving order. */
export function parseSetAnswers(str, order) {
  const r = E.parseAnswerString(str, order.length); if (!r.ok) return r;
  return { ok: true, answers: Object.fromEntries(order.map((ref, i) => [ref, r.values[i]])) };
}
/** result: C/W/B. «not sure» (guess/hard) → 2, «very easy» → 4, otherwise right → 3, wrong or blank → 1. Flagged sets never rate above 3. */
export function ratingFor(result, { guess = false, mark = null, flagged = false } = {}) {
  if (result === 'U') return null; if (result === 'W' || result === 'B') return 1;
  let r = mark === 'easy' ? 4 : (mark === 'hard' || guess) ? 2 : 3; if (flagged) r = Math.min(r, 3); return r;
}
const fsrsDecay = s => E.FSRS_PARAMS[s.settings?.fsrs]?.decay ?? -0.5;

/** Correct and rate a set. Returns { s2, report, duplicate }. Re-submitting the same set id changes nothing. */
export function gradeReviewSet(s, set, { now = Date.now(), durationSec = null, partial = false } = {}) {
  if ((s.reviewSets || []).some(x => x.id === set.id)) return { s2: s, report: null, duplicate: true };
  const refs = set.order.filter(r => partial ? set.answers[r] !== undefined : true);
  const rows = []; const results = [];
  for (const ref of refs) {
    const { bookId, num } = splitRef(ref); const b = bookById(s, bookId); if (!b || b.active === false) continue;
    const chosen = set.answers[ref] || 0; const key = b.keys?.[num] ?? null; const result = E.correct(chosen, key);
    const node = nodeForNumber(b, num); results.push(result); rows.push({ ref, num, bookId, b, node, key, chosen, result });
  }
  const st = E.stats(results); const answeredVals = rows.map(r => r.chosen);
  const secPerQ = durationSec && rows.length ? durationSec / rows.length : null; const flags = E.antiGamingFlags(st, secPerQ, answeredVals); const flagged = flags.length > 0;
  const decay = fsrsDecay(s); const reviews = { ...s.reviews }; const prevReviews = {}; const ratings = { 1: 0, 2: 0, 3: 0, 4: 0 }; const manual = [];
  // previous attempt per ref (for «improved»)
  const prevRes = {}; for (const ses of s.sessions || []) { if (ses.legacy) continue; const bk = bookById(s, ses.bookId); if (!bk) continue; for (const [n, ch] of Object.entries(ses.answers || {})) prevRes[`${bk.id}:${n}`] = E.correct(ch, bk.keys?.[+n] ?? null); }
  for (const r of rows) {
    const rating = ratingFor(r.result, { guess: !!set.guess?.[r.ref], mark: set.mark?.[r.ref] || null, flagged });
    r.rating = rating; r.prevResult = prevRes[r.ref] || null;
    if (rating == null) { manual.push(r.ref); continue; }
    const prev = reviews[r.ref]; if (set.kind === 'redo' && !prev) { r.rating = rating; continue; } // redo never creates cards for correct answers
    prevReviews[r.ref] = prev ?? null; const nx = E.fsrsNext(prev || {}, rating, now, decay);
    reviews[r.ref] = { ...nx, note: prev?.note, streak: rating >= 3 ? (prev?.streak || 0) + 1 : 0, history: [...(prev?.history || []), { at: now, rating, retrieved: !flagged, via: 'set', setId: set.id }] };
    r.nextDueAt = nx.dueAt; r.nextIntervalDays = (nx.dueAt - now) / 864e5; ratings[rating]++;
  }
  // one session per book (a session is tied to a single book — R-1)
  const sessions = []; const origin = set.kind === 'redo' ? 'redo' : 'review'; const at = new Date(now).toISOString(); const byBook = {};
  for (const r of rows) (byBook[r.bookId] ||= []).push(r);
  for (const [bookId, rs] of Object.entries(byBook)) {
    const share = rows.length ? (set.minutes ?? (durationSec ? durationSec / 60 : null)) : null; const minutes = share != null ? Math.max(1, Math.round(share * rs.length / rows.length)) : null;
    const nodes = new Set(rs.map(r => r.node?.id).filter(Boolean)); const bk = rs[0].b; const sst = E.stats(rs.map(r => r.result));
    sessions.push({ id: uid(), bookId, nodeId: rs[0].node?.id, ranges: rs.map(r => ({ from: r.num, to: r.num, nodeId: r.node?.id })), answers: Object.fromEntries(rs.map(r => [r.num, r.chosen])),
      guesses: Object.fromEntries(rs.filter(r => set.guess?.[r.ref]).map(r => [r.num, true])), reasons: Object.fromEntries(rs.filter(r => (set.reasons?.[r.ref] || []).length).map(r => [r.num, set.reasons[r.ref]])),
      minutes, timeSource: durationSec ? 'timer' : 'none', secPerQ: E.secPerQ(minutes ? minutes * 60 : null, sst), subjectId: bk.subjectId ?? null, at, origin, reviewSetId: set.id, mixed: nodes.size >= 3, flags });
  }
  const sstAll = E.stats(results); const improved = rows.filter(r => r.result === 'C' && ['W', 'B'].includes(r.prevResult)).length; const regressed = rows.filter(r => r.result === 'W' && r.prevResult === 'C').length;
  const byTopic = Object.values(rows.reduce((m, r) => { const k = `${r.bookId}|${r.node?.id}`; const o = m[k] ||= { key: k, label: r.node ? `${r.b.subject}، ${label(r.b, r.node)}` : r.b.subject, n: 0, C: 0, W: 0, B: 0 }; o.n++; if (r.result in o) o[r.result]++; return m; }, {}));
  const report = { setId: set.id, kind: set.kind, rows: rows.map(({ b, node, ...x }) => ({ ...x, label: BK.qLabel(b, x.num), topic: node ? label(b, node) : '' })), C: sstAll.C, W: sstAll.W, B: sstAll.B, U: sstAll.U, P: sstAll.P, minutes: set.minutes ?? (durationSec ? Math.round(durationSec / 60) : null),
    flags, improved, regressed, byTopic, ratings, manual, partial };
  const compact = { id: set.id, at: now, kind: set.kind, n: rows.length, C: sstAll.C, W: sstAll.W, B: sstAll.B, U: sstAll.U, P: sstAll.P, minutes: report.minutes, ratings, sessionIds: sessions.map(x => x.id), planId: set.planId || null };
  const remaining = partial ? { ...set, refs: set.refs, order: set.order.filter(r => !refs.includes(r)), answers: Object.fromEntries(Object.entries(set.answers).filter(([r]) => !refs.includes(r))) } : null;
  const s2 = { ...s, reviews, sessions: [...s.sessions, ...sessions], reviewSet: remaining && remaining.order.length ? remaining : null, reviewSets: [...(s.reviewSets || []), compact].slice(-REVIEW_SET_CAP), lastReviewSet: { setId: set.id, prevReviews, sessionIds: compact.sessionIds, at: now } };
  return { s2, report, duplicate: false };
}
/** Undo the last set: reviews restored, sessions removed, history entry dropped. Rewards already given stay (the ledger is append-only, R-3). */
export function undoReviewSet(s) {
  const l = s.lastReviewSet; if (!l) return s; const reviews = { ...s.reviews };
  for (const [ref, prev] of Object.entries(l.prevReviews || {})) { if (prev) reviews[ref] = prev; else delete reviews[ref]; }
  const ids = new Set(l.sessionIds || []);
  return { ...s, reviews, sessions: s.sessions.filter(x => !ids.has(x.id)), reviewSets: (s.reviewSets || []).filter(x => x.id !== l.setId), lastReviewSet: null };
}
/** Manual rating for a keyless (U) row. */
export function rateManual(s, ref, rating, now = Date.now()) {
  const prev = s.reviews?.[ref]; const nx = E.fsrsNext(prev || {}, rating, now, fsrsDecay(s));
  return { ...s, reviews: { ...s.reviews, [ref]: { ...nx, note: prev?.note, streak: rating >= 3 ? (prev?.streak || 0) + 1 : 0, history: [...(prev?.history || []), { at: now, rating, retrieved: true, via: 'manual' }] } } };
}
