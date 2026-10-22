import { describe, it, expect } from 'vitest';
import { initialState, leaves, attemptsOf, examForecast, addDays, todayStr, questionCoverage, isTaught } from '@ss/domain/store.js';
import * as BK from '@ss/domain/book.js';
import { activeSelectableBooks, descendantTopicIds, topicLeafIds, toggleTopicSelection, topicSelectionState, selectedTopicCoverage, liveExamSections } from '../src/student/examSections.js';

describe('exam connects to test-book hierarchy', () => {
  it('offers all active test books and their stable leaf topic ids', () => {
    const s = initialState();
    const books = activeSelectableBooks(s);
    expect(books.length).toBeGreaterThan(0);
    const b = books[0];
    expect(topicLeafIds(b).length).toBeGreaterThan(0);
    expect(topicLeafIds(b).every(id => b.nodes.some(n => n.id === id && n.isLeaf && n.kind === 'topic'))).toBe(true);
  });

  it('selecting a parent subdivision selects only its descendant topic leaves', () => {
    const s = initialState();
    const b = s.books.find(x => x.id === 'chem');
    const parent = b.nodes.find(n => !n.isLeaf && b.nodes.some(c => c.parentId === n.id && c.isLeaf && c.kind === 'topic'));
    const ids = descendantTopicIds(b, parent.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every(id => { const n = b.nodes.find(x => x.id === id); return n.isLeaf && n.kind === 'topic'; })).toBe(true);
    expect(topicSelectionState([], ids)).toBe('none');
    expect(topicSelectionState(ids.slice(0, 1), ids)).toBe(ids.length === 1 ? 'all' : 'some');
    expect(toggleTopicSelection([], ids, true).sort()).toEqual([...ids].sort());
    expect(toggleTopicSelection(ids, ids, false)).toEqual([]);
  });

  it('reports exact selected subdivision and mapped question coverage', () => {
    const s = initialState();
    const b = s.books.find(x => x.id === 'chem');
    const ranged = leaves(b).find(n => n.kind === 'topic' && n.qStart != null);
    if (ranged) {
      const meta = selectedTopicCoverage(b, [ranged.id]);
      expect(meta.selected).toBe(1);
      expect(meta.ranged).toBe(1);
      expect(meta.questions).toBe(ranged.qEnd - ranged.qStart + 1);
    }
  });

  it('routes forecast, sitting results, and analysis through the selected book subdivisions', () => {
    const s = initialState();
    const b = s.books.find(x => x.id === 'chem');
    const ids = topicLeafIds(b).slice(0, 2);
    expect(ids.length).toBe(2);
    const exam = {
      id: 'exam-linked', title: 'آزمون پیوند', kind: 'upcoming', date: addDays(todayStr(), 5), target: 60,
      sections: [{ bookId: b.id, count: 10, nodeIds: ids }], sittings: [],
    };
    const forecast = examForecast({ ...s, exams: [exam] }, exam, attemptsOf(s), { runs: 40 });
    expect(forecast.topics.map(x => x.id)).toEqual(ids.map(id => `${b.id}|${id}`));
    const sitting = {
      id: 'sitting-linked', date: todayStr(), percent: (3 * 5 - 2) / (3 * 10) * 100,
      sections: [{ bookId: b.id, C: 5, W: 2, B: 3, P: (3 * 5 - 2) / (3 * 10) * 100 }],
    };
    const scored = attemptsOf({ ...s, exams: [{ ...exam, kind: 'old', sittings: [sitting] }] })
      .filter(a => a.examId === 'exam-linked');
    expect(scored).toHaveLength(10);
    expect(scored.every(a => ids.includes(a.nodeId))).toBe(true);
  });

  it('recalculates saved exam budgets and forecasts immediately when book ranges change', () => {
    const s = initialState();
    const book = {
      id: 'linked-book', uid: 'linked-book-uid', title: 'کتاب پیوند', subject: 'ریاضی', active: true,
      nodes: [
        { id: 'chapter', title: 'فصل ۱', kind: 'topic', depth: 0, parentId: null, order: 0, isLeaf: false, span: { from: 1, to: 100 } },
        { id: 'topic-a', title: 'مبحث الف', kind: 'topic', depth: 1, parentId: 'chapter', order: 0, isLeaf: true, qStart: 1, qEnd: 20 },
        { id: 'topic-b', title: 'مبحث ب', kind: 'topic', depth: 1, parentId: 'chapter', order: 1, isLeaf: true, qStart: 21, qEnd: 100 },
      ],
      keys: {},
    };
    const exam = { id: 'saved-exam', title: 'آزمون ذخیره‌شده', kind: 'upcoming', date: addDays(todayStr(), 7), target: 60, sections: [{ bookId: book.id, count: 20, nodeIds: ['topic-a', 'topic-b'] }], sittings: [] };
    const beforeState = { ...s, books: [book], exams: [exam] };
    const beforeLive = liveExamSections(beforeState, exam)[0];
    const beforeForecast = examForecast(beforeState, exam, attemptsOf(beforeState), { runs: 40 });
    expect(beforeLive.topics.map(x => x.questions)).toEqual([4, 16]);
    expect(beforeForecast.topics.map(x => x.n)).toEqual([4, 16]);

    const editedBook = { ...book, nodes: book.nodes.map(n => n.id === 'topic-a'
      ? { ...n, qStart: 1, qEnd: 80 }
      : n.id === 'topic-b' ? { ...n, qStart: 81, qEnd: 100 } : n) };
    const afterState = { ...beforeState, books: [editedBook] };
    const afterLive = liveExamSections(afterState, exam)[0];
    const afterForecast = examForecast(afterState, exam, attemptsOf(afterState), { runs: 40 });
    expect(afterLive.topics.map(x => x.questions)).toEqual([16, 4]);
    expect(afterForecast.topics.map(x => x.n)).toEqual([16, 4]);
    expect(afterLive.topics.map(x => x.rangeCount)).toEqual([80, 20]);
  });

  it('uses chapter/section spans when topic leaves do not have their own ranges', () => {
    const book = {
      id: 'span-book', nodes: [
        { id: 'chapter', title: 'فصل ۱', kind: 'topic', depth: 0, parentId: null, order: 0, isLeaf: false, span: { from: 1, to: 100 } },
        { id: 'topic-a', title: 'مبحث الف', kind: 'topic', depth: 1, parentId: 'chapter', order: 0, isLeaf: true, qStart: 1, qEnd: 20 },
        { id: 'topic-b', title: 'مبحث ب', kind: 'topic', depth: 1, parentId: 'chapter', order: 1, isLeaf: true, qStart: null, qEnd: null },
      ],
    };
    const coverage = BK.questionCountForNode(book, 'topic-b');
    expect(coverage.count).toBe(80);
    expect(coverage.estimated).toBe(true);
    expect(coverage.source).toBe('parent-span-estimate');
  });

  it('keeps a saved exam connected when a selected book topic is split into subtopics', () => {
    const s = initialState();
    const book = {
      id: 'split-book', uid: 'split-book', title: 'کتاب تقسیم‌شده', subject: 'فیزیک', active: true, keys: {},
      nodes: [
        { id: 'chapter', title: 'فصل ۱', kind: 'topic', depth: 0, parentId: null, order: 0, isLeaf: false, span: { from: 1, to: 50 } },
        { id: 'parent-topic', title: 'مبحث قدیمی', kind: 'topic', depth: 1, parentId: 'chapter', order: 0, isLeaf: true, qStart: 1, qEnd: 50 },
      ],
    };
    const exam = { id: 'split-exam', title: 'آزمون پایدار', kind: 'upcoming', date: addDays(todayStr(), 3), target: 50, sections: [{ bookId: book.id, count: 10, nodeIds: ['parent-topic'] }], sittings: [] };
    const splitBook = { ...book, nodes: [
      { ...book.nodes[0] },
      { id: 'parent-topic', title: 'مبحث قدیمی', kind: 'topic', depth: 1, parentId: 'chapter', order: 0, isLeaf: false, span: { from: 1, to: 50 } },
      { id: 'sub-a', title: 'زیربخش الف', kind: 'topic', depth: 2, parentId: 'parent-topic', order: 0, isLeaf: true, qStart: 1, qEnd: 20 },
      { id: 'sub-b', title: 'زیربخش ب', kind: 'topic', depth: 2, parentId: 'parent-topic', order: 1, isLeaf: true, qStart: 21, qEnd: 50 },
    ] };
    const state = { ...s, books: [splitBook], exams: [exam] };
    const linked = liveExamSections(state, exam)[0];
    expect(linked.topics.map(x => x.id)).toEqual(['sub-a', 'sub-b']);
    expect(linked.missingTopicIds).toEqual([]);
    const fc = examForecast(state, exam, attemptsOf(state), { runs: 40 });
    expect(fc.topics.map(x => x.id)).toEqual(['split-book|sub-a', 'split-book|sub-b']);
  });

  it('counts unique question coverage, latest answers, blanks, teaching and exact unattempted totals', () => {
    const book = {
      id: 'coverage-book', uid: 'coverage-book', title: 'کتاب پوشش', subject: 'ریاضی', active: true,
      keys: { 1: 1, 2: 2, 3: 1, 41: 1 },
      nodes: [
        { id: 'chapter', title: 'فصل ۱', kind: 'topic', depth: 0, parentId: null, order: 0, isLeaf: false, span: { from: 1, to: 100 } },
        { id: 'topic-a', title: 'مبحث الف', kind: 'topic', depth: 1, parentId: 'chapter', order: 0, isLeaf: true, qStart: 1, qEnd: 40 },
        { id: 'topic-b', title: 'مبحث ب', kind: 'topic', depth: 1, parentId: 'chapter', order: 1, isLeaf: true, qStart: 41, qEnd: 100 },
      ],
    };
    const state = {
      ...initialState(), books: [book], taught: { [book.id]: { chapter: { state: 'taught' } } },
      sessions: [
        { id: 'old', bookId: book.id, at: '2026-10-12T10:00:00Z', answers: { 1: 1, 2: 0, 41: 1 } },
        { id: 'new', bookId: book.id, at: '2026-10-13T10:00:00Z', answers: { 1: 2, 3: 1 } },
      ],
      exams: [],
    };
    const c = questionCoverage(state, book.id);
    expect(c.exact).toBe(true);
    expect(c.totalQuestions).toBe(100);
    expect(c.taughtQuestions).toBe(100);
    expect(c.untaughtQuestions).toBe(0);
    expect(c.recordedQuestions).toBe(4);
    expect(c.answeredQuestions).toBe(3);
    expect(c.blankQuestions).toBe(1);
    expect(c.notAttemptedQuestions).toBe(96);
    expect(c.correctQuestions).toBe(2);
    expect(c.wrongQuestions).toBe(1);
    expect(isTaught(state, book.id, 'topic-a')).toBe(true);
  });

  it('does not claim exact counts when a selected topic has no question range', () => {
    const book = {
      id: 'partial-book', nodes: [
        { id: 'chapter', title: 'فصل ۱', kind: 'topic', depth: 0, parentId: null, order: 0, isLeaf: false, span: { from: 1, to: 100 } },
        { id: 'known', title: 'مبحث بازه‌دار', kind: 'topic', depth: 1, parentId: 'chapter', order: 0, isLeaf: true, qStart: 1, qEnd: 30 },
        { id: 'unknown', title: 'مبحث بی‌بازه', kind: 'topic', depth: 1, parentId: 'chapter', order: 1, isLeaf: true, qStart: null, qEnd: null },
      ],
    };
    const state = { ...initialState(), books: [book], sessions: [], exams: [] };
    expect(questionCoverage(state, book.id, { nodeIds: ['unknown'] }).exact).toBe(false);
    const all = questionCoverage(state, book.id);
    expect(all.exact).toBe(true);
    expect(all.totalQuestions).toBe(100);
  });

  it('reassigns stored aggregate exam results by live question ranges for mastery and planning', () => {
    const s = initialState();
    const book = {
      id: 'result-book', uid: 'result-book', title: 'کتاب نتیجه', subject: 'زیست', active: true, keys: {},
      nodes: [
        { id: 'a', title: 'مبحث الف', kind: 'topic', depth: 0, parentId: null, order: 0, isLeaf: true, qStart: 1, qEnd: 20 },
        { id: 'b', title: 'مبحث ب', kind: 'topic', depth: 0, parentId: null, order: 1, isLeaf: true, qStart: 21, qEnd: 100 },
      ],
    };
    const exam = { id: 'result-exam', title: 'آزمون نتیجه', kind: 'old', date: todayStr(), target: 50, sections: [{ bookId: book.id, count: 20, nodeIds: ['a', 'b'] }], sittings: [{ id: 's1', date: todayStr(), percent: 80, sections: [{ bookId: book.id, C: 10, W: 0, B: 0, P: 100 }] }] };
    let state = { ...s, books: [book], exams: [exam] };
    const before = attemptsOf(state).filter(a => a.examId === exam.id && a.result === 'C');
    expect(before.filter(a => a.nodeId === 'a')).toHaveLength(2);
    expect(before.filter(a => a.nodeId === 'b')).toHaveLength(8);
    const edited = { ...book, nodes: book.nodes.map(n => n.id === 'a' ? { ...n, qEnd: 80 } : { ...n, qStart: 81, qEnd: 100 }) };
    state = { ...state, books: [edited] };
    const after = attemptsOf(state).filter(a => a.examId === exam.id && a.result === 'C');
    expect(after.filter(a => a.nodeId === 'a')).toHaveLength(8);
    expect(after.filter(a => a.nodeId === 'b')).toHaveLength(2);
  });
});
