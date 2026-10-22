import { describe, it, expect } from 'vitest';
import * as S from '@ss/domain/store.js';
import * as BK from '@ss/domain/book.js';
import * as C from '@ss/domain/curriculum.js';
import * as X from '../src/student/exchange.js';
// standalone: a copy of admin/src/hubStore.js lives next to this test
import * as H from './hubStore.js';

const demo = () => S.withDemo();
const chem = s => s.books.find(b => b.id === 'chem');
const calc = s => s.books.find(b => b.id === 'calc');

describe('v6 curriculum', () => {
  it('grades 10–12 have textbooks for both streams (v9: grade 12 TOCs filled)', () => {
    expect(C.textbooksFor(10, 'rf').length).toBeGreaterThan(3);
    expect(C.textbooksFor(11, 'tj').length).toBeGreaterThan(3);
    const g12 = C.textbooksFor(12, 'rf'); expect(g12.length).toBe(5); expect(g12.every(t => !C.isPending(t))).toBe(true); expect(C.textbooksFor(12, 'tj').length).toBe(4);
    expect(C.subjectsFor(12, 'rf').map(x => x.id)).toContain('gosaste');
  });
  it('skeleton keeps textbook refs and linked topics are related across streams', () => {
    const sk = C.skeletonFromTextbook(C.textbookById('tb.10.fizik1.rf'));
    expect(sk[0].tbRefs).toEqual(['tb.10.fizik1.rf/c1']); expect(sk.some(n => n.kind === 'problemSet')).toBe(false);
    expect(C.refSimilarity(['tb.10.fizik1.rf/c1/s1'], ['tb.10.fizik1.tj/c1/s1'])).toBe(1);
  });
});

describe('v6 numbering per chapter (مبتکران شیمی)', () => {
  it('seed chem book numbers each chapter from 1 and the same printed number lives in two chapters', () => {
    const s = S.initialState(); const b = chem(s);
    expect(b.numbering).toBe('perChapter');
    const [c1, c2] = BK.topLevel(b);
    const q1 = BK.toInternal(b, c1.id, 15), q2 = BK.toInternal(b, c2.id, 15);
    expect(q1).not.toBe(q2); expect(BK.printedOf(q1)).toBe(15); expect(BK.printedOf(q2)).toBe(15);
    expect(BK.qLabel(b, q2)).toContain('ف');
  });
  it('ranges in different chapters never overlap and mapRange stays inside a chapter', () => {
    const s = S.initialState(); let b = chem(s); const [c1, c2] = BK.topLevel(b);
    const leaf1 = S.leaves(b).find(n => BK.chapterNode(b, n).id === c1.id && n.kind === 'topic');
    const leaf2 = S.leaves(b).find(n => BK.chapterNode(b, n).id === c2.id && n.kind === 'topic');
    b = { ...b, nodes: b.nodes.map(n => n.id === leaf1.id ? { ...n, qStart: BK.toInternal(b, c1.id, 1), qEnd: BK.toInternal(b, c1.id, 30) } : n.id === leaf2.id ? { ...n, qStart: BK.toInternal(b, c2.id, 1), qEnd: BK.toInternal(b, c2.id, 30) } : n) };
    expect(S.rangeOverlap(b, leaf2.id, BK.toInternal(b, c2.id, 1), BK.toInternal(b, c2.id, 30))).toBe(null);
    const m = S.mapRange(b, BK.toInternal(b, c2.id, 5), BK.toInternal(b, c2.id, 10));
    expect(m.parts[0].nodeId).toBe(leaf2.id); expect(m.gaps.length).toBe(0);
  });
  it('converting a global book to per-chapter keeps every attempt', () => {
    const s = demo(); const b = calc(s); const before = S.attemptsOf(s).filter(a => a.bookId === 'calc' && a.num != null).length;
    const r = BK.convertNumbering(b, 'perChapter'); expect(r.ok).toBe(true);
    const s2 = BK.remapState({ ...s, books: s.books.map(x => x.id === 'calc' ? r.book : x) }, 'calc', r.map);
    const after = S.attemptsOf(s2).filter(a => a.bookId === 'calc' && a.num != null);
    expect(after.length).toBe(before); expect(after.every(a => a.nodeId)).toBe(true);
  });
});

describe('v6 difficulty levels (الگو حسابان)', () => {
  it('seed calc book has 3 levels; attempts carry level and weight; next block climbs levels', () => {
    let s = demo(); let b = calc(s); expect(b.levels).toBe(3);
    const leaf = S.leaves(b).find(n => n.qStart != null && n.kind === 'topic');
    const len = leaf.qEnd - leaf.qStart + 1, a = Math.floor(len / 3);
    const levels = [{ L: 1, from: leaf.qStart, to: leaf.qStart + a - 1 }, { L: 2, from: leaf.qStart + a, to: leaf.qStart + 2 * a - 1 }, { L: 3, from: leaf.qStart + 2 * a, to: leaf.qEnd }];
    s = { ...s, books: s.books.map(x => x.id === 'calc' ? { ...x, nodes: x.nodes.map(n => n.id === leaf.id ? { ...n, levels } : n) } : x) }; b = calc(s);
    expect(BK.levelOf(b, b.nodes.find(n => n.id === leaf.id), leaf.qEnd)).toBe(3);
    const strong = S.nextBlockFor(s, [], b, b.nodes.find(n => n.id === leaf.id), 5, { mastery: 0.9 }); expect(strong.level).toBe(3);
    const weak = S.nextBlockFor(s, [], b, b.nodes.find(n => n.id === leaf.id), 5, { mastery: 0.2 }); expect(weak.level).toBe(1);
    expect(BK.normalizeLevels([{ L: 1, from: 10, to: 20 }, { L: 2, from: 15, to: 30 }]).ok).toBe(false);
  });
});

describe('v6 exam-like sections cover chosen topics', () => {
  it('checkup results are attributed to the covered topics, not to the checkup node', () => {
    const s = demo(); const b = chem(s); const ck = b.nodes.find(n => n.kind === 'checkup');
    const cov = BK.coversOf(b, ck); expect(cov.length).toBeGreaterThan(0);
    const sc = BK.scopeNodeOf(b, ck);
    const from = BK.toInternal(b, sc?.id, 900), to = from + 9;
    const b2 = { ...b, nodes: b.nodes.map(n => n.id === ck.id ? { ...n, qStart: from, qEnd: to, covers: cov.slice(0, 2) } : n), keys: { ...b.keys, ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [from + i, 1])) } };
    const ses = { id: 'x', bookId: 'chem', nodeId: ck.id, ranges: [{ nodeId: ck.id, from, to }], answers: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [from + i, 1])), guesses: {}, reasons: {}, minutes: 15, at: new Date().toISOString() };
    const s2 = { ...s, books: s.books.map(x => x.id === 'chem' ? b2 : x), sessions: [...s.sessions, ses] };
    const { res } = S.topicMastery(s2, S.attemptsOf(s2));
    expect(res[`chem|${ck.id}`]).toBeUndefined();
    expect(res[`chem|${cov[0]}`]).toBeDefined();
  });
});

describe('v6 planner', () => {
  const week = () => S.daysFromTo(S.todayStr(), S.weekEnd(S.todayStr()));
  it('proposal covers only the current week and never Thursday/Friday', () => {
    const s = demo(); s.placements = []; const r = S.proposeWeek(s, S.attemptsOf(s));
    expect(r.drafts.every(p => p.date <= S.weekEnd(S.todayStr()))).toBe(true);
    expect(r.drafts.some(p => S.isOffDay(s, p.date))).toBe(false);
  });
  it('outline spans later weeks, skips catch-up days, and is rebuilt without touching approved items', () => {
    const s = demo(); const approved = s.placements.filter(p => p.status === 'approved').map(p => p.id).sort();
    const o = S.planOutline(s, S.attemptsOf(s), 4);
    expect(o.every(p => p.status === 'outline' && p.date > S.weekEnd(S.todayStr()))).toBe(true);
    expect(o.some(p => S.isOffDay(s, p.date))).toBe(false);
    const s2 = S.withOutline(s, o);
    expect(s2.placements.filter(p => p.status === 'approved').map(p => p.id).sort()).toEqual(approved);
  });
  it('approving the current week locks it; unfinished work goes to a catch-up day', () => {
    let s = demo(); s.placements = []; const r = S.proposeWeek(s, S.attemptsOf(s)); s = S.approveDrafts({ ...s, placements: r.drafts });
    expect(s.placements.every(p => p.locked)).toBe(true);
    const y = S.addDays(S.todayStr(), -1);
    s = { ...s, placements: [...s.placements, { id: 'late', date: y, title: 'کار جامانده', minutes: 30, kind: 'تست هدفمند', status: 'approved' }] };
    const cu = S.catchUpMoves(s);
    if (cu.offDays.length) { expect(cu.moves[0].id).toBe('late'); expect(S.isOffDay(s, cu.moves[0].to)).toBe(true); }
  });
  it('a topic in two exams outranks the same topic in one exam', () => {
    const s = demo(); const ex = S.upcomingExams(s)[0];
    const one = S.planCandidates(s, S.attemptsOf(s)).filter(c => c.exams?.length);
    const twin = { ...ex, id: 'twin', title: 'آزمون کلاس', date: S.addDays(ex.date, 3) };
    const two = S.planCandidates({ ...s, exams: [...s.exams, twin] }, S.attemptsOf(s)).filter(c => c.exams?.length);
    const k = one[0].key; const a = one.find(c => c.key === k), b = two.find(c => c.key === k);
    expect(b.exams.length).toBe(2); expect(b.u).toBeGreaterThan(a.u);
  });
  it('days are packed around related topics when possible', () => {
    const s = demo(); s.placements = []; const out = S.packDays(s, S.planCandidates(s, S.attemptsOf(s)), S.daysFromTo(S.addDays(S.weekEnd(S.todayStr()), 1), S.addDays(S.weekEnd(S.todayStr()), 7)));
    expect(out.length).toBeGreaterThan(0); expect(out.some(p => p.related)).toBe(true);
  });
});

describe('v6 hub exchange', () => {
  it('pack → hub → bulletin → student: books arrive inactive, classes and shared exams map onto own books', async () => {
    const a = demo(); a.me = { ...a.me, id: 'stu-a', name: 'علی', consent: { books: true, results: true, compare: true } };
    const pack = await X.buildPack(a); expect(await X.verify(pack)).toBe(true);
    let h = H.initialHub(); const r = await H.importPack(h, pack); expect(r.ok).toBe(true); h = r.hub;
    expect((await H.importPack(h, pack)).ok).toBe(false); // same pack twice
    h = H.addClass(h, { name: 'شیمی آقای الف', kind: 'outside', grade: 11, subjectIds: ['shimi'] }); const cls = h.classes[0];
    h = H.setMember(h, cls.id, 'stu-a', true);
    const lib = H.libraryBooks(h); expect(lib.length).toBeGreaterThan(0); h = { ...h, approved: Object.fromEntries(lib.map(b => [b.uid, true])) };
    h = H.addClassExam(h, { classId: cls.id, title: 'آزمون مشترک شیمی', date: S.addDays(S.todayStr(), 10), sections: [{ textbookId: 'tb.11.shimi2', subjectId: 'shimi', count: 10, tbRefs: ['tb.11.shimi2/c1'] }] });
    const bul = await H.buildBulletin(h); expect(await X.verify(bul)).toBe(true);
    const fresh = S.initialState(); fresh.me = { ...fresh.me, id: 'stu-a' };
    const out = await X.applyBulletin(fresh, bul); expect(out.ok).toBe(true);
    expect(out.state.me.classIds).toContain(cls.id);
    const ex = out.state.exams.find(e => e.hubExamId); expect(ex.sections[0].bookId).toBe('chem'); expect(ex.sections[0].nodeIds.length).toBeGreaterThan(0);
    const tampered = { ...bul, hubName: 'x' }; expect((await X.applyBulletin(fresh, tampered)).ok).toBe(false);
  });
  it('a stranger\'s new book arrives inactive; comparison needs a minimum group', async () => {
    const st = S.initialState(); const nb = { ...S.bookFromSSB('#کتاب: تست\n#ناشر: گاج\n= فصل ۱\n== درس ۱').book, uid: 'u-new' };
    let h = H.initialHub(); h = { ...h, library: { 'u-new': { uid: 'u-new', versions: [{ ...X.shareableBook(nb), from: 'p1' }] } }, approved: { 'u-new': true } };
    const out = await X.applyBulletin(st, await H.buildBulletin(h));
    expect(out.state.books.find(b => b.uid === 'u-new').active).toBe(false);
    expect(Object.keys(H.compareStats(h)).length).toBe(0);
  });
  it('key votes: majority wins, ties are flagged', () => {
    const v = k => ({ uid: 'b', nodes: [], keys: k, updatedAt: '2026-01-01' });
    const m = H.mergeBookVersions({ versions: [{ ...v({ 1: 2, 2: 3 }), from: 'a' }, { ...v({ 1: 2, 2: 4 }), from: 'b' }, { ...v({ 1: 3 }), from: 'c' }] });
    expect(m.keys[1]).toBe(2); expect(m.disputed).toContain(2);
  });
});

describe('v6 migration', () => {
  it('v5 data keeps global numbering if ranges exist and gets a hint', () => {
    const s = demo(); const v5 = { ...s, dataVersion: 5, books: s.books.map(({ numbering, uid, active, levels, subjectId, textbookId, ...b }) => b) };
    const m = S.migrate(v5); const c = chem(m);
    expect(m.dataVersion).toBe(S.DATA_VERSION); expect(c.numbering).toBe('global'); expect(c.numberingHint).toBe('perChapter'); expect(c.active).toBe(true);
    expect(m.sessions.length).toBe(s.sessions.length);
  });
});
