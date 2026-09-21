import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { layoutFamilyTree } from "@/lib/tree";
import { classifyLineage, collateralSide } from "@/lib/lineage";

/**
 * 回归：堂/表亲曾因 classifyLineage 落成 orphan（只认「与父母共父母」一级
 * 旁系），布局排序键掉进 "9" 兜底桶，被甩到同辈行最右边——
 * 既不跟各自的父亲连片，还横跨「我」和母系区域；连线也全是灰色。
 */

function person(id: string, gender: Person["gender"], birth = ""): Person {
  return createPerson({ id, name: id, gender, birthYear: birth, createdAt: 1 });
}

/** 爷爷下有爸爸和叔叔，叔叔有儿子堂弟；我娶妻，妻有娘家（岳父+岳母） */
function branchFamily(): FamilyState {
  const persons: Record<string, Person> = {};
  for (const [id, g, y] of [
    ["GF", "male", "1940"],
    ["GM", "female", "1942"],
    ["DAD", "male", "1965"],
    ["MOM", "female", "1967"],
    ["UNCLE", "male", "1968"],
    ["AUNT_U", "female", "1970"],
    ["COUSIN", "male", "1992"],
    ["ME", "male", "1990"],
    ["WIFE", "female", "1992"],
    ["WGF", "male", "1960"],
    ["WGM", "female", "1962"],
  ] as const) {
    persons[id] = person(id, g, y);
  }
  return {
    version: 1,
    persons,
    parents: {
      DAD: { fatherId: "GF", motherId: "GM" },
      UNCLE: { fatherId: "GF", motherId: "GM" },
      COUSIN: { fatherId: "UNCLE", motherId: "AUNT_U" },
      ME: { fatherId: "DAD", motherId: "MOM" },
      WIFE: { fatherId: "WGF", motherId: "WGM" },
    },
    spouses: [
      { a: "GF", b: "GM" },
      { a: "DAD", b: "MOM" },
      { a: "UNCLE", b: "AUNT_U" },
      { a: "ME", b: "WIFE" },
      { a: "WGF", b: "WGM" },
    ],
    meId: "ME",
  };
}

describe("堂表亲的亲系分类", () => {
  it("堂弟是父系旁系，不再是 orphan", () => {
    const state = branchFamily();
    expect(classifyLineage(state, "COUSIN", "ME")).toBe("collateral");
    expect(collateralSide(state, "COUSIN", "ME")).toBe("paternal");
  });

  it("曾祖的弟弟（伯公祖）也是父系旁系血亲", () => {
    const state = branchFamily();
    state.persons.GGT = person("GGT", "male", "1918");
    state.persons.GGTT = person("GGTT", "male", "1890");
    state.persons.GGU = person("GGU", "male", "1920");
    state.parents.GF = { fatherId: "GGT" };
    state.parents.GGT = { fatherId: "GGTT" };
    state.parents.GGU = { fatherId: "GGTT" };
    expect(classifyLineage(state, "GGU", "ME")).toBe("collateral");
    expect(collateralSide(state, "GGU", "ME")).toBe("paternal");
  });

  it("姨妈的孩子是母系旁系", () => {
    const state = branchFamily();
    state.persons.MUNCLE = person("MUNCLE", "male", "1966");
    state.persons.MCOUSIN = person("MCOUSIN", "female", "1993");
    state.parents.MOM = { fatherId: "MGF", motherId: "MGM" };
    state.parents.MUNCLE = { fatherId: "MGF", motherId: "MGM" };
    state.parents.MCOUSIN = { fatherId: "MUNCLE" };
    state.persons.MGF = person("MGF", "male", "1938");
    state.persons.MGM = person("MGM", "female", "1940");
    expect(classifyLineage(state, "MCOUSIN", "ME")).toBe("collateral");
    expect(collateralSide(state, "MCOUSIN", "ME")).toBe("maternal");
  });
});

describe("堂亲排布跟各自的父亲连片", () => {
  const layout = layoutFamilyTree(branchFamily());
  const byId = layout.byId;
  const x = (id: string) => byId.get(id)!.x;

  it("叔叔一家在爸爸一家的左边（族谱长幼序）", () => {
    expect(x("UNCLE")).toBeLessThan(x("DAD"));
  });

  it("堂弟排在「我」的父系一侧，而不是被甩到妻方区域右侧", () => {
    expect(x("COUSIN")).toBeLessThan(x("ME"));
  });

  it("妻方全部在父系血亲的右边", () => {
    const maxPaternal = Math.max(x("GF"), x("DAD"), x("UNCLE"), x("COUSIN"));
    expect(x("WGF")).toBeGreaterThan(maxPaternal);
  });
});
