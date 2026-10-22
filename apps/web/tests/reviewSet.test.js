import { describe, it, expect } from 'vitest';
import * as S from '@ss/domain/store.js';
import * as R from '@ss/domain/reviewSet.js';
import * as H from '@ss/domain/habits.js';

const NOW = Date.now(); const OLD = new Date(NOW - 10 * 864e5).toISOString();
const mkBook = (id, subject = 'ریاضی') => ({ id, uid: id, subject, subjectId: 'riazi', title: 'کتاب ' + id, active: true, numbering: 'global', levels: 0, keys: Object.fromEntries(Array.from({ length: 1200 }, (_, i) => [i + 1, 1])),
  nodes: [{ id: id + 'c1', title: 'فصل ۱', kind: 'chapter', isLeaf: false, parentId: null }, { id: id + 'c2', title: 'فصل ۲', kind: 'chapter', isLeaf: false, parentId: null },
    { id: id + 'n1', title: 'مبحث الف', kind: 'topic', isLeaf: true, parentId: id + 'c1', qStart: 1, qEnd: 300 }, { id: id + 'n2', title: 'مبحث ب', kind: 'topic', isLeaf: true, parentId: id + 'c2', qStart: 301, qEnd: 600 }] });
/** state with wrong answers (all due) on numbers `nums` of book `bk` (old enough to be due now). */
function mk({ books = ['tb'], nums = Array.from({ length: 45 }, (_, i) => (i < 22 ? i + 1 : 301 + i)), at = OLD, extra = {} } = {}) {
  const s = S.initialState(); s.books = books.map(id => mkBook(id));
  s.sessions = [{ id: 'old1', bookId: books[0], nodeId: books[0] + 'n1', answers: Object.fromEntries(nums.map(n => [n, 2])), at, minutes: 30, origin: 'new' }];
  return Object.assign(s, extra);
}
const atts = s => S.attemptsOf(s);
const build = (s, o = {}) => R.buildReviewSet(s, atts(s), { now: NOW, ...o });
const chap = (s, ref) => { const { bookId, num } = R.splitRef(ref); const b = S.bookById(s, bookId); return S.chapterOf(b, S.nodeForNumber(b, num)).id; };

describe('review sets (RV01–RV17)', () => {
  it('RV01 45 due cards, size 20 → a set of 20 with no two neighbours from one chapter', () => {
    const s = mk(); const set = build(s, { mode: 'mixed' }); expect(set.order).toHaveLength(20); const ch = set.order.map(r => chap(s, r));
    for (let i = 1; i < ch.length; i++) expect(ch[i] === ch[i - 1]).toBe(false);
    expect(new Set(set.refs).size).toBe(20); expect(set.meta.estMinutes).toBeGreaterThan(0);
  });
  it('RV02 daily limit 40 with 30 done → at most 10 in the set', () => {
    const s = mk({ extra: { reviews: { 'zz:9': { dueAt: NOW + 1e12, history: Array.from({ length: 30 }, () => ({ at: NOW, rating: 3, retrieved: true })) } } } }); s.settings.reviewLimit = 40;
    expect(build(s).order.length).toBeLessThanOrEqual(10);
  });
  it('RV03 new-card limit 5 → at most 5 new cards', () => { const s = mk(); s.settings.reviewNewLimit = 5; expect(build(s).order.length).toBe(5); });
  it('RV04 the set is frozen: new answers elsewhere do not move it', () => { const s = mk(); const set = build(s); const before = JSON.stringify([set.refs, set.order]); const s2 = { ...s, sessions: [...s.sessions, { id: 'x', bookId: 'tb', nodeId: 'tbn1', answers: { 400: 2 }, at: new Date(NOW).toISOString() }] }; expect(JSON.stringify([set.refs, set.order])).toBe(before); expect(R.openSet(s2, set).reviewSet.order).toEqual(set.order); });
  it('RV05 rating rules', () => {
    expect([R.ratingFor('C'), R.ratingFor('W'), R.ratingFor('B'), R.ratingFor('C', { guess: true }), R.ratingFor('C', { mark: 'easy' }), R.ratingFor('C', { mark: 'hard' }), R.ratingFor('C', { mark: 'easy', flagged: true }), R.ratingFor('U')]).toEqual([3, 1, 1, 2, 4, 2, 3, null]);
  });
  it('RV06 a test without a key is a manual row; its card is untouched', () => {
    const s = mk(); delete s.books[0].keys[5]; const set = build(s, { mode: 'mixed' }); const ref = 'tb:5'; if (!set.order.includes(ref)) { set.order.push(ref); set.refs.push(ref); }
    set.answers = Object.fromEntries(set.order.map(r => [r, 1])); const { s2, report } = R.gradeReviewSet(s, set, { now: NOW }); expect(report.manual).toContain(ref); expect(s2.reviews[ref]).toBeUndefined();
  });
  it('RV07 several books → one session per book with origin review and the set id', () => {
    const s = mk({ books: ['b1', 'b2'] }); s.sessions.push({ id: 'old2', bookId: 'b2', nodeId: 'b2n1', answers: { 1: 2, 2: 2, 3: 2 }, at: OLD, minutes: 5, origin: 'new' });
    const set = build(s); set.answers = Object.fromEntries(set.order.map(r => [r, 1])); const { s2 } = R.gradeReviewSet(s, set, { now: NOW, durationSec: 20 * 60 });
    const made = s2.sessions.filter(x => x.reviewSetId === set.id); expect(made.length).toBe(new Set(set.order.map(r => R.splitRef(r).bookId)).size); expect(made.every(x => x.origin === 'review')).toBe(true);
  });
  it('RV08 every card gets a history entry (retrieved via set); a too-fast set is not «retrieved»', () => {
    const s = mk(); const set = build(s); set.answers = Object.fromEntries(set.order.map((r, i) => [r, i % 4 === 3 ? 2 : 1])); // varied answers (all-same would be flagged by design)
    const a = R.gradeReviewSet(s, set, { now: NOW, durationSec: 20 * 120 }).s2; const h = a.reviews[set.order[0]].history.at(-1); expect(h.via).toBe('set'); expect(h.retrieved).toBe(true); expect(h.setId).toBe(set.id);
    const b = R.gradeReviewSet(s, { ...set, id: 'fast' }, { now: NOW, durationSec: 30 }).s2; expect(b.reviews[set.order[0]].history.at(-1).retrieved).toBe(false); expect(b.sessions.at(-1).flags).toContain('tooFast');
  });
  it('RV09 undo restores cards and sessions; the reward ledger is untouched', () => {
    const s = mk(); const set = build(s); set.answers = Object.fromEntries(set.order.map(r => [r, 1])); const { s2 } = R.gradeReviewSet(s, set, { now: NOW }); const u = R.undoReviewSet(s2);
    expect(Object.keys(u.reviews)).toEqual(Object.keys(s.reviews)); expect(u.sessions.length).toBe(s.sessions.length); expect(u.reviewSets).toHaveLength(0); expect(u.ledger).toEqual(s2.ledger);
  });
  it('RV10 partial entry rates only the answered cards', () => {
    const s = mk(); const set = build(s); const some = set.order.slice(0, 5); set.answers = Object.fromEntries(some.map(r => [r, 1])); const { s2, report } = R.gradeReviewSet(s, set, { now: NOW, partial: true });
    expect(report.rows).toHaveLength(5); expect(Object.keys(s2.reviews).sort()).toEqual([...some].sort()); expect(s2.reviewSet.order).toHaveLength(15);
  });
  it('RV11 a draft is kept; submitting the same id twice changes nothing', () => {
    let s = R.openSet(mk(), build(mk())); s = R.setAnswer(s, s.reviewSet.order[0], 3); expect(s.reviewSet.answers[s.reviewSet.order[0]]).toBe(3);
    const set = { ...s.reviewSet, answers: Object.fromEntries(s.reviewSet.order.map(r => [r, 1])) }; const once = R.gradeReviewSet(s, set, { now: NOW }); const twice = R.gradeReviewSet(once.s2, set, { now: NOW }); expect(twice.duplicate).toBe(true); expect(twice.s2).toBe(once.s2);
  });
  it('RV12 pasted answer string', () => {
    const order = ['a:1', 'a:2', 'a:3', 'a:4', 'a:5']; const ok = R.parseSetAnswers('۳۱۴۰۲', order); expect(ok.answers).toEqual({ 'a:1': 3, 'a:2': 1, 'a:3': 4, 'a:4': 0, 'a:5': 2 });
    expect(R.parseSetAnswers('3140', order).error).toBe('E_KEY_LENGTH'); expect(R.parseSetAnswers('31x02', order).error).toBe('E_KEY_CHAR');
  });
  it('RV13 mastery weight: a review after more than 24h counts fully, within 24h it is a repeat (×0.5)', () => {
    const s = S.initialState(); s.books = [mkBook('tb')]; const t = d => new Date(NOW - d * 864e5).toISOString();
    s.sessions = [{ id: 'a', bookId: 'tb', nodeId: 'tbn1', answers: { 1: 2 }, at: t(5) }, { id: 'b', bookId: 'tb', nodeId: 'tbn1', answers: { 1: 1 }, at: t(2), origin: 'review' }, { id: 'c', bookId: 'tb', nodeId: 'tbn1', answers: { 1: 1 }, at: new Date(NOW - 2 * 864e5 + 3600e3).toISOString(), origin: 'review' }];
    const at = S.attemptsOf(s); expect(at[1].repeatWithin24h).toBe(false); expect(at[2].repeatWithin24h).toBe(true);
  });
  it('RV14 review sessions earn no «session logged» XP, only per-card XP', () => {
    const s = mk(); const set = build(s); set.answers = Object.fromEntries(set.order.map(r => [r, 1])); const s2 = R.gradeReviewSet(s, set, { now: NOW }).s2; s2.settings.rewards = true;
    const add = S.settleRewards(s2); const rv = s2.sessions.filter(x => x.origin === 'review').map(x => x.id); expect(add.some(e => rv.some(id => e.key === 'sl:' + id || e.key === 'mx:' + id))).toBe(false); expect(add.some(e => e.kind === 'reviewDone')).toBe(true);
  });
  it('RV15 card mode: applyReview / undoReview behave as in v12', () => { const s = mk(); const ref = 'tb:1'; const a = S.applyReview(s, ref, 3, true); expect(a.reviews[ref].history).toHaveLength(1); const u = S.undoReview(a); expect(u.reviews[ref]).toBeUndefined(); });
  it('RV16 the «review» habit counts all 20 set cards of today', () => {
    const s = mk(); const set = build(s); set.answers = Object.fromEntries(set.order.map(r => [r, 1])); const s2 = R.gradeReviewSet(s, set, { now: Date.now() }).s2;
    const h = H.newHabit(s2, 'review'); expect(H.autoCheck(s2, h, S.todayStr())).toBe(true);
  });
  it('RV17 an inactive book leaves the set', () => { const s = mk(); s.books[0].active = false; expect(build(s).order).toHaveLength(0); });
});
