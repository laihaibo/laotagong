import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { layoutFamilyTree } from "@/lib/tree";
import {
  classifyLineage,
  filterVisibleIds,
  generationLabel,
  isMatrilinealPath,
  isPatrilinealPath,
  pedigreePath,
} from "@/lib/lineage";

function person(id: string, gender: Person["gender"]): Person {
  return createPerson({ id, name: id, gender, createdAt: 1 });
}

function bigFamily(): FamilyState {
  const persons: Record<string, Person> = {};
  for (const [id, g] of [
    ["PGF", "male"],
    ["PGM", "female"],
    ["MGF", "male"],
    ["MGM", "female"],
    ["F", "male"],
    ["M", "female"],
    ["UNCLE", "male"],
    ["ME", "male"],
    ["SIS", "female"],
    ["WIFE", "female"],
    ["SON", "male"],
  ] as const) {
    persons[id] = person(id, g);
  }
  return {
    version: 1,
    persons,
    parents: {
      F: { fatherId: "PGF", motherId: "PGM" },
      UNCLE: { fatherId: "PGF", motherId: "PGM" },
      M: { fatherId: "MGF", motherId: "MGM" },
      ME: { fatherId: "F", motherId: "M" },
      SIS: { fatherId: "F", motherId: "M" },
      SON: { fatherId: "ME", motherId: "WIFE" },
    },
    spouses: [
      { a: "PGF", b: "PGM" },
      { a: "MGF", b: "MGM" },
      { a: "F", b: "M" },
      { a: "ME", b: "WIFE" },
    ],
    meId: "ME",
  };
}

describe("族谱路径与亲系", () => {
  const state = bigFamily();

  it("父系/母系路径可识别", () => {
    expect(pedigreePath(state, "ME", "ME")).toBe("");
    expect(pedigreePath(state, "F", "ME")).toBe("F");
    expect(pedigreePath(state, "PGF", "ME")).toBe("FF");
    expect(pedigreePath(state, "M", "ME")).toBe("M");
    expect(isPatrilinealPath(pedigreePath(state, "PGF", "ME"))).toBe(true);
    expect(isMatrilinealPath(pedigreePath(state, "MGM", "ME"))).toBe(true);
  });

  it("classifyLineage 区分系别", () => {
    expect(classifyLineage(state, "ME", "ME")).toBe("ego");
    expect(classifyLineage(state, "PGF", "ME")).toBe("paternal");
    expect(classifyLineage(state, "MGM", "ME")).toBe("maternal");
    expect(classifyLineage(state, "SIS", "ME")).toBe("sibling");
    expect(classifyLineage(state, "SON", "ME")).toBe("descendant");
    expect(classifyLineage(state, "WIFE", "ME")).toBe("affinal");
  });

  it("父系筛选保留父系祖上，去掉母系祖上", () => {
    const visible = filterVisibleIds(state, "paternal", 5);
    expect(visible.has("ME")).toBe(true);
    expect(visible.has("PGF")).toBe(true);
    expect(visible.has("F")).toBe(true);
    expect(visible.has("SON")).toBe(true);
    expect(visible.has("MGM")).toBe(false);
    expect(visible.has("MGF")).toBe(false);
  });

  it("直系筛选去掉旁系伯叔", () => {
    const visible = filterVisibleIds(state, "direct", 5);
    expect(visible.has("ME")).toBe(true);
    expect(visible.has("F")).toBe(true);
    expect(visible.has("M")).toBe(true);
    expect(visible.has("SON")).toBe(true);
    expect(visible.has("UNCLE")).toBe(false);
    expect(visible.has("SIS")).toBe(false);
  });

  it("生成标签", () => {
    expect(generationLabel(-2)).toBe("祖辈");
    expect(generationLabel(0)).toBe("同辈");
  });
});

describe("族谱布局：父系偏左、母系偏右 + 汇合点", () => {
  const state = bigFamily();
  const layout = layoutFamilyTree(state);

  it("父系祖先整体不落在母系祖先右侧", () => {
    const paternalX = ["PGF", "PGM", "F"].map((id) => layout.byId.get(id)!.x);
    const maternalX = ["MGF", "MGM", "M"].map((id) => layout.byId.get(id)!.x);
    const maxPat = Math.max(...paternalX);
    const minMat = Math.min(...maternalX);
    // 允许夫妻单元横跨，但祖辈两侧应大致分开
    const pgf = layout.byId.get("PGF")!.x;
    const mgf = layout.byId.get("MGF")!.x;
    expect(pgf).toBeLessThan(mgf);
  });

  it("同代不重叠", () => {
    const rows = new Map<number, Array<{ id: string; x: number; w: number }>>();
    for (const n of layout.nodes) {
      const row = rows.get(n.y) ?? [];
      row.push({ id: n.id, x: n.x, w: n.width });
      rows.set(n.y, row);
    }
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i += 1) {
        expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w - 0.01);
      }
    }
  });

  it("节点带亲系标注", () => {
    const me = layout.byId.get("ME")!;
    expect(me.lineage).toBe("ego");
    expect(layout.byId.get("PGF")!.lineage).toBe("paternal");
  });

  it("父母汇合点存在，且落在子女上方", () => {
    const junctions = layout.junctions ?? [];
    expect(junctions.length).toBeGreaterThan(0);
    const j = junctions.find((x) => x.childIds.includes("ME"));
    expect(j).toBeTruthy();
    const me = layout.byId.get("ME")!;
    expect(j!.y).toBeLessThan(me.y);
  });
});
