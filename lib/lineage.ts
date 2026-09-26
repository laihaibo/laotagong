import { type FamilyState, getSpouseIds } from "./family";
import {
  ancestorClosure,
  bfsDistances,
  buildGraphIndexes,
} from "./graph";

export type LineageKind =
  | "ego"
  | "paternal"
  | "maternal"
  | "descendant"
  | "sibling"
  | "affinal"
  | "collateral"
  | "orphan";

export type LineageFilter = "all" | "paternal" | "maternal" | "direct";

export const LINEAGE_FILTERS: Array<{ id: LineageFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "paternal", label: "父系" },
  { id: "maternal", label: "母系" },
  { id: "direct", label: "直系" },
];

export function generationLabel(distance: number): string {
  if (!Number.isFinite(distance)) return "未连接";
  if (distance <= -5) return Math.abs(distance) + " 世祖";
  if (distance === -4) return "高祖";
  if (distance === -3) return "曾祖";
  if (distance === -2) return "祖辈";
  if (distance === -1) return "父辈";
  if (distance === 0) return "同辈";
  if (distance === 1) return "子辈";
  if (distance === 2) return "孙辈";
  if (distance === 3) return "曾孙";
  if (distance === 4) return "玄孙";
  return distance + " 世孙";
}

export function pedigreePath(
  state: FamilyState,
  personId: string,
  meId: string | null
): string | null {
  if (!meId || !state.persons[meId]) return null;
  if (personId === meId) return "";
  const prev = new Map<string, { from: string; via: "F" | "M" }>();
  const queue: string[] = [meId];
  const seen = new Set<string>([meId]);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === personId) break;
    const entry = state.parents[current];
    const ups: Array<["F" | "M", string | undefined]> = [
      ["F", entry?.fatherId],
      ["M", entry?.motherId],
    ];
    for (const [via, id] of ups) {
      if (!id || !state.persons[id] || seen.has(id)) continue;
      seen.add(id);
      prev.set(id, { from: current, via });
      queue.push(id);
    }
  }
  if (!seen.has(personId)) return null;
  const parts: string[] = [];
  let cursor = personId;
  while (cursor !== meId) {
    const step = prev.get(cursor);
    if (!step) return null;
    parts.push(step.via);
    cursor = step.from;
  }
  return parts.reverse().join("");
}

export function isPatrilinealPath(path: string | null): boolean {
  return path !== null && path.length > 0 && /^F+$/.test(path);
}
export function isMatrilinealPath(path: string | null): boolean {
  return path !== null && path.length > 0 && /^M+$/.test(path);
}
export function isAncestorPath(path: string | null): boolean {
  return path !== null && path.length > 0 && /^[FM]+$/.test(path);
}
export function pedigreeSortKey(path: string | null): string {
  if (!path) return "9";
  return path.split("").map(function (ch) { return ch === "F" ? "0" : "1"; }).join("");
}

/**
 * 是否「我」的血亲后代：从 personId 沿 parents 槽位**向上**走能碰到 meId。
 *
 * 后代判定绝不能用混合图 BFS 距离（computeDistances）——配偶边权重 0，
 * 「我→老婆→岳父母→妻姐→妻姐的子女」算出来 d=+1，会被误判成我的后代。
 * 必须看这条纯血亲链。
 */
export function isBloodDescendant(
  state: FamilyState,
  personId: string,
  meId: string | null
): boolean {
  if (!meId || personId === meId || !state.persons[personId]) return false;
  const stack = [personId];
  const seen = new Set<string>([personId]);
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    const p = state.parents[cur];
    if (!p) continue;
    if (p.fatherId === meId || p.motherId === meId) return true;
    for (const up of [p.fatherId, p.motherId]) {
      if (up && state.persons[up] && !seen.has(up)) {
        seen.add(up);
        stack.push(up);
      }
    }
  }
  return false;
}

export function computeDistances(state: FamilyState): Map<string, number | null> {
  // 与 family.ts 的 getRelationDistances 共用同一份 BFS（lib/graph.ts）——
  // 这里曾是一份没建子女索引的孪生副本，逐节点全表扫 parents，O(V²)
  return bfsDistances(state, state.meId, buildGraphIndexes(state));
}

/**
 * 一次布局/筛选内共享的派生数据。
 *
 * classifyLineage / collateralSide / sharesCommonAncestor / filterVisibleIds
 * 逐人调用时各自内部都要跑 BFS（谱系路径、祖先闭包、血亲后代判定），
 * 每人 O(V)、全体 O(V²)。把这几样放进一个按人缓存的上下文贯穿全布局，
 * 就从「每人重跑」变成「全图一次」。全部字段可选，缺哪个现算哪个，
 * 不传上下文的行为与旧版逐位一致。
 */
export interface LineageContext {
  distances?: Map<string, number | null>;
  /** pedigreePath 结果按人缓存 */
  paths?: Map<string, string | null>;
  /** 原点（通常是 meId）的全部血亲后代，isBloodDescendant 的 O(1) 查询版 */
  descendants?: Set<string>;
  /** 祖先集合（含本人）按人缓存 */
  ancestors?: Map<string, Set<string>>;
}

/** 兼容旧调用：第 4 参既可以是裸距离表，也可以是完整上下文 */
function normalizeContext(
  input?: Map<string, number | null> | LineageContext
): LineageContext {
  if (!input) return {};
  if (input instanceof Map) return { distances: input };
  return input;
}

function pathOf(
  state: FamilyState,
  personId: string,
  meId: string,
  context: LineageContext
): string | null {
  const cache = context.paths;
  if (!cache) return pedigreePath(state, personId, meId);
  let p = cache.get(personId);
  if (p === undefined) {
    p = pedigreePath(state, personId, meId);
    cache.set(personId, p);
  }
  return p;
}

function isDescendantOfMe(
  state: FamilyState,
  personId: string,
  meId: string,
  context: LineageContext
): boolean {
  if (context.descendants) return context.descendants.has(personId);
  return isBloodDescendant(state, personId, meId);
}

export function classifyLineage(
  state: FamilyState,
  personId: string,
  meId: string | null,
  distancesOrContext?: Map<string, number | null> | LineageContext
): LineageKind {
  if (!meId || !state.persons[meId] || !state.persons[personId]) return "orphan";
  if (personId === meId) return "ego";
  const context = normalizeContext(distancesOrContext);
  const path = pathOf(state, personId, meId, context);
  if (isPatrilinealPath(path)) return "paternal";
  if (isMatrilinealPath(path)) return "maternal";
  if (isAncestorPath(path)) return path!.charAt(0) === "F" ? "paternal" : "maternal";

  const dist = context.distances ?? computeDistances(state);
  const d = dist.get(personId);
  // 与「我」不连通的人不可能有共同祖先（纯血亲边都是混合图的边）
  if (d === null || d === undefined) return "orphan";
  if (d >= 1 && isDescendantOfMe(state, personId, meId, context)) return "descendant";
  const my = state.parents[meId];
  const theirs = state.parents[personId];
  if (my && theirs) {
    const shareFather = Boolean(my.fatherId && my.fatherId === theirs.fatherId);
    const shareMother = Boolean(my.motherId && my.motherId === theirs.motherId);
    if (shareFather || shareMother) return "sibling";
  }
  if (getSpouseIds(state, meId).includes(personId)) return "affinal";
  // 旁系：与我有共同祖先的其余血亲——伯叔姑舅姨、堂表兄弟、侄甥、
  // 伯公祖与远房等都算。只认「与父母共父母」一级会让堂表亲掉进
  // orphan，画布上既没有亲系色、布局排序也被甩到最右边。
  if (sharesCommonAncestor(state, personId, meId, context)) return "collateral";
  return "orphan";
}

/** 双方沿 parents 上溯的祖先集合（含本人）是否有交集 */
export function sharesCommonAncestor(
  state: FamilyState,
  personId: string,
  meId: string | null,
  context?: LineageContext
): boolean {
  if (!meId || !state.persons[meId] || !state.persons[personId]) return false;
  const mine = ancestorSetWithSelf(state, meId, context?.ancestors);
  const theirs = ancestorSetWithSelf(state, personId, context?.ancestors);
  for (const id of theirs) {
    if (mine.has(id)) return true;
  }
  return false;
}

function ancestorSetWithSelf(
  state: FamilyState,
  id: string,
  cache?: Map<string, Set<string>>
): Set<string> {
  const cached = cache?.get(id);
  if (cached) return cached;
  // 遍历核心统一在 lib/graph.ts；这里只负责按上下文缓存
  const seen = ancestorClosure(state, id);
  cache?.set(id, seen);
  return seen;
}

export function collateralSide(
  state: FamilyState,
  personId: string,
  meId: string | null,
  context?: LineageContext
): "paternal" | "maternal" | "other" {
  if (!meId) return "other";
  const meParents = state.parents[meId];
  if (!meParents) return "other";
  // 先看共同祖先落在父系链还是母系链：姑姑的孩子（共同祖先=爷爷）
  // 算父系，姨妈的孩子（共同祖先=外公）算母系。一级旁系的老判定自然被覆盖。
  const theirs = ancestorSetWithSelf(state, personId, context?.ancestors);
  if (meParents.fatherId) {
    for (const id of ancestorSetWithSelf(state, meParents.fatherId, context?.ancestors)) {
      if (theirs.has(id)) return "paternal";
    }
  }
  if (meParents.motherId) {
    for (const id of ancestorSetWithSelf(state, meParents.motherId, context?.ancestors)) {
      if (theirs.has(id)) return "maternal";
    }
  }
  return "other";
}

export function filterVisibleIds(
  state: FamilyState,
  filter: LineageFilter,
  maxDepth: number,
  sharedContext?: LineageContext
): Set<string> {
  const ids = Object.keys(state.persons);
  const meId = state.meId;
  const visible = new Set<string>();
  if (!meId || !state.persons[meId]) {
    for (const id of ids) visible.add(id);
    return visible;
  }
  const context: LineageContext = { ...normalizeContext(sharedContext) };
  if (!context.distances) context.distances = computeDistances(state);
  if (!context.paths) context.paths = new Map();
  const distances = context.distances;
  visible.add(meId);
  for (const s of getSpouseIds(state, meId)) visible.add(s);
  const my = state.parents[meId];

  for (const id of ids) {
    const d = distances.get(id);
    const disconnected = d === null || d === undefined;

    if (filter === "all") {
      if (disconnected || Math.abs(d as number) <= maxDepth) visible.add(id);
      continue;
    }
    if (disconnected || Math.abs(d as number) > maxDepth) continue;

    const path = pathOf(state, id, meId, context);
    const lineage = classifyLineage(state, id, meId, context);

    if (filter === "direct") {
      const directAncestor =
        (isPatrilinealPath(path) || isMatrilinealPath(path)) && (d as number) < 0;
      const isParents = Boolean(my && (id === my.fatherId || id === my.motherId));
      if (
        id === meId ||
        directAncestor ||
        isParents ||
        isDescendantOfMe(state, id, meId, context)
      ) {
        visible.add(id);
      }
      continue;
    }
    if (filter === "paternal") {
      const keep =
        isPatrilinealPath(path) ||
        isDescendantOfMe(state, id, meId, context) ||
        lineage === "sibling" ||
        lineage === "affinal" ||
        (lineage === "collateral" && collateralSide(state, id, meId, context) === "paternal");
      if (keep) visible.add(id);
      if (my && id === my.fatherId && my.motherId) visible.add(my.motherId);
      continue;
    }
    if (filter === "maternal") {
      const keep =
        isMatrilinealPath(path) ||
        isDescendantOfMe(state, id, meId, context) ||
        lineage === "sibling" ||
        lineage === "affinal" ||
        (lineage === "collateral" && collateralSide(state, id, meId, context) === "maternal");
      if (keep) visible.add(id);
      if (my && id === my.motherId && my.fatherId) visible.add(my.fatherId);
    }
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const id of Array.from(visible)) {
      for (const s of getSpouseIds(state, id)) {
        if (!visible.has(s)) {
          visible.add(s);
          grew = true;
        }
      }
    }
  }
  return visible;
}
