const fs = require("fs");
const path = "D:/XiaomiMiMoProjects/laotagong/lib/tree.ts";
let c = fs.readFileSync(path, "utf8");

// 1) Add TreeLayoutRoute interface after TreeLayoutEdge
if (!c.includes("TreeLayoutRoute")) {
  c = c.replace(
    "export interface TreeLayoutJunction {",
    `export interface TreeLayoutRoute {
  id: string;
  fromId: string;
  toId: string;
  kind: "blood" | "spouse";
  lineage: LineageKind;
  /** SVG ?????????????????????? */
  d: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface TreeLayoutJunction {`
  );
}

// 2) Add routes to TreeLayout
if (!c.includes("routes: TreeLayoutRoute[]")) {
  c = c.replace(
    "  edges: TreeLayoutEdge[];",
    "  edges: TreeLayoutEdge[];\n  routes: TreeLayoutRoute[];"
  );
}

// 3) Insert route builder and wire into return
const builder = `
/**
 * ?????????????????
 * ????? + ??????????? clamp ?????
 * ?????????????????????? path?
 */
function buildRoutes(
  state: FamilyState,
  byId: Map<string, TreeLayoutNode>,
  lineageOf: Map<string, LineageKind>
): TreeLayoutRoute[] {
  const routes: TreeLayoutRoute[] = [];

  const childRatio = (pid: string): number => {
    const l = lineageOf.get(pid);
    if (l === "paternal") return 0.32;
    if (l === "maternal") return 0.68;
    return 0.5;
  };

  // ????????????????
  const parentListOf = (childId: string): string[] => {
    const e = state.parents[childId];
    return [e?.fatherId, e?.motherId].filter((x): x is string => Boolean(x));
  };

  for (const [childId, entry] of Object.entries(state.parents)) {
    const child = byId.get(childId);
    if (!child) continue;
    const parents = [entry.fatherId, entry.motherId].filter(
      (p): p is string => Boolean(p) && byId.has(p)
    );
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
      const ratio = childRatio(pid);
      // ?????????????????
      const pRatio =
        parents.length >= 2 ? (pIndex === 0 ? 0.4 : 0.6) : 0.5;
      const sx = parent.x + parent.width * pRatio;
      const sy = parent.y + parent.height;
      const ex = child.x + child.width * ratio;
      const ey = child.y;

      let d: string;
      if (Math.abs(sx - ex) < 1.5) {
        d = "M " + sx + " " + sy + " V " + ey;
      } else {
        const gap = Math.max(ey - sy, 8);
        // ?????????????? + ???????????
        const lineageBias = pl === "paternal" ? 0 : pl === "maternal" ? 8 : 4;
        const channel =
          sy + gap * 0.4 + lineageBias + (pIndex % 2) * 6 + ((sibIndex < 0 ? 0 : sibIndex) % 3) * 4;
        // ???????????????????????
        let hMin = Math.min(sx, ex);
        let hMax = Math.max(sx, ex);
        for (const sid of Object.keys(state.persons)) {
          if (sid === pid || sid === childId) continue;
          const sp = byId.get(sid);
          if (!sp) continue;
          const sameRowAsChild = Math.abs(sp.y - child.y) < 2;
          const sameRowAsParent = Math.abs(sp.y - parent.y) < 2;
          if (!sameRowAsChild && !sameRowAsParent) continue;
          // ?????????
          if (sameRowAsChild && sid !== pid) {
            const isParentOfChild = parents.includes(sid);
            if (!isParentOfChild) {
              if (sp.x >= child.x + child.width - 2) {
                // ??????????????????
                hMax = Math.min(hMax, child.x + child.width * ratio + 2);
              } else if (sp.x + sp.width <= child.x + 2) {
                hMin = Math.max(hMin, child.x + child.width * ratio - 2);
              }
            }
          }
          // ?????????????????????????
          if (pl === "paternal") {
            hMax = Math.min(hMax, child.x + child.width * 0.5);
            hMin = Math.max(hMin, Math.min(sx, parent.x));
          }
          if (pl === "maternal") {
            hMin = Math.max(hMin, child.x + child.width * 0.5);
            hMax = Math.min(hMax, Math.max(sx, parent.x + parent.width));
          }
        }
        if (pl === "paternal") {
          hMax = Math.min(hMax, Math.max(ex, child.x + child.width * 0.32));
        }
        if (pl === "maternal") {
          hMin = Math.max(hMin, Math.min(ex, child.x + child.width * 0.68));
        }
        if (hMin > hMax) {
          hMin = Math.min(sx, ex);
          hMax = Math.max(sx, ex);
        }
        // ???????????????????????????
        // ?? x ???? [hMin,hMax]????? ex ?????????
        const hx1 = Math.max(hMin, Math.min(hMax, sx));
        const hx2 = Math.max(hMin, Math.min(hMax, ex));
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
        start: { x: sx, y: sy },
        end: { x: ex, y: ey },
      });
    });
  }

  for (const { a, b } of state.spouses) {
    const na = byId.get(a);
    const nb = byId.get(b);
    if (!na || !nb) continue;
    // ??????????????????????
    const left = na.x <= nb.x ? na : nb;
    const right = na.x <= nb.x ? nb : na;
    const other = na.x <= nb.x ? b : a;
    const self = na.x <= nb.x ? a : b;
    const y1 = left.y + left.height / 2;
    const y2 = right.y + right.height / 2;
    const d = "M " + (left.x + left.width) + " " + y1 + " L " + right.x + " " + y2;
    routes.push({
      id: "r:s:" + self + "+" + other,
      fromId: self,
      toId: other,
      kind: "spouse",
      lineage: "affinal",
      d,
      start: { x: left.x + left.width, y: y1 },
      end: { x: right.x, y: y2 },
    });
  }

  return routes;
}
`;

if (!c.includes("function buildRoutes")) {
  c = c.replace("export function layoutFamilyTree", builder + "\nexport function layoutFamilyTree");
}

// empty return
c = c.replace(
  `    return {
      nodes,
      edges,
      junctions,
      bands,
      byId,
      width: 0,
      height: 0,
      lineageOf,
    };`,
  `    return {
      nodes,
      edges,
      routes: [],
      junctions,
      bands,
      byId,
      width: 0,
      height: 0,
      lineageOf,
    };`
);

// final return: build routes after normalize
c = c.replace(
  `  return {
    nodes,
    edges,
    junctions,
    bands,
    byId,
    width: maxX - minX + 80,
    height: maxY - minY + 80,
    lineageOf,
  };`,
  `  const routes = buildRoutes(working, byId, lineageOf);

  return {
    nodes,
    edges,
    routes,
    junctions,
    bands,
    byId,
    width: maxX - minX + 80,
    height: maxY - minY + 80,
    lineageOf,
  };`
);

fs.writeFileSync(path, c, "utf8");
console.log("routes in tree", c.includes("buildRoutes"), c.includes("routes: TreeLayoutRoute"), c.includes("const routes = buildRoutes"));
