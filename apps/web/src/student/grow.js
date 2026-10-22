// v9 — «اول فصل‌ها، بعد با دقت بیشتر»: when a school textbook gains lessons (added by me, by the hub, or a newer catalog),
// a test book built from its chapters can grow the same detail without losing anything already entered.
import { textbookById } from '@ss/domain/curriculum.js';
import { ensureScopeNos } from '@ss/domain/book.js';

/** What would be added: [{ chapterNode, lessons: [tbNode…] }] */
export function growPlan(b) {
  const tb = textbookById(b?.textbookId); if (!tb) return [];
  const out = [];
  for (const n of b.nodes) {
    if (!n.isLeaf || n.kind !== 'topic' || !n.tbRefs?.length) continue;
    const ref = n.tbRefs[0]; const kids = tb.nodes.filter(x => x.id.startsWith(ref + '/') && x.id.split('/').length === ref.split('/').length + 1);
    const fresh = kids.filter(k => !b.nodes.some(m => m.tbRefs?.includes(k.id)));
    if (fresh.length && !b.nodes.some(m => m.parentId === n.id)) out.push({ node: n, lessons: fresh });
  }
  return out;
}
/** Apply growPlan: the chapter keeps its numbers as a span; its new lessons wait for their own ranges (stage 2). */
export function growBook(b) {
  const plan = growPlan(b); if (!plan.length) return { book: b, added: 0 };
  let nodes = [...b.nodes]; let k = nodes.length; let added = 0;
  const fresh = () => { let id; do { id = 'n' + (++k); } while (nodes.some(n => n.id === id)); return id; };
  for (const { node, lessons } of plan) {
    const i = nodes.findIndex(n => n.id === node.id);
    const kids = lessons.map(l => ({ id: fresh(), title: l.title, kind: 'topic', depth: node.depth + 1, parentId: node.id, isLeaf: true, qStart: null, qEnd: null, tbRefs: [l.id] }));
    const par = { ...nodes[i], isLeaf: false, span: nodes[i].span || (nodes[i].qStart != null ? { from: nodes[i].qStart, to: nodes[i].qEnd } : undefined), qStart: null, qEnd: null, levels: undefined };
    nodes = [...nodes.slice(0, i), par, ...kids, ...nodes.slice(i + 1)]; added += kids.length;
  }
  nodes = nodes.map((n, i) => ({ ...n, order: i }));
  return { book: ensureScopeNos({ ...b, nodes, updatedAt: new Date().toISOString() }), added };
}
