import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { buildG6Scene, parseSvgPathD } from "@/lib/g6-scene";

function person(id: string, g: Person["gender"], y = ""): Person {
  return createPerson({ id, name: id, gender: g, birthYear: y, createdAt: 1 });
}

/** 三代 + 一对配偶：覆盖父母总线与夫妻横线两类连线 */
function fam(): FamilyState {
  const persons: Record<string, Person> = {};
  for (const [id, gender, year] of [
    ["GF", "male", "1940"],
    ["GM", "female", "1945"],
    ["ME", "male", "1990"],
    ["WIFE", "female", "1992"],
    ["SON", "male", "2018"],
  ] as const) {
    persons[id] = person(id, gender, year);
  }
  return {
    version: 1,
    persons,
    parents: {
      ME: { fatherId: "GF", motherId: "GM" },
      SON: { fatherId: "ME", motherId: "WIFE" },
    },
    spouses: [
      { a: "GF", b: "GM" },
      { a: "ME", b: "WIFE" },
    ],
    meId: "ME",
  };
}

describe("parseSvgPathD", () => {
  it("解析 buildRoutes 产出的 M/H/V/L 指令子集", () => {
    expect(parseSvgPathD("M 10 20 V 30 H 40 V 50")).toEqual([
      ["M", 10, 20],
      ["V", 30],
      ["H", 40],
      ["V", 50],
    ]);
    expect(parseSvgPathD("M 1.5 2.5 L 3 4")).toEqual([
      ["M", 1.5, 2.5],
      ["L", 3, 4],
    ]);
  });

  it("空串与未知指令不抛错", () => {
    expect(parseSvgPathD("")).toEqual([]);
    expect(parseSvgPathD("Q 1 2 3 4 M 5 6")).toEqual([["M", 5, 6]]);
  });
});

describe("buildG6Scene（复用自研几何）", () => {
  const state = fam();
  const scene = buildG6Scene(state);

  it("全员成节点，坐标为布局框左上角（G6 html 节点按左上角锚定）", () => {
    expect(scene.nodes.map((n) => n.id).sort()).toEqual([
      "GF",
      "GM",
      "ME",
      "SON",
      "WIFE",
    ]);
    for (const n of scene.nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.y).toBeGreaterThan(0);
    }
  });

  it("每个世代一个条带，且代际自上而下递增", () => {
    expect(scene.bands.length).toBeGreaterThanOrEqual(3);
    const yOf = (id: string) =>
      scene.nodes.find((n) => n.id === id)!.y;
    // 父辈在上、子辈在下（G6 与自研同几何的直接证据）
    expect(yOf("GF")).toBeLessThan(yOf("ME"));
    expect(yOf("ME")).toBeLessThan(yOf("SON"));
  });

  it("夫妻边是同一行上的横线（先连线再连下一代）", () => {
    const yOf = (id: string) => scene.nodes.find((n) => n.id === id)!.y;
    expect(yOf("ME")).toBe(yOf("WIFE"));
    const spouseEdge = scene.edges.find(
      (e) => e.kind === "spouse" && e.source === "ME"
    );
    expect(spouseEdge).toBeDefined();
    expect(spouseEdge!.path[0]?.[0]).toBe("M");
  });

  it("每条边带非空 path 指令与真实端点", () => {
    expect(scene.edges.length).toBeGreaterThan(0);
    const ids = new Set(scene.nodes.map((n) => n.id));
    for (const e of scene.edges) {
      expect(e.path.length).toBeGreaterThan(0);
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("场景尺寸为正（autoFit 用）", () => {
    expect(scene.width).toBeGreaterThan(0);
    expect(scene.height).toBeGreaterThan(0);
  });
});
