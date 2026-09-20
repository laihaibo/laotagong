const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/lib/tree.ts";
let c = fs.readFileSync(p, "utf8");

if (!c.includes("clusterRankOf")) {
  const helper = `
/** ????????????????????????/??? */
function clusterRankOf(
  state: FamilyState,
  unitMembers: string[],
  meId: string | null,
  distances: Map<string, number | null>
): number {
  if (!meId || !state.persons[meId]) return 4;
  const me = state.persons[meId];
  const mySpouses = new Set(
    state.spouses
      .filter((s) => s.a === meId || s.b === meId)
      .map((s) => (s.a === meId ? s.b : s.a))
  );
  const myP = state.parents[meId];
  const myParentIds = [myP?.fatherId, myP?.motherId].filter(Boolean);

  const shareParents = (a: string, b: string) => {
    const pa = state.parents[a];
    const pb = state.parents[b];
    if (!pa || !pb) return false;
    return Boolean(
      (pa.fatherId && pa.fatherId === pb.fatherId) ||
        (pa.motherId && pa.motherId === pb.motherId)
    );
  };

  let best = 4;
  for (const id of unitMembers) {
    if (id === meId || mySpouses.has(id)) {
      best = Math.min(best, 0);
      continue;
    }
    const d = distances.get(id);
    if (d !== null && d !== undefined && d >= 1) {
      best = Math.min(best, 0);
      continue;
    }
    if (shareParents(meId, id)) {
      best = Math.min(best, 1);
      continue;
    }
    // ??????
    for (const sid of Object.keys(state.persons)) {
      if (sid === meId || sid === id) continue;
      const linked = state.spouses.some(
        (s) => (s.a === sid && s.b === id) || (s.b === sid && s.a === id)
      );
      if (linked && shareParents(meId, sid)) {
        best = Math.min(best, 1);
        break;
      }
    }
    // ?????
    for (const pid of myParentIds) {
      if (pid && shareParents(pid, id)) {
        best = Math.min(best, 2);
        break;
      }
    }
    // ???????????
    for (const spId of mySpouses) {
      if (shareParents(spId, id)) {
        best = Math.min(best, 3);
        break;
      }
    }
  }
  return best;
}

function buildRoutes(`;
  c = c.replace("function buildRoutes(", helper);
}

// After generationOf is built, compute unitCluster and use in sweepRow
if (!c.includes("unitClusterOf")) {
  c = c.replace(
    "  const unitPedigreeKey = (unit: string): string => {",
    `  const unitClusterOf = (unit: string): number => {
    return clusterRankOf(working, membersOf.get(unit) ?? [], meId, distances as Map<string, number | null>);
  };

  const unitPedigreeKey = (unit: string): string => {`
  );
}

// Replace sweepRow sort to prioritize cluster rank
const oldSweep = /const sweepRow = \(units: string\[\]\): Map<string, number> => \{[\s\S]*?return placed;\r?\n  \};/;
const newSweep = `const sweepRow = (units: string[]): Map<string, number> => {
    const placed = new Map<string, number>();
    const sorted = [...units].sort((a, b) => {
      const ca = unitClusterOf(a);
      const cb = unitClusterOf(b);
      // ????????????0??????????3???
      if (ca !== cb) return ca - cb;
      const ka = unitPedigreeKey(a);
      const kb = unitPedigreeKey(b);
      const kaAnc = ka !== "9";
      const kbAnc = kb !== "9";
      if (kaAnc && kbAnc && ka !== kb) return ka.localeCompare(kb);
      const ia = idealCenterOf.get(a) ?? 0;
      const ib = idealCenterOf.get(b) ?? 0;
      if (Math.abs(ia - ib) > 1) return ia - ib;
      return ka.localeCompare(kb);
    });
    let rightEdge = Number.NEGATIVE_INFINITY;
    let prevRank = -1;
    for (const unit of sorted) {
      const rank = unitClusterOf(unit);
      const half = widthOf(unit) / 2;
      const ideal = idealCenterOf.get(unit) ?? 0;
      // ?????????????????????????
      let gap = H_GAP;
      if (prevRank >= 0 && rank !== prevRank) {
        const delta = Math.abs(rank - prevRank);
        gap = delta >= 3 ? H_GAP * 3 : delta === 2 ? H_GAP * 2 : H_GAP * 1.5;
      }
      const center = Math.max(ideal, rightEdge + gap + half);
      placed.set(unit, center);
      rightEdge = center + half;
      prevRank = rank;
    }
    return placed;
  };`;
if (oldSweep.test(c)) {
  c = c.replace(oldSweep, newSweep);
  console.log("sweep ok");
} else {
  console.log("sweep NOT FOUND");
}

fs.writeFileSync(p, c, "utf8");
console.log("cluster helpers", c.includes("clusterRankOf"), c.includes("unitClusterOf"));
