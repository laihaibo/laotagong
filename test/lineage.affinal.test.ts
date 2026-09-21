import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { classifyLineage, filterVisibleIds } from "@/lib/lineage";
import { kinshipTerm } from "@/lib/kinship";

/**
 * 回归：父系/母系/直系视图曾把「老婆的姐姐的子女」当成我的后代显示，
 * 且称谓兜底按混合图距离 d=1 把他们标成「子女」。
 * 根因：配偶边权重 0 的混合 BFS 距离被当作血亲后代判定。
 */

function person(id: string, gender: Person["gender"]): Person {
  return createPerson({ id, name: id, gender, createdAt: 1 });
}

function affinalFamily(): FamilyState {
  const persons: Record<string, Person> = {};
  for (const [id, g] of [
    ["ME", "male"],
    ["F", "male"],
    ["WIFE", "female"],
    ["SON", "male"],
    ["WIFE_F", "male"],
    ["WIFE_M", "female"],
    ["WIFE_SIS", "female"],
    ["SIS_H", "male"],
    ["SIS_SON", "male"],
    ["SIS_DAU", "female"],
  ] as const) {
    persons[id] = person(id, g);
  }
  return {
    version: 1,
    persons,
    parents: {
      ME: { fatherId: "F" },
      SON: { fatherId: "ME", motherId: "WIFE" },
      WIFE: { fatherId: "WIFE_F", motherId: "WIFE_M" },
      WIFE_SIS: { fatherId: "WIFE_F", motherId: "WIFE_M" },
      SIS_SON: { fatherId: "SIS_H", motherId: "WIFE_SIS" },
      SIS_DAU: { fatherId: "SIS_H", motherId: "WIFE_SIS" },
    },
    spouses: [
      { a: "ME", b: "WIFE" },
      { a: "WIFE_F", b: "WIFE_M" },
      { a: "SIS_H", b: "WIFE_SIS" },
    ],
    meId: "ME",
  };
}

describe("姻亲不冒充血亲后代", () => {
  const state = affinalFamily();

  it("父系/母系/直系视图都不出现老婆姐姐的子女", () => {
    for (const filter of ["paternal", "maternal", "direct"] as const) {
      const visible = filterVisibleIds(state, filter, 6);
      expect(visible.has("SIS_SON"), `${filter} 不应含 SIS_SON`).toBe(false);
      expect(visible.has("SIS_DAU"), `${filter} 不应含 SIS_DAU`).toBe(false);
      expect(visible.has("WIFE_SIS"), `${filter} 不应含 WIFE_SIS`).toBe(false);
    }
  });

  it("自己的血亲后代仍然保留在父系/直系视图", () => {
    const paternal = filterVisibleIds(state, "paternal", 6);
    expect(paternal.has("SON")).toBe(true);
    expect(paternal.has("WIFE")).toBe(true);
    expect(paternal.has("F")).toBe(true);
    const direct = filterVisibleIds(state, "direct", 6);
    expect(direct.has("SON")).toBe(true);
    expect(direct.has("F")).toBe(true);
  });

  it("老婆姐姐的子女不被分类成 descendant", () => {
    expect(classifyLineage(state, "SIS_SON", "ME")).not.toBe("descendant");
    expect(classifyLineage(state, "SIS_DAU", "ME")).not.toBe("descendant");
    expect(classifyLineage(state, "SON", "ME")).toBe("descendant");
  });

  it("称谓不是「子女」，而是配偶甥侄称谓", () => {
    expect(kinshipTerm(state, "SIS_SON", "ME")).not.toBe("子女");
    expect(kinshipTerm(state, "SIS_SON", "ME")).toBe("妻甥");
    expect(kinshipTerm(state, "SIS_DAU", "ME")).toBe("妻甥女");
  });
});
