import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { layoutFamilyTree } from "@/lib/tree";

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
    expect(ids).toContain("r:PGF>F");
    expect(ids).toContain("r:PGM>F");
    expect(ids).toContain("r:MGF>M");
    expect(ids).toContain("r:MGM>M");
    expect(ids).toContain("r:F>ME");
    expect(ids).toContain("r:M>ME");
  });

  it("blood 路由两端都落在对应卡片的边缘范围内", () => {
    for (const r of layout.routes.filter((x) => x.kind === "blood")) {
      const from = layout.byId.get(r.fromId)!;
      const to = layout.byId.get(r.toId)!;
      expect(r.start.y).toBeCloseTo(from.y + from.height, 0);
      expect(r.start.x).toBeGreaterThanOrEqual(from.x - 2);
      expect(r.start.x).toBeLessThanOrEqual(from.x + from.width + 2);
      expect(r.end.y).toBeCloseTo(to.y, 0);
      expect(r.end.x).toBeGreaterThanOrEqual(to.x - 2);
      expect(r.end.x).toBeLessThanOrEqual(to.x + to.width + 2);
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
    for (const id of ["r:PGF>F", "r:PGM>F"]) {
      const r = layout.routes.find((x) => x.id === id)!;
      for (const p of parsePathPoints(r.d)) {
        expect(inBox(p, m), id + " touches M at " + p.x + "," + p.y).toBe(false);
      }
    }
  });

  it("母系到母亲的线不穿过父亲卡片", () => {
    const f = layout.byId.get("F")!;
    for (const id of ["r:MGF>M", "r:MGM>M"]) {
      const r = layout.routes.find((x) => x.id === id)!;
      for (const p of parsePathPoints(r.d)) {
        expect(inBox(p, f), id + " touches F at " + p.x + "," + p.y).toBe(false);
      }
    }
  });

  it("父系与母系的横向通道左右分离", () => {
    const pat = parsePathPoints(layout.routes.find((r) => r.id === "r:PGF>F")!.d);
    const mat = parsePathPoints(layout.routes.find((r) => r.id === "r:MGF>M")!.d);
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
    for (const route of layout.routes) {
      const from = layout.byId.get(route.fromId);
      const to = layout.byId.get(route.toId);
      if (!from || !to) continue;
      expect(onEdge(route.start, from), `${route.id} 起点不在 ${route.fromId} 边缘上`).toBe(true);
      expect(onEdge(route.end, to), `${route.id} 终点不在 ${route.toId} 边缘上`).toBe(true);
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
});
