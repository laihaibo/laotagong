import type { FamilyState } from "./family";

/**
 * 混合图（亲子边 + 配偶边）遍历的共享底层。
 *
 * 这份逻辑曾同时长在 family.ts（getRelationDistances）与 lineage.ts
 * （computeDistances）两处：一份建了子女索引，另一份逐节点全表扫 parents，
 * 同一个 BFS 一个 O(V+E)、一个 O(V²)。统一到这里后，两个公开函数都是薄封装。
 *
 * 遍历顺序与旧实现逐位一致（邻居按 id 排序、队列 FIFO）——
 * groupByRelationDistance 的分组结果与既有测试都依赖这个确定性。
 */

/** parentId → 直接子女 id 列表（保持 parents 对象的插入序） */
export type ChildIndex = Map<string, string[]>;

/** personId → 配偶 id 列表（保持 spouses 数组的顺序） */
export type SpouseIndex = Map<string, string[]>;

export interface GraphIndexes {
  childIndex: ChildIndex;
  spouseIndex: SpouseIndex;
}

export function buildChildIndex(state: FamilyState): ChildIndex {
  const childIndex: ChildIndex = new Map();
  for (const [childId, entry] of Object.entries(state.parents)) {
    for (const parentId of [entry.fatherId, entry.motherId]) {
      if (!parentId) continue;
      const list = childIndex.get(parentId);
      if (list) list.push(childId);
      else childIndex.set(parentId, [childId]);
    }
  }
  return childIndex;
}

export function buildSpouseIndex(state: FamilyState): SpouseIndex {
  const spouseIndex: SpouseIndex = new Map();
  for (const { a, b } of state.spouses) {
    const la = spouseIndex.get(a);
    if (la) la.push(b);
    else spouseIndex.set(a, [b]);
    const lb = spouseIndex.get(b);
    if (lb) lb.push(a);
    else spouseIndex.set(b, [a]);
  }
  return spouseIndex;
}

export function buildGraphIndexes(state: FamilyState): GraphIndexes {
  return {
    childIndex: buildChildIndex(state),
    spouseIndex: buildSpouseIndex(state),
  };
}

/** X 的直接子女（与 getChildrenIds 同序）；走索引，避免逐次全表扫 */
export function childrenOf(id: string, childIndex: ChildIndex): string[] {
  return childIndex.get(id) ?? [];
}

/** X 的配偶（与 getSpouseIds 同序）；走索引 */
export function spousesOf(id: string, spouseIndex: SpouseIndex): string[] {
  return spouseIndex.get(id) ?? [];
}

/** X 的共同养育者（与 getCoParentIds 同序同结果）；走索引 */
export function coParentsOf(
  state: FamilyState,
  id: string,
  childIndex: ChildIndex
): string[] {
  const result = new Set<string>();
  for (const childId of childrenOf(id, childIndex)) {
    const entry = state.parents[childId];
    if (!entry) continue;
    const other = entry.fatherId === id ? entry.motherId : entry.fatherId;
    if (other && other !== id) result.add(other);
  }
  return [...result];
}

/**
 * 混合图 BFS 距离：父母 −1 · 配偶 0 · 子女 +1，与源点不连通为 null。
 *
 * 世代不落库，这是运行时推导的底层实现；邻居按 id 排序保证确定性，
 * 队列用头指针代替 shift()（数组 shift 是 O(n)，大图上是隐形平方项）。
 */
export function bfsDistances(
  state: FamilyState,
  sourceId: string | null,
  indexes: GraphIndexes
): Map<string, number | null> {
  const distances = new Map<string, number | null>();
  for (const id of Object.keys(state.persons)) distances.set(id, null);
  if (!sourceId || !state.persons[sourceId]) return distances;

  const { childIndex, spouseIndex } = indexes;
  const neighboursOf = (id: string): Array<[string, number]> => {
    const out: Array<[string, number]> = [];
    const p = state.parents[id];
    if (p?.fatherId) out.push([p.fatherId, -1]);
    if (p?.motherId) out.push([p.motherId, -1]);
    for (const childId of childrenOf(id, childIndex)) out.push([childId, 1]);
    for (const spouseId of spousesOf(id, spouseIndex)) out.push([spouseId, 0]);
    return out.sort((x, y) => x[0].localeCompare(y[0]));
  };

  distances.set(sourceId, 0);
  const queue: string[] = [sourceId];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    const base = distances.get(current);
    if (base === null || base === undefined) continue;
    for (const [neighbourId, weight] of neighboursOf(current)) {
      if (distances.get(neighbourId) !== null) continue;
      distances.set(neighbourId, base + weight);
      queue.push(neighbourId);
    }
  }
  return distances;
}

/**
 * 从 root 沿纯亲子边（parents）向下的全部血亲后代（不含 root 自己）。
 *
 * isBloodDescendant 的批量版：一次 BFS 之后逐人判定 O(1)。
 * 与逐人上溯版逐位等价——「id 能沿 parents 上溯碰到 root」与
 * 「root 能沿子女边下行碰到 id」是同一批边的正向与反向。
 */
export function descendantSetOf(
  state: FamilyState,
  rootId: string,
  childIndex: ChildIndex
): Set<string> {
  const seen = new Set<string>();
  const queue: string[] = [rootId];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    for (const childId of childrenOf(current, childIndex)) {
      if (seen.has(childId) || !state.persons[childId]) continue;
      seen.add(childId);
      queue.push(childId);
    }
  }
  seen.delete(rootId);
  return seen;
}

/**
 * id 的祖先集合（含 id 自己），沿 parents 槽位上溯。
 *
 * 注意 isBloodDescendant（lineage.ts）保有**提前退出**的上溯搜索——
 * 命中即停，对近亲远快于全量闭包，因此两者并存是有意的性能取舍，
 * 不是漏归一的重复实现。
 */
export function ancestorClosure(state: FamilyState, id: string): Set<string> {
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    const p = state.parents[cur];
    for (const up of [p?.fatherId, p?.motherId]) {
      if (up && state.persons[up] && !seen.has(up)) {
        seen.add(up);
        stack.push(up);
      }
    }
  }
  return seen;
}

/** 两人是否共享至少一位父母（同父或同母即算） */
export function shareAParent(state: FamilyState, a: string, b: string): boolean {
  const pa = state.parents[a];
  const pb = state.parents[b];
  if (!pa || !pb) return false;
  return Boolean(
    (pa.fatherId && pa.fatherId === pb.fatherId) ||
      (pa.motherId && pa.motherId === pb.motherId)
  );
}
