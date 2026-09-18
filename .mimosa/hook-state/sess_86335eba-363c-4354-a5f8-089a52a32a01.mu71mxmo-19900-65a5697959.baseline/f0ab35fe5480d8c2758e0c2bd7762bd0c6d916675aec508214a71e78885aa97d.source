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

describe("同代不重叠 · 夫妻单元与单人相邻", () => {
  /**
   * 这是用户实际撞到的形态：一代里既有「两个人并排的夫妻单元」，
   * 又有「单人单元」。
   *
   * 旧的列间距按**一个人**的宽度算，于是夫妻单元（两倍宽）会直接压到
   * 旁边那个单人身上。原 fixture 里每一代宽度都一致，所以照不出来。
   */
  function coupleNextToSingle(): FamilyState {
    const persons: Record<string, Person> = {};
    for (const id of ["A", "B", "C", "D", "E"]) {
      persons[id] = person(id, id === "B" || id === "D" ? "female" : "male");
    }
    return {
      version: 1,
      persons,
      parents: {
        C: { fatherId: "A", motherId: "B" },
        E: { fatherId: "A", motherId: "B" },
      },
      spouses: [
        { a: "A", b: "B" }, // 祖父母：夫妻单元
        { a: "C", b: "D" }, // 长子已婚：又一个夫妻单元，与单人 E 同代
      ],
      meId: "C",
    };
  }

  const layout = layoutFamilyTree(coupleNextToSingle());

  it("同代任意两个格子都不重叠（含跨单元）", () => {
    const rows = new Map<number, Array<{ id: string; x: number; width: number }>>();
    for (const node of layout.nodes) {
      const row = rows.get(node.y) ?? [];
      row.push({ id: node.id, x: node.x, width: node.width });
      rows.set(node.y, row);
    }
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i += 1) {
        const gap = row[i].x - (row[i - 1].x + row[i - 1].width);
        expect(gap, `${row[i - 1].id} 与 ${row[i].id} 重叠了`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("夫妻单元确实比单人宽（否则这条测试本身就是空的）", () => {
    const c = layout.byId.get("C")!;
    const d = layout.byId.get("D")!;
    const e = layout.byId.get("E")!;
    // C 与 D 是夫妻，两人并排的总宽度必然大于单人
    expect(d.x + d.width - c.x).toBeGreaterThan(e.width);
  });

  it("C 与 D 相邻，且 C 与 E 之间留出了间距", () => {
    const c = layout.byId.get("C")!;
    const d = layout.byId.get("D")!;
    const e = layout.byId.get("E")!;
    expect(d.x).toBeGreaterThan(c.x);
    expect(e.x).toBeGreaterThanOrEqual(Math.max(d.x + d.width, c.x + c.width));
  });
});

describe("任意两个格子都不得相交（含跨代）", () => {
  function rect(o: { x: number; y: number; width: number; height: number }) {
    return { l: o.x, r: o.x + o.width, t: o.y, b: o.y + o.height };
  }
  function intersects(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ) {
    const A = rect(a);
    const B = rect(b);
    return A.l < B.r && B.l < A.r && A.t < B.b && B.t < A.b;
  }
  function assertNoIntersection(state: FamilyState, label: string) {
    const layout = layoutFamilyTree(state);
    for (let i = 0; i < layout.nodes.length; i += 1) {
      for (let j = i + 1; j < layout.nodes.length; j += 1) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        expect(
          intersects(a, b),
          `${label}：${a.id}(y=${a.y}) 与 ${b.id}(y=${b.y}) 相交`
        ).toBe(false);
      }
    }
  }

  it("三代 + 夫妻 + 兄弟姐妹", () => {
    assertNoIntersection(family(), "三代");
  });

  it("夫妻单元与单人同代", () => {
    const persons: Record<string, Person> = {};
    for (const id of ["A", "B", "C", "D", "E"]) {
      persons[id] = createPerson({ id, name: id, gender: "male", createdAt: 1 });
    }
    assertNoIntersection(
      {
        version: 1,
        persons,
        parents: { C: { fatherId: "A", motherId: "B" }, E: { fatherId: "A", motherId: "B" } },
        spouses: [{ a: "A", b: "B" }, { a: "C", b: "D" }],
        meId: "C",
      },
      "夫妻+单人"
    );
  });

  it("四代 + 多个夫妻单元 + 未连通的人", () => {
    const persons: Record<string, Person> = {};
    const ids = ["G1", "G2", "P1", "P2", "P3", "P4", "M1", "M2", "M3", "K1", "K2", "XX"];
    for (const id of ids) {
      persons[id] = createPerson({ id, name: id, gender: "male", birthYear: "1950", createdAt: 1 });
    }
    assertNoIntersection(
      {
        version: 1,
        persons,
        parents: {
          P1: { fatherId: "G1", motherId: "G2" },
          P3: { fatherId: "G1", motherId: "G2" },
          M1: { fatherId: "P1", motherId: "P2" },
          M3: { fatherId: "P3", motherId: "P4" },
          K1: { fatherId: "M1", motherId: "M2" },
          K2: { fatherId: "M3" },
        },
        spouses: [
          { a: "G1", b: "G2" },
          { a: "P1", b: "P2" },
          { a: "P3", b: "P4" },
          { a: "M1", b: "M2" },
        ],
        meId: "M1",
      },
      "四代"
    );
  });

  it("同一个人既被当作配偶又被当作血亲（可能跨代）", () => {
    // 远亲结婚这类数据会让一个单元里的两人落在不同代际
    const persons: Record<string, Person> = {};
    for (const id of ["ME", "F", "M", "COUSIN", "WIFE"]) {
      persons[id] = createPerson({ id, name: id, gender: "male", createdAt: 1 });
    }
    assertNoIntersection(
      {
        version: 1,
        persons,
        parents: {
          ME: { fatherId: "F", motherId: "M" },
          COUSIN: { fatherId: "F" },
        },
        spouses: [{ a: "F", b: "M" }, { a: "ME", b: "COUSIN" }],
        meId: "ME",
      },
      "跨代配偶"
    );
  });
});
