// Shared exam ↔ test-book contract. The exam forecast consumes stable leaf-topic IDs
// from the learner's selected book; the hierarchy stays owned by that book.
import * as BK from '@ss/domain/book.js';
import { label, leaves, questionCoverage } from '@ss/domain/store.js';

export const selectableBooks = state => (state.books || []).filter(book => book?.nodes?.length);
export const activeSelectableBooks = state => selectableBooks(state).filter(book => book.active !== false);
export const topicLeafIds = book => leaves(book).filter(node => node.kind === 'topic').map(node => node.id);

export function descendantTopicIds(book, parentId) {
  const out = [];
  const visit = id => {
    for (const node of book.nodes.filter(x => (x.parentId ?? null) === id).sort((a, b) => a.order - b.order)) {
      if (node.isLeaf && node.kind === 'topic') out.push(node.id);
      else visit(node.id);
    }
  };
  visit(parentId);
  return out;
}

export function toggleTopicSelection(selectedIds, targetIds, checked) {
  const target = new Set(targetIds);
  return checked
    ? [...new Set([...selectedIds, ...targetIds])]
    : selectedIds.filter(id => !target.has(id));
}

export function topicSelectionState(selectedIds, targetIds) {
  if (!targetIds.length) return 'empty';
  const count = targetIds.filter(id => selectedIds.includes(id)).length;
  return count === 0 ? 'none' : count === targetIds.length ? 'all' : 'some';
}

/** Human-checkable coverage metadata shared by the exam builder and planner. */
export function selectedTopicCoverage(book, selectedIds) {
  const selected = new Set(selectedIds);
  const topics = leaves(book).filter(n => n.kind === 'topic' && selected.has(n.id));
  const weights = topics.map(n => BK.questionCountForNode(book, n));
  return {
    selected: topics.length,
    ranged: weights.filter(x => x.count != null).length,
    questions: weights.reduce((sum, x) => sum + (x.count || 0), 0),
    estimated: weights.some(x => x.estimated),
    unavailable: weights.filter(x => x.count == null).length,
  };
}

/** Resolve saved exam blueprint IDs against the live book ranges every render. */
export function liveExamSections(state, exam) {
  return (exam?.sections || []).map(section => {
    const book = state.books.find(b => b.id === section.bookId);
    if (!book) return { ...section, book: null, missingBook: true, topics: [], missingTopicIds: section.nodeIds || [] };
    const resolvedIds = BK.topicLeavesForSelection(book, section.nodeIds || []);
    const missingTopicIds = (section.nodeIds || []).filter(id => !book.nodes.some(x => x.id === id));
    const nodes = resolvedIds.map(id => book.nodes.find(n => n.id === id)).filter(Boolean);
    const ranges = nodes.map(n => BK.questionCountForNode(book, n.id));
    const coverage = questionCoverage(state, book.id, { nodeIds: resolvedIds });
    const sizes = ranges.map(x => x.count ?? 10);
    const total = sizes.reduce((a, x) => a + x, 0);
    const raw = sizes.map(x => (section.count || 0) * x / (total || Math.max(1, sizes.length)));
    const questions = raw.map(Math.floor);
    let remain = (section.count || 0) - questions.reduce((a, x) => a + x, 0);
    raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).slice(0, remain).forEach(([, i]) => questions[i]++);
    return {
      ...section, book, missingBook: false, missingTopicIds, resolvedNodeIds: resolvedIds,
      coverage,
      topics: nodes.map((node, i) => ({
        id: node.id, node, title: label(book, node), questions: questions[i],
        range: ranges[i].range, rangeCount: ranges[i].count, rangeSource: ranges[i].source,
        exact: ranges[i].exact, estimated: ranges[i].estimated,
      })),
    };
  });
}
