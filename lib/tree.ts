import {
  type FamilyState,
  getChildrenIds,
  getRelationDistances,
  getSpouseIds,
} from "./family";
import {
  type LineageFilter,
  type LineageKind,
  classifyLineage,
    filterVisibleIds,
  generationLabel,
  pedigreePath,
  pedigreeSortKey,
} from "./lineage";

export const NODE_W = 208;
export const NODE_H = 132;
const H_GAP = 56;
const SPOUSE_GAP = 14;
const V_GAP = 88;
const ORPHAN_GAP = 96;

export interface TreeLayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  generation: number;
  lineage: LineageKind;
}

export interface TreeLayoutEdge {
  fromId: string;
  toId: string;
  kind: "blood" | "spouse" | "junction";
  lineage: LineageKind;
}

export interface TreeLayoutJunction {
  id: string;
  x: number;
  y: number;
  parentIds: string[];
  childIds: string[];
  lineage: LineageKind;
  /** 子女总线（横向）所在高度，不同汇合点会错开 */
  busY: number;
  busLeft: number;
  busRight: number;
  /** 家长竖直车道：双亲各自下落再汇入，避免并成一股 */
  parentLanes: Array<{ parentId: string; x: number; laneY: number }>;
}

export interface TreeGenerationBand {
  generation: number;
  y: number;
  height: number;
  label: string;
}

export interface TreeLayout {
  nodes: TreeLayoutNode[];
  edges: TreeLayoutEdge[];
  junctions: TreeLayoutJunction[];
  bands: TreeGenerationBand[];
  byId: Map<string, TreeLayoutNode>;
  width: number;
  height: number;
  lineageOf: Map<string, LineageKind>;
}

export interface LayoutOptions {
  filter?: LineageFilter;
  maxDepth?: number;
}

function buildUnits(state: FamilyState, ids: string[]): Map<string, string> {
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
  for (const id of ids) parent.set(id, id);
  for (const { a, b } of state.spouses) {
    if (parent.has(a) && parent.has(b)) union(a, b);
  }
  const unitOf = new Map<string, string>();
  for (const id of ids) unitOf.set(id, find(id));
  return unitOf;
}

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

function restrictState(state: FamilyState, visible: Set<string>): FamilyState {
  const persons: FamilyState["persons"] = {};
  for (const id of visible) {
    if (state.persons[id]) persons[id] = state.persons[id];
  }
  const parents: FamilyState["parents"] = {};
  for (const [cid, p] of Object.entries(state.parents)) {
    if (!visible.has(cid)) continue;
    const entry: { fatherId?: string; motherId?: string } = {};
    if (p.fatherId && visible.has(p.fatherId)) entry.fatherId = p.fatherId;
    if (p.motherId && visible.has(p.motherId)) entry.motherId = p.motherId;
    if (entry.fatherId || entry.motherId) parents[cid] = entry;
  }
  const spouses = state.spouses.filter((s) => visible.has(s.a) && visible.has(s.b));
  return {
    version: 1,
    persons,
    parents,
    spouses,
    meId: state.meId,
  };
}

export function layoutFamilyTree(
  state: FamilyState,
  options: LayoutOptions = {}
): TreeLayout {
  const filter = options.filter ?? "all";
  const maxDepth = options.maxDepth ?? 6;
  const visible =
    filter === "all" && maxDepth >= 99
      ? new Set(Object.keys(state.persons))
      : filterVisibleIds(state, filter, maxDepth);
  const working =
    visible.size === Object.keys(state.persons).length
      ? state
      : restrictState(state, visible);

  const meId = working.meId;
  const distances = getRelationDistances(working);
  const lineageDist = distances;
  const lineageOf = new Map<string, LineageKind>();
  for (const id of Object.keys(working.persons)) {
    lineageOf.set(id, classifyLineage(working, id, meId, lineageDist as Map<string, number | null>));
  }

  const ids = Object.keys(working.persons);
  const unitOf = buildUnits(working, ids);

  const membersOf = new Map<string, string[]>();
  for (const id of ids) {
    const unit = unitOf.get(id) as string;
    const list = membersOf.get(unit) ?? [];
    list.push(id);
    membersOf.set(unit, list);
  }
  for (const [unit, members] of membersOf) {
    members.sort((a, b) => byBirthThenId(working, a, b));
  }

  const unitPedigreeKey = (unit: string): string => {
    const members = membersOf.get(unit) ?? [];
    let best = "9";
    for (const id of members) {
      const key = pedigreeSortKey(pedigreePath(working, id, meId));
      if (key < best) best = key;
    }
    return best;
  };

  const generationOf = new Map<string, number>();
  for (const [unit, members] of membersOf) {
    let generation = Number.POSITIVE_INFINITY;
    for (const id of members) {
      const d = distances.get(id);
      if (d !== null && d !== undefined) generation = Math.min(generation, d as number);
    }
    generationOf.set(unit, generation);
  }

  const childrenUnitsOf = new Map<string, string[]>();
  for (const [unit, members] of membersOf) {
    const childUnits = new Set<string>();
    for (const id of members) {
      for (const childId of getChildrenIds(working, id)) {
        const childUnit = unitOf.get(childId);
        if (childUnit && childUnit !== unit) childUnits.add(childUnit);
      }
    }
    childrenUnitsOf.set(
      unit,
      [...childUnits].sort((a, b) => {
        const ka = unitPedigreeKey(a);
        const kb = unitPedigreeKey(b);
        if (ka !== kb && (ka !== "9" || kb !== "9")) return ka.localeCompare(kb);
        const ma = membersOf.get(a)?.[0] ?? "";
        const mb = membersOf.get(b)?.[0] ?? "";
        return byBirthThenId(working, ma, mb);
      })
    );
  }

  const parentUnitOf = new Map<string, string>();
  for (const [unit, children] of childrenUnitsOf) {
    for (const child of children) {
      if (!parentUnitOf.has(child)) parentUnitOf.set(child, unit);
    }
  }

  const widthOf = (unit: string): number => {
    const members = membersOf.get(unit) as string[];
    return members.length * NODE_W + (members.length - 1) * SPOUSE_GAP;
  };

  const idealCenterOf = new Map<string, number>();
  let nextSlot = 0;

  const assign = (unit: string, seen: Set<string>): number => {
    if (idealCenterOf.has(unit)) return idealCenterOf.get(unit) as number;
    if (seen.has(unit)) return nextSlot * (NODE_W + H_GAP);
    seen.add(unit);
    const children = childrenUnitsOf.get(unit) ?? [];
    let center: number;
    if (children.length === 0) {
      center = nextSlot * (NODE_W + H_GAP) + widthOf(unit) / 2;
      nextSlot += 1;
    } else {
      const childCenters = children.map((c) => assign(c, seen));
      center = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
    }
    idealCenterOf.set(unit, center);
    return center;
  };

  // 根节点：族谱序（父系靠左、母系靠右），再按代际/生年
  const roots = [...membersOf.keys()]
    .filter((unit) => !parentUnitOf.has(unit))
    .sort((a, b) => {
      const ga = generationOf.get(a) as number;
      const gb = generationOf.get(b) as number;
      if (ga !== gb) return ga - gb;
      const ka = unitPedigreeKey(a);
      const kb = unitPedigreeKey(b);
      if (ka !== kb) return ka.localeCompare(kb);
      return byBirthThenId(
        working,
        membersOf.get(a)?.[0] ?? "",
        membersOf.get(b)?.[0] ?? ""
      );
    });
  for (const root of roots) assign(root, new Set());

  // 重心微调：降低跨代交叉（2 轮即可，且保持确定性）
  for (let pass = 0; pass < 2; pass += 1) {
    const gens = new Map<number, string[]>();
    for (const unit of membersOf.keys()) {
      const g = generationOf.get(unit);
      if (!Number.isFinite(g)) continue;
      const list = gens.get(g as number) ?? [];
      list.push(unit);
      gens.set(g as number, list);
    }
    const genKeys = [...gens.keys()].sort((a, b) => a - b);
    for (const g of genKeys) {
      const units = (gens.get(g) as string[]).slice().sort((a, b) => {
        const ka = unitPedigreeKey(a);
        const kb = unitPedigreeKey(b);
        if (ka !== kb) return ka.localeCompare(kb);
        return (idealCenterOf.get(a) ?? 0) - (idealCenterOf.get(b) ?? 0);
      });
      // 子重心 → 拉向子代中心
      for (const unit of units) {
        const children = childrenUnitsOf.get(unit) ?? [];
        if (children.length === 0) continue;
        const centers = children
          .map((c) => idealCenterOf.get(c))
          .filter((v): v is number => typeof v === "number");
        if (centers.length === 0) continue;
        const childAvg = centers.reduce((s, v) => s + v, 0) / centers.length;
        const self = idealCenterOf.get(unit) ?? childAvg;
        idealCenterOf.set(unit, self * 0.45 + childAvg * 0.55);
      }
    }
  }

  const sweepRow = (units: string[]): Map<string, number> => {
    const placed = new Map<string, number>();
    const sorted = [...units].sort((a, b) => {
      const ka = unitPedigreeKey(a);
      const kb = unitPedigreeKey(b);
      const ca = idealCenterOf.get(a) ?? 0;
      const cb = idealCenterOf.get(b) ?? 0;
      // 祖先行族谱序优先：父系靠左、母系靠右（理想中心会把两侧拉平）
      const kaAnc = ka !== "9";
      const kbAnc = kb !== "9";
      if (kaAnc && kbAnc && ka !== kb) return ka.localeCompare(kb);
      if (Math.abs(ca - cb) > 1) return ca - cb;
      return ka.localeCompare(kb);
    });
    let rightEdge = Number.NEGATIVE_INFINITY;
    for (const unit of sorted) {
      const half = widthOf(unit) / 2;
      const ideal = idealCenterOf.get(unit) ?? 0;
      const center = Math.max(ideal, rightEdge + H_GAP + half);
      placed.set(unit, center);
      rightEdge = center + half;
    }
    return placed;
  };

  const connectedByGeneration = new Map<number, string[]>();
  for (const unit of membersOf.keys()) {
    const generation = generationOf.get(unit);
    if (!Number.isFinite(generation)) continue;
    const list = connectedByGeneration.get(generation as number) ?? [];
    list.push(unit);
    connectedByGeneration.set(generation as number, list);
  }
  const centerOf = new Map<string, number>();
  for (const units of connectedByGeneration.values()) {
    for (const [unit, center] of sweepRow(units)) centerOf.set(unit, center);
  }
  const orphanUnits = [...membersOf.keys()].filter(
    (unit) => !Number.isFinite(generationOf.get(unit))
  );
  for (const [unit, center] of sweepRow(orphanUnits)) centerOf.set(unit, center);

  const nodes: TreeLayoutNode[] = [];
  const byId = new Map<string, TreeLayoutNode>();
  const connected = [...membersOf.keys()].filter((unit) =>
    Number.isFinite(generationOf.get(unit) as number)
  );
  const orphans = [...membersOf.keys()].filter(
    (unit) => !Number.isFinite(generationOf.get(unit))
  );

  const place = (unit: string, baseY: number) => {
    const members = membersOf.get(unit) as string[];
    const center = centerOf.get(unit) ?? 0;
    const unitWidth = widthOf(unit);
    const startX = center - unitWidth / 2;
    members.forEach((id, index) => {
      const gen = generationOf.get(unit) as number;
      const node: TreeLayoutNode = {
        id,
        x: startX + index * (NODE_W + SPOUSE_GAP),
        y: baseY,
        width: NODE_W,
        height: NODE_H,
        generation: gen,
        lineage: lineageOf.get(id) ?? "orphan",
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

  const orphanBaseY =
    (generations.length > 0
      ? (generations[generations.length - 1] - minGeneration) * (NODE_H + V_GAP) + NODE_H
      : 0) + ORPHAN_GAP;
  for (const unit of orphans) {
    const members = membersOf.get(unit) as string[];
    const center = centerOf.get(unit) ?? 0;
    const unitWidth = widthOf(unit);
    const startX = center - unitWidth / 2;
    members.forEach((id, index) => {
      const node: TreeLayoutNode = {
        id,
        x: startX + index * (NODE_W + SPOUSE_GAP),
        y: orphanBaseY,
        width: NODE_W,
        height: NODE_H,
        generation: Number.NaN,
        lineage: lineageOf.get(id) ?? "orphan",
      };
      nodes.push(node);
      byId.set(id, node);
    });
  }

  const edges: TreeLayoutEdge[] = [];
  for (const [childId, entry] of Object.entries(working.parents)) {
    if (!byId.has(childId)) continue;
    for (const parentId of [entry.fatherId, entry.motherId]) {
      if (parentId && byId.has(parentId)) {
        edges.push({
          fromId: parentId,
          toId: childId,
          kind: "blood",
          lineage: lineageOf.get(childId) ?? "orphan",
        });
      }
    }
  }
  for (const { a, b } of working.spouses) {
    if (byId.has(a) && byId.has(b)) {
      edges.push({
        fromId: a,
        toId: b,
        kind: "spouse",
        lineage: lineageOf.get(a) ?? "affinal",
      });
    }
  }

  // 父母汇合点：双亲/多子女的总线分叉，避免每人两根斜线织成网
  const junctionGroups = new Map<string, string[]>();
  for (const [childId, entry] of Object.entries(working.parents)) {
    if (!byId.has(childId)) continue;
    const parents = [entry.fatherId, entry.motherId].filter(
      (p): p is string => Boolean(p) && byId.has(p as string)
    );
    if (parents.length === 0) continue;
    const key = [...parents].sort().join("+");
    const list = junctionGroups.get(key) ?? [];
    list.push(childId);
    junctionGroups.set(key, list);
  }
  const junctions: TreeLayoutJunction[] = [];
  for (const [key, childIds] of junctionGroups) {
    const parentIds = key.split("+").filter((id) => byId.has(id));
    if (parentIds.length === 0 || childIds.length === 0) continue;
    let parentBottom = Number.NEGATIVE_INFINITY;
    let childTop = Number.POSITIVE_INFINITY;
    let parentCx = 0;
    let childCx = 0;
    for (const pid of parentIds) {
      const n = byId.get(pid) as TreeLayoutNode;
      parentBottom = Math.max(parentBottom, n.y + n.height);
      parentCx += n.x + n.width / 2;
    }
    parentCx /= parentIds.length;
    for (const cid of childIds) {
      const n = byId.get(cid) as TreeLayoutNode;
      childTop = Math.min(childTop, n.y);
      childCx += n.x + n.width / 2;
    }
    childCx /= childIds.length;
    const sample = childIds[0];
    const sortedChildren = [...childIds].sort((a, b) => {
      const na = byId.get(a) as TreeLayoutNode;
      const nb = byId.get(b) as TreeLayoutNode;
      return na.x + na.width / 2 - (nb.x + nb.width / 2);
    });
    let busLeft = Number.POSITIVE_INFINITY;
    let busRight = Number.NEGATIVE_INFINITY;
    for (const cid of sortedChildren) {
      const n = byId.get(cid) as TreeLayoutNode;
      const cx = n.x + n.width / 2;
      busLeft = Math.min(busLeft, cx);
      busRight = Math.max(busRight, cx);
    }
    // 不同家庭的总线在垂直方向错开，减少叠在同一水平线上
    const stagger = (junctions.length % 3) * 10;
    const busY = parentBottom + (childTop - parentBottom) * 0.42 + stagger;
    const parentLanes = parentIds.map((pid, index) => {
      const n = byId.get(pid) as TreeLayoutNode;
      const cx = n.x + n.width / 2;
      const sign = parentIds.length === 1 ? 0 : index === 0 ? -1 : 1;
      return {
        parentId: pid,
        x: cx + sign * 10,
        laneY: busY - 14 - index * 8,
      };
    });
    const sampleId = childIds[0];
    junctions.push({
      id: "j:" + key,
      x: (busLeft + busRight) / 2,
      y: busY,
      parentIds,
      childIds: sortedChildren,
      lineage: lineageOf.get(sampleId) ?? "orphan",
      busY,
      busLeft,
      busRight,
      parentLanes,
    });
  }
  for (const j of junctions) {
    for (const pid of j.parentIds) {
      edges.push({
        fromId: pid,
        toId: j.id,
        kind: "junction",
        lineage: j.lineage,
      });
    }
    for (const cid of j.childIds) {
      edges.push({
        fromId: j.id,
        toId: cid,
        kind: "junction",
        lineage: j.lineage,
      });
    }
  }

  const bands: TreeGenerationBand[] = generations.map((g) => {
    const y = (g - minGeneration) * (NODE_H + V_GAP);
    return {
      generation: g,
      y,
      height: NODE_H,
      label: generationLabel(g),
    };
  });

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
    return {
      nodes,
      edges,
      junctions,
      bands,
      byId,
      width: 0,
      height: 0,
      lineageOf,
    };
  }
  const dx = -minX + 40;
  const dy = -minY + 40;
  for (const node of nodes) {
    node.x += dx;
    node.y += dy;
  }
  for (const j of junctions) {
    j.x += dx;
    j.y += dy;
    j.busY += dy;
    j.busLeft += dx;
    j.busRight += dx;
    for (const lane of j.parentLanes) {
      lane.x += dx;
      lane.laneY += dy;
    }
  }
  for (const b of bands) {
    b.y += dy;
  }

  return {
    nodes,
    edges,
    junctions,
    bands,
    byId,
    width: maxX - minX + 80,
    height: maxY - minY + 80,
    lineageOf,
  };
}

export { getSpouseIds };

