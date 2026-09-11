import {
  type FamilyState,
  getChildrenIds,
  getRelationDistances,
  getSpouseIds,
} from "./family";

/**
 * 家族树的布局计算 —— 纯函数，不碰 DOM，可单独测试。
 *
 * 做法是经典的「整齐树」：
 *   1. 夫妻并成一个**单元**，同代同格并排（这本来就是族谱的画法）
 *   2. 单元之间按「到共同祖先的层级」构成森林
 *   3. 后序遍历：叶子依次占列，父节点居中于其子节点
 *   4. 代际决定 y，列号决定 x
 *
 * 之所以不直接按人排：夫妻各占一列会让每一代凭空翻倍，
 * 而族谱里夫妻本来就是同格的两半。
 */

/** 单个人物格子的尺寸 */
export const NODE_W = 136;
export const NODE_H = 84;
/** 同代相邻单元的水平间距 */
const H_GAP = 24;
/** 单元内部成员（夫妻）的间距 */
const SPOUSE_GAP = 10;
/** 代际之间的垂直间距 */
const V_GAP = 64;
/** 与「我」不连通的人，额外放在底部多留一点空 */
const ORPHAN_GAP = 96;

export interface TreeLayoutNode {
  id: string;
  /** 左上角坐标 */
  x: number;
  y: number;
  width: number;
  height: number;
  generation: number;
}

export interface TreeLayoutEdge {
  fromId: string;
  /** 子女 */
  toId: string;
  kind: "blood" | "spouse";
}

export interface TreeLayout {
  nodes: TreeLayoutNode[];
  edges: TreeLayoutEdge[];
  byId: Map<string, TreeLayoutNode>;
  width: number;
  height: number;
}

/** 并查集：把夫妻并成同一个单元 */
function buildUnits(state: FamilyState): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root) as string;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const id of Object.keys(state.persons)) parent.set(id, id);
  for (const { a, b } of state.spouses) {
    if (state.persons[a] && state.persons[b]) union(a, b);
  }

  const unitOf = new Map<string, string>();
  for (const id of Object.keys(state.persons)) unitOf.set(id, find(id));
  return unitOf;
}

/** 稳定排序：按生年，其次按 id，保证同输入同输出 */
function byBirthThenId(state: FamilyState, a: string, b: string): number {
  const ya = state.persons[a]?.birthYear ?? "";
  const yb = state.persons[b]?.birthYear ?? "";
  if (ya !== yb) {
    if (!ya) return 1;
    if (!yb) return -1;
    return ya.localeCompare(yb);
  }
  return a.localeCompare(b);
}

export function layoutFamilyTree(state: FamilyState): TreeLayout {
  const distances = getRelationDistances(state);
  const unitOf = buildUnits(state);

  // 每个单元有哪些人，以及它属于第几代
  const membersOf = new Map<string, string[]>();
  for (const id of Object.keys(state.persons)) {
    const unit = unitOf.get(id) as string;
    const list = membersOf.get(unit) ?? [];
    list.push(id);
    membersOf.set(unit, list);
  }
  for (const [unit, members] of membersOf) {
    members.sort((a, b) => byBirthThenId(state, a, b));
    membersOf.set(unit, members);
  }

  const generationOf = new Map<string, number>();
  for (const [unit, members] of membersOf) {
    let generation = Number.POSITIVE_INFINITY;
    for (const id of members) {
      const d = distances.get(id);
      if (d !== null && d !== undefined) generation = Math.min(generation, d);
    }
    generationOf.set(unit, generation);
  }

  // 单元森林：某单元的子女单元（取任一成员的子女即可，夫妻的子女是同一批）
  const childrenUnitsOf = new Map<string, string[]>();
  for (const [unit, members] of membersOf) {
    const childUnits = new Set<string>();
    for (const id of members) {
      for (const childId of getChildrenIds(state, id)) {
        const childUnit = unitOf.get(childId);
        if (childUnit && childUnit !== unit) childUnits.add(childUnit);
      }
    }
    childrenUnitsOf.set(
      unit,
      [...childUnits].sort((a, b) => {
        const ma = membersOf.get(a)?.[0] ?? "";
        const mb = membersOf.get(b)?.[0] ?? "";
        return byBirthThenId(state, ma, mb);
      })
    );
  }

  const parentUnitOf = new Map<string, string>();
  for (const [unit, children] of childrenUnitsOf) {
    for (const child of children) {
      if (!parentUnitOf.has(child)) parentUnitOf.set(child, unit);
    }
  }

  // 后序：叶子依次占列，父节点居中于子节点
  const columnOf = new Map<string, number>();
  let nextColumn = 0;

  const assign = (unit: string, seen: Set<string>): number => {
    if (columnOf.has(unit)) return columnOf.get(unit) as number;
    if (seen.has(unit)) return nextColumn; // 数据成环时兜底，不递归
    seen.add(unit);

    const children = childrenUnitsOf.get(unit) ?? [];
    let column: number;
    if (children.length === 0) {
      column = nextColumn;
      nextColumn += 1;
    } else {
      const childColumns = children.map((c) => assign(c, seen));
      column = (Math.min(...childColumns) + Math.max(...childColumns)) / 2;
    }
    columnOf.set(unit, column);
    return column;
  };

  const roots = [...membersOf.keys()]
    .filter((unit) => !parentUnitOf.has(unit))
    .sort((a, b) => {
      const ga = generationOf.get(a) as number;
      const gb = generationOf.get(b) as number;
      if (ga !== gb) return ga - gb;
      return byBirthThenId(state, membersOf.get(a)?.[0] ?? "", membersOf.get(b)?.[0] ?? "");
    });
  for (const root of roots) assign(root, new Set());

  const nodes: TreeLayoutNode[] = [];
  const byId = new Map<string, TreeLayoutNode>();

  // 有血缘关系的人：按代际分行
  const connected = [...membersOf.keys()].filter((unit) =>
    Number.isFinite(generationOf.get(unit) as number)
  );
  const orphans = [...membersOf.keys()].filter(
    (unit) => !Number.isFinite(generationOf.get(unit) as number)
  );

  const place = (unit: string, baseY: number) => {
    const members = membersOf.get(unit) as string[];
    const column = columnOf.get(unit) ?? 0;
    const unitWidth = members.length * NODE_W + (members.length - 1) * SPOUSE_GAP;
    const startX = column * (NODE_W + H_GAP + SPOUSE_GAP) - unitWidth / 2;
    members.forEach((id, index) => {
      const node: TreeLayoutNode = {
        id,
        x: startX + index * (NODE_W + SPOUSE_GAP),
        y: baseY,
        width: NODE_W,
        height: NODE_H,
        generation: generationOf.get(unit) as number,
      };
      nodes.push(node);
      byId.set(id, node);
    });
  };

  const generations = [...new Set(connected.map((u) => generationOf.get(u) as number))].sort(
    (a, b) => a - b
  );
  const minGeneration = generations[0] ?? 0;
  for (const unit of connected) {
    const generation = generationOf.get(unit) as number;
    place(unit, (generation - minGeneration) * (NODE_H + V_GAP));
  }

  // 与「我」不连通的人：底部另起一行，不混进任何一代
  const orphanBaseY =
    (generations.length > 0
      ? (generations[generations.length - 1] - minGeneration) * (NODE_H + V_GAP) + NODE_H
      : 0) + ORPHAN_GAP;
  for (const unit of orphans) {
    const members = membersOf.get(unit) as string[];
    const column = columnOf.get(unit) ?? 0;
    const unitWidth = members.length * NODE_W + (members.length - 1) * SPOUSE_GAP;
    const startX = column * (NODE_W + H_GAP + SPOUSE_GAP) - unitWidth / 2;
    members.forEach((id, index) => {
      const node: TreeLayoutNode = {
        id,
        x: startX + index * (NODE_W + SPOUSE_GAP),
        y: orphanBaseY,
        width: NODE_W,
        height: NODE_H,
        generation: Number.NaN,
      };
      nodes.push(node);
      byId.set(id, node);
    });
  }

  // 连线：血亲 + 夫妻
  const edges: TreeLayoutEdge[] = [];
  for (const [childId, entry] of Object.entries(state.parents)) {
    if (!byId.has(childId)) continue;
    for (const parentId of [entry.fatherId, entry.motherId]) {
      if (parentId && byId.has(parentId)) {
        edges.push({ fromId: parentId, toId: childId, kind: "blood" });
      }
    }
  }
  for (const { a, b } of state.spouses) {
    if (byId.has(a) && byId.has(b)) {
      edges.push({ fromId: a, toId: b, kind: "spouse" });
    }
  }

  // 归一化到原点，算出画布尺寸
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  if (nodes.length === 0) {
    return { nodes, edges, byId, width: 0, height: 0 };
  }
  const dx = -minX + 40;
  const dy = -minY + 40;
  for (const node of nodes) {
    node.x += dx;
    node.y += dy;
  }

  return {
    nodes,
    edges,
    byId,
    width: maxX - minX + 80,
    height: maxY - minY + 80,
  };
}

export { getSpouseIds };
