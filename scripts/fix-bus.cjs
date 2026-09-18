const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/lib/tree.ts";
let c = fs.readFileSync(p, "utf8");

// Extend interface with childAttach
if (!c.includes("childAttach")) {
  c = c.replace(
    "  parentLanes: Array<{ parentId: string; x: number; laneY: number }>;",
    "  parentLanes: Array<{ parentId: string; x: number; laneY: number }>;\n  /** 子女挂接点 x：与渲染端一致，总线必须盖住这些点 */\n  childAttach: Record<string, number>;"
  );
}

const re = /const sample = childIds\[0\];[\s\S]*?parentLanes,\r?\n    \}\);/;
if (!re.test(c)) {
  console.log("junction block not found");
  process.exit(1);
}

const neu = `const sampleId = childIds[0];
    const sortedChildren = [...childIds].sort((a, b) => {
      const na = byId.get(a) as TreeLayoutNode;
      const nb = byId.get(b) as TreeLayoutNode;
      return na.x + na.width / 2 - (nb.x + nb.width / 2);
    });

    // 双亲亲系 → 子女挂接比例（与绘制端同一规则）
    const attachRatio = (() => {
      let pat = false;
      let mat = false;
      for (const pid of parentIds) {
        const l = lineageOf.get(pid);
        if (l === "paternal") pat = true;
        if (l === "maternal") mat = true;
      }
      if (pat && !mat) return 0.28;
      if (mat && !pat) return 0.72;
      return 0.5;
    })();

    const childAttach: Record<string, number> = {};
    for (const cid of sortedChildren) {
      const n = byId.get(cid) as TreeLayoutNode;
      childAttach[cid] = n.x + n.width * attachRatio;
    }

    const stagger = (junctions.length % 3) * 10;
    const busY = parentBottom + (childTop - parentBottom) * 0.42 + stagger;

    const parentLanes = parentIds.map((pid, index) => {
      const n = byId.get(pid) as TreeLayoutNode;
      const cx = n.x + n.width / 2;
      const sign = parentIds.length === 1 ? 0 : index === 0 ? -1 : 1;
      const pl = lineageOf.get(pid);
      const sidePull = pl === "paternal" ? -16 : pl === "maternal" ? 16 : 0;
      // 车道停在「家长中心」与「子女挂接点」之间，不越过到另一侧配偶
      const targets = sortedChildren.map((cid) => childAttach[cid]);
      const target =
        targets.length > 0
          ? targets.reduce((s, v) => s + v, 0) / targets.length
          : cx;
      const laneX =
        pl === "paternal"
          ? Math.min(cx + sign * 8, target - 4)
          : pl === "maternal"
            ? Math.max(cx + sign * 8, target + 4)
            : cx + sign * 8 + sidePull;
      return {
        parentId: pid,
        x: laneX,
        laneY: busY - 16 - index * 10,
      };
    });

    // 总线必须盖住：所有车道终点 + 所有子女挂接点
    let busLeft = Number.POSITIVE_INFINITY;
    let busRight = Number.NEGATIVE_INFINITY;
    const xs = [...Object.values(childAttach), ...parentLanes.map((l) => l.x)];
    for (const x of xs) {
      busLeft = Math.min(busLeft, x);
      busRight = Math.max(busRight, x);
    }

    // 非本汇合点家长的配偶（如父亲的现任配偶母亲）：总线不得伸进其卡片
    for (const cid of sortedChildren) {
      const child = byId.get(cid) as TreeLayoutNode;
      for (const sid of getSpouseIds(working, cid)) {
        if (parentIds.includes(sid)) continue;
        const sp = byId.get(sid);
        if (!sp) continue;
        const sameRow = Math.abs(sp.y - child.y) < 1;
        if (!sameRow) continue;
        if (sp.x >= child.x + child.width - 1) {
          busRight = Math.min(busRight, child.x + child.width + 6);
        } else if (sp.x + sp.width <= child.x + 1) {
          busLeft = Math.max(busLeft, child.x - 6);
        }
      }
    }
    if (busLeft > busRight) {
      const mid = (busLeft + busRight) / 2;
      busLeft = mid - 1;
      busRight = mid + 1;
    }

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
      childAttach,
    });`;

c = c.replace(re, neu);
// also need getSpouseIds already imported
if (!c.includes("getSpouseIds")) {
  c = c.replace("getRelationDistances,", "getRelationDistances,\n  getSpouseIds,");
}
fs.writeFileSync(p, c);
console.log("tree patched", c.includes("childAttach"), c.includes("busRight = Math.min"));
