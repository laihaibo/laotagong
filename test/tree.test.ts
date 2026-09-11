import { describe, expect, it } from "vitest";

import {
  createPerson,
  lifespanOf,
  type FamilyState,
  type Person,
} from "@/lib/family";
import { NODE_H, NODE_W, layoutFamilyTree } from "@/lib/tree";

function person(id: string, gender: Person["gender"], birthYear = ""): Person {
  return createPerson({ id, name: id, gender, birthYear, createdAt: 1 });
}

/** 三代：祖父母 → 父母 → 我 + 兄弟姐妹 */
function family(): FamilyState {
  const persons: Record<string, Person> = {};
  for (const [id, gender, year] of [
    ["GF", "male", "1940"],
    ["GM", "female", "1945"],
    ["F", "male", "1965"],
    ["M", "female", "1968"],
    ["ME", "male", "1990"],
    ["SIS", "female", "1993"],
    ["SON", "male", "2015"],
  ] as const) {
    persons[id] = person(id, gender, year);
  }
  return {
    version: 1,
    persons,
    parents: {
      F: { fatherId: "GF", motherId: "GM" },
      ME: { fatherId: "F", motherId: "M" },
      SIS: { fatherId: "F", motherId: "M" },
      SON: { fatherId: "ME" },
    },
    spouses: [
      { a: "GF", b: "GM" },
      { a: "F", b: "M" },
    ],
    meId: "ME",
  };
}

describe("家族树布局", () => {
  const layout = layoutFamilyTree(family());

  it("每个人都出现在布局里", () => {
    expect(layout.nodes).toHaveLength(7);
    expect(layout.byId.size).toBe(7);
  });

  it("代际越小越靠上（祖辈在最上面）", () => {
    const y = (id: string) => layout.byId.get(id)!.y;
    expect(y("GF")).toBeLessThan(y("F"));
    expect(y("F")).toBeLessThan(y("ME"));
    expect(y("ME")).toBeLessThan(y("SON"));
  });

  it("同代的人在同一行", () => {
    expect(layout.byId.get("F")!.y).toBe(layout.byId.get("M")!.y);
    expect(layout.byId.get("ME")!.y).toBe(layout.byId.get("SIS")!.y);
  });

  it("夫妻相邻：母亲的左边缘紧挨父亲的右边缘加间距", () => {
    const f = layout.byId.get("F")!;
    const m = layout.byId.get("M")!;
    expect(m.x).toBeGreaterThan(f.x);
    // 两人之间只隔单元内的那一道间距，不隔一整列
    expect(m.x - (f.x + f.width)).toBeLessThan(NODE_W);
  });

  it("同代任意两人的格子不重叠", () => {
    const rows = new Map<number, Array<{ x: number; width: number }>>();
    for (const node of layout.nodes) {
      const row = rows.get(node.y) ?? [];
      row.push({ x: node.x, width: node.width });
      rows.set(node.y, row);
    }
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i += 1) {
        expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].width);
      }
    }
  });

  it("同一行的高度一致，且等于 NODE_H", () => {
    for (const node of layout.nodes) expect(node.height).toBe(NODE_H);
    expect(layout.byId.get("F")!.height).toBe(layout.byId.get("M")!.height);
  });

  it("父母在其子女的横向区间之内（父节点居中于子节点）", () => {
    const f = layout.byId.get("F")!;
    const children = ["ME", "SIS"].map((id) => layout.byId.get(id)!);
    const left = Math.min(...children.map((c) => c.x + c.width / 2));
    const right = Math.max(...children.map((c) => c.x + c.width / 2));
    const center = f.x + f.width / 2;
    expect(center).toBeGreaterThan(left - 1);
    expect(center).toBeLessThan(right + 1);
  });

  it("画布尺寸包住所有节点", () => {
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(layout.width);
      expect(node.y + node.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it("血亲边按「家长 → 子女」方向，且不漏双亲", () => {
    const blood = layout.edges.filter((e) => e.kind === "blood");
    expect(blood.filter((e) => e.toId === "ME").map((e) => e.fromId).sort()).toEqual(["F", "M"]);
    expect(blood.filter((e) => e.toId === "F").map((e) => e.fromId).sort()).toEqual(["GF", "GM"]);
  });

  it("夫妻边存在", () => {
    const spouse = layout.edges.filter((e) => e.kind === "spouse");
    expect(spouse.length).toBe(2);
  });

  it("确定性：同样输入产出同样布局", () => {
    const again = layoutFamilyTree(family());
    expect(again.nodes.map((n) => [n.id, n.x, n.y])).toEqual(
      layout.nodes.map((n) => [n.id, n.x, n.y])
    );
  });

  it("空家族返回空布局而不是崩", () => {
    const empty: FamilyState = {
      version: 1,
      persons: {},
      parents: {},
      spouses: [],
      meId: null,
    };
    const result = layoutFamilyTree(empty);
    expect(result.nodes).toEqual([]);
    expect(result.width).toBe(0);
  });

  it("与「我」不连通的人放到最下面，不混进任何一代", () => {
    const state = family();
    state.persons.XX = person("XX", "male", "1970");
    const withOrphan = layoutFamilyTree(state);
    const maxConnectedY = Math.max(
      ...["GF", "GM", "F", "M", "ME", "SIS", "SON"].map((id) => withOrphan.byId.get(id)!.y)
    );
    expect(withOrphan.byId.get("XX")!.y).toBeGreaterThan(maxConnectedY);
  });
});

describe("享年", () => {
  it("生卒年都有时算出差值", () => {
    expect(lifespanOf(person("a", "male", "1940"))).toBeNull();
    const p = createPerson({ id: "a", birthYear: "1940", deathYear: "2010" });
    expect(lifespanOf(p)).toBe(70);
  });

  it("缺任一端就返回 null", () => {
    expect(lifespanOf(createPerson({ id: "a", birthYear: "1940" }))).toBeNull();
    expect(lifespanOf(createPerson({ id: "a", deathYear: "2010" }))).toBeNull();
    expect(lifespanOf(createPerson({ id: "a" }))).toBeNull();
  });

  it("卒年早于生年视为数据有误，返回 null 而不是负数", () => {
    expect(lifespanOf(createPerson({ id: "a", birthYear: "2010", deathYear: "1940" }))).toBeNull();
  });

  it("同年去世算 0 岁", () => {
    expect(lifespanOf(createPerson({ id: "a", birthYear: "2000", deathYear: "2000" }))).toBe(0);
  });
});
