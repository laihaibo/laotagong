import {
  type FamilyState,
  getChildrenIds,
  getCoParentIds,
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
  collateralSide,
} from "./lineage";

export const NODE_W = 208;
export const NODE_H = 132;
const H_GAP = 56;
/** 夫妻/共同养育两卡的间距：连线横线画在这里，太短会看不清 */
export const SPOUSE_GAP = 40;
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
  kind: "blood" | "spouse";
  lineage: LineageKind;
}

export interface TreeLayoutRoute {
  id: string;
  fromId: string;
  toId: string;
  kind: "blood" | "spouse";
  lineage: LineageKind;
  /** SVG path 的 d 属性；坐标与节点同处画布坐标系，两端都落在卡片边缘上 */
  d: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
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
  routes: TreeLayoutRoute[];
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
  // 共同养育的双亲也并入同一单元（「添加母亲」不建婚姻边，但展示上
  // 父母并格相连是族谱惯例；这里只影响摆放，不回写 spouses 数据）
  for (const entry of Object.values(state.parents)) {
    const { fatherId: f, motherId: m } = entry;
    if (f && m && parent.has(f) && parent.has(m)) union(f, m);
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


/**
 * 把每条关系画成一条 SVG path。
 *
 * 两端必须落在对应卡片的边缘上，且中途不得穿过任何卡片——
 * 被卡片盖住的那一段在视觉上就是「断线」。
 */
function buildRoutes(
  state: FamilyState,
  byId: Map<string, TreeLayoutNode>,
  lineageOf: Map<string, LineageKind>
): TreeLayoutRoute[] {
  const routes: TreeLayoutRoute[] = [];

  /** 两张卡的相向边之间是否隔着同排的其他卡片（多配偶同单元时必隔） */
  const rowBlockedBetween = (
    left: TreeLayoutNode,
    right: TreeLayoutNode
  ): boolean => {
    const leftRight = left.x + left.width;
    for (const n of byId.values()) {
      if (n === left || n === right) continue;
      if (Math.abs(n.y - left.y) > 2) continue;
      if (n.x < right.x - 2 && n.x + n.width > leftRight + 2) return true;
    }
    return false;
  };

  const pairKey = (x: string, y: string) => (x < y ? x + "|" + y : y + "|" + x);

  /** X 的唯一伴侣：配偶 ∪ 共同养育者恰有一位时返回该人，否则 null */
  const uniquePartnerOf = (id: string): string | null => {
    const partners = new Set<string>(getSpouseIds(state, id));
    for (const p of getCoParentIds(state, id)) partners.add(p);
    if (partners.size !== 1) return null;
    return [...partners][0];
  };

  // ── 经典族谱画法：夫妻横线相连，从横线中点垂落，多子女共享一条总线 ──
  // 双亲（已婚或共同养育，buildUnits 已把他们并格相邻）且都在子女上方才适用。
  // 只关联了一位亲长的子女：若该亲长恰有一位伴侣，同样并入这对伴侣的总线
  // （仅展示推断，不改数据——旧数据/漏录的子女也能与兄姐同线）。
  const handledKids = new Set<string>();
  const coupleKids = new Map<
    string,
    { f: string; m: string; kids: Array<{ id: string; n: TreeLayoutNode }> }
  >();
  for (const [childId, entry] of Object.entries(state.parents)) {
    let f = entry.fatherId;
    let m = entry.motherId;
    if (Boolean(f) !== Boolean(m)) {
      const only = (f ?? m) as string;
      if (byId.has(only)) {
        const partner = uniquePartnerOf(only);
        if (partner && byId.has(partner)) {
          if (!f) f = partner;
          else m = partner;
        }
      }
    }
    if (!f || !m || !byId.has(f) || !byId.has(m)) continue;
    const child = byId.get(childId);
    if (!child) continue;
    const nf = byId.get(f)!;
    const nm = byId.get(m)!;
    if (nf.y >= child.y - 2 || nm.y >= child.y - 2) continue;
    const gapF = nm.x - (nf.x + nf.width);
    const gapM = nf.x - (nm.x + nm.width);
    const adjacent =
      (gapF >= -2 && gapF <= SPOUSE_GAP + 2) ||
      (gapM >= -2 && gapM <= SPOUSE_GAP + 2);
    if (!adjacent) continue;
    const key = pairKey(f, m);
    const grp = coupleKids.get(key) ?? { f, m, kids: [] };
    grp.kids.push({ id: childId, n: child });
    coupleKids.set(key, grp);
    handledKids.add(childId);
  }

  for (const { f, m, kids } of coupleKids.values()) {
    const nf = byId.get(f)!;
    const nm = byId.get(m)!;
    const left = nf.x + nf.width <= nm.x ? nf : nm;
    const right = left === nf ? nm : nf;
    const midX = (left.x + left.width + right.x) / 2;
    const midY = left.y + left.height / 2;
    const bottom = left.y + left.height;
    const lineage = lineageOf.get(f) ?? lineageOf.get(m) ?? "orphan";

    // 子女按所在行分组（正常都在同一行；跨行是畸形数据，各行各画总线）
    const rows = new Map<number, Array<{ id: string; n: TreeLayoutNode }>>();
    for (const k of kids) {
      const list = rows.get(k.n.y) ?? [];
      list.push(k);
      rows.set(k.n.y, list);
    }
    for (const [rowY, rowKids] of rows) {
      rowKids.sort((a, b) => a.n.x - b.n.x);
      const busY = bottom + (rowY - bottom) / 2;
      if (rowKids.length === 1) {
        // 独生子女：一根肘线直达顶边中点
        const { id, n } = rowKids[0];
        const cx = n.x + n.width / 2;
        const d =
          Math.abs(midX - cx) < 1.5
            ? "M " + midX + " " + midY + " V " + n.y
            : "M " + midX + " " + midY + " V " + busY + " H " + cx + " V " + n.y;
        routes.push({
          id: "r:" + f + "+" + m + ">" + id,
          fromId: f,
          toId: id,
          kind: "blood",
          lineage,
          d,
          start: { x: midX, y: midY },
          end: { x: cx, y: n.y },
        });
        continue;
      }
      // 多子女：主干从横线中点垂落到总线，总线横贯首末孩子，
      // 再为每个孩子补一根落到顶边中点的短垂线。
      // 主干/总线只画一次——每个孩子各画全路径会把半透明描边叠深，
      // 视觉上就不再是「一条水平线」了。
      const firstCx = rowKids[0].n.x + rowKids[0].n.width / 2;
      const last = rowKids[rowKids.length - 1];
      const lastCx = last.n.x + last.n.width / 2;
      routes.push({
        id: "r:" + f + "+" + m + ">bus@" + rowY,
        fromId: f,
        toId: last.id,
        kind: "blood",
        lineage,
        d:
          "M " + midX + " " + midY +
          " V " + busY +
          " M " + firstCx + " " + busY +
          " H " + lastCx,
        start: { x: midX, y: midY },
        end: { x: lastCx, y: busY },
      });
      for (const { id, n } of rowKids) {
        const cx = n.x + n.width / 2;
        routes.push({
          id: "r:" + f + "+" + m + ">drop:" + id,
          fromId: f,
          toId: id,
          kind: "blood",
          lineage,
          d: "M " + cx + " " + busY + " V " + n.y,
          start: { x: cx, y: busY },
          end: { x: cx, y: n.y },
        });
      }
    }
  }

  // ── 兜底：单亲 / 不相邻的双亲 —— 各自从卡片下沿肘线连接 ──
  for (const [childId, entry] of Object.entries(state.parents)) {
    if (handledKids.has(childId)) continue;
    const child = byId.get(childId);
    if (!child) continue;
    const parents = [entry.fatherId, entry.motherId].filter(
      (p): p is string => typeof p === "string" && byId.has(p)
    );
    // 子女一律挂在卡片顶边中点
    const cx = child.x + child.width / 2;
    const ey = child.y;

    const sibs = Object.keys(state.parents)
      .filter((cid) => {
        const a = state.parents[cid];
        const b = entry;
        return (
          cid !== childId &&
          ((a.fatherId && a.fatherId === b.fatherId) ||
            (a.motherId && a.motherId === b.motherId) ||
            (a.fatherId && a.fatherId === b.motherId))
        );
      })
      .sort();
    const sibIndex = sibs.indexOf(childId);

    parents.forEach((pid, pIndex) => {
      const parent = byId.get(pid);
      if (!parent) return;
      const pl = lineageOf.get(pid) ?? "orphan";
      // 双亲各占卡片下沿的 40% / 60% 点，两根线不重叠
      const pRatio =
        parents.length >= 2 ? (pIndex === 0 ? 0.4 : 0.6) : 0.5;
      const sx = parent.x + parent.width * pRatio;
      const sy = parent.y + parent.height;

      let d: string;
      let start = { x: sx, y: sy };
      if (Math.abs(parent.y - child.y) < 2) {
        // 亲子同一排（与「我」不连通的整支、或未设「我」）：
        // 常规向下肘线只能从下方爬回子女顶边，那根竖线会整段穿过
        // 子女卡片背后。改从家长顶边出发，沿行上方的空带绕到子女顶边。
        const rise = parent.y - 28;
        d = "M " + sx + " " + parent.y + " V " + rise + " H " + cx + " V " + ey;
        start = { x: sx, y: parent.y };
      } else if (Math.abs(sx - cx) < 1.5) {
        d = "M " + sx + " " + sy + " V " + ey;
      } else {
        const gap = Math.max(ey - sy, 8);
        // 横向通道落在行间空带里；不同家长/排行再错开，避免叠成一条粗线
        const lineageBias = pl === "paternal" ? 0 : pl === "maternal" ? 10 : 5;
        const channel =
          sy + gap * 0.4 + lineageBias + (pIndex % 2) * 12 + ((sibIndex < 0 ? 0 : sibIndex) % 3) * 5;
        let hMin = Math.min(sx, cx);
        let hMax = Math.max(sx, cx);
        // 同排的非家长成员：横向通道不得伸进其卡片
        for (const sid of Object.keys(state.persons)) {
          if (sid === pid || sid === childId) continue;
          const sp = byId.get(sid);
          if (!sp || Math.abs(sp.y - child.y) >= 2) continue;
          if (parents.includes(sid)) continue;
          if (sp.x >= child.x + child.width - 2) {
            hMax = Math.min(hMax, cx + 2);
          } else if (sp.x + sp.width <= child.x + 2) {
            hMin = Math.max(hMin, cx - 2);
          }
        }
        if (hMin > hMax) {
          hMin = Math.min(sx, cx);
          hMax = Math.max(sx, cx);
        }
        // 横向通道的落点 x 夹在 [hMin,hMax] 内；可能与 cx 不同，
        // 但仍落在子女顶边上，线不会悬空
        const hx2 = Math.max(hMin, Math.min(hMax, cx));
        d =
          "M " + sx + " " + sy +
          " V " + channel +
          " H " + hx2 +
          " V " + ey;
      }

      routes.push({
        id: "r:" + pid + ">" + childId,
        fromId: pid,
        toId: childId,
        kind: "blood",
        lineage: pl === "orphan" ? lineageOf.get(childId) ?? "orphan" : pl,
        d,
        start,
        end: { x: cx, y: ey },
      });
    });
  }

  // 「父母相连」的横线覆盖两类：婚姻边 + 共同养育（同一子女的双亲）。
  // 后者「添加母亲」不会建婚姻记录，但展示上父母同样并格相连。
  const connectorPairs: Array<[string, string]> = [];
  const seenPair = new Set<string>();
  for (const { a, b } of state.spouses) {
    if (!byId.has(a) || !byId.has(b)) continue;
    const key = pairKey(a, b);
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    connectorPairs.push([a, b]);
  }
  for (const entry of Object.values(state.parents)) {
    const { fatherId: f, motherId: m } = entry;
    if (!f || !m || !byId.has(f) || !byId.has(m)) continue;
    const key = pairKey(f, m);
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    connectorPairs.push([f, m]);
  }
  // 唯一伴侣对：哪怕所有子女都只录了一位亲长，父母横线也不能缺席
  for (const id of byId.keys()) {
    const partner = uniquePartnerOf(id);
    if (!partner || !byId.has(partner)) continue;
    const key = pairKey(id, partner);
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    connectorPairs.push([id, partner]);
  }
  for (const [a, b] of connectorPairs) {
    const na = byId.get(a);
    const nb = byId.get(b);
    if (!na || !nb) continue;
    const left = na.x <= nb.x ? na : nb;
    const right = na.x <= nb.x ? nb : na;
    const other = na.x <= nb.x ? b : a;
    const self = na.x <= nb.x ? a : b;
    const y1 = left.y + left.height / 2;
    const y2 = right.y + right.height / 2;
    let d: string;
    let start: { x: number; y: number };
    let end: { x: number; y: number };
    if (rowBlockedBetween(left, right)) {
      // 中间隔着同排的其他卡片（如 A—B—C 单元里 A 与 C 的婚姻）：
      // 直连会从中间人卡片背后穿过，看起来断线。沿行下方 30px 绕行。
      const dropY = left.y + left.height + 30;
      const exitX = left.x + left.width - 10;
      const entryX = right.x + 10;
      d =
        "M " + exitX + " " + (left.y + left.height) +
        " V " + dropY +
        " H " + entryX +
        " V " + (right.y + right.height);
      start = { x: exitX, y: left.y + left.height };
      end = { x: entryX, y: right.y + right.height };
    } else {
      d = "M " + (left.x + left.width) + " " + y1 + " L " + right.x + " " + y2;
      start = { x: left.x + left.width, y: y1 };
      end = { x: right.x, y: y2 };
    }
    routes.push({
      id: "r:s:" + self + "+" + other,
      fromId: self,
      toId: other,
      kind: "spouse",
      lineage: "affinal",
      d,
      start,
      end,
    });
  }

  return routes;
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
  // 单元内排序：男左女右（族谱惯例），同性别再生年排序；未知性别居中
  const genderRank = (id: string): number => {
    const g = working.persons[id]?.gender;
    if (g === "male") return 0;
    if (g === "female") return 2;
    return 1;
  };
  for (const [unit, members] of membersOf) {
    members.sort((a, b) => {
      const ga = genderRank(a);
      const gb = genderRank(b);
      if (ga !== gb) return ga - gb;
      return byBirthThenId(working, a, b);
    });
  }

    const unitPedigreeKey = (unit: string): string => {
    const members = membersOf.get(unit) ?? [];
    let best = "9";
    for (const id of members) {
      const path = pedigreePath(working, id, meId);
      if (path && path.length > 0 && /^[FM]+$/.test(path)) {
        const key = pedigreeSortKey(path);
        if (key < best) best = key;
        continue;
      }
      const lineage = lineageOf.get(id);
      const birth = working.persons[id]?.birthYear ?? "";
      const side = collateralSide(working, id, meId);
      let key = "9";
      if (lineage === "collateral" && side === "paternal") key = "!P" + birth + id;
      else if (lineage === "sibling") key = "03S" + birth + id;
      else if (lineage === "affinal" || lineage === "descendant" || lineage === "ego") key = "02E" + id;
      else if (lineage === "collateral" && side === "maternal") key = "2M" + birth + id;
      else key = "9" + id;
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
      routes: [],
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
  for (const b of bands) {
    b.y += dy;
  }

  const routes = buildRoutes(working, byId, lineageOf);

  return {
    nodes,
    edges,
    routes,
    bands,
    byId,
    width: maxX - minX + 80,
    height: maxY - minY + 80,
    lineageOf,
  };
}

