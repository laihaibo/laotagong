import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { ancestorTerm, buildKinshipMap, kinshipTerm } from "@/lib/kinship";

function person(id: string, gender: Person["gender"], birthYear = ""): Person {
  return createPerson({ id, name: id, gender, birthYear, createdAt: 1 });
}

function fam(): FamilyState {
  const persons: Record<string, Person> = {};
  for (const [id, g, y] of [
    ["PGF", "male", "1940"],
    ["PGM", "female", "1942"],
    ["MGF", "male", "1941"],
    ["MGM", "female", "1943"],
    ["F", "male", "1965"],
    ["M", "female", "1968"],
    ["BRO", "male", "1988"],
    ["ME", "male", "1990"],
    ["SIS", "female", "1993"],
    ["WIFE", "female", "1992"],
    ["SON", "male", "2018"],
  ] as const) {
    persons[id] = person(id, g, y);
  }
  return {
    version: 1,
    persons,
    parents: {
      F: { fatherId: "PGF", motherId: "PGM" },
      M: { fatherId: "MGF", motherId: "MGM" },
      ME: { fatherId: "F", motherId: "M" },
      BRO: { fatherId: "F", motherId: "M" },
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

describe("相对「我」的称呼", () => {
  const state = fam();

  it("祖辈路径称呼", () => {
    expect(ancestorTerm("F")).toBe("父亲");
    expect(ancestorTerm("M")).toBe("母亲");
    expect(ancestorTerm("FF")).toBe("祖父");
    expect(ancestorTerm("FM")).toBe("祖母");
    expect(ancestorTerm("MF")).toBe("外祖父");
    expect(ancestorTerm("MM")).toBe("外祖母");
    expect(ancestorTerm("FFF")).toBe("曾祖父");
  });

  it("直系与姻亲", () => {
    expect(kinshipTerm(state, "ME", "ME")).toBe("我");
    expect(kinshipTerm(state, "F", "ME")).toBe("父亲");
    expect(kinshipTerm(state, "PGF", "ME")).toBe("祖父");
    expect(kinshipTerm(state, "MGM", "ME")).toBe("外祖母");
    expect(kinshipTerm(state, "WIFE", "ME")).toBe("妻子");
    expect(kinshipTerm(state, "SON", "ME")).toBe("儿子");
  });

  it("同胞按出生年分长幼", () => {
    expect(kinshipTerm(state, "BRO", "ME")).toBe("哥哥");
    expect(kinshipTerm(state, "SIS", "ME")).toBe("妹妹");
  });

  it("切换「我」后称呼重算", () => {
    const next = { ...state, meId: "SON" };
    expect(kinshipTerm(next, "ME", "SON")).toBe("父亲");
    expect(kinshipTerm(next, "WIFE", "SON")).toBe("母亲");
  });

  it("buildKinshipMap 覆盖全员", () => {
    const map = buildKinshipMap(state, "ME");
    expect(map.get("ME")).toBe("我");
    expect(map.get("F")).toBe("父亲");
    expect(map.size).toBe(Object.keys(state.persons).length);
  });
});
