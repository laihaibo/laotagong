import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { SPOUSE_GAP, layoutFamilyTree } from "@/lib/tree";

function person(id: string, g: Person["gender"], y = ""): Person {
  return createPerson({ id, name: id, gender: g, birthYear: y, createdAt: 1 });
}

function parsePathPoints(d: string): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const re = /([MLHV])\s*([^MLHV]+)/gi;
  let m: RegExpExecArray | null;
  let cx = 0;
  let cy = 0;
  while ((m = re.exec(d))) {
    const cmd = m[1].toUpperCase();
    const nums = m[2].trim().split(/[\s,]+/).map(Number);
    if (cmd === "M" || cmd === "L") {
      cx = nums[0];
      cy = nums[1];
      pts.push({ x: cx, y: cy });
    } else if (cmd === "H") {
      cx = nums[0];
      pts.push({ x: cx, y: cy });
    } else if (cmd === "V") {
      cy = nums[0];
      pts.push({ x: cx, y: cy });
    }
  }
  return pts;
}

function inBox(
  p: { x: number; y: number },
  n: { x: number; y: number; width: number; height: number },
  pad = 1
): boolean {
  return (
    p.x >= n.x - pad &&
    p.x <= n.x + n.width + pad &&
    p.y >= n.y - pad &&
    p.y <= n.y + n.height + pad
  );
}

describe("双系三代家庭的基本连线几何", () => {
  const persons: Record<string, Person> = {};
  for (const [id, g, y] of [
    ["PGF", "male", "1940"],
    ["PGM", "female", "1942"],
    ["MGF", "male", "1941"],
    ["MGM", "female", "1943"],
    ["F", "male", "1965"],
    ["M", "female", "1968"],
    ["ME", "male", "1990"],
    ["WIFE", "female", "1992"],
  ] as const) {
    persons[id] = person(id, g, y);
  }
  const state: FamilyState = {
    version: 1,
    persons,
    parents: {
      F: { fatherId: "PGF", motherId: "PGM" },
      M: { fatherId: "MGF", motherId: "MGM" },
      ME: { fatherId: "F", motherId: "M" },
    },
    spouses: [
      { a: "PGF", b: "PGM" },
      { a: "MGF", b: "MGM" },
      { a: "F", b: "M" },
      { a: "ME", b: "WIFE" },
    ],
    meId: "ME",
  };
  const layout = layoutFamilyTree(state);

  it("每位血亲都有对应的 blood 路由", () => {
    const ids = layout.routes.filter((r) => r.kind === "blood").map((r) => r.id);
    expect(ids).toContain("r:PGF+PGM>F");
    expect(ids).toContain("r:MGF+MGM>M");
    expect(ids).toContain("r:F+M>ME");
  });

  it("blood 路由终点落在子女顶边中点，起点在双亲一侧", () => {
    for (const r of layout.routes.filter((x) => x.kind === "blood")) {
      const to = layout.byId.get(r.toId)!;
      // 子女挂接点：顶边中点
      expect(r.end.x, r.id + " 未落在子女顶边中点").toBeCloseTo(to.x + to.width / 2, 0);
      expect(r.end.y).toBeCloseTo(to.y, 0);
      // 起点：在双亲卡片的水平范围内（夫妻横线中点或家长下沿）
      const entry = state.parents[r.toId];
      const parentNodes = [entry.fatherId, entry.motherId]
        .filter((id): id is string => Boolean(id))
        .map((id) => layout.byId.get(id)!)
        .filter(Boolean);
      const xs = parentNodes.flatMap((p) => [p.x, p.x + p.width]);
      expect(r.start.x).toBeGreaterThanOrEqual(Math.min(...xs) - 2);
      expect(r.start.x).toBeLessThanOrEqual(Math.max(...xs) + 2);
      expect(r.start.y).toBeLessThan(to.y);
    }
  });

  it("path 的首末点与 start/end 元数据一致", () => {
    for (const r of layout.routes.filter((x) => x.kind === "blood")) {
      const pts = parsePathPoints(r.d);
      expect(pts.length).toBeGreaterThanOrEqual(2);
      expect(pts[0].x).toBeCloseTo(r.start.x, 0);
      expect(pts[0].y).toBeCloseTo(r.start.y, 0);
      const last = pts[pts.length - 1];
      expect(last.x).toBeCloseTo(r.end.x, 0);
      expect(last.y).toBeCloseTo(r.end.y, 0);
    }
  });

  it("父系到父亲的线不穿过母亲卡片", () => {
    const m = layout.byId.get("M")!;
    for (const id of ["r:PGF+PGM>F"]) {
      const r = layout.routes.find((x) => x.id === id)!;
      for (const p of parsePathPoints(r.d)) {
        expect(inBox(p, m), id + " touches M at " + p.x + "," + p.y).toBe(false);
      }
    }
  });

  it("母系到母亲的线不穿过父亲卡片", () => {
    const f = layout.byId.get("F")!;
    for (const id of ["r:MGF+MGM>M"]) {
      const r = layout.routes.find((x) => x.id === id)!;
      for (const p of parsePathPoints(r.d)) {
        expect(inBox(p, f), id + " touches F at " + p.x + "," + p.y).toBe(false);
      }
    }
  });

  it("父系与母系的横向通道左右分离", () => {
    const pat = parsePathPoints(layout.routes.find((r) => r.id === "r:PGF+PGM>F")!.d);
    const mat = parsePathPoints(layout.routes.find((r) => r.id === "r:MGF+MGM>M")!.d);
    // 父系路径的最大 x 必须小于母系路径的最小 x
    const patMax = Math.max(...pat.map((p) => p.x));
    const matMin = Math.min(...mat.map((p) => p.x));
    expect(patMax).toBeLessThan(matMin + 1);
  });
});

/**
 * 连线不得被卡片盖住——被盖住的那一段在视觉上就是「断线」。
 * 两条真实踩过的路径：
 *   1. 一人多配偶：A—B—C 同单元，A 与 C 的婚姻线直连会横穿 B 的卡片背后；
 *   2. 亲子同排（未设「我」，或整支与「我」不连通）：向下的肘线
 *      只能从行下方爬回子女顶边，那根竖线整段穿过子女卡片背后。
 */
describe("连线不得穿过任何卡片（逐点采样）", () => {
  function person(id: string, g: Person["gender"], y = ""): Person {
    return createPerson({ id, name: id, gender: g, birthYear: y, createdAt: 1 });
  }

  /** 沿路径每 4px 取一个点，返回落在任何卡片内部的点 */
  function samplesInsideAnyCard(
    d: string,
    nodes: Array<{ x: number; y: number; width: number; height: number; id: string }>
  ): string {
    const pts = parsePathPoints(d);
    let bad = "";
    for (let i = 1; i < pts.length && !bad; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len / 4));
      for (let s = 0; s <= steps && !bad; s += 1) {
        const x = a.x + ((b.x - a.x) * s) / steps;
        const y = a.y + ((b.y - a.y) * s) / steps;
        for (const n of nodes) {
          if (
            x > n.x + 2 &&
            x < n.x + n.width - 2 &&
            y > n.y + 2 &&
            y < n.y + n.height - 2
          ) {
            bad = `路径 ${d} 在 (${x.toFixed(1)}, ${y.toFixed(1)}) 穿过卡片 ${n.id}`;
            break;
          }
        }
      }
    }
    return bad;
  }

  function assertAllRoutesClear(state: FamilyState) {
    const layout = layoutFamilyTree(state);
    expect(layout.nodes.length).toBeGreaterThan(0);
    for (const route of layout.routes) {
      const hidden = samplesInsideAnyCard(route.d, layout.nodes);
      expect(hidden, `${route.id}（${route.kind}）: ${hidden}`).toBe("");
    }
  }

  function assertEndpointsOnEdges(state: FamilyState) {
    const layout = layoutFamilyTree(state);
    const onEdge = (p: { x: number; y: number }, n: TreeLayoutNodeLike) =>
      p.x >= n.x - 2 &&
      p.x <= n.x + n.width + 2 &&
      p.y >= n.y - 2 &&
      p.y <= n.y + n.height + 2;
    const insideAnyCard = (p: { x: number; y: number }) =>
      layout.nodes.some(
        (n) =>
          p.x > n.x + 2 &&
          p.x < n.x + n.width - 2 &&
          p.y > n.y + 2 &&
          p.y < n.y + n.height - 2
      );
    for (const route of layout.routes) {
      const from = layout.byId.get(route.fromId);
      const to = layout.byId.get(route.toId);
      if (!from || !to) continue;
      // 起点要么贴在 from 卡片边缘（兜底肘线 / 夫妻线），
      // 要么是「夫妻横线中点垂落」——悬在双亲两卡之间的空隙里
      const entry = state.parents[route.toId];
      const parentNodes = [entry?.fatherId, entry?.motherId]
        .filter((id): id is string => Boolean(id))
        .map((id) => layout.byId.get(id)!);
      const xs = parentNodes.flatMap((p) => [p.x, p.x + p.width]);
      const startOnMarriageBar =
        !insideAnyCard(route.start) &&
        xs.length > 0 &&
        route.start.x >= Math.min(...xs) - 2 &&
        route.start.x <= Math.max(...xs) + 2;
      // 多子女的总线画法：短垂线起点悬在子女上方的总线高度上
      const startIsDrop =
        route.kind === "blood" &&
        Math.abs(route.start.x - route.end.x) < 0.5 &&
        route.start.y <= route.end.y &&
        !insideAnyCard(route.start);
      // 主干（多子女总线）起点悬在夫妻横线中点：不在任何卡内、
      // 且落在 from/to 两张卡的联合跨度内
      const startOnTrunk =
        route.kind === "blood" &&
        !insideAnyCard(route.start) &&
        route.start.x >= Math.min(from.x, to.x) - 2 &&
        route.start.x <= Math.max(from.x + from.width, to.x + to.width) + 2 &&
        route.start.y >= Math.min(from.y, to.y) - 2 &&
        route.start.y <= Math.max(from.y + from.height, to.y + to.height) + 2;
      const startOk =
        onEdge(route.start, from) ||
        startOnMarriageBar ||
        startIsDrop ||
        startOnTrunk;
      expect(startOk, `${route.id} 起点悬空`).toBe(true);
      // 总线路由的终点悬在末位子女上方（其 x 即该子女顶边中点）
      const endIsBus =
        route.kind === "blood" &&
        Math.abs(route.end.x - (to.x + to.width / 2)) < 0.5 &&
        route.end.y < to.y;
      const endOk = onEdge(route.end, to) || endIsBus;
      expect(endOk, `${route.id} 终点不在 ${route.toId} 边缘上`).toBe(true);
    }
  }

  type TreeLayoutNodeLike = { x: number; y: number; width: number; height: number };

  it("一人多配偶：A 与 C 的婚姻线绕过中间的 B", () => {
    const persons: Record<string, Person> = {};
    for (const [id, g, y] of [
      ["A", "male", "1950"],
      ["B", "female", "1952"],
      ["C", "female", "1960"],
      ["AB", "male", "1975"],
      ["AC", "male", "1985"],
    ] as const) {
      persons[id] = person(id, g, y);
    }
    const state: FamilyState = {
      version: 1,
      persons,
      parents: {
        AB: { fatherId: "A", motherId: "B" },
        AC: { fatherId: "A", motherId: "C" },
      },
      spouses: [
        { a: "A", b: "B" },
        { a: "A", b: "C" },
      ],
      meId: "AB",
    };
    assertAllRoutesClear(state);
    assertEndpointsOnEdges(state);
  });

  it("未设「我」：同排的亲子连线不得穿过卡片", () => {
    const persons: Record<string, Person> = {};
    for (const [id, g, y] of [
      ["F", "male", "1965"],
      ["M", "female", "1968"],
      ["S", "male", "1990"],
    ] as const) {
      persons[id] = person(id, g, y);
    }
    const state: FamilyState = {
      version: 1,
      persons,
      parents: { S: { fatherId: "F", motherId: "M" } },
      spouses: [{ a: "F", b: "M" }],
      meId: null,
    };
    assertAllRoutesClear(state);
    assertEndpointsOnEdges(state);
  });

  it("与「我」不连通的支系（同排亲子 + 夫妻）同样不得穿过卡片", () => {
    const persons: Record<string, Person> = {};
    for (const [id, g, y] of [
      ["ME", "male", "1990"],
      ["OF", "male", "1940"],
      ["OM", "female", "1942"],
      ["OS", "male", "1965"],
    ] as const) {
      persons[id] = person(id, g, y);
    }
    const state: FamilyState = {
      version: 1,
      persons,
      parents: { OS: { fatherId: "OF", motherId: "OM" } },
      spouses: [
        { a: "OF", b: "OM" },
      ],
      meId: "ME",
    };
    assertAllRoutesClear(state);
    assertEndpointsOnEdges(state);
  });

  it("共同养育未结婚：父母并格相连，横线中点垂落到子女顶边中点", () => {
    // 真实场景：「添加父亲」「添加母亲」都不建婚姻边（spouses 为空），
    // 但展示上父母必须并格相连、从中点垂落到子女。
    const persons: Record<string, Person> = {};
    for (const [id, g, y] of [
      ["ME", "male", "1990"],
      ["F", "male", "1965"],
      ["M", "female", "1968"],
    ] as const) {
      persons[id] = person(id, g, y);
    }
    const state: FamilyState = {
      version: 1,
      persons,
      parents: { ME: { fatherId: "F", motherId: "M" } },
      spouses: [],
      meId: "ME",
    };
    assertAllRoutesClear(state);
    assertEndpointsOnEdges(state);

    const layout = layoutFamilyTree(state);
    // 父母并格相邻（buildUnits 把共同养育者并进同一单元，间距即单元内间距）
    const f = layout.byId.get("F")!;
    const m = layout.byId.get("M")!;
    const gap = Math.min(
      Math.abs(m.x - (f.x + f.width)),
      Math.abs(f.x - (m.x + m.width))
    );
    expect(gap, "父母卡片没有并格相邻").toBe(SPOUSE_GAP);
    // 有「父母相连」横线 + 从横线中点垂落的血亲线
    const bar = layout.routes.find(
      (r) =>
        r.kind === "spouse" &&
        ((r.fromId === "F" && r.toId === "M") || (r.fromId === "M" && r.toId === "F"))
    );
    expect(bar, "父母之间缺少相连横线").toBeTruthy();
    const drop = layout.routes.find((r) => r.id === "r:F+M>ME");
    expect(drop, "缺少从父母横线垂落到子女的路由").toBeTruthy();
    const me = layout.byId.get("ME")!;
    expect(drop!.start.y).toBeCloseTo(f.y + f.height / 2, 0);
    expect(drop!.end.x).toBeCloseTo(me.x + me.width / 2, 0);
    expect(drop!.end.y).toBeCloseTo(me.y, 0);
  });

  it("常规三代家庭仍然全部连通且不穿卡", () => {
    const persons: Record<string, Person> = {};
    for (const [id, g, y] of [
      ["GF", "male", "1940"],
      ["GM", "female", "1945"],
      ["F", "male", "1965"],
      ["M", "female", "1968"],
      ["ME", "male", "1990"],
      ["WIFE", "female", "1992"],
      ["SON", "male", "2015"],
    ] as const) {
      persons[id] = person(id, g, y);
    }
    const state: FamilyState = {
      version: 1,
      persons,
      parents: {
        F: { fatherId: "GF", motherId: "GM" },
        ME: { fatherId: "F", motherId: "M" },
        SON: { fatherId: "ME", motherId: "WIFE" },
      },
      spouses: [
        { a: "GF", b: "GM" },
        { a: "F", b: "M" },
        { a: "ME", b: "WIFE" },
      ],
      meId: "ME",
    };
    assertAllRoutesClear(state);
    assertEndpointsOnEdges(state);
  });

  it("夫妻男左女右（即使妻子年长）；横线加长；多子女共享一条总线", () => {
    // 妻子比丈夫年长 5 岁：按生年排序妻子会跑到左边，性别优先后必须男左女右
    const persons: Record<string, Person> = {};
    for (const [id, g, y] of [
      ["ME", "male", "1990"],
      ["WIFE", "female", "1985"],
      ["S1", "male", "2012"],
      ["S2", "female", "2015"],
      ["S3", "male", "2018"],
    ] as const) {
      persons[id] = person(id, g, y);
    }
    const state: FamilyState = {
      version: 1,
      persons,
      parents: {
        S1: { fatherId: "ME", motherId: "WIFE" },
        S2: { fatherId: "ME", motherId: "WIFE" },
        S3: { fatherId: "ME", motherId: "WIFE" },
      },
      spouses: [{ a: "ME", b: "WIFE" }],
      meId: "ME",
    };
    assertAllRoutesClear(state);
    assertEndpointsOnEdges(state);

    const layout = layoutFamilyTree(state);
    const me = layout.byId.get("ME")!;
    const wife = layout.byId.get("WIFE")!;
    // 1) 男左女右
    expect(me.x + me.width).toBeLessThanOrEqual(wife.x + 1);

    // 2) 横线恰好横跨两卡相向边（长度 = SPOUSE_GAP，不再是一小截）
    const bar = layout.routes.find(
      (r) => r.kind === "spouse" && r.fromId === "ME" && r.toId === "WIFE"
    );
    expect(bar, "缺少夫妻横线").toBeTruthy();
    expect(bar!.end.x - bar!.start.x).toBeCloseTo(SPOUSE_GAP, 0);

    // 3) 多子女：一条主干 + 一条总线 + 三根短垂线（共享同一总线高度）
    const drops = layout.routes.filter((r) => r.id.startsWith("r:ME+WIFE>drop:"));
    expect(drops).toHaveLength(3);
    const busYs = new Set(drops.map((r) => r.start.y));
    expect(busYs.size, "三根垂线没有共享同一条总线").toBe(1);
    const busY = [...busYs][0];
    const trunk = layout.routes.find(
      (r) => r.id === "r:ME+WIFE>bus@" + drops[0].end.y
    );
    expect(trunk, "缺少主干+总线路由").toBeTruthy();
    // 主干从夫妻横线中点垂落
    expect(trunk!.start.x).toBeCloseTo((me.x + me.width + wife.x) / 2, 0);
    expect(trunk!.start.y).toBeCloseTo(bar!.start.y, 0);
    // 总线横贯首末孩子的顶边中点 x
    const centers = ["S1", "S2", "S3"].map(
      (id) => layout.byId.get(id)!.x + layout.byId.get(id)!.width / 2
    );
    const busPts = parsePathPoints(trunk!.d).filter((p) => p.y === busY);
    expect(Math.min(...busPts.map((p) => p.x))).toBeCloseTo(Math.min(...centers), 0);
    expect(Math.max(...busPts.map((p) => p.x))).toBeCloseTo(Math.max(...centers), 0);
    // 每根垂线落到对应孩子的顶边中点
    for (const d of drops) {
      const to = layout.byId.get(d.toId)!;
      expect(d.end.x).toBeCloseTo(to.x + to.width / 2, 0);
      expect(d.end.y).toBeCloseTo(to.y, 0);
    }
  });

  it("只录了一位亲长的子女并入唯一伴侣的共享总线", () => {
    // 旧数据/漏录：S1 双亲齐全，S2 只录了父亲——S2 也应从父母横线的总线分叉
    const persons: Record<string, Person> = {};
    for (const [id, g, y] of [
      ["ME", "male", "1990"],
      ["WIFE", "female", "1992"],
      ["S1", "male", "2015"],
      ["S2", "male", "2018"],
    ] as const) {
      persons[id] = person(id, g, y);
    }
    const state: FamilyState = {
      version: 1,
      persons,
      parents: {
        S1: { fatherId: "ME", motherId: "WIFE" },
        S2: { fatherId: "ME" },
      },
      spouses: [],
      meId: "ME",
    };
    assertAllRoutesClear(state);
    assertEndpointsOnEdges(state);

    const layout = layoutFamilyTree(state);
    const drop1 = layout.routes.find((r) => r.id === "r:ME+WIFE>drop:S1");
    const drop2 = layout.routes.find((r) => r.id === "r:ME+WIFE>drop:S2");
    expect(drop1, "S1 缺少总线垂线").toBeTruthy();
    expect(drop2, "S2 未并入共享总线（应从总线分叉）").toBeTruthy();
    expect(drop1!.start.y).toBe(drop2!.start.y);
    // 唯一伴侣对：父母横线不缺席
    const bar = layout.routes.find((r) => r.kind === "spouse");
    expect(bar, "父母横线缺失").toBeTruthy();
  });

  it("同一父母行的两对夫妻总线高度错开，不再连成一条", () => {
    // 父辈行有两对夫妻：父母（我+妹妹的双亲）与伯伯夫妇（堂兄的双亲），
    // 两家的子女都在同一条子辈行——两条总线同高就会前后相连。
    const persons: Record<string, Person> = {};
    for (const [id, g, y] of [
      ["GF", "male", "1940"],
      ["GM", "female", "1942"],
      ["F", "male", "1965"],
      ["M", "female", "1968"],
      ["UNCLE", "male", "1962"],
      ["UW", "female", "1964"],
      ["ME", "male", "1990"],
      ["SIS", "female", "1993"],
      ["COUSIN", "male", "1992"],
      ["COUSIN2", "male", "1995"],
    ] as const) {
      persons[id] = person(id, g, y);
    }
    const state: FamilyState = {
      version: 1,
      persons,
      parents: {
        F: { fatherId: "GF", motherId: "GM" },
        UNCLE: { fatherId: "GF", motherId: "GM" },
        ME: { fatherId: "F", motherId: "M" },
        SIS: { fatherId: "F", motherId: "M" },
        COUSIN: { fatherId: "UNCLE", motherId: "UW" },
        COUSIN2: { fatherId: "UNCLE", motherId: "UW" },
      },
      spouses: [
        { a: "GF", b: "GM" },
        { a: "F", b: "M" },
        { a: "UNCLE", b: "UW" },
      ],
      meId: "ME",
    };
    assertAllRoutesClear(state);

    const layout = layoutFamilyTree(state);
    const buses = layout.routes.filter(
      (r) => r.id.includes(">bus@") && (r.fromId === "F" || r.fromId === "UNCLE")
    );
    expect(buses, "父辈行两对夫妻应各有一条主干+总线路由").toHaveLength(2);
    const busYs = new Set(buses.map((r) => r.end.y));
    expect(busYs.size, "两条总线高度相同，仍会连成一条").toBe(2);
    // 两条总线都落在行间空带里（父母下沿与子女顶边之间）
    for (const r of buses) {
      const from = layout.byId.get(r.fromId)!;
      const to = layout.byId.get(r.toId)!;
      expect(r.end.y).toBeGreaterThan(from.y + from.height);
      expect(r.end.y).toBeLessThan(to.y);
    }
  });
});
