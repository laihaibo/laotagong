import { describe, expect, it } from "vitest";
import { createPerson, type FamilyState, type Person } from "@/lib/family";
import { ancestorTerm, buildKinshipMap, kinshipTerm } from "@/lib/kinship";

function person(id: string, g: Person["gender"], y = ""): Person {
  return createPerson({ id, name: id, gender: g, birthYear: y, createdAt: 1 });
}

/** 三门称谓测试家庭：四代 + 双方父母的兄弟姐妹及其配偶 + 祖辈旁系 */
function fam(): FamilyState {
  const ids: Array<[string, Person["gender"], string]> = [
    ["GGF", "male", "1915"],
    ["GGM", "female", "1918"],
    ["PU1", "male", "1935"], // PGF 之兄 → 伯公
    ["PU1W", "female", "1938"],
    ["PU2", "female", "1948"], // PGF 之妹 → 姑婆
    ["PU2H", "male", "1945"],
    ["PGUMF", "male", "1916"], // PGM 之父
    ["PGUMM", "female", "1920"],
    ["PGF", "male", "1940"],
    ["PGM", "female", "1942"],
    ["PGUM", "male", "1950"], // PGM 之弟 → 舅公
    ["PGUMW", "female", "1952"],
    ["MGGMF", "male", "1913"], // MGF 之父
    ["MGGM", "female", "1916"],
    ["MGF", "male", "1941"],
    ["MGM", "female", "1943"],
    ["MU1", "female", "1946"], // MGF 之妹 → 外姑婆
    ["MU1H", "male", "1944"],
    ["PUNCLE", "male", "1958"], // 父之兄 → 伯伯
    ["PUNCLEW", "female", "1960"],
    ["QUNCLE", "male", "1970"], // 父之弟 → 叔叔
    ["QUNCLEW", "female", "1972"],
    ["FAUNT", "female", "1967"], // 父之妹 → 姑姑
    ["FAUNTH", "male", "1966"],
    ["F", "male", "1965"],
    ["M", "female", "1968"],
    ["MUNCLE", "male", "1966"], // 母之兄 → 舅舅
    ["MUNCLEW", "female", "1968"],
    ["MAUNT", "female", "1970"], // 母之妹 → 阿姨
    ["MAUNTH", "male", "1969"],
    ["PCOUSIN", "male", "1988"], // 伯伯之子 → 堂兄弟
    ["MCOUSINF", "female", "1992"], // 舅舅之女 → 表姐妹
    ["ME", "male", "1990"],
    ["SIS", "female", "1993"],
    ["WIFE", "female", "1992"],
    ["WFATHER", "male", "1960"],
    ["WMOTHER", "female", "1962"],
    ["SON", "male", "2018"],
    ["DAUGHTER", "female", "2020"],
  ];
  const persons: Record<string, Person> = {};
  for (const [id, g, y] of ids) persons[id] = person(id, g, y);
  return {
    version: 1,
    persons,
    parents: {
      PU1: { fatherId: "GGF", motherId: "GGM" },
      PU2: { fatherId: "GGF", motherId: "GGM" },
      PGF: { fatherId: "GGF", motherId: "GGM" },
      PGM: { fatherId: "PGUMF", motherId: "PGUMM" },
      PGUM: { fatherId: "PGUMF", motherId: "PGUMM" },
      MGF: { fatherId: "MGGMF", motherId: "MGGM" },
      MU1: { fatherId: "MGGMF", motherId: "MGGM" },
      M: { fatherId: "MGF", motherId: "MGM" },
      PUNCLE: { fatherId: "PGF", motherId: "PGM" },
      QUNCLE: { fatherId: "PGF", motherId: "PGM" },
      FAUNT: { fatherId: "PGF", motherId: "PGM" },
      F: { fatherId: "PGF", motherId: "PGM" },
      MUNCLE: { fatherId: "MGF", motherId: "MGM" },
      MAUNT: { fatherId: "MGF", motherId: "MGM" },
      PCOUSIN: { fatherId: "PUNCLE", motherId: "PUNCLEW" },
      MCOUSINF: { fatherId: "MUNCLE", motherId: "MUNCLEW" },
      ME: { fatherId: "F", motherId: "M" },
      SIS: { fatherId: "F", motherId: "M" },
      WIFE: { fatherId: "WFATHER", motherId: "WMOTHER" },
      SON: { fatherId: "ME", motherId: "WIFE" },
      DAUGHTER: { fatherId: "ME", motherId: "WIFE" },
    },
    spouses: [
      { a: "GGF", b: "GGM" },
      { a: "PU1", b: "PU1W" },
      { a: "PU2", b: "PU2H" },
      { a: "PGUMF", b: "PGUMM" },
      { a: "PGF", b: "PGM" },
      { a: "PGUM", b: "PGUMW" },
      { a: "MGGMF", b: "MGGM" },
      { a: "MGF", b: "MGM" },
      { a: "MU1", b: "MU1H" },
      { a: "PUNCLE", b: "PUNCLEW" },
      { a: "QUNCLE", b: "QUNCLEW" },
      { a: "FAUNT", b: "FAUNTH" },
      { a: "F", b: "M" },
      { a: "MUNCLE", b: "MUNCLEW" },
      { a: "MAUNT", b: "MAUNTH" },
      { a: "ME", b: "WIFE" },
      { a: "WFATHER", b: "WMOTHER" },
    ],
    meId: "ME",
  };
}

describe("直系尊亲属称谓（三门）", () => {
  it("父母与祖辈", () => {
    expect(ancestorTerm("F")).toBe("爸爸");
    expect(ancestorTerm("M")).toBe("妈妈");
    expect(ancestorTerm("FF")).toBe("爷爷");
    expect(ancestorTerm("FM")).toBe("奶奶");
    expect(ancestorTerm("MF")).toBe("外公");
    expect(ancestorTerm("MM")).toBe("外婆");
  });
  it("曾祖辈为太公太婆，「外」只跟母系", () => {
    expect(ancestorTerm("FFF")).toBe("太公");
    expect(ancestorTerm("FFM")).toBe("太婆");
    expect(ancestorTerm("FMF")).toBe("外太公");
    expect(ancestorTerm("MFF")).toBe("外太公");
    expect(ancestorTerm("MFM")).toBe("外太婆");
    expect(ancestorTerm("MMM")).toBe("外外太婆");
  });
  it("高祖辈为老太公老太婆，更上为 N 世祖", () => {
    expect(ancestorTerm("FFFF")).toBe("老太公");
    expect(ancestorTerm("FFFM")).toBe("老太婆");
    expect(ancestorTerm("MFFF")).toBe("外老太公");
    expect(ancestorTerm("FFFFF")).toBe("3世祖");
  });
});

describe("核心称谓（三门）", () => {
  const state = fam();

  it("直系", () => {
    expect(kinshipTerm(state, "ME", "ME")).toBe("我");
    expect(kinshipTerm(state, "F", "ME")).toBe("爸爸");
    expect(kinshipTerm(state, "M", "ME")).toBe("妈妈");
    expect(kinshipTerm(state, "PGF", "ME")).toBe("爷爷");
    expect(kinshipTerm(state, "PGM", "ME")).toBe("奶奶");
    expect(kinshipTerm(state, "MGF", "ME")).toBe("外公");
    expect(kinshipTerm(state, "MGM", "ME")).toBe("外婆");
    expect(kinshipTerm(state, "GGF", "ME")).toBe("太公");
    expect(kinshipTerm(state, "GGM", "ME")).toBe("太婆");
    expect(kinshipTerm(state, "WIFE", "ME")).toBe("妻子");
    expect(kinshipTerm(state, "SON", "ME")).toBe("儿子");
    expect(kinshipTerm(state, "DAUGHTER", "ME")).toBe("女儿");
  });

  it("父母的兄弟姐妹及配偶", () => {
    expect(kinshipTerm(state, "PUNCLE", "ME")).toBe("伯伯");
    expect(kinshipTerm(state, "PUNCLEW", "ME")).toBe("伯母");
    expect(kinshipTerm(state, "QUNCLE", "ME")).toBe("叔叔");
    expect(kinshipTerm(state, "QUNCLEW", "ME")).toBe("婶婶");
    expect(kinshipTerm(state, "FAUNT", "ME")).toBe("姑姑");
    expect(kinshipTerm(state, "FAUNTH", "ME")).toBe("姑丈");
    expect(kinshipTerm(state, "MUNCLE", "ME")).toBe("舅舅");
    expect(kinshipTerm(state, "MUNCLEW", "ME")).toBe("舅妈");
    expect(kinshipTerm(state, "MAUNT", "ME")).toBe("阿姨");
    expect(kinshipTerm(state, "MAUNTH", "ME")).toBe("姨丈");
  });

  it("祖辈旁系及配偶", () => {
    expect(kinshipTerm(state, "PU1", "ME")).toBe("伯公");
    expect(kinshipTerm(state, "PU1W", "ME")).toBe("伯婆");
    expect(kinshipTerm(state, "PU2", "ME")).toBe("姑婆");
    expect(kinshipTerm(state, "PU2H", "ME")).toBe("姑丈公");
    expect(kinshipTerm(state, "PGUM", "ME")).toBe("舅公");
    expect(kinshipTerm(state, "PGUMW", "ME")).toBe("舅婆");
    expect(kinshipTerm(state, "MU1", "ME")).toBe("外姑婆");
    expect(kinshipTerm(state, "MU1H", "ME")).toBe("外姑丈公");
  });

  it("姻亲与同辈", () => {
    expect(kinshipTerm(state, "WMOTHER", "ME")).toBe("岳母");
    expect(kinshipTerm(state, "WFATHER", "ME")).toBe("岳父");
    expect(kinshipTerm(state, "SIS", "ME")).toBe("妹妹");
    expect(kinshipTerm(state, "PCOUSIN", "ME")).toBe("堂兄弟");
    expect(kinshipTerm(state, "MCOUSINF", "ME")).toBe("表姐妹");
  });

  it("以妻子为中心", () => {
    const next = { ...state, meId: "WIFE" };
    expect(kinshipTerm(next, "M", "WIFE")).toBe("婆婆");
    expect(kinshipTerm(next, "F", "WIFE")).toBe("公公");
    expect(kinshipTerm(next, "ME", "WIFE")).toBe("丈夫");
    expect(kinshipTerm(next, "WMOTHER", "WIFE")).toBe("妈妈");
  });

  it("buildKinshipMap 覆盖全员", () => {
    const map = buildKinshipMap(state, "ME");
    expect(map.get("WMOTHER")).toBe("岳母");
    expect(map.get("FAUNTH")).toBe("姑丈");
    expect(map.size).toBe(Object.keys(state.persons).length);
  });
});
